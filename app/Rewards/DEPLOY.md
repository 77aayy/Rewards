# تعليمات الرفع والنشر (بدون قيود)

## مصدر الملفات (توحيد المصدر)

- **المصدر الوحيد للتعديل:** الملفات في جذر المشروع `Rewards/` و `Rewards/src/` (مثل `index.html`, `src/app.js`, `src/app-extensions.js`).
- **مجلد `public/`:** يُنشأ تلقائياً من المصدر عبر `npm run predeploy` — لا تعدّل ملفات `public/` يدوياً.
- **التطوير المحلي:** من مجلد `Rewards` شغّل `npm run dev` لنسخ المصدر إلى `public/` ثم تشغيل السيرفر على المنفذ 8080 (أو استخدم `npx serve -s public -l 8080` بعد تشغيل `npm run predeploy` مرة واحدة).

---

## ما الذي تم إصلاحه؟

1. **GitHub Actions:** عند كل `git push` إلى فرع `main` يتم الآن بناء مجلد `public/` تلقائياً ثم النشر على Firebase Hosting.
2. **سكربت محلي:** تشغيل `deploy.bat` (ويندوز) ينفّذ: نشر Firebase ← ثم رفع الكود إلى GitHub.

---

## ماذا تفعل أنت (مرة واحدة أو عند الحاجة)

### 1) النشر التلقائي من GitHub (عند كل push إلى main)

- اذهب إلى المستودع على GitHub → **Settings** → **Secrets and variables** → **Actions**.
- اضغط **New repository secret**.
- الاسم: `FIREBASE_TOKEN`.
- القيمة: احصل عليها من جهازك بتشغيل:
  ```bash
  npx firebase login:ci
  ```
  انسخ التوكن الذي يظهر وضعه في السر.
- بعد ذلك أي **push** إلى فرع **main** سينشر الموقع تلقائياً على Firebase.

### 2) الرفع والنشر من جهازك (طريقة واحدة بلا قيود)

**مرة واحدة:**

- تأكد أنك سجّلت الدخول لـ Firebase:
  ```bash
  npx firebase login
  ```
- تأكد أن Git مربوط بـ GitHub (مثلاً `git remote add origin https://github.com/...` أو استخدم GitHub Desktop).

**عند كل رفع:**

- شغّل الملف:
  ```
  deploy.bat
  ```
  (دبل كليك عليه أو من CMD داخل مجلد المشروع).
- السكربت سيقوم بـ:
  1. تجهيز مجلد `public` ونشر الموقع على Firebase.
  2. إضافة التغييرات وعمل commit (يمكنك كتابة رسالة أو الضغط Enter للرسالة الافتراضية).
  3. رفع الكود إلى GitHub (`git push`).

إذا ظهر خطأ في الرفع (مثلاً رفض أو طلب تسجيل دخول)، تأكد من:
- وجود `origin` واسم الفرع صحيح (مثلاً `main`).
- تسجيل الدخول لـ GitHub (توكن أو GitHub Desktop أو Git Credential Manager).

---

## ملخص

| الهدف              | ما تفعله |
|--------------------|----------|
| نشر على Firebase فقط | `npm run deploy` |
| رفع إلى GitHub فقط   | `git add -A` ثم `git commit -m "رسالة"` ثم `git push` |
| الاثنان معاً بضغطة واحدة | تشغيل `deploy.bat` |

بعد إعداد `FIREBASE_TOKEN` في GitHub، مجرد **رفع الكود إلى main** كافٍ ليعمل النشر التلقائي بدون قيود إضافية منك.

---

## ما الذي يُرفع تلقائياً على Firebase Hosting؟

Firebase يستخدم **مجلد `public/` فقط** (ضبط في `firebase.json` → `"public": "public"`).  
مجلد `public/` **لا يُخزَّن في Git**؛ يُنشأ عند النشر بواسطة `scripts/prepare-deploy.js`.

**الملفات التي تُنسخ إلى `public/` ثم تُرفع:**

| من الجذر | من مجلد `src/` |
|----------|-----------------|
| `index.html` | كل الملفات (مثل `app.js`, `app-extensions.js`, `firebase-config.js`, `styles.css`, `tailwind-src.css`, `discount-clauses-55.js`) |
| `manifest.json` | |
| `service-worker.js` | |
| `icon-192.png` | |
| `icon-512.png` | |
| `unnamed.png` | |

**لا يُرفع:** `Downloads/`, `e2e/`, `scripts/`, `*.md`, `package.json`, `node_modules/`, `firebase.json`, `.git`, وغيرها (مذكورة في `hosting.ignore` و `.firebaseignore`).

---

## تنظيف المشروع (ما تم حذفه)

**تم حذفه سابقاً أو في جولة التنظيف:**
- **Downloads/** — آلاف الملفات الشخصية (لا علاقة لها بالمشروع).
- **apphosting.yaml**, **Procfile** — إعدادات استضافة غير مستخدمة.
- **do-pull-push.bat**, **pull-then-push.bat**, **git-sync.bat**, **remove-xlsx-from-git.bat** — سكربتات Git زائدة (يبقى **deploy.bat** للنشر والرفع).
- **CODE_REVIEW_REPORT.md**, **REVIEW_CHECKLIST.md**, **TASKS.md**, **TRACE_ATTENDANCE_HR_TO_ADMIN.md**, **DOCS.md** — تقارير وتعليمات قديمة أو غير مستخدمة.

**ما بقي ضرورياً:** `deploy.bat`, مجلدات `src/`, `scripts/`, `e2e/`, وملفات الإعداد (firebase.json, package.json)، و**DEPLOY.md**, **ARCHITECTURE.md**, **SECURITY.md**.
