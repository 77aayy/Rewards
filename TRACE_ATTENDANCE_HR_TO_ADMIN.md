# تتبع ربط مدخلات HR (أيام الحضور) بالظهور في الأدمن

مسار كامل من إدخال HR حتى ظهور القيمة في عرض "الكل" / الأدمن.

---

## مثال التتبع

- **الموظف:** محمد عطية (متكرر: أندلس + كورنيش)
- **الفرع الحالي:** الأندلس
- **الإدخال:** 22 يوم حضور في حقل "أيام الحضور"

---

## 1. مصدر القيمة المعروضة في الحقل (عرض الفرع)

**الملف:** `src/app.js`  
**الموقع:** داخل قالب خلية الحضور (عرض الفرع للمتكرر)، ~سطر 3686–3710.

عند رسم الصف لموظف متكرر في **عرض فرع** (مثلاً فلتر "الأندلس"):

```javascript
const branchDays = emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[emp.branch]
  ? emp.attendanceDaysPerBranch[emp.branch]
  : '';
// ...
'value="' + branchDays + '" '
```

- **المصدر:** `emp.attendanceDaysPerBranch[emp.branch]` من نفس صف الموظف في `db`.
- للمتكررين كل الصفوف بنفس الاسم تشترك في **نفس كائن** `attendanceDaysPerBranch` (يُطبَّع في `normalizeDuplicateAttendance` ويُحدَّث في `updateAttendanceDaysForBranch`).

---

## 2. عند الكتابة (oninput)

**الدالة:** `handleAttendanceDaysInputSingle(inputElement, empName, branchName)`  
**الموقع:** ~سطر 1621.

| الخطوة | الكود / السلوك |
|--------|-----------------|
| 1 | `value = inputElement.value` ثم إزالة غير الأرقام. |
| 2 | `updateAttendanceDaysForBranch(empName, branchName, numValue, false)` — التحديث فوري، `shouldRender = false` حتى لا يُعاد رسم الجدول (لا فقدان تركيز). |
| 3 | استعادة موضع المؤشر بعد التحديث. |

النتيجة: البيانات في الذاكرة (`db`) تتحدث مع كل ضغطة، والواجهة لا تُعاد رسمها بالكامل.

---

## 3. عند الخروج من الحقل (onblur)

**الدالة:** `handleAttendanceDaysBlur(inputElement, empName, branchName)`  
**الموقع:** ~سطر 1649.

| الخطوة | الكود / السلوك |
|--------|-----------------|
| 1 | تطبيع النص: أرقام فقط، ثم `numValue = parseInt(value, 10) \|\| 0`. |
| 2 | قراءة القيمة القديمة من `first.attendanceDaysPerBranch[branchName]` (للتسجيل). |
| 3 | `updateAttendanceDaysForBranch(empName, branchName, numValue, false)` — تأكيد القيمة النهائية. |
| 4 | `patchAttendanceRowDisplay(inputElement, empName)` — تحديث **نفس الصف** فقط (تم/لم يتم، الـ checkbox، ونص "المجموع" إن وُجد). |
| 5 | `logAdminAction(...)` إن وُجد. |

النتيجة: بعد الـ blur تكون البيانات محفوظة والعرض في نفس الصف محدَّث.

---

## 4. تحديث البيانات للموظف المتكرر

**الدالة:** `updateAttendanceDaysForBranch(empName, branchName, days, shouldRender)`  
**الموقع:** ~سطر 1692.

| الخطوة | الكود / السلوك |
|--------|-----------------|
| 1 | التحقق من الصلاحية: `hr` أو `admin` فقط. |
| 2 | إذا `currentFilter === 'الكل'` → رفض التعديل (التعديل من الفروع فقط). |
| 3 | `employeesWithSameName = db.filter(emp => emp.name === empName)` — كل الصفوف بنفس الاسم. |
| 4 | بناء `sharedMap` من `attendanceDaysPerBranch` الحالية لجميع تلك الصفوف (دمج كل الفروع). |
| 5 | `sharedMap[branchName] = days` — تحديث فرع الإدخال فقط. |
| 6 | `totalDays = sum(sharedMap)` ثم لكل صف في `employeesWithSameName`: `emp.attendanceDaysPerBranch = sharedMap`, `emp.totalAttendanceDays = totalDays`, `emp.attendance26Days = (totalDays >= 26)`. |
| 7 | `localStorage.setItem('adora_rewards_db', JSON.stringify(db))` و `window.db = db`. |
| 8 | `syncLivePeriodToFirebase()` (مع debounce) لرفع النسخة الحالية. |
| 9 | إذا `shouldRender === true` → `renderUI(currentFilter)` (في الـ blur نمرّر `false` فلا إعادة رسم هنا). |

النتيجة: كل صفوف "محمد عطية" (أندلس + كورنيش) تشترك في نفس الخريطة؛ تحديث الأندلس = 22 يظهر فوراً في البيانات لجميع صفوفه.

---

## 5. تحديث عرض نفس الصف بعد الـ blur

**الدالة:** `patchAttendanceRowDisplay(inputElement, empName)`  
**الموقع:** ~سطر 1668.

