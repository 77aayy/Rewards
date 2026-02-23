# خطة تنفيذ — تصغير صف الحوافز ومهام مستقلة

## مهام مستقلة (لا تعتمد على بعضها)

| # | المهمة | الوصف | الملفات المتأثرة |
|---|--------|-------|------------------|
| 1 | تصغير صف الحوافز ~80% | تقليل padding، خط، مسافات، وعرض الموظفين في صفوف مدمجة | `index.html`, `styles.css`, `app.js` |
| 2 | تحسين أداء DOM (100+ موظف) | Virtualization أو تحديث جزئي للصفوف بدل إعادة رسم كاملة | `rewards-table.js`, `app.js` |
| 3 | استبدال Polling بـ onSnapshot | استخدام Firestore `onSnapshot` بدل `startLivePeriodPolling` لتقليل القراءات | `rewards-firebase.js` |
| 4 | بنود الخصم من Firestore | سحب `DEFAULT_DISCOUNT_CLAUSES_55` من Firestore بدل مصفوفة ثابتة | `discount-clauses-55.js`, Firestore collection جديد |
| 5 | Unit Tests لخصم الفريق | اختبارات لـ `getHotelRatingDeductionForEmployee` والتأكد من الفلترة حسب الفرع | ملف اختبار جديد |
| 6 | تحسين عرض الموظفين في الحوافز | عرض مختصر (اسم + فرع) أو قائمة مضغوطة مع tooltip للسبب | `app.js` (formatBonusEmployeesAsRows) |

---

## المهمة 1: تصغير صف الحوافز (منفذة)
- padding الخلية: `p-2 sm:p-3` → `px-2 py-1`
- padding البطاقات: `p-2 sm:p-2.5` → `p-1.5`
- حجم الخط: `text-[10px] sm:text-xs` → `text-[9px]`
- عرض الموظف: صف واحد مضغوط `رقم. الاسم (الفرع)` بدون سبب منفصل (أو السبب في سطر واحد)
- gap بين البطاقات: `gap-2 sm:gap-3` → `gap-1.5`
