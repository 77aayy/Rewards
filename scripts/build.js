/**
 * نسخ الملفات الثابتة إلى dist لـ Firebase App Hosting
 * يعمل على Windows و Linux
 */
const fs = require('fs');
const path = require('path');

const dest = 'dist';
fs.mkdirSync(dest, { recursive: true });

const files = [
  'index.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png',
  'unnamed.png',
  'service-worker.js'
];

files.forEach((f) => {
  try {
    fs.copyFileSync(f, path.join(dest, f));
  } catch (e) {
    console.warn('Skip', f, e.message);
  }
});

const srcDir = 'src';
const destSrc = path.join(dest, srcDir);
fs.mkdirSync(destSrc, { recursive: true });
fs.readdirSync(srcDir).forEach((f) => {
  fs.copyFileSync(path.join(srcDir, f), path.join(destSrc, f));
});

console.log('Build done: dist/');
