
import * as SecureStore from "expo-secure-store";
 
// Address of the TT Memory API.
// - Real phone with Expo Go: your PC's local IP, e.g. http://192.168.1.20:8000
// - Android emulator: http://10.0.2.2:8000
// Best way to set it: create tt-mobile/.env containing
//   EXPO_PUBLIC_API_URL=http://192.168.1.20:8000
// then restart Expo. (Find your PC's address with `ipconfig`, the IPv4 line.)
export const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://10.0.2.2:8000";
 
const TOKEN_KEY = "tt_memory_token";
const TIMEOUT_MS = 15000;
 
// FastAPI sends `detail` as text for normal errors and as a list for validation errors.
function errorMessage(detail) {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || "Invalid value").join(". ");
  }
  return "Something went wrong. Please try again.";
}
 
export async function apiRequest(endpoint, options = {}) {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
 
  const headers = { ...(options.headers || {}) };
  // Send JSON by default, but leave file uploads (FormData) alone.
  if (!(options.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
 
  // Give up after 15 seconds instead of waiting forever on a wrong address.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
 
  let response;
  try {
    response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    throw new Error("Cannot reach the server. Check your connection and the API address.");
  } finally {
    clearTimeout(timer);
  }
 
  const data = await response.json().catch(() => ({}));
 
  if (!response.ok) {
    // The saved login has expired or is invalid, so sign the user out.
    if (response.status === 401 && token) {
      await removeToken();
    }
    throw new Error(errorMessage(data.detail));
  }
 
  return data;
}
 
export async function saveToken(token) {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}
 
export async function getToken() {
  return await SecureStore.getItemAsync(TOKEN_KEY);
}
 
export async function removeToken() {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}