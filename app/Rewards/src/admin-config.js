/**
 * مفتاح الأدمن — يُحقَن من process.env.VITE_ADMIN_SECRET_KEY عبر inject-firebase-config.js.
 * ضَع القيمة في .env (VITE_ADMIN_SECRET_KEY=...) ثم شغّل npm run sync:rewards
 */
(function () {
  if (typeof window === 'undefined') return;
  window.__ADMIN_SECRET_KEY__ = '';
})();
