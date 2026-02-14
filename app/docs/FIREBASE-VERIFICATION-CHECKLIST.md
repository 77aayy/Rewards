# التحقق من Firebase Storage (فشل التحميل من Firebase)

تم فحص الكود والمشروع وفق النقاط الأربع التالية.

---

## 1. عدم وجود ملف فترة حية في Firebase

**ما تم فحصه في الكود:**
- مسار الملف: `periods/live.json` (ثابت في `rewards-firebase.js` → `LIVE_PERIOD_PATH`).
- الرفع يحدث بعد «نقل للمكافآت» عبر `_adoraBackgroundFirebaseSync(..., { uploadAfterMerge: true })` ثم `syncLivePeriodToFirebase()` → `doSyncLivePeriodToFirebase()`.
- شرط الرفع: وجود `adora_rewards_db` في localStorage ومصفوفة غير فارغة.

**ما يمكنك فعله:**
- بعد النقل للمكافآت، انتظر رسالة «تمت المزامنة» أو «جاري المزامنة مع Firebase...». إن لم تظهر، قد يكون Firebase غير مهيأ (`window.storage` فارغ).
- من **Firebase Console** → **Storage** → تبويب **Files**: تحقق من وجود مجلد `periods` وملف `live.json`. إن لم يكن موجوداً، لم ينجح أي رفع بعد (أول نقل + مزامنة).

---

## 2. إعدادات Firebase

**ما تم فحصه:**
- **المصدر الموحد:** `app/shared/firebase-config.json` (يُحقَن عبر `scripts/inject-firebase-config.js` إلى `Rewards/src/firebase-config.js` ونسخ أخرى).
- **القيم الحالية في المشروع:**  
  `projectId: "rewards-63e43"`، `storageBucket: "rewards-63e43.firebasestorage.app"`، وباقي الحقول موجودة (apiKey, authDomain, appId, messagingSenderId).
- التطبيق يستخدم **Firebase Storage** فقط (لا Realtime Database ولا Firestore).

**ما يمكنك فعله:**
- في [Firebase Console](https://console.firebase.google.com/) → المشروع **rewards-63e43** → **Build** → **Storage**:
  - إن لم يكن Storage مفعّلاً، اضغط **Get started** واختر وضع الإنتاج (أو وضع الاختبار حسب بيئتك).
- تأكد أن `storageBucket` في الواجهة يطابق `rewards-63e43.firebasestorage.app` (أو الـ bucket الذي يظهر في Console).
- بعد أي تعديل على `shared/firebase-config.json` شغّل السكربت:  
  `node scripts/inject-firebase-config.js` (أو الطريقة المعتمدة في المشروع).

---

## 3. قواعد Firebase Storage

**ما تم فحصه:**
- ملف القواعد: **`app/Rewards/storage.rules`**.
- القواعد تسمح لمسار `periods/{periodId}` بـ:
  - **قراءة:** `allow read: if true;` (أي قراءة `periods/live.json` و `periods/2026_01.json` وغيرها مسموحة).
  - **كتابة:** حجم ≤ 5MB ونوع `application/json`.
  - **حذف:** مسموح.

**ما تم تعديله:**
- في **`app/firebase.json`** كان يوجد **hosting** فقط، فلا تُنشر قواعد Storage عند النشر من مجلد `app`.
- تمت إضافة:  
  `"storage": { "rules": "Rewards/storage.rules" }`  
  إلى `app/firebase.json` حتى يُنشر Storage مع المشروع عند تشغيل `firebase deploy` من مجلد `app`.

**ما يمكنك فعله:**
- نشر القواعد من جذر المشروع (مجلد `app`):  
  `firebase deploy --only storage`  
  (أو `firebase deploy` لنشر hosting + storage).
- من Firebase Console → **Storage** → **Rules**: تأكد أن القواعد المنشورة تحتوي على `match /periods/{periodId}` مع `allow read: if true;`.

---

## 4. الشبكة / الحظر

**ما يمكنك فعله (يدوياً):**
- في المتصفح: **F12** → **Network** → اضغط «تحميل التحديثات» في المكافآت، وابحث عن طلبات إلى نطاق مثل:
  - `firebasestorage.googleapis.com`  
  أو
  - `*.googleapis.com`
- إن ظهر الطلب بحالة **فاشلة** (Failed / CORS / 403): المشكلة من الشبكة أو جدار الحماية أو إعدادات المتصفح.
- إن لم يظهر أي طلب لـ Storage: غالباً `window.storage` غير مهيأ (فشل تهيئة Firebase أو عدم تحميل السكربت).

**اختبار سريع من Console (صفحة المكافآت):**
```javascript
// في صفحة المكافآت، افتح Console (F12) والصق:
console.log('storage' in window && window.storage ? 'Firebase Storage متصل' : 'Firebase Storage غير متوفر');
if (window.storage && typeof window.fetchLivePeriodFromFirebase === 'function') {
  window.fetchLivePeriodFromFirebase().then(function(d) {
    console.log(d ? 'تم جلب الفترة الحية، عدد الموظفين: ' + (d.db && d.db.length) : 'لا توجد فترة حية أو فشل الجلب');
  });
}
```

---

## ملخص الإجراءات الموصى بها

| # | الإجراء |
|---|---------|
| 1 | تفعيل **Storage** للمشروع من Firebase Console إن لم يكن مفعّلاً. |
| 2 | نشر قواعد Storage من مجلد `app`: `firebase deploy --only storage`. |
| 3 | تنفيذ «نقل للمكافآت» ثم انتظار اكتمال المزامنة والتأكد من ظهور `periods/live.json` في Storage من Console. |
| 4 | تشغيل المقتطف أعلاه في Console للتأكد من تهيئة Firebase وجلب الفترة الحية. |
| 5 | في حال استمرار الفشل: مراجعة تبويب Network للطلبات المرسلة إلى `firebasestorage.googleapis.com`. |

تم التحديث بعد إضافة `storage.rules` إلى `app/firebase.json` حتى يُنشر Storage مع المشروع.
