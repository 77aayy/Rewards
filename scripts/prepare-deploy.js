/**
 * تجهيز مجلد public للرفع — تحويل CRLF إلى LF لتجنّب خطأ "content hash doesn't match" على Windows
 * يشغّل قبل: npm run deploy
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public');

if (fs.existsSync(outDir)) {
  try {
    fs.rmSync(outDir, { recursive: true });
  } catch (e) {
    console.warn('Could not clean public:', e.message);
  }
}
fs.mkdirSync(outDir, { recursive: true });

const textExtensions = new Set(['.html', '.js', '.css', '.json', '.rules']);
function isTextFile(name) {
  const ext = path.extname(name).toLowerCase();
  return textExtensions.has(ext);
}

function copyWithLF(srcPath, destPath) {
  const content = fs.readFileSync(srcPath, 'utf8');
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  fs.writeFileSync(destPath, normalized, 'utf8');
}

function copyBinary(srcPath, destPath) {
  fs.copyFileSync(srcPath, destPath);
}

// ملفات الجذر
const rootFiles = [
  'index.html',
  'manifest.json',
  'service-worker.js',
  'icon-192.png',
  'icon-512.png',
  'unnamed.png'
];

rootFiles.forEach((f) => {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) return;
  const dest = path.join(outDir, f);
  if (isTextFile(f)) copyWithLF(src, dest);
  else copyBinary(src, dest);
});

// مجلد src
const srcDir = path.join(root, 'src');
const outSrc = path.join(outDir, 'src');
if (fs.existsSync(srcDir)) {
  fs.mkdirSync(outSrc, { recursive: true });
  fs.readdirSync(srcDir).forEach((f) => {
    const src = path.join(srcDir, f);
    const dest = path.join(outSrc, f);
    if (fs.statSync(src).isDirectory()) return;
    if (isTextFile(f)) copyWithLF(src, dest);
    else copyBinary(src, dest);
  });
}

console.log('Deploy folder ready: public/ (LF line endings)');
