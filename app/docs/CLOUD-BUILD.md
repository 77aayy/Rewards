# Cloud Build & Firebase App Hosting

> **ملاحظة:** إذا فشل البناء من **جذر المستودع**، راجع أيضاً **APP_HOSTING_ROOT.md** في جذر المستودع (ضبط Root directory = `app`).

إذا ظهرت أخطاء البناء مثل:

- `fail: google.nodejs.runtime` — "neither package.json nor any .js files found"
- `fail: google.config.entrypoint` — "GOOGLE_ENTRYPOINT not set"
- `No buildpack groups passed detection`
- `ERROR: build step 3 ... nodejs ... failed: step exited with non-zero status: 21`

فالسبب أن البناء يعمل من **جذر المستودع** بينما التطبيق (و`package.json`) داخل مجلد **`app/`**.

---

## إذا كان البناء من Firebase App Hosting (FAH)

لو السجلات تحتوي على وسوم مثل `fah` أو `p-fah` أو اسم الـ step هو "build" مع صورة `nodejs_...`، فالبناء من **Firebase App Hosting** وليس من Cloud Build trigger عادي.

**الحل:** ضبط **Root directory** لمجلد التطبيق في Firebase:

1. ادخل [Firebase Console](https://console.firebase.google.com/project/rewards-63e43) → **App Hosting**.
2. افتح الـ **Backend** المرتبط بالمستودع (مثلاً `rewards-app`).
3. من إعدادات الـ Backend ابحث عن **Deployment settings** أو **Root directory** (المسار النسبي من جذر المستودع لتطبيقك).
4. عيّن **Root directory** إلى: **`app`** (بدون شرطة مائلة في البداية).
5. احفظ وأعد تشغيل البناء (أو ادفع commit جديد).

بعد ذلك سيبني App Hosting من مجلد `app/` حيث يوجد `package.json` ولن تظهر أخطاء "package.json not found".

راجع أيضاً: [Use monorepos with App Hosting](https://firebase.google.com/docs/app-hosting/monorepos).

---

## إذا كان البناء من Cloud Build trigger عادي: استخدام cloudbuild.yaml

تم إضافة **`cloudbuild.yaml`** في جذر المستودع. هذا الملف يوجّه Cloud Build إلى:

1. تشغيل `npm ci` ثم `npm run build` من مجلد **app/**
2. تشغيل `firebase deploy --only hosting` من مجلد **app/**

## ما الذي تفعله في Google Cloud

### 1) تفعيل الـ API وربط المستودع

- تفعيل: Cloud Build، Firebase، Resource Manager.
- ربط المستودع (GitHub) بالمشروع في [Cloud Build Triggers](https://console.cloud.google.com/cloud-build/triggers).

### 2) إنشاء السر FIREBASE_TOKEN

- من Firebase: [Project settings → Service accounts](https://console.firebase.google.com/project/rewards-63e43/settings/serviceaccounts/adminsdk) → Generate new private key (أو استخدم حساب موجود).
- أو من سطر الأوامر: `firebase login:ci` ثم انسخ الـ token.
- في [Secret Manager](https://console.cloud.google.com/security/secret-manager): أنشئ سراً باسم **`FIREBASE_TOKEN`** وضَع فيه قيمة الـ token.

### 3) تعديل الـ Trigger لاستخدام cloudbuild.yaml

- ادخل [Cloud Build → Triggers](https://console.cloud.google.com/cloud-build/triggers).
- افتح الـ trigger الذي يفشل البناء.
- في **Configuration**:
  - اختر **Cloud Build configuration file** (لا تختر Autodetect أو Dockerfile إذا كان يسبب خطأ الـ buildpack).
  - المسار: **`/cloudbuild.yaml`** (في جذر المستودع).
- احفظ.

### 4) صلاحيات الحساب الخدمي للـ Build

تأكد أن الحساب الخدمي المستخدم في Cloud Build لديه:

- Cloud Build Service Account
- Firebase Admin
- (حسب الوثائق) Secret Manager Secret Accessor للسر `FIREBASE_TOKEN`

بعد ذلك، عند الدفع إلى الفرع المُربوط بالـ trigger، سيتم البناء من **app/** والنشر على Firebase Hosting دون أخطاء الـ buildpack.
