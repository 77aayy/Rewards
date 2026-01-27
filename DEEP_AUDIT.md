# فحص دقيق للمشروع — مكافآت فندق إليت

**التاريخ:** 27 يناير 2026  
**الهدف:** فحص منهجي بعد أن الفحص السابق (AUDIT_REPORT.md) لم يكتشف خلط جلسات الأدمن/الإداري والموظف. هذا التقرير يوثق ما فُتِش، ما وُجد، وما تم إصلاحه.

---

## 1. ما فاته الفحص السابق ولماذا

### 1.1 خلط الجلسات (Session / Identity Contamination)

**المشكلة:** عند التبديل بين «أدمن/إداري» و«موظف» على نفس المتصفح حدثت «لغبطه» في اليوزرات.

**السبب الجذري:** لم يُفحص بشكل صريح تدفق **هوية المستخدم** و**مصدر البيانات** عند كل نقطة دخول (Admin / RBAC / Employee)، ولا ماذا يحدث عند الخروج أو عند فتح رابط موظف بعد جلسة أدمن.

**ما كان يجب فحصه (ولم يُفحص بهذه الطريقة):**
- هل تُمسح مفاتيح جلسة الإداري (`adora_current_role/token/period`) عند الخروج؟
- هل عند الدخول كموظف تُطبَّق بيانات «الفترة الحية» من Firebase على localStorage (فتُستبدل بيانات الأدمن)؟
- هل بعد عرض تقرير الموظف من Firebase تبقى `db` و`employeeCodesMap` (وغيرها) في الذاكرة العامة فتؤثر على من يفتح لاحقاً كأدمن؟
- هل تقرير الموظف المُحمَّل من Firebase يقرأ الخصومات والفروع من **الفترة المغلقة** أم من localStorage؟

**الدرس:** في أي نظام يدعم أكثر من «هوية» أو «وضع» (أدمن، إداري، موظف) على نفس الأصل (نفس المتصفح)، يجب أن يكون الفحص يتتبع صراحة:
1. **من يقرأ/يكتب ماذا** في localStorage وفي الذاكرة العامة عند كل وضع.
2. **ماذا يُمسح أو يُستعاد** عند الخروج وعند دخول وضع آخر.
3. **مصدر الحقيقة** عند عرض واجهة كل وضع (محلي فقط، Firebase فقط، أو خليط مع احتمال خلط).

---

## 2. سيناريوهات التبديل التي تم تحليلها

| السيناريو | من → إلى | ما كان يحدث قبل الإصلاح | ما تم تغييره |
|-----------|----------|--------------------------|---------------|
| خروج أدمن/إداري | أدمن ← صندوق الرفع | بقاء `adora_current_role/token/period` في localStorage | مسحها في `returnToUpload()` |
| فتح رابط موظف بعد أدمن | أدمن ← ?code=XXX | تطبيق «الفترة الحية» على localStorage، ثم تحميل تقرير الموظف من Firebase مع بقاء `db`/`employeeCodesMap` بعد العرض | عدم تطبيق live وعدم استدعاء sync عند `isEmployeeMode()`؛ مسح `adora_current_*` في بداية `checkMobileEmployeeCode`؛ استعادة `db` و`employeeCodesMap` (و`branches` و`discounts`) بعد عرض التقرير عند التحميل من Firebase |
| تقرير الموظف من Firebase | موظف يفتح ?code=XXX | استخدام خصومات وفروع من **localStorage** (فترة الأدمن) في حساب التقرير | تعيين `discounts` و`branches` من `latestPeriod.data` قبل استدعاء `showEmployeeReport`، ثم استعادتهما مع `db` و`employeeCodesMap` بعد العرض |

---

## 3. خريطة قراءة/كتابة localStorage والحالة العامة

(ملخص للمسارات الحساسة بعد الإصلاحات.)

### 3.1 من يكتب في localStorage ومتى

| المفتاح / المجموعة | يُكتب من | يُمسح من |
|---------------------|----------|----------|
| `adora_rewards_db`, `_branches`, `_evalRate`, `_startDate`, `_periodText` | processData، applyLivePeriod، حفظ يدوي من الواجهة | `returnToUpload()` |
| `adora_rewards_discounts`, `_discountTypes` | واجهة الخصومات، applyLivePeriod | لا يُمسح في returnToUpload (بقصد) |
| `adora_rewards_employeeCodes` | حفظ الأكواد، applyLivePeriod | لا في returnToUpload |
| `adora_current_role`, `_token`, `_period` | doRbacThenInit، tryValidateAdminAccessFromFirebase | `returnToUpload()`، بداية `checkMobileEmployeeCode()`، و«تم ربط البيانات» (showAdminSubmittedScreen) |
| `adora_admin_tokens` | saveAdminTokens | لا عند الخروج العادي |
| `adora_archived_periods` | عند إغلاق الفترة | لا |

### 3.2 من يقرأ «الهوية» الحالية

- **مصدر «هل أنا إداري؟»:** `localStorage.getItem('adora_current_role')` في كثير من المواضع (واجهة الأدوار، الطباعة، إلخ).
- **مصدر «هل أنا أدمن؟»:** من الـ URL فقط (`isAdminMode()` = `?admin=ayman5255`).
- **مصدر «هل أنا موظف؟»:** من الـ URL فقط (`isEmployeeMode()` = وجود `?code=`).

لذلك أي بقاء لـ `adora_current_*` بعد انتهاء جلسة إداري يسبب خلطًا إذا فُسِّر على أنه «هوية حالية» دون مراعاة الـ URL.

