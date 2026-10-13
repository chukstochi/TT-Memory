import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useApp } from '../store';
import { PAYMENTS_ENABLED } from './config';
import { fetchSubscription, verifyPayment } from '../api';
import { clearPending, getPending } from './token';

const DAY = 24 * 60 * 60 * 1000;
export const FREE = { planId: 'free', status: 'none', expiresAt: null, cancelAtPeriodEnd: false };

// Checks a started checkout with the server. Returns {status, subscription?, payments?}.
// status: 'none' (nothing pending) | 'pending' | 'success' | 'failed' (and similar)
export async function settlePending(email) {
  const pend = await getPending();
  if (!pend || pend.email !== email) return { status: 'none' };
  let r;
  try {
    r = await verifyPayment(pend.reference);
  } catch (e) {
    if (e.status === 404) await clearPending();
    throw e;
  }
  if (r.status === 'success') {
    await clearPending();
    const sub = await fetchSubscription();
    return { status: 'success', subscription: sub.subscription, payments: sub.payments };
  }
  if (r.status === 'pending') {
    if (Date.now() - pend.createdAt > DAY) await clearPending();
    return { status: 'pending' };
  }
  await clearPending();
  return { status: r.status };
}

// Keeps the plan on this phone matching what the server says: on start and each time the app comes back.
export function usePaymentSync() {
  const { user, applySubscription } = useApp();
  const email = user && user.email;
  const busy = useRef(false);

  const run = useCallback(async () => {
    if (!PAYMENTS_ENABLED || !email || busy.current) return;
    busy.current = true;
    try {
      try {
        await settlePending(email);
      } catch {}
      try {
        const r = await fetchSubscription();
        applySubscription(email, r.subscription, r.payments);
      } catch {
        // a lost login is handled for the whole app; network errors keep what we have
      }
    } finally {
      busy.current = false;
    }
  }, [email, applySubscription]);

  useEffect(() => {
    run();
    const sub = AppState.addEventListener('change', (st) => st === 'active' && run());
    return () => sub.remove();
  }, [run]);
}