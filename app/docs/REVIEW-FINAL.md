# مراجعة نهائية — مشروع e-Rewards

تاريخ المراجعة: 2025

---

## 1. الواجهة الأمامية (Frontend)

### 1.1 الهيكل

| المسار | الغرض |
|--------|-------|
| `app/` | التطبيق الرئيسي: React + Vite + TypeScript |
| `app/src/` | React: App.tsx, AdminGate, AdminLoginForm, firebase, config, parser |
| `app/public/` | أصول ثابتة: clear-session.html، rewards/ (نسخة مزامنة) |
| `app/Rewards/` | تطبيق Vanilla JS + Tailwind (صفحة المكافآت) |
| `app/shared/` | ملفات مشتركة: theme.js، headerButtonsConfig.json، conditions-content.json، action-header-buttons.css، firebase-config.json |

### 1.2 نقاط الدخول

| التطبيق | المسار | الملف |
|---------|--------|-------|
| التحليل (React) | `/` | app/index.html → src/main.tsx |
| المكافآت | `/rewards/` | app/public/rewards/index.html |
| مسح الجلسة | /clear-session.html | app/public/clear-session.html |

### 1.3 RTL والعربي

- `lang="ar" dir="rtl"` في الصفحات الرئيسية
- خط IBM Plex Sans Arabic
- متغيرات CSS للثيم الفاتح/الداكن
- هرمية أحجام: typography-h1..h4، body، small، caption

### 1.4 التوصيات

- [ ] التحقق من أن `dist/index.html` بعد البناء يحتفظ بـ `lang="ar" dir="rtl"`
- [ ] إجراء اختبار إمكانية وصول (قارئ شاشة، لوحة مفاتيح)

---

## 2. Firebase

### 2.1 حقن الإعدادات

| المصدر | الهدف |
|--------|-------|
| `app/shared/firebase-config.json` | Rewards/src/firebase-config.js، public/clear-session.html، src/firebase-config.generated.ts |
| `.env` (VITE_FIREBASE_*, VITE_ADMIN_SECRET_KEY) | تجاوز القيم في السكربت |

السكربت: `scripts/inject-firebase-config.js` — يُشغَّل عبر `sync:rewards` و `build`.

### 2.2 الاستخدام

| الخدمة | الاستخدام |
|--------|-----------|
| Auth | React: تسجيل دخول الأدمن؛ clear-session: تسجيل خروج |
| Storage | React: config/settings.json؛ Rewards: periods/*.json، admin_tokens، config |
| Firestore | غير مستخدم |

### 2.3 إصدارات Firebase

- Rewards (CDN): 10.14.0
- clear-session.html: 10.7.1
- React (npm): ^12.9.0

### 2.4 قواعد الأمان

- `app/Rewards/storage.rules` — معرّفة للـ Storage
- مراجعة `allow read` إن كان هناك بيانات حساسة

### 2.5 التوصيات

- [ ] توحيد إصدار Firebase في clear-session مع Rewards
- [ ] مراجعة أمان قواعد Storage
- [ ] عدم رفع `apiKey` في المستودع إن أمكن (استخدام .env + CI secrets)

---

## 3. GitHub وملفات BAT

### 3.1 GitHub Actions

| المشكلة | الوضع الحالي |
|---------|---------------|
| موقع الـ workflow | `app/Rewards/.github/workflows/` — **GitHub لا يكتشفه** (يجب أن يكون في جذر المستودع: `.github/workflows/`) |
| المسارات | السكربت يشغّل `node scripts/prepare-deploy.js` من الجذر — غير موجود هناك |
| النشر الصحيح | يجب تشغيل `npm run deploy` من مجلد `app/` |

**الحل (تم تنفيذه):** نقل الـ workflow إلى `.github/workflows/firebase-hosting.yml` في جذر المستودع مع `working-directory: app`، وتشغيل `npm run deploy` من مجلد `app/`.

### 3.2 ملفات BAT

| الملف | المسار | الوظيفة |
|-------|--------|----------|
| `deploy-github-firebase.bat` | جذر المشروع | النشر الكامل: sync + build + firebase deploy + git commit + push |
| `deploy.bat` | app/Rewards/ | نشر Rewards فقط + git |
| `start-local-admin.bat` | جذر المشروع | تشغيل Vite + فتح صفحة الأدمن |

### 3.3 الملفات المُستثناة في .gitignore

- `fix-push.bat`, `sync-and-push.bat` — غير موجودة، مدرجة في app/Rewards/.gitignore للتنظيف

---

## 4. تنظيف المشروع

### 4.1 الملفات الآمنة للحذف (تُعاد إنشاؤها)

| المسار | يُعاد بـ |
|--------|----------|
| `app/dist/` | npm run build |
| `app/.firebase/` | firebase deploy |
| `app/node_modules/` | npm install |

### 4.2 لا تحذف

| المسار | السبب |
|--------|-------|
| app/src/ | كود React |
| app/public/rewards/ | نسخة مزامنة — يُملأ بـ sync:rewards |
| app/Rewards/ | مصدر المكافآت |
| app/shared/ | موارد مشتركة |
| app/scripts/ | سكربتات sync و build |

### 4.3 التكرار المتوقع

| العنصر | المصدر | التزامن |
|--------|--------|---------|
| admin-config.js، firebase-config.js | inject script | sync:rewards + build |
| rewards/* | app/Rewards/ | sync-rewards.js |
| shared/* في rewards | app/shared/ | prepare-deploy، sync |

---

## 5. سلسلة النشر

```
من الجذر:
  deploy-github-firebase.bat
    → cd app
    → npm run deploy (pre-deploy-check + sync:rewards + build + firebase deploy)
    → git add -A; git commit; git push

من app/Rewards/:
  deploy.bat
    → npm run deploy (prepare-deploy-with-login + firebase deploy)
    → git add; commit; push
```

**ملاحظة:** النشر الرئيسي من `app/` يُنتج `dist/` ويُنشر على Firebase Hosting. النشر من `Rewards/` مستقل (لمشروع Rewards فقط).

---

## 6. ملخص التوصيات

| الأولوية | التوصية |
|----------|----------|
| عالية | ~~نقل GitHub Actions~~ (تم التنفيذ) |
| متوسطة | مراجعة أمان قواعد Storage ومفتاح API |
| منخفضة | توحيد إصدارات Firebase؛ اختبار إمكانية الوصول |

---

*هذه المراجعة لا تغيّر المعادلات ولا المنطق الحسابي.*
