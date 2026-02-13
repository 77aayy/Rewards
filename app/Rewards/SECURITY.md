# الأمان — مشروع إليت / Rewards

هذا الملف يوضح مكان تغيير المفتاح السري للأدمن وإعدادات النشر حسب تقرير مراجعة الكود و ARCHITECTURE.md.

---

## قبل النشر إلى الإنتاج

- غيّر **ADMIN_SECRET_KEY** في `app/src/adminConfig.ts` و `app/Rewards/src/app.js` إلى قيمة قوية ولا تشاركها.
- غيّر **ADMIN_ALLOWED_EMAILS** في `app/src/adminConfig.ts` (قائمة إيميلات الأدمن).
- قيّد **Firebase API key** في Console (HTTP referrer أو تطبيق مسموح).
- لا ترفع الريبو عاماً قبل تنفيذ ما سبق.

**قائمة قبل الرفع — تحقق قبل كل نشر:**
1. **تقييد API key:** خطوة يدوية — شرح تفصيلي مع اللينكات في **`app/PRE-DEPLOY-STEPS.md`** (افتح الملف واتبع الخطوات).
2. **اختبار قبل الرفع:** شغّل E2E من مجلد Rewards إن وُجد (`npm run test:e2e`) أو اختبر يدوياً: بوابة الأدمن → الدخول → التحليل → المكافآت (تفاصيل في نفس الملف).

---

## 1. مفتاح الأدمن

- **يجب تغيير المفتاح قبل النشر إلى الإنتاج.**
- **مواضع التعديل (يجب أن تتطابق في كل مكان):**
  - **Rewards (المصدر):** `app/Rewards/src/app.js` — السطر الذي يعرّف `ADMIN_SECRET_KEY`. تطبيق المكافآت يستخدمه للتحقق من وضع الأدمن ولتوجيه الخروج إلى `clear-session.html?admin=KEY`.
  - **بوابة الأدمن (React):** `app/src/adminConfig.ts` — `ADMIN_SECRET_KEY` و `ADMIN_ALLOWED_EMAILS`. يُستخدم لعرض صفحة تسجيل الدخول (إيميل/باسورد) عند فتح الرابط `/?admin=المفتاح`.
  - **clear-session.html:** لا يخزّن المفتاح ثابتاً؛ يقرأ `admin` من query string عند استدعاء الصفحة (مثلاً `clear-session.html?admin=المفتاح`) ويوجّه بعد الخروج إلى `/?admin=المفتاح`. إن فُتحت الصفحة بدون `?admin=` يُوجّه إلى `/` فقط.
- التطبيق يعرض رابط الأدمن بصيغة: `?admin=المفتاح`. من يعرف المفتاح يمكنه الدخول كأدمن.
- **app-extensions.js** لا يكرر المفتاح؛ يستخدم `window.getAdminSecretKey()` من app.js.
- قبل النشر: غيّر المفتاح في **كلا** `Rewards/src/app.js` و `app/src/App.tsx` إلى نفس القيمة القوية ولا تشاركها إلا مع من يملك صلاحية الأدمن.

**Checklist عند تغيير المفتاح (يجب أن تتطابق القيمتان):**
1. `app/src/adminConfig.ts` — `ADMIN_SECRET_KEY` و `ADMIN_ALLOWED_EMAILS` (بوابة الأدمن/React)
2. `app/Rewards/src/app.js` — التعريف `ADMIN_SECRET_KEY`  
ثم شغّل `npm run sync:rewards` من مجلد `app` لأن `public/rewards/` يُنسخ من Rewards.

**مصدر واحد لـ Rewards:** المجلد `app/Rewards/` هو المصدر الوحيد لكود تطبيق المكافآت. المجلد `app/public/rewards/` يُملأ بالنسخ عبر سكربت السينك (مثلاً `sync-rewards`). لا تعدّل الملفات في `public/rewards/` يدوياً؛ عدّل في `Rewards/` ثم أعد تشغيل السينك.

---

## 2. إعداد Firebase

- **الملفات التي تحتوي إعداد Firebase (عند التعديل حدّثها كلها أو استخدم مصدراً واحداً):**
  - `app/src/App.tsx` (ثابت FIREBASE_CONFIG لـ بوابة الأدمن)
  - `app/src/firebase.ts` (تطبيق التحليل)
  - `app/public/clear-session.html` (تسجيل الخروج)
  - `app/Rewards/src/firebase-config.js` (المصدر — تطبيق المكافآت)
  - `app/public/rewards/src/firebase-config.js` (يُحدَّث تلقائياً عبر sync-rewards)
- التطبيق يدعم جلب الإعداد من **`window.__FIREBASE_CONFIG__`** (يُحقَن عند البناء أو من بيئة) مع fallback افتراضي.
- في بيئة إنتاج: يُفضّل حقن القيم من متغيرات بيئة أو config لا يُرفع إلى المستودع (راجع API_KEY_SETUP_GUIDE.md إن وُجد).
- **قبل الإنتاج:** قيّد الـ API key في Firebase Console (مثلاً HTTP referrer أو تطبيق مسموح) حتى لا يُستخدَم من دومينات غير معتمدة.

---

## 3. قواعد Storage

- القواعد في **`storage.rules`**.
- القراءة مفتوحة (`allow read: if true`) عن قصد لأن التطبيق لا يستخدم Firebase Auth؛ الوصول يُتحقق منه عبر روابط سرية (admin، role+token+period، كود موظف).
- عند إضافة Auth لاحقاً يُفضّل تضييق القراءة — راجع التعليقات في `storage.rules` و ARCHITECTURE.md.
- **مستقبلاً:** عند وجود backend أو Cloud Functions، ربط الكتابة/الحذف في Storage بصلاحيات (بدلاً من `allow delete: if true` المفتوح).

---

## 4. Rate Limiting

- لا يوجد حد لمعدل الطلبات حالياً (التطبيق يتحدث مباشرة مع Firebase من العميل).
- الخطة المستقبلية: عند إضافة Cloud Functions أو backend، إضافة Rate Limiting للإجراءات الحساسة (إغلاق الفترة، رفع الفترة، إنشاء روابط إداريين) — راجع ARCHITECTURE.md.
