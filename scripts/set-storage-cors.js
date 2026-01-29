/**
 * يضبط CORS على bucket Firebase Storage حتى يعمل رابط الإداري من المتصفح.
 * تشغيل مرة واحدة: npm install && npm run storage-cors
 * يحتاج: gcloud auth application-default login (أو GOOGLE_APPLICATION_CREDENTIALS)
 */
const { Storage } = require('@google-cloud/storage');

const BUCKET_NAME = 'rewards-63e43.firebasestorage.app';

const cors = [
  {
    maxAgeSeconds: 3600,
    method: ['GET', 'HEAD'],
    origin: [
      'https://rewards-63e43.web.app',
      'https://rewards-63e43.firebaseapp.com',
      'http://localhost:5000',
      'http://127.0.0.1:5000',
    ],
    responseHeader: ['Content-Type', 'Access-Control-Allow-Origin'],
  },
];

async function main() {
  const storage = new Storage();
  await storage.bucket(BUCKET_NAME).setCorsConfiguration(cors);
  console.log('CORS تم تطبيقه على', BUCKET_NAME);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
