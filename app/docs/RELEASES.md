# مرجع سريع — ما تم في هذه المرحلة (البنود 1–9)

ملخص من سطر واحد لكل بند؛ للتفاصيل راجع `TANFIZ-DONE.md` و `CODE_REVIEW_REPORT.md`.

1. **توحيد إعداد Firebase** — مصدر واحد (`shared/firebase-config.json`) + سكربت حقن في sync و build.
2. **تقييد مدخلات رفع الملفات** — حد 10MB، نوع الملف (xlsx/xls) فقط.
3. **تحديث التقرير** — دقة النص والأرقام في CODE_REVIEW_REPORT.
4. **ملف .env.example وتوثيق** — متغيرات مطلوبة وذكر في README.
5. **Checklist التنفيذ** — TANFIZ-DONE.md يوثّق البنود 1–9.
6. **فصل app.js إلى وحدات** — rewards-firebase، rewards-rbac، rewards-table.
7. **استبدال/تأمين xlsx** — SheetJS 0.20.3 + تقييد الحجم والنوع.
8. **توحيد قائمة مسح الجلسة** — مصفوفة واحدة `keysToRemove` في clear-session.html.
9. **سكربت تحقق قبل النشر** — pre-deploy-check.js + إشارة في PRE-DEPLOY-STEPS.
