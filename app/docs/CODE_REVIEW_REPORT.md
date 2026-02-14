# تقرير مراجعة المشروع — مراجعة ليلية شاملة

**التاريخ:** فبراير 2025  
**المشروع:** تطبيق إليت (التحليل + المكافآت)  
**المراجع:** مراجعة آلية وفق برومبت مراجعة المشروع

---

## 1. ملخص تنفيذي

المشروع في حالة **قابلة للتشغيل والنشر** مع وجود مخاطر أمنية ومعمارية معروفة ومُوثّقة. البناء يعمل بنجاح (`npm run build`, `npm run sync:rewards`)، ولا توجد أخطاء ESLint/TypeScript في `app/src`. التطبيق يعتمد على Firebase Storage وروابط سرية بدون backend مخصص؛ الاعتماد على تقييد API key في Google Cloud ضروري قبل النشر الحقيقي.

### أهم 5 إجراءات مطلوبة

1. **تغيير مفتاح الأدمن والإيميلات** قبل النشر الحقيقي — القيم الحالية مكشوفة في الكود.
2. **تقييد Firebase API key** في Google Cloud Console (HTTP referrer) — حسب `PRE-DEPLOY-STEPS.md`.
3. **معالجة ثغرة xlsx (npm audit)** — حزمة xlsx بها ثغرات معروفة (Prototype Pollution، ReDoS) ولا يوجد إصلاح متاح؛ تقييم بدائل (مثلاً SheetJS الرسمي أو استبدال).
4. **توحيد إعداد Firebase** — مصدر واحد (ملف مشترك أو build-time injection) لتقليل خطر التناقض عند التعديل.
5. **توثيق وتطبيق checklist النشر** — التأكد من تنفيذ كل بند في `PRE-DEPLOY-STEPS.md` و`SECURITY.md` قبل كل نشر.

---

## 2. جدول المشاكل والتوصيات

| البند | الموقع | الخطورة | الوصف | التوصية |
|-------|--------|---------|-------|---------|
| مفتاح وإيميلات الأدمن مكشوفة | `adminConfig.ts` س14، 15–17، `Rewards/src/app.js` س877 | عالية | القيم مكتوبة نصاً في الكود | تغيير قبل النشر الحقيقي؛ استخدام `.env` أو متغيرات بيئة مع build-time injection |
| إعداد Firebase مكرر | 5 ملفات (انظر القسم 3) | متوسطة | تم التوحيد: مصدر واحد (`shared/firebase-config.json`) + سكربت حقن في sync و build | تم (مصدر واحد + inject) |
| قواعد Storage مفتوحة | `storage.rules` | متوسطة | `allow read/delete: if true` — لا تحقق هوية | توثيق المخاطر؛ خطة مستقبلية: Cloud Functions أو backend |
| ثغرات حزمة xlsx | `package.json`، `node_modules/xlsx` | عالية | Prototype Pollution + ReDoS، لا إصلاح | تقييم بدائل (مثلاً SheetJS الرسمي) أو تقييد مدخلات الملفات |
| ~~عدم توحيد مسح الجلسة~~ | ~~`clear-session.html` catch block~~ | — | **تصحيح:** الـ catch يمسح نفس المفاتيح (evalRate، periodText، just_logged_out موجودة في السطور 56–59). لا إجراء مطلوب. | — |
| لا Rate Limiting | — | متوسطة | العميل يرسل مباشرة لـ Firebase | خطة مستقبلية مع Cloud Functions |
| app.js كبير جداً | `Rewards/src/app.js` (حوالي 8,340 سطر) | منخفضة | صعوبة صيانة واحتمال أخطاء scope؛ تم التقسيم إلى وحدات (rewards-firebase، rewards-rbac، rewards-table) | إبقاء نقطة الدخول في app.js؛ الوحدات منفصلة حسب الخطة |
| اعتماد على localStorage | عدة ملفات | متوسطة | مصدر حقيقة لبعض الحالات، كاش لبعضها | توثيق المفاتيح (تم في القسم 4) |

---

## 3. الأمان (Security)

### 3.1 مفتاح الأدمن وإيميلات الأدمن

- **المواقع:** `app/src/adminConfig.ts` (س14، 15–17)، `app/Rewards/src/app.js` (سطر 877)
- **التحقق:** القيمتان متطابقتان (`ayman5255`، `77aayy@gmail.com`)
- **الحالة:** مقصود حالياً لعدم إيقاف المشروع؛ مُوثّق في `SECURITY.md`
- **التوصية:** تغيير إجباري قبل النشر الحقيقي في كلا الملفين، ثم `npm run sync:rewards`

