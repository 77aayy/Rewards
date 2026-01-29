# نشر آخر إصدار على Firebase Hosting

## 1. البناء (محلياً)

```bash
cd c:\Users\77aay\Desktop\Rewards
npm run build
```

يُنتج مجلد `dist/` مع الـ CSS المُبنى ونسخ الملفات.

## 2. النشر على Firebase

المشروع مُعدّ حالياً للنشر من **الجذر** (`public: "."` في `firebase.json`)، أي يُرفع `index.html` و `src/` من مجلد المشروع (وليس من `dist/`).

```bash
cd c:\Users\77aay\Desktop\Rewards
firebase deploy --only hosting
```

- إذا طلب تسجيل الدخول: `firebase login`
- بعد النجاح ستظهر رسالة تحتوي على رابط الموقع، مثلاً:  
  `Hosting URL: https://rewards-63e43.web.app`

## 3. (اختياري) نشر النسخة المُبنى من `dist/`

إذا أردت أن يعتمد الموقع الأونلاين على النسخة المُبنى (بدون CDN Tailwind):

1. في `firebase.json` غيّر السطر:
   - من: `"public": "."`
   - إلى: `"public": "dist"`
2. نفّذ:
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

---

*بعد النشر، اختبر النسخة الأونلاين (روابط الإداريين، رفع ملف، فلاتر، عرض «الكل»، التذييل).*
