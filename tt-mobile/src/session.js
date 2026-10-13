import * as SecureStore from 'expo-secure-store';

const KEY = 'tt_session';
let cache;

// The login token for this phone. It is kept in the phone's secure storage.
export async function getToken() {
  if (cache !== undefined) return cache;
  try {
    cache = (await SecureStore.getItemAsync(KEY)) || null;
  } catch {
    cache = null;
  }
  return cache;
}

export async function saveToken(token) {
  cache = token;
  try {
    await SecureStore.setItemAsync(KEY, token);
  } catch {}
}

export async function clearToken() {
  cache = null;
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {}
}