### 3.3 الحالة العامة (window / globals) عند وضع الموظف

عند فتح ?code=XXX وتحميل التقرير من Firebase:

- **قبل عرض التقرير:** يتم تعيين `db`, `branches`, `employeeCodesMap`, `discounts` (و`window.db`, `window.discounts`) من `latestPeriod.data`.
- **بعد العرض (وأي return من ذلك المسار):** تُستعاد القيم الأصلية حتى لا تبقى «فترة الموظف» في الذاكرة وتؤثر على تاب أو جلسة لاحقة.

---

## 4. إصلاحات إضافية ناتجة عن هذا الفحص

### 4.1 خصومات وفروع تقرير الموظف من Firebase

- **المشكلة:** عند عرض تقرير موظف مُحمَّل من فترة مغلقة (Firebase) كان `calculateEmployeeReport` يقرأ الخصومات من `getDiscountForEmployeeInBranch` / `getDiscountDetailsForEmployee`، وهذه تعتمد على `window.discounts` أو المتغير العام `discounts` — الذي كان يبقى من تحميل أولي من localStorage (فترة الأدمن أو فترة أخرى).
- **النتيجة:** تقرير الموظف يعرض خصومات فترة خاطئة.
- **الإصلاح:** عند التحميل من Firebase في `checkMobileEmployeeCode` يتم تعيين `discounts` و`window.discounts` من `latestPeriod.data.discounts` قبل استدعاء `showEmployeeReport`، ثم استعادتهما مع باقي الحالة بعد العرض.

### 4.2 فروع تقرير الموظف من Firebase

- **المشكلة:** `calculateEmployeeReport` يبني `branchWinners` من `[...branches].forEach(...)`. عندما يُحمَّل التقرير من Firebase كانت `db` و`employeeCodesMap` تُحدَّثان من الفترة المغلقة، لكن `branches` تبقى من الذاكرة الأولى (فارغة أو من فترة أخرى).
- **النتيجة:** حساب الحوافز والجوائز حسب الفرع قد يكون خاطئاً أو فارغاً.
- **الإصلاح:** تعيين `branches` من `latestPeriod.data.branches` أثناء استخدام فترة Firebase، ثم استعادتها مع `db` و`employeeCodesMap` و`discounts` عند الانتهاء.

---

## 5. فحص منهجي لاحق — نقاط يُفضّل إدراجها في أي مراجعة قادمة

1. **قائمة «هوية/وضع» الدخول:**  
   لكل وضع (Admin، RBAC، Employee): من أين يُقرأ (URL، localStorage، Firebase)، وما الذي يُكتب في localStorage والذاكرة العامة عند الدخول والخروج.

2. **قائمة «مصدر الحقيقة» لكل شاشة:**  
   لكل واجهة مهمة (لوحة الأدمن، تقرير الموظف، إلخ): هل البيانات تُقرأ من localStorage فقط، من Firebase فقط، أو من كليهما؛ وهل يُفترض عزل كامل عن بيانات وضع آخر.

3. **مسارات التبديل:**  
   تحديد كل الانتقالات الممكنة بين الأوضاع (نفس التاب، تاب جديد، تحديث، روابط مشتركة) والتحقق من مسح/استعادة الحالة في كل مسار.

4. **تشغيل التحميل الأولي (أسطر 58–62 في app.js):**  
   `loadDiscounts()` و`loadDiscountTypes()` تُستدعى عند تحميل السكربت قبل معرفة الوضع. توثيق أنهما يملآن مخزناً قد يُستبدل لاحقاً في مسار الموظف، وعدم الاعتماد عليهما في حساب تقرير الموظف عند التحميل من Firebase.

---

## 6. ملخص الإصلاحات المطبقة في هذه الجلسة

| # | الملف | التعديل |
|---|--------|---------|
| 1 | app.js | في `returnToUpload()`: مسح `adora_current_role`, `adora_current_token`, `adora_current_period`. |
| 2 | app.js | في `doAppInit()`: عدم استدعاء `applyLivePeriod` وعدم استدعاء `syncLivePeriodToFirebase` عندما `isEmployeeMode()`. |
| 3 | app-extensions.js | في بداية `checkMobileEmployeeCode()`: مسح `adora_current_*` من localStorage. |
| 4 | app-extensions.js | عند التحميل من Firebase في `checkMobileEmployeeCode`: حفظ واستعادة `db`, `employeeCodesMap`, `branches`, `discounts` و`window.db`/`window.discounts`؛ وتعيين `discounts` و`branches` من `latestPeriod.data` قبل عرض التقرير. |

---

## 7. الخلاصة

- **سبب عدم اكتشاف المشكلة في الفحص السابق:** تركيز AUDIT_REPORT على البنية العامة، التخزين، والأمان، دون تتبع صريح لتدفق «الهوية» و«مصدر البيانات» لكل وضع مستخدم وعند التبديل بين الأوضاع.
- **ما يوفره هذا الفحص الدقيق:** خريطة مبدئية لقراءة/كتابة localStorage والحالة العامة، سيناريوهات التبديل، وإصلاحات تستهدف عزل وضع الموظف عن وضع الأدمن/الإداري ومنع استخدام بيانات فترة خاطئة في تقرير الموظف المُحمَّل من Firebase.

يُوصى باعتماد «قائمة هوية/وضع ومصدر الحقيقة» و«مسارات التبديل» كجزء ثابت من أي مراجعة أو فحص تقني لاحق للمشروع.
