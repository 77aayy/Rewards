/**
 * ثوابت بوابة الأدمن وإعداد Firebase للأدمن.
 * يُفضّل استخدام .env للإنتاج (VITE_ADMIN_SECRET_KEY, VITE_ADMIN_ALLOWED_EMAILS, VITE_FIREBASE_*).
 * مصدر إعداد Firebase: shared/firebase-config.json — يُحقَن عبر scripts/inject-firebase-config.js.
 * راجع SECURITY.md و .env.example.
 */
import { FIREBASE_CONFIG as FALLBACK_FIREBASE } from './firebase-config.generated';

export const ADMIN_SECRET_KEY = (import.meta.env.VITE_ADMIN_SECRET_KEY || 'ayman5255').trim();
export const ADMIN_ALLOWED_EMAILS: string[] = (() => {
  const v = (import.meta.env.VITE_ADMIN_ALLOWED_EMAILS || '').trim();
  return v ? v.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean) : [];
})();
export const ADMIN_AUTH_SESSION_KEY = 'adora_admin_auth_session';
export const ADMIN_LAST_EMAIL_KEY = 'adora_admin_last_email';
export const ADMIN_AUTH_APP_NAME = 'adora-admin-auth';

/** مصدر الحقيقة للتحليل. القيم الافتراضية من firebase-config.generated (المولّد من shared/firebase-config.json). */
export const FIREBASE_CONFIG = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY || '').trim() || FALLBACK_FIREBASE.apiKey,
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '').trim() || FALLBACK_FIREBASE.authDomain,
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID || '').trim() || FALLBACK_FIREBASE.projectId,
  storageBucket: (import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '').trim() || FALLBACK_FIREBASE.storageBucket,
  messagingSenderId: (import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '').trim() || FALLBACK_FIREBASE.messagingSenderId,
  appId: (import.meta.env.VITE_FIREBASE_APP_ID || '').trim() || FALLBACK_FIREBASE.appId,
};
