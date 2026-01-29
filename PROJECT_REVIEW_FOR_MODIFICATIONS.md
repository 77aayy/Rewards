# مراجعة المشروع — مرجع قبل طلب التعديلات

**تاريخ المراجعة:** 2025-01-29  
**المشروع:** مكافآت فريق عمل فندق إليت (Rewards)  
**الغرض:** مرجع سريع للبنية والتدفقات والملفات الحرجة قبل أي تعديلات.

---

## 1. هوية المشروع والتقنيات

| البند | القيمة |
|-------|--------|
| **الاسم** | مكافآت فريق عمل فندق إليت |
| **النوع** | تطبيق ويب SPA (Vanilla JS) — **ليس React** |
| **التقنيات** | HTML + Vanilla JS + Tailwind (CDN في التطوير، مُبنى في dist) + Firebase Storage + localStorage |
| **الاستضافة** | Firebase Hosting (`rewards-63e43.web.app`) |
| **المصادر الرئيسية** | `index.html`, `src/app.js`, `src/app-extensions.js`, `src/styles.css`, `src/discount-clauses-55.js` |

---

## 2. هيكل الملفات والتبعيات

### ترتيب تحميل السكربتات (لا تغيّره بدون تحليل)

1. `discount-clauses-55.js` — بنود التعليمات/أنواع الخصم  
2. **`app-extensions.js`** — يُحمّل **قبل** app.js (app.js يعتمد على دواله)  
3. **`app.js`** — المنطق الرئيسي، RBAC، رفع الملف، renderUI، الإحصائيات  

### التبعيات الحرجة

- **app.js يعتمد على app-extensions:**  
  `loadAdminTokens`, `validateAdminAccess`, `tryValidateAdminAccessFromFirebase`, `initializeRoleBasedUI`, `loadDiscounts`, `loadDiscountTypes`, `fetchLivePeriodFromFirebase`, `applyLivePeriod`, `syncLivePeriodToFirebase`, وجميع دوال الواجهة (مثل `showAdminManagementModal`, `showReportsPage`, `showDiscountsModal`, `showClosePeriodModal`, …).
- **app-extensions يعتمد على app.js/الواجهة:**  
  المتغيرات العامة `db`, `branches`, `reportStartDate`, `currentEvalRate`, `employeeCodesMap`, `discounts` (أو ما يُقرأ من `window.db` / localStorage)، ودوال مثل `renderUI`, `updateFooterTotals`, `returnToUpload`, `showToast`.

---

## 3. التخزين والبيانات

### localStorage (مفاتيح adora_rewards_* و adora_*)

| المفتاح | المحتوى |
|---------|---------|
| `adora_rewards_db` | مصفوفة الموظفين (الجدول الرئيسي) |
| `adora_rewards_branches` | أسماء الفروع |
| `adora_rewards_evalRate` | معدل التقييم |
| `adora_rewards_startDate` | بداية الفترة |
| `adora_rewards_periodText` | نص الفترة |
| `adora_rewards_employeeCodes` | خريطة أكواد الموظفين `{ اسم: كود }` |
| `adora_rewards_discounts` | مصفوفة الخصومات |
| `adora_rewards_discountTypes` | أنواع الخصومات |
| `adora_admin_tokens` | روابط الأدوار لكل فترة |
| `adora_archived_periods` | نسخة احتياطية من الفترات المغلقة |
| `adora_current_role/token/period` | جلسة الدخول برابط إداري |

### Firebase Storage

- **الفترة الحية:** `periods/live.json` — آخر وضع يُرفع عند كل حفظ؛ يُحمّل عند فتح التطبيق ثم يُكمّل من localStorage.
- **الفترات المغلقة:** `periods/{periodId}.json` — عند إغلاق الفترة.
- **روابط الإداريين:** `admin_tokens/{periodId}.json` — للتحقق من الرابط على جهاز الإداري.

### قواعد التخزين (storage.rules)

- القراءة مفتوحة.
- الكتابة: حجم ≤ 5MB و `contentType == 'application/json'` فقط.

---

## 4. تدفق التهيئة (لا تكسرها)

1. **تحويل المسار إلى query:**  
   `/supervisor/TOKEN/2026_01` → `?role=supervisor&token=TOKEN&period=2026_01`  
   `/e/كود` → `?code=كود`
2. **doRbacThenInit():**
   - إن وُجدت `role` و `token` و `period`: تحميل `loadAdminTokens`، ثم `validateAdminAccess`؛ إن صحيح → حفظ الجلسة ثم `doAppInit()`.
   - إن فشل التحقق المحلي: محاولة `tryValidateAdminAccessFromFirebase`؛ إن نجح → إعادة تحميل الصفحة.
   - إن فشل كل التحققات: عرض "رابط الإداري لا يفتح".
3. **doAppInit():**
   - جلب الفترة الحية من Firebase (`fetchLivePeriodFromFirebase`) إن وُجدت وتطبيقها (`applyLivePeriod`).
   - ثم `loadDataFromStorage()` (تحميل من localStorage، وتحميل الخصومات وأنواعها).
   - تشغيل `syncLivePeriodToFirebase` و `startLivePeriodPolling`.
   - إن كان دخولاً برابط إداري: `initializeRoleBasedUI(role)`.

---

## 5. تدفق رفع الملف ومعالجة البيانات

1. **رفع Excel:** من `#fileInput` → XLSX → استخراج التواريخ ("التاريخ من" / "التاريخ الي") والصفوف (إليت + فرع + حجوزات ≥ 10).
2. **processData(rows):**
   - يبني `newEmployees` من الملف.
   - يقرأ `adora_rewards_db` → `oldDb`.
   - لكل موظف جديد: إن وُجد في oldDb (نفس الاسم+الفرع) يُحدَّث **فقط** `count` و `employeeCode`؛ الباقي يُحفَظ كما هو. إن لم يُوجد يُضاف صف جديد.
   - من في oldDb ولا يوجد في الملف يُستبعد من `db`.
   - **الخصومات** لا تُمس عند رفع ملف جديد.
