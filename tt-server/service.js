import crypto from 'node:crypto';
import { config, getPlans, planIdFromCode } from './config.js';
import { paystack } from './paystack.js';

const DAY = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const normEmail = (e) => String(e || '').trim().toLowerCase();

export function createService(db, { now = () => Date.now() } = {}) {
  const { data } = db;
  const subs = data.subscriptions;
  const payments = data.payments;

  // What the app is allowed to see: the plan that is really active right now.
  function view(sub) {
    if (!sub) return { planId: 'free', status: 'none', expiresAt: null, cancelAtPeriodEnd: false };
    const live = (sub.status === 'active' || sub.status === 'past_due') && sub.expiresAt > now();
    let status = 'none';
    if (live) status = sub.status;
    else if (sub.status === 'pending') status = 'pending';
    else if (sub.expiresAt) status = 'expired';
    return {
      planId: live ? sub.planId : 'free',
      status,
      expiresAt: sub.expiresAt || null,
      cancelAtPeriodEnd: !!sub.cancelAtPeriodEnd,
    };
  }

  function history(email) {
    return Object.values(payments)
      .filter((p) => p.email === email && p.status === 'success')
      .sort((a, b) => b.paidAt - a.paidAt)
      .slice(0, 20)
      .map((p) => ({ reference: p.reference, planId: p.planId, amount: p.amount, status: p.status, paidAt: p.paidAt }));
  }

  function disableLater(code, token) {
    paystack('POST', '/subscription/disable', { code, token }).catch((e) =>
      console.warn('could not disable old subscription:', e.message)
    );
  }

  // Turns a successful payment into an active subscription.
  function activate(p) {
    const prev = subs[p.email];
    let base = p.paidAt;
    if (prev && prev.planId === p.planId && prev.expiresAt > p.paidAt) base = prev.expiresAt;

    const sub = {
      ...(prev || {}),
      email: p.email,
      planId: p.planId,
      status: 'active',
      expiresAt: base + config.periodMs,
      cancelAtPeriodEnd: false,
      lastReference: p.reference,
      customerCode: p.customerCode || (prev && prev.customerCode) || null,
      updatedAt: now(),
    };
    // Changing plan: the old subscription must stop billing.
    if (prev && prev.planId !== p.planId) {
      if (prev.subscriptionCode && prev.emailToken) disableLater(prev.subscriptionCode, prev.emailToken);
      sub.subscriptionCode = null;
      sub.emailToken = null;
    }
    subs[p.email] = sub;
  }

  // Checks a Paystack transaction against what we expected, then applies it. Safe to call twice.
  function applyTransaction(tx) {
    const p = payments[tx.reference];
    if (!p) return false;
    if (p.status === 'success') return true;

    if (tx.status !== 'success') {
      if (['failed', 'abandoned', 'reversed'].includes(tx.status)) p.status = tx.status;
      db.save();
      return false;
    }
    const customerOk = normEmail(tx.customer && tx.customer.email) === p.email;
    if (tx.currency !== 'NGN' || tx.amount < p.amount || !customerOk) {
      p.status = 'failed';
      p.failure = 'amount_or_customer_mismatch';
      db.save();
      return false;
    }
    p.status = 'success';
    p.paidAt = Date.parse(tx.paid_at) || now();
    p.customerCode = (tx.customer && tx.customer.customer_code) || null;
    activate(p);
    db.save();
    return true;
  }

  return {
    view,

    async initialize({ email, planId, callbackUrl }) {
      email = normEmail(email);
      if (!EMAIL_RE.test(email)) throw new ApiError(400, 'Enter a valid email address.');
      const plan = getPlans()[planId];
      if (!plan) throw new ApiError(400, 'Unknown plan.');
      if (!plan.planCode) throw new ApiError(500, `Payments are not set up for the ${plan.name} plan yet.`);

      const current = view(subs[email]);
      if (current.planId === planId && !current.cancelAtPeriodEnd) {
        throw new ApiError(409, `You are already on the ${plan.name} plan.`);
      }

      const reference = `ttm_${crypto.randomBytes(12).toString('hex')}`;
      const body = {
        email,
        amount: plan.amountKobo,
        currency: 'NGN',
        reference,
        plan: plan.planCode,
        metadata: { planId, app: 'tt-memory' },
      };
      if (callbackUrl && config.allowedCallbackPrefixes.some((p) => String(callbackUrl).startsWith(p))) {
        body.callback_url = callbackUrl;
      }

      const init = await paystack('POST', '/transaction/initialize', body);
      payments[reference] = {
        reference,
        email,
        planId,
        amount: plan.amountKobo,
        status: 'pending',
        createdAt: now(),
      };
      db.save();
      return { reference, authorizationUrl: init.authorization_url };
    },

    async verify(reference, email) {
      const p = payments[reference];
      if (!p || (email && p.email !== normEmail(email))) throw new ApiError(404, 'Unknown payment.');
      if (p.status !== 'success') {
        const tx = await paystack('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
        applyTransaction(tx);
      }
      return { reference, status: p.status, subscription: view(subs[p.email]) };
    },

    getSubscription(email) {
      email = normEmail(email);
      return { subscription: view(subs[email]), payments: history(email) };
    },

    async cancel(email) {
      const sub = subs[normEmail(email)];
      const v = view(sub);
      if (v.planId === 'free') throw new ApiError(409, 'There is no active subscription to cancel.');
      if (sub.cancelAtPeriodEnd) return { subscription: v };

      // The subscription code normally arrives by webhook. If it has not yet, look it up.
      if (!sub.subscriptionCode || !sub.emailToken) {
        try {
          const list = await paystack('GET', '/subscription?perPage=100');
          const code = getPlans()[sub.planId].planCode;
          const mine = (c) =>
            !c || normEmail(c.email) === sub.email || (sub.customerCode && c.customer_code === sub.customerCode);
          const found = (Array.isArray(list) ? list : []).find(
            (x) => x.status === 'active' && x.plan && x.plan.plan_code === code && mine(x.customer)
          );
          if (found) {
            sub.subscriptionCode = found.subscription_code;
            sub.emailToken = found.email_token;
          }
        } catch (e) {
          console.warn('subscription lookup failed:', e.message);
        }
      }
      if (!sub.subscriptionCode || !sub.emailToken) {
        throw new ApiError(409, 'Your subscription is still being set up. Please try again in a minute.');
      }
      await paystack('POST', '/subscription/disable', { code: sub.subscriptionCode, token: sub.emailToken });
      sub.cancelAtPeriodEnd = true; // keeps the plan until the paid period ends
      sub.updatedAt = now();
      db.save();
      return { subscription: view(sub) };
    },

    // Called only after the webhook signature has been checked.
    handleEvent(evt) {
      const d = (evt && evt.data) || {};
      const email = normEmail(d.customer && d.customer.email);

      switch (evt && evt.event) {
        case 'charge.success': {
          if (payments[d.reference]) {
            applyTransaction(d); // the first payment, if the app has not verified it yet
            return;
          }
          // A renewal charge made by the subscription
          const sub = subs[email];
          const planId = planIdFromCode(d.plan && d.plan.plan_code) || (sub && sub.planId);
          if (!sub || !planId || planId !== sub.planId || !d.reference) return;
          if (d.status !== 'success' || d.currency !== 'NGN') return;
          if (d.amount < getPlans()[planId].amountKobo) return;
          const paidAt = Date.parse(d.paid_at) || now();
          payments[d.reference] = {
            reference: d.reference,
            email,
            planId,
            amount: d.amount,
            status: 'success',
            paidAt,
            renewal: true,
          };
          const base = sub.expiresAt > paidAt ? sub.expiresAt : paidAt;
          sub.expiresAt = base + config.periodMs;
          sub.status = 'active';
          sub.cancelAtPeriodEnd = false;
          sub.updatedAt = now();
          db.save();
          return;
        }
        case 'subscription.create': {
          const planId = planIdFromCode(d.plan && d.plan.plan_code);
          if (!email || !planId) return;
          const sub = subs[email] || { email, planId, status: 'pending' };
          if (sub.planId && sub.planId !== planId) return; // a stale event for an old plan
          sub.subscriptionCode = d.subscription_code;
          sub.emailToken = d.email_token;
          sub.updatedAt = now();
          subs[email] = sub;
          db.save();
          return;
        }
        case 'subscription.disable':
        case 'subscription.not_renew': {
          const sub = Object.values(subs).find((s) => s.subscriptionCode && s.subscriptionCode === d.subscription_code);
          if (!sub) return;
          sub.cancelAtPeriodEnd = true;
          sub.updatedAt = now();
          db.save();
          return;
        }
        case 'invoice.payment_failed': {
          const code = d.subscription && d.subscription.subscription_code;
          const sub = Object.values(subs).find((s) => (code && s.subscriptionCode === code) || s.email === email);
          if (!sub || sub.status !== 'active') return;
          sub.status = 'past_due';
          sub.updatedAt = now();
          db.save();
          return;
        }
        default:
      }
    },
  };
}
