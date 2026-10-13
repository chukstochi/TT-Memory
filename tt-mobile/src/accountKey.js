// SecureStore keys may only contain letters, numbers, ".", "-" and "_".
// Each account gets its own keys so one person's PIN is never used for another.
export const keyFor = (base, email) => `${base}.${String(email || 'none').toLowerCase().replace(/[^a-z0-9._-]/g, '_')}`;