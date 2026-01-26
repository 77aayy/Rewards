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

## 4. اختبار

1. افتح التطبيق
2. ارفع ملف Excel
3. اضغط "إغلاق الفترة"
4. تحقق من Firebase Storage → periods/
