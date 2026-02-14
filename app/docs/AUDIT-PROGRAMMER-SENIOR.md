# مراجعة سينيور لتنفيذ المبرمج (من الكود الفعلي)

**تاريخ المراجعة:** بناءً على الكود الحالي في المشروع.  
**المراجع:** (1) البنود 1–9 من برومبت التنفيذ (PROMPT-TANFIZ-ESLAHAT) و DELIVERY-AND-AUDIT؛ (2) **مهمة مصدر واحد لنافذة الشروط** (TASK-CONDITIONS-ONE-SOURCE.md).

---

## نتيجة عامة

| الحالة | الملخص |
|--------|--------|
| **منجَز** | البنود 1، 2، 4، 5، 6، 7، 8، 9 — موجودة في الكود والملفات كما طُلِب. |
| **ملاحظات** | بند 3 (تقرير): أرقام أسطر في التقرير قد لا تطابق adminConfig الحالي. بند 6: فصل app.js سبّب تكرار تعريفات (تم إصلاح جزء منها لاحقاً). |
| **مكسور من التنفيذ** | لم يُكتشف كسر واضح؛ البناء ناجح. |

---

## بند 1 — توحيد إعداد Firebase

**التحقق من الكود:**
- وجود `app/shared/firebase-config.json`.
- وجود `app/scripts/inject-firebase-config.js` يقرأ منه ويحقن في: `Rewards/src/firebase-config.js`، `public/clear-session.html`، `src/firebase-config.generated.ts`.
- `package.json`: `sync:rewards` و `build` يبدآن بـ `node scripts/inject-firebase-config.js`.
- `adminConfig.ts` يستورد من `firebase-config.generated.ts`.

**النتيجة:** منجَز. مصدر واحد وسكربت حقن مدمج في sync و build.

---

## بند 2 — تقييد مدخلات رفع الملفات (10MB، xlsx/xls)

**التحقق من الكود:**
- `app/src/parser.ts`: `MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024`؛ تحقق `buffer.byteLength > MAX_FILE_SIZE_BYTES` قبل القراءة.
- `app/src/App.tsx`: `MAX_FILE_SIZE_BYTES`، `EXCEL_ALLOWED_EXT = /\.xlsx?$/i`؛ تحقق `file.size` ونوع الملف قبل القبول.
- `app/public/rewards/src/app.js` (و Rewards): `EXCEL_MAX_SIZE_BYTES = 10 * 1024 * 1024`، `EXCEL_ALLOWED_EXT`، رفض الملف إن تجاوز الحجم أو الامتداد غير مدعوم.

**النتيجة:** منجَز. التقييد مطبّق في التحليل والمكافآت.

---

## بند 3 — تحديث التقرير (CODE_REVIEW_REPORT.md)

**التحقق من الكود:**
- التقرير يذكر `handleTransferToRewards` وبناء الـ payload داخلها (قسم 6.2) — صحيح.
- الجدول وقسم 3.1 يذكران `adminConfig.ts` **س11، 12–15** للمفتاح والإيميلات. في الملف الحالي: المفتاح في **س14** (دالة env)، الإيميلات في **س15–17**. أي أن أرقام الأسطر في التقرير لا تطابق الملف الحالي (س11 كانت قبل إضافة دالة env).
- ذكر حجم app.js "حوالي 8,340 سطر" موجود في التقرير.

**النتيجة:** منجَز جزئياً. المحتوى صحيح؛ أرقام أسطر adminConfig تحتاج تصحيح إلى س14، 15–17 إن رُغب في دقة كاملة.

---

## بند 4 — .env.example وتوثيق

**التحقق من الكود:**
- وجود `app/.env.example` مع `VITE_ADMIN_SECRET_KEY` و `VITE_ADMIN_ALLOWED_EMAILS` و `VITE_FIREBASE_*`.
- `.gitignore` يحتوي `.env` و `.env.local` و `.env.*.local`.
- `adminConfig.ts` يشير إلى `.env.example` في التعليق.

**النتيجة:** منجَز.

