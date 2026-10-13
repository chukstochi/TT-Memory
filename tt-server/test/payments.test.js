import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';

const SECRET = 'sk_test_secret_for_tests';
const DAY = 24 * 60 * 60 * 1000;

let mock, app, base, clock, db, svc;
const state = { initialized: [], disabled: [], tx: {}, subList: [] };

// A pretend Paystack, so the tests never touch the real one.
function startMock() {
  return new Promise((resolve) => {
    mock = http.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const json = (obj) => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(obj));
        };
        const body = raw ? JSON.parse(raw) : {};
        if (req.method === 'POST' && req.url === '/transaction/initialize') {
          state.initialized.push(body);
          return json({ status: true, message: 'ok', data: { authorization_url: `https://checkout.test/${body.reference}`, access_code: 'ac', reference: body.reference } });
        }
        const v = req.url.match(/^\/transaction\/verify\/(.+)$/);
        if (req.method === 'GET' && v) {
          return json({ status: true, message: 'ok', data: state.tx[v[1]] || { status: 'abandoned', reference: v[1] } });
        }
        if (req.method === 'POST' && req.url === '/subscription/disable') {
          state.disabled.push(body);
          return json({ status: true, message: 'Subscription disabled successfully' });
        }
        if (req.method === 'GET' && req.url.startsWith('/subscription?')) {
          return json({ status: true, message: 'ok', data: state.subList });
        }
        res.writeHead(404);
        res.end('{}');
      });
    });
    mock.listen(0, '127.0.0.1', () => resolve(mock.address().port));
  });
}

before(async () => {
  const port = await startMock();
  process.env.RATE_LIMIT = 'off';
  process.env.PAYSTACK_SECRET_KEY = SECRET;
  process.env.PAYSTACK_BASE_URL = `http://127.0.0.1:${port}`;
  process.env.PAYSTACK_PLAN_PERSONAL = 'PLN_personal';
  process.env.PAYSTACK_PLAN_FAMILY = 'PLN_family';
  process.env.PAYSTACK_PLAN_FAMILY_PLUS = 'PLN_family_plus';

  const { createDb } = await import('../db.js');
  const { createService } = await import('../service.js');
  const { createServer } = await import('../server.js');
  clock = { t: Date.now() };
  db = createDb(null);
  svc = createService(db, { now: () => clock.t });
  app = createServer({ db, service: svc });
  await new Promise((r) => app.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${app.address().port}`;
});

after(() => {
  app.close();
  mock.close();
});

async function api(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

const sessions = {};
async function login(email) {
  email = email.toLowerCase();
  if (!sessions[email]) {
    const r = await api('POST', '/api/auth/register', { name: 'Test User', email, password: 'password123' });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    sessions[email] = r.body.token;
  }
  return sessions[email];
}

const successTx = (reference, email, amount = 300000) => ({
  status: 'success',
  reference,
  amount,
  currency: 'NGN',
  paid_at: new Date(clock.t).toISOString(),
  customer: { email, customer_code: 'CUS_test' },
});

async function webhook(evt, signatureOverride) {
  const raw = JSON.stringify(evt);
  const sig = signatureOverride ?? crypto.createHmac('sha512', SECRET).update(raw).digest('hex');
  const res = await fetch(`${base}/api/webhooks/paystack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-paystack-signature': sig },
    body: raw,
  });
  return res.status;
}

async function buy(email, planId) {
  const token = await login(email);
  const init = await api('POST', '/api/payments/initialize', { planId }, token);
  assert.equal(init.status, 200, JSON.stringify(init.body));
  const amounts = { personal: 100000, family: 300000, 'family-plus': 500000 };
  state.tx[init.body.reference] = successTx(init.body.reference, email, amounts[planId]);
  const ver = await api('GET', `/api/payments/verify/${init.body.reference}`, null, token);
  return { init: init.body, ver: ver.body, token };
}

test('health check', async () => {
  const r = await api('GET', '/health');
  assert.equal(r.status, 200);
});

test('payments need a login, and an unknown plan is rejected', async () => {
  assert.equal((await api('POST', '/api/payments/initialize', { planId: 'family' })).status, 401);
  assert.equal((await api('POST', '/api/payments/initialize', { planId: 'gold' }, await login('a@b.co'))).status, 400);
});

