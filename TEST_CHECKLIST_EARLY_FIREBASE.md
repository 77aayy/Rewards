# قائمة التحقق: تهيئة Firebase المبكرة + اختبار كامل

## ما تم تنفيذه

1. **مصدر واحد للإعداد:** `src/firebase-config.js` — يُحمّل من الـ head ويُستخدم من `app.js`.
2. **تهيئة مبكرة في الـ head:** بعد سكربتات Firebase يُحمّل `firebase-config.js` ثم سكريبت inline يهيّئ التطبيق و`window.storage`.
3. **app.js:** يستخدم `window.firebaseConfig` إن وُجد، وإذا وُجد `window.storage` يلتقطه فوراً دون انتظار.

## البناء والتحقق

- [x] `node scripts/build.js` — نجح.
- [x] وجود `dist/src/firebase-config.js`.
- [x] `dist/index.html` يحتوي على `/src/firebase-config.js` والسكريبت المبكر.

## اختبار كامل (يدوي أو E2E)

### 1. رفع ملف الإكسيل (أدمن)

1. افتح الموقع كأدمن: `https://rewards-63e43.web.app/?admin=ayman5255` (أو محلياً بعد `npx serve -s . -l 3999` ثم `http://localhost:3999/?admin=ayman5255`).
2. يجب أن تظهر صندوق الرفع.
3. ارفع ملف الإكسيل من المشروع: `UserStatisticsReport_Ar.xlsx`.
4. يجب أن تظهر رسالة «تم تحميل البيانات بنجاح» ويُخفى صندوق الرفع ويظهر الـ dashboard والجدول.
5. تحقق أن «الفترة» ليست فارغة (ليست «-»).

### 2. إدارة الإداريين

1. من الـ dashboard اضغط «إدارة الإداريين».
2. يجب أن تظهر نافذة الروابط (بعد مزامنة Firebase إن وُجدت بيانات).
3. انسخ رابط المشرف من الحقل المخصص.

### 3. رابط المشرف (جهاز/متصفح جديد)

1. في نافذة خاصة أو متصفح آخر (أو مسح التخزين المحلي) افتح الرابط المنسوخ (مثل `.../?role=supervisor&token=...&period=2026_01`).
2. يجب أن تظهر «جاري التحقق من الرابط...» ثم تُزال وتظهر لوحة التحكم مع «جاري تحميل بيانات الفترة من الخادم...».
3. بفضل التهيئة المبكرة، `window.storage` غالباً جاهز فوراً أو بعد وقت قصير — يجب أن تظهر بيانات الفترة والجدول خلال ثوانٍ.
4. تحقق أن «الفترة» معبأة والجدول يظهر مع خانات إدخال التقييمات (Booking / Google).

### 4. اختبار E2E (Playwright)

```bash
# ضد الموقع المنشور (بعد deploy)
npx playwright test e2e/e2e-full.spec.js --project=chromium

# ضد سيرفر محلي (بعد: npx serve -s . -l 3999)
set E2E_BASE_URL=http://localhost:3999
npx playwright test e2e/e2e-full.spec.js --project=chromium
```

ملف الإكسيل المستخدم في الاختبار: `UserStatisticsReport_Ar.xlsx` في جذر المشروع.

## في حال ظهور مشاكل

- **404 لـ firebase-config.js:** تأكد أن الملف موجود في `dist/src/` بعد البناء وأن الـ hosting يخدم مسار `/src/`.
- **رابط المشرف لا يحمّل البيانات:** تأكد أن الأدمن رفع الملف وفتح «إدارة الإداريين» قبل نسخ الرابط (حتى يُرفع `periods/live.json` و`admin_tokens`).
- **تحذير "firebaseConfig not found":** تأكد أن `firebase-config.js` يُحمّل قبل `app.js` (ترتيب السكربتات في الـ head والـ body).
