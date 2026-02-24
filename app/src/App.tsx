import { useState, useCallback, useMemo, useRef, useEffect, type ComponentType } from 'react';
import { createPortal } from 'react-dom';
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  setPersistence,
  browserSessionPersistence,
  signOut,
  type User,
} from 'firebase/auth';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  createColumnHelper,
  type SortingState,
} from '@tanstack/react-table';
import {
  Upload,
  FileSpreadsheet,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Search,
  X,
  Users,
  BarChart3,
  AlertTriangle,
  Play,
  Crown,
  ShieldCheck,
  ShieldOff,
  FolderUp,
  CircleCheck,
  CircleDashed,
  Trash2,
  Link2,
  TrendingDown,
  Moon,
  Sun,
  Printer,
  Info,
  FileText,
  Settings as SettingsIcon,
  Plus,
  RotateCcw,
  Send,
  ChevronUp,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { getTheme, toggleTheme } from '../shared/theme.js';
import type { MatchedRow, StaffRecord, BookingSource, ShiftType, RoomCategory } from './types';
import {
  ADMIN_SECRET_KEY,
  ADMIN_ALLOWED_EMAILS,
  ADMIN_AUTH_SESSION_KEY,
  ADMIN_LAST_EMAIL_KEY,
  ADMIN_AUTH_APP_NAME,
  FIREBASE_CONFIG,
} from './adminConfig';
import { AdminGate } from './AdminGate';
import { AdminLoginForm } from './AdminLoginForm';
import instructionsBodyHtml from '../shared/instructionsBody.html?raw';
import headerButtonsConfig from '../shared/headerButtonsConfig.json';
// conditions-content.json يُحمّل ديناميكياً من /shared/conditions-content.json ليتوحد مع صفحة المكافآت (لا استيراد ثابت)

// مراجعة cleanup: كل useEffect يضيف listener أو subscription يعيد دالة cleanup (انظر addEventListener message و onAuthStateChanged).

type HeaderButtonVariant = 'default' | 'red' | 'cyan' | 'primary' | 'amber' | 'violet';
interface HeaderButtonDef {
  id: string;
  label: string;
  labelShort?: string;
  variant: HeaderButtonVariant;
  context: 'rewards' | 'analysis' | 'both';
  onclick?: string;
  actionType?: string;
  iconId?: string;
  title?: string;
  hidden?: boolean;
}
const HEADER_BUTTONS = (headerButtonsConfig as { buttons: HeaderButtonDef[] }).buttons;
const HEADER_VARIANT_CLASS: Record<HeaderButtonVariant, string> = {
  default: 'action-header-btn action-header-btn-default',
  red: 'action-header-btn action-header-btn--red',
  cyan: 'action-header-btn action-header-btn--cyan',
  primary: 'action-header-btn action-header-btn--primary',
  amber: 'action-header-btn action-header-btn--amber',
  violet: 'action-header-btn action-header-btn--violet',
};
const HEADER_ICON_MAP: Record<string, ComponentType<{ className?: string }>> = {
  settings: SettingsIcon,
  'log-out': RotateCcw,
  info: Info,
  'file-text': FileText,
  'bar-chart3': BarChart3,
};
import {
  parseStaffFile,
  parseChangeLog,
  parseReportFile,
  parseUnitsReport,
  buildLogLookup,
  buildUnitsLookup,
  aggregateData,
  getStaffFileStats,
  getStaffDateRange,
  getLogFileStats,
  getReportFileStats,
  getUnitsFileStats,
  detectFileType,
  getFileTypeLabel,
  getFileTypeIcon,
  getStaffBranches,
  extractRoomNumber,
  MAX_FILE_SIZE_BYTES,
  setXLSXModule,
  type FileDetectionResult,
} from './parser';
import {
  type AppConfig,
  type RoomPriceRule,
  type MergedRoomRule,
  loadConfig,
  saveConfig,
  hasLocalConfig,
  ensureBranchConfig,
  getDefaultConfig,
  saveDefaultConfig,
  DEFAULT_CONFIG,
} from './config';

// ===== Theme toggle (small, distinct; used in header and entry pages) =====
function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getTheme());
  const handleClick = useCallback(() => {
    toggleTheme();
    setTheme(getTheme());
  }, []);
  const isDark = theme === 'dark';
  return (
    <button
      type="button"
      onClick={handleClick}
      className={`p-2 rounded-xl border border-[var(--adora-border)] bg-[var(--adora-bg-card)] hover:bg-[var(--adora-hover-bg)] text-[var(--adora-text)] transition-[background-color,color,border-color] duration-300 ease-out ${className}`}
      title={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
      aria-label={isDark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
    >
      {isDark ? <Sun className="w-5 h-5 text-[var(--adora-accent)]" /> : <Moon className="w-5 h-5 text-[var(--adora-accent)]" />}
    </button>
  );
}

// ===== Helpers =====

const EXCEL_ALLOWED_EXT = /\.xlsx?$/i;

function validateExcelFile(file: File): { ok: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { ok: false, error: `حجم الملف يتجاوز الحد المسموح (10 ميجابايت): ${file.name}` };
  }
  if (!EXCEL_ALLOWED_EXT.test(file.name)) {
    return { ok: false, error: `نوع الملف غير مدعوم (استخدم .xlsx أو .xls): ${file.name}` };
  }
  return { ok: true };
}

function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// ===== FilterSelect =====

