/**
 * مصدر واحد لإعداد Firebase — يُحمّل من الـ head لتهيئة مبكرة ويُستخدم من app.js
 * يُفضّل حقن الإعداد من البناء: window.__FIREBASE_CONFIG__ (من .env أو build script).
 * إن لم يُحقَن يُستخدم الافتراضي أدناه. راجع API_KEY_SETUP_GUIDE.md
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
