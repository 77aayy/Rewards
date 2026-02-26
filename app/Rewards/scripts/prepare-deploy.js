/**
 * تجهيز مجلد public للرفع — تحويل CRLF إلى LF لتجنّب خطأ "content hash doesn't match" على Windows
 * يشغّل قبل: npm run deploy
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public');

// عدم حذف المجلد حتى لا يحدث EPERM عندما serve يستخدم public/ (مثلاً مع dev:watch)
// نكتفي بإنشاء المجلد إن لم يكن موجوداً ثم نسخ/استبدال الملفات
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const textExtensions = new Set(['.html', '.js', '.css', '.json', '.rules']);
const EBUSY_RETRIES = 12;
const EBUSY_DELAY_MS = 120;

function isTextFile(name) {
  const ext = path.extname(name).toLowerCase();
  return textExtensions.has(ext);
}

function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {}
}

function isEBUSY(e) {
  return e && (e.code === 'EBUSY' || e.errno === -4082);
}

function copyWithLF(srcPath, destPath) {
  let content;
  for (let i = 0; i < EBUSY_RETRIES; i++) {
    try {
      content = fs.readFileSync(srcPath, 'utf8');
      break;
    } catch (e) {
      if (isEBUSY(e) && i < EBUSY_RETRIES - 1) {
        sleepSync(EBUSY_DELAY_MS);
      } else {
        throw e;
      }
    }
  }
  if (content == null) return;
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < EBUSY_RETRIES; i++) {
    try {
      fs.writeFileSync(destPath, normalized, 'utf8');
      return;
    } catch (e) {
      if (isEBUSY(e) && i < EBUSY_RETRIES - 1) {
        sleepSync(EBUSY_DELAY_MS);
      } else if (isEBUSY(e)) {
        console.warn('[prepare-deploy] EBUSY skip (retry later):', destPath);
        return;
      } else {
        throw e;
      }
    }
  }
}

function copyBinary(srcPath, destPath) {
  for (let i = 0; i < EBUSY_RETRIES; i++) {
    try {
      fs.copyFileSync(srcPath, destPath);
      return;
    } catch (e) {
      if (isEBUSY(e) && i < EBUSY_RETRIES - 1) {
        sleepSync(EBUSY_DELAY_MS);
      } else if (isEBUSY(e)) {
        console.warn('[prepare-deploy] EBUSY skip (retry later):', destPath);
        return;
      } else {
        throw e;
      }
    }
  }
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

// نسخ ملفات shared من app/shared (أزرار الترويسة + محتوى شروط المكافآت)
const appRoot = path.resolve(root, '..');
const sharedOutDir = path.join(outDir, 'shared');
const sharedSources = [
  { name: 'headerButtonsConfig.json', dest: 'headerButtonsConfig.json' },
  { name: 'conditions-content.json', dest: 'conditions-content.json' },
  { name: 'theme.js', dest: 'theme.js' }
];
sharedSources.forEach(function (entry) {
  const src = path.join(appRoot, 'shared', entry.name);
  if (fs.existsSync(src)) {
    fs.mkdirSync(sharedOutDir, { recursive: true });
    copyWithLF(src, path.join(sharedOutDir, entry.dest));
  }
});

console.log('Deploy folder ready: public/ (LF line endings)');
