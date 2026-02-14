/**
 * ثوابت بوابة الأدمن وإعداد Firebase للأدمن.
 * يُفضّل استخدام .env للإنتاج (VITE_ADMIN_SECRET_KEY, VITE_ADMIN_ALLOWED_EMAILS, VITE_FIREBASE_*).
 * مصدر إعداد Firebase: shared/firebase-config.json — يُحقَن عبر scripts/inject-firebase-config.js.
 * راجع SECURITY.md و .env.example.
 */
import { FIREBASE_CONFIG as FALLBACK_FIREBASE } from './firebase-config.generated';

function env(name: string, fallback: string): string {
  const v = typeof import.meta !== 'undefined' && import.meta.env && (import.meta.env as Record<string, string | undefined>)[name];
  return (typeof v === 'string' && v.trim()) ? v.trim() : fallback;
}

export const ADMIN_SECRET_KEY = env('VITE_ADMIN_SECRET_KEY', 'ayman5255');
export const ADMIN_ALLOWED_EMAILS: string[] = (() => {
  const v = env('VITE_ADMIN_ALLOWED_EMAILS', '77aayy@gmail.com');
  return v ? v.split(',').map((e) => e.trim()).filter(Boolean) : [];
})();
export const ADMIN_AUTH_SESSION_KEY = 'adora_admin_auth_session';
export const ADMIN_LAST_EMAIL_KEY = 'adora_admin_last_email';
export const ADMIN_AUTH_APP_NAME = 'adora-admin-auth';

/** مصدر الحقيقة للتحليل. القيم الافتراضية من firebase-config.generated (المولّد من shared/firebase-config.json). */
export const FIREBASE_CONFIG = {
  apiKey: env('VITE_FIREBASE_API_KEY', FALLBACK_FIREBASE.apiKey),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN', FALLBACK_FIREBASE.authDomain),
  projectId: env('VITE_FIREBASE_PROJECT_ID', FALLBACK_FIREBASE.projectId),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET', FALLBACK_FIREBASE.storageBucket),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID', FALLBACK_FIREBASE.messagingSenderId),
  appId: env('VITE_FIREBASE_APP_ID', FALLBACK_FIREBASE.appId),
};
