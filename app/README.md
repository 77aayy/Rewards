# React + TypeScript + Vite — مشروع إليت / App

**قبل الرفع (Deploy):** انسخ `.env.example` إلى `.env` واملأ القيم (مفتاح الأدمن، الإيميلات، إعداد Firebase) قبل النشر الحقيقي. راجع `PRE-DEPLOY-STEPS.md` و `Rewards/SECURITY.md` (تقييد API key + اختبار). شغّل `npm run pre-deploy-check` للتحقق من الأسرار.

هذا المشروع يوفّر واجهة التحليل (رفع الملفات) وبوابة الأدمن وتطبيق المكافآت (من `Rewards` مُزامَن إلى `public/rewards`).

| الملف | الاستخدام |
|-------|-----------|
| `PRE-DEPLOY-STEPS.md` | خطوات قبل النشر (تقييد API key، CORS للـ localhost). |
| `docs/DEV-SETUP.md` | تشغيل التطبيق محلياً (منفذ واحد، روابط). |
| `docs/CLEANUP.md` | هيكل المشروع وما يُحذف وما لا يُحذف. |
| `docs/BROWSER-SUPPORT.md` | المتصفحات المدعومة. |

**المتطلبات:** Node بإصدار 20 أو أحدث (راجع `engines` في `package.json` أو استخدم `nvm use` مع ملف `.nvmrc` في مجلد `app`).

**المتصفحات المستهدفة:** التطبيق يستهدف المتصفحات الحديثة (آخر إصدارين من Chrome، Firefox، Safari، Edge) ويعتمد على واجهات حديثة مثل Fetch، localStorage، URLSearchParams، classList. للتفاصيل راجع `docs/BROWSER-SUPPORT.md`.

---

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```