### 3.2 إعداد Firebase

- **المواقع:** `adminConfig.ts`، `firebase.ts`، `clear-session.html`، `Rewards/src/firebase-config.js`، `public/rewards/src/firebase-config.js`
- **التحقق:** جميع النسخ متطابقة (`AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk`)
- **المخاطر:** تكرار في 5 مواضع — خطر تناقض عند التعديل
- **التوصية:** مصدر واحد (ملف مشترك أو `window.__FIREBASE_CONFIG__` من build script)

### 3.3 قواعد Firebase Storage

- **الملف:** `app/Rewards/storage.rules`
- **الحالة:** `allow read: if true`؛ `allow create, update` مع قيود حجم ونوع؛ `allow delete: if true`
- **المخاطر:** الاعتماد على روابط سرية فقط؛ لا Rate Limiting ولا تحقق من الهوية
- **التوصية:** عند إضافة backend أو Cloud Functions، ربط الكتابة/الحذف بصلاحيات

### 3.4 أسرار أخرى

- **التحقق:** لا توجد API keys أو tokens إضافية مكشوفة
- **app-extensions.js:** يستخدم `window.getAdminSecretKey()` ولا يكرر المفتاح

### 3.5 التحقق من الصلاحيات (RBAC)

- **تدفق روابط المشرف/HR:** `validateAdminAccess` من localStorage أو `tryValidateAdminAccessFromFirebase` من Firebase
- **النتيجة:** لا ثغرة واضحة لتجاوز الدور من رابط مشرف إلى أدمن (مفتاح الأدمن منفصل في الـ URL)
- **ملاحظة:** التصعيد ممكن من جهة العميل (تعديل localStorage) — لا backend لفرض الصلاحيات

### 3.6 بيانات المستخدم

- لا إرسال حساس بدون HTTPS
- البيانات في localStorage عرضة لـ XSS من نفس Origin
- لا تخزين كلمات مرور أو بيانات مالية حساسة في localStorage

---

## 4. الهندسة والهيكل (Architecture)

### 4.1 مصدر واحد للمكافآت

- **المصدر:** `app/Rewards/` فقط
- **النسخة المُخدمة:** `app/public/rewards/` ناتج `npm run sync:rewards` (يشغّل `prepare-deploy.js` ثم النسخ)
- **التحقق:** لا تعديل يدوي في `public/rewards/`؛ `headerButtonsConfig.json` يُنسخ من `app/shared/`

### 4.2 التكرار (Duplication)

| العنصر | المواقع |
|--------|---------|
| Firebase config | 5 ملفات |
| ADMIN_SECRET_KEY | `adminConfig.ts`، `Rewards/src/app.js` |
| مفاتيح localStorage | موزعة بين `app.js` و `app-extensions.js` |

### 4.3 تدفق البيانات

```mermaid
flowchart LR
    Analysis[التحليل] -->|localStorage adora_transfer_payload + redirect| Rewards[المكافآت]
    Rewards -->|loadDataFromStorage| Process[_processAdoraTransferPayload]
    Process -->|Remove payload key| Done[عرض الجدول]
    Supervisor[المشرف/HR] -->|adminSubmitted| Firebase[Firebase Storage]
    Firebase -->|applyLivePeriod| RewardsUI[واجهة المكافآت]
```

- **التحليل → المكافآت:** `handleTransferToRewards` يخزّن payload في `adora_transfer_payload` ويوجّه إلى `/rewards/?transfer=1`؛ `loadDataFromStorage` يقرأ ويستدعي `_processAdoraTransferPayload` ويزيل المفتاح فوراً
- **المشرف/HR → Firebase:** إرسال مع `adminSubmitted` في `periods/live.json`؛ منع الإدخال مرة ثانية عبر `isAdminLinkSubmitted()` الذي يقرأ من Firebase (`lastAppliedAdminSubmitted`)
- **نقطة ضعف محتملة:** فقدان الـ payload إذا فُتح `/rewards/` في تاب جديد قبل الـ redirect — التطبيق يستخدم postMessage fallback و retry كل 500ms

### 4.4 توثيق مفاتيح localStorage (adora_*)

