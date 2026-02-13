/**
 * نسخ الملفات الثابتة إلى dist لـ Firebase App Hosting
 * يشغّل Tailwind CLI ويُنتج CSS مُبنى بدلاً من CDN
 * يعمل على Windows و Linux
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dest = 'dist';
fs.mkdirSync(dest, { recursive: true });

// 1) Tailwind: إنتاج CSS مُبنى
try {
  execSync(
    'npx tailwindcss -i src/tailwind-src.css -o dist/tailwind.css --minify',
    { stdio: 'inherit', cwd: path.resolve(__dirname, '..') }
  );
} catch (e) {
  console.warn('Tailwind build failed:', e.message);
}

const files = [
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

// 2) index.html: استبدال سكربت CDN بـ link لـ tailwind.css
let indexHtml = fs.readFileSync('index.html', 'utf8');
const tailwindCdnScript = /<script src="https:\/\/cdn\.tailwindcss\.com"><\/script>\s*/i;
if (tailwindCdnScript.test(indexHtml)) {
  indexHtml = indexHtml.replace(
    tailwindCdnScript,
    '<link rel="stylesheet" href="/tailwind.css">\n    '
  );
}
fs.writeFileSync(path.join(dest, 'index.html'), indexHtml, 'utf8');

const srcDir = 'src';
const destSrc = path.join(dest, srcDir);
fs.mkdirSync(destSrc, { recursive: true });
fs.readdirSync(srcDir).forEach((f) => {
  fs.copyFileSync(path.join(srcDir, f), path.join(destSrc, f));
});
if (fs.existsSync(path.join(srcDir, 'firebase-config.js'))) {
  fs.copyFileSync(path.join(srcDir, 'firebase-config.js'), path.join(destSrc, 'firebase-config.js'));
}
console.log('Build done: dist/');
