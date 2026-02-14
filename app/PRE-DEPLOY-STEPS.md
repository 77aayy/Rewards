# خطوات قبل الرفع — أنت تعملها يدوياً

قبل كل رفع: أمر **`npm run deploy`** يشغّل التحقق تلقائياً (`pre-deploy-check`) قبل المتابعة؛ إن ظهرت أخطاء أو تحذيرات أصلحها ثم أعد `npm run deploy`. يمكنك أيضاً تشغيل **`npm run pre-deploy-check`** يدوياً من مجلد `app` للتحقق من الأسرار (وجود .env، عدم بقاء المفتاح الافتراضيّ، إعداد Firebase).

هذا الملف يشرح بالتفصيل الخطوة الوحيدة اللي تحتاج تعملها **أنت** من المتصفح (مرة واحدة أو عند تغيير الدومين). باقي الخطوات (البناء، الرفع، Git) السكربت يعملها.

---

## الخطوة: تقييد مفتاح Firebase API (مرة واحدة)

**ليه:** عشان مفتاح الـ API ما يبقاش يشتغل من أي موقع على النت؛ يشتغل فقط من موقعك أو من localhost للاختبار.

**مين يعملها:** أنت، من متصفحك بعد تسجيل الدخول بحساب Google اللي فيه مشروع Firebase.

---

### 1) افتح Firebase Console

- الرابط المباشر: **https://console.firebase.google.com**
- سجّل دخول بحساب Google اللي فيه المشروع (مثلاً rewards-63e43).

---

### 2) اختار المشروع

- من الصفحة الرئيسية اضغط على مشروعك (اسم المشروع، مثلاً **rewards-63e43** أو اللي ظاهر عندك).

---

### 3) ادخل على الإعدادات

- في القائمة الجانبية (أو من أيقونة الترس بجانب "نظرة عامة على المشروع") اضغط **الإعدادات (Project settings)**.
- أو الرابط المباشر لمشروعك (غيّر `rewards-63e43` لو اسم المشروع مختلف):  
  **https://console.firebase.google.com/project/rewards-63e43/settings/general**

---

### 4) لاقي "مفاتيح الويب" (Web API keys)

- في تبويب **عام (General)** انزل لتحت.
- هتلاقي قسم **"مفاتيح الويب"** أو **"Your apps"** وتحته الـ Web API key (يبدأ بـ `AIza...`).
- جنب المفتاح في العادة يكون في زر أو رابط اسمه **"إدارة مفاتيح API في Google Cloud"** أو **Manage API keys** — اضغط عليه (يفتح لك صفحة Google Cloud Console لنفس المشروع).

---

### 5) قيّد المفتاح في Google Cloud Console

- هتفتح صفحة **Google Cloud Console** → **APIs & Services** → **Credentials**.
- رابط مباشر (غيّر `rewards-63e43` لو المشروع باسم تاني):  
  **https://console.cloud.google.com/apis/credentials?project=rewards-63e43**
- تحت **API Keys** اضغط على الـ key اللي بيستخدمه المشروع (نفس اللي في Firebase).
- في صفحة تفاصيل المفتاح:
  - تحت **Application restrictions** اختر **HTTP referrers (websites)**.
  - تحت **Website restrictions** اضغط **Add an item** وضيف:
    - `https://rewards-63e43.web.app/*` (أو دومينك الحقيقي لو مختلف)
    - `https://*.firebaseapp.com/*` (لو هتستخدم دومين Firebase)
    - للاختبار من جهازك: `http://localhost:*` أو `http://127.0.0.1:*`
  - اضغط **Save**.

---

### 6) تأكد

- بعد الحفظ، المفتاح هيبقى يشتغل **فقط** من الروابط اللي ضفتها. أي موقع تاني هياخد رسالة "مرفوض" لو حاول يستخدم المفتاح.

---

## فحص آلي قبل النشر

قبل الرفع، شغّل:

```bash
npm run pre-deploy-check
```

يتحقق من وجود `.env` وتغيير مفتاح الأدمن ويطبع قائمة الخطوات اليدوية.

---

## اختبار قبل الرفع (قبل كل مرة ترفع فيها)

- **يدوي:** شغّل الموقع عندك (`npm run dev` من مجلد `app`) وافتح المتصفح:
  1. الصفحة الرئيسية → ادخل المفتاح.
  2. ادخل الإيميل وكلمة المرور.
  3. تأكد إن رفع الملفات والتحليل وشاشة المكافآت يفتحوا ويشتغلوا.
- **أوتوماتيك (إن وُجد):** من مجلد المشروع: `cd app\Rewards` ثم `npm run test:e2e`.

---

## CORS على Firebase Storage (عند التطوير من localhost)

عند تشغيل التطبيق من **localhost** (مثلاً `npm run dev` أو Vite على منفذ 5175)، صفحة المكافآت وروابط المشرف/HR تجلب بيانات من Firebase Storage (`periods/live.json`, `periods/2026_02.json`). لو ظهر في المتصفح:

`Access to XMLHttpRequest at 'https://firebasestorage.googleapis.com/...' from origin 'http://localhost:5175' has been blocked by CORS policy`

**السبب:** الـ bucket لم يُضبط عليه CORS بعد، أو لم تُضف أصل (origin) المنفذ اللي شغّال عليه التطبيق.

**الحل (مرة واحدة):**

1. **من Node (مجلد المشروع):**
   - ثبّت التبعيات في مجلد Rewards إن لم تكن: `cd app\Rewards` ثم `npm install`
   - سجّل دخول Google Cloud: `gcloud auth application-default login`
   - شغّل: `npm run storage-cors`
   - إن نجح، ستظهر رسالة "CORS تم تطبيقه على rewards-63e43.firebasestorage.app". حدّث صفحة المكافآت وجرب.

2. **بديل من gcloud (لو فشل Node):**
   - من **Google Cloud Shell** أو من جهازك بعد تثبيت [Google Cloud SDK](https://cloud.google.com/sdk/docs/install):
   - أنشئ ملفاً (مثلاً `cors.json`) بالمحتوى من `app/Rewards/cors.json`.
   - نفّذ (اسم الـ bucket قد يكون `rewards-63e43.appspot.com` أو `rewards-63e43.firebasestorage.app` حسب المشروع):
     ```bash
     gcloud storage buckets update gs://rewards-63e43.firebasestorage.app --cors-file=./cors.json
     ```
     لو ظهر خطأ أن الـ bucket غير موجود، جرّب: `gs://rewards-63e43.appspot.com`
   - حدّث الصفحة وجرب.

بعد تطبيق CORS مرة واحدة، خطأ CORS يختفي من localhost.

---

## روابط سريعة

| ماذا | الرابط |
|------|--------|
| Firebase Console (الصفحة الرئيسية) | https://console.firebase.google.com |
| إعدادات المشروع (غيّر اسم المشروع لو مختلف) | https://console.firebase.google.com/project/rewards-63e43/settings/general |
| مفاتيح API في Google Cloud (غيّر اسم المشروع لو مختلف) | https://console.cloud.google.com/apis/credentials?project=rewards-63e43 |

لو اسم المشروع عندك مش `rewards-63e43`، استبدله في الروابط فوق بالاسم اللي ظاهر في Firebase Console.
