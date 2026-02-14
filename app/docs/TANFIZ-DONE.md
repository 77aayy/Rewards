# تنفيذ إصلاحات تقرير المراجعة (البنود 1–9)

**المرجع:** `app/docs/CODE_REVIEW_REPORT.md`  
**التاريخ:** تنفيذ البنود 1–9 حسب برومبت التنفيذ.

---

## قائمة البنود (1–9)

| البند | الحالة | ملخص |
|-------|--------|------|
| **1. توحيد إعداد Firebase (مصدر واحد)** | تم | تم إنشاء `app/shared/firebase-config.json` كمصدر واحد، وسكربت `app/scripts/inject-firebase-config.js` يقرأه ويحقن القيم في `Rewards/src/firebase-config.js` و `public/clear-session.html` و `src/firebase-config.generated.ts`؛ و`adminConfig.ts` يستورد الـ fallback من الملف المولَّد. تشغيل السكربت مدمج في `npm run sync:rewards` و `npm run build`. |
| **2. تقييد مدخلات رفع الملفات (xlsx)** | تم | تم إضافة تحقق صريح في `App.tsx` قبل تمرير الملف لـ xlsx: حد أقصى 10MB، وامتداد `.xlsx` أو `.xls` فقط؛ مع رسالة واضحة عند الرفض. تصدير `MAX_FILE_SIZE_BYTES` من `parser.ts`. |
| **3. تحديث التقرير (دقة النص)** | تم | في `CODE_REVIEW_REPORT.md`: تصحيح "يُبنى من buildTransferPayload" إلى "يُبنى داخل handleTransferToRewards"، وتحديث إشارات adminConfig إلى س11، 12–15، وتصحيح عدد أسطر app.js إلى حوالي 8,340 سطر (تم لاحقاً تحديثه بعد فصل الوحدات). |
| **4. ملف .env.example وتوثيق** | تم | الملف `app/.env.example` موجود ويوضح المتغيرات المطلوبة. `.env` و `.env.local` في `.gitignore`. جملة في `README.md` تشير إلى نسخ `.env.example` إلى `.env` وملء القيم قبل النشر. |
| **5. Checklist التنفيذ (TANFIZ-DONE.md)** | تم | هذا الملف يوثّق البنود 1–9 مع الحالة وملخص لكل بند وقسم "مطلوب من صاحب المشروع". |
| **6. فصل app.js إلى وحدات** | تم | تم تقسيم `app/Rewards/src/app.js` إلى وحدات: `rewards-firebase.js` (Firebase/الفترة الحية)، `rewards-rbac.js` (الأدوار وإخفاء العناصر)، `rewards-table.js` (تحديث الجدول والفوتر). ترتيب التحميل في `index.html` مضبوط؛ `README-MODULES.md` يوثّق الهيكل. البناء و`sync:rewards` ناجحان. (راجع `BAND-6-AUDIT.md`.) |
| **7. استبدال أو تأمين حزمة xlsx** | تم | تم ترقية مصدر xlsx إلى SheetJS الرسمي 0.20.3: في `app` من CDN (xlsx-0.20.3.tgz)، وفي Rewards من سكربت المتصفح (cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js). تقييد الحجم والنوع (10MB، .xlsx/.xls) مُطبَّق في التحليل وفي Rewards. توثيق في `parser.ts` و `Rewards/index.html`. |
| **8. توحيد قائمة مسح الجلسة في clear-session** | تم | في `app/public/clear-session.html`: تم تعريف مصفوفة واحدة `keysToRemove` ودالة واحدة `clearSessionKeys()` تُستدعى من المسار العادي (بعد signOut) ومن الـ catch. أي مفتاح جديد يُضاف في المصفوفة فقط. |
| **9. سكربت تحقق قبل النشر** | تم | تم توسيع `app/scripts/pre-deploy-check.js`: دعم `CHECK_SECRETS=1` لاعتبار غياب `.env` فشلاً؛ التحقق من `shared/firebase-config.json` (تحذير إذا apiKey بقيمة التطوير)؛ تذكير من `adminConfig.ts` عند وجود fallback للمفتاح. إضافة إشارة في `PRE-DEPLOY-STEPS.md` إلى تشغيل `npm run pre-deploy-check` قبل كل deploy. |

---

## مطلوب من صاحب المشروع (يدوياً)

- **تغيير مفتاح الأدمن وإيميلات الأدمن** قبل النشر الحقيقي (في `.env` أو في الكود ثم `npm run sync:rewards`).
- **تقييد Firebase API key** في Google Cloud Console حسب `PRE-DEPLOY-STEPS.md`.

---

## التحقق

- تشغيل `npm run build` و `npm run sync:rewards` من مجلد `app` بعد التعديلات.
- إصلاح أي أخطاء TypeScript أو ESLint في الملفات المعدَّلة.