| الخطوة | الكود / السلوك |
|--------|-----------------|
| 1 | `row = inputElement.closest('tr')`, `firstEmp = db.filter(e => e.name === empName)[0]`. |
| 2 | `totalDays = sum(Object.values(firstEmp.attendanceDaysPerBranch))` — من الخريطة المشتركة. |
| 3 | `done26 = (totalDays >= 26)`. |
| 4 | تحديث عناصر **نفس الصف** فقط: `.attendance-toggle` (checked)، `.col-attendance .attendance-indicator span` (نص "تم" أو "لم يتم" + لون)، وإن وُجد `div.text-green-400.font-bold` الذي يحتوي "المجموع:" → `totalDiv.textContent = 'المجموع: ' + totalDays`. |

النتيجة: في نفس الصف الذي تم فيه الإدخال تتحدث "تم/لم يتم" والمجموع دون إعادة رسم الجدول.

---

## 6. ظهور القيمة في عرض "الكل" (عند تغيير الفلتر)

عند اختيار فلتر "الكل" يُستدعى `renderUI('الكل')` (مثلاً من تغيير الفلتر). الجدول يُعاد بناؤه من `db`.

### 6.1 حالة الموظف المتكرر في "الكل"

**الموقع:** داخل قالب الصف، ~سطر 3554–3637 و 3676–3687.

- **تم/لم يتم والـ checkbox:**  
  `firstEmp = allEmpBranches[0]`, `totalDays = sum(firstEmp.attendanceDaysPerBranch)`, ثم `totalDays >= 26 ? 'تم' : 'لم يتم'`.
- **نص "المجموع":**  
  `totalDays = allEmpBranches.reduce((sum, eb) => sum + (parseInt(eb.attendanceDaysPerBranch[eb.branch]) \|\| 0), 0)` ثم `'المجموع: ' + totalDays`.

بما أن كل صفوف الموظف المتكرر تشترك في نفس `attendanceDaysPerBranch`، فـ `firstEmp.attendanceDaysPerBranch` و `eb.attendanceDaysPerBranch` يشيران إلى نفس الخريطة → المجموع و"تم/لم يتم" متسقان مع ما أدخله HR في الفروع.

### 6.2 مصدر البيانات عند الرسم

- **عرض الفرع (أندلس):**  
  `branchDays = emp.attendanceDaysPerBranch[emp.branch]` → نفس الخريطة المشتركة.
- **عرض الكل:**  
  نفس الخريطة عبر `firstEmp.attendanceDaysPerBranch` و `eb.attendanceDaysPerBranch[eb.branch]`.

النتيجة: ما يُدخله HR في فرع "الأندلس" (مثلاً 22) يُحسب في المجموع ويُعرض "تم" أو "لم يتم" في "الكل" من نفس المصدر (`db` + الخريطة المشتركة).

---

## 7. بعد جلب البيانات من Firebase

عند استبدال `db` ببيانات من Firebase (poll أو زر "تحميل التحديثات"):

**الموقع:** ~سطر 7347–7352 و 7408–7412.

| الخطوة | الكود / السلوك |
|--------|-----------------|
| 1 | `db = data.db` (كل صف له نسخة مستقلة من `attendanceDaysPerBranch` بعد `JSON.parse`). |
| 2 | `normalizeDuplicateAttendance(db)` — إعادة بناء خريطة **واحدة مشتركة** لكل اسم موظف من قيم الفروع في الصفوف، وتعيينها لجميع صفوف ذلك الاسم. |
| 3 | `window.db = db`. |
| 4 | `renderUI(currentFilter)` — إعادة رسم الجدول من `db` المطبَّع. |

النتيجة: بعد أي جلب من Firebase، الموظف المتكرر يعود إلى نموذج "خريطة واحدة مشتركة" → عرض الأدمن/الكل يبقى متسقاً مع مدخلات HR.

---

## 8. ملخص التدفق (للمثال: محمد عطية، الأندلس، 22)

| # | الحدث | الدالة / الموقع | النتيجة |
|---|--------|------------------|---------|
| 1 | رسم الصف (فرع الأندلس) | قالب خلية الحضور | `value` الحقل = `emp.attendanceDaysPerBranch['الأندلس']`. |
| 2 | كتابة "22" | `handleAttendanceDaysInputSingle` | `updateAttendanceDaysForBranch('محمد عطية','الأندلس',22,false)` → الخريطة المشتركة تُحدَّث، لا إعادة رسم. |
| 3 | الخروج من الحقل (blur) | `handleAttendanceDaysBlur` | `updateAttendanceDaysForBranch(..., false)` ثم `patchAttendanceRowDisplay` → تم/لم يتم والمجموع في نفس الصف. |
| 4 | حفظ ومزامنة | داخل `updateAttendanceDaysForBranch` | `localStorage.setItem('adora_rewards_db', ...)` و `syncLivePeriodToFirebase()`. |
| 5 | تغيير الفلتر إلى "الكل" | `renderUI('الكل')` | الجدول يُبنى من `db`؛ تم/لم يتم والمجموع من `firstEmp.attendanceDaysPerBranch` (نفس الخريطة). |
| 6 | جلب من Firebase | poll / refresh | `db = data.db` ثم `normalizeDuplicateAttendance(db)` → خريطة مشتركة مرة أخرى، ثم `renderUI`. |

بهذا يكون التتبع من إدخال HR حتى الظهور في الأدمن/الكل مغلقاً ومتوافقاً مع الكود الحالي.
