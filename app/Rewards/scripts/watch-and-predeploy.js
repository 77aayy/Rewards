/**
 * مراقبة ملفات المصدر وتشغيل predeploy تلقائياً عند أي تغيير
 * استخدم: npm run dev:watch (في طرفية منفصلة من مجلد Rewards)
 * ثم شغّل npm run dev أو serve من مكان آخر، وحدّث الصفحة بعد كل حفظ
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src');
const appRoot = path.join(root, '..');

function runPredeploy() {
  const scriptPath = path.join(root, 'scripts', 'prepare-deploy.js');
  const child = spawn(process.execPath, [scriptPath], {
    cwd: root,
    stdio: 'inherit',
    windowsHide: true
  });
  child.on('close', (code) => {
    if (code !== 0) return;
    console.log('[watch] public/ محدّث');
    // مزامنة إلى app/public/rewards إن وُجد (منفذ واحد 5173)
    const syncPath = path.join(appRoot, 'scripts', 'sync-rewards.js');
    if (fs.existsSync(syncPath)) {
      const sync = spawn(process.execPath, [syncPath], { cwd: appRoot, stdio: 'pipe', windowsHide: true });
      sync.on('close', (c) => { if (c === 0) console.log('[watch] app/public/rewards محدّث — حدّث 5173/rewards/'); });
    }
  });
}

// ملفات الجذر التي ينسخها predeploy فقط (تجنب firebase.json, playwright.config, إلخ)
const rootWatchFiles = new Set(['index.html', 'manifest.json', 'service-worker.js']);

function watch(dir, label, recursive) {
  if (!fs.existsSync(dir)) return;
  fs.watch(dir, { recursive: !!recursive }, (event, filename) => {
    if (!filename) return;
    if (filename.includes('node_modules') || filename.includes('public')) return;
    const base = path.basename(filename);
    const ext = path.extname(filename).toLowerCase();
    const inRoot = label === '.';
    if (inRoot && !rootWatchFiles.has(base) && base !== 'icon-192.png' && base !== 'icon-512.png' && base !== 'unnamed.png') return;
    if (!inRoot && !['.js', '.html', '.css', '.json'].includes(ext)) return;
    console.log('[watch] تغيير:', path.join(label, filename));
    runPredeploy();
  });
  console.log('[watch] مراقبة:', dir);
}

// تشغيل predeploy مرة أولى
runPredeploy();

// مراقبة الجذر (index.html) بدون recursive لتقليل الأحداث
watch(root, '.', false);
// مراقبة src بعمق
watch(srcDir, 'src', true);

console.log('[watch] جاري المراقبة — احفظ الملفات وحدّث المتصفح بعد كل حفظ.\nإيقاف: Ctrl+C');
