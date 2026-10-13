import { config } from './config.js';

// Sends an email through Resend. With no RESEND_API_KEY it prints the message instead (testing).
export async function sendMail({ to, subject, text }) {
  if (!config.resendKey) {
    console.log(`\n[email not sent: RESEND_API_KEY is not set]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: config.mailFrom, to: [to], subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    // While testing, show the message so you can still read the code from this window.
    if (process.env.NODE_ENV !== 'production') console.log(`\n[email failed, showing it here instead]\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    throw new Error(`Email provider error (${res.status}): ${j.message || j.error || 'no details'}`);
  }
}