/**
 * مزامنة نظام المكافآت إلى app/public/rewards
 * — يشغّل predeploy في Rewards ثم ينسخ public/ إلى app/public/rewards/
 * — النتيجة: منفذ واحد (5180) يقدّم التحليل على / والمكافآت على /rewards/
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const rewardsRoot = path.join(appRoot, 'Rewards');
const rewardsPublic = path.join(rewardsRoot, 'public');
const appRewardsPublic = path.join(appRoot, 'public', 'rewards');

// 1) تشغيل predeploy في Rewards
console.log('[sync-rewards] تشغيل predeploy في Rewards...');
const pre = spawnSync('node', [path.join(rewardsRoot, 'scripts', 'prepare-deploy.js')], {
  cwd: rewardsRoot,
  stdio: 'inherit',
  encoding: 'utf8'
});
if (pre.status !== 0) {
  console.error('[sync-rewards] فشل predeploy');
  process.exit(1);
}

if (!fs.existsSync(rewardsPublic)) {
  console.error('[sync-rewards] مجلد Rewards/public غير موجود');
  process.exit(1);
}

// 2) تفريغ الوجهة ثم نسخ كامل (تجنب ملفات قديمة)
// على Windows: EPERM شائع عند تعارض مع Vite — نفريغ المحتوى (لا نحذف المجلد) أولاً
function emptyDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    try {
      fs.rmSync(p, { recursive: true, maxRetries: 3, retryDelay: 100 });
    } catch (err) {
      if (err.code === 'ENOENT') continue; // File already gone
      if (err.code === 'EPERM' || err.code === 'EBUSY') {
        try {
          if (fs.statSync(p).isDirectory()) emptyDir(p);
          else fs.unlinkSync(p);
        } catch {
          // تجاهل — سننسخ فوق الملفات
        }
      } else throw err;
    }
  }
}
if (fs.existsSync(appRewardsPublic)) {
  emptyDir(appRewardsPublic);
}
fs.mkdirSync(appRewardsPublic, { recursive: true });

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { }
}

function copyFileWithRetry(src, dest, retries = 5, delayMs = 120) {
  for (let i = 0; i < retries; i++) {
    try {
      if (!fs.existsSync(src)) {
        if (i < retries - 1) {
          sleep(delayMs);
          continue;
        }
        console.warn('[sync-rewards] تخطّي (غير موجود):', path.relative(rewardsPublic, src));
        return;
      }
      fs.copyFileSync(src, dest);
      return;
    } catch (err) {
      if ((err.code === 'EBUSY' || err.code === 'EPERM') && i < retries - 1) {
        sleep(delayMs);
      } else if (err.code === 'ENOENT' && i < retries - 1) {
        sleep(delayMs);
      } else if (err.code === 'ENOENT') {
        console.warn('[sync-rewards] تخطّي (اختُفى أثناء النسخ):', path.relative(rewardsPublic, src));
        return;
      } else {
        throw err;
      }
    }
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return; // تخطّي لو الملف اختفى أثناء التداخل مع Watcher
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    copyFileWithRetry(src, dest);
  }
}

copyRecursive(rewardsPublic, appRewardsPublic);
console.log('[sync-rewards] تم: app/public/rewards/ محدّث من Rewards');
console.log('[sync-rewards] بعد تشغيل Vite استخدم الرابط الظاهر + /rewards/ للمكافآت\n');
