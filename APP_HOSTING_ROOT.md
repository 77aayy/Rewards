# Firebase App Hosting — مجلد الجذر (Root Directory)

إذا فشل البناء بأخطاء مثل:

- `package.json not found`
- `neither package.json nor any .js files found`
- `No buildpack groups passed detection`

فالسبب أن البناء يعمل من **جذر المستودع** بينما التطبيق و`package.json` داخل مجلد **`app/`**.

## الحل الإلزامي

عيّن **Root directory** لمجلد التطبيق في Firebase App Hosting:

1. ادخل [Firebase Console](https://console.firebase.google.com/project/rewards-63e43) → **App Hosting**.
2. افتح الـ **Backend** المرتبط بالمستودع.
3. في إعدادات الـ Backend: **Deployment settings** → **Root directory**.
4. عيّن القيمة إلى: **`app`** (بدون `/` في البداية).
5. احفظ ثم أعد تشغيل البناء أو ادفع commit جديد.

بعد ذلك سيبني App Hosting من مجلد `app/` حيث يوجد `package.json`.

- [Use monorepos with App Hosting](https://firebase.google.com/docs/app-hosting/monorepos)
- تفاصيل إضافية (Cloud Build vs App Hosting): **app/docs/CLOUD-BUILD.md**
