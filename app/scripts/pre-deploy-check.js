/**
 * فحص قبل النشر — يتحقق من الأسرار ويطبع قائمة الخطوات اليدوية.
 * شغّل: npm run pre-deploy-check قبل npm run deploy (أو يدوياً قبل الرفع).
 * للمرور الصارم: CHECK_SECRETS=1 يجعّل غياب .env فشلاً (exit 1).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const envPath = path.join(appRoot, '.env');
const firebaseConfigPath = path.join(appRoot, 'shared', 'firebase-config.json');
const DEFAULT_ADMIN_KEY = 'ayman5255';
const CHECK_SECRETS_STRICT = process.env.CHECK_SECRETS === '1';

function parseEnv(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m) result[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
  return result;
}

let hasWarnings = false;

console.log('\n=== فحص قبل النشر (Pre-deploy Check) ===\n');

// 1. Check .env
if (!fs.existsSync(envPath)) {
  console.warn('⚠️  ملف .env غير موجود. انسخ من .env.example وضَع القيم الحقيقية.');
  if (CHECK_SECRETS_STRICT) {
    console.warn('   CHECK_SECRETS=1: غياب .env يعتبر فشلاً للنشر الآمن.');
    hasWarnings = true;
  } else {
    console.warn('   للتطوير المحلي قد يعمل بدون .env (القيم الافتراضية). للإنتاج: أنشئ .env.');
    hasWarnings = true;
  }
} else {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const env = parseEnv(envContent);
  const adminKey = env.VITE_ADMIN_SECRET_KEY || '';
  if (!adminKey || adminKey === DEFAULT_ADMIN_KEY) {
    console.warn('⚠️  VITE_ADMIN_SECRET_KEY غير مضبوط أو لا يزال القيمة الافتراضية.');
    console.warn('   غيّره في .env قبل النشر الحقيقي. راجع SECURITY.md.');
    hasWarnings = true;
  } else {
    console.log('✓ VITE_ADMIN_SECRET_KEY مضبوط في .env');
  }
}

// 2. Rewards admin key
const rewardsAppPath = path.join(appRoot, 'Rewards', 'src', 'app.js');
if (fs.existsSync(rewardsAppPath)) {
  const content = fs.readFileSync(rewardsAppPath, 'utf8');
  const m = content.match(/ADMIN_SECRET_KEY\s*=\s*['"]([^'"]+)['"]/);
  if (m && m[1] === DEFAULT_ADMIN_KEY) {
    console.warn('⚠️  ADMIN_SECRET_KEY في Rewards/src/app.js لا يزال القيمة الافتراضية.');
    console.warn('   عدّل app.js ليقرأ من مصدر موحد أو حدّث يدوياً ثم npm run sync:rewards.');
    hasWarnings = true;
  }
}

// 3. shared/firebase-config.json — تذكير إذا بقي apiKey التطوير
if (fs.existsSync(firebaseConfigPath)) {
  try {
    const fc = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));
    const knownDevApiKey = 'AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk';
    if (fc.apiKey === knownDevApiKey) {
      console.warn('⚠️  shared/firebase-config.json لا يزال يحتوي على apiKey التطوير المعروف.');
      console.warn('   للإنتاج: غيّر القيم في الملف أو احقنها من .env عند البناء. راجع SECURITY.md.');
      hasWarnings = true;
    }
  } catch (_) {}
}

// 4. تذكير: إن وُجد fallback المفتاح في adminConfig، تأكد من استخدام .env للإنتاج
const adminConfigPath = path.join(appRoot, 'src', 'adminConfig.ts');
if (fs.existsSync(adminConfigPath)) {
  const ac = fs.readFileSync(adminConfigPath, 'utf8');
  if (ac.includes("'ayman5255'") || ac.includes('"ayman5255"')) {
    console.log('ℹ️  تذكير: adminConfig.ts يحتوي fallback للمفتاح — للإنتاج ضع VITE_ADMIN_SECRET_KEY في .env.');
  }
}

// 5. Manual steps
console.log('\n--- خطوات يدوية (راجع PRE-DEPLOY-STEPS.md) ---');
console.log('1. تقييد Firebase API key في Google Cloud Console (HTTP referrer)');
console.log('2. اختبار: بوابة الأدمن → الدخول → التحليل → المكافآت');
console.log('3. شغّل npm run pre-deploy-check قبل كل deploy\n');

if (hasWarnings) {
  console.log('⚠️  توجد تحذيرات. راجعها قبل النشر إلى الإنتاج.');
  if (CHECK_SECRETS_STRICT) {
    console.log('   CHECK_SECRETS=1: النشر متوقف. أصلح التحذيرات أو أنشئ .env ثم جرّب مرة أخرى.\n');
    process.exit(1);
  }
  console.log('   النشر سيستمر (للتجربة/ستيجينج). للإنتاج: أصلح التحذيرات أو شغّل مع CHECK_SECRETS=1.\n');
  process.exit(0);
} else {
  console.log('✓ التحقق نجح. تأكد من تنفيذ الخطوات اليدوية قبل النشر.\n');
  process.exit(0);
}
