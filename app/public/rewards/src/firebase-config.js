/**
 * إعداد Firebase — يُحقَن من app/shared/firebase-config.json عبر scripts/inject-firebase-config.js.
 * لا تعدّل يدوياً؛ عدّل المصدر ثم شغّل السكربت. راجع SECURITY.md.
 */
(function () {
  if (typeof window === 'undefined') return;
  var defaultConfig = {
    apiKey: "AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk",
    authDomain: "rewards-63e43.firebaseapp.com",
    projectId: "rewards-63e43",
    storageBucket: "rewards-63e43.firebasestorage.app",
    messagingSenderId: "453256410249",
    appId: "1:453256410249:web:b7edd6afe3922c3e738258"
  };
  if (typeof window.__FIREBASE_CONFIG__ !== 'undefined' && window.__FIREBASE_CONFIG__ && typeof window.__FIREBASE_CONFIG__.apiKey === 'string') {
    window.firebaseConfig = window.__FIREBASE_CONFIG__;
  } else {
    window.firebaseConfig = defaultConfig;
  }
})();
