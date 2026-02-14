/**
 * حقن إعداد Firebase من مصدر واحد (shared/firebase-config.json) إلى:
 * - Rewards/src/firebase-config.js
 * - public/clear-session.html
 * - src/firebase-config.generated.ts (لـ adminConfig fallback)
 * يمكن override القيم عبر process.env.VITE_FIREBASE_* عند تشغيل السكربت.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const sharedPath = path.join(appRoot, 'shared', 'firebase-config.json');

if (!fs.existsSync(sharedPath)) {
  console.error('[inject-firebase-config] الملف غير موجود: shared/firebase-config.json');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(sharedPath, 'utf8'));
const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || raw.apiKey || '',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || raw.authDomain || '',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || raw.projectId || '',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || raw.storageBucket || '',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || raw.messagingSenderId || '',
  appId: process.env.VITE_FIREBASE_APP_ID || raw.appId || '',
};

// 1) Rewards/src/firebase-config.js
const rewardsConfigPath = path.join(appRoot, 'Rewards', 'src', 'firebase-config.js');
const rewardsContent = `/**
 * إعداد Firebase — يُحقَن من app/shared/firebase-config.json عبر scripts/inject-firebase-config.js.
 * لا تعدّل يدوياً؛ عدّل المصدر ثم شغّل السكربت. راجع SECURITY.md.
 */
(function () {
  if (typeof window === 'undefined') return;
  var defaultConfig = {
    apiKey: "${config.apiKey}",
    authDomain: "${config.authDomain}",
    projectId: "${config.projectId}",
    storageBucket: "${config.storageBucket}",
    messagingSenderId: "${config.messagingSenderId}",
    appId: "${config.appId}"
  };
  if (typeof window.__FIREBASE_CONFIG__ !== 'undefined' && window.__FIREBASE_CONFIG__ && typeof window.__FIREBASE_CONFIG__.apiKey === 'string') {
    window.firebaseConfig = window.__FIREBASE_CONFIG__;
  } else {
    window.firebaseConfig = defaultConfig;
  }
})();
`;
fs.writeFileSync(rewardsConfigPath, rewardsContent, 'utf8');
console.log('[inject-firebase-config] تم: Rewards/src/firebase-config.js');

// 2) public/clear-session.html — استبدال كائن config
const clearSessionPath = path.join(appRoot, 'public', 'clear-session.html');
let clearSessionHtml = fs.readFileSync(clearSessionPath, 'utf8');
const configBlock = `  var config = {
    apiKey: '${config.apiKey}',
    authDomain: '${config.authDomain}',
    projectId: '${config.projectId}',
    storageBucket: '${config.storageBucket}',
    messagingSenderId: '${config.messagingSenderId}',
    appId: '${config.appId}'
  };`;
clearSessionHtml = clearSessionHtml.replace(
  /  var config = \{[\s\S]*?  \};/,
  configBlock
);
fs.writeFileSync(clearSessionPath, clearSessionHtml, 'utf8');
console.log('[inject-firebase-config] تم: public/clear-session.html');

// 3) src/firebase-config.generated.ts (لـ adminConfig fallback)
const generatedPath = path.join(appRoot, 'src', 'firebase-config.generated.ts');
const generatedContent = `/** مُولَّد من scripts/inject-firebase-config.js — لا تعدّل يدوياً. المصدر: shared/firebase-config.json */
export const FIREBASE_CONFIG = {
  apiKey: "${config.apiKey}",
  authDomain: "${config.authDomain}",
  projectId: "${config.projectId}",
  storageBucket: "${config.storageBucket}",
  messagingSenderId: "${config.messagingSenderId}",
  appId: "${config.appId}",
};
`;
fs.writeFileSync(generatedPath, generatedContent, 'utf8');
console.log('[inject-firebase-config] تم: src/firebase-config.generated.ts\n');
console.log('[inject-firebase-config] انتهى. أي تغيير لاحق في shared/firebase-config.json ثم إعادة تشغيل هذا السكربت يحدّث كل المواضع.');