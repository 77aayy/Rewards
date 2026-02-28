/**
 * مفتاح الأدمن — يُحقَن من process.env.VITE_ADMIN_SECRET_KEY عبر inject-firebase-config.js.
 * ضَع القيمة في app/.env ثم شغّل npm run sync:rewards. لا fallback — بدون .env لا وصول.
 */
(function () {
  if (typeof window === 'undefined') return;
  window.__ADMIN_SECRET_KEY__ = 'ayman5255';
})();
