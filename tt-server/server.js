import http from 'node:http';
import fs from 'node:fs';
import nodePath from 'node:path';
import { pipeline } from 'node:stream/promises';
import crypto from 'node:crypto';
import { config } from './config.js';
import { createDb } from './db.js';
import { createMemories } from './memories.js';
import { createLocalStorage, createR2Storage } from './storage.js';
import { createService, ApiError } from './service.js';
import { createAuth } from './auth.js';

const MAX_BODY = 100 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new ApiError(413, 'Request too large.'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
  res.end(text);
}

// A tiny per-IP limiter so one phone cannot hammer the payment endpoints.
const hits = new Map();
function limited(ip, route, max) {
  if (!config.rateLimit) return false;
  const key = `${ip}:${route}`;
  const t = Date.now();
  const entry = hits.get(key);
  if (!entry || t - entry.start > 60000) {
    hits.set(key, { start: t, n: 1 });
    return false;
  }
  entry.n += 1;
  return entry.n > max;
}
setInterval(() => {
  const t = Date.now();
  for (const [k, v] of hits) if (t - v.start > 60000) hits.delete(k);
}, 60000).unref();

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', heic: 'image/heic', heif: 'image/heif', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', m4v: 'video/x-m4v', '3gp': 'video/3gpp', webm: 'video/webm' };

