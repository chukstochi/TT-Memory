import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let app, base, db, dir, storageMod;

before(async () => {
  process.env.RATE_LIMIT = 'off';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_x';
  const { createDb } = await import('../db.js');
  const { createServer } = await import('../server.js');
  storageMod = await import('../storage.js');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ttm-'));
  db = createDb(null);
  app = createServer({ db, storage: storageMod.createLocalStorage({ dir, secret: 'blob-secret' }) });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}`;
});
after(() => {
  app.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function api(method, p, body, token) {
  const res = await fetch(base + p, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const reg = async (email) => (await api('POST', '/api/auth/register', { name: 'Ada', email, password: 'password123' })).body.token;
const setPlan = (email, planId) => {
  db.data.subscriptions[email] = { email, planId, status: 'active', expiresAt: Date.now() + 1e10 };
};

// Does the whole upload: ask for a link, send the bytes, save the details.
async function backup(token, id, bytes, extra = {}) {
  const up = await api('POST', '/api/memories/upload-url', { id, type: extra.type || 'photo', size: bytes.length, ext: extra.ext || 'jpg' }, token);
  if (up.status !== 200) return { step: 'upload-url', ...up };
  const put = await fetch(up.body.uploadUrl, { method: 'PUT', body: bytes });
  if (put.status !== 200) return { step: 'put', status: put.status };
  const saved = await api('PUT', `/api/memories/${id}`, { type: extra.type || 'photo', title: 'Hello', fileKey: up.body.fileKey, ...extra.meta }, token);
  return { step: 'save', fileKey: up.body.fileKey, ...saved };
}

test('Amazon\'s published example gives the same signature (so the R2 links are built right)', () => {
  const url = storageMod.presignS3({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    pathName: '/test.txt',
    region: 'us-east-1',
    accessKey: 'AKIAIOSFODNN7EXAMPLE',
    secretKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
    expires: 86400,
    now: new Date('2013-05-24T00:00:00Z'),
  });
  assert.ok(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'));
});

test('memories need a login', async () => {
  assert.equal((await api('GET', '/api/memories')).status, 401);
});

test('a photo can be backed up, listed, downloaded and deleted', async () => {
  const t = await reg('pic@test.com');
  const bytes = Buffer.from('pretend this is a jpeg');
  const r = await backup(t, 'm-1', bytes, { meta: { description: 'Day out', album: 'Trips', date: '2024-01-02', createdAt: 123 } });
  assert.equal(r.status, 200, JSON.stringify(r));
  assert.equal(r.body.size, bytes.length); // the server counts the real size

  const list = await api('GET', '/api/memories', null, t);
  assert.equal(list.body.memories.length, 1);
  assert.equal(list.body.memories[0].album, 'Trips');
  assert.equal(list.body.usedBytes, bytes.length);
  assert.equal(list.body.limitBytes, 5 * 1024 ** 3);

  const dl = await fetch(list.body.memories[0].url);
  assert.equal(dl.status, 200);
  assert.equal(Buffer.from(await dl.arrayBuffer()).toString(), 'pretend this is a jpeg');
  const part = await fetch(list.body.memories[0].url, { headers: { Range: 'bytes=0-3' } });
  assert.equal(part.status, 206);
  assert.equal(Buffer.from(await part.arrayBuffer()).toString(), 'pret');

  assert.equal((await api('DELETE', '/api/memories/m-1', null, t)).status, 200);
  assert.equal((await api('GET', '/api/memories', null, t)).body.memories.length, 0);
  assert.equal((await fetch(list.body.memories[0].url)).status, 404);
});

test('editing details does not need the file again', async () => {
  const t = await reg('edit@test.com');
  await backup(t, 'm-2', Buffer.from('abc'));
  const r = await api('PUT', '/api/memories/m-2', { type: 'photo', title: 'New title' }, t);
  assert.equal(r.status, 200);
  const list = await api('GET', '/api/memories', null, t);
  assert.equal(list.body.memories[0].title, 'New title');
  assert.equal(list.body.memories[0].size, 3);
});

test('replacing the photo removes the old file', async () => {
  const t = await reg('swap@test.com');
  const first = await backup(t, 'm-3', Buffer.from('one'));
  const second = await backup(t, 'm-3', Buffer.from('twotwo'));
  assert.equal(second.status, 200);
  assert.equal(fs.existsSync(path.join(dir, 'files', ...first.fileKey.split('/'))), false);
  assert.equal((await api('GET', '/api/memories', null, t)).body.usedBytes, 6);
});

test('the free plan cannot back up videos, a paid plan can', async () => {
  const t = await reg('vid@test.com');
  const no = await backup(t, 'v-1', Buffer.from('video'), { type: 'video', ext: 'mp4' });
  assert.equal(no.step, 'upload-url');
  assert.equal(no.status, 403);
  setPlan('vid@test.com', 'personal');
  const yes = await backup(t, 'v-1', Buffer.from('video'), { type: 'video', ext: 'mp4' });
  assert.equal(yes.status, 200, JSON.stringify(yes));
});

test('the plan\'s storage limit is enforced, by the real size of the file', async () => {
  const t = await reg('full@test.com');
  const lim = 5 * 1024 ** 3;
  // Claiming a huge size is refused up front
  const big = await api('POST', '/api/memories/upload-url', { id: 'x', type: 'photo', size: lim + 1, ext: 'jpg' }, t);
  assert.equal(big.status, 413);
  // Lying about a small size does not help: the saved file is measured
  db.data.memories['full@test.com'] = { filler: { id: 'filler', size: lim - 2, fileKey: 'u/aaaaaaaaaaaaaaaaaaaaaaaa/filler.jpg' } };
  const r = await backup(t, 'm-4', Buffer.from('12345'));
  assert.equal(r.status, 413, JSON.stringify(r));
  assert.equal(Object.keys(db.data.memories['full@test.com']).length, 1);
});

test('files must be uploaded first, and only into your own folder', async () => {
  const a = await reg('own-a@test.com');
  const b = await reg('own-b@test.com');
  assert.equal((await api('PUT', '/api/memories/z-1', { type: 'photo', fileKey: 'u/aaaaaaaaaaaaaaaaaaaaaaaa/z-1.jpg' }, a)).status, 400);
  const up = await api('POST', '/api/memories/upload-url', { id: 'z-2', type: 'photo', size: 3, ext: 'jpg' }, a);
  await fetch(up.body.uploadUrl, { method: 'PUT', body: 'abc' });
  // b tries to claim a's uploaded file
  assert.equal((await api('PUT', '/api/memories/z-2', { type: 'photo', fileKey: up.body.fileKey }, b)).status, 400);
  assert.equal((await api('PUT', '/api/memories/z-2', { type: 'photo', fileKey: up.body.fileKey }, a)).status, 200);
  // b cannot see or delete a's memory
  assert.equal((await api('GET', '/api/memories', null, b)).body.memories.length, 0);
  await api('DELETE', '/api/memories/z-2', null, b);
  assert.equal((await api('GET', '/api/memories', null, a)).body.memories.length, 1);
});

test('upload links are checked: tampered, expired, wrong method and bad keys are refused', async () => {
  const t = await reg('links@test.com');
  const up = await api('POST', '/api/memories/upload-url', { id: 'l-1', type: 'photo', size: 1, ext: 'jpg' }, t);
  const tampered = up.body.uploadUrl.replace(/sig=[a-f0-9]+/, 'sig=' + '0'.repeat(64));
  assert.equal((await fetch(tampered, { method: 'PUT', body: 'x' })).status, 403);
  assert.equal((await fetch(up.body.uploadUrl, { method: 'GET' })).status, 403); // a PUT link cannot read
  const expired = up.body.uploadUrl.replace(/exp=\d+/, 'exp=1');
  assert.equal((await fetch(expired, { method: 'PUT', body: 'x' })).status, 403);
  assert.equal((await fetch(`${base}/api/blob/..%2F..%2Fetc%2Fpasswd?exp=${Date.now() + 1e6}&sig=aa`)).status, 403);
  assert.equal((await api('POST', '/api/memories/upload-url', { id: '../x', type: 'photo', size: 1 }, t)).status, 400);
  assert.equal((await api('POST', '/api/memories/upload-url', { id: 'ok', type: 'photo', size: 1, ext: 'exe' }, t)).status, 400);
});

test('deleting the account erases every file', async () => {
  const t = await reg('gone@test.com');
  const r = await backup(t, 'g-1', Buffer.from('secret photo'));
  const file = path.join(dir, 'files', ...r.fileKey.split('/'));
  assert.equal(fs.existsSync(file), true);
  const del = await api('POST', '/api/auth/delete', { password: 'password123' }, t);
  assert.equal(del.status, 200);
  assert.equal(fs.existsSync(file), false);
  assert.equal(db.data.memories['gone@test.com'], undefined);
});
