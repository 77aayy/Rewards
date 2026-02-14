/**
 * يضبط CORS على bucket Firebase Storage حتى يعمل رابط الإداري من المتصفح.
 * تشغيل مرة واحدة: npm install && npm run storage-cors
 * يحتاج: gcloud auth application-default login (أو GOOGLE_APPLICATION_CREDENTIALS)
 */
const { Storage } = require('@google-cloud/storage');

const BUCKET_NAMES = [
  'rewards-63e43.firebasestorage.app',
  'rewards-63e43.appspot.com',
];

const cors = [
  {
    maxAgeSeconds: 3600,
    method: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'OPTIONS'],
    origin: [
      'https://rewards-63e43.web.app',
      'https://rewards-63e43.firebaseapp.com',
      'http://localhost:5000',
      'http://127.0.0.1:5000',
      'http://localhost:4173',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5175',
      'http://localhost:5176',
      'http://127.0.0.1:5176',
    ],
    responseHeader: [
      'Content-Type',
      'Access-Control-Allow-Origin',
      'Content-Length',
      'Content-Encoding',
    ],
  },
];

async function main() {
  const storage = new Storage();
  let lastErr;
  for (const name of BUCKET_NAMES) {
    try {
      await storage.bucket(name).setCorsConfiguration(cors);
      console.log('CORS تم تطبيقه على', name);
      return;
    } catch (e) {
      lastErr = e;
      console.warn('تخطي', name, '—', e.message || e);
    }
  }
  console.error('فشل تطبيق CORS على كل المحاولات. آخر خطأ:', lastErr?.message || lastErr);
  process.exit(1);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
