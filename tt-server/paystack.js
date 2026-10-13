import { config } from './config.js';

// Calls the Paystack API with the secret key. Returns Paystack's `data` object.
export async function paystack(method, pathname, body) {
  if (!config.paystackSecret) {
    const e = new Error('Payments are not configured on the server.');
    e.status = 503;
    throw e;
  }
  let res;
  try {
    res = await fetch(config.paystackBase + pathname, {
      method,
      headers: {
        Authorization: `Bearer ${config.paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    const e = new Error('Could not reach Paystack. Please try again.');
    e.status = 502;
    throw e;
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    const e = new Error(json.message || `Paystack error (${res.status})`);
    e.status = res.status >= 500 ? 502 : 400;
    throw e;
  }
  return json.data;
}
