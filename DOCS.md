# إليت | كشف المكافآت النهائي — التوثيق الموحد

مشروع ويب ستاتيك (HTML/JS) لإدارة مكافآت فريق عمل فندق إليت: رفع تقرير إكسيل، إدارة الإداريين (مشرف/HR/حسابات/مدير عام)، تقييمات، حضور، خصومات، إغلاق الفترة، تقارير وأكواد موظفين.

---

## 1. نظرة عامة

- **الرابط الأونلاين:** https://rewards-63e43.web.app  
- **الدخول كأدمن:** `https://rewards-63e43.web.app/?admin=ayman5255`  
- **الرابط الجذر بدون صلاحية:** يعرض «غير مصرح بالدخول» فقط (لا لوحة أدمن ولا مشرف/HR).

**الأدوار:** أدمن (رفع ملف، إدارة إداريين، خصومات، إغلاق فترة)، مشرف (تقييمات Booking/Google)، HR (أيام حضور/بطل تحدي الظروف)، حسابات، مدير عام (عرض إحصائيات)، موظف (بكود بعد إغلاق الفترة).

---

## 2. البناء والنشر

### البناء (محلياً)

```bash
npm run build
```

يُنتج مجلد `dist/` (يُستخدم إذا غيّرت `firebase.json` إلى `"public": "dist"`).

### النشر على Firebase Hosting

المشروع مُعدّ حالياً للنشر من **الجذر** (`public: "."` في `firebase.json`).

```bash
firebase use rewards-63e43
firebase deploy --only hosting
```

- تسجيل الدخول إن طُلب: `firebase login`
- Hosting URL بعد النشر: https://rewards-63e43.web.app

### (اختياري) النشر من `dist/`

1. في `firebase.json` غيّر `"public": "."` إلى `"public": "dist"`.
2. نفّذ: `npm run build` ثم `firebase deploy --only hosting`.

---

## 3. إعداد Firebase

### Storage Rules

- القواعد في `storage.rules`.
- رفع القواعد: `firebase deploy --only storage` أو نسخ المحتوى يدوياً من Firebase Console → Storage → Rules.

### تهيئة التطبيق

- الإعداد في `src/firebase-config.js` ويُحمّل من `index.html` لتهيئة مبكرة.
- التطبيق يكتب/يقرأ من Firebase Storage (مثلاً `periods/live.json` و`admin_tokens/...`).

### سلوك الفترة الحية

- ملف واحد للفترة الحية؛ آخر رفع يكتسب عند التعديل المتزامن.
- الإداريون يدخلون البيانات ثم الأدمن يفتح لاحقاً — التدفق العادي يعمل كما هو متوقع.

---

## 4. الأمان ومفتاح الأدمن

### حماية API Key (Firebase)

- مفتاح Firebase في الواجهة محمي بـ:
  1. **تقييدات المفتاح** في [Google Cloud Console](https://console.cloud.google.com/apis/credentials): HTTP referrers (rewards-63e43.web.app، localhost)، وربط المفتاح بـ Firebase Storage API فقط.
  2. **قواعد Storage** في `storage.rules`.

### مفتاح الأدمن (ADMIN_SECRET_KEY)

- **الموقع:** `src/app.js` — الثابت `ADMIN_SECRET_KEY = 'ayman5255'`.
- **تحذير:** المفتاح ظاهر في مصدر الصفحة؛ قبل نشر حقيقي غيّره إلى قيمة سرية ولا ترفعها لمستودع عام.
- الدخول كأدمن: `?admin=المفتاح`.

### تقييد API Key خطوة بخطوة (اختياري)

1. افتح [Google Cloud Console](https://console.cloud.google.com/) واختر مشروع rewards-63e43.
2. APIs & Services → Credentials.
3. عدّل المفتاح: Application restrictions = HTTP referrers، أضف `https://rewards-63e43.web.app/*` و`http://localhost:*`.
4. API restrictions = Restrict key → Firebase Storage API فقط.

---

## 5. اختبار E2E (Playwright)

### تثبيت وتشغيل

إذا ظهر `Cannot find module '@playwright/test'`:

```bash
npm install
npx playwright install chromium   # اختياري لأول مرة
```

- **ضد الأونلاين (بدون متغير):**  
  `npm run test:e2e`

- **ضد محلي:**  
  `set E2E_BASE_URL=http://localhost:3999` ثم `npm run test:e2e`

الملف: `e2e/e2e-full.spec.js`.

### قائمة التحقق اليدوية (ملخص)

- **أ.** خروج ثم دخول — لوحة وبيانات تظهر بعد إعادة الدخول.
- **ب.** رفع ملف الإكسيل الاختباري: `UserStatisticsReport_Ar.xlsx` من جذر المشروع.
- **ج.** رابط المشرف → اختيار فرع → إدخال تقييمات → إرسال.
- **د.** رابط HR → اختيار فرع → إدخال حضور → إرسال.
- **هـ.** التحقق عند الأدمن من ظهور البيانات (تقييمات + أيام حضور).
- **و.** خصم من الأدمن + خروج ثم التحقق من بقاء البيانات.
- **ز.** روابط المدير العام والحسابات — عرض فقط.
- **ح.** إغلاق الفترة والتحقق من الفترة الجديدة والأرشيف.

---

## 6. هيكل المشروع (ملفات أساسية)

| الملف / المجلد      | الوظيفة |
|---------------------|---------|
| `index.html`        | نقطة الدخول، تحميل السكربتات والـ CSS |
| `src/app.js`        | المنطق الرئيسي، RBAC، رفع إكسيل، واجهات |
| `src/app-extensions.js` | إدارة الإداريين، توكنات، Firebase |
| `src/firebase-config.js` | إعداد Firebase |
| `src/styles.css`    | التنسيقات |
| `src/discount-clauses-55.js` | بنود الخصومات والتعليمات |
| `storage.rules`     | قواعد Firebase Storage |
| `firebase.json`     | إعداد Firebase (hosting، إلخ) |
| `scripts/build.js`  | سكربت البناء |
| `e2e/e2e-full.spec.js` | اختبارات E2E |
| `playwright.config.js` | إعداد Playwright |

---

*آخر دمج توثيق: تم دمج إعداد Firebase، النشر، الأمان، API Key، واختبار E2E في هذا الملف. الملفات القديمة (تقارير تدقيق، مراجعات، قوائم فرعية) تم إزالتها لتبسيط المشروع.*
