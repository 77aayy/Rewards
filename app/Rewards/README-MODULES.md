# وحدات صفحة المكافآت (Rewards Modules)

## الملفات الجديدة

| الملف | الدور |
|-------|------|
| **rewards-firebase.js** | تهيئة Firebase Storage، جلب/رفع الفترة الحية (`live.json`)، تطبيق الفترة على localStorage، مزامنة إدخالات المشرف/HR. يقرأ ويكتب من `window.storage`, `window.db`, `window.branches`, `window.branchNegativeRatingsCount`, `window.discounts`, `window.discountTypes`, `window.reportStartDate`؛ يعرّض `window.lastAppliedAdminSubmitted` و`window.lastAppliedLiveModified` للاستخدام من rewards-rbac وapp.js. |
| **rewards-rbac.js** | تحويل المسار إلى query (مثل `/supervisor/TOKEN/2026_01` → `?role=...&token=...&period=...`)، دوال الصلاحيات (`isEmployeeMode`, `isAdminMode`, `isAdminLinkSubmitted`)، وواجهة الأدوار (`initializeRoleBasedUI`, `hideElementsForSupervisor`, `hideElementsForHR`, …). يعتمد على `window.getAdminSecretKey`, `window.lastAppliedAdminSubmitted`, وقراءة `role`/`token`/`period` من `URLSearchParams(window.location.search)`. |
| **rewards-table.js** | دوال تحديث الجدول والفوتر: `updateFooterTotals`, `updateBreakdownFooterTotals`, `updateEvalBooking`, `updateEvalGoogle`, `updateAttendanceDaysForBranch`, `updateFooterSummaryColspans`. يقرأ/يكتب من `window.db`, `window.branches`, `window.currentFilter`, `window.discounts`, `window.branchNegativeRatingsCount`. |

## ترتيب تحميل السكربتات في index.html

في نهاية `<body>` يتم تحميل السكربتات بالترتيب التالي:

1. `src/discount-clauses-55.js`
2. `src/rewards-firebase.js`
3. `src/rewards-rbac.js`
4. `src/rewards-table.js`
5. `src/app-extensions.js`
6. `src/app.js`

(لا تغيير لـ `firebase-config.js` أو تهيئة Firebase في الـ head.)

## مصدر التعديلات والنشر

- **مصدر التعديلات:** مجلد `app/Rewards/` (الملفات أعلاه + `app.js`, `index.html`, …).
- **النشر:** من مجلد `app` تشغيل `npm run sync:rewards` لنسخ محتويات Rewards إلى `app/public/rewards/`؛ ثم استخدام البناء العادي (`npm run build`) للتطبيق الرئيسي.