---

## بند 5 — Checklist (DELIVERY-AND-AUDIT)

**التحقق:** وجود `app/docs/DELIVERY-AND-AUDIT.md` مع جدول البنود 1–9 وقسم "مطلوب من صاحب المشروع".

**النتيجة:** منجَز.

---

## بند 6 — فصل app.js إلى وحدات

**التحقق من الكود:**
- وجود `rewards-firebase.js`، `rewards-rbac.js`، `rewards-table.js` في `app/Rewards/src/` و `app/public/rewards/src/`.
- ترتيب التحميل في `index.html`: rewards-firebase → rewards-rbac → rewards-table → app-extensions → app.js.
- وجود `app/Rewards/README-MODULES.md` يوثّق الوحدات.

**كسور/تنفيذ متسرع اكتُشف لاحقاً (وتم إصلاحه في جلسات سابقة):**
- تعارض **"Identifier already been declared"**: بعد الفصل، `ADMIN_AUTH_SESSION_KEY` و `ADMIN_SESSION_MAX_AGE_MS` كانا معرّفين في كل من `rewards-rbac.js` و `app.js` (const في app.js يكرر var في rbac). تم حلّه بإزالة التعريف من app.js والاعتماد على rbac.
- **REWARDS_PRICING_STORAGE_KEY** معرّف في كل من `rewards-firebase.js` و `app.js` (var في الاثنين). لا يسبب خطأ تنفيذ (var يُعاد التصريح به) لكنه تكرار غير ضروري؛ يُفضّل أن يكون في ملف واحد فقط للوضوح.

**النتيجة:** البند منجَز؛ الفصل موجود وموثّق. تبِعت عليه أخطاء تعريف تم إصلاح جزء منها؛ يتبقى توحيد تعريف `REWARDS_PRICING_STORAGE_KEY` إن رُغب في نظافة الكود.

---

## بند 7 — SheetJS وتقييد xlsx

**التحقق من الكود:**
- `app/package.json`: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.
- `app/public/rewards/index.html`: سكربت من `cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` مع تعليق التحقق من الحجم والنوع.
- تقييد الحجم والنوع مُطبّق (بند 2).

**النتيجة:** منجَز.

---

## بند 8 — توحيد مسح الجلسة (keysToRemove)

**التحقق من الكود:**
- `app/public/clear-session.html`: مصفوفة واحدة `keysToRemove` تحتوي المفاتيح المطلوب مسحها؛ دالة واحدة `clearSessionKeys()` تُستدعى بعد signOut وفي الـ catch.
- القائمة تتضمن: adora_admin_auth_session، adora_current_*، adora_rewards_*، adora_analysis_*، adora_transfer_payload.

**النتيجة:** منجَز.

---

## بند 9 — pre-deploy-check

**التحقق من الكود:**
- وجود `app/scripts/pre-deploy-check.js`: يتحقق من .env، مفتاح الأدمن، shared/firebase-config.json، ويزود بخطوات يدوية.
- `package.json`: `"pre-deploy-check": "node scripts/pre-deploy-check.js"`؛ و `deploy` و `deploy:preview` يبدآن بـ `npm run pre-deploy-check`.

**النتيجة:** منجَز.

---

## البناء والكسر

- تم تشغيل `npm run build` من مجلد `app`: **نجح** (exit 0).
- لم يُلاحظ كسر واضح في المسارات أو الاستيراد من جراء تنفيذ المبرمج.

---

## توصيات مختصرة

1. **تقرير المراجعة:** تصحيح أرقام أسطر adminConfig في CODE_REVIEW_REPORT إلى س14، 15–17 ليطابق الملف الحالي.
2. **تعريف REWARDS_PRICING_STORAGE_KEY:** إبقاؤه في ملف واحد (مثلاً rewards-firebase.js) وإزالة التعريف من app.js لتفادي التكرار (اختياري لتحسين الوضوح).
3. **الثقة في التنفيذ:** البنود منجَزة في الكود؛ المراجعة تمت من الملفات الفعلية وليس من تقارير المبرمج فقط.