| المفتاح | الاستخدام |
|---------|-----------|
| `adora_admin_auth_session` | جلسة الأدمن (إيميل/وقت) |
| `adora_admin_last_email` | آخر إيميل للـ prefill |
| `adora_current_role` | الدور الحالي (admin/supervisor/hr/accounting/manager) |
| `adora_current_token` | توكن الرابط للإداريين |
| `adora_current_period` | معرف الفترة |
| `adora_transfer_payload` | بيانات النقل من التحليل (مؤقت، يُزال بعد المعالجة) |
| `adora_rewards_db` | جدول الموظفين (مصدر حقيقة محلي بعد التحميل) |
| `adora_rewards_branches` | قائمة الفروع |
| `adora_rewards_evalRate` | نسبة التقييم |
| `adora_rewards_startDate` | تاريخ بداية التقرير |
| `adora_rewards_periodText` | نص الفترة |
| `adora_rewards_negativeRatingsCount` | التقييمات السلبية للفروع |
| `adora_rewards_discounts` | الخصومات |
| `adora_rewards_discountTypes` | أنواع الخصم |
| `adora_rewards_pricing` | أسعار المكافآت |
| `adora_rewards_employeeCodes` | رموز الموظفين |
| `adora_rewards_cumulativePoints` | الرصيد التراكمي (عبر الفترات) |
| `adora_admin_tokens` | توكنات الإداريين (role+token لكل فترة) |
| `adora_admin_names` | أسماء الإداريين |
| `adora_admin_submitted_*` | حالة الإرسال لكل دور/فترة (كاش بعد التطبيق من Firebase) |
| `adora_analysis_*` | بيانات التحليل |
| `adora_admin_just_logged_out` | علم خروج الأدمن |
| `adora_firebase_config_saved` | علم وجود إعداد محفوظ في Firebase |

**المفاتيح المُمسحة عند الخروج:** قائمة المفاتيح التي تُمسح عند زيارة صفحة مسح الجلسة (`app/public/clear-session.html`) مُعرّفة في مصفوفة `keysToRemove` داخل ذلك الملف فقط؛ أي مفتاح جديد يُضاف هناك. المفاتيح المُمسحة حالياً: (`adora_admin_auth_session`, `adora_current_role`, `adora_current_token`, `adora_current_period`, `adora_admin_just_logged_out`, `adora_rewards_db`, `adora_rewards_branches`, `adora_rewards_evalRate`, `adora_rewards_startDate`, `adora_rewards_periodText`, `adora_analysis_*`, `adora_transfer_payload`). المفاتيح التي لا تُمسح (مثل `adora_rewards_pricing`, `adora_rewards_cumulativePoints`, `adora_admin_tokens`) تُحتفظ بها عمداً بين الجلسات.

---

## 5. الجودة والصيانة (Code Quality)

### 5.1 TypeScript و React

- **التحقق:** لا استخدام لـ `any` في التوقيعات (فقط في تعليقات `parser.ts`)
- **read_lints:** لا أخطاء في `app/src`
- **tsc:** البناء يعمل بنجاح

### 5.2 معالجة الأخطاء

- **app.js:** أكثر من 200 استخدام لـ try/catch — تغطية جيدة
- **App.tsx:** try/catch في `handleLogin`, `handleTransferToRewards`، استيراد Firebase ديناميكي
- **رسائل الأخطاء:** واضحة للمستخدم (مثلاً "تعذّر جلب بيانات الرابط من الخادم")

### 5.3 التنظيف (Cleanup)

- **App.tsx:** `onAuthStateChanged` يعيد `unsub` في الـ cleanup
- **App.tsx:** `addEventListener('message')` مع `removeEventListener` في الـ return
- **app.js:** `setInterval` في طلب الـ payload مع `clearInterval` عند النجاح أو بعد 24 محاولة

### 5.4 الأداء

- **app.js:** حوالي 8,340 سطر — تم التقسيم إلى وحدات (rewards-firebase، rewards-rbac، rewards-table)؛ نقطة الدخول والربط ما زالت في app.js
- **React:** استخدام `@tanstack/react-table` مع pagination
- **التوصية:** لا إجراء إضافي؛ التقسيم منفّذ حسب بند 6

### 5.5 التوافق مع المتصفحات

- استخدام Fetch، localStorage، URLSearchParams، classList — مدعومة في المتصفحات الحديثة
- **التوصية:** تحديد المتصفحات المستهدفة في التوثيق

---

## 6. الوظائف والسيناريوهات (Functional)

### 6.1 تسجيل الدخول

- **أدمن بالمفتاح:** `?admin=KEY` — يفتح بوابة الإيميل/باسورد
- **أدمن بالإيميل/باسورد:** Firebase Auth + `ADMIN_ALLOWED_EMAILS`
- **روابط الإداريين:** `?role=&token=&period=` — `validateAdminAccess` من localStorage أو Firebase

### 6.2 التحليل → نقل للمكافآت

