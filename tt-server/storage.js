import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();
const sha256hex = (data) => crypto.createHash('sha256').update(data).digest('hex');
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// AWS Signature V4 "presigned URL". Anyone holding the link can do that one thing (GET, PUT, ...) until it expires.
// Cloudflare R2 uses the same scheme as Amazon S3. Checked in the tests against Amazon's published example.
export function presignS3({ method, host, pathName, region, accessKey, secretKey, expires, now = new Date(), service = 's3' }) {
  const amz = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = amz.slice(0, 8);
  const scope = `${date}/${region}/${service}/aws4_request`;
  const q = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKey}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  };
  const query = Object.keys(q)
    .sort()
    .map((k) => `${enc(k)}=${enc(q[k])}`)
    .join('&');
  const canonPath = pathName.split('/').map(enc).join('/');
  const canonical = [method, canonPath, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amz, scope, sha256hex(canonical)].join('\n');
  const kDate = hmac('AWS4' + secretKey, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(toSign).digest('hex');
  return `https://${host}${canonPath}?${query}&X-Amz-Signature=${signature}`;
}

const KEY_RE = /^u\/[a-f0-9]{24}\/[\w-]{1,64}\.[a-z0-9]{2,5}$/;
export const validKey = (k) => KEY_RE.test(String(k));

// Cloudflare R2: the phone uploads and downloads directly with these links.
export function createR2Storage({ accountId, accessKey, secretKey, bucket }) {
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const url = (method, key, expires) =>
    presignS3({ method, host, pathName: `/${bucket}/${key}`, region: 'auto', accessKey, secretKey, expires });
  return {
    kind: 'r2',
    presign: (method, key, { expires = 900 } = {}) => url(method, key, expires),
    async size(key) {
      const res = await fetch(url('HEAD', key, 60), { method: 'HEAD', signal: AbortSignal.timeout(15000) });
      return res.ok ? Number(res.headers.get('content-length')) : null;
    },
    async remove(key) {
      const res = await fetch(url('DELETE', key, 60), { method: 'DELETE', signal: AbortSignal.timeout(15000) });
      if (!res.ok && res.status !== 404) throw new Error(`Could not delete file (${res.status})`);
    },
  };
}

// Files on this server's own disk, behind signed links. For testing on your PC.
export function createLocalStorage({ dir, secret }) {
  const root = path.join(dir, 'files');
  const file = (key) => path.join(root, ...key.split('/'));
  const sign = (method, key, exp) => crypto.createHmac('sha256', secret).update(`${method}\n${key}\n${exp}`).digest('hex');
  return {
    kind: 'local',
    root,
    file,
    presign(method, key, { expires = 900, base }) {
      const exp = Date.now() + expires * 1000;
      return `${base}/api/blob/${key}?exp=${exp}&sig=${sign(method, key, exp)}`;
    },
    verify(method, key, exp, sig) {
      if (!validKey(key) || !(Number(exp) > Date.now())) return false;
      const want = Buffer.from(sign(method, key, Number(exp)));
      const got = Buffer.from(String(sig || ''));
      return want.length === got.length && crypto.timingSafeEqual(want, got);
    },
    async size(key) {
      try {
        return fs.statSync(file(key)).size;
      } catch {
        return null;
      }
    },
    async remove(key) {
      try {
        fs.unlinkSync(file(key));
      } catch {}
    },
  };
}
