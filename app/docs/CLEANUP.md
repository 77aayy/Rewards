# تنظيف المشروع — ما يُحذف وما لا يُحذف

هذا الملف يوضح هيكل المشروع وما هو آمن حذفه (يُعاد إنشاؤه) وما يجب **عدم** حذفه.

---

## ما تم حذفه (آمن — يُعاد إنشاؤه تلقائياً)

| المسار | السبب |
|--------|--------|
| `app/dist/` | ناتج البناء (Vite). يُعاد إنشاؤه بـ `npm run build`. موجود في `.gitignore`. |
| `app/.firebase/` | كاش Firebase. يُعاد إنشاؤه عند `firebase deploy`. |

---

## ما تم حذفه (توثيق مهام منتهية)

| الملف | السبب |
|-------|--------|
| `app/TASKS_PLAN.md` | خطة مهام منفّذة — لا حاجة لها في الهيكل الحالي. |
| `app/REMAINING_TASKS.md` | مهام R1, R2 منتهية — نفس الشيء. |
| `app/docs/TANFIZ-DONE.md` | دُمج في DELIVERY-AND-AUDIT.md. |
| `app/docs/RELEASES.md` | دُمج في DELIVERY-AND-AUDIT.md. |
| `app/docs/FULL-AUDIT-PROGRAMMER-WORK.md` | دُمج في DELIVERY-AND-AUDIT.md. |
| `app/docs/BAND-6-AUDIT.md` | دُمج في DELIVERY-AND-AUDIT.md. |
| `app/docs/REQUESTS-OPTIONAL-AUDIT.md` | دُمج في DELIVERY-AND-AUDIT.md. |
| `app/docs/TASKS-REMAINING.md` | دُمج في DELIVERY-AND-AUDIT.md. |
| `app/docs/MERAGAA-TANFIZ-FINAL.md` | توثيق تحقق منتهٍ — غير مستخدم. |
| `app/docs/VERIFICATION-TANFIZ.md` | توثيق تحقق منتهٍ — غير مستخدم. |
| `app/docs/VERIFICATION-OF-REVIEW.md` | توثيق تحقق منتهٍ — غير مستخدم. |
| `app/docs/PROMPT-BAND-6-FASL-APPJS.md` | تعليمات بند 6 منفّذ — مرجع في DELIVERY-AND-AUDIT. |
| `app/docs/REQUESTS-OPTIONAL.md` | طلبات اختيارية منفّذة — مرجع في DELIVERY-AND-AUDIT. |

---

## لا تحذف — ضروري للتشغيل والنشر

| المسار | السبب |
|--------|--------|
| `app/src/` | كود تطبيق التحليل (React). |
| `app/public/rewards/` | **نسخة المكافآت المُزامنة.** يُملأ بـ `npm run sync:rewards` من `app/Rewards/`. الـ build والنشر يعتمدون عليه. |
| `app/Rewards/` | **مصدر** نظام المكافآت. التعديلات هنا ثم `sync:rewards` ينسخ إلى `public/rewards/`. |
| `app/shared/` | موارد مشتركة (أزرار الترويسة، تعليمات، CSS). |
| `app/scripts/` | سكربتات المزامنة والبناء. |
| `app/public/shared/` | نسخة مشتركة للمكافآت (يُستخدم من `/rewards/`). |
| `app/public/clear-session.html` | صفحة مسح الجلسة. |

---

## هيكل المشروع (واضح)

```
3files/
├── deploy-github-firebase.bat   ← النشر الرئيسي (GitHub + Firebase)
├── app/
│   ├── src/                     ← تطبيق التحليل (React)
│   ├── public/
│   │   ├── rewards/             ← ناتج sync من Rewards (لا تحذف)
│   │   ├── shared/
│   │   └── clear-session.html
│   ├── Rewards/                 ← مصدر المكافآت (عدّل هنا ثم sync)
│   ├── shared/                  ← موارد مشتركة (ترويسة، تعليمات)
│   ├── scripts/                 ← sync-rewards، إلخ
│   ├── docs/                    ← توثيق (إعداد، تنظيف)
│   ├── package.json
│   ├── firebase.json
│   ├── README.md
│   └── PRE-DEPLOY-STEPS.md      ← راجعه قبل الرفع
```

---

**ملخص:** لا تحذف `public/rewards` أو `Rewards` أو `src` أو `shared` أو `scripts`. مجلدات `dist` و `.firebase` تُحذف عند التنظيف وتُعاد إنشاؤها بالبناء والنشر.
