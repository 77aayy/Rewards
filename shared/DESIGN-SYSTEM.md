# نظام التصميم الموحد — Elite Rewards (Adora)

**مصدر واحد للمواصفات:** أي تغيير في الألوان، الأنصبة، الظلال، أو مكونات الواجهة يُطبَّق من هذا المستند ثم يُنعكس في:
- `app/src/index.css` (تطبيق React: الدخول، البوابة، لوحة التحكم)
- `app/public/rewards/src/styles.css` (صفحة المكافآت)
- `app/Rewards/src/styles.css` (نسخة مزامنة من المكافآت عند الحاجة)
- `app/shared/action-header-buttons.css` (أزرار الترويسة المشتركة)

---

## 1. الهوية البصرية

| العنصر | القيمة | الاستخدام |
|--------|--------|-----------|
| لون العلامة (Accent) | `#14b8a6` (تركواز) | الأزرار الرئيسية، الروابط، الحدود عند التركيز، الشارات |
| لون العلامة (وضع فاتح) | `#0d9488` (teal-600) | نفس الاستخدام في `[data-theme="light"]` |
| النمط العام | Glassmorphism خفيف + حدود واضحة | البطاقات، الترويسات، النوافذ المنبثقة |
| التصميم | Mobile-first، RTL | كل الصفحات والنوافذ |

---

## 2. متغيرات CSS الإلزامية (يجب أن تكون متطابقة في كل الملفات)

### 2.1 الوضع الداكن (`:root` أو `[data-theme="dark"]`)

```css
--adora-bg: #0a0e1a;
--adora-bg-card: #0f1729;
--adora-text: #e2e8f0;
--adora-text-secondary: #94a3b8;
--adora-accent: #14b8a6;
--adora-border: rgba(255, 255, 255, 0.1);
--adora-hover-bg: rgba(20, 184, 166, 0.15);
--adora-active-bg: rgba(20, 184, 166, 0.25);
--adora-focus-border: rgba(20, 184, 166, 0.5);
--adora-disabled: rgba(148, 163, 184, 0.5);
--adora-success: #22c55e;
--adora-warning: #eab308;
--adora-error: #ef4444;
--adora-scrollbar-track: rgba(15, 23, 41, 0.6);
--adora-scrollbar-thumb: rgba(64, 224, 208, 0.4);
--adora-scrollbar-thumb-hover: rgba(64, 224, 208, 0.6);
--adora-modal-bg: rgba(15, 23, 41, 0.98);
--adora-modal-header-bg: rgba(30, 41, 59, 0.6);
--adora-input-bg: #1e293b;
--adora-table-header-bg: rgba(15, 23, 41, 0.6);
--adora-section-bg: linear-gradient(to bottom right, rgba(15, 23, 41, 0.8), rgba(30, 41, 59, 0.6), rgba(15, 23, 41, 0.8));
```

### 2.2 الوضع الفاتح (`[data-theme="light"]`)

تباين محسّن للقراءة والمظهر المحترف:

```css
--adora-bg: #e2e8f0;
--adora-bg-card: #ffffff;
--adora-text: #0c1222;
--adora-text-secondary: #334155;
--adora-accent: #0d9488;
--adora-border: rgba(15, 23, 42, 0.22);
--adora-hover-bg: rgba(20, 184, 166, 0.14);
--adora-active-bg: rgba(20, 184, 166, 0.22);
--adora-focus-border: rgba(13, 148, 136, 0.75);
--adora-disabled: rgba(51, 65, 85, 0.55);
--adora-success: #15803d;
--adora-warning: #a16207;
--adora-error: #b91c1c;
--adora-scrollbar-track: rgba(15, 23, 41, 0.12);
--adora-scrollbar-thumb: rgba(13, 148, 136, 0.45);
--adora-scrollbar-thumb-hover: rgba(13, 148, 136, 0.65);
--adora-modal-bg: #ffffff;
--adora-modal-header-bg: #e2e8f0;
--adora-input-bg: #ffffff;
--adora-table-header-bg: #cbd5e1;
--adora-section-bg: linear-gradient(to bottom right, #ffffff, #e2e8f0, #ffffff);
```

- **حجم الخط:** `html { font-size: 106.25%; }` داخل `[data-theme="light"]` لتحسين القراءة.
- **صفحة المكافآت:** قواعد إضافية للكروت (ظلال)، الجدول (صفوف متناوبة، صف التجميع، التذييل)، النوافذ المنبثقة، والشارات — في كلا ملفي الـ rewards.

### 2.3 صفحات قائمة بذاتها (دخول، بوابة مفتاح)

