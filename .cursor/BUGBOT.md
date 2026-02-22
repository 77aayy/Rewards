# Bugbot Rules — Adora / Rewards Project

Bugbot: apply these rules when reviewing pull requests. Flag any violation.

## Security (Critical)

- **No hardcoded secrets:** Never commit API keys, tokens, or passwords. Use env vars / Firebase config injection.
- **No eval() or exec():** Flag any use of `eval`, `Function()`, or `exec` in code.
- **Input validation:** User input (IDs, form values, URL params) must be validated and escaped before DOM/DB use.
- **Firebase rules:** Changes to Firebase config or security rules must not relax `allow read/write` without explicit justification.

## React / TypeScript

- **Type safety:** Avoid `any`; prefer proper types. Flag untyped `event` handlers or missing generics.
- **Hooks rules:** Dependencies in `useEffect`/`useCallback`/`useMemo` must be correct; flag missing or stale deps.
- **Keys in lists:** All `map()` over arrays must use stable, unique `key` props.
- **Async handling:** Unhandled promise rejections, missing try/catch in async code—flag them.

## DOM & Escaping

- **Dynamic IDs:** Ensure `getElementById`, `querySelector`, and `id` attributes use consistent, safe IDs (no user input in IDs without sanitization).
- **onclick / innerHTML:** User-derived values in attributes or HTML must be escaped; flag XSS risks.
- **periodId / IDs:** Changes touching `periodId`, `periodIdSafe`, or similar—verify both HTML and JS stay in sync.

## Edge Cases

- **Empty/loading states:** New UI must handle empty data, loading, and error states.
- **Print/export:** If feature includes print or export, action buttons must be hidden (e.g. `no-print`).
- **Invalid input:** Forms and parsers must guard against null, undefined, empty strings, and malformed data.

## Code Quality

- **Scope:** Variables used must be in scope; flag `ReferenceError` risks.
- **Orphan data:** New writes to DB must have a corresponding admin/receiver view or feedback.
- **TODO/FIXME:** Prefer issues over long-standing TODO comments; flag TODOs that look like bugs.
