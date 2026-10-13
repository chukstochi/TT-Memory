export const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.100.8:8787').replace(/\/+$/, '');
export const PAYMENTS_ENABLED = API_URL.length > 0;

export const naira = (kobo) => '₦' + String(Math.round((kobo || 0) / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');