import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { config } from './config.js';
import { ApiError } from './service.js';
import { sendMail as realSendMail } from './mail.js';

const scrypt = promisify(crypto.scrypt);
const DAY = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

const normEmail = (e) => String(e || '').trim().toLowerCase();
const sha256 = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `${salt.toString('hex')}:${key.toString('hex')}`;
}
async function checkPassword(password, stored) {
  const [saltHex, keyHex] = String(stored).split(':');
  if (!saltHex || !keyHex) return false;
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  return safeEqual(key.toString('hex'), keyHex);
}
// Used when the email is unknown, so an attacker cannot tell "no such account" from "wrong password" by timing.
const DUMMY = await hashPassword('dummy-password-for-timing');

function validPassword(p) {
  if (typeof p !== 'string' || p.length < 8) throw new ApiError(400, 'Use a password of at least 8 characters.');
  if (p.length > 200) throw new ApiError(400, 'That password is too long.');
}

export function createAuth(db, { now = () => Date.now(), sendMail = realSendMail } = {}) {
  const { data } = db;
  data.verifications = data.verifications || {};
  const { users, sessions, resets, locks, verifications } = data;

  const publicUser = (u) => ({ email: u.email, name: u.name, verified: !!u.verified });

  async function sendVerification(email) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    verifications[email] = { hash: sha256(`verify:${email}:${code}`), expiresAt: now() + 15 * 60 * 1000, sentAt: now(), tries: 0 };
    db.save();
    try {
      await sendMail({
        to: email,
        subject: 'Verify your TT Memory email',
        text: `Your TT Memory verification code is ${code}. It works for 15 minutes. If you did not create an account, ignore this email.`,
      });
    } catch (e) {
      console.error('verification email failed:', e.message);
    }
  }

  function newSession(email) {
    const t = now();
    for (const [h, s] of Object.entries(sessions)) if (s.expiresAt < t) delete sessions[h]; // tidy up
    const mine = Object.entries(sessions).filter(([, s]) => s.email === email).sort((a, b) => a[1].createdAt - b[1].createdAt);
    while (mine.length >= 10) delete sessions[mine.shift()[0]]; // at most 10 devices
    const token = crypto.randomBytes(32).toString('hex');
    sessions[sha256(token)] = { email, createdAt: t, expiresAt: t + config.sessionDays * DAY };
    return token;
  }

  function dropSessions(email, exceptHash) {
    for (const [h, s] of Object.entries(sessions)) if (s.email === email && h !== exceptHash) delete sessions[h];
  }

  const api = {
    // Returns the signed-in email, or throws 401.
    authenticate(token) {
      const s = token && sessions[sha256(token)];
      if (!s || s.expiresAt < now() || !users[s.email]) throw new ApiError(401, 'Please log in again.');
      return s.email;
    },

    async register({ name, email, password }) {
      email = normEmail(email);
      name = String(name || '').trim();
      if (!name || name.length > 80) throw new ApiError(400, 'Enter your name.');
      if (!EMAIL_RE.test(email) || email.length > 254) throw new ApiError(400, 'Enter a valid email address.');
      validPassword(password);
      if (users[email]) throw new ApiError(409, 'An account with this email already exists. Log in instead.');
      users[email] = { email, name, passHash: await hashPassword(password), createdAt: now() };
      const token = newSession(email);
      db.save();
      await sendVerification(email);
      return { token, user: publicUser(users[email]) };
    },

    isVerified(email) {
      return !config.requireVerified || !!(users[email] && users[email].verified);
    },

    async resendVerification(email) {
      if (users[email].verified) return { ok: true, verified: true };
      const v = verifications[email];
      if (v && now() - v.sentAt < 60 * 1000) throw new ApiError(429, 'Please wait a minute before asking for another code.');
      await sendVerification(email);
      return { ok: true };
    },

    verify(email, code) {
      const u = users[email];
      if (u.verified) return { ok: true, user: publicUser(u) };
      const v = verifications[email];
      const bad = new ApiError(400, 'That code is wrong or has expired. Ask for a new one.');
      if (!v || v.expiresAt < now()) throw bad;
      v.tries += 1;
      if (v.tries > MAX_FAILS) {
        delete verifications[email];
        db.save();
        throw bad;
      }
      if (!safeEqual(sha256(`verify:${email}:${String(code || '').trim()}`), v.hash)) {
        db.save();
        throw bad;
      }
      u.verified = true;
      delete verifications[email];
      db.save();
      return { ok: true, user: publicUser(u) };
    },

    async login({ email, password }) {
      email = normEmail(email);
      const lock = locks[email];
      if (lock && lock.until > now()) throw new ApiError(429, 'Too many wrong attempts. Try again in 15 minutes, or reset your password.');
      const u = users[email];
      const ok = await checkPassword(String(password || ''), u ? u.passHash : DUMMY);
      if (!u || !ok) {
        const l = locks[email] || { n: 0, until: 0 };
        l.n += 1;
        if (l.n >= MAX_FAILS) {
          l.until = now() + LOCK_MS;
          l.n = 0;
        }
        locks[email] = l;
        db.save();
        throw new ApiError(401, 'Wrong email or password.');
      }
      delete locks[email];
      const token = newSession(email);
      db.save();
      return { token, user: publicUser(u) };
    },

    logout(token) {
      delete sessions[sha256(token || '')];
      db.save();
    },

    me(email) {
      return { user: publicUser(users[email]) };
    },

    async changePassword(email, token, current, next) {
      const u = users[email];
      if (!(await checkPassword(String(current || ''), u.passHash))) throw new ApiError(400, 'Your current password is not right.');
      validPassword(next);
      u.passHash = await hashPassword(next);
      dropSessions(email, sha256(token)); // log out every other device
      db.save();
      return { ok: true };
    },

    // Always looks successful, so nobody can use it to find out who has an account.
    async forgot(email) {
      email = normEmail(email);
      const u = users[email];
      if (!u) return { ok: true };
      const r = resets[email];
      if (r && now() - r.sentAt < 60 * 1000) return { ok: true };
      const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
      resets[email] = { hash: sha256(`${email}:${code}`), expiresAt: now() + 15 * 60 * 1000, sentAt: now(), tries: 0 };
      db.save();
      try {
        await sendMail({
          to: email,
          subject: 'Your TT Memory password reset code',
          text: `Your TT Memory reset code is ${code}. It works for 15 minutes. If you did not ask for this, ignore this email.`,
        });
      } catch (e) {
        console.error('reset email failed:', e.message);
      }
      return { ok: true };
    },

    async reset({ email, code, password }) {
      email = normEmail(email);
      validPassword(password);
      const r = resets[email];
      const bad = new ApiError(400, 'That code is wrong or has expired.');
      if (!r || r.expiresAt < now()) throw bad;
      r.tries += 1;
      if (r.tries > MAX_FAILS) {
        delete resets[email];
        db.save();
        throw bad;
      }
      if (!safeEqual(sha256(`${email}:${String(code || '').trim()}`), r.hash)) {
        db.save();
        throw bad;
      }
      users[email].passHash = await hashPassword(password);
      users[email].verified = true; // they just proved they own the inbox
      delete verifications[email];
      delete resets[email];
      delete locks[email];
      dropSessions(email);
      db.save();
      return { ok: true };
    },

    async deleteAccount(email, password, { blocked } = {}) {
      const u = users[email];
      if (!(await checkPassword(String(password || ''), u.passHash))) throw new ApiError(400, 'Your password is not right.');
      if (blocked && blocked(email)) throw new ApiError(409, 'Cancel your subscription first, then delete your account.');
      dropSessions(email);
      delete users[email];
      delete verifications[email];
      delete resets[email];
      delete locks[email];
      db.save();
      return { ok: true };
    },
  };
  return api;
}
