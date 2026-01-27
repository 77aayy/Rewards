# فهم مشروع مكافآت فندق إليت

وثيقة مرجعية لفهم البنية والميزات والتدفق قبل التعديلات والفحوصات.

---

## 1. هوية المشروع

- **الاسم:** مكافآت فريق عمل فندق إليت
- **النوع:** تطبيق ويب (SPA) لإدارة مكافآت الموظفين
- **البنية:** Vanilla JS + HTML + Tailwind + Firebase Storage
- **المصادر:** `index.html`، `src/app.js`، `src/app-extensions.js`، `src/styles.css`
- **الاستضافة:** Firebase Hosting (`rewards-63e43.web.app`)

---

## 2. الدخول والأمان

### أوضاع الدخول

| الوضع | المعيار | مثال URL |
|-------|---------|----------|
| **Admin** | `?admin=ayman5255` | كامل الصلاحيات |
| **موظف (تقرير)** | `?code=XXXX` | عرض تقرير الموظف بالكود |
| **أدوار إدارية (RBAC)** | `?role=xxx&token=xxx&period=xxx` | صلاحيات محددة |

### الأدوار (RBAC)

| الدور | المفتاح | الصلاحيات |
|-------|---------|-----------|
| المشرف | supervisor | يرى الكل + كل فرع؛ الكل للعرض فقط، إدخال التقييمات في الفروع فقط |
| HR | hr | يرى الكل + كل فرع؛ الكل للعرض فقط، تم/لم يتم وأيام المتكررين في الفروع فقط |
| الحسابات | accounting | عرض الكل/الأندلس/الكورنيش + تقارير وطباعة – بدون تعديل |
| المدير العام | manager | عرض تبويب الإحصائيات فقط |
| Admin | admin | كامل الصلاحيات |

- الرابط الإداري: يُولد من **إدارة الإداريين** أو **الأكواد**، ومرتبط بـ `periodId`.
- بعد **إغلاق الفترة**: `deactivatePeriodTokens(periodId)` يوقف روابط هذه الفترة.

---

## 3. مصدر البيانات والتخزين

### التخزين المحلي (localStorage)

| المفتاح | المحتوى |
|---------|---------|
| `adora_rewards_db` | مصفوفة الموظفين (الجدول الرئيسي) |
| `adora_rewards_branches` | مصفوفة أسماء الفروع |
| `adora_rewards_evalRate` | معدل التقييم (ثابت حالياً) |
| `adora_rewards_startDate` | بداية الفترة |
| `adora_rewards_periodText` | نص الفترة (مثل "من 01-01-2026 إلى 25-01-2026") |
| `adora_rewards_employeeCodes` | خريطة أكواد الموظفين `{ اسم: كود }` |
| `adora_rewards_discounts` | مصفوفة الخصومات |
| `adora_rewards_discountTypes` | أنواع الخصومات |
| `adora_admin_tokens` | روابط الأدوار لكل فترة |
| `adora_archived_periods` | نسخة احتياطية من الفترات المغلقة (إلى جانب Firebase) |
| `adora_current_role/token/period` | الجلسة الحالية عند الدخول برابط دور إداري |

### Firebase Storage

- **المسار:** `periods/{periodId}.json` للفترات المغلقة؛ `periods/live.json` للفترة الحية (آخر وضع).
- **الفترة الحية (مزامنة بين الأجهزة):**
  - عند كل حفظ (رفع ملف، تقييمات، حضور، أيام متكررين، خصومات) يُرفع آخر وضع إلى `periods/live.json`.
  - عند فتح التطبيق يُحمَّل من `periods/live.json` إن وُجد؛ إن احتوى على بيانات صالحة تُطبَّق ثم يُكمَل التحميل من localStorage.
  - النتيجة: أي جهاز يفتح التطبيق يرى آخر وضع محفوظ من أي جهاز آخر.
- **إغلاق الفترة:** يُرفع ملف `periods/{periodId}.json` يحتوي: `db`, `branches`, `employeeCodes`, `discounts`, `discountTypes`, وتواريخ الفترة.
- **النسخ الاحتياطي:** نفس الفترات تُخزَّن أيضاً في `adora_archived_periods`.

---

## 4. هيكل بيانات الموظف (عنصر في `db`)

