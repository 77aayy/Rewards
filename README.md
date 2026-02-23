# Rewards (Monorepo)

التطبيق الرئيسي داخل مجلد **`app/`** (React + Vite + Firebase Hosting).

- **تشغيل محلي:** من مجلد `app/`: `npm install` ثم `npm run dev`
- **النشر:** راجع **app/README.md** و **app/docs/CLOUD-BUILD.md**
- **النشر التلقائي (GitHub Actions):** عند الدفع إلى `main` يعمل workflow: **Build & Lint** ثم **Deploy to Firebase**. تأكد من إضافة السر **FIREBASE_TOKEN** في Repo → Settings → Secrets and variables → Actions.
- **إذا كان البناء من Firebase App Hosting يفشل:** عيّن **Root directory** = **`app`** في إعدادات الـ Backend. التفاصيل: **APP_HOSTING_ROOT.md**
