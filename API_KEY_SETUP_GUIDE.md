# 🔐 دليل إعداد API Key Restrictions - خطوة بخطوة

## الخطوة 1: افتح Google Cloud Console

1. افتح المتصفح واذهب إلى:
   ```
   https://console.cloud.google.com/
   ```

2. تأكد من تسجيل الدخول بحساب Google المرتبط بمشروع Firebase

---

## الخطوة 2: اختر المشروع

1. في أعلى الصفحة، ستجد قائمة منسدلة بجانب "Google Cloud"
2. اضغط عليها واختر: **Rewards** أو **rewards-63e43**

---

## الخطوة 3: اذهب إلى Credentials

1. من القائمة الجانبية اليسرى، اضغط على:
   ```
   ☰ (القائمة) → APIs & Services → Credentials
   ```
   
   أو اذهب مباشرة إلى:
   ```
   https://console.cloud.google.com/apis/credentials?project=rewards-63e43
   ```

---

## الخطوة 4: ابحث عن API Key

1. في صفحة Credentials، ستجد قائمة بـ "API keys"
2. ابحث عن API key الذي يحتوي على:
   ```
   AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk
   ```
3. اضغط على **اسم API key** (أو على أيقونة القلم ✏️ Edit)

---

## الخطوة 5: أضف Application Restrictions

1. في صفحة Edit API key، ستجد قسم: **Application restrictions**
2. اختر: **HTTP referrers (web sites)**
3. اضغط على **Add an item**
4. أضف هذه الروابط واحد تلو الآخر:

   ```
   https://rewards-63e43.web.app/*
   ```
   
   ثم اضغط **Add an item** مرة أخرى وأضف:
   
   ```
   https://rewards-63e43.firebaseapp.com/*
   ```
   
   (اختياري - للتطوير المحلي):
   
   ```
   http://localhost:*
   ```

---

## الخطوة 6: أضف API Restrictions

1. في نفس الصفحة، ابحث عن قسم: **API restrictions**
2. اختر: **Restrict key**
3. من القائمة المنسدلة، ابحث عن: **Firebase Storage API**
4. حددها (اضغط عليها لتظهر علامة ✓)

---

## الخطوة 7: احفظ التغييرات

1. في أسفل الصفحة، اضغط على **Save**
2. انتظر حتى تظهر رسالة "API key updated successfully"

---

## ✅ التحقق من النجاح

1. بعد الحفظ، ارجع إلى صفحة Credentials
2. ستجد أن API key الآن له:
   - ✅ Application restrictions: HTTP referrers
   - ✅ API restrictions: Firebase Storage API

---

## 🎯 النتيجة

- ✅ API key الآن محمي ويعمل فقط من نطاقك
- ✅ أي محاولة استخدام من مكان آخر ستفشل
- ✅ Google لن يرسل تحذيرات بعد الآن

---

## ⚠️ ملاحظات مهمة

1. **لا تحذف API key** - فقط أضف Restrictions
2. **لا تغير الكود** - الكود الحالي صحيح
3. **انتظر 5-10 دقائق** - قد يستغرق التفعيل قليلاً

---

## 🆘 إذا واجهت مشكلة

- تأكد من أنك في المشروع الصحيح: **rewards-63e43**
- تأكد من أنك تستخدم حساب Google الصحيح
- جرب تحديث الصفحة (F5)