// Files kept on this server's disk (testing). Allowed only with a valid, unexpired signed link.
async function handleBlob(req, res, url, key, storage) {
  const method = req.method === 'HEAD' ? 'GET' : req.method;
  if (!['GET', 'PUT', 'DELETE'].includes(method) || !storage.verify(method, key, url.searchParams.get('exp'), url.searchParams.get('sig'))) {
    return send(res, 403, { error: 'This link is not valid or has expired.' });
  }
  const file = storage.file(key);
  if (method === 'PUT') {
    fs.mkdirSync(nodePath.dirname(file), { recursive: true });
    const tmp = `${file}.part`;
    let size = 0;
    const out = fs.createWriteStream(tmp);
    req.on('data', (c) => {
      size += c.length;
      if (size > config.maxFileBytes) req.destroy(new Error('too large'));
    });
    try {
      await pipeline(req, out);
      fs.renameSync(tmp, file);
    } catch {
      fs.rmSync(tmp, { force: true });
      return send(res, 413, { error: 'Upload failed or the file is too large.' });
    }
    return send(res, 200, { ok: true });
  }
  if (method === 'DELETE') {
    fs.rmSync(file, { force: true });
    return send(res, 200, { ok: true });
  }
  let st;
  try {
    st = fs.statSync(file);
  } catch {
    return send(res, 404, { error: 'Not found.' });
  }
  const type = MIME[key.split('.').pop()] || 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
  let start = 0;
  let end = st.size - 1;
  let status = 200;
  if (range && (range[1] || range[2])) {
    if (range[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(end, Number(range[2]));
    } else {
      start = Math.max(0, st.size - Number(range[2]));
    }
    if (start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }
    status = 206;
  }
  const head = { 'Content-Type': type, 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=3600' };
  if (status === 206) head['Content-Range'] = `bytes ${start}-${end}/${st.size}`;
  res.writeHead(status, head);
  if (req.method === 'HEAD') return res.end();
  return pipeline(fs.createReadStream(file, { start, end }), res).catch(() => {});
}

export function createServer({ db = createDb(config.dataDir), service, auth, storage: injected } = {}) {
  const svc = service || createService(db);
  const acct = auth || createAuth(db);
  db.data.meta = db.data.meta || {};
  db.data.memories = db.data.memories || {};
  if (!db.data.meta.blobSecret) {
    db.data.meta.blobSecret = crypto.randomBytes(32).toString('hex');
    db.save();
  }
  const storage =
    injected ||
    (config.r2.accountId && config.r2.accessKey && config.r2.secretKey && config.r2.bucket
      ? createR2Storage(config.r2)
      : createLocalStorage({ dir: config.dataDir, secret: db.data.meta.blobSecret }));
  const mem = createMemories(db, storage, { planOf: (e) => svc.getSubscription(e).subscription.planId });
  const baseOf = (req) => {
    const proto = (config.trustProxy && req.headers['x-forwarded-proto']) || 'http';
    return `${proto}://${req.headers.host}`;
  };
  const readJson = async (req) => JSON.parse((await readBody(req)).toString('utf8') || '{}');

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.pathname;
      const ip = (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()) || req.socket.remoteAddress || 'unknown';
      const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');

      if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true });

      // Paystack webhook: checked with an HMAC of the raw body, using your secret key.
      if (req.method === 'POST' && path === '/api/webhooks/paystack') {
        const raw = await readBody(req);
        const expected = crypto.createHmac('sha512', config.paystackSecret).update(raw).digest('hex');
        const got = String(req.headers['x-paystack-signature'] || '');
        const ok =
          config.paystackSecret &&
          got.length === expected.length &&
          crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
        if (!ok) return send(res, 401, { error: 'Bad signature.' });
        let evt;
        try {
          evt = JSON.parse(raw.toString('utf8'));
        } catch {
          return send(res, 400, { error: 'Bad JSON.' });
        }
        try {
          svc.handleEvent(evt);
        } catch (e) {
          console.error('webhook handling failed:', e);
        }
        return send(res, 200, { received: true });
      }

      // Files on this server's disk (testing only). The signed link is the permission.
      if (path.startsWith('/api/blob/') && storage.kind === 'local') {
        return await handleBlob(req, res, url, decodeURIComponent(path.slice('/api/blob/'.length)), storage);
      }

      // ---- accounts ----
      if (req.method === 'POST' && path === '/api/auth/register') {
        if (limited(ip, 'register', 10)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, await acct.register(await readJson(req)));
      }
      if (req.method === 'POST' && path === '/api/auth/login') {
        if (limited(ip, 'login', 10)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, await acct.login(await readJson(req)));
      }
      if (req.method === 'POST' && path === '/api/auth/forgot') {
        if (limited(ip, 'forgot', 5)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, await acct.forgot((await readJson(req)).email));
      }
      if (req.method === 'POST' && path === '/api/auth/reset') {
        if (limited(ip, 'reset', 10)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, await acct.reset(await readJson(req)));
      }

      // Everything below needs a logged-in session.
      const email = path.startsWith('/api/') ? acct.authenticate(bearer) : null;

      if (req.method === 'GET' && path === '/api/auth/me') return send(res, 200, acct.me(email));
      if (req.method === 'POST' && path === '/api/auth/verify') {
        if (limited(ip, 'verifycode', 10)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, acct.verify(email, (await readJson(req)).code));
      }
      if (req.method === 'POST' && path === '/api/auth/resend-verification') {
        if (limited(ip, 'resendverify', 5)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, await acct.resendVerification(email));
      }
      const needVerified = () => {
        if (!acct.isVerified(email)) throw new ApiError(403, 'Please verify your email first.');
      };
      if (req.method === 'POST' && path === '/api/auth/logout') {
        acct.logout(bearer);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && path === '/api/auth/password') {
        if (limited(ip, 'password', 10)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        const b = await readJson(req);
        return send(res, 200, await acct.changePassword(email, bearer, b.current, b.password));
      }
      if (req.method === 'POST' && path === '/api/auth/delete') {
        if (limited(ip, 'delete', 5)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        const b = await readJson(req);
        const result = await acct.deleteAccount(email, b.password, {
            blocked: (e) => {
              const v = svc.getSubscription(e).subscription;
              return v.planId !== 'free' && !v.cancelAtPeriodEnd;
            },
          });
        await mem.eraseAll(email); // every photo, video and record goes with the account
        return send(res, 200, result);
      }

      // ---- memories (cloud backup, always for the logged-in account) ----
      if (req.method === 'GET' && path === '/api/memories') return send(res, 200, mem.list(email, baseOf(req)));
      if (req.method === 'POST' && path === '/api/memories/upload-url') {
        if (limited(ip, 'upload', 120)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        needVerified();
        return send(res, 200, mem.uploadUrl(email, await readJson(req), baseOf(req)));
      }
      const mm = path.match(/^\/api\/memories\/([\w-]{1,64})$/);
      if (mm && req.method === 'PUT') needVerified();
      if (mm && req.method === 'PUT') return send(res, 200, await mem.save(email, mm[1], await readJson(req)));
      if (mm && req.method === 'DELETE') return send(res, 200, await mem.remove(email, mm[1]));

      // ---- payments (always for the logged-in account) ----
      if (req.method === 'POST' && path === '/api/payments/initialize') {
        if (limited(ip, 'init', 10)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        needVerified();
        const b = await readJson(req);
        return send(res, 200, await svc.initialize({ email, planId: b.planId, callbackUrl: b.callbackUrl }));
      }

      let m = path.match(/^\/api\/payments\/verify\/([\w-]+)$/);
      if (req.method === 'GET' && m) {
        if (limited(ip, 'verify', 60)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, await svc.verify(m[1], email));
      }

      if (req.method === 'GET' && path === '/api/subscription') {
        if (limited(ip, 'sub', 60)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, svc.getSubscription(email));
      }

      if (req.method === 'POST' && path === '/api/subscription/cancel') {
        if (limited(ip, 'cancel', 10)) throw new ApiError(429, 'Too many attempts. Please wait a minute.');
        return send(res, 200, await svc.cancel(email));
      }

      return send(res, 404, { error: 'Not found.' });
    } catch (e) {
      if (e instanceof ApiError) return send(res, e.status, { error: e.message });
      if (e instanceof SyntaxError) return send(res, 400, { error: 'Bad JSON.' });
      if (e && e.status) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Something went wrong on the server.' });
    }
  });

  return server;
}

// Start listening when run directly (node server.js), not when imported by tests.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('server.js')) {
  if (!config.paystackSecret) {
    console.warn('PAYSTACK_SECRET_KEY is not set. Payment endpoints will fail until you set it.');
  } else {
    console.log(config.paystackSecret.startsWith('sk_live') ? 'Paystack LIVE mode' : 'Paystack TEST mode');
  }
  const server = createServer();
  server.listen(config.port, () => console.log(`TT Memory payments server on port ${config.port}`));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
