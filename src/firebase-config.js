/**
 * مصدر واحد لإعداد Firebase — يُحمّل من الـ head لتهيئة مبكرة ويُستخدم من app.js
 * ⚠️ هذا المفتاح عام ومحمي بقواعد النطاق وقواعد Firebase. راجع API_KEY_SETUP_GUIDE.md
 */
(function () {
  if (typeof window === 'undefined') return;
  window.firebaseConfig = {
    apiKey: "AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk",
    authDomain: "rewards-63e43.firebaseapp.com",
    projectId: "rewards-63e43",
    storageBucket: "rewards-63e43.firebasestorage.app",
    messagingSenderId: "453256410249",
    appId: "1:453256410249:web:b7edd6afe3922c3e738258"
  };
})();
