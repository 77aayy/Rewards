/**
 * مزامنة rewards → app/public/rewards ثم (اختياري) git add + commit + push.
 * استدعاء: node scripts/deploy-github-firebase.js [--push] [--deploy]
 *   --push   بعد المزامنة: git add public/rewards ثم commit + push إن وُجدت تغييرات
 *   --deploy بعد المزامنة (واختياراً بعد الـ push): npm run build ثم firebase deploy
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

function run(name, cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { cwd: opts.cwd || appRoot, stdio: 'inherit', encoding: 'utf8', shell: opts.shell });
  if (r.status !== 0 && !opts.allowNonZero) process.exit(r.status ?? 1);
  return r;
}

// 1) مزامنة rewards
console.log('[deploy-github-firebase] مزامنة rewards...');
run('sync', 'node', ['scripts/sync-rewards.js']);

const args = process.argv.slice(2);
const doPush = args.includes('--push');
const doDeploy = args.includes('--deploy');

if (doPush) {
  console.log('[deploy-github-firebase] git add public/rewards...');
  run('git add', 'git', ['add', 'public/rewards']);
  const status = spawnSync('git', ['diff', '--cached', '--quiet'], { cwd: appRoot });
  if (status.status !== 0) {
    run('git commit', 'git', ['commit', '-m', 'chore: sync rewards']);
    run('git push', 'git', ['push']);
  } else {
    console.log('[deploy-github-firebase] لا توجد تغييرات في public/rewards، تخطي commit/push.');
  }
} else {
  console.log('[deploy-github-firebase] للتحديث على GitHub شغّل: npm run deploy-github-firebase -- --push');
}

if (doDeploy) {
  console.log('[deploy-github-firebase] بناء ونشر Firebase...');
  run('build', 'npm', ['run', 'build']);
  run('firebase deploy', 'firebase', ['deploy']);
} else {
  console.log('[deploy-github-firebase] للنشر على Firebase شغّل: npm run deploy -- أو npm run deploy-github-firebase -- --deploy');
}

console.log('[deploy-github-firebase] انتهى.');