---

## مهمة: مصدر واحد لنافذة «شروط الحصول على المكافآت» (TASK-CONDITIONS-ONE-SOURCE)

**المرجع:** `app/docs/TASK-CONDITIONS-ONE-SOURCE.md`

### 1. مصدر واحد للمحتوى

**التحقق من الكود:**
- وجود **`app/shared/conditions-content.json`**: أقسام (bookings، vip، evaluations، challenge، bonuses، partners، discounts، cumulative) مع عناصر static/template و placeholders (مثل {{rateMorning}}، instructionsButton).
- **React:** استيراد `import conditionsContentSchema from '../shared/conditions-content.json'` واستخدام `CONDITIONS_SCHEMA` في ConditionsPopup و buildConditionsPrintHtml.
- **Rewards:** `getConditionsContentSchema(callback)` يحمّل عبر `fetch('shared/conditions-content.json')` مع كاش؛ `populateConditionsModalContent()` و `populatePrintConditionsInline()` و `printConditions()` تستخدم نفس الـ schema + `getPricingConfig()` عبر `buildConditionsModalHtml` و `buildConditionsPrintDocument`.
- **نسخ الملف لـ Rewards:** `app/Rewards/scripts/prepare-deploy.js` ينسخ `conditions-content.json` من `app/shared/` إلى `Rewards/public/shared/` مع `headerButtonsConfig.json`.

**النتيجة:** منجَز. المحتوى معرّف في مكان واحد؛ الطرفان يقرآن منه ويحقنان الأسعار (وVIP وزر التعليمات) دون تكرار النص.

### 2. مصدر واحد للشكل

**التحقق من الكود:**
- React: `THEME_CLASSES` (turquoise، amber، yellow، green، orange، red) وتنسيق الأقسام (wrap، title، bullet) مطابق لـ conditions-content.
- Rewards: `CONDITIONS_THEME_CLASSES` بنفس الـ themes؛ `buildConditionsModalHtml` يبني نفس البنية (div + h3 + ul + li) مع نفس كلاسات Tailwind (bg-*-500/10، border، rounded-xl، إلخ).
- النافذة في Rewards (conditionsModal في index.html): هيدر «شروط الحصول على المكافآت» + زر إغلاق + منطقة محتوى + أزرار طباعة وإغلاق. React ConditionsPopup: نفس الهيكل (هيدر، جسم، فوتر بإغلاق وطباعة).

**النتيجة:** منجَز. الشكل موحّد (نفس الأقسام ونفس الـ themes في التحليل والمكافآت).

### 3. سلوك موحد

**التحقق من الكود:**
- **فتح/إغلاق:** النقر على الـ overlay يغلق؛ زر × يغلق؛ نفس السلوك في الطرفين.
- **زر «او اضغط هنا»:** في الـ JSON بند بـ `placeholder: "instructionsButton"`؛ React يعرض زراً يفتح InstructionsPopup؛ Rewards يعرض زراً يستدعي `showInstructionsModal()`. ربط التعليمات محفوظ.
- **الطباعة:** React: `buildConditionsPrintHtml(config)` من نفس CONDITIONS_SCHEMA + config.rewardPricing؛ Rewards: `buildConditionsPrintDocument(pricing, schema)` من نفس المصدر. المحتوى المطبوع من مصدر واحد.

**النتيجة:** منجَز. السلوك موحّد (إغلاق، طباعة، ربط التعليمات).

### خلاصة مهمة الشروط

| المطلوب (TASK-CONDITIONS-ONE-SOURCE) | الحالة |
|--------------------------------------|--------|
| مصدر واحد للمحتوى (JSON + حقن أسعار/VIP) | منجَز |
| مصدر واحد للشكل (نفس النافذة والـ themes) | منجَز |
| سلوك موحد (فتح/إغلاق، طباعة، زر التعليمات) | منجَز |

التحقق تم من الكود الفعلي (conditions-content.json، App.tsx، Rewards app.js، prepare-deploy.js) وليس من تقارير.