لصفحات مثل تسجيل الدخول و«بوابة الإدارة» التي قد تُعرض بدون تطبيق الثيم العام:

```css
/* اختياري: يمكن استخدامها في الصفحات المستقلة لضمان نفس المظهر */
--adora-page-bg: linear-gradient(to bottom right, #f8fafc, #f1f5f9, #e2e8f0);
--adora-standalone-card-bg: linear-gradient(to right, #f1f5f9, #cbd5e1);
--adora-standalone-card-radius: 28px;
--adora-standalone-card-shadow: 0 20px 60px rgba(0, 0, 0, 0.12);
--adora-standalone-input-bg: #ffffff;
--adora-standalone-input-border: #e2e8f0;
--adora-standalone-heading: #1e293b;
--adora-standalone-muted: #64748b;
```

**متغيرات إضافية لتطبيق React فقط:** `--adora-panel-subtle`, `--adora-divider-row`, `--adora-divider-column`, `--adora-divider-section` — تُعرّف في `app/src/index.css` وتُستخدم في جداول/ملخص تطبيق React ولا يلزم تكرارها في rewards.

---

## 3. المكونات المشتركة

### 3.1 البطاقة (Glass)

- **الوضع الداكن:** خلفية متدرجة خفيفة، `backdrop-blur-xl`، حد `var(--adora-border)`.
- **الوضع الفاتح:** خلفية بيضاء شبه معتمة، ظل خفيف، حد أوضح.
- **لا لمعان (shine)** على الأزرار؛ ظلال هادئة.

### 3.2 الأزرار (الترويسة — action-header-buttons.css)

- حدود: `var(--adora-border)`.
- عند الـ hover: `var(--adora-hover-bg)` و `var(--adora-focus-border)`.
- اللون الأساسي (primary): `var(--adora-accent)`.
- بدون تأثير `::before` لامع.

### 3.3 حقول الإدخال

- **داكن:** `background: var(--adora-input-bg)`, `border: var(--adora-border)`.
- **فاتح:** نفس المتغيرات (تتغير حسب الثيم).
- **تركيز:** `border-color: var(--adora-focus-border)`, `ring: var(--adora-focus-border)`.

### 3.4 الجداول

- رؤوس: `background: var(--adora-table-header-bg)`, `color: var(--adora-text)`, `border-color: var(--adora-border)`.
- في الوضع الفاتح: حدود وتباين أوضح (مراجعة `.cursor/rules/workflow-and-quality.mdc`).

---

## 4. الملفات التي تحتوي الثيم

| الملف | النطاق |
|-------|--------|
| `app/src/index.css` | React: body, .glass, theme variables, summary-section |
| `app/public/rewards/src/styles.css` | صفحة المكافآت: الجدول، الفلاتر، التقارير، النوافذ المنبثقة |
| `app/Rewards/src/styles.css` | نسخة مزامنة من المكافآت |
| `app/shared/action-header-buttons.css` | أزرار الترويسة فقط (تعتمد على --adora-*) |
| `app/src/AdminLoginForm.tsx` | صفحة الدخول (ثيم فاتح ثابت حالياً) |
| `app/src/AdminGate.tsx` | بوابة المفتاح (يُفضّل استخدام المتغيرات أو نفس ثيم الدخول) |

---

## 5. قواعد التحديث (حسب الـ Rules)

- **قبل التعديل:** قراءة الدالة أو القسم كاملًا قبل تغيير الألوان أو الأنصبة.
- **UPDATE > CREATE:** تعديل القيم في الملفات الموجودة (أو في هذا المستند أولاً) بدل إنشاء قيم جديدة متضاربة.
- **اللون التركوازي:** `#14b8a6` أو `var(--adora-accent)` في كل الصفحات والنوافذ.
- **لا مفاتيح أو توكنات ثابتة** في الكود.
- بعد أي تغيير: تشغيل `read_lints` على الملفات المعدَّلة.

---

## 6. مزامنة الملفات

- **app/public/rewards/src/styles.css** و **app/Rewards/src/styles.css**: إن وُجد نسختان للمكافآت، يجب أن تبقى متغيرات الثيم والقيم الموحدة (مثل `--adora-page-bg`, `--adora-standalone-card-*`) متطابقة في الاثنين. مراجعة DESIGN-SYSTEM.md عند أي تغيير.

## 7. مراجعة دورية

- عند إضافة صفحة أو نافذة جديدة: استخدام `var(--adora-*)` وعدم hardcode ألوان ثيم.
- عند تغيير لون العلامة أو خلفية الوضع الفاتح: تحديث هذا المستند ثم الثلاثة ملفات CSS أعلاه.