- **الـ payload:** `db`, `branches`, `reportStartDate`, `currentEvalRate`, `periodText`, `branchNegativeRatingsCount`, `discounts`, `discountTypes`, `config`, `activeVipRooms`, `rawBookings`
- **التحقق:** الـ payload كامل؛ يُبنى داخل `handleTransferToRewards` ويُخزَّن في `adora_transfer_payload`

### 6.3 المكافآت — إرسال المشرف/HR

- **adminSubmitted:** يُحفظ في Firebase في `periods/live.json`
- **التحقق:** `isAdminLinkSubmitted()` يقرأ من `lastAppliedAdminSubmitted` (Firebase) — صحيح
- **منع الإدخال مرة ثانية:** مطبّق عبر التحقق من Firebase

### 6.4 أزرار الترويسة

- **المنطق:** `initializeRoleBasedUI(role)` — للأدوار supervisor/hr/accounting/manager تُخفى الأزرار ثم `hideElementsFor*` يعيد عرض الحاوية ويُظهر زر "شروط المكافآت" فقط (وبعض أزرار الطباعة للحسابات)
- **التحقق:** منطق صحيح — المشرف/HR/محاسبة/مدير يرون زر "شروط المكافآت"

### 6.5 صفحة مسح الجلسة

- **الملف:** `app/public/clear-session.html`
- **المفاتيح المُمسحة:** `adora_admin_auth_session`, `adora_current_role/token/period`, `adora_rewards_db`, `adora_rewards_branches`, `adora_rewards_evalRate`, `adora_rewards_startDate`, `adora_rewards_periodText`, `adora_analysis_*`, `adora_transfer_payload`, `adora_admin_just_logged_out`
- **المفاتيح غير المُمسحة (مقصود):** `adora_rewards_negativeRatingsCount`, `adora_rewards_discounts`, `adora_rewards_discountTypes`, `adora_rewards_cumulativePoints`, `adora_rewards_pricing`, `adora_admin_tokens`, `adora_admin_names`
- **تحقق لاحق:** الـ catch block (س52–69) يمسح نفس المفاتيح بما فيها evalRate، periodText، just_logged_out — لا تناقض.

---

## 7. النشر والوثائق (Deploy & Run)

### 7.1 السكربتات

- `npm run sync:rewards`: يعمل بنجاح
- `npm run build`: يعمل بنجاح (`tsc -b && vite build`)
- `npm run deploy`: sync + build + firebase deploy
- **firebase.json:** rewrites صحيحة؛ الملفات الثابتة (`clear-session.html`) تُخدم قبل الـ rewrites

### 7.2 الوثائق

- **README.md:** موجز مع روابط PRE-DEPLOY، DEV-SETUP، CLEANUP
- **SECURITY.md:** توثيق المفتاح، Firebase، Storage، Rate Limiting
- **PRE-DEPLOY-STEPS.md:** خطوات تقييد API key مع روابط
- **DEV-SETUP.md:** تشغيل من منفذ واحد

### 7.3 التبعيات (npm audit)

```
xlsx: Prototype Pollution + ReDoS — high severity
No fix available
```

- **التوصية:** تقييم بدائل (مثلاً SheetJS الرسمي) أو تقييد مدخلات الملفات

---

## 8. Checklist جاهزية الإنتاج

| البند | الحالة |
|-------|--------|
| تغيير مفتاح الأدمن | لا — مطلوب قبل النشر الحقيقي |
| تغيير إيميلات الأدمن | لا — مطلوب قبل النشر الحقيقي |
| تقييد API key في Google Cloud | يدوي — اتبع PRE-DEPLOY-STEPS.md |
| تطابق إعداد Firebase في كل المواضع | نعم — تم التحقق |
| عدم وجود أسرار إضافية مكشوفة | نعم |
| توثيق خطوات النشر | نعم — PRE-DEPLOY، SECURITY، DEV-SETUP |
| npm run build يعمل | نعم |
| npm run sync:rewards يعمل | نعم |
| read_lints نظيف | نعم |
| ثغرات التبعيات (npm audit) | xlsx بها ثغرات — تقييم بدائل |

---

## 9. ملحق — تحسينات لاحقة

1. **فصل app.js:** تقسيم إلى وحدات (firebase-io، rbac، table-render، إلخ) لتسهيل الصيانة
2. **مصدر واحد لـ Firebase config:** ملف مشترك أو build-time injection من `.env`
3. **Rate Limiting:** عند إضافة Cloud Functions أو backend، فرض حدود على الطلبات الحساسة
4. ~~توحيد مسح الجلسة~~ — تم التحقق: الـ catch يمسح نفس المفاتيح (لا إجراء).
5. **معالجة ثغرة xlsx:** استبدال الحزمة أو تقييد مدخلات الملفات (تحقق من الحجم والنوع)
