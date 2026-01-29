# إعداد Firebase Storage

## 1. رفع Storage Rules

قم برفع ملف `storage.rules` إلى Firebase Console:

```bash
firebase deploy --only storage
```

أو يدوياً:
1. افتح Firebase Console
2. اذهب إلى Storage
3. افتح Rules
4. انسخ محتوى `storage.rules`
5. احفظ

## 2. إعداد Authentication (اختياري)

إذا كنت تريد حماية الكتابة:
1. افتح Firebase Console
2. اذهب إلى Authentication
3. فعّل Authentication
4. أضف مستخدمين (Email/Password)

## 3. رفع Firebase Config

تم إضافة Firebase Config في `src/app.js` - لا حاجة لتعديله.

## 4. سلوك ملف الفترة الواحدة (`periods/live.json`)

- **ملف واحد:** كل الأجهزة والأدوار يقرؤون ويكتبون نفس الملف `periods/live.json`.
- **آخر رفع يكتسب:** إذا عدّل أكثر من جهاز في نفس اللحظة، المحتوى النهائي هو آخر من رفع (بدون دمج).
- **الاستخدام العادي:** إداريون يدخلون البيانات ثم الأدمن يفتح لاحقاً — يعمل كما هو متوقع.
- **تزامن أدق لاحقاً:** إن احتجت فترات متعددة أو دمج تعديلات، يلزم تصميم مختلف (مثلاً مسار ملف حسب الفترة أو استخدام Firestore).

## 5. اختبار

1. افتح التطبيق
2. ارفع ملف Excel
3. اضغط "إغلاق الفترة"
4. تحقق من Firebase Storage → periods/
