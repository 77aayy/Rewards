/**
 * Adora theme: dark/light. Vanilla JS, no heavy deps.
 * - React: import { getTheme, applyTheme, toggleTheme }
 * - Rewards: load as script type="module", use window.AdoraTheme
 */

const THEME_KEY = 'adora_theme';
const VALID = ['dark', 'light'];

function getTheme() {
  if (typeof window === 'undefined') return 'dark';
  const stored = localStorage.getItem(THEME_KEY);
  if (VALID.includes(stored)) return stored;
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) return 'light';
  return 'dark';
}

function applyTheme(theme) {
  if (typeof theme !== 'string' || !VALID.includes(theme)) theme = getTheme();
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {}
  if (typeof document !== 'undefined' && document.documentElement) {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

function toggleTheme() {
  const next = getTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}

if (typeof window !== 'undefined') {
  window.AdoraTheme = { getTheme, applyTheme, toggleTheme };
}

export { getTheme, applyTheme, toggleTheme };
