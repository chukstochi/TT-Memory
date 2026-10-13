import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

let app, base, clock, db, mails;

before(async () => {
  process.env.RATE_LIMIT = 'off';
  process.env.PAYSTACK_SECRET_KEY = 'sk_test_x';
  const { createDb } = await import('../db.js');
  const { createService } = await import('../service.js');
  const { createAuth } = await import('../auth.js');
  const { createServer } = await import('../server.js');
  clock = { t: Date.now() };
  mails = [];
  db = createDb(null);
  const service = createService(db, { now: () => clock.t });
  const auth = createAuth(db, { now: () => clock.t, sendMail: async (m) => mails.push(m) });
  app = createServer({ db, service, auth });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}`;
});
after(() => app.close());

async function api(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}
const reg = (email, password = 'password123', name = 'Ada') => api('POST', '/api/auth/register', { name, email, password });
const codeFrom = (mail) => mail.text.match(/\b(\d{6})\b/)[1];

test('register checks the details and refuses a duplicate email', async () => {
  assert.equal((await reg('bad-email')).status, 400);
  assert.equal((await reg('short@test.com', 'abc')).status, 400);
  assert.equal((await api('POST', '/api/auth/register', { name: '', email: 'x@test.com', password: 'password123' })).status, 400);
  const ok = await reg('Ada@Test.com');
  assert.equal(ok.status, 200);
  assert.equal(ok.body.user.email, 'ada@test.com');
  assert.ok(ok.body.token.length >= 32);
  assert.equal((await reg('ada@test.com')).status, 409);
});

test('passwords are never stored in plain text', async () => {
  await reg('plain@test.com', 'my-secret-pass-1');
  assert.ok(!JSON.stringify(db.data).includes('my-secret-pass-1'));
});

test('login works with the right password and gives the same error for a wrong one or an unknown email', async () => {
  await reg('login@test.com');
  const ok = await api('POST', '/api/auth/login', { email: 'LOGIN@test.com', password: 'password123' });
  assert.equal(ok.status, 200);
  const me = await api('GET', '/api/auth/me', null, ok.body.token);
  assert.equal(me.body.user.email, 'login@test.com');

  const wrong = await api('POST', '/api/auth/login', { email: 'login@test.com', password: 'nope-nope' });
  const unknown = await api('POST', '/api/auth/login', { email: 'ghost@test.com', password: 'nope-nope' });
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(wrong.body.error, unknown.body.error);
});

test('logout ends the session, and bad tokens are refused', async () => {
  const { body } = await reg('out@test.com');
  assert.equal((await api('GET', '/api/auth/me', null, body.token)).status, 200);
  assert.equal((await api('POST', '/api/auth/logout', {}, body.token)).status, 200);
  assert.equal((await api('GET', '/api/auth/me', null, body.token)).status, 401);
  assert.equal((await api('GET', '/api/auth/me', null, 'garbage')).status, 401);
  assert.equal((await api('GET', '/api/auth/me')).status, 401);
});

test('five wrong passwords lock the account for 15 minutes, even for the right password', async () => {
  await reg('lock@test.com');
  for (let i = 0; i < 5; i++) assert.equal((await api('POST', '/api/auth/login', { email: 'lock@test.com', password: 'wrong-wrong' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'lock@test.com', password: 'password123' })).status, 429);
  clock.t += 16 * 60 * 1000;
  assert.equal((await api('POST', '/api/auth/login', { email: 'lock@test.com', password: 'password123' })).status, 200);
});

test('a sessions expires after the session period', async () => {
  const { body } = await reg('expiry@test.com');
  clock.t += 61 * 24 * 60 * 60 * 1000;
  assert.equal((await api('GET', '/api/auth/me', null, body.token)).status, 401);
});

test('password reset: code by email, one use, kills old sessions and the old password', async () => {
  const { body } = await reg('reset@test.com');
  const before = mails.length;
  assert.equal((await api('POST', '/api/auth/forgot', { email: 'nobody@test.com' })).status, 200);
  assert.equal(mails.length, before); // no email for unknown accounts, but the same reply

  assert.equal((await api('POST', '/api/auth/forgot', { email: 'reset@test.com' })).status, 200);
  assert.equal(mails.length, before + 1);
  const code = codeFrom(mails.at(-1));

  const wrongCode = await api('POST', '/api/auth/reset', { email: 'reset@test.com', code: code === '000000' ? '111111' : '000000', password: 'brand-new-pass' });
  assert.equal(wrongCode.status, 400);
  const short = await api('POST', '/api/auth/reset', { email: 'reset@test.com', code, password: 'abc' });
  assert.equal(short.status, 400);

  assert.equal((await api('POST', '/api/auth/reset', { email: 'reset@test.com', code, password: 'brand-new-pass' })).status, 200);
  assert.equal((await api('POST', '/api/auth/reset', { email: 'reset@test.com', code, password: 'another-pass-1' })).status, 400); // used up
  assert.equal((await api('GET', '/api/auth/me', null, body.token)).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'reset@test.com', password: 'password123' })).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'reset@test.com', password: 'brand-new-pass' })).status, 200);
});

test('a reset code cannot be guessed: too many wrong tries burn it', async () => {
  await reg('guess@test.com');
  await api('POST', '/api/auth/forgot', { email: 'guess@test.com' });
  const code = codeFrom(mails.at(-1));
  const wrong = code === '123456' ? '654321' : '123456';
  for (let i = 0; i < 5; i++) await api('POST', '/api/auth/reset', { email: 'guess@test.com', code: wrong, password: 'whatever-123' });
  assert.equal((await api('POST', '/api/auth/reset', { email: 'guess@test.com', code, password: 'whatever-123' })).status, 400);
});

test('a reset code expires after 15 minutes', async () => {
  await reg('late@test.com');
  await api('POST', '/api/auth/forgot', { email: 'late@test.com' });
  const code = codeFrom(mails.at(-1));
  clock.t += 16 * 60 * 1000;
  assert.equal((await api('POST', '/api/auth/reset', { email: 'late@test.com', code, password: 'whatever-123' })).status, 400);
});

test('changing the password needs the current one and logs out other devices', async () => {
  const a = await reg('change@test.com');
  const b = await api('POST', '/api/auth/login', { email: 'change@test.com', password: 'password123' });
  assert.equal((await api('POST', '/api/auth/password', { current: 'wrong-wrong', password: 'new-password-1' }, a.body.token)).status, 400);
  assert.equal((await api('POST', '/api/auth/password', { current: 'password123', password: 'short' }, a.body.token)).status, 400);
  assert.equal((await api('POST', '/api/auth/password', { current: 'password123', password: 'new-password-1' }, a.body.token)).status, 200);
  assert.equal((await api('GET', '/api/auth/me', null, a.body.token)).status, 200); // this device stays in
  assert.equal((await api('GET', '/api/auth/me', null, b.body.token)).status, 401); // the other is out
});

test('deleting an account needs the password, and is blocked while a subscription is running', async () => {
  const { body } = await reg('del@test.com');
  assert.equal((await api('POST', '/api/auth/delete', { password: 'wrong-wrong' }, body.token)).status, 400);

  db.data.subscriptions['del@test.com'] = { email: 'del@test.com', planId: 'family', status: 'active', expiresAt: clock.t + 1e9, cancelAtPeriodEnd: false };
  assert.equal((await api('POST', '/api/auth/delete', { password: 'password123' }, body.token)).status, 409);

  db.data.subscriptions['del@test.com'].cancelAtPeriodEnd = true;
  assert.equal((await api('POST', '/api/auth/delete', { password: 'password123' }, body.token)).status, 200);
  assert.equal((await api('GET', '/api/auth/me', null, body.token)).status, 401);
  assert.equal((await api('POST', '/api/auth/login', { email: 'del@test.com', password: 'password123' })).status, 401);
});

test('two accounts cannot see each other\'s subscription', async () => {
  const a = await reg('own-a@test.com');
  const b = await reg('own-b@test.com');
  db.data.subscriptions['own-a@test.com'] = { email: 'own-a@test.com', planId: 'family', status: 'active', expiresAt: clock.t + 1e9 };
  assert.equal((await api('GET', '/api/subscription', null, a.body.token)).body.subscription.planId, 'family');
  assert.equal((await api('GET', '/api/subscription', null, b.body.token)).body.subscription.planId, 'free');
});
