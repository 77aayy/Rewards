/**
 * تجهيز الرفع الكامل: صفحة الدخول (React) على / + المكافآت على /rewards/
 * — يبني تطبيق React من المجلد الأب (app)، يجهّز public المكافآت، ثم يدمج:
 *   الجذر (/) = تطبيق الدخول والتحليل
 *   /rewards/ = تطبيق المكافآت
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rewardsRoot = path.resolve(__dirname, '..');
const appRoot = path.resolve(rewardsRoot, '..');
const reactDist = path.join(appRoot, 'dist');
const publicDir = path.join(rewardsRoot, 'public');
const backupDir = path.join(rewardsRoot, 'public_rewards_backup');

// 1) بناء تطبيق React (صفحة الدخول + التحليل)
console.log('[1/3] Building React app (login + analysis)...');
try {
  execSync('npm run build', { cwd: appRoot, stdio: 'inherit' });
} catch (e) {
  console.error('React build failed. Run from app folder: npm run build');
  process.exit(1);
}
if (!fs.existsSync(reactDist) || !fs.existsSync(path.join(reactDist, 'index.html'))) {
  console.error('React build output not found at', reactDist);
  process.exit(1);
}

// 2) تجهيز public المكافآت (نفس prepare-deploy)
console.log('[2/3] Preparing Rewards public...');
require('./prepare-deploy.js');

// 3) دمج: نقل محتوى public الحالي إلى public/rewards، ثم نسخ بناء React إلى الجذر
if (fs.existsSync(backupDir)) {
  try { fs.rmSync(backupDir, { recursive: true }); } catch (_) {}
}
fs.renameSync(publicDir, backupDir);
fs.mkdirSync(publicDir, { recursive: true });

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
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

copyRecursive(backupDir, path.join(publicDir, 'rewards'));
copyRecursive(reactDist, publicDir);
try { fs.rmSync(backupDir, { recursive: true }); } catch (_) {}

console.log('[3/3] Done. public/ has React at root and Rewards at /rewards/');
console.log('      Deploy with: firebase deploy --only hosting');