```js
{
  id: "uuid",
  name: "اسم الموظف",
  branch: "الكورنيش" | "الأندلس",
  count: 123,                    // عدد الحجوزات
  employeeCode: "1234",
  evaluationsBooking: 5,         // تقييمات بوكينج
  evaluationsGoogle: 3,          // تقييمات جوجل
  attendance26Days: true|false,  // تم إكمال 26 يوم
  totalAttendanceDays: 28,
  attendanceDaysPerBranch: { "الكورنيش": 15, "الأندلس": 13 }  // للمتكررين
}
```

- **موظف متكرر:** نفس `name` في أكثر من فرع (صفوف منفصلة في `db`).

---

## 5. تدفق العمل الرئيسي

### 5.1 الرفع والدمج

1. **رفع Excel:** من `#fileInput` → قراءة بـ XLSX → استخراج:
   - التواريخ من "التاريخ من" / "التاريخ الي" → `reportStartDate`, `periodText`
   - الموظفين من صفوف تحتوي "إليت" + اسم فرع (الكورنيش/الأندلس) + عدد حجوزات ≥ 10
2. **processData(rows):**
   - يبني `newEmployees` من الملف.
   - يقرأ `adora_rewards_db` → `oldDb`.
   - لكل موظف جديد:
     - إن وُجد في `oldDb` (نفس الاسم+الفرع): يُحدَّث **فقط** `count` و`employeeCode`، ويُحفَظ الباقي **كما هو** (تقييمات، تم/لم يتم، أيام المتكررين، totalAttendanceDays، attendance26Days، attendanceDaysPerBranch، إلخ) — لا إعادة حساب.
     - إن لم يُوجد: يُضاف صف جديد بكل الحقول الافتراضية.
   - من في `oldDb` ولا يوجد في الملف يُستبعد من `db`.
   - **الخصومات:** `adora_rewards_discounts` لا تُمس أبداً عند رفع ملف جديد؛ تبقى مرتبطة باسم الموظف حتى إغلاق الفترة.
   - الناتج النهائي يُحفَظ في `db` و `localStorage` و `window.db`.

### 5.2 حسابات الصافي والحوافز

**أساس الصافي لكل فرع:**

- معدل الحجوزات: `count > 100 → 3`، `count > 50 → 2`، غير ذلك `1`.
- إجمالي أساسي: `gross = (count * rate) + (evaluationsBooking * 20) + (evaluationsGoogle * 10)`.
- نسبة العمال: `fund = gross * 0.15`.
- صافي أساسي: `net = gross - fund`.
- حافز الحضور: إن `attendance26Days === true` → `net += net * 0.25`.

**حوافز إضافية (على مستوى الفرع):**

- **حافز تفوق (50):** الأكثر حجوزات **و** الأكثر تقييم بوكينج في نفس الفرع.
- **حافز التزام (50):** إكمال 26 يوم **و** الأكثر أيام حضور في الفرع **و** (الأكثر تقييماً أو الأكثر حجوزات).

**الخصومات:**

- تُطبق من مصفوفة `discounts` حسب `employeeName` ونسبة مئوية.
- للمتكررين: تُحسب نسبة الخصم من صافي **كل فرع** ثم تُجمع (لا تُطبَّق مرة واحدة على المجموع).

---

## 6. واجهة المستخدم الرئيسية

### 6.1 بعد الرفع (لوحة التحكم)

- **فلتر الفروع:** الكل | الأندلس | الكورنيش.
- **جدول الموظفين:** أعمدة الاسم، الفرع، الحجوزات، تقييم بوكينج، تقييم جوجل، 26 يوم، أيام الحضور، الصافي، تحديد.
- **كروت إحصائية:** عدد الموظفين، إجمالي الحجوزات، إجمالي المستحقات، تفوق، التزام، إلخ.

### 6.2 أزرار الهيدر (عند ظهور `#actionBtns`)

- إدارة الإداريين، خروج، طباعة المحدد، طباعة الكل، شروط المكافآت، التقارير، الخصومات، إغلاق الفترة.

### 6.3 التقارير (`showReportsPage()`)

- **تبويبات:** التقارير الحالية | الفترات المغلقة | الإحصائيات.
- **التقارير الحالية:** شبكة موظفين حسب الفرع، ضغط الاسم يفتح تقرير الموظف (أو اختيار فرع للمتكررين).
- **الفترات المغلقة:** قائمة فترات من Firebase/localStorage، عند الاختيار يُعرض جدول تقاريرهم.
- **الإحصائيات:** إحصائيات الفترة الحالية من `db` + جدول أداء الموظفين + إحصائيات الفترات المغلقة (كروت منفصلة لكل فترة).

### 6.4 الخصومات

