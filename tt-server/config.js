import path from 'node:path';

const env = process.env;

export const config = {
  port: Number(env.PORT || 8787),
  paystackSecret: env.PAYSTACK_SECRET_KEY || '',
  paystackBase: env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
  dataDir: env.DATA_DIR || path.resolve('data'),
  // The app passes a callback URL so Paystack can send the user back to it after paying.
  // Only URLs starting with one of these are accepted.
  allowedCallbackPrefixes: (env.ALLOWED_CALLBACK_PREFIXES || 'exp://,ttmemory://')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  // Billing period. PERIOD_MINUTES is for testing only (e.g. 3 = plan ends 3 minutes after paying).
  periodMs: env.PERIOD_MINUTES ? Number(env.PERIOD_MINUTES) * 60 * 1000 : 31 * 24 * 60 * 60 * 1000,
  trustProxy: env.TRUST_PROXY === '1',
  sessionDays: 60,
  // Password-reset emails are sent with Resend (https://resend.com). Without a key the code is
  // printed in the server window, which is fine for testing on your own PC.
  resendKey: env.RESEND_API_KEY || '',
  mailFrom: env.MAIL_FROM || 'TT Memory <onboarding@resend.dev>',
  rateLimit: env.RATE_LIMIT !== 'off',
  requireVerified: env.REQUIRE_EMAIL_VERIFICATION !== 'off',
  // Where photos and videos are stored. With R2_* set they go to Cloudflare R2 (the phone uploads straight
  // to R2 through short-lived links). Without them they are kept on this server's disk (fine for testing).
  r2: {
    accountId: env.R2_ACCOUNT_ID || '',
    accessKey: env.R2_ACCESS_KEY_ID || '',
    secretKey: env.R2_SECRET_ACCESS_KEY || '',
    bucket: env.R2_BUCKET || '',
  },
  maxFileBytes: Number(env.MAX_FILE_MB || 1024) * 1024 * 1024,
};

// What each plan is allowed to store. Must match the app's plans.
export const PLAN_LIMITS = {
  free: { bytes: 5 * 1024 ** 3, videos: false },
  personal: { bytes: 100 * 1024 ** 3, videos: true },
  family: { bytes: 500 * 1024 ** 3, videos: true },
  'family-plus': { bytes: 1024 * 1024 ** 3, videos: true },
};

// Prices live here, on the server, so the app can never choose what it pays.
// Amounts are in kobo (1 naira = 100 kobo). Plan codes come from your Paystack dashboard.
export function getPlans() {
  return {
    personal: { name: 'Personal', amountKobo: 100000, planCode: env.PAYSTACK_PLAN_PERSONAL || '' },
    family: { name: 'Family', amountKobo: 300000, planCode: env.PAYSTACK_PLAN_FAMILY || '' },
    'family-plus': { name: 'Family Plus', amountKobo: 500000, planCode: env.PAYSTACK_PLAN_FAMILY_PLUS || '' },
  };
}

export function planIdFromCode(code) {
  if (!code) return null;
  const plans = getPlans();
  return Object.keys(plans).find((id) => plans[id].planCode && plans[id].planCode === code) || null;
}
