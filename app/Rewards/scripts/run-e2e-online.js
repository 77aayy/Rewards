/**
 * تشغيل اختبار E2E على النسخة الأونلاين (rewards-63e43.web.app)
 * النتيجة تُكتب في e2e-run-online.txt
 *
 * تشغيل: node scripts/run-e2e-online.js
 * أو:     npm run test:e2e
 * (الرابط الافتراضي في playwright.config.js هو الأونلاين إذا E2E_BASE_URL غير مضبوط)
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
process.chdir(root);

const outPath = path.join(root, 'e2e-run-online.txt');
fs.writeFileSync(outPath, 'E2E run started at ' + new Date().toISOString() + '\n', 'utf8');

const env = { ...process.env, E2E_BASE_URL: '' };
// تشغيل الاختبار 9 فقط (إغلاق الفترة + الفترات المغلقة + إحصائيات الفترات السابقة) على الرابط الأونلاين
const cmd = 'npx playwright test e2e/e2e-full.spec.js --project=chromium --reporter=list -g "9\\."';

let stdout = '';
let stderr = '';
try {
  stdout = execSync(cmd, { encoding: 'utf8', timeout: 240000, env, maxBuffer: 10 * 1024 * 1024 });
} catch (e) {
  stdout = (e.stdout || '').toString();
  stderr = (e.stderr || '').toString();
  if (e.message) stderr += e.message;
}

const out = [
  'E2E Base URL: https://rewards-63e43.web.app',
  'Command: ' + cmd,
  '---',
  stdout,
  stderr ? '\n--- stderr ---\n' + stderr : '',
].join('\n');

fs.appendFileSync(outPath, out, 'utf8');
process.exit(stderr ? 1 : 0);

