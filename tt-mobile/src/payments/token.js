import * as SecureStore from 'expo-secure-store';

const PENDING = 'tt_pay_pending';

const read = async (key) => {
  try {
    const raw = await SecureStore.getItemAsync(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// {email, reference, createdAt}: a checkout that was started but not yet confirmed.
export const getPending = () => read(PENDING);
export const savePending = (v) => SecureStore.setItemAsync(PENDING, JSON.stringify(v)).catch(() => {});
export const clearPending = () => SecureStore.deleteItemAsync(PENDING).catch(() => {});