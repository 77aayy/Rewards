/**
 * Pull Firebase Hosting version into local dist/
 *
 * الخطوة 1: من Firebase Console → Hosting → Release history
 *          اعمل Rollback لإصدار f78246 عشان الموقع الحي يخدم محتوى الإصدار ده.
 * الخطوة 2: شغّل: npm run pull-firebase-version
 * الخطوة 3: (اختياري) ارجع الـ live لأحدث إصدار لو حابب.
 *
 * النتيجة: مجلد app/dist/ هيبقى نسخة من محتوى الإصدار اللي الموقع كان بيسخدمه (بعد الـ rollback).
 */

const BASE_URL = 'https://rewards-63e43.web.app';

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, '..', 'dist');

function resolveUrl(base, relative) {
  if (relative.startsWith('http')) return relative;
  const u = new URL(relative, base);
  return u.href;
}

function urlToLocalPath(url) {
  try {
    const u = new URL(url);
    let p = u.pathname || '/index.html';
    if (p.endsWith('/')) p += 'index.html';
    const clean = p.startsWith('/') ? p.slice(1) : p;
    return clean || 'index.html';
  } catch {
    return null;
  }
}

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return url;
  }
}

const CACHE_BUST = `_t=${Date.now()}`;

function addCacheBust(url) {
  const u = new URL(url);
  u.search = u.search ? `${u.search}&${CACHE_BUST}` : `?${CACHE_BUST}`;
  return u.href;
}

async function fetchText(url) {
  const res = await fetch(addCacheBust(url), {
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return res.text();
}

async function fetchBytes(url) {
  const res = await fetch(addCacheBust(url), {
    redirect: 'follow',
    cache: 'no-store',
    headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
  });
  if (!res.ok) throw new Error(`${url} ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function extractAssetUrls(html, pageUrl) {
  const urls = new Set();
  const base = pageUrl.replace(/\/[^/]*$/, '/');

  const patterns = [
    /\bsrc\s*=\s*["']([^"']+)["']/gi,
    /\bhref\s*=\s*["']([^"']+)["']/gi,
    /url\s*\(\s*["']?([^"')]+)["']?\s*\)/gi,
  ];

  for (const re of patterns) {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(html)) !== null) {
      const raw = m[1].trim();
      if (raw.startsWith('data:') || raw.startsWith('#')) continue;
      const full = resolveUrl(base, raw);
      if (full.startsWith(BASE_URL)) urls.add(full);
    }
  }

  return urls;
}

const TARGET_VERSION = process.env.FIREBASE_VERSION_ID || 'f78246';

async function main() {
  console.log('جاري تحميل محتوى الموقع من:', BASE_URL);
  console.log('الإصدار المطلوب محلياً:', TARGET_VERSION);
  console.log('');
  console.log('مهم: لازم تعمل Rollback لإصدار', TARGET_VERSION, 'قبل ما تشغّل السكربت:');
  console.log('  1. افتح https://console.firebase.google.com/project/rewards-63e43/hosting');
  console.log('  2. Release history → اختر الإصدار', TARGET_VERSION, '→ النقاط الثلاث ⋮ → Rollback');
  console.log('  3. بعد ما الـ live يبقى نسخة', TARGET_VERSION, 'شغّل السكربت تاني.\n');

  if (!fs.existsSync(distDir)) fs.mkdirSync(distDir, { recursive: true });

  const fetched = new Set();
  const queue = [
    `${BASE_URL}/`,
    `${BASE_URL}/index.html`,
    `${BASE_URL}/rewards/`,
    `${BASE_URL}/rewards/index.html`,
  ];

  while (queue.length) {
    const url = queue.shift();
    const norm = normalizeUrl(url);
    if (fetched.has(norm)) continue;
    fetched.add(norm);

    const localPath = urlToLocalPath(norm);
    if (!localPath) continue;

    const fullPath = path.join(distDir, localPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    try {
      const isHtml = /\.html?$/i.test(localPath) || !path.extname(localPath);
      if (isHtml) {
        const html = await fetchText(url);
        fs.writeFileSync(fullPath, html, 'utf8');
        const assetUrls = extractAssetUrls(html, url);
        for (const u of assetUrls) {
          const n = normalizeUrl(u);
          if (!fetched.has(n)) queue.push(u);
        }
        console.log('  OK', localPath);
      } else {
        const buf = await fetchBytes(url);
        fs.writeFileSync(fullPath, buf);
        console.log('  OK', localPath);
      }
    } catch (e) {
      console.warn('  SKIP', localPath, e.message);
    }
  }

  console.log('\nتم. المحتوى المحلي في:', distDir);
  console.log('\nعشان تشوف النسخة المحمّلة (مش السورس):');
  console.log('  من مجلد app شغّل: npx firebase serve --only hosting');
  console.log('  وافتح الرابط اللي يظهر (مثلاً http://localhost:5000)');
  console.log('  لا تستخدم npm run dev — ده بيخدم السورس الحالي مش نسخة f78246.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