- اختيار موظف، نوع خصم، نسبة (15–50٪)، تاريخ الحدث.
- الحفظ في `discounts` و `adora_rewards_discounts`.
- للعرض والحساب: `getDiscountForEmployeeInBranch`, `getTotalDiscountForEmployee`, `getDiscountDetailsForEmployee`.

### 6.5 إغلاق الفترة

- **confirmClosePeriod():**
  - يُنشئ `periodData` (يشمل `db`, `branches`, `employeeCodes`, `discounts`, `discountTypes` + تواريخ).
  - رفع إلى `periods/{periodId}.json` في Firebase.
  - حفظ نسخة في `adora_archived_periods`.
  - استدعاء `deactivatePeriodTokens(periodId)`.
  - ثم `returnToUpload()` لمسح الشاشة والعودة لصندوق الرفع.

---

## 7. تقسيم الملفات والمسؤوليات

### واجهة التبعيات (app.js ↔ app-extensions.js)

- **ترتيب التحميل في index.html:** `app-extensions.js` ثم `app.js` — لأن app.js يعتمد على دوال معرّفة في app-extensions.
- **ما يستدعيه app.js من app-extensions:**  
  `loadAdminTokens`, `validateAdminAccess`, `tryValidateAdminAccessFromFirebase`, `initializeRoleBasedUI`, `loadDiscounts`, `loadDiscountTypes`, `fetchLivePeriodFromFirebase`, `applyLivePeriod`, `syncLivePeriodToFirebase`, وكل دوال الواجهة المُربوطة بـ `onclick` في الـ HTML (مثل `showAdminManagementModal`, `showReportsPage`, `showDiscountsModal`, `showClosePeriodModal`, …).
- **ما يعتمد عليه app-extensions من app.js / الواجهة:**  
  المتغيرات العامة `db`, `branches`, `reportStartDate`, `currentEvalRate`, `employeeCodesMap`, `discounts` (أو ما يُقرأ من `window.db` / localStorage)، ودوال مثل `renderUI`, `updateFooterTotals`, `returnToUpload`, `showToast`, وتهيئة Firebase عبر `window.storage`.

### app.js

- فحص RBAC من الـ URL، والتحقق من الأدوار.
- تهيئة Firebase، تحميل/مسح بيانات localStorage.
- معالجة رفع الملف: استخراج التواريخ، استدعاء `processData`.
- `processData`، `renderUI`، `updateFooterTotals`، حسابات الفائزين والحوافز.
- التعديلات: `updateEvalBooking`, `updateEvalGoogle`, `updateAttendance`, `updateAttendanceDaysForBranch`.
- الفلترة والطباعة: `setFilter`, `smartPrint`, `generatePrintHTML`, `performPrint`.
- التقارير: `showReportsPage`, `hideReportsPage`, `populateReportsPage`, `handleEmployeeNameClick`, `calculateEmployeeReport`, `showEmployeeReport`, `printEmployeeReport`.
- الأدوار: `initializeRoleBasedUI`, `hideElementsForSupervisor/HR/Accounting/Manager`, `showRoleWelcomeMessage`.
- عرض الشروط، إشعارات الـ Toast.

### app-extensions.js

- إدارة الروابط والأدوار: `adminTokens`, `loadAdminTokens`, `saveAdminTokens`, `initializeAdminTokensForPeriod`, `validateAdminAccess`, `deactivatePeriodTokens`, `logAdminAction`.
- واجهة الإداريين: `showAdminManagementModal`, `populateAdminManagementModal`, `copyAdminLink`, `regenerateAdminToken`.
- إغلاق الفترة والأرشفة: `showClosePeriodModal`, `confirmClosePeriod`.
- أكواد الموظفين: `showEmployeeCodesModal`, ربط الأكواد بروابط الأدوار.
- وضع الموظف (كود): `checkMobileEmployeeCode`, `showMobileEmployeeReport`, `sendWhatsAppMessage`.
- تبويبات التقارير: `switchReportsTab` (حالي، مغلق، إحصائيات).
- الفترات المغلقة: `loadArchivedPeriodsList`, `loadArchivedPeriod`, `populateArchivedReportsGrid`.
- الخصومات: `loadDiscounts`, `saveDiscounts`, `getDiscountForEmployeeInBranch`, `getTotalDiscountForEmployee`, `addDiscount`, `deleteDiscount`, نوافذ الخصومات وأنواعها.
- الإحصائيات: `loadStatisticsPage`, `loadCurrentPeriodStats`, `populateEmployeePerformanceTable`, `loadArchivedStatsPeriodsList`, `loadArchivedPeriodStatsForDisplay`, `calculatePeriodStats`.