function FilterSelect({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm text-slate-400 font-medium">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="border border-white/10 text-sm rounded-xl px-3 py-2
                   focus:ring-2 focus:ring-[var(--adora-focus-border)] focus:border-[var(--adora-focus-border)] outline-none transition-all"
        style={{ colorScheme: 'dark' }}>
        <option value="">الكل</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

// ===== File slot =====

interface FileSlot {
  slotKey: string;
  baseType: string;
  branch: string;
  file: File | null;
  buffer: ArrayBuffer | null;
  stats: string | null;
}

// ===== Column Definitions =====

const ch = createColumnHelper<MatchedRow>();

const columns = [
  ch.display({
    id: 'status',
    header: '',
    cell: (i) => i.row.original.isExcess
      ? <ShieldOff className="w-3.5 h-3.5 text-amber-500/70" />
      : <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/60" />,
    size: 24,
  }),
  ch.accessor('employeeName', {
    header: 'الموظف',
    size: 90,
    cell: (i) => <span className="font-medium text-[var(--adora-text)] truncate block text-sm">{i.getValue()}</span>,
  }),
  ch.accessor('branch', {
    header: 'الفرع',
    size: 60,
    cell: (i) => <span className="px-1.5 py-0.5 rounded-full text-[14px] font-medium badge-adora">{i.getValue()}</span>,
  }),
  ch.accessor('bookingNumber', {
    header: 'رقم الحجز',
    size: 65,
    cell: (i) => <span className="text-[var(--adora-text-secondary)] font-mono text-sm">{i.getValue()}</span>,
  }),
  ch.accessor('guestName', {
    header: 'العميل',
    size: 100,
    cell: (i) => <span className="text-[var(--adora-text)] text-sm truncate block">{i.getValue() || '—'}</span>,
  }),
  ch.accessor('roomUnit', {
    header: 'الوحدة',
    size: 90,
    cell: (i) => <span className="text-[var(--adora-text-secondary)] text-sm truncate block">{i.getValue() || '—'}</span>,
  }),
  ch.accessor('roomCategory', {
    header: 'التصنيف',
    size: 46,
    cell: (i) => {
      const v = i.getValue();
      return v === 'VIP' ? (
        <span className="px-1.5 py-0.5 rounded-full text-[14px] font-bold badge-warning flex items-center gap-0.5 w-fit">
          <Crown className="w-2.5 h-2.5" />VIP
        </span>
      ) : (
        <span className="px-1.5 py-0.5 rounded-full text-[14px] font-medium badge-muted">عادي</span>
      );
    },
  }),
  ch.accessor('bookingSource', {
    header: 'المصدر',
    size: 52,
    cell: (i) => {
      const v = i.getValue();
      const c: Record<string, string> = {
        استقبال: 'badge-success',
        بوكينج: 'badge-warning',
        'غير محدد': 'badge-muted',
      };
      return <span className={`px-1.5 py-0.5 rounded-full text-[14px] font-medium ${c[v] || 'badge-muted'}`}>{v}</span>;
    },
  }),
  ch.accessor('shift', {
    header: 'الشفت',
    size: 44,
    cell: (i) => {
      const v = i.getValue();
      const c: Record<string, string> = {
        صباح: 'badge-warning',
        مساء: 'badge-adora',
        ليل: 'badge-muted',
      };
      return <span className={`px-1.5 py-0.5 rounded-full text-[14px] font-medium ${c[v] || 'badge-muted'}`}>{v}</span>;
    },
  }),
  ch.accessor('priceSAR', {
    header: 'السعر',
    size: 70,
    cell: (i) => {
      const row = i.row.original;
      return (
        <div className="flex items-center gap-1">
          <span className="text-[var(--adora-success)] font-mono text-sm font-semibold">{i.getValue().toLocaleString('en-SA')}</span>
          {row.isMerged && (
            <span title={`دمج مع حجز ${row.mergedWithBooking}`} className="flex items-center gap-0.5 px-1 py-0.5 rounded text-[8px] font-bold badge-adora">
              <Link2 className="w-2.5 h-2.5" />دمج
            </span>
          )}
        </div>
      );
    },
  }),
  ch.accessor('nights', {
    header: 'ليالي',
    size: 55,
    cell: (i) => {
      const row = i.row.original;
      return (
        <div className="flex flex-col items-end">
          <span className="text-[var(--adora-text-secondary)] font-mono text-sm flex items-center gap-0.5">
            <Moon className="w-2.5 h-2.5 opacity-60" />{row.nights}
            {row.isMonthly && <span className="px-1 py-0 rounded text-[8px] font-bold badge-adora mr-0.5">شهري</span>}
          </span>
          <span className="text-[var(--adora-text-secondary)] font-mono text-[14px]">{row.nightlyRate.toLocaleString('en-SA')}/ل</span>
        </div>
      );
    },
  }),
  ch.accessor('priceShortfall', {
    header: 'تنبيه',
    size: 60,
    cell: (i) => {
      const row = i.row.original;
      if (row.isExcess || !row.minPrice) return <span className="text-[var(--adora-text-secondary)]">—</span>;
      if (row.isRoomTransfer) {
        return <span className="px-1.5 py-0.5 rounded text-[14px] font-bold badge-adora whitespace-nowrap">↔ نقل</span>;
      }
      if (row.priceShortfall <= 0) {
        return <span className="px-1.5 py-0.5 rounded text-[14px] font-bold badge-success">✓ سليم</span>;
      }
      return (
        <div className="flex items-center gap-1">
          <TrendingDown className="w-3 h-3 text-[var(--adora-error)] shrink-0" />
          <span className="px-1.5 py-0.5 rounded text-[14px] font-bold badge-error whitespace-nowrap">▼ {row.priceShortfall.toLocaleString('en-SA')}</span>
        </div>
      );
    },
  }),
  ch.accessor('roomTypeLabel', {
    header: 'الغرفة',
    size: 65,
    cell: (i) => {
      const v = i.getValue();
      if (!v || v === 'غير مصنف' || v === 'غير محدد') return <span className="text-[var(--adora-text-secondary)] text-[14px]">—</span>;
      return <span className="px-1.5 py-0.5 rounded text-[14px] font-medium badge-muted">{v}</span>;
    },
  }),
  ch.accessor('checkInTime', {
    header: 'الدخول',
    size: 68,
    cell: (i) => <span className="text-[var(--adora-text-secondary)] text-[15px] font-mono">{i.getValue()}</span>,
  }),
  ch.accessor('isExcess', {
    header: 'الحالة',
    size: 50,
    cell: (i) => i.getValue()
      ? <span className="px-1.5 py-0.5 rounded-full text-[14px] font-bold badge-warning">زيادة</span>
      : <span className="px-1.5 py-0.5 rounded-full text-[14px] font-bold badge-success">محسوب</span>,
  }),
  ch.accessor('excessReason', {
    header: 'السبب',
    size: 60,
    cell: (i) => {
      const reason = i.getValue();
      if (!reason) return <span className="text-[var(--adora-text-secondary)]">—</span>;
      const cls: Record<string, string> = {
        'تجاوز العدد': 'badge-warning',
        'بدون صلاحية': 'badge-warning',
        'لم يخرج': 'badge-adora',
      };
      const icons: Record<string, string> = {
        'تجاوز العدد': '⚡',
        'بدون صلاحية': '🚫',
        'لم يخرج': '🏨',
      };
      return (
        <span className={`px-1.5 py-0.5 rounded text-[14px] font-medium ${cls[reason] || 'badge-muted'}`}>
          {icons[reason] || ''} {reason}
        </span>
      );
    },
  }),
];

// ===== Main App =====

// ===== localStorage persistence helpers =====
const STORAGE_KEYS = {
  data: 'adora_analysis_data',
  staffList: 'adora_analysis_staffList',
  dateRange: 'adora_analysis_dateRange',
  analyzed: 'adora_analysis_analyzed',
};

function getAdminAuth() {
  const app = getApps().some((a) => a.name === ADMIN_AUTH_APP_NAME)
    ? getApp(ADMIN_AUTH_APP_NAME)
    : initializeApp(FIREBASE_CONFIG, ADMIN_AUTH_APP_NAME);
  return getAuth(app);
}

function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_ALLOWED_EMAILS.includes(normalized);
}

function saveAnalysisToStorage(d: MatchedRow[], staff: StaffRecord[], range: { from: string; to: string } | null) {
  try {
    localStorage.setItem(STORAGE_KEYS.data, JSON.stringify(d));
    localStorage.setItem(STORAGE_KEYS.staffList, JSON.stringify(staff));
    localStorage.setItem(STORAGE_KEYS.dateRange, JSON.stringify(range));
    localStorage.setItem(STORAGE_KEYS.analyzed, 'true');
  } catch (e) {
    console.warn('⚠️ Failed to save analysis to localStorage:', e);
  }
}

function loadAnalysisFromStorage(): {
  data: MatchedRow[];
  staffList: StaffRecord[];
  dateRange: { from: string; to: string } | null;
  analyzed: boolean;
} | null {
  try {
    if (localStorage.getItem(STORAGE_KEYS.analyzed) !== 'true') return null;
    const d = JSON.parse(localStorage.getItem(STORAGE_KEYS.data) || '[]');
    const s = JSON.parse(localStorage.getItem(STORAGE_KEYS.staffList) || '[]');
    const r = JSON.parse(localStorage.getItem(STORAGE_KEYS.dateRange) || 'null');
    if (!Array.isArray(d) || d.length === 0) return null;
    return { data: d, staffList: s, dateRange: r, analyzed: true };
  } catch {
    return null;
  }
}

function clearAnalysisStorage() {
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
}

export default function App() {
  const [authState, setAuthState] = useState<'checking' | 'signed_out' | 'signed_in'>('checking');
  const [, setAuthUserEmail] = useState('');
  const [loginEmail, setLoginEmail] = useState(() => {
    try {
      return (localStorage.getItem(ADMIN_LAST_EMAIL_KEY) || '').toLowerCase();
    } catch {
      return '';
    }
  });
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState('');
  const [loginEmailWarning, setLoginEmailWarning] = useState('');
  const [resetEmailWarning, setResetEmailWarning] = useState('');
  const [gateKey, setGateKey] = useState('');
  const [adminEntryMode, setAdminEntryMode] = useState<'checking' | 'redirecting' | 'analysis' | 'blocked'>('checking');
  const adminKeyFromUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return new URLSearchParams(window.location.search).get('admin') || '';
  }, []);

  /** روابط الإداريين: /supervisor|hr|accounting|manager/TOKEN/PERIOD يجب أن تفتح صفحة المكافآت مباشرة وليس بوابة المفتاح */
  const adminRoleRedirect = useMemo(() => {
    if (typeof window === 'undefined') return null;
    const pathname = window.location.pathname || '';
    const m = pathname.match(/^\/(supervisor|hr|accounting|manager)\/([^/]+)\/([^/]+)\/?$/);
    if (!m) return null;
    const [, role, token, period] = m;
    const origin = window.location.origin || '';
    const base = origin + '/rewards';
    return base + '?role=' + encodeURIComponent(role) + '&token=' + encodeURIComponent(token) + '&period=' + encodeURIComponent(period);
  }, []);

  useEffect(() => {
    if (adminRoleRedirect && window.location.href !== adminRoleRedirect) {
      window.location.replace(adminRoleRedirect);
    }
  }, [adminRoleRedirect]);

  const isAdminLink = adminKeyFromUrl === ADMIN_SECRET_KEY;

  useEffect(() => {
    if (!isAdminLink) {
      setAuthState('signed_out');
      return;
    }
    const auth = getAdminAuth();
    const unsub = onAuthStateChanged(auth, async (user: User | null) => {
      if (!user) {
        setAuthState('signed_out');
        setAuthUserEmail('');
        localStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
        return;
      }
      if (!isAllowedAdminEmail(user.email)) {
        await signOut(auth).catch(() => {});
        setAuthError('الحساب غير مخوّل للإدارة.');
        setAuthState('signed_out');
        setAuthUserEmail('');
        localStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
        return;
      }
      const email = (user.email || '').toLowerCase();
      setAuthUserEmail(email);
      setLoginEmail(email);
      localStorage.setItem(ADMIN_AUTH_SESSION_KEY, JSON.stringify({ email, ts: Date.now() }));
      localStorage.setItem(ADMIN_LAST_EMAIL_KEY, email);
      setAuthState('signed_in');
      setAuthError('');
    });
    return () => unsub();
  }, [isAdminLink]);

  // بعد تسجيل الدخول: دائماً ندخل على صفحة التحليل (الرفع) — لا نوجّه تلقائياً لجدول المكافآت
  useEffect(() => {
    if (!isAdminLink) {
      setAdminEntryMode('blocked');
      return;
    }
    if (authState !== 'signed_in') return;
    setAdminEntryMode('analysis');
  }, [isAdminLink, authState]);

  const handleLogin = useCallback(async () => {
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError('اكتب الإيميل وكلمة المرور.');
      return;
    }
    setLoginLoading(true);
    setAuthError('');
    try {
      const auth = getAdminAuth();
      // جلسة الأدمن: جلسة الجلسة فقط — لا تخزين محلي حتى إغلاق المتصفح = تسجيل خروج تلقائي
      await setPersistence(auth, browserSessionPersistence);
      const cred = await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      if (!isAllowedAdminEmail(cred.user.email)) {
        await signOut(auth);
        throw new Error('UNAUTHORIZED_ADMIN');
      }
      localStorage.setItem(ADMIN_LAST_EMAIL_KEY, loginEmail.trim().toLowerCase());
      setLoginPassword('');
    } catch (err: unknown) {
      const code = (err as { code?: string; message?: string })?.code || (err as { message?: string })?.message || '';
      if (String(code).includes('UNAUTHORIZED_ADMIN')) setAuthError('هذا الحساب ليس ضمن حسابات الأدمن المصرح بها.');
      else if (String(code).includes('auth/invalid-credential') || String(code).includes('auth/wrong-password') || String(code).includes('auth/user-not-found')) setAuthError('بيانات الدخول غير صحيحة.');
      else if (String(code).includes('auth/too-many-requests')) setAuthError('محاولات كثيرة. انتظر دقيقة وحاول مرة أخرى.');
      else if (
        String(code).includes('API_KEY_HTTP_REFERRER_BLOCKED') ||
        (String(code).toLowerCase().includes('referer') && String(code).toLowerCase().includes('blocked'))
      ) {
        setAuthError('دخول Firebase مرفوض لأن localhost غير مضاف في API key restrictions. أضف localhost ثم حاول مرة أخرى.');
      }
      else if (
        String(code).includes('API_KEY_SERVICE_BLOCKED') ||
        String(code).toLowerCase().includes('identitytoolkit') ||
        (String(code).toLowerCase().includes('service') && String(code).toLowerCase().includes('blocked'))
      ) {
        setAuthError("دخول Firebase مرفوض لأن خدمة Authentication محظورة في API restrictions. غيّرها إلى Don't restrict key أو اسمح identitytoolkit.");
      }
      else setAuthError('تعذر تسجيل الدخول الآن. حاول مرة أخرى.');
    } finally {
      setLoginLoading(false);
    }
  }, [loginEmail, loginPassword]);

  const handleResetPassword = useCallback(async () => {
    if (!resetEmail.trim()) {
      setResetStatus('اكتب الإيميل أولًا.');
      return;
    }
    try {
      await sendPasswordResetEmail(getAdminAuth(), resetEmail.trim());
      setResetStatus('تم إرسال رابط استعادة كلمة المرور على الإيميل.');
    } catch {
      setResetStatus('تعذر إرسال الرابط الآن. تأكد من الإيميل وحاول مرة أخرى.');
    }
  }, [resetEmail]);

  const enforceStrictEmailInput = useCallback((rawValue: string, target: 'login' | 'reset') => {
    // Email is strict: lowercase latin only. Block Arabic/uppercase immediately.
    const hasArabic = /[\u0600-\u06FF]/.test(rawValue);
    const hasUpper = /[A-Z]/.test(rawValue);
    const hasDisallowed = /[^a-z0-9@._-]/.test(rawValue);
    const normalized = rawValue.toLowerCase().replace(/[^a-z0-9@._-]/g, '');
    const warning = (hasArabic || hasUpper || hasDisallowed)
      ? 'مسموح فقط: حروف إنجليزية صغيرة + أرقام + @ . _ - (بدون عربي أو Capital).'
      : '';

    if (target === 'login') {
      setLoginEmail(normalized);
      setLoginEmailWarning(warning);
    } else {
      setResetEmail(normalized);
      setResetEmailWarning(warning);
    }
  }, []);

  // Config (persistent)
  const [config, setConfig] = useState<AppConfig>(() => loadConfig());
  // Last transfer payload — child tab can request it via postMessage if localStorage fails
  const transferPayloadRef = useRef<Record<string, unknown> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // On first load: if no local config (new device), try fetching from Firebase
  useEffect(() => {
    if (hasLocalConfig()) return; // Already has local settings — skip
    import('./firebase').then(({ loadConfigFromFirebase }) => {
      loadConfigFromFirebase({ forceFetch: true }).then((fbConfig) => {
        if (fbConfig) {
          setConfig(fbConfig);
          saveConfig(fbConfig); // Cache locally so next load is instant
        }
      }).catch(() => {/* Firebase unavailable — use defaults */});
    }).catch(() => {/* dynamic import failed */});
  }, []);

  // When Rewards tab asks for payload (e.g. localStorage was empty/cached), send it
  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.data?.type !== 'ADORA_REQUEST_PAYLOAD' || !ev.source) return;
      const payload = transferPayloadRef.current;
      if (!payload) return;
      try {
        (ev.source as Window).postMessage(payload, ev.origin || '*');
      } catch { /* ignore */ }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // File slots — keyed by slotKey (dynamic)
  const [fileSlots, setFileSlots] = useState<Record<string, FileSlot>>({});
  const [unknownFiles, setUnknownFiles] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [filesSectionCollapsed, setFilesSectionCollapsed] = useState(true);

  // Analysis — restore from localStorage if available
  const [cachedAnalysis] = useState(() => loadAnalysisFromStorage());
  const [data, setData] = useState<MatchedRow[]>(() => cachedAnalysis?.data ?? []);
  const [staffList, setStaffList] = useState<StaffRecord[]>(() => cachedAnalysis?.staffList ?? []);
  const [dateRange, setDateRange] = useState<{ from: string; to: string } | null>(() => cachedAnalysis?.dateRange ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(() => cachedAnalysis?.analyzed ?? false);
  const [loadProgress, setLoadProgress] = useState(false);

  // Table
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [fBranch, setFBranch] = useState('');
  const [fShift, setFShift] = useState('');
  const [fSource, setFSource] = useState('');
  const [fRoom, setFRoom] = useState('');
  const [fEmployee, setFEmployee] = useState('');
  const [fCategory, setFCategory] = useState('');
  const [fExcessOnly, setFExcessOnly] = useState(false);
  const [fCountedOnly, setFCountedOnly] = useState(false);
  const [fPriceAlertOnly, setFPriceAlertOnly] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showRatingExplanation, setShowRatingExplanation] = useState(false);
  const [showConditions, setShowConditions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Detect and classify files from content
  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;
    setDetecting(true);
    setAnalyzed(false);
    const newSlots = { ...fileSlots };
    const newUnknown: string[] = [...unknownFiles];
    const rejectionMessages: string[] = [];
    let updatedConfig = config;

    try {
      const xlsxMod = await import('xlsx');
      setXLSXModule(xlsxMod);
    } catch (err) {
      setDetecting(false);
      alert('تعذّر تحميل مكتبة قراءة Excel. جرّب تحديث الصفحة.\n' + (err instanceof Error ? err.message : String(err)));
      return;
    }

    try {
    for (const file of fileArray) {
      const validation = validateExcelFile(file);
      if (!validation.ok) {
        newUnknown.push(file.name);
        if (validation.error) rejectionMessages.push(validation.error);
        continue;
      }
      try {
        const buffer = await readFileAsArrayBuffer(file);
        const result: FileDetectionResult = detectFileType(buffer);

        if (result.baseType === 'unknown') {
          newUnknown.push(file.name);
          continue;
        }

        // Auto-discover branches from staff file and ensure config entries
        if (result.baseType === 'staff') {
          const branches = getStaffBranches(buffer);
          for (const br of branches) {
            updatedConfig = ensureBranchConfig(updatedConfig, br);
          }
        }
        // Ensure config entry for this file's branch
        if (result.branch) {
          updatedConfig = ensureBranchConfig(updatedConfig, result.branch);
        }

        // Compute quick stats
        let stats: string | null = null;
        if (result.baseType === 'staff') {
          const s = getStaffFileStats(buffer);
          stats = `${s.activeEmployees} موظف نشط • ${s.dateFrom} → ${s.dateTo}`;
        } else if (result.baseType === 'log') {
          const s = getLogFileStats(buffer);
          stats = `${s.newBookings} حجز جديد`;
        } else if (result.baseType === 'report') {
          const s = getReportFileStats(buffer);
          stats = `${s.bookings} حجز`;
        } else if (result.baseType === 'units') {
          const s = getUnitsFileStats(buffer);
          stats = `${s.bookings} حجز • ${s.units} وحدة`;
        }

        newSlots[result.slotKey] = {
          slotKey: result.slotKey,
          baseType: result.baseType,
          branch: result.branch,
          file,
          buffer,
          stats,
        };
      } catch {
        newUnknown.push(file.name);
      }
    }

    if (rejectionMessages.length > 0) {
      alert(rejectionMessages.length === 1 ? rejectionMessages[0] : rejectionMessages.join('\n'));
    }

    // Preserve user's "اخفاء الفرع" (excluded) from saved config so upload doesn't overwrite it
    // Also keep branches that exist only in savedConfig (e.g. "الحفر" مستبعد) so the option stays visible in Settings
    const savedConfig = loadConfig();
    let mergedConfig = updatedConfig;
    for (const key of Object.keys(updatedConfig.branches)) {
      if (savedConfig.branches[key]?.excluded === true) {
        mergedConfig = {
          ...mergedConfig,
          branches: {
            ...mergedConfig.branches,
            [key]: { ...mergedConfig.branches[key], excluded: true },
          },
        };
      }
    }
    for (const key of Object.keys(savedConfig.branches)) {
      if (!mergedConfig.branches[key]) {
        mergedConfig = {
          ...mergedConfig,
          branches: {
            ...mergedConfig.branches,
            [key]: { ...savedConfig.branches[key] },
          },
        };
      }
    }

    if (mergedConfig !== config) {
      setConfig(mergedConfig);
      saveConfig(mergedConfig);
    }
    setFileSlots(newSlots);
    setUnknownFiles(newUnknown);
    setDetecting(false);
    } catch (err) {
      setDetecting(false);
      alert('حدث خطأ أثناء معالجة الملفات:\n' + (err instanceof Error ? err.message : String(err)));
    }
  }, [fileSlots, unknownFiles, config]);

  const removeSlot = useCallback((key: string) => {
    setFileSlots((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    setAnalyzed(false);
  }, []);

  const clearAll = useCallback(() => {
    setFileSlots({});
    setUnknownFiles([]);
    setAnalyzed(false);
    setData([]);
    setStaffList([]);
    setDateRange(null);
    clearAnalysisStorage();
  }, []);

  /** خروج كامل — تسجيل خروج من Firebase ومسح الجلسة وبيانات التحليل؛ الإعدادات وإدخالات المشرف/الخصومات لا تُمس */
  const handleLogout = useCallback(async () => {
    clearAll();
    try {
      await signOut(getAdminAuth());
    } catch {
      // ignore
    }
    try {
      localStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
      localStorage.removeItem('adora_transfer_payload');
    } catch {
      // ignore
    }
    setAuthState('signed_out');
  }, [clearAll]);

  // Derive dynamic slot list from uploaded files
  const discoveredBranches = useMemo(() => {
    const branches = new Set<string>();
    for (const slot of Object.values(fileSlots)) {
      if (slot.branch) branches.add(slot.branch);
    }
    return [...branches].sort();
  }, [fileSlots]);

  const displaySlots = useMemo(() => {
    const slots: { key: string; baseType: string; branch: string; required: boolean }[] = [
      { key: 'staff', baseType: 'staff', branch: '', required: true },
    ];
    for (const br of discoveredBranches) {
      slots.push({ key: `report-${br}`, baseType: 'report', branch: br, required: true });
      slots.push({ key: `log-${br}`, baseType: 'log', branch: br, required: false });
      slots.push({ key: `units-${br}`, baseType: 'units', branch: br, required: false });
    }
    return slots;
  }, [discoveredBranches]);

  const filledCount = Object.keys(fileSlots).length;
  const isAllFilesFilled = filledCount > 0 && filledCount === displaySlots.length;
  const hasStaff = !!fileSlots['staff'];
  const hasAnyReport = Object.values(fileSlots).some((s) => s.baseType === 'report');
  const canAnalyze = hasStaff && hasAnyReport;

  useEffect(() => {
    if (isAllFilesFilled) setFilesSectionCollapsed(true);
  }, [isAllFilesFilled]);

  const startAnalysis = useCallback(async () => {
    if (!canAnalyze) return;
    setAnalyzing(true); setLoadProgress(false);
    await new Promise((r) => setTimeout(r, 100));
    setLoadProgress(true);

    try {
      const staffBuf = fileSlots['staff']!.buffer!;
      const staff = parseStaffFile(staffBuf, config);

      // Collect all report/log/units bookings across all branches
      const allReportBookings: ReturnType<typeof parseReportFile> = [];
      const allLogBookings: ReturnType<typeof parseChangeLog> = [];
      const allUnits: ReturnType<typeof parseUnitsReport> = [];

      for (const slot of Object.values(fileSlots)) {
        if (!slot.buffer || slot.baseType === 'staff') continue;
        const branch = slot.branch;
        if (!branch) continue;
        // Skip excluded branches
        if (config.branches[branch]?.excluded) continue;

        if (slot.baseType === 'report') {
          allReportBookings.push(...parseReportFile(slot.buffer, branch));
        } else if (slot.baseType === 'log') {
          allLogBookings.push(...parseChangeLog(slot.buffer, branch));
        } else if (slot.baseType === 'units') {
          allUnits.push(...parseUnitsReport(slot.buffer, branch));
        }
      }

      const logLookup = buildLogLookup(allLogBookings);
      const unitsLookup = buildUnitsLookup(allUnits);
      const staffDateRange = getStaffDateRange(staffBuf);
      const matched = aggregateData(staff, allReportBookings, logLookup, unitsLookup, staffDateRange, config);
      const stats = getStaffFileStats(staffBuf);

      await new Promise((r) => setTimeout(r, 2000));

      setStaffList(staff);
      setData(matched);
      const range = { from: stats.dateFrom, to: stats.dateTo };
      setDateRange(range);
      setAnalyzed(true);
      // Persist to localStorage so refresh preserves the results
      saveAnalysisToStorage(matched, staff, range);
    } catch (err) {
      console.error('Analysis error:', err);
      alert('خطأ في التحليل. تأكد من صحة الملفات.');
    }
    setAnalyzing(false); setLoadProgress(false);
  }, [canAnalyze, fileSlots, config]);

  const [pendingReanalysis, setPendingReanalysis] = useState(false);

  const handleSaveConfig = useCallback((newConfig: AppConfig) => {
    setConfig(newConfig);
    saveConfig(newConfig);
    import('./firebase').then(({ saveConfigToFirebase }) => saveConfigToFirebase(newConfig).catch(() => {}));
    setShowSettings(false);
    // If already analyzed, trigger automatic re-analysis with new config
    if (analyzed && canAnalyze) {
      setPendingReanalysis(true);
    }
  }, [analyzed, canAnalyze]);

  // Auto re-analyze when config changes (settings saved while data is displayed)
  useEffect(() => {
    if (pendingReanalysis && canAnalyze && !analyzing) {
      setPendingReanalysis(false);
      startAnalysis();
    }
  }, [pendingReanalysis, canAnalyze, analyzing, startAnalysis]);

  // Derived data
  const countedData = useMemo(() => data.filter((d) => !d.isExcess), [data]);
  const excessData = useMemo(() => data.filter((d) => d.isExcess), [data]);

  const uniqueBranches = useMemo(() => [...new Set(data.map((r) => r.branch))], [data]);
  const uniqueShifts = useMemo(() => [...new Set(data.map((r) => r.shift))], [data]);
  const uniqueSources = useMemo(() => [...new Set(data.map((r) => r.bookingSource))], [data]);
  const uniqueRoomTypes = useMemo(() => [...new Set(data.map((r) => r.roomUnit).filter(Boolean))].sort(), [data]);
  const uniqueEmployees = useMemo(() => [...new Set(data.map((r) => r.employeeName))].sort(), [data]);
  const uniqueCategories = useMemo(() => [...new Set(data.map((r) => r.roomCategory))], [data]);

  const filteredData = useMemo(() => {
    let r = data;
    if (fBranch) r = r.filter((d) => d.branch === fBranch);
    if (fShift) r = r.filter((d) => d.shift === fShift);
    if (fSource) r = r.filter((d) => d.bookingSource === fSource);
    if (fRoom) r = r.filter((d) => d.roomUnit === fRoom);
    if (fEmployee) r = r.filter((d) => d.employeeName === fEmployee);
    if (fCategory) r = r.filter((d) => d.roomCategory === fCategory);
    if (fExcessOnly) r = r.filter((d) => d.isExcess);
    if (fCountedOnly) r = r.filter((d) => !d.isExcess);
    if (fPriceAlertOnly) r = r.filter((d) => !d.isExcess && d.priceShortfall > 0);
    if (globalFilter) {
      const q = globalFilter.toLowerCase();
      r = r.filter((d) =>
        d.employeeName.toLowerCase().includes(q) ||
        d.guestName.toLowerCase().includes(q) ||
        d.roomUnit.toLowerCase().includes(q) ||
        d.bookingNumber.includes(q)
      );
    }
    return r;
  }, [data, fBranch, fShift, fSource, fRoom, fEmployee, fCategory, fExcessOnly, fCountedOnly, fPriceAlertOnly, globalFilter]);

  const table = useReactTable({
    data: filteredData,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const clearFilters = () => {
    setFBranch(''); setFShift(''); setFSource(''); setFRoom('');
    setFEmployee(''); setFCategory(''); setFExcessOnly(false);
    setFCountedOnly(false); setFPriceAlertOnly(false); setGlobalFilter('');
  };

  const hasFilters = fBranch || fShift || fSource || fRoom || fEmployee || fCategory || fExcessOnly || fCountedOnly || fPriceAlertOnly || globalFilter;

  const staffTotal = useMemo(() => staffList.reduce((s, r) => s + r.bookingCount, 0), [staffList]);
  const priceAlertData = useMemo(() => countedData.filter((d) => d.priceShortfall > 0), [countedData]);
  const totalShortfall = useMemo(() => priceAlertData.reduce((s, d) => s + d.priceShortfall, 0), [priceAlertData]);
  const mergedCount = useMemo(() => countedData.filter((d) => d.isMerged).length, [countedData]);
  const coverage = staffTotal > 0 ? ((countedData.length / staffTotal) * 100).toFixed(1) : '0';
  const excessByReason = useMemo(() => {
    const m: Record<string, number> = { 'تجاوز العدد': 0, 'بدون صلاحية': 0, 'لم يخرج': 0 };
    for (const d of excessData) { if (d.excessReason) m[d.excessReason] = (m[d.excessReason] || 0) + 1; }
    return m;
  }, [excessData]);

  const handleGateSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const key = (gateKey || '').trim();
    if (!key) return;
    const url = new URL(window.location.href);
    url.searchParams.set('admin', key);
    window.location.href = url.pathname + url.search;
  }, [gateKey]);

  return (
    adminRoleRedirect ? (
      <div dir="rtl" className="min-h-screen text-[var(--adora-text)] relative flex items-center justify-center px-4">
        <ThemeToggle className="fixed top-4 left-4 z-[100]" />
        <div className="glass rounded-2xl border border-white/15 p-6 max-w-xl w-full text-center">
          <h2 className="text-xl font-black text-turquoise mb-2">جاري التحويل</h2>
          <p className="text-sm text-[var(--adora-text-secondary)] leading-7">تحويلك إلى شاشة المكافآت بحسب صلاحيات الرابط...</p>
        </div>
      </div>
    ) : adminKeyFromUrl === '' ? (
      <>
        <ThemeToggle className="fixed top-4 left-4 z-[100]" />
        <AdminGate gateKey={gateKey} setGateKey={setGateKey} onSubmit={handleGateSubmit} />
      </>
    ) : !isAdminLink ? (
      <div dir="rtl" className="min-h-screen text-[var(--adora-text)] relative flex items-center justify-center px-4">
        <ThemeToggle className="fixed top-4 left-4 z-[100]" />
        <div className="glass rounded-2xl border border-white/15 p-6 max-w-xl w-full text-center">
          <h2 className="text-xl font-black text-turquoise mb-2">غير مصرح بالدخول</h2>
          <p className="text-sm text-[var(--adora-text-secondary)] leading-7">
            مفتاح الدخول غير صحيح. تأكد من الرابط أو أدخل المفتاح من الصفحة الرئيسية.
          </p>
          <a href={typeof window !== 'undefined' ? window.location.origin + '/' : '/'} className="mt-4 inline-block text-[var(--adora-accent)] hover:opacity-90 text-sm font-semibold">← العودة لصفحة الدخول</a>
        </div>
      </div>
    ) : authState === 'checking' ? (
      <div dir="rtl" className="min-h-screen text-[var(--adora-text)] relative flex items-center justify-center px-4">
        <ThemeToggle className="fixed top-4 left-4 z-[100]" />
        <div className="glass rounded-2xl border border-white/15 p-6 max-w-xl w-full text-center">
          <h2 className="text-xl font-black text-turquoise mb-2">جاري التحقق من الجلسة</h2>
          <p className="text-sm text-[var(--adora-text-secondary)] leading-7">لحظات من فضلك...</p>
        </div>
      </div>
    ) : authState === 'signed_out' ? (
      <>
        <ThemeToggle className="fixed top-4 left-4 z-[100]" />
        <AdminLoginForm
        loginEmail={loginEmail}
        onLoginEmailChange={enforceStrictEmailInput}
        loginPassword={loginPassword}
        setLoginPassword={setLoginPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        loginEmailWarning={loginEmailWarning}
        authError={authError}
        loginLoading={loginLoading}
        onSubmit={handleLogin}
        showReset={showReset}
        onOpenReset={() => {
          setShowReset((s) => !s);
          setResetStatus('');
          setResetEmail(loginEmail);
          setResetEmailWarning('');
        }}
        resetEmail={resetEmail}
        resetEmailWarning={resetEmailWarning}
        resetStatus={resetStatus}
        onResetPassword={handleResetPassword}
      />
      </>
    ) : (adminEntryMode === 'checking' || adminEntryMode === 'redirecting') ? (
      <div dir="rtl" className="min-h-screen text-[var(--adora-text)] relative flex items-center justify-center px-4">
        <ThemeToggle className="fixed top-4 left-4 z-[100]" />
        <div className="fixed inset-0 bg-[var(--adora-overlay-bg)] backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="relative">
            <div className="absolute -inset-20 bg-cyan-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute -inset-14 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="relative bg-[var(--adora-modal-bg)] backdrop-blur-xl border border-[var(--adora-border)] rounded-3xl px-8 sm:px-12 py-10 text-center modal-no-side-shadow max-w-md mx-auto">
              <div className="relative w-16 h-16 mx-auto mb-6">
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 border-r-cyan-400/40 animate-spin" />
                <div className="absolute inset-1.5 rounded-full border-2 border-transparent border-b-teal-400/60 border-l-teal-400/20 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Loader2 className="w-7 h-7 text-[var(--adora-accent)] animate-pulse" />
                </div>
              </div>
              <h2 className="text-xl font-black text-[var(--adora-accent)] mb-2">
                {adminEntryMode === 'redirecting' ? 'جاري فتح شاشة المكافآت' : 'جاري فحص حالة الفترة'}
              </h2>
              <p className="text-sm text-[var(--adora-text-secondary)] leading-7">
                إذا كانت الفترة مفتوحة سيتم تحويلك تلقائياً إلى شاشة المكافآت، وإذا كانت مغلقة ستظهر صفحة رفع الملفات.
              </p>
            </div>
          </div>
        </div>
      </div>
    ) : (
    <div dir="rtl" className="min-h-screen text-[var(--adora-text)] relative">
      {/* Ambient background particles */}
      <div className="particles-bg" />
      {/* Loading overlay */}
      {analyzing && (
        <div className="fixed inset-0 bg-[var(--adora-overlay-bg)] backdrop-blur-md z-100 flex items-center justify-center">
          <div className="relative">
            {/* Ambient glow */}
            <div className="absolute -inset-20 bg-cyan-500/10 rounded-full blur-3xl animate-pulse pointer-events-none" />
            <div className="absolute -inset-14 bg-teal-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="relative bg-[var(--adora-modal-bg)] backdrop-blur-xl border border-[var(--adora-border)] rounded-3xl px-12 py-10 text-center modal-no-side-shadow max-w-sm mx-auto">
              {/* Animated icon */}
              <div className="relative w-20 h-20 mx-auto mb-6">
                {/* Spinning ring */}
                <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-cyan-400 border-r-cyan-400/40 animate-spin" />
                <div className="absolute inset-1.5 rounded-full border-2 border-transparent border-b-teal-400/60 border-l-teal-400/20 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
                {/* Center icon */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <BarChart3 className="w-8 h-8 text-[var(--adora-accent)] animate-pulse" />
                </div>
              </div>

              <h3 className="text-lg font-bold text-[var(--adora-text)] mb-2">جاري التحليل</h3>
              <p className="text-[13px] text-[var(--adora-text-secondary)] mb-6 leading-relaxed">
                المرجع: تقرير إحصائيات الموظفين<br />
                <span className="text-[var(--adora-text-secondary)]">الفلتر: تاريخ الإنشاء + الدخول</span>
              </p>

              {/* Progress bar */}
              <div className="w-full h-1.5 bg-slate-800/80 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-cyan-500 via-teal-400 to-cyan-500 rounded-full transition-all ease-out bg-[length:200%_100%] animate-[shimmer_1.5s_ease-in-out_infinite]"
                  style={{ width: loadProgress ? '100%' : '0%', transitionDuration: '2200ms' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header — unified with Rewards design (non-sticky) */}
      <header className="px-3 sm:px-5 pt-3 sm:pt-4 animate-in">
        <div className="max-w-[1440px] mx-auto glass rounded-2xl sm:rounded-[30px] md:rounded-[40px] border-r-4 sm:border-r-6 md:border-r-8 border-[var(--adora-accent)] p-4 sm:p-6 md:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-5">
            <ThemeToggle className="flex-shrink-0 self-center order-first sm:order-first" />
            {/* Right side (RTL): Logo + Title */}
            <div className="flex items-center gap-3 sm:gap-4 md:gap-5 w-full sm:w-auto">
              <div className="flex-shrink-0">
                <img src="/rewards/unnamed.png" alt="إليت"
                  className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 object-contain rounded-lg"
                  style={{ maxWidth: '80px', maxHeight: '80px' }}
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-[var(--adora-text)] truncate typography-h1">
                  مكافآت فريق عمل فندق إليت
                </h1>
                <p className="header-sub text-[var(--adora-text-secondary)] mt-1 sm:mt-2 font-semibold">
                  {analyzed && dateRange
                    ? <>الفترة: <span className="text-[var(--adora-accent)] font-bold">{dateRange.from} → {dateRange.to}</span></>
                    : 'تحليل الحجوزات — المرجع: تقرير إحصائيات الموظفين'
                  }
                </p>
              </div>
            </div>

            {/* أزرار الترويسة: مصدر واحد من app/shared/headerButtonsConfig.json — نفس المصدر المستخدم في صفحة المكافآت */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2 w-full sm:w-auto justify-end items-center action-header-btns-container">
              {HEADER_BUTTONS.filter((btn) => {
                if (btn.hidden) return false;
                if (btn.context !== 'analysis' && btn.context !== 'both') return false;
                if (['methodology', 'ratingExplanation', 'conditions'].includes(btn.id) && !analyzed) return false;
                return true;
              }).map((btn) => {
                const Icon = btn.iconId ? HEADER_ICON_MAP[btn.iconId] : null;
                const onClick = btn.actionType === 'settings' ? () => setShowSettings(true)
                  : btn.actionType === 'logout' ? handleLogout
                  : btn.actionType === 'methodology' ? () => setShowMethodology(true)
                  : btn.actionType === 'ratingExplanation' ? () => setShowRatingExplanation(true)
                  : btn.actionType === 'conditions' ? () => setShowConditions(true)
                  : undefined;
                return (
                  <button key={btn.id} onClick={onClick} className={HEADER_VARIANT_CLASS[btn.variant]} title={btn.title ?? undefined}>
                    {Icon && <Icon className="w-4 h-4 shrink-0" />}
                    <span className="hidden sm:inline">{btn.label}</span>
                    <span className="sm:hidden">{btn.labelShort ?? btn.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-3 sm:px-5 md:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 relative z-10">
        {/* ===== Upload Section ===== */}
        {!analyzed && !analyzing && (
          <>
            {/* Unified Dropzone */}
            <section className="space-y-6">
              <div
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
                onDragOver={(e) => { e.preventDefault(); }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
                }}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('button')) return;
                  fileInputRef.current?.click();
                }}
                className={`
                  relative flex flex-col items-center justify-center gap-4 rounded-2xl sm:rounded-[28px] border-2 border-dashed
                  cursor-pointer transition-all duration-300 p-10 min-h-[220px] glass
                  ${filledCount > 0
                    ? 'border-[var(--adora-focus-border)] hover:border-[var(--adora-accent)]'
                    : 'border-white/15 hover:border-[var(--adora-focus-border)]'
                  }
                `}
              >
                {detecting ? (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-[var(--adora-focus-border)] border-t-[var(--adora-accent)] rounded-full animate-spin" />
                    <p className="text-turquoise font-semibold">جاري تحليل الملفات...</p>
                  </div>
                ) : (
                  <>
                    <div className="p-4 rounded-2xl bg-[var(--adora-hover-bg)]">
                      <FolderUp className="w-10 h-10 text-turquoise" />
                    </div>
                    <div className="text-center space-y-1.5">
                      <p className="text-lg font-bold text-[var(--adora-text)]">ارفع كل الملفات دفعة واحدة</p>
                      <p className="text-sm text-[var(--adora-text-secondary)]">اسحب الملفات هنا أو اضغط لاختيارها — التعرف تلقائي من المحتوى</p>
                      <p className="text-sm text-[var(--adora-text-secondary)]">تقرير إحصائيات الموظفين + سجل حركات النظام + تقرير حجوزات العملاء + تقرير وحدات الحجوزات</p>
                    </div>
                    <div className="flex items-center gap-2 text-[var(--adora-text-secondary)] text-sm mt-1">
                      <Upload className="w-3.5 h-3.5" /> xlsx / xls
                    </div>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
                      className="mt-2 px-5 py-2.5 rounded-xl bg-[var(--adora-accent)] text-white font-semibold text-sm hover:opacity-90 transition-opacity pointer-events-auto z-10 relative"
                    >
                      اختر ملفات
                    </button>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  multiple
                  aria-label="اختر ملفات Excel"
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', pointerEvents: 'auto', zIndex: 2 }}
                  onChange={(e) => {
                    const target = e.target;
                    const list = target.files;
                    if (list && list.length > 0) {
                      handleFiles(list).catch((err) => {
                        setDetecting(false);
                        alert('خطأ في الرفع: ' + (err instanceof Error ? err.message : String(err)));
                      });
                    }
                    target.value = '';
                  }}
                />
              </div>

              {/* Detected Files Summary — collapsible */}
              {filledCount > 0 && (
                <div className={`rounded-2xl overflow-hidden border transition-colors ${
                  isAllFilesFilled ? 'bg-emerald-950/25 border-emerald-500/50' : 'bg-[var(--adora-input-bg)] border-[var(--adora-border)]'
                }`}>
                  <button
                    type="button"
                    onClick={() => isAllFilesFilled && setFilesSectionCollapsed((c) => !c)}
                    className={`w-full flex items-center justify-between gap-2 p-4 text-right transition-colors ${
                      isAllFilesFilled ? 'hover:bg-emerald-950/30' : 'hover:bg-slate-700/30'
                }`}
                  >
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      {isAllFilesFilled ? (
                        <CircleCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <FileSpreadsheet className="w-4 h-4 text-cyan-400 shrink-0" />
                      )}
                      <span className={isAllFilesFilled ? 'text-[var(--adora-success)]' : 'text-[var(--adora-text)]'}>
                        الملفات المكتشفة ({filledCount}/{displaySlots.length})
                      </span>
                      {isAllFilesFilled && (
                        <span className="text-[14px] font-bold text-[var(--adora-success)] bg-emerald-500/20 border border-emerald-500/40 rounded-full px-2 py-0.5">
                          تم بنجاح 100%
                        </span>
                      )}
                    </h3>
                    <span className="flex items-center gap-2 shrink-0">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); clearAll(); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); clearAll(); } }}
                        className="flex items-center gap-1 text-sm text-[var(--adora-error)]/70 hover:text-[var(--adora-error)] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" /> مسح الكل
                      </span>
                      {isAllFilesFilled && (filesSectionCollapsed ? <ChevronDown className="w-4 h-4 text-[var(--adora-text-secondary)]" /> : <ChevronUp className="w-4 h-4 text-[var(--adora-text-secondary)]" />)}
                    </span>
                  </button>

                  {(!filesSectionCollapsed || !isAllFilesFilled) && (
                  <div className="px-5 pb-5 pt-0 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {displaySlots.map((ds) => {
                      const slot = fileSlots[ds.key];
                      const { color, bg } = getFileTypeIcon(ds.baseType);
                      const label = getFileTypeLabel(ds.baseType, ds.branch);

                      return (
                        <div key={ds.key} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all ${
                          slot
                            ? 'bg-emerald-950/20 border-emerald-500/30'
                            : ds.required
                            ? 'bg-red-950/10 border-red-500/20'
                            : 'bg-[var(--adora-input-bg)] border-[var(--adora-border)]'
                        }`}>
                          <div className={`p-1.5 rounded-lg ${slot ? 'bg-emerald-500/20' : bg}`}>
                            {slot
                              ? <CircleCheck className="w-4 h-4 text-emerald-400" />
                              : <CircleDashed className={`w-4 h-4 ${ds.required ? 'text-[var(--adora-error)]/70' : 'text-slate-500'}`} />
                            }
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${slot ? 'text-[var(--adora-success)]' : color}`}>
                              {label}
                            </p>
                            {slot ? (
                              <p className="text-[14px] text-emerald-400/80 truncate">{slot.file?.name} — {slot.stats}</p>
                            ) : (
                              <p className="text-[14px] text-[var(--adora-text-secondary)]">
                                {ds.required ? 'مطلوب' : 'اختياري (إثراء)'}
                              </p>
                            )}
                          </div>
                          {slot && (
                            <button onClick={() => removeSlot(ds.key)} className="p-1 text-[var(--adora-text-secondary)] hover:text-[var(--adora-error)] transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {unknownFiles.length > 0 && (
                    <div className="flex items-center gap-2 text-sm text-amber-400/80 bg-amber-500/5 px-3 py-2 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>ملفات لم يتم التعرف عليها: {unknownFiles.join('، ')}</span>
                    </div>
                  )}
                  </div>
                  )}
                </div>
              )}

              {/* Analysis Button */}
              <div className="flex flex-col items-center gap-3">
                <div className="flex items-center gap-4">
                  <button onClick={startAnalysis} disabled={!canAnalyze}
                    className="group flex items-center gap-3 px-12 py-4 bg-teal-500 hover:bg-teal-600
                               disabled:bg-slate-700 disabled:text-[var(--adora-text-secondary)]
                               text-white rounded-2xl font-bold text-lg shadow-lg shadow-teal-500/30
                               disabled:shadow-none transition-all duration-300
                               disabled:cursor-not-allowed active:scale-95">
                    <Play className="w-6 h-6" /> بدء التحليل
                  </button>
                  {/* Show "view previous results" if data exists from localStorage */}
                  {data.length > 0 && !analyzed && (
                    <button onClick={() => setAnalyzed(true)}
                      className="flex items-center gap-2 px-6 py-4 bg-[var(--adora-input-bg)] hover:bg-[var(--adora-hover-bg)]
                                 text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] rounded-2xl font-semibold text-sm
                                 border border-[var(--adora-border)] hover:border-[var(--adora-focus-border)]
                                 transition-all duration-300 active:scale-95">
                      <BarChart3 className="w-5 h-5 text-turquoise" /> عرض النتائج السابقة
                    </button>
                  )}
                </div>
                {!canAnalyze && filledCount === 0 && data.length === 0 && (
                  <p className="text-sm text-[var(--adora-text-secondary)]">ارفع الملفات للبدء</p>
                )}
                {!canAnalyze && filledCount > 0 && !hasStaff && (
                  <p className="text-sm text-[var(--adora-error)]/80">مطلوب: تقرير إحصائيات الموظفين</p>
                )}
                {!canAnalyze && hasStaff && !hasAnyReport && (
                  <p className="text-sm text-[var(--adora-error)]/80">مطلوب: تقرير حجوزات العملاء لفرع واحد على الأقل</p>
                )}
              </div>

              {filledCount === 0 && (
                <div className="text-center py-6 text-[var(--adora-text-secondary)]">
                  <FileSpreadsheet className="w-14 h-14 mx-auto mb-3 opacity-15" />
                  <p className="text-sm">اسحب ملفات Excel هنا أو اضغط على المنطقة أعلاه</p>
                </div>
              )}
            </section>
          </>
        )}

        {/* ===== Results ===== */}
        {analyzed && !analyzing && (
          <>
            {/* Stats Cards */}
            <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 animate-in">
              <div className="glass rounded-2xl p-4 border-r-2 border-[var(--adora-focus-border)] hover:border-[var(--adora-accent)] transition-all duration-200">
                <p className="text-[15px] text-turquoise mb-1.5 font-semibold tracking-wide">مرجع الإحصائيات</p>
                <p className="text-2xl font-bold text-[var(--adora-accent)] tabular-nums">{staffTotal.toLocaleString()}</p>
                <p className="text-[14px] text-[var(--adora-text-secondary)] mt-1.5">{staffList.filter((s) => s.bookingCount > 0).length} موظف نشط</p>
              </div>
              <div className="glass rounded-2xl p-4 border-r-2 border-emerald-500/50 hover:border-emerald-500/80 transition-all duration-200">
                <p className="text-[15px] text-[var(--adora-success)] mb-1.5 font-semibold tracking-wide opacity-90">محسوب (مع تفاصيل)</p>
                <p className="text-2xl font-bold text-[var(--adora-success)] tabular-nums">{countedData.length.toLocaleString()}</p>
                <p className="text-[14px] text-[var(--adora-text-secondary)] mt-1.5">تغطية {coverage}%</p>
              </div>
              <div className="glass rounded-2xl p-4 border-r-2 border-amber-500/50 hover:border-amber-500/80 transition-all duration-200">
                <p className="text-[15px] text-[var(--adora-warning)] mb-1.5 font-semibold tracking-wide opacity-90">زيادة (مستبعد)</p>
                <p className="text-2xl font-bold text-[var(--adora-warning)] tabular-nums">{excessData.length}</p>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
                  {excessByReason['لم يخرج'] > 0 && (
                    <span className="text-[14px] text-[var(--adora-accent)]">🏨 {excessByReason['لم يخرج']} لم يخرج</span>
                  )}
                  {excessByReason['تجاوز العدد'] > 0 && (
                    <span className="text-[14px] text-[var(--adora-warning)]">⚡ {excessByReason['تجاوز العدد']} تجاوز</span>
                  )}
                  {excessByReason['بدون صلاحية'] > 0 && (
                    <span className="text-[14px] text-[var(--adora-warning)]">🚫 {excessByReason['بدون صلاحية']} بدون صلاحية</span>
                  )}
                  {excessData.length === 0 && <span className="text-[14px] text-[var(--adora-success)]">✓ مطابق</span>}
                </div>
              </div>
              <div className="glass rounded-2xl p-4 border-r-2 border-red-500/40 hover:border-red-500/70 transition-all duration-200">
                <p className="text-[15px] text-[var(--adora-error)] mb-1.5 font-semibold tracking-wide opacity-90">ناقص (بدون تفاصيل)</p>
                <p className="text-2xl font-bold text-[var(--adora-error)] tabular-nums">{Math.max(0, staffTotal - countedData.length)}</p>
                <p className="text-[14px] text-[var(--adora-text-secondary)] mt-1.5">الإحصائيات &gt; التقارير</p>
              </div>
{/* Hidden: إجمالي الأسعار (محسوب) */}
              <div className={`glass rounded-2xl p-4 border-r-2 transition-all duration-200 ${
                priceAlertData.length > 0 ? 'border-red-500/50 hover:border-red-500/80' : 'border-emerald-500/40 hover:border-emerald-500/70'
              }`}>
                <p className="text-[15px] text-[var(--adora-error)] mb-1.5 font-semibold flex items-center gap-1 tracking-wide opacity-90">
                  <TrendingDown className="w-3 h-3" /> تنبيهات الأسعار
                </p>
                <p className={`text-2xl font-bold tabular-nums ${priceAlertData.length > 0 ? 'text-[var(--adora-error)]' : 'text-[var(--adora-success)]'}`}>
                  {priceAlertData.length > 0 ? priceAlertData.length : '✓'}
                </p>
                <p className="text-[14px] text-[var(--adora-text-secondary)] mt-1.5">
                  {priceAlertData.length > 0
                    ? `نقص ${totalShortfall.toLocaleString('en-SA')} SAR`
                    : 'لا توجد مخالفات سعرية'}
                  {mergedCount > 0 && <span className="text-purple-400/60 mr-1"> • {mergedCount / 2} دمج</span>}
                </p>
              </div>
            </section>

            {/* Employee Breakdown */}
            <EmployeeBreakdown staffList={staffList} data={data} config={config} dateRange={dateRange} />

            {/* Filters */}
            <section className="glass rounded-2xl sm:rounded-[28px] p-5 space-y-4 neon-glow animate-in animate-delay-200">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-[var(--adora-text)] flex items-center gap-2">
                  <Search className="w-4 h-4 text-turquoise" /> الجدول التفصيلي
                </h2>
                <div className="flex items-center gap-3">
                  {hasFilters && (
                    <button onClick={clearFilters} className="flex items-center gap-1 text-sm text-[var(--adora-error)] hover:opacity-90">
                      <X className="w-3 h-3" /> مسح
                    </button>
                  )}
                  <button onClick={() => { setAnalyzed(false); }}
                    className="text-sm text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors">
                    ← رجوع للملفات
                  </button>
                </div>
              </div>

              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--adora-text-secondary)]" />
                <input type="text" placeholder="بحث (موظف، عميل، وحدة، رقم حجز)..."
                  value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-xl
                             pr-10 pl-4 py-2.5 focus:ring-2 focus:ring-[var(--adora-focus-border)] focus:border-[var(--adora-focus-border)]
                             outline-none transition-all placeholder:text-[var(--adora-text-secondary)]" />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                <FilterSelect label="الفرع" value={fBranch} options={uniqueBranches} onChange={setFBranch} />
                <FilterSelect label="المصدر" value={fSource} options={uniqueSources} onChange={setFSource} />
                <FilterSelect label="الشفت" value={fShift} options={uniqueShifts} onChange={setFShift} />
                <FilterSelect label="التصنيف" value={fCategory} options={uniqueCategories} onChange={setFCategory} />
                <FilterSelect label="الوحدة" value={fRoom} options={uniqueRoomTypes} onChange={setFRoom} />
                <FilterSelect label="الموظف" value={fEmployee} options={uniqueEmployees} onChange={setFEmployee} />
              </div>

              <div className="flex items-center gap-3">
                <button onClick={() => { setFCountedOnly(!fCountedOnly); if (!fCountedOnly) setFExcessOnly(false); }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    fCountedOnly
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-[var(--adora-input-bg)] text-[var(--adora-text-secondary)] border border-[var(--adora-border)] hover:text-[var(--adora-text)]'
                  }`}>
                  <ShieldCheck className="w-4 h-4" /> المحسوب فقط
                </button>
                <button onClick={() => { setFExcessOnly(!fExcessOnly); if (!fExcessOnly) { setFCountedOnly(false); setFPriceAlertOnly(false); } }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    fExcessOnly
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-[var(--adora-input-bg)] text-[var(--adora-text-secondary)] border border-[var(--adora-border)] hover:text-[var(--adora-text)]'
                  }`}>
                  <AlertTriangle className="w-4 h-4" /> الزيادة فقط
                </button>
                <button onClick={() => { setFPriceAlertOnly(!fPriceAlertOnly); if (!fPriceAlertOnly) { setFCountedOnly(false); setFExcessOnly(false); } }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    fPriceAlertOnly
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-[var(--adora-input-bg)] text-[var(--adora-text-secondary)] border border-[var(--adora-border)] hover:text-[var(--adora-text)]'
                  }`}>
                  <TrendingDown className="w-4 h-4" /> تنبيهات الأسعار
                </button>
              </div>
            </section>

            {/* Detailed Table */}
            <section className="glass rounded-2xl sm:rounded-[28px] overflow-hidden neon-glow table-section-no-side-shadow animate-in animate-delay-300">
              <div className="overflow-x-auto">
                <table className="text-sm w-full app-detail-table">
                  <thead>
                    {table.getHeaderGroups().map((hg) => (
                      <tr key={hg.id} className="border-b border-[var(--adora-border)]">
                        {hg.headers.map((h) => (
                          <th key={h.id}
                            style={{ minWidth: h.getSize() }}
                            className="px-2 py-2.5 text-right text-[15px] font-semibold text-[var(--adora-text-secondary)]
                                       bg-[var(--adora-table-header-bg)] cursor-pointer hover:text-[var(--adora-accent)] hover:bg-[var(--adora-hover-bg)] transition-colors
                                       select-none whitespace-nowrap overflow-hidden tracking-wide"
                            onClick={h.column.getToggleSortingHandler()}>
                            <div className="flex items-center gap-1">
                              {flexRender(h.column.columnDef.header, h.getContext())}
                              <ArrowUpDown className="w-3 h-3 text-[var(--adora-text-secondary)] shrink-0" />
                            </div>
                          </th>
                        ))}
                      </tr>
                    ))}
                  </thead>
                  <tbody>
                    {table.getRowModel().rows.map((row, idx) => (
                      <tr key={row.id}
                        className={`border-b border-white/[0.03] transition-colors hover:bg-white/[0.03] ${
                          row.original.isExcess
                            ? 'bg-amber-500/3 border-r-2 border-r-amber-500/50 opacity-55'
                            : idx % 2 === 0 ? '' : 'bg-white/[0.01]'
                        }`}>
                        {row.getVisibleCells().map((cell) => (
                          <td key={cell.id}
                            style={{ minWidth: cell.column.getSize() }}
                            className="px-2 py-2 whitespace-nowrap overflow-hidden text-ellipsis text-sm">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--adora-border)] bg-[var(--adora-modal-header-bg)]">
                <div className="text-[15px] text-[var(--adora-text-secondary)]">
                  عرض <span className="text-[var(--adora-text)] font-medium">{table.getRowModel().rows.length}</span> من <span className="text-[var(--adora-text)] font-medium">{filteredData.length}</span>
                  {data.length !== filteredData.length && (
                    <span className="text-amber-500/70 mr-1.5">(مفلتر من {data.length})</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}
                    className="p-1.5 rounded-lg bg-[var(--adora-input-bg)] hover:bg-[var(--adora-hover-bg)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors border border-[var(--adora-border)]">
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[15px] text-[var(--adora-text-secondary)] min-w-[70px] text-center tabular-nums">
                    {table.getState().pagination.pageIndex + 1} / {table.getPageCount()}
                  </span>
                  <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}
                    className="p-1.5 rounded-lg bg-[var(--adora-input-bg)] hover:bg-[var(--adora-hover-bg)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors border border-[var(--adora-border)]">
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <select value={table.getState().pagination.pageSize}
                    onChange={(e) => table.setPageSize(Number(e.target.value))}
                    className="bg-[var(--adora-input-bg)] text-[var(--adora-text)] text-[15px] rounded-lg px-2 py-1.5 border border-[var(--adora-border)] outline-none focus:ring-1 focus:ring-[var(--adora-focus-border)] cursor-pointer">
                    {[25, 50, 100, 200].map((s) => <option key={s} value={s}>{s} صف</option>)}
                    <option value={99999}>الكل</option>
                  </select>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* ===== Settings Panel ===== */}
      {showSettings && (
        <SettingsPanel
          config={config}
          discoveredBranches={discoveredBranches}
          onSave={handleSaveConfig}
          onSaveAsDefault={async (c) => {
            const { saveConfigToFirebase } = await import('./firebase');
            await saveConfigToFirebase(c).catch(() => {});
          }}
          onClose={(draft) => {
            handleSaveConfig(draft);
          }}
        />
      )}

      {/* ===== Methodology Info Popup ===== */}
      {showMethodology && (
        <MethodologyPopup config={config} onClose={() => setShowMethodology(false)} />
      )}
      {showRatingExplanation && (
        <RatingExplanationPopup config={config} onClose={() => setShowRatingExplanation(false)} />
      )}
      {showConditions && (
        <ConditionsPopup config={config} onClose={() => setShowConditions(false)} />
      )}
    </div>
    )
  );
}

// ===================================================================
// Settings Panel Component
// ===================================================================

function SettingsPanel({ config, discoveredBranches, onSave, onSaveAsDefault, onClose }: {
  config: AppConfig;
  discoveredBranches: string[];
  onSave: (c: AppConfig) => void;
  onSaveAsDefault?: (c: AppConfig) => void | Promise<void>;
  /** يُستدعى عند الإغلاق (X أو إلغاء أو النقر خارجاً). يُمرَّر الـ draft لفظه تلقائياً حتى لا تضيع التعديلات. */
  onClose: (draft: AppConfig) => void;
}) {
  const [draft, setDraft] = useState<AppConfig>(() => structuredClone(config));
  const [saving, setSaving] = useState(false);
  const [savedDefaultAt, setSavedDefaultAt] = useState<number | null>(null);

  const handleSave = useCallback(() => {
    setSaving(true);
    // Brief delay so user sees the success animation, then actually save & close
    setTimeout(() => {
      onSave(draft);
    }, 900);
  }, [draft, onSave]);

  const updateThreshold = (field: 'minBookingThreshold' | 'monthlyNightsThreshold', value: number) => {
    setDraft((prev) => ({ ...prev, [field]: value }));
  };

  const toggleBranchExcluded = (branch: string) => {
    setDraft((prev) => ({
      ...prev,
      branches: {
        ...prev.branches,
        [branch]: { ...prev.branches[branch], excluded: !prev.branches[branch]?.excluded },
      },
    }));
  };

  const updateVipRooms = (branch: string, value: string) => {
    const rooms = value.split(',').map((s) => s.trim()).filter(Boolean);
    setDraft((prev) => ({
      ...prev,
      branches: { ...prev.branches, [branch]: { ...prev.branches[branch], vipRooms: rooms } },
    }));
  };

  const updatePriceRule = (branch: string, idx: number, field: keyof RoomPriceRule, value: string | number | string[]) => {
    setDraft((prev) => {
      const rules = [...(prev.branches[branch]?.priceRules || [])];
      rules[idx] = { ...rules[idx], [field]: value };
      return { ...prev, branches: { ...prev.branches, [branch]: { ...prev.branches[branch], priceRules: rules } } };
    });
  };

  const addPriceRule = (branch: string) => {
    setDraft((prev) => {
      const rules = [...(prev.branches[branch]?.priceRules || [])];
      rules.push({ roomType: '', dailyMin: 0, monthlyMin: 0, keywords: [] });
      return { ...prev, branches: { ...prev.branches, [branch]: { ...prev.branches[branch], priceRules: rules } } };
    });
  };

  const removePriceRule = (branch: string, idx: number) => {
    setDraft((prev) => {
      const rules = [...(prev.branches[branch]?.priceRules || [])];
      rules.splice(idx, 1);
      return { ...prev, branches: { ...prev.branches, [branch]: { ...prev.branches[branch], priceRules: rules } } };
    });
  };

  const updateMergedRule = (branch: string, idx: number, field: keyof MergedRoomRule, value: string | number | [number, number]) => {
    setDraft((prev) => {
      const rules = [...(prev.branches[branch]?.mergedRules || [])];
      rules[idx] = { ...rules[idx], [field]: value };
      return { ...prev, branches: { ...prev.branches, [branch]: { ...prev.branches[branch], mergedRules: rules } } };
    });
  };

  const addMergedRule = (branch: string) => {
    setDraft((prev) => {
      const rules = [...(prev.branches[branch]?.mergedRules || [])];
      rules.push({ label: '', dailyMin: 0, monthlyMin: 0, digitPairs: [0, 0] });
      return { ...prev, branches: { ...prev.branches, [branch]: { ...prev.branches[branch], mergedRules: rules } } };
    });
  };

  const removeMergedRule = (branch: string, idx: number) => {
    setDraft((prev) => {
      const rules = [...(prev.branches[branch]?.mergedRules || [])];
      rules.splice(idx, 1);
      return { ...prev, branches: { ...prev.branches, [branch]: { ...prev.branches[branch], mergedRules: rules } } };
    });
  };

  const resetDefaults = () => {
    const base = getDefaultConfig() ?? DEFAULT_CONFIG;
    setDraft(structuredClone(base));
  };

  const saveAsDefault = async () => {
    saveDefaultConfig(draft);
    if (onSaveAsDefault) await onSaveAsDefault(draft);
    setSavedDefaultAt(Date.now());
    setTimeout(() => setSavedDefaultAt(null), 2500);
  };

  const allBranches = useMemo(() => {
    const names = new Set([...Object.keys(draft.branches), ...discoveredBranches]);
    return [...names].sort();
  }, [draft, discoveredBranches]);

  /** ترتيب العرض: الكورنيش ثم الأندلس ثم الباقي (بدون تغيير أي منطق) */
  const branchesInDisplayOrder = useMemo(() => {
    const preferred = ['الكورنيش', 'الأندلس'] as const;
    const rest = allBranches.filter((b) => b !== 'الكورنيش' && b !== 'الأندلس');
    return [...preferred.filter((b) => allBranches.includes(b)), ...rest];
  }, [allBranches]);

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={() => onClose(draft)}>
      <div className="bg-[var(--adora-modal-bg)] border border-[var(--adora-border)] rounded-2xl modal-no-side-shadow
                      max-w-3xl w-[95%] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--adora-border)] bg-[var(--adora-modal-header-bg)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-xl">
              <SettingsIcon className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--adora-text)]">إعدادات التحليل</h3>
              <p className="text-[15px] text-[var(--adora-text-secondary)]">الأسعار، الفروع، الحدود — محفوظة تلقائياً</p>
              <p className="text-[14px] text-[var(--adora-accent)] mt-0.5 opacity-90">هذه الإعدادات عامة للمشروع ولا تتغير بتغيير الفترة أو إغلاقها أو رفع ملفات جديدة. الإعدادات الحالية يمكن حفظها كافتراضي بزر «حفظ كافتراضي» لتُستعاد لاحقاً بـ «استعادة الافتراضي». عند الإغلاق (× أو إلغاء) تُحفظ التعديلات تلقائياً.</p>
            </div>
          </div>
          <button onClick={() => onClose(draft)} className="text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 text-base leading-relaxed max-w-3xl">
          {/* Thresholds */}
          <section>
            <h4 className="text-[var(--adora-accent)] font-bold text-base mb-3">الحدود العامة</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">الحد الأدنى لحجوزات الموظف</label>
                <input type="number" min={0} value={draft.minBookingThreshold}
                  onChange={(e) => updateThreshold('minBookingThreshold', parseInt(e.target.value) || 0)}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500/50" />
                <p className="text-sm text-[var(--adora-text-secondary)] mt-1">الموظفون الذين تقل حجوزاتهم عن هذا العدد يُستبعدون. <span className="text-cyan-400/90">0 = إظهار الكل بدون استبعاد</span></p>
              </div>
              <div>
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">عتبة الحجز الشهري (ليالي)</label>
                <input type="number" min={1} value={draft.monthlyNightsThreshold}
                  onChange={(e) => updateThreshold('monthlyNightsThreshold', parseInt(e.target.value) || 1)}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500/50" />
                <p className="text-sm text-[var(--adora-text-secondary)] mt-1">≥ هذا العدد = حجز شهري (سعر أقل)</p>
              </div>
            </div>
          </section>

          {/* Reward Pricing — أسعار المكافآت */}
          <section className="border border-emerald-500/30 rounded-xl p-4 space-y-4 bg-emerald-900/10">
            <h4 className="text-emerald-400 font-bold text-base">أسعار المكافآت (تؤثر على صافي الموظف)</h4>
            <p className="text-sm text-[var(--adora-text-secondary)]">كل وحدة × السعر المحدد = جزء من الإجمالي. الصافي = الإجمالي − صندوق الدعم ({draft.rewardPricing.supportFundPercent ?? 15}%)</p>
            <p className="text-sm text-[var(--adora-text-secondary)]">الحساب يُقسّم حسب المصدر: <strong className="text-emerald-400/90">استقبال</strong> (حسب الشفت صباح/مساء/ليل)، <strong className="text-orange-400/90">بوكينج عادي</strong> (سعر ثابت لكل حجز)، <strong className="text-violet-400/90">VIP</strong> (من الخانات أدناه لكل غرفة).</p>

            {/* استقبال — حسب الشفت */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-emerald-400/90">استقبال (حسب الشفت) — ريال لكل حجز عادي</p>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">صباح</label>
                  <input type="number" min={0} step={0.5} value={draft.rewardPricing.rateMorning}
                    onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, rateMorning: parseFloat(e.target.value) || 0 } }))}
                    className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
                </div>
                <div>
                  <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">مساء</label>
                  <input type="number" min={0} step={0.5} value={draft.rewardPricing.rateEvening}
                    onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, rateEvening: parseFloat(e.target.value) || 0 } }))}
                    className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
                </div>
                <div>
                  <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">ليل</label>
                  <input type="number" min={0} step={0.5} value={draft.rewardPricing.rateNight}
                    onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, rateNight: parseFloat(e.target.value) || 0 } }))}
                    className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
                </div>
              </div>
            </div>

            {/* بوكينج عادي — سعر ثابت */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-orange-400/90">بوكينج عادي (غير VIP) — ريال واحد لكل حجز بغض النظر عن الشفت</p>
              <div className="grid grid-cols-1 gap-3">
                <div className="max-w-[140px]">
                  <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">مكافأة بوكينج (ريال)</label>
                  <input type="number" min={0} step={0.5} value={draft.rewardPricing.rateBooking}
                    onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, rateBooking: parseFloat(e.target.value) || 0 } }))}
                    className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
                </div>
              </div>
            </div>

            {/* عقد شهري */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-cyan-400/90">عقد شهري (قائمة الأسعار)</p>
              <div className="max-w-[140px]">
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">ريال لكل عقد</label>
                <input type="number" min={0} step={1} value={draft.rewardPricing.rateContract ?? 200}
                  onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, rateContract: parseFloat(e.target.value) || 0 } }))}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
              </div>
            </div>

            {/* صندوق الدعم — نسبة مخصومة من الإجمالي قبل الصافي */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-cyan-400/90">صندوق الدعم</p>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="text-sm text-[var(--adora-text-secondary)] shrink-0">نسبة من الإجمالي (%)</label>
                <input type="number" min={0} max={100} step={1} value={draft.rewardPricing.supportFundPercent ?? 15}
                  onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, supportFundPercent: Math.min(100, Math.max(0, parseInt(e.target.value, 10) || 0)) } }))}
                  className="w-20 bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
                <span className="text-xs text-[var(--adora-text-secondary)]">الصافي = الإجمالي − (الإجمالي × هذه النسبة)</span>
              </div>
            </div>

            {/* VIP — افتراضي ثم لكل غرفة */}
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-violet-400/90">VIP — لكل غرفة سعر استقبال وسعر بوكينج (أو الافتراضي أدناه)</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">VIP افتراضي — استقبال (ريال)</label>
                  <input type="number" min={0} step={0.5} value={draft.rewardPricing.rateVipDefault.reception}
                    onChange={(e) => {
                      const newVal = parseFloat(e.target.value) || 0;
                      setDraft(prev => ({
                        ...prev,
                        rewardPricing: {
                          ...prev.rewardPricing,
                          rateVipDefault: { ...prev.rewardPricing.rateVipDefault, reception: newVal },
                          rateVipByBranch: {}
                        }
                      }));
                    }}
                    className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
                </div>
                <div>
                  <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">VIP افتراضي — بوكينج (ريال)</label>
                  <input type="number" min={0} step={0.5} value={draft.rewardPricing.rateVipDefault.booking}
                    onChange={(e) => {
                      const newVal = parseFloat(e.target.value) || 0;
                      setDraft(prev => ({
                        ...prev,
                        rewardPricing: {
                          ...prev.rewardPricing,
                          rateVipDefault: { ...prev.rewardPricing.rateVipDefault, booking: newVal },
                          rateVipByBranch: {}
                        }
                      }));
                    }}
                    className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
                </div>
              </div>
            </div>
            {/* VIP per-room pricing */}
            {(() => {
              const branchVips: { name: string; rooms: string[] }[] = [];
              Object.entries(draft.branches).forEach(([name, bc]) => {
                if (!bc.excluded && bc.vipRooms.length > 0) branchVips.push({ name, rooms: [...bc.vipRooms].sort() });
              });
              if (branchVips.length === 0) return null;

              const updateVipRate = (branchName: string, room: string, source: 'reception' | 'booking', val: string) => {
                setDraft(prev => {
                  const newByBranch = { ...(prev.rewardPricing.rateVipByBranch || {}) };
                  const branchMap = { ...(newByBranch[branchName] || {}) };
                  const parsed = val.trim() === '' ? null : parseFloat(val);

                  if (parsed === null || isNaN(parsed)) {
                    // User cleared the field — remove override so it inherits from default
                    if (branchMap[room]) {
                      const existing = { ...branchMap[room] };
                      delete (existing as Record<string, unknown>)[source];
                      // If both sources removed, remove the room entry
                      const other = source === 'reception' ? 'booking' : 'reception';
                      if (existing[other] == null) {
                        delete branchMap[room];
                      } else {
                        branchMap[room] = existing as { reception: number; booking: number };
                      }
                    }
                  } else {
                    const existing = branchMap[room] || ({} as Record<string, number>);
                    branchMap[room] = { ...existing, [source]: parsed } as { reception: number; booking: number };
                  }

                  // Clean up empty branch entries
                  if (Object.keys(branchMap).length === 0) {
                    delete newByBranch[branchName];
                  } else {
                    newByBranch[branchName] = branchMap;
                  }
                  return { ...prev, rewardPricing: { ...prev.rewardPricing, rateVipByBranch: newByBranch } };
                });
              };

              return (
                <div className="space-y-3">
                  <label className="text-sm text-[var(--adora-text-secondary)] block">سعر VIP لكل غرفة حسب الفرع (ريال) — اترك فارغاً ليأخذ الافتراضي</label>
                  <p className="text-[14px] text-violet-400/70">لكل غرفة VIP: سعر استقبال (حجز مباشر) وسعر بوكينج (حجز أونلاين) — الحقل الفارغ يرث القيمة الافتراضية أعلاه. حجز VIP يأخذ هذا السعر فقط بدون سعر الشفت</p>
                  {branchVips.map(bv => (
                    <div key={bv.name} className="border border-violet-500/20 rounded-lg p-3 bg-violet-900/10">
                      <p className="text-sm text-violet-300 font-bold mb-2">{bv.name}</p>
                      <div className="space-y-2">
                        {bv.rooms.map(room => {
                          const rates = draft.rewardPricing.rateVipByBranch?.[bv.name]?.[room];
                          return (
                            <div key={room} className="flex items-center gap-2 bg-[var(--adora-input-bg)] rounded-lg px-2.5 py-2 border border-[var(--adora-border)] flex-wrap sm:flex-nowrap">
                              <span className="text-sm text-violet-300 font-bold font-mono bg-violet-500/15 px-2 py-1 rounded border border-violet-500/25 shrink-0">{room}</span>
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className="text-[14px] text-emerald-400 shrink-0">استقبال</span>
                                <input type="number" min={0} step={0.5}
                                  value={rates?.reception ?? ''}
                                  placeholder={String(draft.rewardPricing.rateVipDefault.reception)}
                                  onChange={(e) => updateVipRate(bv.name, room, 'reception', e.target.value)}
                                  className="flex-1 bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono min-w-[50px]" />
                              </div>
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                <span className="text-[14px] text-orange-400 shrink-0">بوكينج</span>
                                <input type="number" min={0} step={0.5}
                                  value={rates?.booking ?? ''}
                                  placeholder={String(draft.rewardPricing.rateVipDefault.booking)}
                                  onChange={(e) => updateVipRate(bv.name, room, 'booking', e.target.value)}
                                  className="flex-1 bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-2 py-1.5 outline-none focus:ring-2 focus:ring-orange-500/50 font-mono min-w-[50px]" />
                              </div>
                              <span className="text-[14px] text-slate-500 shrink-0">ر.س</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            {/* Evaluation rates */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--adora-border)]">
              <div>
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">تقييم Booking (ريال/تقييم)</label>
                <input type="number" min={0} step={1} value={draft.rewardPricing.rateEvalBooking}
                  onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, rateEvalBooking: parseFloat(e.target.value) || 0 } }))}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
              </div>
              <div>
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">تقييم Google Maps (ريال/تقييم)</label>
                <input type="number" min={0} step={1} value={draft.rewardPricing.rateEvalGoogle}
                  onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, rateEvalGoogle: parseFloat(e.target.value) || 0 } }))}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
              </div>
            </div>
            <p className="text-[14px] text-[var(--adora-text-secondary)]">حد التقييم الأدنى للفندق (يظهر في شروط المكافآت)</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">الكورنيش</label>
                <input type="number" min={0} max={10} step={0.1} value={draft.rewardPricing.minEvalCorniche ?? 8.7}
                  onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, minEvalCorniche: parseFloat(e.target.value) || 0 } }))}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
              </div>
              <div>
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">الأندلس</label>
                <input type="number" min={0} max={10} step={0.1} value={draft.rewardPricing.minEvalAndalus ?? 8.2}
                  onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, minEvalAndalus: parseFloat(e.target.value) || 0 } }))}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
              </div>
              <div>
                <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">خرائط جوجل</label>
                <input type="number" min={0} max={5} step={0.1} value={draft.rewardPricing.minEvalGoogle ?? 4.3}
                  onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, minEvalGoogle: parseFloat(e.target.value) || 0 } }))}
                  className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50 font-mono" />
              </div>
            </div>
            <div>
              <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">نص حجوزات VIP (يظهر في شروط المكافآت)</label>
              <input type="text" value={draft.rewardPricing.vipDescription ?? 'حجوزات VIP — تُسعّر من خانات VIP (استقبال/بوكينج لكل غرفة)'}
                onChange={(e) => setDraft(prev => ({ ...prev, rewardPricing: { ...prev.rewardPricing, vipDescription: e.target.value } }))}
                className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500/50" />
            </div>
          </section>

          {/* Per-branch settings */}
          {branchesInDisplayOrder.map((branchName) => {
            const bc = draft.branches[branchName];
            if (!bc) return null;

            return (
              <section key={branchName} className={`border rounded-xl p-4 space-y-4 ${
                bc.excluded ? 'border-slate-700/30 bg-slate-800/20 opacity-60' : 'border-slate-700/50 bg-slate-800/30'
              }`}>
                <div className="flex items-center justify-between">
                  <h4 className="text-sky-400 font-bold text-base">{branchName}</h4>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={bc.excluded}
                      onChange={() => toggleBranchExcluded(branchName)}
                      className="rounded border-[var(--adora-border)] bg-[var(--adora-input-bg)] text-[var(--adora-error)] focus:ring-red-500/50" />
                    <span className="text-sm text-[var(--adora-text-secondary)]">مستبعد</span>
                  </label>
                </div>

                {!bc.excluded && (
                  <>
                    {/* VIP Rooms */}
                    <div>
                      <label className="text-sm text-[var(--adora-text-secondary)] block mb-1">غرف VIP (مفصولة بفاصلة)</label>
                      <input type="text" value={bc.vipRooms.join(', ')}
                        onChange={(e) => updateVipRooms(branchName, e.target.value)}
                        placeholder="601, 602, 603, 604"
                        className="w-full bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-cyan-500/50" />
                    </div>

                    {/* Price Rules */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-[var(--adora-text-secondary)] font-medium">جدول الأسعار الدنيا</label>
                        <button onClick={() => addPriceRule(branchName)}
                          className="flex items-center gap-1 text-sm text-cyan-400 hover:text-cyan-300">
                          <Plus className="w-3 h-3" /> إضافة نوع
                        </button>
                      </div>
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-[1fr_80px_80px_1fr_32px] gap-2 text-[14px] text-slate-500 font-medium px-1">
                          <span>نوع الغرفة</span><span>يومي</span><span>شهري</span><span>كلمات مفتاحية</span><span></span>
                        </div>
                        {(bc.priceRules || []).map((rule, idx) => (
                          <div key={idx} className="grid grid-cols-[1fr_80px_80px_1fr_32px] gap-2 items-center">
                            <input type="text" value={rule.roomType}
                              onChange={(e) => updatePriceRule(branchName, idx, 'roomType', e.target.value)}
                              className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none" />
                            <input type="number" value={rule.dailyMin}
                              onChange={(e) => updatePriceRule(branchName, idx, 'dailyMin', parseInt(e.target.value) || 0)}
                              className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none font-mono" />
                            <input type="number" value={rule.monthlyMin}
                              onChange={(e) => updatePriceRule(branchName, idx, 'monthlyMin', parseInt(e.target.value) || 0)}
                              className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none font-mono" />
                            <input type="text" value={rule.keywords.join(', ')}
                              onChange={(e) => updatePriceRule(branchName, idx, 'keywords', e.target.value.split(',').map((s) => s.trim()).filter(Boolean))}
                              placeholder="كلمات للمطابقة"
                              className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none" />
                            <button onClick={() => removePriceRule(branchName, idx)}
                              className="p-1 text-slate-600 hover:text-[var(--adora-error)] transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Merged Rules */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm text-[var(--adora-text-secondary)] font-medium">غرف مدمجة (أزواج)</label>
                        <button onClick={() => addMergedRule(branchName)}
                          className="flex items-center gap-1 text-sm text-purple-400 hover:text-purple-300">
                          <Plus className="w-3 h-3" /> إضافة زوج
                        </button>
                      </div>
                      {(bc.mergedRules || []).length > 0 && (
                        <div className="space-y-1.5">
                          <div className="grid grid-cols-[1fr_60px_60px_50px_50px_32px] gap-2 text-[14px] text-slate-500 font-medium px-1">
                            <span>التسمية</span><span>يومي</span><span>شهري</span><span>رقم1</span><span>رقم2</span><span></span>
                          </div>
                          {bc.mergedRules.map((rule, idx) => (
                            <div key={idx} className="grid grid-cols-[1fr_60px_60px_50px_50px_32px] gap-2 items-center">
                              <input type="text" value={rule.label}
                                onChange={(e) => updateMergedRule(branchName, idx, 'label', e.target.value)}
                                className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none" />
                              <input type="number" value={rule.dailyMin}
                                onChange={(e) => updateMergedRule(branchName, idx, 'dailyMin', parseInt(e.target.value) || 0)}
                                className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none font-mono" />
                              <input type="number" value={rule.monthlyMin}
                                onChange={(e) => updateMergedRule(branchName, idx, 'monthlyMin', parseInt(e.target.value) || 0)}
                                className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none font-mono" />
                              <input type="number" value={rule.digitPairs[0]}
                                onChange={(e) => updateMergedRule(branchName, idx, 'digitPairs', [parseInt(e.target.value) || 0, rule.digitPairs[1]])}
                                className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none font-mono" />
                              <input type="number" value={rule.digitPairs[1]}
                                onChange={(e) => updateMergedRule(branchName, idx, 'digitPairs', [rule.digitPairs[0], parseInt(e.target.value) || 0])}
                                className="bg-[var(--adora-input-bg)] border border-[var(--adora-border)] text-[var(--adora-text)] text-sm rounded px-2 py-1.5 outline-none font-mono" />
                              <button onClick={() => removeMergedRule(branchName, idx)}
                                className="p-1 text-slate-600 hover:text-[var(--adora-error)] transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--adora-border)] bg-[var(--adora-modal-header-bg)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={resetDefaults}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors">
              <RotateCcw className="w-3.5 h-3.5" /> استعادة الافتراضي
            </button>
            <button onClick={saveAsDefault}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors"
              title="حفظ الإعدادات الحالية كافتراضي يُستعاد بزر «استعادة الافتراضي» — يُرفع أيضاً لـ Firebase ليتوفر على أجهزة أخرى">
              {savedDefaultAt ? '✓ تم حفظ الافتراضي' : 'حفظ كافتراضي'}
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onClose(draft)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors">
              إلغاء
            </button>
            <button onClick={handleSave} disabled={saving}
              className={`px-6 py-1.5 rounded-lg text-sm font-medium border transition-all duration-300 flex items-center gap-1.5 ${
                saving
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30 shadow-lg shadow-emerald-500/10 scale-105'
                  : 'bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 border-cyan-500/20 hover:scale-[1.02] active:scale-[0.98]'
              }`}>
              {saving ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-[scaleIn_0.3s_ease-out]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" className="animate-[drawCheck_0.4s_ease-out_0.1s_both]" style={{ strokeDasharray: 24, strokeDashoffset: 0 }} />
                  </svg>
                  <span>تم الحفظ ✓</span>
                </>
              ) : (
                'حفظ الإعدادات'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// Methodology Info Popup (Dynamic — reads from config)
// ===================================================================

function MethodologyPopup({ config, onClose }: { config: AppConfig; onClose: () => void }) {
  const activeBranches = Object.entries(config.branches).filter(([, bc]) => !bc.excluded);

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-[var(--adora-modal-bg)] border border-[var(--adora-border)] rounded-2xl modal-no-side-shadow
                      max-w-2xl w-[95%] max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--adora-border)] bg-[var(--adora-modal-header-bg)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-xl">
              <Info className="w-5 h-5 text-[var(--adora-accent)]" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--adora-text)]">منهجية التحليل والشروط</h3>
              <p className="text-[15px] text-[var(--adora-text-secondary)]">كل قواعد احتساب الحجوزات والتنبيهات السعرية</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 text-base leading-relaxed max-w-3xl">

          {/* 1. Data Sources */}
          <section>
            <h4 className="text-cyan-400 font-bold text-base mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-cyan-500/20 flex items-center justify-center text-sm font-bold">1</span>
              مصادر البيانات
            </h4>
            <div className="space-y-1.5 text-slate-300 text-sm mr-8">
              <p><span className="text-cyan-300 font-bold">تقرير إحصائيات الموظفين</span> — المرجع النهائي لعدد الحجوزات لكل موظف (الحَكَم). يُستخرج منه عدد الحجوزات + فترة التقرير.</p>
              <p><span className="text-sky-300 font-bold">تقرير حجوزات العملاء</span> — المصدر الأساسي للتفاصيل: اسم العميل، الوحدة، السعر، تاريخ الدخول/الخروج، مصدر الحجز.</p>
              <p><span className="text-teal-300 font-bold">سجل حركات النظام</span> — مصدر ثانوي لكشف نقل الغرف فقط (Room Transfer).</p>
              <p><span className="text-amber-300 font-bold">تقرير وحدات الحجوزات</span> — مصدر تكميلي لأسعار الغرف المدمجة بدقة (per-unit pricing).</p>
              <p className="text-slate-500 text-sm mt-1.5">الأعمدة تُكتشف تلقائياً من هيدرات الملف — لا تعتمد على ترتيب ثابت.</p>
            </div>
          </section>

          {/* 2. Filtering Logic */}
          <section>
            <h4 className="text-emerald-400 font-bold text-base mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center text-sm font-bold">2</span>
              شروط احتساب الحجز (الفلتر المزدوج)
            </h4>
            <div className="space-y-2 text-slate-300 text-sm mr-8">
              <p className="font-medium text-slate-200">الحجز يُحسب للموظف فقط إذا تحقق الشرطان معاً:</p>
              <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30 space-y-1.5">
                <p className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><span className="text-emerald-300 font-bold">تاريخ الإنشاء</span> داخل فترة التقرير (الموظف أنشأ الحجز خلال الفترة)</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-emerald-400 mt-0.5">✓</span>
                  <span><span className="text-emerald-300 font-bold">تاريخ الدخول</span> داخل فترة التقرير (العميل فعلاً دخل خلال الفترة)</span>
                </p>
              </div>
              <p className="text-slate-500 text-sm">حجز أُنشئ في يناير لعميل يدخل فبراير → لا يُحسب. حجز أُنشئ في ديسمبر لعميل دخل يناير → لا يُحسب.</p>
            </div>
          </section>

          {/* 3. Counting Logic */}
          <section>
            <h4 className="text-violet-400 font-bold text-base mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-violet-500/20 flex items-center justify-center text-sm font-bold">3</span>
              آلية العد والحالة
            </h4>
            <div className="space-y-1.5 text-slate-300 text-sm mr-8">
              <p>لكل موظف-فرع: عدد تقرير الإحصائيات = السقف الأعلى (Cap).</p>
              <p><span className="px-1.5 py-0.5 rounded text-[14px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">محسوب</span> — الحجوزات ضمن السقف (أول N حجز).</p>
              <p><span className="px-1.5 py-0.5 rounded text-[14px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">زيادة</span> — حجوزات تتجاوز السقف.</p>
              <p className="mt-1"><span className="text-amber-400 font-bold">⚡ تجاوز العدد:</span> الموظف له حجوزات أكثر من تقرير الإحصائيات.</p>
              <p><span className="text-orange-400 font-bold">🚫 بدون صلاحية:</span> الموظف غير موجود في تقرير الإحصائيات أصلاً.</p>
              <p><span className="text-sky-400 font-bold">🏨 لم يخرج:</span> النزيل لم يسجل خروج ضمن فترة التقرير — لذلك الإحصائيات لا تحسبه.</p>
              <p className="text-slate-500 text-sm mt-1">
                الموظفون بأقل من <span className="text-cyan-400 font-bold">{config.minBookingThreshold}</span> حجوزات مجمعة يُستبعدون.
                {Object.entries(config.branches).filter(([, bc]) => bc.excluded).map(([n]) => n).length > 0 && (
                  <> فروع مستبعدة: {Object.entries(config.branches).filter(([, bc]) => bc.excluded).map(([n]) => n).join('، ')}.</>
                )}
              </p>
            </div>
          </section>

          {/* 4. Price Alerts — Dynamic from config */}
          <section>
            <h4 className="text-[var(--adora-error)] font-bold text-base mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-red-500/20 flex items-center justify-center text-sm font-bold">4</span>
              التنبيهات السعرية (الحد الأدنى لليلة)
            </h4>
            <div className="space-y-3 text-sm mr-8">
              <p className="text-slate-300">لكل نوع غرفة حد أدنى لسعر الليلة. لو <span className="text-red-300 font-mono">(الإيجار ÷ الليالي) &lt; الحد الأدنى</span> → تنبيه.</p>

              {activeBranches.map(([branchName, bc]) => (
                <div key={branchName}>
                  <p className="text-sky-300 font-bold mb-1">{branchName}:</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-slate-400 bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/20">
                    {bc.priceRules.map((rule) => (
                      <span key={rule.roomType} className="font-mono">
                        {rule.roomType} <span className="text-slate-600">→</span> يومي <span className="text-red-300">{rule.dailyMin}</span> | شهري <span className="text-cyan-300">{rule.monthlyMin}</span>
                      </span>
                    ))}
                  </div>
                  {bc.mergedRules.length > 0 && (
                    <div className="mt-1.5">
                      <p className="text-purple-300 font-bold mb-1">غرف مدمجة ({branchName}):</p>
                      <div className="text-slate-400 bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/20 space-y-0.5">
                        {bc.mergedRules.map((rule, idx) => (
                          <span key={idx} className="font-mono block">
                            {rule.label} <span className="text-slate-600">→</span> يومي <span className="text-red-300">{rule.dailyMin}</span> | شهري <span className="text-cyan-300">{rule.monthlyMin}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <p className="text-slate-500 text-sm">
                شهري = {config.monthlyNightsThreshold} ليلة فأكثر. حجوزات بوكينج (أونلاين) مستبعدة من فحص الحد الأدنى. نقل الغرف (Room Transfer) مستبعد أيضاً.
              </p>
            </div>
          </section>

          {/* 5. Exemptions */}
          <section>
            <h4 className="text-blue-400 font-bold text-base mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center text-sm font-bold">5</span>
              الاستثناءات من فحص السعر
            </h4>
            <div className="space-y-1.5 text-slate-300 text-sm mr-8">
              <p className="flex items-start gap-2">
                <span className="text-orange-400 font-bold shrink-0">بوكينج:</span>
                <span>حجوزات المواقع الخارجية (Booking.com وغيرها) لا تخضع لفحص الحد الأدنى — السعر محدد مسبقاً من المنصة.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-blue-400 font-bold shrink-0">↔ نقل غرفة:</span>
                <span>إذا تم نقل النزيل من غرفة لأخرى (كُشف من مقارنة السجل بالتقرير)، السعر لا يمكن تقسيمه بدقة فيُستبعد.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-purple-400 font-bold shrink-0">دمج غرف:</span>
                <span>حجز بأكثر من غرفة يتم حساب إيجاره الكلي من تقرير الوحدات (إن وُجد) لدقة أعلى.</span>
              </p>
              <p className="flex items-start gap-2">
                <span className="text-amber-400 font-bold shrink-0">زيادة:</span>
                <span>الحجوزات المصنفة &quot;زيادة&quot; لا تخضع لفحص السعر — لأنها غير محسوبة أصلاً.</span>
              </p>
            </div>
          </section>

          {/* 6. Formula */}
          <section>
            <h4 className="text-amber-400 font-bold text-base mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-amber-500/20 flex items-center justify-center text-sm font-bold">6</span>
              معادلة حساب النقص السعري
            </h4>
            <div className="text-sm mr-8 space-y-2">
              <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/30 font-mono text-slate-300">
                <p>المتوقع = <span className="text-cyan-300">الحد الأدنى لليلة</span> × <span className="text-cyan-300">عدد الليالي</span></p>
                <p className="mt-1">النقص = <span className="text-red-300">المتوقع</span> − <span className="text-emerald-300">الإيجار الفعلي</span></p>
                <p className="mt-1 text-slate-500">لو النقص ≤ 0 → <span className="text-emerald-400">✓ سليم</span></p>
                <p className="text-slate-500">لو النقص &gt; 0 → <span className="text-[var(--adora-error)]">▼ تنبيه</span></p>
              </div>
            </div>
          </section>

          {/* 7. Breakdown Table */}
          <section>
            <h4 className="text-teal-400 font-bold text-base mb-2 flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-teal-500/20 flex items-center justify-center text-sm font-bold">7</span>
              جدول ملخص المكافآت
            </h4>
            <div className="space-y-1.5 text-slate-300 text-sm mr-8">
              <p><span className="text-cyan-300 font-bold">مرجع الإحصائيات:</span> العدد من تقرير إحصائيات الموظفين (الحَكَم النهائي).</p>
              <p><span className="text-emerald-300 font-bold">محسوب:</span> عدد الحجوزات بالتفاصيل (≤ مرجع الإحصائيات).</p>
              <p><span className="text-amber-300 font-bold">زيادة:</span> حجوزات تتجاوز سقف تقرير الإحصائيات (⚡تجاوز / 🏨لم يخرج / 🚫بدون صلاحية).</p>
              <p><span className="text-emerald-300 font-bold">استقبال / بوكينج:</span> توزيع مصدر الحجز (المحسوب فقط).</p>
              <p><span className="text-amber-300 font-bold">صباح / مساء / ليل:</span> توزيع الورديات (6ص-4م = صباح، 4م-12ل = مساء، 12ل-6ص = ليل).</p>
              <p className="text-slate-500 text-sm mt-1">اضغط على أي رقم في الجدول لعرض تفاصيل الحجوزات المكونة له.</p>
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--adora-border)] bg-[var(--adora-modal-header-bg)] shrink-0 flex items-center justify-between">
          <p className="text-[14px] text-[var(--adora-text-secondary)]">نظام Adora لتحليل الحجوزات — التوثيق التلقائي</p>
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-sm font-medium bg-cyan-600/20 text-[var(--adora-accent)] hover:bg-cyan-600/30 border border-cyan-500/20 transition-colors">
            فهمت
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// كيفية حساب التقييم — نفس المحتوى المعروض في صفحة المكافآت/الإحصائيات (لا نوافذ جديدة، تحديث المكافآت يبقى المصدر)
// ===================================================================

function RatingExplanationPopup({ config, onClose }: { config: AppConfig; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}>
      <div className="bg-[var(--adora-modal-bg)] border border-[var(--adora-focus-border)] rounded-2xl modal-no-side-shadow max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--adora-border)] shrink-0 flex items-center justify-between">
          <h3 className="text-lg font-black text-[var(--adora-accent)] flex items-center gap-2">
            <span>📊</span>
            <span>كيفية حساب التقييم</span>
          </h3>
          <button onClick={onClose} className="text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors text-2xl font-bold w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[var(--adora-hover-bg)]">
            ×
          </button>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-[var(--adora-text)] leading-relaxed">
          <p className="text-[var(--adora-text)] font-medium">
            عمود <strong className="text-[var(--adora-accent)]">«النقاط»</strong> في الجدول = <strong className="text-[var(--adora-text)]">رصيد النقاط من الفترة</strong> (صافي المستحق + مساهمة {config.rewardPricing.supportFundPercent ?? 15}% معروض كنقاط) — نفس المفهوم في التقرير عند الضغط على الاسم. <strong className="text-[var(--adora-text)]">مستوى الأداء</strong> (ممتاز/جيد/سيء) يُحسب من أدائك مقارنةً بباقي الموظفين ويُعرض تحت النقاط للتوضيح. فيما يلي شرح كيفية حساب مستوى الأداء:
          </p>
          <div className="bg-[var(--adora-hover-bg)] rounded-xl p-4 border border-[var(--adora-focus-border)]">
            <h4 className="text-base font-bold text-[var(--adora-accent)] mb-3">1. ما الذي يُؤخذ في الاعتبار؟</h4>
            <ul className="space-y-2 list-none">
              <li className="flex items-start gap-2"><span className="text-[var(--adora-accent)] font-bold">•</span><span><strong className="text-[var(--adora-text)]">عدد الحجوزات:</strong> كلما كان عدد حجوزاتك أقرب إلى أعلى موظف في الفريق، زادت نقاطك في هذا الجزء.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-accent)] font-bold">•</span><span><strong className="text-[var(--adora-text)]">التقييمات (Booking و Google):</strong> كلما كان إجمالي تقييماتك أقرب إلى أعلى موظف، زادت نقاطك.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-accent)] font-bold">•</span><span><strong className="text-[var(--adora-text)]">الحضور 26 يوم وأكثر:</strong> إذا أتممت 26 يوماً وأكثر من العطاء (بطل تحدي الظروف)، يُضاف لك <strong className="text-[var(--adora-success)]">+0.15</strong> على النتيجة النهائية كمكافأة التزام.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-error)] font-bold">•</span><span><strong className="text-[var(--adora-text)]">الخصم الإداري:</strong> إذا كان عليك خصم إداري بأي قيمة، يتم <strong className="text-[var(--adora-error)]">تخفيض التقييم بمقدار 0.25</strong> ليعكس تأثير التقصير على الأداء.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-error)] font-bold">•</span><span><strong className="text-[var(--adora-text)]">خصم تقييم الفندق (تقييمات سلبية) وفقدان فرص حجز (مكالمات لم يُرد عليها):</strong> إذا سجّل الفرع تقييمات سلبية (أقل من تقييم الفندق) أو فقدان فرص حجز نتيجة المكالمات التي لم يتم الرد عليها، يُخصم <strong className="text-[var(--adora-error)]">10 ريال × عدد التقييمات السلبية للفرع</strong> من صافي كل موظف في ذلك الفرع، ويُنقص نقاط التقييم.</span></li>
            </ul>
          </div>
          <div className="bg-[var(--adora-hover-bg)] rounded-xl p-4 border border-[var(--adora-border)]">
            <h4 className="text-base font-bold text-[var(--adora-accent)] mb-3">2. كيف تُترجم النتيجة إلى نقاط ومستوى؟</h4>
            <p className="text-[var(--adora-text)] mb-3"><strong className="text-[var(--adora-text)]">مستوى الأداء</strong> (ممتاز/جيد/سيء) يُحسب من نتيجة داخلية تُحوَّل إلى <strong className="text-[var(--adora-text)]">نقاط من 0 إلى 100</strong>، ثم يُحدَّد المستوى حسب الجدول التالي:</p>
            <ul className="space-y-2 list-none">
              <li className="flex items-start gap-2"><span className="text-[var(--adora-success)] font-bold">•</span><span><strong className="text-[var(--adora-success)]">ممتاز:</strong> من 90 إلى 100 نقطة.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-success)] font-bold">•</span><span><strong className="text-[var(--adora-success)]">جيد:</strong> من 80 إلى أقل من 90 نقطة.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-warning)] font-bold">•</span><span><strong className="text-[var(--adora-warning)]">متوسط:</strong> من 60 إلى أقل من 80 نقطة.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-warning)] font-bold">•</span><span><strong className="text-[var(--adora-warning)]">ضعيف:</strong> من 40 إلى أقل من 60 نقطة.</span></li>
              <li className="flex items-start gap-2"><span className="text-[var(--adora-error)] font-bold">•</span><span><strong className="text-[var(--adora-error)]">سيء:</strong> أقل من 40 نقطة.</span></li>
            </ul>
          </div>
          <div className="bg-[var(--adora-accent)]/5 rounded-xl p-4 border border-[var(--adora-border)]">
            <h4 className="text-base font-bold text-[var(--adora-accent)] mb-2">3. ملخص سريع</h4>
            <p className="text-[var(--adora-text)]">
              <strong className="text-[var(--adora-text)]">النقاط</strong> في الجدول = رصيد النقاط من الفترة (صافي + {config.rewardPricing.supportFundPercent ?? 15}%). <strong className="text-[var(--adora-text)]">مستوى الأداء</strong> (ممتاز → سيء) يُبنى على أداء الحجوزات والتقييمات بالنسبة لباقي الموظفين، مع <strong className="text-[var(--adora-success)]">مكافأة للحضور 26 يوم وأكثر</strong>، و<strong className="text-[var(--adora-error)]">تخفيض عند وجود خصم إداري أو خصم تقييم الفندق</strong>. كلما كنت أقرب للأعلى وملتزماً بالحضور (وبلا خصم)، ارتفع مستوى أدائك إلى «ممتاز».
            </p>
          </div>
        </div>
        <div className="px-6 py-3 border-t border-[var(--adora-border)] shrink-0 flex justify-end">
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--adora-text)] hover:bg-[var(--adora-hover-bg)] transition-colors">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// شروط المكافآت — مصدر واحد: shared/conditions-content.json (fetch عند الفتح) + config.rewardPricing
// ===================================================================

interface ConditionsSectionItem {
  template?: string;
  static?: string;
  placeholder?: string;
  staticBefore?: string;
}
interface ConditionsSection {
  id: string;
  theme: string;
  icon?: string;
  title: string;
  items?: ConditionsSectionItem[];
  branchLineTemplate?: string;
  defaultLineTemplate?: string;
}
interface ConditionsSchema {
  modalTitle: string;
  sections: ConditionsSection[];
}

function getConditionsSchemaUrl(): string {
  if (typeof window === 'undefined') return '/shared/conditions-content.json';
  const pathname = window.location.pathname || '';
  const base = pathname.indexOf('/rewards') >= 0 ? window.location.origin + '/rewards' : window.location.origin;
  return base + '/shared/conditions-content.json';
}

const THEME_CLASSES: Record<string, { wrap: string; title: string; bullet: string }> = {
  turquoise: { wrap: 'bg-[var(--adora-hover-bg)] rounded-xl p-4 border border-[var(--adora-focus-border)]', title: 'text-[var(--adora-accent)]', bullet: 'text-[var(--adora-accent)]' },
  amber: { wrap: 'bg-[var(--adora-hover-bg)] rounded-xl p-4 border border-[var(--adora-focus-border)]', title: 'text-[var(--adora-warning)]', bullet: 'text-[var(--adora-warning)]' },
  yellow: { wrap: 'bg-[var(--adora-hover-bg)] rounded-xl p-4 border border-[var(--adora-focus-border)]', title: 'text-[var(--adora-warning)]', bullet: 'text-[var(--adora-warning)]' },
  green: { wrap: 'bg-[var(--adora-hover-bg)] rounded-xl p-4 border border-[var(--adora-focus-border)]', title: 'text-[var(--adora-success)]', bullet: 'text-[var(--adora-success)]' },
  orange: { wrap: 'bg-[var(--adora-hover-bg)] rounded-xl p-4 border border-[var(--adora-focus-border)]', title: 'text-[var(--adora-warning)]', bullet: 'text-[var(--adora-warning)]' },
  red: { wrap: 'rounded-xl p-4 border border-[var(--adora-border)] bg-[var(--adora-input-bg)]', title: 'text-[var(--adora-error)]', bullet: 'text-[var(--adora-error)]' },
};

function conditionsReplaceTemplate(tpl: string, rp: AppConfig['rewardPricing']): string {
  return tpl
    .replace(/\{\{rateMorning\}\}/g, String(rp.rateMorning))
    .replace(/\{\{rateEvening\}\}/g, String(rp.rateEvening))
    .replace(/\{\{rateNight\}\}/g, String(rp.rateNight))
    .replace(/\{\{rateBooking\}\}/g, String(rp.rateBooking))
    .replace(/\{\{rateContract\}\}/g, String(rp.rateContract ?? 200))
    .replace(/\{\{vipDescription\}\}/g, rp.vipDescription ?? 'حجوزات VIP — تُسعّر من خانات VIP (استقبال/بوكينج لكل غرفة)')
    .replace(/\{\{rateEvalBooking\}\}/g, String(rp.rateEvalBooking))
    .replace(/\{\{rateEvalGoogle\}\}/g, String(rp.rateEvalGoogle))
    .replace(/\{\{minEvalCorniche\}\}/g, String(rp.minEvalCorniche ?? 8.7))
    .replace(/\{\{minEvalAndalus\}\}/g, String(rp.minEvalAndalus ?? 8.2))
    .replace(/\{\{minEvalGoogle\}\}/g, String(rp.minEvalGoogle ?? 4.3))
    .replace(/\{\{supportFundPercent\}\}/g, String(rp.supportFundPercent ?? 15));
}

function buildConditionsPrintHtml(config: AppConfig, schema: ConditionsSchema): string {
  const rp = config.rewardPricing;
  const vipByBranch = rp.rateVipByBranch || {};
  const vipDefault = rp.rateVipDefault || { reception: 0, booking: 0 };
  const title = schema.modalTitle;
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let body = '<h1>' + esc(title) + '</h1>';
  const section = (cls: string, style: string, title: string, items: string) =>
    '<div class="' + cls + '"' + (style ? ' style="' + style + '"' : '') + '><h2>' + esc(title) + '</h2><ul>' + items + '</ul></div>';

  schema.sections.forEach((sec) => {
    if (sec.id === 'vip') {
      const branchNames = Object.keys(vipByBranch);
      if (branchNames.length === 0 && !(vipDefault.reception > 0 || vipDefault.booking > 0)) return;
      let items = '';
      branchNames.forEach((branch) => {
        const rooms = vipByBranch[branch] || {};
        const roomNums = Object.keys(rooms);
        if (roomNums.length === 0) return;
        const roomParts = roomNums.map((room) => {
          const r = rooms[room];
          return 'غرفة ' + esc(room) + ' (استقبال: ' + (r?.reception ?? 0) + ' ريال، بوكينج: ' + (r?.booking ?? 0) + ' ريال)';
        });
        items += '<li><strong>' + esc(branch) + ':</strong> ' + roomParts.join(' — ') + '</li>';
      });
      if (vipDefault.reception > 0 || vipDefault.booking > 0) items += '<li><strong>VIP افتراضي:</strong> استقبال: ' + vipDefault.reception + ' ريال، بوكينج: ' + vipDefault.booking + ' ريال لكل حجز</li>';
      body += section('section', 'background-color: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.4); border-right: 5px solid rgba(245, 158, 11, 0.6);', (sec.icon || '') + ' ' + conditionsReplaceTemplate(sec.title || '', rp), items);
      return;
    }
    let items = '';
    (sec.items || []).forEach((item) => {
      if (item.placeholder === 'instructionsButton') {
        items += '<li>' + esc(item.staticBefore || '') + '.</li>';
        return;
      }
      const raw = item.template ? conditionsReplaceTemplate(item.template, rp) : (item.static || '');
      items += '<li>' + (item.template && item.template.includes('ريال') ? '<strong>' + esc(raw) + '</strong>' : esc(raw)) + '</li>';
    });
    const cls = sec.theme === 'orange' ? 'section' : 'section ' + (sec.theme === 'turquoise' ? 'contracts' : sec.theme === 'yellow' ? 'evaluations' : sec.theme === 'green' ? 'attendance' : sec.theme === 'red' ? 'discounts' : '');
    const style = sec.theme === 'orange' ? 'background-color: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.4); border-right: 5px solid rgba(245, 158, 11, 0.6);' : sec.theme === 'amber' ? 'background-color: rgba(245, 158, 11, 0.06); border-color: rgba(245, 158, 11, 0.35); border-right: 5px solid rgba(245, 158, 11, 0.5);' : '';
    body += section(cls, style, (sec.icon || '') + ' ' + conditionsReplaceTemplate(sec.title || '', rp), items);
  });

  return '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + esc(title) + '</title>' +
    '<style>@page { size: A4 portrait; margin: 10mm; } * { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: "IBM Plex Sans Arabic", Arial, sans-serif; padding: 8px 12px; background: #fff; color: #111; line-height: 1.4; direction: rtl; font-size: 10px; } h1 { font-size: 16px; font-weight: 900; margin-bottom: 8px; text-align: center; border-bottom: 2px solid #0d9488; padding-bottom: 6px; } .section { margin-bottom: 8px; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; page-break-inside: avoid; } .section.contracts { background-color: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.35); border-right: 4px solid rgba(59, 130, 246, 0.6); } .section.evaluations { background-color: rgba(234, 179, 8, 0.08); border-color: rgba(234, 179, 8, 0.35); border-right: 4px solid rgba(234, 179, 8, 0.6); } .section.attendance { background-color: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.35); border-right: 4px solid rgba(16, 185, 129, 0.6); } .section.discounts { background-color: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.35); border-right: 4px solid rgba(239, 68, 68, 0.6); } h2 { font-size: 11px; font-weight: 800; margin: 0 0 6px 0; } ul { list-style: none; padding: 0; margin: 0; } li { font-size: 9.5px; font-weight: 600; margin: 4px 0; padding-right: 14px; position: relative; line-height: 1.4; text-align: right; } li::before { content: "•"; position: absolute; right: 0; top: 0; font-weight: 900; color: #0d9488; } @media print { body { padding: 4mm 6mm; } .conditions-one-page { page-break-after: avoid; page-break-inside: avoid; } }</style></head><body><div class="conditions-one-page">' +
    body + '</div></body></html>';
}

function ConditionsPopup({ config, onClose }: { config: AppConfig; onClose: () => void }) {
  const [showInstructions, setShowInstructions] = useState(false);
  const [schema, setSchema] = useState<ConditionsSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const rp = config.rewardPricing;
  const vipByBranch = rp.rateVipByBranch || {};
  const vipDefault = rp.rateVipDefault || { reception: 0, booking: 0 };
  const branchNames = Object.keys(vipByBranch);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(getConditionsSchemaUrl())
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('Not ok'))))
      .then((data: ConditionsSchema) => {
        if (!cancelled) {
          setSchema(data);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e?.message || 'تعذر تحميل محتوى الشروط. تأكد من توفر shared/conditions-content.json.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handlePrint = useCallback(() => {
    if (!schema) return;
    const doc = buildConditionsPrintHtml(config, schema);
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(doc);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }, [config, schema]);

  if (loading) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
        <div className="bg-[var(--adora-modal-bg)] border border-[var(--adora-focus-border)] rounded-2xl max-w-2xl w-full p-8 text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-[var(--adora-text-secondary)]">جاري تحميل الشروط...</p>
        </div>
      </div>
    );
  }
  if (error || !schema) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
        <div className="bg-[var(--adora-modal-bg)] border border-[var(--adora-focus-border)] rounded-2xl max-w-2xl w-full p-8 text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-[var(--adora-error)] py-4">{error || 'تعذر تحميل محتوى الشروط.'}</p>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-bold text-[var(--adora-text-secondary)] bg-[var(--adora-hover-bg)]">إغلاق</button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4" onClick={onClose}>
      <div className="bg-[var(--adora-modal-bg)] border border-[var(--adora-focus-border)] rounded-2xl modal-no-side-shadow max-w-2xl w-full max-h-[90vh] overflow-y-auto flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--adora-border)] shrink-0 flex items-center justify-between">
          <h3 className="text-lg font-black text-[var(--adora-accent)] flex items-center gap-2">
            <span>📋</span>
            <span>{schema.modalTitle}</span>
          </h3>
          <button onClick={onClose} className="text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors text-2xl font-bold w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[var(--adora-hover-bg)]">×</button>
        </div>
        <div className="px-6 py-5 space-y-4 text-sm text-[var(--adora-text-secondary)]">
          {schema.sections.map((sec) => {
            if (sec.id === 'vip') {
              if (branchNames.length === 0 && !(vipDefault.reception > 0 || vipDefault.booking > 0)) return null;
              const theme = THEME_CLASSES[sec.theme] || THEME_CLASSES.amber;
              return (
                <div key={sec.id} className={theme.wrap}>
                  <h4 className={'text-base font-bold mb-3 flex items-center gap-2 ' + theme.title}><span>{sec.icon || ''}</span><span>{conditionsReplaceTemplate(sec.title || '', rp)}</span></h4>
                  <ul className="space-y-2 list-none">
                    {branchNames.map((branch) => {
                      const rooms = vipByBranch[branch] || {};
                      const roomNums = Object.keys(rooms);
                      if (roomNums.length === 0) return null;
                      return (
                        <li key={branch} className="flex items-start gap-2">
                          <span className={theme.bullet + ' font-bold'}>•</span>
                          <span><strong className="text-[var(--adora-warning)]">{branch}:</strong>{' '}
                            {roomNums.map((room) => {
                              const r = rooms[room];
                              return `غرفة ${room} (استقبال: ${r?.reception ?? 0} ريال، بوكينج: ${r?.booking ?? 0} ريال)`;
                            }).join(' — ')}
                          </span>
                        </li>
                      );
                    })}
                    {(vipDefault.reception > 0 || vipDefault.booking > 0) && (
                      <li className="flex items-start gap-2"><span className={theme.bullet + ' font-bold'}>•</span><span><strong className="text-[var(--adora-warning)]">VIP افتراضي:</strong> استقبال: {vipDefault.reception} ريال، بوكينج: {vipDefault.booking} ريال لكل حجز</span></li>
                    )}
                  </ul>
                </div>
              );
            }
            const theme = THEME_CLASSES[sec.theme] || THEME_CLASSES.turquoise;
            // قسم النقاط التراكمية: نفس التنسيق (نقاط + theme) لكن بعرض عمودين
            const isPointsSection = sec.id === 'points';
            return (
              <div key={sec.id} className={theme.wrap}>
                <h4 className={'text-base font-bold mb-3 flex items-center gap-2 ' + theme.title}><span>{sec.icon || ''}</span><span>{conditionsReplaceTemplate(sec.title || '', rp)}</span></h4>
                <ul className={'space-y-2 list-none ' + (isPointsSection ? 'grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2' : '')}>
                  {(sec.items || []).map((item, idx) => {
                    if (item.placeholder === 'instructionsButton') {
                      return (
                        <li key={idx} className="flex items-start gap-2 flex-wrap items-center">
                          <span className={theme.bullet + ' font-bold'}>•</span>
                          <span className="text-[var(--adora-text-secondary)]">{item.staticBefore}</span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); setShowInstructions(true); }} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold text-[var(--adora-accent)] bg-[var(--adora-hover-bg)] border border-[var(--adora-focus-border)] hover:bg-[var(--adora-active-bg)] transition-colors mt-1 sm:mt-0">او اضغط هنا</button>
                        </li>
                      );
                    }
                    const text = item.template ? conditionsReplaceTemplate(item.template, rp) : (item.static || '');
                    const hasRate = item.template && item.template.includes('ريال');
                    return (
                      <li key={idx} className="flex items-start gap-2">
                        <span className={theme.bullet + ' font-bold'}>•</span>
                        <span>{hasRate ? <strong className="text-[var(--adora-text)]">{text}</strong> : text}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="px-6 py-3 border-t border-[var(--adora-border)] shrink-0 flex justify-end gap-2">
          <button type="button" onClick={handlePrint} className="px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--adora-text-secondary)] hover:bg-[var(--adora-hover-bg)] transition-colors inline-flex items-center gap-2">
            <Printer className="w-4 h-4" />
            طباعة الشروط
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-lg text-sm font-bold text-[var(--adora-text-secondary)] hover:bg-[var(--adora-hover-bg)] transition-colors">إغلاق</button>
        </div>
      </div>
    </div>
    {showInstructions && (
      <InstructionsPopup onClose={() => setShowInstructions(false)} />
    )}
    </>
  );
}

// ===================================================================
// لائحة التعليمات — نافذة موحدة: نفس المحتوى والمميزات (لائحة + أنواع خصم + طباعة) في التحليل والمكافآت والأدمن
// مصدر المحتوى: app/shared/instructionsBody.html ؛ أنواع الخصم من نفس مصدر المكافآت (localStorage adora_rewards_discountTypes)
// ===================================================================

function getDiscountTypesFromStorage(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem('adora_rewards_discountTypes') || '[]';
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((t): t is string => typeof t === 'string' && t.trim() !== '') : [];
  } catch {
    return [];
  }
}

function getCustomDiscountSectionHtml(types: string[]): string {
  if (types.length === 0) return '';
  const lis = types
    .map((t) => {
      const s = String(t).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      return '<li class="flex gap-2"><span class="text-purple-400">•</span><span>' + s + '</span></li>';
    })
    .join('');
  return '<div class="bg-purple-500/10 rounded-xl p-4 border border-purple-500/30"><h4 class="text-purple-400 font-bold mb-2 text-base">أنواع خصم إضافية (أضافها المدير)</h4><p class="text-slate-400 text-sm mb-2">تظهر تلقائياً هنا عند إضافة المدير نوع خصم جديد من نافذة الخصومات.</p><ul class="space-y-2 text-slate-300 list-none">' + lis + '</ul></div>';
}

function printInstructionsModal(instructionsHtml: string, discountSectionHtml: string) {
  const content = '<div class="space-y-5">' + instructionsHtml + (discountSectionHtml ? discountSectionHtml : '') + '</div>';
  const printWin = window.open('', '_blank');
  if (!printWin) return;
  const printStyles = '@page{size:A4 portrait;margin:10mm}body{background:#fff!important;color:#111!important;padding:6mm 8mm;font-family:"IBM Plex Sans Arabic",Arial,sans-serif;font-size:10px;line-height:1.4}@media print{body{background:#fff!important;color:#111!important}.no-print{display:none!important}}';
  printWin.document.write(
    '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>لائحة تعليمات وسياسات عمل موظفي الاستقبال</title><style>' +
      printStyles +
      '</style></head><body><h1 style="font-size:16px;font-weight:900;color:#111;margin-bottom:10px;text-align:center;border-bottom:2px solid #0d9488;padding-bottom:8px;">لائحة تعليمات وسياسات عمل موظفي الاستقبال</h1><div style="max-width:100%;margin:0 auto;font-size:10px;line-height:1.4;">' +
      content +
      '</div></body></html>'
  );
  printWin.document.close();
  printWin.focus();
  setTimeout(() => {
    printWin.print();
  }, 400);
}

function InstructionsPopup({ onClose }: { onClose: () => void }) {
  const discountTypes = getDiscountTypesFromStorage();
  const customSectionHtml = getCustomDiscountSectionHtml(discountTypes);

  const handlePrint = () => {
    printInstructionsModal(instructionsBodyHtml, customSectionHtml);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
<div className="bg-[var(--adora-modal-bg)] border border-[var(--adora-border)] rounded-2xl modal-no-side-shadow max-w-2xl w-[95%] max-h-[90vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="px-6 py-4 border-b border-[var(--adora-border)] bg-[var(--adora-modal-header-bg)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/20 rounded-xl">
              <FileText className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--adora-text)]">لائحة تعليمات وسياسات عمل موظفي الاستقبال</h3>
              <p className="text-[15px] text-[var(--adora-text-secondary)]">لائحة موحدة — قائمة أنواع الخصم وطباعة اللائحة هنا</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--adora-text-secondary)] hover:text-[var(--adora-text)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6 text-base leading-relaxed max-w-3xl">
          <div className="space-y-5" dangerouslySetInnerHTML={{ __html: instructionsBodyHtml }} />
          {customSectionHtml ? <div className="space-y-5" dangerouslySetInnerHTML={{ __html: customSectionHtml }} /> : null}
        </div>
        <div className="px-6 py-3 border-t border-[var(--adora-border)] bg-[var(--adora-modal-header-bg)] shrink-0 flex flex-wrap items-center justify-between gap-2">
          <button onClick={handlePrint} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-cyan-400 bg-cyan-600/20 border border-cyan-500/30 hover:bg-cyan-600/30 transition-colors">
            <Printer className="w-4 h-4" />
            طباعة اللائحة
          </button>
          <button onClick={onClose} className="px-4 py-1.5 rounded-lg text-sm font-medium bg-cyan-600/20 text-cyan-300 hover:bg-cyan-600/30 border border-cyan-500/20 transition-colors">
            فهمت
          </button>
        </div>
      </div>
    </div>
  );
}

// ===================================================================
// Employee Breakdown (COUNTED entries only — Staff is king)
// ===================================================================

interface DrilldownBooking {
  bookingNumber: string;
  guestName: string;
  roomUnit: string;
  priceSAR: number;
  priceShortfall: number;
  nights: number;
  nightlyRate: number;
  minPrice: number;
  roomTypeLabel: string;
  bookingSource: BookingSource;
  shift: ShiftType;
  checkInTime: string;
  checkoutDateStr: string;
  creationTime: string;
  roomCategory: RoomCategory;
  isMonthly: boolean;
  isMerged: boolean;
  isRoomTransfer: boolean;
}

const ARABIC_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function formatRegistrationTime(dateTimeStr: string): string {
  const m = dateTimeStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return '—';
  const hour = parseInt(m[4], 10);
  const minute = m[5];
  const ampm = m[6].toUpperCase();

  // Convert to 24h for shift calculation
  let hour24 = hour;
  if (ampm === 'PM' && hour !== 12) hour24 += 12;
  if (ampm === 'AM' && hour === 12) hour24 = 0;

  // Get day of week
  const date = new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  const dayName = ARABIC_DAYS[date.getDay()];

  // Determine shift
  const totalMins = hour24 * 60 + parseInt(minute);
  let shift: string;
  if (totalMins >= 360 && totalMins < 960) shift = 'صباح';
  else if (totalMins >= 960) shift = 'مساء';
  else shift = 'ليل';

  const time12 = `${hour}:${minute}`;
  return `${dayName} ${time12} ${shift}`;
}

interface DrilldownInfo {
  title: string;
  filterType?: string;
  bookings: DrilldownBooking[];
}

function EmployeeBreakdown({ staffList, data, config, dateRange }: {
  staffList: StaffRecord[]; data: MatchedRow[]; config: AppConfig;
  dateRange: { from: string; to: string } | null;
}) {
  const [transferring, setTransferring] = useState(false);
  const [transferDone, setTransferDone] = useState(false);
  const countedData = useMemo(() => data.filter((d) => !d.isExcess), [data]);
  const [drilldown, setDrilldown] = useState<DrilldownInfo | null>(null);
  const [sortKey, setSortKey] = useState<string>('staffCount');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Derive VIP rooms from config
  const VIP_ROOMS = useMemo(() => {
    const result: Record<string, string[]> = {};
    for (const [name, bc] of Object.entries(config.branches)) {
      if (!bc.excluded) result[name] = bc.vipRooms;
    }
    return result;
  }, [config]);

  const ALL_VIP_NUMS = useMemo(() => {
    const nums = new Set<string>();
    for (const bc of Object.values(config.branches)) {
      if (!bc.excluded) bc.vipRooms.forEach((n) => nums.add(n));
    }
    return [...nums].sort();
  }, [config]);

  const openDrilldown = useCallback((
    empName: string, branch: string, filterType: string, filterValue?: string
  ) => {
    const empData = countedData.filter((d) => d.employeeName === empName && d.branch === branch);
    let filtered: MatchedRow[] = [];
    let title = '';

    switch (filterType) {
      case 'استقبال':
        filtered = empData.filter((d) => d.bookingSource === 'استقبال');
        title = `${empName} — ${branch} — استقبال`;
        break;
      case 'بوكينج':
        filtered = empData.filter((d) => d.bookingSource === 'بوكينج');
        title = `${empName} — ${branch} — بوكينج`;
        break;
      case 'صباح':
        filtered = empData.filter((d) => d.shift === 'صباح');
        title = `${empName} — ${branch} — صباح`;
        break;
      case 'مساء':
        filtered = empData.filter((d) => d.shift === 'مساء');
        title = `${empName} — ${branch} — مساء`;
        break;
      case 'ليل':
        filtered = empData.filter((d) => d.shift === 'ليل');
        title = `${empName} — ${branch} — ليل`;
        break;
      case 'vip':
        filtered = empData.filter((d) => {
          const rn = extractRoomNumber(d.roomUnit);
          const branchVips = VIP_ROOMS[branch] || [];
          if (!rn || !branchVips.includes(rn)) return false;
          if (filterValue) return rn === filterValue;
          return true;
        });
        title = `${empName} — ${branch} — VIP${filterValue ? ' غ' + filterValue : ''}`;
        break;
      case 'alert':
        filtered = empData.filter((d) => d.priceShortfall > 0);
        title = `${empName} — ${branch} — تنبيهات سعرية`;
        break;
      case 'alertTotal':
        filtered = empData.filter((d) => d.priceShortfall > 0);
        title = `${empName} — ${branch} — تفاصيل النقص`;
        break;
      default:
        return;
    }

    if (filtered.length === 0) return;

    setDrilldown({
      title,
      filterType,
      bookings: filtered.map((d) => ({
        bookingNumber: d.bookingNumber,
        guestName: d.guestName,
        roomUnit: d.roomUnit,
        priceSAR: d.priceSAR,
        priceShortfall: d.priceShortfall,
        nights: d.nights,
        nightlyRate: d.nightlyRate,
        minPrice: d.minPrice,
        roomTypeLabel: d.roomTypeLabel,
        bookingSource: d.bookingSource,
        shift: d.shift,
        checkInTime: d.checkInTime,
        checkoutDateStr: d.checkoutDateStr,
        creationTime: d.creationTime,
        roomCategory: d.roomCategory,
        isMonthly: d.isMonthly,
        isMerged: d.isMerged,
        isRoomTransfer: d.isRoomTransfer,
      })),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- VIP_ROOMS is stable config
  }, [countedData]);

  /** مصدر موثّق واحد: جدول "ملخص المكافآت لكل موظف". كل الأرقام (المرجع، استقبال، بوكينج، صباح، مساء، ليل، VIP) تُحسب هنا فقط. الـ payload للتقرير = نفس rows. */
  const rows = useMemo(() => {
    const staffMap: Record<string, number> = {};
    for (const s of staffList) {
      const k = `${s.branch}|${s.name}`;
      staffMap[k] = (staffMap[k] || 0) + s.bookingCount;
    }

    const agg: Record<string, {
      name: string; branch: string; staffCount: number; counted: number;
      reportTotal: number; excess: number;
      استقبال: number; بوكينج: number;
      صباح: number; مساء: number; ليل: number;
      /** استقبال عادي فقط (غير VIP) لكل شفت — للحساب الجديد */
      receptionMorning: number; receptionEvening: number; receptionNight: number;
      /** بوكينج عادي فقط (غير VIP) — للحساب الجديد */
      bookingRegular: number;
      vipRooms: Record<string, number>; vipTotal: number;
      /** VIP bookings per room broken down by source (reception / booking) */
      vipBySource: Record<string, { reception: number; booking: number }>;
      /** VIP bookings that fell in each shift (for subtraction from total shift counts) */
      vipMorning: number; vipEvening: number; vipNight: number;
      alertCount: number; alertTotal: number; mergedCount: number;
    }> = {};

    const makeEmpty = (name: string, branch: string, staffCount: number) => ({
      name, branch, staffCount,
      counted: 0, reportTotal: 0, excess: 0,
      استقبال: 0, بوكينج: 0,
      صباح: 0, مساء: 0, ليل: 0,
      receptionMorning: 0, receptionEvening: 0, receptionNight: 0,
      bookingRegular: 0,
      vipRooms: Object.fromEntries(ALL_VIP_NUMS.map((n) => [n, 0])),
      vipTotal: 0,
      vipBySource: {} as Record<string, { reception: number; booking: number }>,
      vipMorning: 0, vipEvening: 0, vipNight: 0,
      alertCount: 0, alertTotal: 0, mergedCount: 0,
    });

    for (const s of staffList) {
      if (s.bookingCount === 0) continue;
      const k = `${s.branch}|${s.name}`;
      if (!agg[k]) agg[k] = makeEmpty(s.name, s.branch, staffMap[k] || 0);
    }

    for (const d of data) {
      const k = `${d.branch}|${d.employeeName}`;
      if (!agg[k]) agg[k] = makeEmpty(d.employeeName, d.branch, staffMap[k] || 0);
      agg[k].reportTotal++;
      if (d.isExcess) agg[k].excess++;
    }

    for (const d of countedData) {
      const k = `${d.branch}|${d.employeeName}`;
      if (!agg[k]) continue;
      const a = agg[k];
      const roomNum = extractRoomNumber(d.roomUnit);
      const branchVips = VIP_ROOMS[d.branch] || [];
      const isVipRoom = !!(roomNum && branchVips.includes(roomNum));

      a.counted++;
      if (d.bookingSource === 'استقبال') a['استقبال']++;
      else if (d.bookingSource === 'بوكينج') a['بوكينج']++;
      if (d.shift === 'صباح') a['صباح']++;
      else if (d.shift === 'مساء') a['مساء']++;
      else a['ليل']++;

      // استقبال عادي (غير غرف VIP) — غرف VIP = من إعدادات الفرع فقط (كورنيش 603,604؛ أندلس 601,602,603,604)
      if (d.bookingSource === 'استقبال' && !isVipRoom) {
        if (d.shift === 'صباح') a.receptionMorning++;
        else if (d.shift === 'مساء') a.receptionEvening++;
        else a.receptionNight++;
      }
      // بوكينج عادي (غير غرف VIP)
      if (d.bookingSource === 'بوكينج' && !isVipRoom) a.bookingRegular++;

      // VIP = هذه الغرف فقط (من إعدادات الفرع)
      if (isVipRoom) {
        a.vipTotal++;
        a.vipRooms[roomNum] = (a.vipRooms[roomNum] || 0) + 1;
        if (!a.vipBySource[roomNum]) a.vipBySource[roomNum] = { reception: 0, booking: 0 };
        if (d.bookingSource === 'استقبال') a.vipBySource[roomNum].reception++;
        else if (d.bookingSource === 'بوكينج') a.vipBySource[roomNum].booking++;
        if (d.shift === 'صباح') a.vipMorning++;
        else if (d.shift === 'مساء') a.vipEvening++;
        else a.vipNight++;
      }
      if (d.priceShortfall > 0) {
        a.alertCount++;
        a.alertTotal += d.priceShortfall;
      }
      if (d.isMerged) a.mergedCount++;
    }

    // عندما المحلّل من التقرير أقل من المرجع: نوزّع تناسبياً حتى المجموع = المرجع (عشان الرسالة للموظف تكون منطقية: 111 عقد = X استقبال + Y بوكينج).
    for (const k of Object.keys(agg)) {
      const a = agg[k];
      const ref = a.staffCount;
      const counted = a.counted;
      if (ref <= 0 || counted <= 0) continue;
      if (counted === ref) continue;

      const oldRec = a['استقبال'];
      const oldM = a['صباح'];
      const oldE = a['مساء'];

      a['استقبال'] = Math.round(ref * (oldRec / counted));
      a['بوكينج'] = ref - a['استقبال'];
      a['صباح'] = Math.round(ref * (oldM / counted));
      a['مساء'] = Math.round(ref * (oldE / counted));
      a['ليل'] = ref - a['صباح'] - a['مساء'];

      const oldRm = a.receptionMorning;
      const oldRe = a.receptionEvening;
      const oldRn = a.receptionNight;
      const oldBr = a.bookingRegular;
      const oldNonVipRec = oldRm + oldRe + oldRn;
      const oldNonVipBook = oldBr;
      const totalNonVip = oldNonVipRec + oldNonVipBook;
      if (totalNonVip > 0) {
        const vipTotal = a.vipTotal;
        const toDist = ref - vipTotal;
        if (toDist > 0) {
          const recShare = oldNonVipRec / totalNonVip;
          const newNonVipRec = Math.round(toDist * recShare);
          const newNonVipBook = toDist - newNonVipRec;
          if (oldNonVipRec > 0) {
            a.receptionMorning = Math.round(newNonVipRec * (oldRm / oldNonVipRec));
            a.receptionEvening = Math.round(newNonVipRec * (oldRe / oldNonVipRec));
            a.receptionNight = newNonVipRec - a.receptionMorning - a.receptionEvening;
          } else {
            a.receptionMorning = 0;
            a.receptionEvening = 0;
            a.receptionNight = newNonVipRec;
          }
          a.bookingRegular = newNonVipBook;
        }
      }
    }

    return Object.values(agg);
  }, [staffList, data, countedData, ALL_VIP_NUMS, VIP_ROOMS]);

  // Sort handler
  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => d === 'desc' ? 'asc' : 'desc');
        return key;
      }
      setSortDir('desc');
      return key;
    });
  }, []);

  // Sorted rows
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    const dir = sortDir === 'desc' ? -1 : 1;
    arr.sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      if (sortKey === 'name') {
        va = a.name; vb = b.name;
        return dir * (va as string).localeCompare(vb as string, 'ar');
      }
      if (sortKey === 'branch') {
        va = a.branch; vb = b.branch;
        return dir * (va as string).localeCompare(vb as string, 'ar');
      }
      if (sortKey.startsWith('vip_')) {
        const num = sortKey.replace('vip_', '');
        va = a.vipRooms[num] || 0;
        vb = b.vipRooms[num] || 0;
      } else {
        va = (a as Record<string, unknown>)[sortKey] as number ?? 0;
        vb = (b as Record<string, unknown>)[sortKey] as number ?? 0;
      }
      return dir * ((va as number) - (vb as number));
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  if (!sortedRows.length) return null;

  // Determine which VIP room columns have data
  const activeVipRooms = ALL_VIP_NUMS.filter((num) =>
    sortedRows.some((r) => (r.vipRooms[num] || 0) > 0)
  );

  const handleTransferToRewards = () => {
    setTransferring(true);
    setTransferDone(false);

    // الـ payload من نفس rows اللي يعرضها الجدول — لا مصدر غيره
    const payload = {
      type: 'ADORA_TRANSFER',
      rows: rows.map((r) => ({
        name: r.name,
        branch: r.branch,
        staffCount: r.staffCount,
        counted: r.counted,
        excess: r.excess,
        استقبال: r['استقبال'],
        بوكينج: r['بوكينج'],
        _reception: r['استقبال'],
        _booking: r['بوكينج'],
        صباح: r['صباح'],
        مساء: r['مساء'],
        ليل: r['ليل'],
        _morning: r['صباح'],
        _evening: r['مساء'],
        _night: r['ليل'],
        _receptionMorning: r.receptionMorning,
        _receptionEvening: r.receptionEvening,
        _receptionNight: r.receptionNight,
        _bookingRegular: r.bookingRegular,
        vipRooms: r.vipRooms,
        vipTotal: r.vipTotal,
        vipBySource: r.vipBySource,
        vipMorning: r.vipMorning,
        vipEvening: r.vipEvening,
        vipNight: r.vipNight,
        alertCount: r.alertCount,
        alertTotal: r.alertTotal,
        mergedCount: r.mergedCount,
      })),
      rawBookings: countedData.map((d) => ({
        employeeName: d.employeeName,
        branch: d.branch,
        bookingNumber: d.bookingNumber,
        guestName: d.guestName,
        roomUnit: d.roomUnit,
        priceSAR: d.priceSAR,
        priceShortfall: d.priceShortfall,
        nights: d.nights,
        nightlyRate: d.nightlyRate,
        minPrice: d.minPrice,
        roomTypeLabel: d.roomTypeLabel,
        bookingSource: d.bookingSource,
        shift: d.shift,
        checkInTime: d.checkInTime,
        checkoutDateStr: d.checkoutDateStr,
        creationTime: d.creationTime,
        roomCategory: d.roomCategory,
        isMonthly: d.isMonthly,
        isMerged: d.isMerged,
        isRoomTransfer: d.isRoomTransfer,
      })),
      config: {
        branches: Object.fromEntries(
          Object.entries(config.branches)
            .filter(([, bc]) => !bc.excluded)
            .map(([name, bc]) => [name, { vipRooms: bc.vipRooms }])
        ),
        rewardPricing: config.rewardPricing,
      },
      activeVipRooms,
      period: dateRange ? { from: dateRange.from, to: dateRange.to } : null,
    };

    // ====== Same-origin localStorage transfer (via Vite proxy) ======
    try {
      localStorage.setItem('adora_transfer_payload', JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to write transfer payload to localStorage:', e);
      setTransferring(false);
      alert('خطأ في حفظ بيانات النقل. حاول مرة أخرى.');
      return;
    }

    // Short delay so localStorage write is committed before navigation
    setTransferDone(true);
    setTimeout(() => setTransferDone(false), 3000);
    const adminKey = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('admin') || '' : '';
    const ts = Date.now();
    const rewardsQuery = adminKey ? `?admin=${encodeURIComponent(adminKey)}&transfer=1&t=${ts}` : `?transfer=1&t=${ts}`;
    // حد أدنى لعرض طبقة الانتقال (400ms) ثم الانتقال — تجربة أكثر سلاسة
    const minOverlayMs = 400;
    const navDelay = Math.max(150, minOverlayMs);
    setTimeout(() => {
      window.location.href = '/rewards/' + rewardsQuery;
    }, navDelay);
  };

  const totals = rows.reduce(
    (t, r) => {
      const result = {
        staff: t.staff + r.staffCount,
        counted: t.counted + r.counted,
        excess: t.excess + r.excess,
        استقبال: t['استقبال'] + r['استقبال'],
        بوكينج: t['بوكينج'] + r['بوكينج'],
        صباح: t['صباح'] + r['صباح'],
        مساء: t['مساء'] + r['مساء'],
        ليل: t['ليل'] + r['ليل'],
        vipTotal: t.vipTotal + r.vipTotal,
        vipRooms: { ...t.vipRooms },
        alertCount: t.alertCount + r.alertCount,
        alertTotal: t.alertTotal + r.alertTotal,
      };
      for (const num of activeVipRooms) {
        result.vipRooms[num] = (result.vipRooms[num] || 0) + (r.vipRooms[num] || 0);
      }
      return result;
    },
    {
      staff: 0, counted: 0, excess: 0, استقبال: 0, بوكينج: 0,
      صباح: 0, مساء: 0, ليل: 0, vipTotal: 0,
      vipRooms: Object.fromEntries(activeVipRooms.map((n) => [n, 0])),
      alertCount: 0, alertTotal: 0,
    }
  );

  return (
    <section className="summary-section relative rounded-2xl overflow-hidden backdrop-blur-xl neon-glow table-section-no-side-shadow">
      {/* طبقة انتقال احترافية عند النقر على "الانتقال إلى حساب المكافآت" */}
      {transferring && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-md transition-opacity duration-300"
          aria-live="polite"
          role="status"
        >
          <div className="flex flex-col items-center gap-5 rounded-2xl px-8 py-8 shadow-2xl border border-[var(--adora-focus-border)] bg-[var(--adora-card-bg)] min-w-[280px]">
            <div className="w-12 h-12 rounded-full border-2 border-[var(--adora-accent)] border-t-transparent animate-spin" />
            <p className="text-[var(--adora-text)] font-bold text-base">
              جاري التحويل إلى صفحة المكافآت...
            </p>
            <p className="text-[var(--adora-text-secondary)] text-sm">
              سيتم فتح الصفحة خلال لحظات
            </p>
          </div>
        </div>
      )}
      {/* Glow effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/[0.03] via-transparent to-violet-500/[0.03] pointer-events-none" />

      <div className="relative px-5 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-[var(--adora-text)] flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-teal-500/20">
              <Users className="w-4 h-4 text-[var(--adora-accent)]" />
            </div>
            ملخص المكافآت لكل موظف
          </h2>
          <p className="text-[15px] text-[var(--adora-text-secondary)] mt-1 mr-9">
            فلتر مزدوج: تاريخ الإنشاء + تاريخ الدخول كلاهما داخل النطاق
          </p>
        </div>
        <button
          onClick={handleTransferToRewards}
          disabled={transferring}
          className={`flex items-center gap-2 px-7 py-3 rounded-xl text-sm font-bold transition-all duration-300 ${
            transferDone
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
              : transferring
              ? 'bg-[var(--adora-active-bg)] text-[var(--adora-accent)] border border-[var(--adora-focus-border)] animate-pulse cursor-wait'
              : 'bg-[var(--adora-hover-bg)] text-[var(--adora-accent)] border border-[var(--adora-focus-border)] hover:bg-[var(--adora-active-bg)] hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
          }`}
        >
          {transferDone ? (
            <><CircleCheck className="w-4 h-4" /> تم النقل</>
          ) : transferring ? (
            <><Send className="w-4 h-4 animate-bounce" /> جاري النقل...</>
          ) : (
            <><Send className="w-4 h-4" /> الانتقال إلى حساب المكافآت</>
          )}
        </button>
      </div>

      <div className="relative overflow-x-auto">
        <table className="text-sm w-full app-summary-table">
          <thead>
            {/* Group labels with turquoise dividers */}
            <tr>
              <th colSpan={2} className="py-2.5 bg-[var(--adora-table-header-bg)]"></th>
              <th colSpan={3} className="py-2.5 text-center bg-[var(--adora-table-header-bg)] group-divider">
                <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-[14px] font-bold tracking-wide badge-adora">
                  الحجوزات
                </span>
              </th>
              <th colSpan={3} className="py-2.5 text-center bg-[var(--adora-table-header-bg)] group-divider">
                <span className="inline-flex items-center gap-1.5 px-4 py-1 rounded-full text-[14px] font-bold tracking-wide badge-warning">
                  الشفتات
                </span>
              </th>
              {activeVipRooms.length > 0 && (
                <th colSpan={activeVipRooms.length} className="py-2.5 text-center bg-[var(--adora-table-header-bg)] group-divider">
                  <span className="inline-flex items-center gap-1 px-4 py-1 rounded-full text-[14px] font-bold tracking-wide badge-warning">
                    <Crown className="w-3 h-3" />VIP
                  </span>
                </th>
              )}
              <th colSpan={2} className="py-2.5 text-center bg-[var(--adora-table-header-bg)] group-divider">
                <span className="inline-flex items-center gap-1 px-4 py-1 rounded-full text-[14px] font-bold tracking-wide badge-error">
                  تنبيهات
                </span>
              </th>
            </tr>
            {/* Column names — sortable */}
            <tr className="border-b border-[var(--adora-border)]">
              {[
                { key: 'name', label: 'الموظف', cls: 'px-3 py-2.5 text-right text-[15px] text-[var(--adora-text-secondary)] font-bold' },
                { key: 'branch', label: 'الفرع', cls: 'px-3 py-2.5 text-right text-[15px] text-[var(--adora-text-secondary)] font-bold' },
                { key: 'staffCount', label: 'المرجع', cls: 'px-3 py-2.5 text-center text-[15px] text-[var(--adora-accent)] font-bold bg-cyan-500/[0.04] group-divider-subtle' },
                { key: 'استقبال', label: 'استقبال', cls: 'px-3 py-2.5 text-center text-[15px] text-[var(--adora-success)] font-medium bg-cyan-500/[0.04]' },
                { key: 'بوكينج', label: 'بوكينج', cls: 'px-3 py-2.5 text-center text-[15px] text-[var(--adora-warning)] font-medium bg-cyan-500/[0.04]' },
                { key: 'صباح', label: 'صباح', cls: 'px-3 py-2.5 text-center text-[15px] text-[var(--adora-warning)] font-medium bg-amber-500/[0.04] group-divider-subtle' },
                { key: 'مساء', label: 'مساء', cls: 'px-3 py-2.5 text-center text-[15px] text-[var(--adora-text-secondary)] font-medium bg-amber-500/[0.04]' },
                { key: 'ليل', label: 'ليل', cls: 'px-3 py-2.5 text-center text-[15px] text-[var(--adora-text-secondary)] font-medium bg-amber-500/[0.04]' },
              ].map((col) => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`${col.cls} cursor-pointer select-none hover:bg-[var(--adora-hover-bg)] transition-colors group/th`}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {sortKey === col.key
                      ? sortDir === 'desc'
                        ? <ChevronDown className="w-3 h-3 opacity-80" />
                        : <ChevronUp className="w-3 h-3 opacity-80" />
                      : <ChevronDown className="w-3 h-3 opacity-0 group-hover/th:opacity-30 transition-opacity" />
                    }
                  </span>
                </th>
              ))}
              {activeVipRooms.map((num, idx) => (
                <th key={num}
                  onClick={() => handleSort(`vip_${num}`)}
                  className={`px-2 py-2.5 text-center text-[15px] text-[var(--adora-warning)] font-bold bg-violet-500/[0.04] cursor-pointer select-none hover:bg-[var(--adora-hover-bg)] transition-colors group/th${idx === 0 ? ' group-divider-subtle' : ''}`}>
                  <span className="inline-flex items-center gap-0.5">
                    {num}
                    {sortKey === `vip_${num}`
                      ? sortDir === 'desc'
                        ? <ChevronDown className="w-3 h-3 opacity-80" />
                        : <ChevronUp className="w-3 h-3 opacity-80" />
                      : <ChevronDown className="w-3 h-3 opacity-0 group-hover/th:opacity-30 transition-opacity" />
                    }
                  </span>
                </th>
              ))}
              {[
                { key: 'alertCount', label: 'تنبيه' },
                { key: 'alertTotal', label: 'نقص SAR' },
              ].map((col, idx) => (
                <th key={col.key}
                  onClick={() => handleSort(col.key)}
                  className={`px-2 py-2.5 text-center text-[15px] text-[var(--adora-error)] font-medium bg-red-500/[0.04] whitespace-nowrap cursor-pointer select-none hover:bg-[var(--adora-hover-bg)] transition-colors group/th${idx === 0 ? ' group-divider-subtle' : ''}`}>
                  <span className="inline-flex items-center gap-0.5">
                    {col.label}
                    {sortKey === col.key
                      ? sortDir === 'desc'
                        ? <ChevronDown className="w-3 h-3 opacity-80" />
                        : <ChevronUp className="w-3 h-3 opacity-80" />
                      : <ChevronDown className="w-3 h-3 opacity-0 group-hover/th:opacity-30 transition-opacity" />
                    }
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, rowIdx) => (
              <tr key={`${r.branch}-${r.name}`}
                className={`group border-b border-white/[0.03] transition-all duration-200 hover:bg-white/[0.03] ${
                  rowIdx % 2 === 0 ? '' : 'bg-white/[0.01]'
                }`}>
                <td className="px-2 py-2 font-medium text-[var(--adora-text)] truncate text-sm">{r.name}</td>
                <td className="px-2 py-2">
                  <span className="inline-block px-2.5 py-0.5 rounded-full text-[14px] font-semibold badge-adora">{r.branch}</span>
                </td>
                {/* الحجوزات */}
                <td className="px-1.5 py-2 text-center bg-cyan-500/[0.03] group-divider-subtle">
                  <span className="text-[var(--adora-accent)] font-mono font-bold text-sm">{r.staffCount}</span>
                </td>
                <td className="px-1.5 py-2 text-center bg-cyan-500/[0.03]">
                  {r['استقبال'] > 0
                    ? <button onClick={() => openDrilldown(r.name, r.branch, 'استقبال')} className="font-mono text-[var(--adora-success)] hover:bg-[var(--adora-hover-bg)] px-1.5 py-0.5 rounded-md transition-all cursor-pointer text-sm">{r['استقبال']}</button>
                    : <span className="text-[var(--adora-text-secondary)] font-mono text-sm">0</span>
                  }
                </td>
                <td className="px-1.5 py-2 text-center bg-cyan-500/[0.03]">
                  {r['بوكينج'] > 0
                    ? <button onClick={() => openDrilldown(r.name, r.branch, 'بوكينج')} className="font-mono text-[var(--adora-warning)] hover:bg-[var(--adora-hover-bg)] px-1.5 py-0.5 rounded-md transition-all cursor-pointer text-sm">{r['بوكينج']}</button>
                    : <span className="text-[var(--adora-text-secondary)] font-mono text-sm">0</span>
                  }
                </td>
                {/* الشفتات */}
                <td className="px-1.5 py-2 text-center bg-amber-500/[0.03] group-divider-subtle">
                  {r['صباح'] > 0
                    ? <button onClick={() => openDrilldown(r.name, r.branch, 'صباح')} className="font-mono text-[var(--adora-warning)] hover:bg-[var(--adora-hover-bg)] px-1.5 py-0.5 rounded-md transition-all cursor-pointer text-sm">{r['صباح']}</button>
                    : <span className="text-[var(--adora-text-secondary)] font-mono text-sm">0</span>
                  }
                </td>
                <td className="px-1.5 py-2 text-center bg-amber-500/[0.03]">
                  {r['مساء'] > 0
                    ? <button onClick={() => openDrilldown(r.name, r.branch, 'مساء')} className="font-mono text-[var(--adora-accent)] hover:bg-[var(--adora-hover-bg)] px-1.5 py-0.5 rounded-md transition-all cursor-pointer text-sm">{r['مساء']}</button>
                    : <span className="text-[var(--adora-text-secondary)] font-mono text-sm">0</span>
                  }
                </td>
                <td className="px-1.5 py-2 text-center bg-amber-500/[0.03]">
                  {r['ليل'] > 0
                    ? <button onClick={() => openDrilldown(r.name, r.branch, 'ليل')} className="font-mono text-[var(--adora-text)] hover:bg-[var(--adora-hover-bg)] px-1.5 py-0.5 rounded-md transition-all cursor-pointer text-sm">{r['ليل']}</button>
                    : <span className="text-[var(--adora-text-secondary)] font-mono text-sm">0</span>
                  }
                </td>
                {/* VIP */}
                {activeVipRooms.map((num, vipIdx) => {
                  const count = r.vipRooms[num] || 0;
                  const branchVips = VIP_ROOMS[r.branch] || [];
                  const applicable = branchVips.includes(num);
                  return (
                    <td key={num} className={`px-1.5 py-2 text-center bg-violet-500/[0.03]${vipIdx === 0 ? ' group-divider-subtle' : ''}`}>
                      {!applicable
                        ? <span className="text-[var(--adora-text-secondary)] text-sm">—</span>
                        : count > 0
                        ? <button onClick={() => openDrilldown(r.name, r.branch, 'vip', num)} className="font-mono font-bold text-sm text-[var(--adora-warning)] hover:bg-[var(--adora-hover-bg)] px-2 py-0.5 rounded-md transition-all cursor-pointer">{count}</button>
                        : <span className="text-[var(--adora-text-secondary)] font-mono text-sm">0</span>
                      }
                    </td>
                  );
                })}
                {/* تنبيهات */}
                <td className="px-1.5 py-2 text-center bg-red-500/[0.02] group-divider-subtle">
                  {r.alertCount > 0
                    ? <button onClick={() => openDrilldown(r.name, r.branch, 'alert')} className="font-mono font-bold text-sm text-[var(--adora-error)] hover:bg-[var(--adora-hover-bg)] px-1.5 py-0.5 rounded-md transition-all cursor-pointer">{r.alertCount}</button>
                    : <span className="text-[var(--adora-success)] text-sm">✓</span>
                  }
                </td>
                <td className="px-1.5 py-2 text-center bg-red-500/[0.02]">
                  {r.alertTotal > 0
                    ? <button onClick={() => openDrilldown(r.name, r.branch, 'alertTotal')} className="font-mono font-bold text-sm text-[var(--adora-error)] hover:bg-[var(--adora-hover-bg)] px-1.5 py-0.5 rounded-md transition-all cursor-pointer">{Math.round(r.alertTotal).toLocaleString('en-SA')}</button>
                    : <span className="text-[var(--adora-text-secondary)] text-sm">—</span>
                  }
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-[var(--adora-table-header-bg)] backdrop-blur-sm">
              <td className="px-2 py-2.5 text-[var(--adora-text)] text-sm font-bold" colSpan={2}>
                <span className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--adora-accent)] animate-pulse" />
                  الإجمالي
                </span>
              </td>
              <td className="px-1.5 py-2.5 text-center bg-cyan-500/[0.06] group-divider-subtle"><span className="text-[var(--adora-accent)] font-mono font-bold text-sm">{totals.staff}</span></td>
              <td className="px-1.5 py-2.5 text-center bg-cyan-500/[0.06]"><span className="text-[var(--adora-success)] font-mono font-semibold text-sm">{totals['استقبال']}</span></td>
              <td className="px-1.5 py-2.5 text-center bg-cyan-500/[0.06]"><span className="text-[var(--adora-warning)] font-mono font-semibold text-sm">{totals['بوكينج']}</span></td>
              <td className="px-1.5 py-2.5 text-center bg-amber-500/[0.06] group-divider-subtle"><span className="text-[var(--adora-warning)] font-mono font-semibold text-sm">{totals['صباح']}</span></td>
              <td className="px-1.5 py-2.5 text-center bg-amber-500/[0.06]"><span className="text-[var(--adora-accent)] font-mono font-semibold text-sm">{totals['مساء']}</span></td>
              <td className="px-1.5 py-2.5 text-center bg-amber-500/[0.06]"><span className="text-[var(--adora-text)] font-mono font-semibold text-sm">{totals['ليل']}</span></td>
              {activeVipRooms.map((num, idx) => (
                <td key={num} className={`px-1.5 py-2.5 text-center bg-violet-500/[0.06]${idx === 0 ? ' group-divider-subtle' : ''}`}>
                  <span className="text-[var(--adora-warning)] font-mono font-bold text-sm">{totals.vipRooms[num] || 0}</span>
                </td>
              ))}
              <td className="px-1.5 py-2.5 text-center bg-red-500/[0.04] group-divider-subtle">
                {totals.alertCount > 0
                  ? <span className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 rounded-full text-sm font-bold badge-error">{totals.alertCount}</span>
                  : <span className="text-[var(--adora-success)] text-sm">✓</span>
                }
              </td>
              <td className="px-2 py-3.5 text-center bg-red-500/[0.04]">
                {totals.alertTotal > 0
                  ? <span className="text-[var(--adora-error)] font-mono font-semibold text-sm">{Math.round(totals.alertTotal).toLocaleString('en-SA')}</span>
                  : <span className="text-[var(--adora-text-secondary)] text-sm">—</span>
                }
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Drilldown Popup */}
      {drilldown && (() => {
        const totalRent = drilldown.bookings.reduce((s, b) => s + b.priceSAR, 0);
        const totalShortfall = drilldown.bookings.reduce((s, b) => s + b.priceShortfall, 0);
        const totalNights = drilldown.bookings.reduce((s, b) => s + b.nights, 0);
        const hasAlerts = drilldown.bookings.some((b) => b.priceShortfall > 0);
        const hasTransfers = drilldown.bookings.some((b) => b.isRoomTransfer);

        return createPortal(
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setDrilldown(null)}>
            <div
              className="bg-[var(--adora-modal-bg)] border border-[var(--adora-border)] rounded-2xl modal-no-side-shadow
                         max-w-3xl w-[95%] max-h-[80vh] flex flex-col overflow-hidden"
              onClick={(e) => e.stopPropagation()}>
              {/* Header */}
              <div className="px-5 py-3 border-b border-[var(--adora-border)] flex items-center justify-between shrink-0 bg-[var(--adora-modal-header-bg)]">
                <h3 className="text-sm font-semibold text-[var(--adora-text)]">{drilldown.title}</h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => {
                    const w = window.open('', '_blank');
                    if (!w) return;
                    const bkgs = drilldown.bookings;
                    const tRent = Math.round(totalRent).toLocaleString('en-SA');
                    const tShort = Math.round(totalShortfall).toLocaleString('en-SA');
                    const alertRows = bkgs.filter((b) => b.priceShortfall > 0);
                    const transferRows = bkgs.filter((b) => b.isRoomTransfer);
                    w.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
                      <title>تقرير فروقات الأسعار — ${drilldown.title}</title>
                      <style>
                        *{margin:0;padding:0;box-sizing:border-box}
                        body{font-family:'IBM Plex Sans Arabic','Segoe UI',Tahoma,sans-serif;font-size:11px;color:#111;padding:20px 30px;background:#fff;direction:rtl;line-height:1.35}
                        h1{font-size:16px;text-align:center;margin-bottom:8px;color:#0f172a;padding-bottom:6px;border-bottom:2px solid #0d9488}
                        .sub{text-align:center;color:#64748b;font-size:10px;margin-bottom:12px}
                        .summary{display:flex;gap:20px;justify-content:center;margin-bottom:14px;font-size:11px;flex-wrap:wrap}
                        .summary span{background:#f1f5f9;padding:3px 10px;border-radius:4px}
                        .summary .alert{background:#fef2f2;color:#dc2626}
                        .summary .transfer{background:#eff6ff;color:#2563eb}
                        table{width:100%;border-collapse:collapse;margin-bottom:14px}
                        th{background:#ccfbf1;border:1px solid #99f6e4;padding:4px 6px;text-align:right;font-size:10px;color:#0f766e;white-space:nowrap}
                        td{border:1px solid #e2e8f0;padding:3px 6px;font-size:10px;white-space:nowrap}
                        .mono{font-family:Consolas,'Courier New',monospace}
                        .num{text-align:left;direction:ltr}
                        .red{color:#dc2626;font-weight:700}
                        .green{color:#16a34a}
                        .blue{color:#2563eb}
                        .badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;margin-inline-start:3px}
                        .b-recv{background:#dcfce7;color:#166534}.b-book{background:#ffedd5;color:#9a3412}
                        .b-vip{background:#f3e8ff;color:#7c3aed}.b-merge{background:#cffafe;color:#0e7490}
                        .b-monthly{background:#fae8ff;color:#a21caf}.b-transfer{background:#dbeafe;color:#1d4ed8}
                        .row-alert{background:#fef2f2}.row-transfer{background:#eff6ff}
                        .footer{text-align:center;color:#94a3b8;font-size:9px;margin-top:20px;border-top:1px solid #e2e8f0;padding-top:8px}
                        @media print{body{padding:10px 15px}@page{size:A4 landscape;margin:10mm}thead{display:table-header-group}}
                      </style></head><body>
                      <h1>تقرير فروقات الأسعار</h1>
                      <div class="sub">${drilldown.title} | ${new Date().toLocaleDateString('ar-SA')}</div>
                      <div class="summary">
                        <span><b>${bkgs.length}</b> حجز</span>
                        <span><b>${totalNights}</b> ليلة</span>
                        <span>إيجار: <b class="mono">${tRent}</b> ر.س</span>
                        ${alertRows.length > 0 ? `<span class="alert"><b>${alertRows.length}</b> تنبيه | نقص: <b class="mono">${tShort}</b> ر.س</span>` : '<span class="green">✓ لا يوجد نقص</span>'}
                        ${transferRows.length > 0 ? `<span class="transfer">↔ ${transferRows.length} نقل غرفة</span>` : ''}
                      </div>
                      <table>
                        <thead><tr>
                          <th>#</th><th>رقم الحجز</th><th>العميل</th><th>الغرفة</th><th>التصنيف</th>
                          <th>المصدر</th><th>الوردية</th><th>الدخول</th><th>الخروج</th><th>ليالي</th>
                          <th>الإيجار</th><th>سعر/ل</th><th>حد أدنى/ل</th><th>المتوقع</th><th>النقص</th><th>ملاحظات</th>
                        </tr></thead>
                        <tbody>${bkgs.map((b, i) => {
                          const expected = b.minPrice * b.nights;
                          const badges: string[] = [];
                          if (b.bookingSource === 'استقبال') badges.push('<span class="badge b-recv">استقبال</span>');
                          else if (b.bookingSource === 'بوكينج') badges.push('<span class="badge b-book">بوكينج</span>');
                          if (b.roomCategory === 'VIP') badges.push('<span class="badge b-vip">VIP</span>');
                          if (b.isMerged) badges.push('<span class="badge b-merge">دمج</span>');
                          if (b.isMonthly) badges.push('<span class="badge b-monthly">شهري</span>');
                          if (b.isRoomTransfer) badges.push('<span class="badge b-transfer">نقل غرفة</span>');
                          const cls = b.priceShortfall > 0 ? 'row-alert' : b.isRoomTransfer ? 'row-transfer' : '';
                          const shortfallCell = b.isRoomTransfer
                            ? '<td class="blue">مستبعد</td>'
                            : b.priceShortfall > 0
                            ? `<td class="num mono red">▼ ${Math.round(b.priceShortfall).toLocaleString('en-SA')}</td>`
                            : '<td class="green">✓</td>';
                          const notes = b.isRoomTransfer ? 'نقل بين غرفتين — لا يمكن تقسيم السعر'
                            : b.priceShortfall > 0 ? `${b.minPrice}×${b.nights}=${expected.toLocaleString('en-SA')} − ${b.priceSAR.toLocaleString('en-SA')} = ${Math.round(b.priceShortfall).toLocaleString('en-SA')}`
                            : '';
                          return `<tr class="${cls}">
                            <td>${i+1}</td>
                            <td class="mono">${b.bookingNumber}</td>
                            <td>${b.guestName || '—'}</td>
                            <td>${b.roomUnit || '—'}</td>
                            <td>${b.roomTypeLabel || '—'} ${badges.join('')}</td>
                            <td>${b.bookingSource}</td>
                            <td>${b.shift}</td>
                            <td class="mono">${b.checkInTime || '—'}</td>
                            <td class="mono">${b.checkoutDateStr || '—'}</td>
                            <td class="num mono">${b.nights}</td>
                            <td class="num mono">${b.priceSAR > 0 ? b.priceSAR.toLocaleString('en-SA') : '—'}</td>
                            <td class="num mono">${b.nightlyRate > 0 ? b.nightlyRate.toLocaleString('en-SA') : '—'}</td>
                            <td class="num mono">${b.minPrice > 0 ? b.minPrice.toLocaleString('en-SA') : '—'}</td>
                            <td class="num mono">${expected > 0 ? expected.toLocaleString('en-SA') : '—'}</td>
                            ${shortfallCell}
                            <td style="font-size:9px;color:#64748b">${notes}</td>
                          </tr>`;
                        }).join('')}</tbody>
                        <tfoot><tr style="font-weight:700;background:#f8fafc">
                          <td colspan="9">الإجمالي</td>
                          <td class="num mono">${totalNights}</td>
                          <td class="num mono">${tRent}</td>
                          <td colspan="3"></td>
                          <td class="num mono red">${totalShortfall > 0 ? tShort : '✓'}</td>
                          <td></td>
                        </tr></tfoot>
                      </table>
                      <div class="footer">
                        نظام Adora لتحليل الحجوزات | تم الإنشاء ${new Date().toLocaleString('ar-SA')} | هذا التقرير للأغراض المحاسبية الداخلية فقط
                      </div>
                    </body></html>`);
                    w.document.close();
                    setTimeout(() => w.print(), 300);
                  }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                               bg-slate-700/50 text-slate-300 hover:bg-slate-600/50 hover:text-slate-100
                               border border-slate-600/30 transition-colors">
                    <Printer className="w-3.5 h-3.5" />
                    طباعة
                  </button>
                  <button onClick={() => setDrilldown(null)}
                    className="text-slate-500 hover:text-slate-200 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Summary bar */}
              <div className="px-5 py-2.5 border-b border-slate-800/50 shrink-0 flex flex-wrap gap-4 text-sm">
                <span className="text-slate-400">
                  <span className="text-slate-200 font-bold">{drilldown.bookings.length}</span> حجز
                </span>
                <span className="text-slate-400">
                  <span className="text-slate-200 font-bold">{totalNights}</span> ليلة
                </span>
                <span className="text-slate-400">
                  إجمالي الإيجار: <span className="text-emerald-400 font-bold font-mono">{Math.round(totalRent).toLocaleString('en-SA')}</span> ريال
                </span>
                {hasAlerts && (
                  <span className="text-[var(--adora-error)]">
                    نقص: <span className="font-bold font-mono">{Math.round(totalShortfall).toLocaleString('en-SA')}</span> ريال
                  </span>
                )}
                {hasTransfers && (
                  <span className="text-blue-400">↔ نقل غرفة</span>
                )}
              </div>
              {/* Body — card list */}
              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {drilldown.bookings.map((b, i) => (
                  <div key={`${b.bookingNumber}-${i}`}
                    className={`rounded-xl border p-3 transition-colors ${
                      b.priceShortfall > 0
                        ? 'bg-red-950/20 border-red-500/20'
                        : b.isRoomTransfer
                        ? 'bg-blue-950/20 border-blue-500/20'
                        : 'bg-slate-800/30 border-slate-700/30 hover:bg-slate-800/50'
                    }`}>
                    {/* Top row */}
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-slate-600 text-sm w-5 shrink-0">{i + 1}</span>
                      <span className="text-slate-100 font-mono font-bold text-sm">{b.bookingNumber}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[14px] font-bold ${
                        b.bookingSource === 'استقبال'
                          ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                          : b.bookingSource === 'بوكينج'
                          ? 'bg-orange-500/15 text-orange-400 border border-orange-500/20'
                          : 'bg-slate-500/15 text-slate-400 border border-slate-500/20'
                      }`}>{b.bookingSource}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[14px] font-bold ${
                        b.shift === 'صباح' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/20'
                        : b.shift === 'مساء' ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/20'
                        : 'bg-slate-500/15 text-slate-400 border border-slate-500/20'
                      }`}>{b.shift}</span>
                      {b.roomCategory === 'VIP' && (
                        <span className="px-1.5 py-0.5 rounded text-[14px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/20">
                          <Crown className="w-3 h-3 inline -mt-0.5 ml-0.5" />VIP
                        </span>
                      )}
                      {b.isMerged && (
                        <span className="px-1.5 py-0.5 rounded text-[14px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">دمج</span>
                      )}
                      {b.isMonthly && (
                        <span className="px-1.5 py-0.5 rounded text-[14px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">شهري</span>
                      )}
                      {b.isRoomTransfer && (
                        <span className="px-1.5 py-0.5 rounded text-[14px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">↔ نقل غرفة</span>
                      )}
                    </div>
                    {/* Detail grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-sm mr-7">
                      <div>
                        <span className="text-slate-600 block">العميل</span>
                        <span className="text-slate-300 truncate block">{b.guestName || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">الغرفة</span>
                        <span className="text-slate-300 truncate block">{b.roomUnit || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">التصنيف</span>
                        <span className="text-slate-300">{b.roomTypeLabel || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">الفترة</span>
                        <span className="text-slate-300 font-mono">
                          {b.checkInTime || '—'}
                          {b.checkoutDateStr ? ` → ${b.checkoutDateStr}` : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">وقت التسجيل</span>
                        <span className="text-cyan-300 font-mono font-bold">
                          {formatRegistrationTime(b.creationTime)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">الليالي</span>
                        <span className="text-slate-200 font-mono font-bold">{b.nights}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">الإيجار الكلي</span>
                        <span className="text-emerald-400 font-mono font-bold">
                          {b.priceSAR > 0 ? b.priceSAR.toLocaleString('en-SA') : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">سعر الليلة</span>
                        <span className="text-slate-200 font-mono">{b.nightlyRate > 0 ? b.nightlyRate.toLocaleString('en-SA') : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-600 block">الحد الأدنى/ل</span>
                        <span className="text-slate-400 font-mono">{b.minPrice > 0 ? b.minPrice.toLocaleString('en-SA') : '—'}</span>
                      </div>
                    </div>
                    {b.priceShortfall > 0 && (
                      <div className="mt-2 mr-7 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/15 flex items-center gap-2 text-sm">
                        <TrendingDown className="w-3.5 h-3.5 text-[var(--adora-error)] shrink-0" />
                        <span className="text-red-300">
                          النقص: <span className="font-mono font-bold text-[var(--adora-error)]">{Math.round(b.priceShortfall).toLocaleString('en-SA')}</span> ريال
                          <span className="text-[var(--adora-error)]/60 mr-2">
                            ({b.minPrice} × {b.nights} = {(b.minPrice * b.nights).toLocaleString('en-SA')} − {b.priceSAR.toLocaleString('en-SA')} = {Math.round(b.priceShortfall).toLocaleString('en-SA')})
                          </span>
                        </span>
                      </div>
                    )}
                    {b.isRoomTransfer && (
                      <div className="mt-2 mr-7 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center gap-2 text-sm">
                        <span className="text-blue-300">↔ تم نقل النزيل بين غرفتين — التنبيه السعري مستبعد (لا يمكن تقسيم السعر بدقة)</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        );
      })()}
    </section>
  );
}
