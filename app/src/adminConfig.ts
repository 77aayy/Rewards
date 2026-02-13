/**
 * ثوابت بوابة الأدمن وإعداد Firebase للأدمن.
 * عند تغيير المفتاح أو الإيميلات: راجع SECURITY.md و Rewards/src/app.js (ADMIN_SECRET_KEY).
 */
export const ADMIN_SECRET_KEY = 'ayman5255';
export const ADMIN_ALLOWED_EMAILS: string[] = ['77aayy@gmail.com'];
export const ADMIN_AUTH_SESSION_KEY = 'adora_admin_auth_session';
export const ADMIN_LAST_EMAIL_KEY = 'adora_admin_last_email';
export const ADMIN_AUTH_APP_NAME = 'adora-admin-auth';

export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk',
  authDomain: 'rewards-63e43.firebaseapp.com',
  projectId: 'rewards-63e43',
  storageBucket: 'rewards-63e43.firebasestorage.app',
  messagingSenderId: '453256410249',
  appId: '1:453256410249:web:b7edd6afe3922c3e738258',
};
