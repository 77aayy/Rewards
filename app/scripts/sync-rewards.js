/**
 * مزامنة نظام المكافآت إلى app/public/rewards
 * — يشغّل predeploy في Rewards ثم ينسخ public/ إلى app/public/rewards/
 * — النتيجة: منفذ واحد (5173) يقدّم التحليل على / والمكافآت على /rewards/
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

// 2) حذف الوجهة ثم نسخ كامل (تجنب ملفات قديمة)
if (fs.existsSync(appRewardsPublic)) {
  fs.rmSync(appRewardsPublic, { recursive: true });
}
fs.mkdirSync(appRewardsPublic, { recursive: true });

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

copyRecursive(rewardsPublic, appRewardsPublic);
console.log('[sync-rewards] تم: app/public/rewards/ محدّث من Rewards');
console.log('[sync-rewards] بعد تشغيل Vite استخدم الرابط الظاهر + /rewards/ للمكافآت\n');