test('initialize sends the server-side price and plan code, and only trusted callback URLs', async () => {
  const a = await api('POST', '/api/payments/initialize', { planId: 'family', callbackUrl: 'exp://192.168.1.2:8081/--/done' }, await login('Cb@Test.com'));
  assert.equal(a.status, 200);
  assert.match(a.body.authorizationUrl, /^https:\/\/checkout\.test\//);
  const sent = state.initialized.at(-1);
  assert.equal(sent.amount, 300000);
  assert.equal(sent.currency, 'NGN');
  assert.equal(sent.plan, 'PLN_family');
  assert.equal(sent.email, 'cb@test.com');
  assert.equal(sent.callback_url, 'exp://192.168.1.2:8081/--/done');

  await api('POST', '/api/payments/initialize', { planId: 'family', callbackUrl: 'https://evil.example/steal' }, await login('cb2@test.com'));
  assert.equal(state.initialized.at(-1).callback_url, undefined);
});

test('a payment is not accepted until Paystack says it succeeded', async () => {
  const init = await api('POST', '/api/payments/initialize', { planId: 'personal' }, await login('wait@test.com'));
  const first = await api('GET', `/api/payments/verify/${init.body.reference}`, null, await login('wait@test.com')); // mock: abandoned
  assert.equal(first.body.status, 'abandoned');
  assert.equal(first.body.subscription.planId, 'free');

  state.tx[init.body.reference] = successTx(init.body.reference, 'wait@test.com', 100000);
  const second = await api('GET', `/api/payments/verify/${init.body.reference}`, null, await login('wait@test.com'));
  assert.equal(second.body.status, 'success');
  assert.equal(second.body.subscription.planId, 'personal');
});

test('verify activates the plan; only the logged-in owner can see the subscription', async () => {
  const { init, ver } = await buy('ok@test.com', 'family');
  assert.equal(ver.status, 'success');
  assert.equal(ver.subscription.planId, 'family');
  assert.equal(ver.subscription.status, 'active');

  const mine = await api('GET', '/api/subscription', null, await login('ok@test.com'));
  assert.equal(mine.status, 200);
  assert.equal(mine.body.subscription.planId, 'family');
  assert.equal(mine.body.payments.length, 1);

  assert.equal((await api('GET', '/api/subscription', null, 'wrong-token')).status, 401);
  assert.equal((await api('GET', '/api/subscription')).status, 401);
});

test('an underpaid or wrong-customer transaction is rejected', async () => {
  const init = await api('POST', '/api/payments/initialize', { planId: 'family' }, await login('cheap@test.com'));
  state.tx[init.body.reference] = successTx(init.body.reference, 'cheap@test.com', 100); // far too low
  const ver = await api('GET', `/api/payments/verify/${init.body.reference}`, null, await login('cheap@test.com'));
  assert.equal(ver.body.status, 'failed');
  assert.equal(ver.body.subscription.planId, 'free');

  const init2 = await api('POST', '/api/payments/initialize', { planId: 'family' }, await login('real@test.com'));
  state.tx[init2.body.reference] = successTx(init2.body.reference, 'someone-else@test.com');
  const ver2 = await api('GET', `/api/payments/verify/${init2.body.reference}`, null, await login('real@test.com'));
  assert.equal(ver2.body.status, 'failed');
});

test('an unknown reference is a 404', async () => {
  assert.equal((await api('GET', '/api/payments/verify/ttm_doesnotexist', null, await login('nf@test.com'))).status, 404);
});

test('webhooks need a valid signature, and a repeat does not extend the plan twice', async () => {
  const { init } = await buy('hook@test.com', 'family');
  const before = (await api('GET', '/api/subscription', null, await login('hook@test.com'))).body.subscription.expiresAt;

  assert.equal(await webhook({ event: 'charge.success', data: successTx(init.reference, 'hook@test.com') }, 'f'.repeat(128)), 401);
  assert.equal(await webhook({ event: 'charge.success', data: successTx(init.reference, 'hook@test.com') }), 200);

  const after = (await api('GET', '/api/subscription', null, await login('hook@test.com'))).body.subscription.expiresAt;
  assert.equal(after, before);
});

test('a webhook can activate a payment before the app verifies it', async () => {
  const init = await api('POST', '/api/payments/initialize', { planId: 'personal' }, await login('early@test.com'));
  assert.equal(await webhook({ event: 'charge.success', data: successTx(init.body.reference, 'early@test.com', 100000) }), 200);
  const mine = await api('GET', '/api/subscription', null, await login('early@test.com'));
  assert.equal(mine.body.subscription.planId, 'personal');
});

test('cancel disables the subscription at Paystack and keeps the plan until it ends', async () => {
  const { init } = await buy('cancel@test.com', 'family');
  await webhook({ event: 'subscription.create', data: { subscription_code: 'SUB_cancel', email_token: 'TOK_cancel', customer: { email: 'cancel@test.com' }, plan: { plan_code: 'PLN_family' } } });

  const r = await api('POST', '/api/subscription/cancel', {}, await login('cancel@test.com'));
  assert.equal(r.status, 200);
  assert.deepEqual(state.disabled.at(-1), { code: 'SUB_cancel', token: 'TOK_cancel' });
  assert.equal(r.body.subscription.cancelAtPeriodEnd, true);
  assert.equal(r.body.subscription.planId, 'family'); // still paid up

  assert.equal((await api('POST', '/api/subscription/cancel', {}, 'bad')).status, 401);
});

test('cancel looks up the subscription code if the webhook has not arrived', async () => {
  const { init } = await buy('lookup@test.com', 'personal');
  state.subList = [{ status: 'active', subscription_code: 'SUB_found', email_token: 'TOK_found', plan: { plan_code: 'PLN_personal' } }];
  const r = await api('POST', '/api/subscription/cancel', {}, await login('lookup@test.com'));
  assert.equal(r.status, 200);
  assert.deepEqual(state.disabled.at(-1), { code: 'SUB_found', token: 'TOK_found' });
  state.subList = [];
});

test('cancel says to wait when the subscription code is not known yet', async () => {
  const { init } = await buy('nocode@test.com', 'personal');
  state.subList = [];
  const r = await api('POST', '/api/subscription/cancel', {}, await login('nocode@test.com'));
  assert.equal(r.status, 409);
});

test('a renewal charge extends the plan by one period', async () => {
  const { init } = await buy('renew@test.com', 'family');
  const before = (await api('GET', '/api/subscription', null, await login('renew@test.com'))).body.subscription.expiresAt;

  clock.t += 30 * DAY;
  const renewal = { ...successTx('ttm_renewal_1', 'renew@test.com'), plan: { plan_code: 'PLN_family' } };
  assert.equal(await webhook({ event: 'charge.success', data: renewal }), 200);
  assert.equal(await webhook({ event: 'charge.success', data: renewal }), 200); // repeat is ignored

  const mine = await api('GET', '/api/subscription', null, await login('renew@test.com'));
  assert.equal(mine.body.subscription.expiresAt, before + 31 * DAY);
  assert.equal(mine.body.payments.length, 2);
});

test('the plan drops to free once the paid period has ended', async () => {
  const { init } = await buy('expire@test.com', 'family');
  clock.t += 40 * DAY;
  const mine = await api('GET', '/api/subscription', null, await login('expire@test.com'));
  assert.equal(mine.body.subscription.planId, 'free');
  assert.equal(mine.body.subscription.status, 'expired');
});

test('switching plan stops the old subscription and a repeat purchase of the same plan is refused', async () => {
  const { init } = await buy('switch@test.com', 'family');
  await webhook({ event: 'subscription.create', data: { subscription_code: 'SUB_old', email_token: 'TOK_old', customer: { email: 'switch@test.com' }, plan: { plan_code: 'PLN_family' } } });

  const dup = await api('POST', '/api/payments/initialize', { planId: 'family' }, await login('switch@test.com'));
  assert.equal(dup.status, 409);

  const upgrade = await buy('switch@test.com', 'family-plus');
  assert.equal(upgrade.ver.subscription.planId, 'family-plus');
  await new Promise((r) => setTimeout(r, 50)); // the old one is disabled in the background
  assert.ok(state.disabled.some((d) => d.code === 'SUB_old' && d.token === 'TOK_old'));
  void init;
});

test('a failed renewal payment marks the plan past due but keeps it until the period ends', async () => {
  const { init } = await buy('late@test.com', 'family');
  await webhook({ event: 'subscription.create', data: { subscription_code: 'SUB_late', email_token: 'TOK_late', customer: { email: 'late@test.com' }, plan: { plan_code: 'PLN_family' } } });
  await webhook({ event: 'invoice.payment_failed', data: { customer: { email: 'late@test.com' }, subscription: { subscription_code: 'SUB_late' } } });
  const mine = await api('GET', '/api/subscription', null, await login('late@test.com'));
  assert.equal(mine.body.subscription.status, 'past_due');
  assert.equal(mine.body.subscription.planId, 'family');
});

test('another account cannot verify or see someone else\'s payment', async () => {
  const { init } = await buy('owner@test.com', 'personal');
  const other = await login('thief@test.com');
  assert.equal((await api('GET', `/api/payments/verify/${init.reference}`, null, other)).status, 404);
  const mine = await api('GET', '/api/subscription', null, other);
  assert.equal(mine.body.subscription.planId, 'free');
  assert.equal(mine.body.payments.length, 0);
});
