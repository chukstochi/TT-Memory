import { getToken } from './session';
import { API_URL, PAYMENTS_ENABLED } from './payments/config';

let onUnauthorized = null;
// The app sets this so an expired or revoked login sends the person back to the Login screen.
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

async function request(method, path, { body, auth = true } = {}) {
  if (!PAYMENTS_ENABLED) {
    const e = new Error('The TT Memory server is not set up in this build yet.');
    e.status = 0;
    throw e;
  }
  const token = auth ? await getToken() : null;
  if (auth && !token) {
    const e = new Error('Please log in again.');
    e.status = 401;
    if (onUnauthorized) onUnauthorized();
    throw e;
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  let res;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
  } catch {
    const e = new Error('Could not reach the server. Check your internet and try again.');
    e.status = 0;
    throw e;
  } finally {
    clearTimeout(timer);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error(json.error || 'Something went wrong. Please try again.');
    e.status = res.status;
    if (res.status === 401 && auth && onUnauthorized) onUnauthorized();
    throw e;
  }
  return json;
}

// ---- accounts ----
export const register = ({ name, email, password }) => request('POST', '/api/auth/register', { body: { name, email, password }, auth: false });
export const login = ({ email, password }) => request('POST', '/api/auth/login', { body: { email, password }, auth: false });
export const forgotPassword = (email) => request('POST', '/api/auth/forgot', { body: { email }, auth: false });
export const resetPassword = ({ email, code, password }) => request('POST', '/api/auth/reset', { body: { email, code, password }, auth: false });
export const verifyEmail = (code) => request('POST', '/api/auth/verify', { body: { code } });
export const resendVerification = () => request('POST', '/api/auth/resend-verification');
export const fetchMe = () => request('GET', '/api/auth/me');
export const logoutRequest = () => request('POST', '/api/auth/logout');
export const changePassword = ({ current, password }) => request('POST', '/api/auth/password', { body: { current, password } });
export const deleteAccountRequest = (password) => request('POST', '/api/auth/delete', { body: { password } });

// ---- payments (always for the logged-in account) ----
export const initializePayment = ({ planId, callbackUrl }) => request('POST', '/api/payments/initialize', { body: { planId, callbackUrl } });
export const verifyPayment = (reference) => request('GET', `/api/payments/verify/${encodeURIComponent(reference)}`);
export const fetchSubscription = () => request('GET', '/api/subscription');
export const cancelSubscription = () => request('POST', '/api/subscription/cancel', { body: {} });

// ---- cloud backup ----
export const listMemories = () => request('GET', '/api/memories');
export const getUploadUrl = ({ id, type, size, ext }) => request('POST', '/api/memories/upload-url', { body: { id, type, size, ext } });
export const saveMemory = (id, body) => request('PUT', `/api/memories/${encodeURIComponent(id)}`, { body });
export const removeMemory = (id) => request('DELETE', `/api/memories/${encodeURIComponent(id)}`);