### index.html

- هيكل الصفحة: رأس، صندوق الرفع، لوحة التحكم، الجدول، الفلاتر، تذييل الطباعة.
- النوافذ المنبثقة: شروط المكافآت، التقارير (ومحتوى تبويباتها)، الخصومات، أنواع الخصومات، إدارة الإداريين، إغلاق الفترة، أكواد الموظفين، تقرير الموظف.
- جلب السكربتات: `app.js` ثم `app-extensions.js`.

### styles.css

- متغيرات الألوان والثيم.
- إخفاء أعمدة (مثل الفئة، نسبة العمال) في الشاشة وإظهارها في الطباعة.
- قواعد خاصة بالإحصائيات: `#statisticsReportsContent:not(.hidden)`, `#currentPeriodStats`.
- تنسيق النوافذ والجدول والكروت والطباعة.

---

## 8. نقاط حساسة للتعديلات والفحوصات

0. **عزل جلسات الأدمن/الإداري والموظف (تفادي اللغبطه عند التبديل):**
   - عند **خروج** (returnToUpload): تُمسح `adora_current_role`, `adora_current_token`, `adora_current_period` حتى لا تبقى جلسة إداري في المتصفح.
   - عند **الدخول كموظف** (?code=XXX): تُمسح نفس المفاتيح من localStorage، ولا تُطبَّق بيانات «الفترة الحية» من Firebase على localStorage (لئلا تُستبدل بيانات الأدمن المحلية). بعد عرض تقرير الموظف المُحمَّل من Firebase تُستعاد `db`, `employeeCodesMap`, `branches`, `discounts` (و`window.db`/`window.discounts`) للحالة السابقة حتى لا تبقى بيانات الفترة المغلقة في الذاكرة عند التبديل لاحقاً. **وقبل** عرض التقرير عند التحميل من Firebase تُسنَد `discounts` و`branches` من بيانات الفترة المغلقة حتى لا يُستخدم خصم أو فرع من فترة أخرى (localStorage).

1. **تزامن `db`:**
   - أي تحديث لـ `db` يحتاج تحديث `window.db` إن وُجد، لأن دوال الإحصائيات والخصومات في `app-extensions.js` تعتمد على `window.db` أو localStorage.

2. **المتكررون (نفس الاسم في أكثر من فرع):**
   - في عرض "الكل": تجميع الحجوزات والتقييمات والصافي حسب الاسم.
   - الخصومات تُطبق نسبةً على صافي كل فرع ثم تُجمع.
   - أيام الحضور من `attendanceDaysPerBranch` أو `totalAttendanceDays`.

3. **الإحصائيات:**
   - الفترة الحالية: من `db` (أو `window.db` / localStorage) عبر `loadCurrentPeriodStats` و `populateEmployeePerformanceTable`.
   - يجب أن يكون `#statisticsReportsContent` ظاهراً (إزالة `hidden` وتأكيد الـ CSS) عند اختيار تبويب الإحصائيات.

4. **الطباعة:**
   - ختم الاعتماد وعناصر الطباعة تظهر بـ `print-only` أو داخل `generatePrintHTML` ولا تظهر في الواجهة العادية.

5. **إغلاق الفترة:**
   - يمسح الشاشة ويُعيد لصندوق الرفع؛ لا يمسح الخصومات أو الأكواد أو الروابط إلا عبر منطق `deactivatePeriodTokens` للفترة المغلقة فقط.

---

## 9. أوامر التشغيل والنشر

```bash
# تشغيل محلي
cd c:\Users\77aay\Desktop\attia\Rewards
python -m http.server 8000

# نشر Firebase
firebase use rewards-63e43
firebase deploy --only hosting

# Git
git add .
git commit -m "..."
git push origin main
```

### تنبيهات عند النشر

- **قواعد التخزين:** بعد أي تعديل على `storage.rules` نفّذ: `firebase deploy --only storage` حتى تُطبَّق القواعد الجديدة.
- **Service Worker:** عند تعديل `service-worker.js` يجب تغيير ثابت `CACHE_NAME` داخل الملف (مثلاً `elite-rewards-v4`) ثم النشر؛ وإلا قد يبقى المستخدمون على نسخة كاش قديمة.

---

*آخر تحديث: بناءً على فهم الكود الحالي في المشروع.*