3. بعد processData: حفظ في `db`, localStorage, `window.db`، ثم `renderUI`، `updateFooterTotals`، ورفع الفترة الحية إلى Firebase.

---

## 6. الأدوار (RBAC)

| الدور | المفتاح | الصلاحيات |
|-------|---------|-----------|
| Admin | `?admin=ayman5255` | كامل الصلاحيات |
| المشرف | supervisor | تقييمات بوكينج/جوجل في الفروع |
| HR | hr | 26 يوم + أيام الحضور في الفروع |
| الحسابات | accounting | عرض وطباعة فقط |
| المدير العام | manager | إحصائيات فقط |

- مفتاح الأدمن **ظاهر في الكود** (`app.js` — `ADMIN_SECRET_KEY`). راجع SECURITY.md وتقرير التدقيق قبل النشر.

---

## 7. نقاط حساسة (لا تكسرها عند التعديل)

1. **عزل الجلسات:**  
   عند خروج أو دخول موظف (?code=XXX): مسح `adora_current_role`, `adora_current_token`, `adora_current_period`؛ عند دخول موظف لا تُطبَّق الفترة الحية من Firebase على localStorage (لئلا تُستبدل بيانات الأدمن).
2. **تزامن `db`:**  
   أي تحديث لـ `db` يحتاج تحديث `window.db` لأن دوال app-extensions تعتمد على `window.db` أو localStorage.
3. **الموظفون المتكررون (نفس الاسم في أكثر من فرع):**  
   في عرض "الكل" يُجمَّع حسب الاسم؛ الخصومات تُطبَّق نسبةً على صافي كل فرع ثم تُجمع.
4. **ملف الفترة الواحدة:**  
   `periods/live.json` واحد لجميع الأجهزة — آخر رفع يكتسب (لا دمج تلقائي).

---

## 8. البناء والنشر

- **بناء:** `npm run build` — يشغّل Tailwind CLI ويُنتج `dist/tailwind.css`، ينسخ الملفات الثابتة، يستبدل CDN Tailwind في index.html بـ `link` لـ `/tailwind.css`.
- **Service Worker:** عند تعديل `service-worker.js` غيّر ثابت `CACHE_NAME` (مثلاً إلى `elite-rewards-v5`) ثم انشر؛ وإلا قد يبقى المستخدمون على نسخة كاش قديمة.
- **قواعد التخزين:** بعد تعديل `storage.rules` نفّذ `firebase deploy --only storage`.

---

## 9. تقارير التدقيق والمتبقيات

- **AUDIT_ISSUES_REPORT.md:** يلخص مشاكل تم إصلاحها (إجماليات التذييل، كروت الإحصائيات، صافي الحجوزات بدون تقييم، تحديث نص الفترة بعد الـ polling) ومتبقيات (مفتاح الأدمن، كروت الفائزين عند «الكل»، تحميل الخصومات، مصدر الإجماليات، توثيق سلوك الملف الواحد).
- **PROJECT_UNDERSTANDING.md:** وثيقة فهم البنية والتدفق والمسؤوليات (app.js vs app-extensions vs index.html).

### 9.1 متابعة المراجعة (حالة النقاط المتبقية)

| النقطة | الحالة | التفاصيل |
|--------|--------|----------|
| **تحميل الخصومات** | ✅ مصدر واحد | تُحمّل الخصومات وأنواعها **فقط** داخل `loadDataFromStorage()` (لا استدعاء آخر عند التهيئة). |
| **مصدر إجماليات التذييل** | ✅ مصدر واحد | `updateFooterTotals()` تستدعي `getFooterTotals()` فقط؛ التذييل وكروت الإحصائيات تُحدَّث من هذا المصدر. |
| **كروت الفائزين عند «الكل»** | ✅ مُجمّعة بالاسم | في `app.js`: عند `filter === 'الكل'` تُحسب الفائزون من إجماليات مُجمّعة لكل اسم (`nameAgg` / `bestAggNetName`، `bestAggEvalName`، `bestAggBookName`) وليس من «أعلى صف» فقط. |
| **مفتاح الأدمن** | ⚠️ موثّق | المفتاح في `app.js`؛ تغييره قبل النشر وإجراءات الأمان موثّقة في **SECURITY.md** (قسم «مفتاح الأدمن»). |
| **ملف الفترة الحية** | ⚠️ موثّق | `periods/live.json`: آخر رفع يكتسب (لا دمج تلقائي بين أجهزة متعددة) — موثّق في §3 و §7 أعلاه. |

---

## 10. مرجع سريع: أين أعدّل؟

| المطلوب | الملف / الموقع |
|---------|-----------------|
| منطق RBAC، رفع الملف، processData، renderUI، التذييل، الفلاتر | `src/app.js` |
| إدارة الإداريين، الخصومات، إغلاق الفترة، التقارير، الفترات المغلقة، الإحصائيات، Firebase الفترة الحية | `src/app-extensions.js` |
| هيكل الصفحة، النوافذ المنبثقة، الأزرار | `index.html` |
| الألوان، الطباعة، التنسيق | `src/styles.css` |
| بنود التعليمات / أنواع الخصم | `src/discount-clauses-55.js` |
| قواعد التخزين | `storage.rules` |
| كاش والـ PWA | `service-worker.js` |
| بناء وإنتاج dist | `scripts/build.js` |

---

*استخدم هذا الملف كمرجع قبل طلب أي تعديلات؛ يقلل كسر التبعيات والتدفقات.*
