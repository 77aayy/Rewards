// مصدر هذا الملف: app/Rewards/. لا تعدّل النسخة في public/rewards يدوياً — عدّل هنا ثم npm run sync:rewards من مجلد app.
// === Verbose logging: تفصيلي في التطوير فقط، إيقاف في الإنتاج ===
function logVerbose() {
  try {
    if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      console.log.apply(console, arguments);
  } catch (e) {}
}

// === Role-Based Access Control (RBAC) ===
// تحويل المسار إلى query يتم في rewards-rbac.js (يُحمّل قبل هذا الملف).
const urlParams = new URLSearchParams(window.location.search);
const role = urlParams.get('role');
const token = urlParams.get('token');
const period = urlParams.get('period');
const code = urlParams.get('code');
const admin = urlParams.get('admin');

// RBAC: التحقق من الرابط يتم عند التشغيل (تحت doRbacThenInit) ليدعم التحقق من Firebase عند فشل localStorage

// === Firebase Configuration ===
// مصدر واحد للإعداد: src/firebase-config.js (يُحمّل من الـ head لتهيئة مبكرة). راجع API_KEY_SETUP_GUIDE.md
// Initialize Firebase — قد يكون مُهيّأ مسبقاً من الـ head (window.storage)
let storage = null;
let firebaseApp = null;

// === Global State ===
let db = [];
// Make db available globally for app-extensions.js
if (typeof window !== 'undefined') {
  window.db = db;
}
let branches = new Set();
let currentFilter = 'الكل';
if (typeof window !== 'undefined') window.currentFilter = 'الكل';
let currentEvalRate = 20;
let reportStartDate = null; // Store the start date for report month name
let employeeCodesMap = {}; // Map employee names to codes
let discounts = []; // Array of discount objects: { employeeName, discountType, discountPercentage, appliedAt, id }
// Make discounts available globally
if (typeof window !== 'undefined') {
  window.discounts = discounts;
}
// عدد التقييمات السلبية (أقل من تقييم الفندق) لكل فرع — يُدخل المشرف، 10 ريال × العدد يُخصم من كل موظف، و10 نقاط من التقييم
let branchNegativeRatingsCount = {}; // e.g. { 'الكورنيش': 0, 'الأندلس': 0 }
if (typeof window !== 'undefined') {
  window.branchNegativeRatingsCount = branchNegativeRatingsCount;
}
const LOCAL_REWARDS_EDIT_TS_KEY = 'adora_rewards_last_local_edit_ts';
const LOCAL_REWARDS_DIRTY_KEY = 'adora_rewards_local_dirty';
/** مساهمة شركاء النجاح: نسبة تُخصم من الإجمالي للصافي. تُقرأ ديناميكياً من إعدادات الأدمن (صندوق الدعم). */
function getSupportFundRate() {
  var p = typeof getPricingConfig === 'function' ? getPricingConfig() : {};
  var percent = (p && p.supportFundPercent != null) ? p.supportFundPercent : 15;
  return (percent / 100);
}
if (typeof window !== 'undefined') window.getSupportFundRate = getSupportFundRate;
function hideTransferLoadingOverlay() {
  var el = document.getElementById('transferLoadingOverlay');
  if (!el) return;

  function doReveal() {
    document.body.classList.remove('adora-transfer-loading');
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        setTimeout(function() {
          el.classList.remove('flex');
          el.style.display = 'none';
        }, 400);
      });
    });
  }

  if (document.readyState === 'complete') {
    doReveal();
  } else {
    window.addEventListener('load', function onLoad() {
      window.removeEventListener('load', onLoad);
      doReveal();
    });
  }
}
function markLocalRewardsDirty() {
  try {
    var ts = Date.now();
    localStorage.setItem(LOCAL_REWARDS_EDIT_TS_KEY, String(ts));
    localStorage.setItem(LOCAL_REWARDS_DIRTY_KEY, '1');
  } catch (_) {}
}
function getLocalRewardsEditTs() {
  try { return parseInt(localStorage.getItem(LOCAL_REWARDS_EDIT_TS_KEY) || '0', 10) || 0; } catch (_) { return 0; }
}
function isLocalRewardsDirty() {
  try { return localStorage.getItem(LOCAL_REWARDS_DIRTY_KEY) === '1'; } catch (_) { return false; }
}
function clearLocalRewardsDirty(ts) {
  try {
    localStorage.removeItem(LOCAL_REWARDS_DIRTY_KEY);
    if (ts) localStorage.setItem(LOCAL_REWARDS_EDIT_TS_KEY, String(ts));
  } catch (_) {}
}
// تهريب للعرض الآمن (منع XSS وكسر الـ attributes)
function escAttr(s) { return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }
function escHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/** تحميل سكربت خارجي عند الطلب (لتحسين الأداء — SheetJS، html2pdf). */
function loadScript(url) {
  return new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[src="' + url + '"]');
    if (existing) { resolve(); return; }
    if (url.indexOf('xlsx') !== -1 && typeof window.XLSX !== 'undefined') { resolve(); return; }
    if (url.indexOf('html2pdf') !== -1 && typeof window.html2pdf !== 'undefined') { resolve(); return; }
    var s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// === أزرار الترويسة: مصدر واحد مع تطبيق التحليل (App) — headerButtonsConfig.json ===
var REWARDS_HEADER_VARIANT_CLASS = { default: 'action-header-btn action-header-btn-default', red: 'action-header-btn action-header-btn--red', cyan: 'action-header-btn action-header-btn--cyan', primary: 'action-header-btn action-header-btn--primary', amber: 'action-header-btn action-header-btn--amber', violet: 'action-header-btn action-header-btn--violet' };
var REWARDS_HEADER_ICONS = {
  'arrow-left': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  'log-out': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  'lock': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
  'percent': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/></svg>',
  'bar-chart2': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  'file-text': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
  'printer': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>',
  'target': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
  'refresh': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21h5v-5"/></svg>',
  'users': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  'file-down': '<svg class="w-4 h-4 shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'
};
var REWARDS_HEADER_BUTTON_IDS = { returnToAnalysis: 'btnReturnToAnalysis', returnToUpload: 'btnReturnToUpload', printAll: 'printAllBtn', printSelected: 'printSelectedBtn', exportPdfTableAll: 'exportPdfTableAllBtn', refreshLive: 'refreshLiveBtn', adminManage: 'adminManageBtn' };

function buildActionButtonsFromConfig() {
  var container = typeof document !== 'undefined' ? document.getElementById('actionBtns') : null;
  if (!container) return;
  var base = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
  var pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
  var configPath = pathname.indexOf('/rewards') >= 0 ? '/rewards/shared/headerButtonsConfig.json' : '/shared/headerButtonsConfig.json';
  var configUrl = base + configPath;
  fetch(configUrl).then(function (res) { return res.ok ? res.json() : null; }).then(function (data) {
    if (!data || !Array.isArray(data.buttons)) return;
    var buttons = data.buttons.filter(function (b) {
      return (b.context === 'rewards' || b.context === 'both');
    });
    var html = buttons.map(function (b) {
      var cls = (REWARDS_HEADER_VARIANT_CLASS[b.variant] || REWARDS_HEADER_VARIANT_CLASS.default);
      if (b.hidden) cls += ' hidden';
      var idAttr = REWARDS_HEADER_BUTTON_IDS[b.id] ? ' id="' + escAttr(REWARDS_HEADER_BUTTON_IDS[b.id]) + '"' : '';
      var titleAttr = (b.title && b.title.trim()) ? ' title="' + escAttr(b.title) + '"' : '';
      var onclickAttr = (b.onclick && b.onclick.trim()) ? ' onclick="' + escAttr(b.onclick) + '"' : '';
      var icon = (b.iconId && REWARDS_HEADER_ICONS[b.iconId]) ? REWARDS_HEADER_ICONS[b.iconId] : '';
      var label = escHtml(b.label || '');
      var labelShort = escHtml(b.labelShort != null ? b.labelShort : b.label || '');
      var style = b.hidden ? ' style="display:none;"' : (b.id === 'returnToUpload' ? ' style="display:none;"' : '');
      return '<button type="button"' + idAttr + ' class="' + cls + '"' + titleAttr + onclickAttr + style + '>' + icon + '<span class="hidden sm:inline">' + label + '</span><span class="sm:hidden">' + labelShort + '</span></button>';
    }).join('');
    html += '<button type="button" id="btnLogoutRewards" onclick="returnToUpload(false, true)" class="action-header-btn action-header-btn--red" title="خروج — تسجيل الخروج والعودة لصفحة الدخول" aria-label="خروج">' + (REWARDS_HEADER_ICONS['log-out'] || '') + '<span>خروج</span></button>';
    container.innerHTML = html;
    // إعادة تطبيق صلاحيات الدور: الأدمن يرى كل الأزرار؛ المشرف/HR/الحسابات/المدير يرون شروط المكافآت فقط. الرابط أولاً: وجود admin= يعني أدمن حتى بعد رفرش.
    var urlParams = typeof window !== 'undefined' && window.location ? new URLSearchParams(window.location.search) : null;
    var role = (urlParams && urlParams.get('role')) || (urlParams && urlParams.get('admin') ? 'admin' : null) || (typeof localStorage !== 'undefined' && localStorage.getItem('adora_current_role')) || '';
    if (typeof initializeRoleBasedUI === 'function') initializeRoleBasedUI(role || 'admin');
  }).catch(function () {});
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildActionButtonsFromConfig);
  else buildActionButtonsFromConfig();
}

// يُعبّأ من loadDiscountTypes (البنود الـ 55 + ما يضيفه المدير)
let discountTypes = [];

// === Adora Transfer Mode ===
// Flags and data for when data is received from Project 1 via postMessage
window.adoraTransferMode = false;
window.adoraRawBookings = null;
window.adoraConfig = null;
window.adoraActiveVipRooms = [];

// === Reward Pricing (configurable rates) ===
var DEFAULT_REWARD_PRICING = {
  rateMorning: 1,
  rateEvening: 1,
  rateNight: 2,
  rateBooking: 1,
  rateContract: 200,
  rateVipByBranch: {},
  rateVipDefault: { reception: 0, booking: 0 },
  vipDescription: 'حجوزات VIP — تُسعّر من خانات VIP (استقبال/بوكينج لكل غرفة)',
  rateEvalBooking: 20,
  rateEvalGoogle: 10,
  minEvalCorniche: 8.7,
  minEvalAndalus: 8.2,
  minEvalGoogle: 4.3,
  supportFundPercent: 15
};

/**
 * Read pricing config: adoraConfig.rewardPricing > localStorage > defaults
 */
/**
 * Normalize rateVipDefault: legacy number → { reception, booking }
 */
function _normalizeVipDefault(val) {
  if (val == null) return DEFAULT_REWARD_PRICING.rateVipDefault;
  if (typeof val === 'number') return { reception: val, booking: val };
  return { reception: val.reception || 0, booking: val.booking || 0 };
}

/**
 * Normalize rateVipByBranch: legacy Record<string, Record<string, number>> → Record<string, Record<string, {reception,booking}>>
 */
function _normalizeVipByBranch(obj) {
  if (!obj || typeof obj !== 'object') return {};
  var result = {};
  Object.keys(obj).forEach(function(branch) {
    result[branch] = {};
    var rooms = obj[branch];
    if (rooms && typeof rooms === 'object') {
      Object.keys(rooms).forEach(function(room) {
        var val = rooms[room];
        if (typeof val === 'number') {
          result[branch][room] = { reception: val, booking: val };
        } else if (val && typeof val === 'object') {
          result[branch][room] = { reception: val.reception || 0, booking: val.booking || 0 };
        }
      });
    }
  });
  return result;
}

function getPricingConfig() {
  // 1. From transfer config (highest priority)
  if (window.adoraConfig && window.adoraConfig.rewardPricing) {
    var p = window.adoraConfig.rewardPricing;
    return {
      rateMorning: p.rateMorning != null ? p.rateMorning : DEFAULT_REWARD_PRICING.rateMorning,
      rateEvening: p.rateEvening != null ? p.rateEvening : DEFAULT_REWARD_PRICING.rateEvening,
      rateNight: p.rateNight != null ? p.rateNight : DEFAULT_REWARD_PRICING.rateNight,
      rateBooking: p.rateBooking != null ? p.rateBooking : DEFAULT_REWARD_PRICING.rateBooking,
      rateContract: p.rateContract != null ? p.rateContract : DEFAULT_REWARD_PRICING.rateContract,
      rateVipByBranch: _normalizeVipByBranch(p.rateVipByBranch),
      rateVipDefault: _normalizeVipDefault(p.rateVipDefault),
      vipDescription: p.vipDescription != null ? p.vipDescription : DEFAULT_REWARD_PRICING.vipDescription,
      rateEvalBooking: p.rateEvalBooking != null ? p.rateEvalBooking : DEFAULT_REWARD_PRICING.rateEvalBooking,
      rateEvalGoogle: p.rateEvalGoogle != null ? p.rateEvalGoogle : DEFAULT_REWARD_PRICING.rateEvalGoogle,
      minEvalCorniche: p.minEvalCorniche != null ? p.minEvalCorniche : DEFAULT_REWARD_PRICING.minEvalCorniche,
      minEvalAndalus: p.minEvalAndalus != null ? p.minEvalAndalus : DEFAULT_REWARD_PRICING.minEvalAndalus,
      minEvalGoogle: p.minEvalGoogle != null ? p.minEvalGoogle : DEFAULT_REWARD_PRICING.minEvalGoogle,
      supportFundPercent: p.supportFundPercent != null ? p.supportFundPercent : DEFAULT_REWARD_PRICING.supportFundPercent
    };
  }
  // 2. From localStorage
  try {
    var saved = localStorage.getItem((typeof window !== 'undefined' && window.REWARDS_PRICING_STORAGE_KEY) || 'adora_rewards_pricing');
    if (saved) {
      var p2 = JSON.parse(saved);
      return {
        rateMorning: p2.rateMorning != null ? p2.rateMorning : DEFAULT_REWARD_PRICING.rateMorning,
        rateEvening: p2.rateEvening != null ? p2.rateEvening : DEFAULT_REWARD_PRICING.rateEvening,
        rateNight: p2.rateNight != null ? p2.rateNight : DEFAULT_REWARD_PRICING.rateNight,
        rateBooking: p2.rateBooking != null ? p2.rateBooking : DEFAULT_REWARD_PRICING.rateBooking,
        rateContract: p2.rateContract != null ? p2.rateContract : DEFAULT_REWARD_PRICING.rateContract,
        rateVipByBranch: _normalizeVipByBranch(p2.rateVipByBranch),
        rateVipDefault: _normalizeVipDefault(p2.rateVipDefault),
        vipDescription: p2.vipDescription != null ? p2.vipDescription : DEFAULT_REWARD_PRICING.vipDescription,
        rateEvalBooking: p2.rateEvalBooking != null ? p2.rateEvalBooking : DEFAULT_REWARD_PRICING.rateEvalBooking,
        rateEvalGoogle: p2.rateEvalGoogle != null ? p2.rateEvalGoogle : DEFAULT_REWARD_PRICING.rateEvalGoogle,
        minEvalCorniche: p2.minEvalCorniche != null ? p2.minEvalCorniche : DEFAULT_REWARD_PRICING.minEvalCorniche,
        minEvalAndalus: p2.minEvalAndalus != null ? p2.minEvalAndalus : DEFAULT_REWARD_PRICING.minEvalAndalus,
        minEvalGoogle: p2.minEvalGoogle != null ? p2.minEvalGoogle : DEFAULT_REWARD_PRICING.minEvalGoogle,
        supportFundPercent: p2.supportFundPercent != null ? p2.supportFundPercent : DEFAULT_REWARD_PRICING.supportFundPercent
      };
    }
  } catch (_) {}
  // 3. Defaults
  return Object.assign({}, DEFAULT_REWARD_PRICING);
}

/**
 * Update table header spans to show current eval rates from config (adora_rewards_pricing / SettingsPanel).
 * Ensures "BOOKING" and "GOOGLE" column headers show the same values as in Settings.
 */
function updateEvalRatesInTableHeader() {
  try {
    var p = getPricingConfig();
    var bEl = document.getElementById('header-eval-booking-rate');
    var gEl = document.getElementById('header-eval-google-rate');
    if (bEl) bEl.textContent = (p.rateEvalBooking != null ? p.rateEvalBooking : DEFAULT_REWARD_PRICING.rateEvalBooking) + ' ر.س';
    if (gEl) gEl.textContent = (p.rateEvalGoogle != null ? p.rateEvalGoogle : DEFAULT_REWARD_PRICING.rateEvalGoogle) + ' ر.س';
  } catch (_) {}
}

/**
 * Compute gross reward from breakdown fields using configurable pricing.
 *
 * NEW FORMULA (split by source first):
 * - Reception (استقبال) regular: by shift — receptionMorning×rateMorning + receptionEvening×rateEvening + receptionNight×rateNight
 * - Booking (بوكينج) regular: flat rate — _bookingRegular × rateBooking (all shifts, one rate)
 * - VIP: unchanged — per room per source (reception/booking) from rateVipByBranch / rateVipDefault
 * - Evaluations: separate Booking + Google rates
 *
 * When _receptionMorning / _bookingRegular are present (transfer from analysis), use the new formula.
 * Otherwise fallback to legacy: regular shift counts (morning - vipMorning etc) × shift rates.
 *
 * @param {object} emp — employee with _receptionMorning, _receptionEvening, _receptionNight, _bookingRegular (optional), _morning, _evening, _night, _vip*, _vipBySource, evaluationsBooking, evaluationsGoogle, branch
 * @param {object} [pricing] — optional pricing config
 * @returns {number} gross amount
 */
function computeGrossFromBreakdown(emp, pricing) {
  if (!pricing) pricing = getPricingConfig();

  var g = 0;
  var useNewFormula = (emp._receptionMorning != null || emp._bookingRegular != null);

  if (useNewFormula) {
    // استقبال عادي فقط — حسب الشفت
    var recM = emp._receptionMorning || 0, recE = emp._receptionEvening || 0, recN = emp._receptionNight || 0;
    g += (recM * (pricing.rateMorning || 0)) + (recE * (pricing.rateEvening || 0)) + (recN * (pricing.rateNight || 0));
    // بوكينج عادي فقط — قيمة ثابتة
    g += (emp._bookingRegular || 0) * (pricing.rateBooking || 0);
  } else {
    // Legacy: regular (non-VIP) per shift × shift rate
    var morning = emp._morning || 0, evening = emp._evening || 0, night = emp._night || 0;
    var vipMorning = emp._vipMorning || 0, vipEvening = emp._vipEvening || 0, vipNight = emp._vipNight || 0;
    var regularMorning = Math.max(0, morning - vipMorning);
    var regularEvening = Math.max(0, evening - vipEvening);
    var regularNight = Math.max(0, night - vipNight);
    g += (regularMorning * (pricing.rateMorning || 0)) + (regularEvening * (pricing.rateEvening || 0)) + (regularNight * (pricing.rateNight || 0));
  }

  // VIP — per room per source (استقبال/بوكينج) — unchanged
  var vipBySource = emp._vipBySource || {};
  var vipDefault = pricing.rateVipDefault || { reception: 0, booking: 0 };
  var branchVipRates = (pricing.rateVipByBranch && emp.branch) ? (pricing.rateVipByBranch[emp.branch] || {}) : {};
  Object.keys(vipBySource).forEach(function(roomNum) {
    var src = vipBySource[roomNum];
    var rates = branchVipRates[String(roomNum)] || vipDefault;
    g += (src.reception || 0) * (rates.reception || 0);
    g += (src.booking || 0) * (rates.booking || 0);
  });

  // Evaluations
  var evBooking = emp.evaluationsBooking || 0, evGoogle = emp.evaluationsGoogle || 0;
  g += evBooking * (pricing.rateEvalBooking || 0) + evGoogle * (pricing.rateEvalGoogle || 0);

  return g;
}

/**
 * Get the old-style "rate" (1/2/3) for display purposes only (الفئة column).
 * Actual calculation now uses computeGrossFromBreakdown.
 */
function getDisplayRate(count) {
  return count > 100 ? 3 : (count > 50 ? 2 : 1);
}

/**
 * Shared function to process transfer payload from Project 1.
 * Called by both localStorage (primary) and postMessage (fallback) paths.
 */
function _processAdoraTransferPayload(payload) {
  if (!payload || !Array.isArray(payload.rows)) {
    if (typeof logVerbose === 'function') logVerbose('⚠️ _processAdoraTransferPayload: invalid payload (no rows array)');
    return;
  }
  window.adoraTransferMode = true;
  window.adoraRawBookings = payload.rawBookings || [];
  window.adoraConfig = payload.config || {};
  window.adoraActiveVipRooms = payload.activeVipRooms || [];

  // Set period dates (وضع reportStartDate على window لاستخدامه في _adoraBackgroundFirebaseSync)
  if (payload.period) {
    reportStartDate = payload.period.from || null;
    if (typeof window !== 'undefined') window.reportStartDate = reportStartDate;
    var periodText = payload.period.from && payload.period.to
      ? payload.period.from + ' → ' + payload.period.to
      : '';
    var periodRangeEl = document.getElementById('periodRange');
    if (periodRangeEl) periodRangeEl.innerText = periodText;
    var headerPeriodRangeEl = document.getElementById('headerPeriodRange');
    if (headerPeriodRangeEl) headerPeriodRangeEl.innerText = periodText;
    if (periodText) localStorage.setItem('adora_rewards_periodText', periodText);
  }

  // ======================================================================
  // PHASE 1: INSTANT RENDER — show transfer data immediately (no Firebase wait)
  // ======================================================================
  var localOldDb = [];
  try {
    var savedDb = localStorage.getItem('adora_rewards_db');
    if (savedDb) {
      localOldDb = JSON.parse(savedDb);
      if (!Array.isArray(localOldDb)) localOldDb = [];
    }
  } catch (_) {}

  var localOldMap = new Map();
  localOldDb.forEach(function(emp) {
    localOldMap.set(emp.name + '|' + emp.branch, emp);
  });

  // Also load local discounts immediately
  try {
    var savedDiscounts = localStorage.getItem('adora_rewards_discounts');
    if (savedDiscounts) {
      discounts = JSON.parse(savedDiscounts);
      if (!Array.isArray(discounts)) discounts = [];
      if (typeof window !== 'undefined') window.discounts = discounts;
    }
  } catch (_) {}
  if (typeof loadDiscountTypes === 'function') loadDiscountTypes();

  // Build db from transfer data, merging with localStorage cache
  db = [];
  branches = new Set();
  payload.rows.forEach(function(row) {
    var key = row.name + '|' + row.branch;
    var oldEmp = localOldMap.get(key);
    var employeeCode = getOrCreateEmployeeCode(row.name);
    var breakdownFields = {
      _staffCount: row.staffCount, _counted: row.counted, _excess: row.excess,
      _reception: row['استقبال'] || 0, _booking: row['بوكينج'] || 0,
      _morning: row['صباح'] || 0, _evening: row['مساء'] || 0, _night: row['ليل'] || 0,
      _receptionMorning: row._receptionMorning, _receptionEvening: row._receptionEvening, _receptionNight: row._receptionNight,
      _bookingRegular: row._bookingRegular,
      _vipRooms: row.vipRooms || {}, _vipTotal: row.vipTotal || 0,
      _vipBySource: row.vipBySource || {}, _vipMorning: row.vipMorning || 0,
      _vipEvening: row.vipEvening || 0, _vipNight: row.vipNight || 0,
      _alertCount: row.alertCount || 0, _alertTotal: row.alertTotal || 0,
      _mergedCount: row.mergedCount || 0
    };

    if (oldEmp) {
      var mergedEmp = {};
      Object.keys(oldEmp).forEach(function(k) { mergedEmp[k] = oldEmp[k]; });
      mergedEmp.count = row.staffCount;
      mergedEmp.employeeCode = employeeCode;
      Object.keys(breakdownFields).forEach(function(k) { mergedEmp[k] = breakdownFields[k]; });
      db.push(mergedEmp);
    } else {
      db.push({
        id: crypto.randomUUID(), name: row.name, branch: row.branch,
        count: row.staffCount, employeeCode: employeeCode,
        evaluations: 0, evaluationsBooking: 0, evaluationsGoogle: 0,
        totalAttendanceDays: 0, attendance26Days: false, attendanceDaysPerBranch: {},
        _staffCount: breakdownFields._staffCount, _counted: breakdownFields._counted,
        _excess: breakdownFields._excess, _reception: breakdownFields._reception,
        _booking: breakdownFields._booking, _morning: breakdownFields._morning,
        _evening: breakdownFields._evening, _night: breakdownFields._night,
        _receptionMorning: breakdownFields._receptionMorning, _receptionEvening: breakdownFields._receptionEvening,
        _receptionNight: breakdownFields._receptionNight, _bookingRegular: breakdownFields._bookingRegular,
        _vipRooms: breakdownFields._vipRooms, _vipTotal: breakdownFields._vipTotal,
        _vipBySource: breakdownFields._vipBySource, _vipMorning: breakdownFields._vipMorning,
        _vipEvening: breakdownFields._vipEvening, _vipNight: breakdownFields._vipNight,
        _alertCount: breakdownFields._alertCount, _alertTotal: breakdownFields._alertTotal,
        _mergedCount: breakdownFields._mergedCount
      });
    }
    branches.add(row.branch);
  });

  if (typeof window !== 'undefined') window.db = db;
  if (typeof normalizeDuplicateAttendance === 'function') normalizeDuplicateAttendance(db);

  // Save to localStorage immediately
  try {
    localStorage.setItem('adora_rewards_db', JSON.stringify(db));
    localStorage.setItem('adora_rewards_branches', JSON.stringify([...branches]));
    if (reportStartDate) localStorage.setItem('adora_rewards_startDate', reportStartDate);
    // Cache VIP rooms and config for refresh fast-path
    if (window.adoraActiveVipRooms) localStorage.setItem('adora_rewards_activeVipRooms', JSON.stringify(window.adoraActiveVipRooms));
    if (window.adoraConfig) localStorage.setItem('adora_rewards_config', JSON.stringify(window.adoraConfig));
    // Cache reward pricing separately for fast access
    if (window.adoraConfig && window.adoraConfig.rewardPricing) {
      localStorage.setItem((typeof window !== 'undefined' && window.REWARDS_PRICING_STORAGE_KEY) || 'adora_rewards_pricing', JSON.stringify(window.adoraConfig.rewardPricing));
    }
    // Cache raw bookings for breakdown drilldown on refresh
    if (window.adoraRawBookings && window.adoraRawBookings.length > 0) {
      try { localStorage.setItem('adora_rewards_rawBookings', JSON.stringify(window.adoraRawBookings)); } catch (_) {}
    }
  } catch (_) {}

  function finalizeTransferRender() {
    // Toggle columns, hide upload, تحديث تبويبات الفروع، ثم render
    toggleBreakdownColumns(true);
    var uploadBox = document.getElementById('uploadBox');
    if (uploadBox) uploadBox.style.display = 'none';
    var returnBtn = document.getElementById('btnReturnToUpload');
    if (returnBtn) returnBtn.style.display = 'none';

    if (typeof updateFilters === 'function') updateFilters();
    renderUI('الكل');

    logVerbose('✅ ADORA_TRANSFER initial render done:', db.length, 'employees');
    if (typeof hideTransferLoadingOverlay === 'function') hideTransferLoadingOverlay();

    // ======================================================================
    // PHASE 2: BACKGROUND FIREBASE SYNC — جلب أدخالات المشرف/HR من Firebase ودمجها وإعادة الرسم
    // (لا نعتمد على انتظار Firebase قبل الرسم؛ نرسم فوراً ثم المزامنة في الخلفية حتى تظهر التقييمات والحضور وبطل التحدي عند الجاهزية)
    // ======================================================================
    _adoraBackgroundFirebaseSync(payload, { uploadAfterMerge: true });
  }

  // عرض الجدول فوراً ثم المزامنة مع Firebase في الخلفية (نفس المسار مع أو بدون cache)
  finalizeTransferRender();
}

// postMessage fallback handler (backward compat when not using same-origin proxy)
window.addEventListener('message', function(evt) {
  if (!evt.data || evt.data.type !== 'ADORA_TRANSFER') return;
  logVerbose('📦 Received ADORA_TRANSFER via postMessage');
  _processAdoraTransferPayload(evt.data);
  // Send ACK so Project 1 knows transfer succeeded (legacy handshake)
  if (evt.source) {
    try { evt.source.postMessage({ type: 'ADORA_TRANSFER_ACK' }, evt.origin || '*'); } catch (_) {}
  }
});

// Respond to PING from Project 1 with READY immediately (lightweight handshake)
window.addEventListener('message', function(evt) {
  if (!evt.data || evt.data.type !== 'ADORA_PING') return;
  if (window.adoraTransferMode) return; // Already received data, ignore pings
  // Reply with READY so Project 1 knows to send the heavy payload
  if (evt.source) {
    try { evt.source.postMessage({ type: 'ADORA_READY' }, evt.origin || '*'); } catch (_) {}
  }
});

// Send READY signal to opener (Project 1) so it knows we can receive data
// This is sent on every load — if opened via transfer, Project 1 will respond with data
(function sendReadySignal() {
  function notifyReady() {
    // Check if we were opened for transfer (URL has ?transfer=1)
    var isTransferMode = window.location.search.indexOf('transfer=1') >= 0;
    if (isTransferMode && window.opener) {
      try {
        window.opener.postMessage({ type: 'ADORA_READY' }, '*');
        logVerbose('📡 Sent ADORA_READY signal to opener');
      } catch (_) {}
      // Retry a few times in case opener isn't listening yet
      var retries = 0;
      var readyInterval = setInterval(function() {
        retries++;
        if (window.adoraTransferMode || retries > 30) {
          clearInterval(readyInterval);
          return;
        }
        try {
          if (window.opener) window.opener.postMessage({ type: 'ADORA_READY' }, '*');
        } catch (_) {}
      }, 300);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', notifyReady);
  } else {
    notifyReady();
  }
})();

// Toggle breakdown columns visibility and inject VIP headers
function toggleBreakdownColumns(showBreakdown) {
  var table = document.getElementById('targetTable');
  if (!table) return;

  table.classList.toggle('adora-breakdown-mode', showBreakdown);
  var scrollWrap = table.closest('.table-scroll-container');
  if (scrollWrap) scrollWrap.classList.toggle('adora-breakdown-mode', showBreakdown);

  // Hide/show single bookings column — header AND footer so columns align
  var singleCells = table.querySelectorAll('th.col-count-single, td.col-count-single');
  singleCells.forEach(function(el) { el.style.display = showBreakdown ? 'none' : ''; });

  // Show/hide breakdown columns — header AND footer
  var breakdownCells = table.querySelectorAll('th.col-breakdown, td.col-breakdown');
  breakdownCells.forEach(function(el) { el.style.display = showBreakdown ? '' : 'none'; });

  // صف التجميع (الحجوزات / الشفتات / VIP / تنبيهات) مثل صفحة التحليل
  var groupRow = document.getElementById('breakdownGroupRow');
  if (groupRow) {
    if (showBreakdown) {
      var vipCount = window.adoraActiveVipRooms ? window.adoraActiveVipRooms.length : 0;
      var span3Book = '<th colspan="3" class="th-section-start text-center" style="background:rgba(6,182,212,0.08);border-left:2px solid rgba(6,182,212,0.3);"><span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-cyan-300" style="background:rgba(6,182,212,0.12);border:1px solid rgba(6,182,212,0.25);">الحجوزات</span></th>';
      var span3 = '<th colspan="3" class="th-section-start text-center" style="background:rgba(245,158,11,0.06);border-left:2px solid rgba(245,158,11,0.25);"><span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-amber-300" style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.2);">الشفتات</span></th>';
      var spanVip = vipCount > 0 ? '<th colspan="' + vipCount + '" class="th-section-start text-center" style="background:rgba(139,92,246,0.06);border-left:2px solid rgba(139,92,246,0.25);"><span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-violet-300" style="background:rgba(139,92,246,0.1);border:1px solid rgba(139,92,246,0.2);">VIP</span></th>' : '';
      var span2 = '<th colspan="2" class="th-section-start text-center" style="background:rgba(239,68,68,0.06);border-left:2px solid rgba(239,68,68,0.25);"><span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-red-300" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.2);">تنبيهات</span></th>';
      // عدد الأعمدة = 3+3+3+N+2+1+1+2+1 = 16+N
      // بيانات الموظف(3) | حجوزات(3) | شفتات(3) | VIP(N) | تنبيهات(2) | حضور(1) | فئة-مخفي(1) | تقييمات(2) | مكافأة(1)
      var spanEmployee = '<th colspan="3" class="th-section-start text-center" style="background:rgba(255,255,255,0.04);border-left:2px solid rgba(255,255,255,0.15);"><span class="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-slate-300" style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.1);">بيانات الموظف</span></th>';
      var spanAttendance = '<th class="th-section-start text-center" style="background:rgba(16,185,129,0.06);border-left:2px solid rgba(16,185,129,0.25);"><span class="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-emerald-300" style="background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.2);">الحضور</span></th>';
      var spanRateHidden = '<th class="col-rate p-2" style="background:rgba(0,0,0,0.12);"></th>';
      var spanEvals = '<th colspan="2" class="th-section-start text-center" style="background:rgba(251,191,36,0.06);border-left:2px solid rgba(251,191,36,0.25);"><span class="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-yellow-300" style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);">التقييمات</span></th>';
      var spanReward = '<th class="th-section-start text-center" style="background:rgba(20,184,166,0.06);border-left:2px solid rgba(20,184,166,0.25);"><span class="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-bold tracking-wide text-teal-300" style="background:rgba(20,184,166,0.1);border:1px solid rgba(20,184,166,0.2);">المكافأة</span></th>';
      groupRow.innerHTML =
        spanEmployee +
        span3Book + span3 + spanVip + span2 +
        spanAttendance + spanRateHidden + spanEvals + spanReward;
      groupRow.style.display = '';
    } else {
      groupRow.innerHTML = '';
      groupRow.style.display = 'none';
    }
  }

  // Inject VIP room column headers and sync footer VIP cell
  var footVip = document.getElementById('footVipRooms');
  if (showBreakdown) {
    var vipCount = window.adoraActiveVipRooms ? window.adoraActiveVipRooms.length : 0;
    var placeholder = document.getElementById('vipColumnsPlaceholder');
    if (placeholder && vipCount > 0) {
      var vipHtml = '';
      window.adoraActiveVipRooms.forEach(function(num, vipIdx) {
        var isLastVip = vipIdx === window.adoraActiveVipRooms.length - 1;
        vipHtml += '<th class="col-breakdown col-breakdown-vip ' + (isLastVip ? 'th-section-start ' : '') + 'text-center text-amber-300 text-sm font-semibold cursor-pointer hover:bg-white/10 transition-colors select-none" style="' + (isLastVip ? 'border-left:2px solid rgba(139,92,246,0.25);' : '') + '" data-sort-key="vip_' + num + '" title="فرز حسب ' + num + '">' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:middle;margin-left:2px;margin-top:-2px;"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5.75 17h12.5a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H5.75a1 1 0 0 1-1-1v-1a1 1 0 0 1 1-1z"/></svg>' +
          num + '</th>';
      });
      placeholder.outerHTML = vipHtml;
    } else if (placeholder) {
      placeholder.style.display = 'none';
    }
    if (footVip) {
      if (vipCount > 0) {
        footVip.setAttribute('colspan', String(vipCount));
        footVip.style.display = '';
      } else {
        footVip.style.display = 'none';
        footVip.removeAttribute('colspan');
      }
    }
  } else {
    if (footVip) {
      footVip.style.display = 'none';
      footVip.setAttribute('colspan', '1');
    }
  }

  // تحديث colspan لصف التقييمات السلبية دائماً ليطابق عدد الأعمدة
  var negRow = document.getElementById('negativeRatingsHeaderRow');
  if (negRow) {
    var firstTd = negRow.querySelector('td');
    if (firstTd) {
      var mainRow = document.querySelector('#targetTable thead tr.main-header-row');
      var colCount = mainRow ? mainRow.querySelectorAll('th').length : 100;
      firstTd.setAttribute('colspan', String(colCount));
    }
  }

  if (typeof updateFooterSummaryColspans === 'function') {
    setTimeout(updateFooterSummaryColspans, 80);
  }
}

// === Breakdown Drilldown Modal ===
// Opens a drilldown modal showing detailed bookings for a specific employee + filter
function openBreakdownDrilldown(empName, empBranch, filterType, filterValue) {
  if (!window.adoraRawBookings || window.adoraRawBookings.length === 0) return;

  var raw = window.adoraRawBookings;
  var filtered = [];
  var title = '';

  // If empBranch is empty, it's an aggregated (duplicate) row — show all branches
  var empData = empBranch
    ? raw.filter(function(d) { return d.employeeName === empName && d.branch === empBranch; })
    : raw.filter(function(d) { return d.employeeName === empName; });

  switch (filterType) {
    case 'استقبال':
      filtered = empData.filter(function(d) { return d.bookingSource === 'استقبال'; });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — استقبال';
      break;
    case 'بوكينج':
      filtered = empData.filter(function(d) { return d.bookingSource === 'بوكينج'; });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — بوكينج';
      break;
    case 'صباح':
      filtered = empData.filter(function(d) { return d.shift === 'صباح'; });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — صباح';
      break;
    case 'مساء':
      filtered = empData.filter(function(d) { return d.shift === 'مساء'; });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — مساء';
      break;
    case 'ليل':
      filtered = empData.filter(function(d) { return d.shift === 'ليل'; });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — ليل';
      break;
    case 'vip':
      filtered = empData.filter(function(d) {
        if (d.roomCategory !== 'VIP') return false;
        if (!filterValue) return true;
        var rn = d.roomUnit ? d.roomUnit.match(/\d{3}/) : null;
        return rn && rn[0] === filterValue;
      });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — VIP' + (filterValue ? ' ' + filterValue : '');
      break;
    case 'alert':
      filtered = empData.filter(function(d) { return d.priceShortfall > 0; });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — تنبيهات سعرية';
      break;
    case 'alertTotal':
      filtered = empData.filter(function(d) { return d.priceShortfall > 0; });
      title = empName + (empBranch ? ' — ' + empBranch : '') + ' — تفاصيل النقص';
      break;
    default:
      return;
  }

  if (filtered.length === 0) return;

  var totalRent = filtered.reduce(function(s, b) { return s + (b.priceSAR || 0); }, 0);
  var totalShortfall = filtered.reduce(function(s, b) { return s + (b.priceShortfall || 0); }, 0);
  var totalNights = filtered.reduce(function(s, b) { return s + (b.nights || 0); }, 0);
  var hasAlerts = filtered.some(function(b) { return b.priceShortfall > 0; });
  var hasTransfers = filtered.some(function(b) { return b.isRoomTransfer; });

  // Build cards HTML
  var cardsHtml = filtered.map(function(b, i) {
    var borderClass = b.priceShortfall > 0
      ? 'border-red-500/30 bg-red-950/20'
      : b.isRoomTransfer
      ? 'border-blue-500/30 bg-blue-950/20'
      : 'border-white/10 bg-white/5 hover:bg-white/10';

    var badges = '';
    if (b.branch) {
      badges += '<span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#14b8a6]/15 text-[#5eead4] border border-[#14b8a6]/20" title="الفرع">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="shrink-0"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>' +
        (b.branch) + '</span>';
    }
    if (b.bookingSource === 'استقبال') badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-500/15 text-green-400 border border-green-500/20">استقبال</span>';
    else if (b.bookingSource === 'بوكينج') badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/15 text-orange-400 border border-orange-500/20">بوكينج</span>';
    if (b.shift === 'صباح') badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/20">صباح</span>';
    else if (b.shift === 'مساء') badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">مساء</span>';
    else badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-500/15 text-gray-400 border border-gray-500/20">ليل</span>';
    if (b.roomCategory === 'VIP') badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/20">VIP</span>';
    if (b.isMerged) badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-cyan-500/15 text-cyan-400 border border-cyan-500/20">دمج</span>';
    if (b.isMonthly) badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/15 text-purple-400 border border-purple-500/20">شهري</span>';
    if (b.isRoomTransfer) badges += '<span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/20">↔ نقل غرفة</span>';

    var shortfallHtml = '';
    if (b.priceShortfall > 0) {
      var expected = (b.minPrice || 0) * (b.nights || 0);
      shortfallHtml = '<div class="mt-2 mr-5 px-2.5 py-1.5 rounded-lg bg-red-500/10 border border-red-500/15 flex items-center gap-2 text-xs">' +
        '<span class="text-red-300">النقص: <span class="font-mono font-bold text-red-400">' + Math.round(b.priceShortfall).toLocaleString('en-SA') + '</span> ريال ' +
        '<span class="text-red-400/60 mr-2">(' + (b.minPrice || 0) + ' × ' + (b.nights || 0) + ' = ' + expected.toLocaleString('en-SA') + ' − ' + (b.priceSAR || 0).toLocaleString('en-SA') + ' = ' + Math.round(b.priceShortfall).toLocaleString('en-SA') + ')</span></span></div>';
    }
    if (b.isRoomTransfer) {
      shortfallHtml += '<div class="mt-2 mr-5 px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/15 text-xs text-blue-300">↔ تم نقل النزيل بين غرفتين — التنبيه السعري مستبعد</div>';
    }

    // Format registration time
    var regTime = b.creationTime || '—';
    if (regTime && regTime !== '—') {
      try {
        var d = new Date(regTime);
        if (!isNaN(d.getTime())) {
          var days = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
          var h = d.getHours(), m = d.getMinutes();
          var period = h >= 7 && h < 15 ? 'صباح' : h >= 15 && h < 23 ? 'مساء' : 'ليل';
          regTime = days[d.getDay()] + ' ' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ' ' + period;
        }
      } catch(_) {}
    }

    return '<div class="rounded-xl border p-3 transition-colors ' + borderClass + '">' +
      '<div class="flex items-center gap-2 mb-2 flex-wrap">' +
        '<span class="text-gray-500 text-xs w-5 shrink-0">' + (i + 1) + '</span>' +
        '<span class="text-white font-mono font-bold text-sm">' + (b.bookingNumber || '—') + '</span>' +
        badges +
      '</div>' +
      '<div class="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs mr-5">' +
        '<div><span class="text-gray-500 block">العميل</span><span class="text-gray-300 truncate block">' + (b.guestName || '—') + '</span></div>' +
        '<div><span class="text-gray-500 block">الغرفة</span><span class="text-gray-300">' + (b.roomUnit || '—') + '</span></div>' +
        '<div><span class="text-gray-500 block">التصنيف</span><span class="text-gray-300">' + (b.roomTypeLabel || '—') + '</span></div>' +
        '<div><span class="text-gray-500 block">الفترة</span><span class="text-gray-300 font-mono">' + (b.checkInTime || '—') + (b.checkoutDateStr ? ' → ' + b.checkoutDateStr : '') + '</span></div>' +
        '<div><span class="text-gray-500 block">وقت التسجيل</span><span class="text-cyan-300 font-mono font-bold">' + regTime + '</span></div>' +
        '<div><span class="text-gray-500 block">الليالي</span><span class="text-white font-mono font-bold">' + (b.nights || 0) + '</span></div>' +
        '<div><span class="text-gray-500 block">الإيجار الكلي</span><span class="text-emerald-400 font-mono font-bold">' + (b.priceSAR > 0 ? b.priceSAR.toLocaleString('en-SA') : '—') + '</span></div>' +
        '<div><span class="text-gray-500 block">سعر الليلة</span><span class="text-white font-mono">' + (b.nightlyRate > 0 ? b.nightlyRate.toLocaleString('en-SA') : '—') + '</span></div>' +
        '<div><span class="text-gray-500 block">الحد الأدنى/ل</span><span class="text-gray-400 font-mono">' + (b.minPrice > 0 ? b.minPrice.toLocaleString('en-SA') : '—') + '</span></div>' +
      '</div>' +
      shortfallHtml +
    '</div>';
  }).join('');

  // Build modal HTML
  var modalHtml = '<div id="breakdownDrilldownOverlay" onclick="closeBreakdownDrilldown(event)" class="fixed inset-0 z-[9999] flex items-center justify-center" style="background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);">' +
    '<div onclick="event.stopPropagation()" class="rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col" style="background:rgba(15,23,42,0.95);max-width:750px;width:95%;max-height:80vh;">' +
      // Header
      '<div class="px-5 py-3 border-b border-white/10 flex items-center justify-between shrink-0" style="background:rgba(30,41,59,0.5);">' +
        '<h3 class="text-sm font-semibold text-white">' + title + '</h3>' +
        '<div class="flex items-center gap-2">' +
          '<button onclick="printBreakdownDrilldown()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-white/5 text-gray-300 hover:bg-white/10 border border-white/10 transition-colors">' +
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>' +
            'طباعة</button>' +
          '<button onclick="closeBreakdownDrilldown()" class="text-gray-500 hover:text-white transition-colors" style="font-size:18px;">✕</button>' +
        '</div>' +
      '</div>' +
      // Summary bar
      '<div class="px-5 py-2.5 border-b border-white/5 shrink-0 flex flex-wrap gap-4 text-xs">' +
        '<span class="text-gray-400"><span class="text-white font-bold">' + filtered.length + '</span> حجز</span>' +
        '<span class="text-gray-400"><span class="text-white font-bold">' + totalNights + '</span> ليلة</span>' +
        '<span class="text-gray-400">إجمالي الإيجار: <span class="text-emerald-400 font-bold font-mono">' + Math.round(totalRent).toLocaleString('en-SA') + '</span> ريال</span>' +
        (hasAlerts ? '<span class="text-red-400">نقص: <span class="font-bold font-mono">' + Math.round(totalShortfall).toLocaleString('en-SA') + '</span> ريال</span>' : '') +
        (hasTransfers ? '<span class="text-blue-400">↔ نقل غرفة</span>' : '') +
      '</div>' +
      // Body
      '<div class="overflow-y-auto flex-1 p-3 space-y-2">' + cardsHtml + '</div>' +
    '</div>' +
  '</div>';

  // Store filtered data for print
  window._drilldownTitle = title;
  window._drilldownFiltered = filtered;
  window._drilldownTotalRent = totalRent;
  window._drilldownTotalShortfall = totalShortfall;
  window._drilldownTotalNights = totalNights;

  // Remove existing overlay if any
  var existing = document.getElementById('breakdownDrilldownOverlay');
  if (existing) existing.remove();

  // Insert modal
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function closeBreakdownDrilldown(evt) {
  if (evt && evt.target && evt.target.id !== 'breakdownDrilldownOverlay' && typeof evt.stopPropagation === 'function') return;
  var overlay = document.getElementById('breakdownDrilldownOverlay');
  if (overlay) overlay.remove();
}

function printBreakdownDrilldown() {
  var bkgs = window._drilldownFiltered || [];
  var title = window._drilldownTitle || '';
  var totalRent = window._drilldownTotalRent || 0;
  var totalShortfall = window._drilldownTotalShortfall || 0;
  var totalNights = window._drilldownTotalNights || 0;
  var tRent = Math.round(totalRent).toLocaleString('en-SA');
  var tShort = Math.round(totalShortfall).toLocaleString('en-SA');
  var alertRows = bkgs.filter(function(b) { return b.priceShortfall > 0; });
  var transferRows = bkgs.filter(function(b) { return b.isRoomTransfer; });
  var w = window.open('', '_blank');
  if (!w) return;
  w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير — ' + title + '</title>' +
    '<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Segoe UI",Tahoma,sans-serif;font-size:11px;color:#1e293b;padding:20px 30px;background:#fff}h1{font-size:16px;text-align:center;margin-bottom:4px}' +
    '.sub{text-align:center;color:#64748b;font-size:10px;margin-bottom:12px}.summary{display:flex;gap:20px;justify-content:center;margin-bottom:14px;font-size:11px;flex-wrap:wrap}' +
    '.summary span{background:#f1f5f9;padding:3px 10px;border-radius:4px}.summary .alert{background:#fef2f2;color:#dc2626}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#f8fafc;border:1px solid #e2e8f0;padding:4px 6px;text-align:right;font-size:10px;white-space:nowrap}' +
    'td{border:1px solid #e2e8f0;padding:3px 6px;font-size:10px;white-space:nowrap}.mono{font-family:Consolas,monospace}.num{text-align:left;direction:ltr}.red{color:#dc2626;font-weight:700}.green{color:#16a34a}' +
    '.badge{display:inline-block;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700;margin-inline-start:3px}' +
    '.b-recv{background:#dcfce7;color:#166534}.b-book{background:#ffedd5;color:#9a3412}.b-vip{background:#f3e8ff;color:#7c3aed}.b-merge{background:#cffafe;color:#0e7490}.b-transfer{background:#dbeafe;color:#1d4ed8}' +
    '.row-alert{background:#fef2f2}.row-transfer{background:#eff6ff}' +
    '.footer{text-align:center;color:#94a3b8;font-size:9px;margin-top:20px;border-top:1px solid #e2e8f0;padding-top:8px}' +
    '@media print{body{padding:4px 8px;font-size:8px}@page{size:A4 landscape;margin:5mm}th{font-size:8px;padding:2px 3px}td{font-size:8px;padding:2px 3px}h1{font-size:13px}}</style></head><body>' +
    '<h1>تقرير فروقات الأسعار</h1><div class="sub">' + title + ' | ' + new Date().toLocaleDateString('ar-SA') + '</div>' +
    '<div class="summary"><span><b>' + bkgs.length + '</b> حجز</span><span><b>' + totalNights + '</b> ليلة</span>' +
    '<span>إيجار: <b class="mono">' + tRent + '</b> ر.س</span>' +
    (alertRows.length > 0 ? '<span class="alert"><b>' + alertRows.length + '</b> تنبيه | نقص: <b class="mono">' + tShort + '</b> ر.س</span>' : '<span class="green">✓ لا يوجد نقص</span>') +
    (transferRows.length > 0 ? '<span style="background:#eff6ff;color:#2563eb">↔ ' + transferRows.length + ' نقل غرفة</span>' : '') +
    '</div><table><thead><tr><th>#</th><th>رقم الحجز</th><th>العميل</th><th>الغرفة</th><th>التصنيف</th><th>المصدر</th><th>الوردية</th><th>الدخول</th><th>الخروج</th><th>ليالي</th><th>الإيجار</th><th>سعر/ل</th><th>حد أدنى/ل</th><th>المتوقع</th><th>النقص</th></tr></thead><tbody>');
  bkgs.forEach(function(b, i) {
    var expected = (b.minPrice || 0) * (b.nights || 0);
    var badges = [];
    if (b.bookingSource === 'استقبال') badges.push('<span class="badge b-recv">استقبال</span>');
    else if (b.bookingSource === 'بوكينج') badges.push('<span class="badge b-book">بوكينج</span>');
    if (b.roomCategory === 'VIP') badges.push('<span class="badge b-vip">VIP</span>');
    if (b.isMerged) badges.push('<span class="badge b-merge">دمج</span>');
    if (b.isRoomTransfer) badges.push('<span class="badge b-transfer">نقل</span>');
    var cls = b.priceShortfall > 0 ? 'row-alert' : b.isRoomTransfer ? 'row-transfer' : '';
    var shortfallCell = b.isRoomTransfer ? '<td style="color:#2563eb">مستبعد</td>' : b.priceShortfall > 0 ? '<td class="num mono red">▼ ' + Math.round(b.priceShortfall).toLocaleString('en-SA') + '</td>' : '<td class="green">✓</td>';
    w.document.write('<tr class="' + cls + '"><td>' + (i+1) + '</td><td class="mono">' + (b.bookingNumber||'—') + '</td><td>' + (b.guestName||'—') + '</td><td>' + (b.roomUnit||'—') + '</td><td>' + (b.roomTypeLabel||'—') + ' ' + badges.join('') + '</td><td>' + (b.bookingSource||'') + '</td><td>' + (b.shift||'') + '</td><td class="mono">' + (b.checkInTime||'—') + '</td><td class="mono">' + (b.checkoutDateStr||'—') + '</td><td class="num mono">' + (b.nights||0) + '</td><td class="num mono">' + (b.priceSAR > 0 ? b.priceSAR.toLocaleString('en-SA') : '—') + '</td><td class="num mono">' + (b.nightlyRate > 0 ? b.nightlyRate.toLocaleString('en-SA') : '—') + '</td><td class="num mono">' + (b.minPrice > 0 ? b.minPrice.toLocaleString('en-SA') : '—') + '</td><td class="num mono">' + (expected > 0 ? expected.toLocaleString('en-SA') : '—') + '</td>' + shortfallCell + '</tr>');
  });
  w.document.write('</tbody><tfoot><tr style="font-weight:700;background:#f8fafc"><td colspan="9">الإجمالي</td><td class="num mono">' + totalNights + '</td><td class="num mono">' + tRent + '</td><td colspan="2"></td><td class="num mono red">' + (totalShortfall > 0 ? tShort : '✓') + '</td><td></td></tr></tfoot></table>' +
    '<div class="footer">نظام Adora لتحليل الحجوزات | ' + new Date().toLocaleString('ar-SA') + '</div></body></html>');
  w.document.close();
  setTimeout(function() { if (typeof scaleToFitA4 === 'function') scaleToFitA4(w.document); w.print(); }, 300);
}

// تحميل الخصومات وأنواعها داخل loadDataFromStorage() فقط — مصدر واحد بعد جلب الفترة الحية من Firebase

// === Employee Code Functions ===
function generateEmployeeCode() {
  // Generate 4-digit code (1000-9999)
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function getOrCreateEmployeeCode(employeeName) {
  // Check if employee already has a code
  if (employeeCodesMap[employeeName]) {
    return employeeCodesMap[employeeName];
  }
  // Generate new code and ensure uniqueness
  let newCode;
  const existingCodes = Object.values(employeeCodesMap);
  do {
    newCode = generateEmployeeCode();
  } while (existingCodes.includes(newCode));
  
  employeeCodesMap[employeeName] = newCode;
  saveEmployeeCodesMap();
  return newCode;
}

function saveEmployeeCodesMap() {
  try {
    localStorage.setItem('adora_rewards_employeeCodes', JSON.stringify(employeeCodesMap));
  } catch (error) {
    console.error('❌ Error saving employee codes:', error);
  }
}

function loadEmployeeCodesMap() {
  try {
    const saved = localStorage.getItem('adora_rewards_employeeCodes');
    if (saved) {
      employeeCodesMap = JSON.parse(saved);
    }
  } catch (error) {
    console.error('❌ Error loading employee codes:', error);
  }
}

// === Security: Admin Secret Key ===
// يُحقَن من .env عبر inject-firebase-config.js (window.__ADMIN_SECRET_KEY__). fallback للتطوير.
const ADMIN_SECRET_KEY = (typeof window !== 'undefined' && window.__ADMIN_SECRET_KEY__) ? window.__ADMIN_SECRET_KEY__ : 'ayman5255';
// ADMIN_AUTH_SESSION_KEY و ADMIN_SESSION_MAX_AGE_MS معرّفان في rewards-rbac.js — لا تُعرّفهما هنا لتجنّب "already been declared"
if (typeof window !== 'undefined') {
  window.getAdminSecretKey = function () { return ADMIN_SECRET_KEY; };
}

// isEmployeeMode و isAdminMode معرّفتان في rewards-rbac.js

/** بعد applyLivePeriod: مزامنة المتغيرات المحلية (db, branches, reportStartDate) من الـ payload لتجنّب خلط عند فتح رابط الإداريين — حتى لا يُرسم الجدول قبل جاهزية البيانات. */
function applyLiveToAppState(live) {
  if (!live || !Array.isArray(live.db)) return;
  db = live.db;
  var br = live.branches;
  branches = new Set(Array.isArray(br) ? br : (br && typeof br.forEach === 'function' ? [...br] : []));
  if (branches.size === 0 && db.length > 0) {
    db.forEach(function (e) { if (e.branch) branches.add(e.branch); });
  }
  if (typeof normalizeDuplicateAttendance === 'function') normalizeDuplicateAttendance(db);
  if (live.reportStartDate != null) reportStartDate = String(live.reportStartDate);
  if (typeof window !== 'undefined') {
    window.db = db;
  }
}

// Load data from localStorage on page load
function loadDataFromStorage() {
try {
// Security: If employee mode, don't load admin data
if (isEmployeeMode()) {
  // Employee mode - data will be loaded by checkMobileEmployeeCode
  return;
}

// Security: Allow admin، أو من فتح برابط إداري (role+token+period) وقد تم التحقق منه في أعلى الملف
const isRbacFromUrl = role && token && period && localStorage.getItem('adora_current_role') === role;
if (!isAdminMode() && !isRbacFromUrl && !isEmployeeMode()) {
  // رابط الأدمن (?admin=...) بدون جلسة: توجيه لصفحة تسجيل الدخول (إيميل+باسورد) في التطبيق الرئيسي — روابط الإداريين (role+token+period) تبقى تفتح مباشر
  // التوجيه فقط عندما المسار فيه /rewards (تطبيق المكافآت فرعي) لتفادي loop إن كان الموقع يُخدم من جذر واحد
  if (admin === ADMIN_SECRET_KEY && typeof window !== 'undefined' && window.location && window.location.pathname && window.location.pathname.indexOf('/rewards') !== -1) {
    var _loginUrl = window.location.origin + '/?admin=' + encodeURIComponent(admin) + '&analysis=1&t=' + Date.now();
    window.location.replace(_loginUrl);
    return;
  }
  // Not admin, not employee, not valid RBAC link — block access (لا استثناء لـ localhost)
  var existingBanner = document.getElementById('roleWelcomeBanner');
  if (existingBanner && existingBanner.parentNode) existingBanner.parentNode.removeChild(existingBanner);
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%); color: white; font-family: 'IBM Plex Sans Arabic', sans-serif; text-align: center; padding: 2rem;">
      <div style="background: rgba(255, 255, 255, 0.1); padding: 3rem; border-radius: 20px; border: 2px solid rgba(239, 68, 68, 0.5); max-width: 560px;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
        <h1 style="font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; color: #ef4444;">غير مصرح بالدخول</h1>
        <p style="color: #fbbf24; font-weight: 700; margin-bottom: 0.75rem; font-size: 0.95rem;">سبب عدم فتح الرابط:</p>
        <p style="color: #94a3b8; margin-bottom: 1rem; font-size: 0.9rem;">لم تُستخدم صلاحية صحيحة: يجب تسجيل الدخول من بوابة الإدارة أولاً ثم فتح الرابط المصرح.</p>
        <p style="color: #fbbf24; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9rem;">🔗 لو بتفتح رابط إداري ولم يفتح:</p>
        <p style="color: #94a3b8; margin-bottom: 1rem; font-size: 0.9rem;">تأكد أن الرابط كامل (يحتوي role و token و period) ولم يُقصّ عند النسخ. جرّب من نافذة خاصة أو بعد مسح الكاش. إن كان الرابط كاملاً وظلّت الرسالة، ستظهر لك شاشة «رابط الإداري لا يفتح» مع السبب بعد ثوانٍ.</p>
        <p style="color: #6ee7b7; font-weight: 600; margin-bottom: 0.5rem; font-size: 0.9rem;">✅ الإداريون: روابطهم تعمل أثناء الفترة — الأدمن يفتح «إدارة الإداريين» وينسخ الرابط ويرسله؛ لا تحتاج إغلاق الفترة.</p>
        <p style="color: #6ee7b7; font-weight: 600; margin-bottom: 1rem; font-size: 0.9rem;">✅ الموظفون: روابطهم تعمل بعد «إغلاق الفترة» — الموظف يطلع على نتائجه فقط.</p>
        <p style="color: #64748b; font-size: 0.875rem;">إذا كنت موظفاً، استخدم الرابط أو QR Code الذي أعطتك إياه الإدارة.</p>
      </div>
    </div>
  `;
  return;
}

// عند الدخول برابط الأدمن (?admin=...) نُثبّت الدور أدمن حتى لا يُعرض جدول HR مع ترويسة الأدمن
if (isAdminMode()) {
  try {
    localStorage.setItem('adora_current_role', 'admin');
    localStorage.removeItem('adora_current_token');
    localStorage.removeItem('adora_current_period');
  } catch (e) {}
}

loadEmployeeCodesMap(); // Load employee codes first
// Load admin tokens if function exists
if (typeof loadAdminTokens === 'function') {
  loadAdminTokens();
}
// Load discounts and discount types (if functions exist)
if (typeof loadDiscounts === 'function') {
  loadDiscounts();
}
if (typeof loadDiscountTypes === 'function') {
  loadDiscountTypes();
}
const savedDb = localStorage.getItem('adora_rewards_db');
const savedBranches = localStorage.getItem('adora_rewards_branches');
const savedEvalRate = localStorage.getItem('adora_rewards_evalRate');
const savedStartDate = localStorage.getItem('adora_rewards_startDate');
const savedPeriodText = localStorage.getItem('adora_rewards_periodText');
const savedNegativeRatings = localStorage.getItem('adora_rewards_negativeRatingsCount');
if (savedDb && savedBranches) {
db = JSON.parse(savedDb);
branches = new Set(JSON.parse(savedBranches));
normalizeDuplicateAttendance(db);
if (savedNegativeRatings) {
  try {
    branchNegativeRatingsCount = JSON.parse(savedNegativeRatings);
    if (typeof branchNegativeRatingsCount !== 'object' || branchNegativeRatingsCount === null) branchNegativeRatingsCount = {};
    if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
  } catch (_) { branchNegativeRatingsCount = {}; }
}
// Update window.db after loading
if (typeof window !== 'undefined') {
  window.db = db;
  window.branchNegativeRatingsCount = branchNegativeRatingsCount;
  console.log('✅ window.db updated from localStorage, length:', db.length);
}
if (savedEvalRate) {
currentEvalRate = parseInt(savedEvalRate) || 20;
}
if (savedStartDate) {
reportStartDate = savedStartDate;
}
// Update period range in header and print header
if (savedPeriodText) {
const periodRangeEl = document.getElementById('periodRange');
if (periodRangeEl) {
periodRangeEl.innerText = savedPeriodText;
}
const headerPeriodRangeEl = document.getElementById('headerPeriodRange');
if (headerPeriodRangeEl) {
headerPeriodRangeEl.innerText = savedPeriodText;
}
}
if (db.length > 0) {
// Show dashboard and hide upload box
document.getElementById('uploadBox').classList.add('hidden');
document.getElementById('dashboard').classList.remove('hidden');
document.getElementById('actionBtns').style.display = 'flex';
// Update UI
updateFilters();
updatePrintButtonText();
renderUI('الكل');
// Update employees list if dropdown is open
// Reports page is now separate, no need to populate dropdown
console.log('✅ Data loaded from localStorage');
}
}
} catch (error) {
console.error('❌ Error loading from localStorage:', error);
db = [];
branches = new Set();
if (typeof window !== 'undefined') { window.db = db; }
}
}
// Function to return to upload page
// clearPeriodData: true = إغلاق الفترة (مسح كل بيانات الفترة)، false = خروج فقط
// Navigate back to Project 1 (Analysis system)
function returnToAnalysis() {
  var nextUrl = '/';
  try {
    var urlParams = new URLSearchParams(window.location.search || '');
    var adminKey = urlParams.get('admin');
    if (adminKey) {
      nextUrl = '/?admin=' + encodeURIComponent(adminKey) + '&analysis=1&t=' + Date.now();
    }
  } catch (_) {}
  window.location.href = nextUrl;
}

function returnToUpload(clearPeriodData, forceLogout, noRedirect, afterNoRedirectCallback) {
// In transfer mode, don't allow going back to upload page — إلا عند الخروج النهائي (زر خروج)
if (window.adoraTransferMode && !forceLogout) {
  logVerbose('🚫 returnToUpload blocked — transfer mode active');
  return;
}
if (forceLogout) window.adoraTransferMode = false;
(async function doReturnToUpload() {
try {
var isAdmin = (typeof window !== 'undefined' && window.location && window.location.search) && new URLSearchParams(window.location.search).get('admin') === ADMIN_SECRET_KEY;
// قبل المسح: رفع إدخالات المشرف/HR والتقييمات السلبية إلى Firebase حتى لا تُفقد عند العودة ورفع ملفات جديدة
if (isAdmin && ((typeof db !== 'undefined' && db && db.length > 0) || (typeof branchNegativeRatingsCount === 'object' && branchNegativeRatingsCount && Object.keys(branchNegativeRatingsCount).length > 0))) {
  if (typeof flushAdminInputsToStorage === 'function') flushAdminInputsToStorage();
  if (typeof doSyncLivePeriodToFirebase === 'function') {
    await Promise.race([doSyncLivePeriodToFirebase(), new Promise(function (r) { setTimeout(r, 4500); })]);
  }
}
// ── مسح الجلسة: ما يُمسح وما يُترك (راجع التعليقات أدناه) ──
// دائماً: adora_current_role، adora_current_token، adora_current_period.
// عند إغلاق الفترة (clearPeriodData): كل بيانات الفترة + negativeRatingsCount، discounts، discountTypes.
// عند خروج الأدمن فقط: جلسة الأدمن + بيانات الفترة؛ لا نمسح negativeRatingsCount/discounts/discountTypes ولا adora_rewards_cumulativePoints ولا adora_rewards_pricing/employeeCodes.
// قراءة الجلسة الحالية قبل المسح (لإزالة توكنها من adora_admin_tokens)
var r = localStorage.getItem('adora_current_role');
var p = localStorage.getItem('adora_current_period');
localStorage.removeItem('adora_current_role');
localStorage.removeItem('adora_current_token');
localStorage.removeItem('adora_current_period');
if (clearPeriodData) {
  // إغلاق الفترة: تصفية كل النتائج لبدء فترة جديدة
  // ملاحظة: adora_rewards_cumulativePoints لا يُمسح (مستخدم في app-extensions.js للرصيد التراكمي) — يبقى عبر الفترات
  localStorage.removeItem('adora_rewards_db');
  localStorage.removeItem('adora_rewards_branches');
  localStorage.removeItem('adora_rewards_evalRate');
  localStorage.removeItem('adora_rewards_startDate');
  localStorage.removeItem('adora_rewards_periodText');
  localStorage.removeItem('adora_rewards_negativeRatingsCount');
  localStorage.removeItem('adora_rewards_discounts');
  localStorage.removeItem('adora_rewards_discountTypes');
  branchNegativeRatingsCount = {};
  if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
  // عند عدم إعادة التوجيه: مسح الذاكرة أيضاً كي لا تظهر «التقارير الحالية» بالبيانات القديمة
  if (noRedirect) {
    db = [];
    if (typeof window !== 'undefined') window.db = db;
    branches = new Set();
    reportStartDate = null;
    currentEvalRate = 20;
    employeeCodesMap = {};
    discounts = [];
    discountTypes = [];
    if (typeof window !== 'undefined') { window.discounts = discounts; window.discountTypes = discountTypes; }
  }
} else if (isAdmin) {
  // خروج الأدمن: مسح جلسة الدخول + بيانات الفترة فقط
  try { localStorage.removeItem(ADMIN_AUTH_SESSION_KEY); } catch (e) {}
  localStorage.removeItem('adora_rewards_db');
  localStorage.removeItem('adora_rewards_branches');
  localStorage.removeItem('adora_rewards_evalRate');
  localStorage.removeItem('adora_rewards_startDate');
  localStorage.removeItem('adora_rewards_periodText');
  // لا نمسح: adora_rewards_negativeRatingsCount، adora_rewards_discounts، adora_rewards_discountTypes (إعدادات/إدخالات سابقة)
  branchNegativeRatingsCount = {};
  if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
  try { localStorage.setItem('adora_admin_just_logged_out', '1'); } catch (e) {}
}
// إزالة توكن هذه الجلسة من التخزين المحلي حتى لا يعيد الدخول تلقائياً عند فتح نفس الرابط
if (r && p) {
  try {
    var t = localStorage.getItem('adora_admin_tokens');
    if (t) {
      var obj = JSON.parse(t);
      if (obj[p]) {
        delete obj[p][r];
        if (Object.keys(obj[p]).length === 0) delete obj[p];
      }
      localStorage.setItem('adora_admin_tokens', JSON.stringify(obj));
    }
  } catch (e) {}
}
// عند عدم إعادة التوجيه (مثلاً بعد إغلاق الفترة): البقاء في الصفحة واستدعاء الـ callback
if (noRedirect && typeof afterNoRedirectCallback === 'function') {
  afterNoRedirectCallback();
  return;
}
// إعادة توجيه: الأدمن → clear-session.html?admin=KEY (ثم توجيه ديناميكي لـ /?admin=KEY)؛ غيره → الصفحة الرئيسية
if (typeof window !== 'undefined' && window.location) {
  var adminKeyForRedirect = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search).get('admin') : '';
  var targetUrl = isAdmin
    ? window.location.origin + '/clear-session.html?admin=' + encodeURIComponent(adminKeyForRedirect || '')
    : window.location.origin + '/';
  window.location.replace(targetUrl);
  return;
}
} catch (error) {
console.error('❌ Error clearing:', error);
}
})();
}
let currentSort = { key: 'net', order: 'desc' }; // Default: sort by net (highest first)
// === Table header sort: click on column header to sort by that column ===
var _tableHeaderSortDelegateAttached = false;
function setupTableHeaderSort() {
  if (_tableHeaderSortDelegateAttached) return;
  var tbl = document.getElementById('targetTable');
  if (!tbl) return;
  _tableHeaderSortDelegateAttached = true;
  tbl.addEventListener('click', function (e) {
    var th = e.target && e.target.closest('th[data-sort-key]');
    if (!th) return;
    var key = th.getAttribute('data-sort-key');
    if (!key) return;
    currentSort.order = (currentSort.key === key) ? (currentSort.order === 'asc' ? 'desc' : 'asc') : 'desc';
    currentSort.key = key;
    if (typeof renderUI === 'function' && typeof currentFilter !== 'undefined') renderUI(currentFilter);
  });
}
function updateTableHeaderSortIndicator() {
  var mainRow = document.querySelector('.main-header-row');
  if (!mainRow) return;
  mainRow.querySelectorAll('th[data-sort-key]').forEach(function (th) {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.getAttribute('data-sort-key') === currentSort.key) th.classList.add(currentSort.order === 'asc' ? 'sort-asc' : 'sort-desc');
  });
}
// === Initialize Particles ===
function createParticles() {
const container = document.getElementById('particles');
if (!container) return;
for (let i = 0; i < 30; i++) {
const particle = document.createElement('div');
particle.className = 'particle';
particle.style.left = Math.random() * 100 + '%';
particle.style.top = Math.random() * 100 + '%';
particle.style.animationDelay = Math.random() * 20 + 's';
particle.style.animationDuration = (15 + Math.random() * 10) + 's';
container.appendChild(particle);
}
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createParticles);
} else {
  createParticles();
}

async function doAppInit() {
  var urlRole = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search).get('role') : null;
  var urlToken = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search).get('token') : null;
  var urlPeriod = (typeof window !== 'undefined' && window.location && window.location.search) ? new URLSearchParams(window.location.search).get('period') : null;
  // الرابط الجذر (/) بدون admin أو role/token/period: مسح دور الجلسة حتى لا تظهر واجهة المشرف/HR من زيارة سابقة
  if (!isAdminMode() && !(urlRole && urlToken && urlPeriod) && !isEmployeeMode()) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('adora_current_role');
        localStorage.removeItem('adora_current_token');
        localStorage.removeItem('adora_current_period');
      }
    } catch (e) {}
  }
  // Firebase-First: جلب الفترة من Firebase أولاً (للجميع: أدمن، مشرف، HR، إلخ) ثم استخدام localStorage كـ cache احتياطي
  var isAdminLinkOpen = urlRole && urlToken && urlPeriod && !isAdminMode() && ['supervisor', 'hr', 'accounting', 'manager'].indexOf(urlRole) >= 0;
  if (isAdminLinkOpen) {
    // فتح رابط إداري على جهاز جديد: إظهار لوحة التحكم فوراً ثم جلب الفترة من Firebase (مع إعادة محاولة ورسالة خطأ عند الفشل)
    var uploadBoxEl = document.getElementById('uploadBox');
    var dashboardEl = document.getElementById('dashboard');
    var actionBtnsEl = document.getElementById('actionBtns');
    if (uploadBoxEl) uploadBoxEl.classList.add('hidden');
    if (dashboardEl) dashboardEl.classList.remove('hidden');
    if (actionBtnsEl) actionBtnsEl.style.display = 'flex';
    if (typeof initializeRoleBasedUI === 'function') initializeRoleBasedUI(urlRole);
    // عرض الفترة من الرابط فوراً حتى لا يظهر "الفترة : -"
    if (urlPeriod) {
      var periodLabel = urlPeriod.replace(/_/g, ' - ');
      var periodRangeEl = document.getElementById('periodRange');
      var headerPeriodRangeEl = document.getElementById('headerPeriodRange');
      if (periodRangeEl) periodRangeEl.innerText = periodLabel;
      if (headerPeriodRangeEl) headerPeriodRangeEl.innerText = periodLabel;
    }
    var tableContainer = document.getElementById('mainTable') && document.getElementById('mainTable').closest('.table-scroll-container');
    if (tableContainer) {
      var loadingWrap = document.createElement('div');
      loadingWrap.id = 'adminLinkLoadingWrap';
      loadingWrap.setAttribute('aria-live', 'polite');
      loadingWrap.className = 'flex flex-col items-center justify-center gap-4 w-full min-h-[200px] py-12 px-6 text-white/90 rounded-xl bg-white/5 border border-turquoise/20';
      loadingWrap.style.minWidth = '100%';
      loadingWrap.innerHTML = '<div class="w-full max-w-[320px] rounded-full overflow-hidden relative" style="height:8px;"><div style="position:absolute;inset:0;background:#4b5563;"></div><div class="admin-link-progress-fill" style="position:absolute;left:0;top:0;height:100%;background:linear-gradient(90deg,#ef4444 0%,#f97316 25%,#eab308 50%,#84cc16 75%,#22c55e 100%);"></div></div><span class="text-base font-bold text-white/90 text-center">جاري تحميل بيانات الفترة من الخادم...</span>';
      var tableEl = tableContainer.querySelector('#targetTable') || document.getElementById('mainTable');
      if (tableEl && tableEl.parentNode) tableEl.parentNode.insertBefore(loadingWrap, tableEl);
    }
    (async function fetchAndApplyLivePeriod() {
      var el = document.getElementById('adminLinkLoadingWrap');
      var firebaseUnavailable = false;
      try {
        if (typeof initializeFirebase === 'function') initializeFirebase();
        var waitStart = Date.now();
        var maxWaitMs = 15000;
        while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < maxWaitMs) {
          await new Promise(function (r) { setTimeout(r, 200); });
        }
        if (typeof window !== 'undefined' && window.storage) { storage = window.storage; }
        if (!(typeof window !== 'undefined' && window.storage)) {
          firebaseUnavailable = true;
          if (typeof logVerbose === 'function') logVerbose('⚠️ Admin link: Firebase Storage غير متصل بعد الانتظار');
        }
        var live = null;
        if (!firebaseUnavailable) {
          // عند وجود period في الرابط: جرب periods/periodId.json أولاً (تخفيف ضغط 429 على live.json)
          if (urlPeriod && typeof fetchPeriodFromFirebase === 'function') {
            for (var attemptPeriod = 0; attemptPeriod < 3 && (!live || !live.db || live.db.length === 0); attemptPeriod++) {
              live = await fetchPeriodFromFirebase(urlPeriod);
              if (live && Array.isArray(live.db) && live.db.length > 0) break;
              if (attemptPeriod < 2) await new Promise(function (r) { setTimeout(r, 2500); });
            }
          }
          // إن لم يُحمّل: جلب live.json (عدد محاولات أقل + تأخير أطول لتجنّب 429)
          var maxLiveAttempts = 4;
          var retryDelayMs = 3500;
          for (var attemptLive = 0; attemptLive < maxLiveAttempts && (!live || !live.db || live.db.length === 0); attemptLive++) {
            if (typeof fetchLivePeriodFromFirebase === 'function') live = await fetchLivePeriodFromFirebase();
            if (live && Array.isArray(live.db) && live.db.length > 0) break;
            if (attemptLive < maxLiveAttempts - 1) await new Promise(function (r) { setTimeout(r, retryDelayMs); });
          }
          // احتياطي أخير: periodId ثم live (مرة واحدة)
          if (!live || !Array.isArray(live.db) || live.db.length === 0) {
            if (urlPeriod && typeof fetchPeriodFromFirebase === 'function') live = await fetchPeriodFromFirebase(urlPeriod);
            if ((!live || !live.db || live.db.length === 0) && typeof fetchLivePeriodFromFirebase === 'function') live = await fetchLivePeriodFromFirebase();
          }
        }
        if (!isEmployeeMode() && live && Array.isArray(live.db) && live.db.length > 0 && typeof applyLivePeriod === 'function') {
          applyLivePeriod(live);
          if (typeof applyLiveToAppState === 'function') applyLiveToAppState(live);
          if (typeof fetchConfigFromFirebase === 'function') {
            try {
              var cfg = await fetchConfigFromFirebase();
              if (cfg && typeof cfg.minBookingThreshold === 'number') window.minBookingThreshold = cfg.minBookingThreshold;
            } catch (_) {}
          }
          if (typeof loadCumulativePointsFromFirebase === 'function') await loadCumulativePointsFromFirebase();
          loadDataFromStorage();
          if (el && el.parentNode) el.parentNode.removeChild(el);
          if (typeof updateFilters === 'function') updateFilters();
          if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
          if (typeof renderUI === 'function') renderUI('الكل');
        } else if (db.length > 0) {
          // احتياطي: لو Firebase فشل لكن عندنا بيانات محلية (cache) — نستخدمها
          loadDataFromStorage();
          if (el && el.parentNode) el.parentNode.removeChild(el);
          if (typeof updateFilters === 'function') updateFilters();
          if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
          if (typeof renderUI === 'function') renderUI('الكل');
        } else {
          var errTitle = firebaseUnavailable ? 'Firebase غير متصل' : 'تعذّر تحميل بيانات الفترة';
          var errDesc = firebaseUnavailable
            ? 'تحقق من الاتصال بالإنترنت وإعدادات Firebase. ثم أعد المحاولة.'
            : 'البيانات غير موجودة في Firebase (ملف الفترة أو live.json). يجب على الأدمن تنفيذ «الانتقال إلى حساب المكافآت» من نظام التحليل ثم انتظار ظهور «تمت المزامنة» قبل فتح رابط المشرف.';
          if (el) {
            el.innerHTML = '<div class="text-center"><p class="font-bold text-amber-400 mb-2">' + escHtml(errTitle) + '</p><p class="text-sm text-gray-400 mb-4">' + escHtml(errDesc) + '</p><button type="button" id="retryPeriodBtn" onclick="location.reload()" class="px-4 py-2 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#14b8a6] focus:ring-offset-2 focus:ring-offset-[#0f172a]" style="background:rgba(20,184,166,0.2);color:#14b8a6;border:1px solid rgba(20,184,166,0.5);">إعادة المحاولة</button></div>';
            el.classList.remove('flex', 'flex-col', 'items-center', 'justify-center', 'gap-3', 'py-12', 'px-4', 'text-white/90');
            el.classList.add('text-center', 'py-8', 'px-4');
            setTimeout(function () {
              var btn = document.getElementById('retryPeriodBtn');
              if (btn) btn.focus();
            }, 100);
          }
          if (typeof updateFilters === 'function') updateFilters();
          if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
          if (typeof renderUI === 'function') renderUI('الكل');
        }
      } catch (_) {
        if (el) {
          el.innerHTML = '<div class="text-center"><p class="font-bold text-amber-400 mb-2">حدث خطأ أثناء التحميل</p><p class="text-sm text-gray-400 mb-4">تحقق من الاتصال وجرّب مرة أخرى.</p><button type="button" id="retryPeriodBtn" onclick="location.reload()" class="px-4 py-2 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#14b8a6] focus:ring-offset-2 focus:ring-offset-[#0f172a]" style="background:rgba(20,184,166,0.2);color:#14b8a6;border:1px solid rgba(20,184,166,0.5);">إعادة المحاولة</button></div>';
          el.classList.remove('flex', 'flex-col', 'items-center', 'justify-center', 'gap-3', 'py-12', 'px-4', 'text-white/90');
          el.classList.add('text-center', 'py-8', 'px-4');
          setTimeout(function () {
            var btn = document.getElementById('retryPeriodBtn');
            if (btn) btn.focus();
          }, 100);
        }
        if (typeof updateFilters === 'function') updateFilters();
        if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
        if (typeof renderUI === 'function') renderUI('الكل');
      }
      if (!isEmployeeMode() && typeof startLivePeriodPolling === 'function') {
    if (typeof isAdminMode === 'function' && isAdminMode()) {
      startLivePeriodPolling();
    } else {
      startLivePeriodPolling();
    }
  }
    })();
    if (!isEmployeeMode() && typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
    return;
  }
  // إذا أدمن بدون بيانات محلية: إما خرج للتو (نعرض الرفع) أو فتح جديد (نجلب من Firebase ونعرض اللوحة)
  var savedDbForAdmin = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_rewards_db') : null;
  var adminJustLoggedOut = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_admin_just_logged_out') : null;
  if (typeof isAdminMode === 'function' && isAdminMode() && !urlRole && !urlToken && !urlPeriod && !savedDbForAdmin && adminJustLoggedOut === '1') {
    try { localStorage.removeItem('adora_admin_just_logged_out'); } catch (e) {}
    loadDataFromStorage();
    var uploadBoxEl = document.getElementById('uploadBox');
    var dashboardEl = document.getElementById('dashboard');
    var actionBtnsEl = document.getElementById('actionBtns');
    if (uploadBoxEl) uploadBoxEl.classList.remove('hidden');
    if (dashboardEl) dashboardEl.classList.add('hidden');
    if (actionBtnsEl) actionBtnsEl.style.display = 'none';
    return;
  }
  // Firebase-First للجميع: جلب الفترة من Firebase أولاً (أدمن، مشرف، HR، حسابات، مدير) — لا اعتماد على localStorage إلا كاحتياطي
  try {
    if (typeof initializeFirebase === 'function') initializeFirebase();
    var waitStart = Date.now();
    var maxWaitMs = 12000;
    while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < maxWaitMs) {
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    var live = null;
    var periodId = null;
    try {
      var startDate = localStorage.getItem('adora_rewards_startDate');
      if (startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate)) periodId = startDate.substring(0, 7).replace('-', '_');
    } catch (_) {}
    if (!periodId) periodId = new Date().getFullYear() + '_' + String(new Date().getMonth() + 1).padStart(2, '0');
    for (var attempt = 0; attempt < 4 && (!live || !Array.isArray(live.db) || live.db.length === 0); attempt++) {
      if (typeof fetchLivePeriodFromFirebase === 'function') live = await fetchLivePeriodFromFirebase();
      if (!live || !Array.isArray(live.db) || live.db.length === 0) {
        if (typeof fetchPeriodFromFirebase === 'function') live = await fetchPeriodFromFirebase(periodId);
      }
      if (!live || !Array.isArray(live.db) || live.db.length === 0) {
        if (attempt < 3) await new Promise(function (r) { setTimeout(r, 800); });
      }
    }
    // إذا جلبنا بيانات من Firebase: نطبقها ونعرض اللوحة (الرصيد التراكمي من Firebase أيضاً — مصدر واحد من أي جهاز)
    if (!isEmployeeMode() && live && Array.isArray(live.db) && live.db.length > 0 && typeof applyLivePeriod === 'function') {
      applyLivePeriod(live);
      if (typeof applyLiveToAppState === 'function') applyLiveToAppState(live);
      if (typeof fetchConfigFromFirebase === 'function') {
        try {
          var cfg = await fetchConfigFromFirebase();
          if (cfg && typeof cfg.minBookingThreshold === 'number') window.minBookingThreshold = cfg.minBookingThreshold;
        } catch (_) {}
      }
      // نفس آلية جلب db: التقييمات السلبية من نفس الـ payload (live) حتى لا تبقى أصفار
      if (live.negativeRatingsCount && typeof live.negativeRatingsCount === 'object') {
        branchNegativeRatingsCount = live.negativeRatingsCount;
        if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
        try { localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(branchNegativeRatingsCount)); } catch (_) {}
        if (typeof updateNegativeRatingsHeader === 'function') updateNegativeRatingsHeader();
      }
      if (typeof loadCumulativePointsFromFirebase === 'function') await loadCumulativePointsFromFirebase();
      loadDataFromStorage();
      // إذا كنا في وضع الأدمن: إظهار اللوحة
      if (isAdminMode()) {
        var uploadBoxEl = document.getElementById('uploadBox');
        var dashboardEl = document.getElementById('dashboard');
        var actionBtnsEl = document.getElementById('actionBtns');
        if (uploadBoxEl) uploadBoxEl.classList.add('hidden');
        if (dashboardEl) dashboardEl.classList.remove('hidden');
        if (actionBtnsEl) actionBtnsEl.style.display = 'flex';
        if (typeof updateFilters === 'function') updateFilters();
        if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
        if (typeof renderUI === 'function') renderUI('الكل');
      }
    } else {
      // احتياطي: لو Firebase فشل، نحاول localStorage (cache)
      loadDataFromStorage();
      if (isAdminMode() && db.length > 0) {
        var uploadBoxEl = document.getElementById('uploadBox');
        var dashboardEl = document.getElementById('dashboard');
        var actionBtnsEl = document.getElementById('actionBtns');
        if (uploadBoxEl) uploadBoxEl.classList.add('hidden');
        if (dashboardEl) dashboardEl.classList.remove('hidden');
        if (actionBtnsEl) actionBtnsEl.style.display = 'flex';
        if (typeof updateFilters === 'function') updateFilters();
        if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
        if (typeof renderUI === 'function') renderUI('الكل');
      }
    }
  } catch (_) {
    // في حالة خطأ: نحاول localStorage
    loadDataFromStorage();
  }
  if (!isEmployeeMode() && typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
  if (!isEmployeeMode() && typeof startLivePeriodPolling === 'function') {
    if (typeof isAdminMode === 'function' && isAdminMode()) {
      startLivePeriodPolling();
    } else {
      startLivePeriodPolling();
    }
  }
  if (isAdminMode()) {
    if (db.length > 0 && typeof doSyncLivePeriodNow === 'function') {
      doSyncLivePeriodNow().catch(function () {});
    }
    return;
  }
  var currentRole = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
  // عدم تطبيق دور من localStorage إلا عندما الرابط نفسه مصرح (role+token+period) حتى لا يظهر بانر «مرحباً، HR/المشرف» فوق صفحة غير مصرح
  var urlAuthorizedRole = urlRole && urlToken && urlPeriod && currentRole === urlRole;
  if (currentRole && currentRole !== 'admin' && urlAuthorizedRole) {
    if (typeof initializeRoleBasedUI === 'function') initializeRoleBasedUI(currentRole);
  }
}

// isAdminLinkSubmitted معرّفة في rewards-rbac.js

function doRbacThenInit() {
  // If opened for transfer from Project 1, try localStorage first (same-origin via Vite proxy),
  // then fall back to postMessage for backward compatibility
  var isTransferMode = window.location.search.indexOf('transfer=1') >= 0;
  if (isTransferMode) {
    logVerbose('🔄 Transfer mode detected — checking localStorage for payload...');
    // Hide upload box completely and show dashboard
    var uploadBoxEl = document.getElementById('uploadBox');
    var dashboardEl = document.getElementById('dashboard');
    var actionBtnsEl = document.getElementById('actionBtns');
    if (uploadBoxEl) { uploadBoxEl.classList.add('hidden'); uploadBoxEl.style.display = 'none'; }
    if (dashboardEl) dashboardEl.classList.remove('hidden');
    if (actionBtnsEl) actionBtnsEl.style.display = 'flex';
    // Hide the "خروج" button — no upload page in transfer mode
    var returnBtnEl = document.getElementById('btnReturnToUpload');
    if (returnBtnEl) returnBtnEl.style.display = 'none';

    // ──────────────────────────────────────────────────────────────
    // PRIORITY 1: Check if a NEW transfer payload exists.
    // This MUST run BEFORE the fast-path cache check, because a new
    // transfer carries fresh config/pricing from the admin's settings.
    // If we used the old cache we'd render stale pricing.
    // ──────────────────────────────────────────────────────────────
    var lsPayloadRaw = null;
    try { lsPayloadRaw = localStorage.getItem('adora_transfer_payload'); } catch (_) {}
    if (!lsPayloadRaw && typeof window._adoraTransferPayloadCapture !== 'undefined' && window._adoraTransferPayloadCapture)
      lsPayloadRaw = window._adoraTransferPayloadCapture;

    if (lsPayloadRaw) {
      try {
        var lsPayload = JSON.parse(lsPayloadRaw);
        logVerbose('✅ NEW transfer payload found — processing (settings & bookings refreshed)');
        _processAdoraTransferPayload(lsPayload);
        try { localStorage.removeItem('adora_transfer_payload'); } catch (_) {}
        return; // Done — fresh data processed with latest pricing
      } catch (e) {
        logVerbose('⚠️ Failed to parse or process localStorage payload:', e);
        // Do NOT remove payload so user can retry or refresh
      }
    }

    // ──────────────────────────────────────────────────────────────
    // PRIORITY 2: FAST PATH (page refresh, no new transfer payload)
    // ──────────────────────────────────────────────────────────────
    var cachedDbRaw = null;
    var cachedBranchesRaw = null;
    try {
      cachedDbRaw = localStorage.getItem('adora_rewards_db');
      cachedBranchesRaw = localStorage.getItem('adora_rewards_branches');
    } catch (_) {}

    if (cachedDbRaw && cachedBranchesRaw) {
      logVerbose('✅ Cached data found in localStorage — loading directly (refresh fast-path)');
      window.adoraTransferMode = true;

      // Ensure db is populated (may have been reset by earlier try-catch error)
      if (!db || db.length === 0) {
        try {
          db = JSON.parse(cachedDbRaw);
          branches = new Set(JSON.parse(cachedBranchesRaw));
          if (typeof normalizeDuplicateAttendance === 'function') normalizeDuplicateAttendance(db);
          if (typeof window !== 'undefined') { window.db = db; }
          var _savedNeg = localStorage.getItem('adora_rewards_negativeRatingsCount');
          if (_savedNeg) {
            try { branchNegativeRatingsCount = JSON.parse(_savedNeg); } catch(_) {}
            if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
          }
          var _savedPeriod = localStorage.getItem('adora_rewards_periodText');
          if (_savedPeriod) {
            var _pr = document.getElementById('periodRange');
            var _hpr = document.getElementById('headerPeriodRange');
            if (_pr) _pr.innerText = _savedPeriod;
            if (_hpr) _hpr.innerText = _savedPeriod;
          }
          // Restore reportStartDate and evalRate for Firebase sync
          var _savedStart = localStorage.getItem('adora_rewards_startDate');
          if (_savedStart) reportStartDate = _savedStart;
          var _savedEval = localStorage.getItem('adora_rewards_evalRate');
          if (_savedEval) currentEvalRate = parseInt(_savedEval) || 20;
          // Restore discounts
          var _savedDisc = localStorage.getItem('adora_rewards_discounts');
          if (_savedDisc) {
            try { discounts = JSON.parse(_savedDisc); if (typeof window !== 'undefined') window.discounts = discounts; } catch(_) {}
          }
          if (typeof loadDiscountTypes === 'function') loadDiscountTypes();
        } catch (e) {
          logVerbose('⚠️ Failed to parse cached db:', e);
        }
      }

      // Ensure reportStartDate is set even if db was loaded by top-level code
      if (!reportStartDate || typeof reportStartDate !== 'string' || !/^\d{4}/.test(reportStartDate)) {
        var _rs = localStorage.getItem('adora_rewards_startDate');
        if (_rs) reportStartDate = _rs;
      }

      // Show dashboard, render table with breakdown
      if (db && db.length > 0) {
        var _ub = document.getElementById('uploadBox');
        var _db2 = document.getElementById('dashboard');
        var _ab = document.getElementById('actionBtns');
        if (_ub) { _ub.classList.add('hidden'); _ub.style.display = 'none'; }
        if (_db2) _db2.classList.remove('hidden');
        if (_ab) _ab.style.display = 'flex';
        // Hide return button in transfer mode
        var _rb = document.getElementById('btnReturnToUpload');
        if (_rb) _rb.style.display = 'none';

        // Restore VIP rooms and config BEFORE rendering (needed for column generation)
        try {
          var _cachedVip = localStorage.getItem('adora_rewards_activeVipRooms');
          if (_cachedVip) {
            window.adoraActiveVipRooms = JSON.parse(_cachedVip);
          }
          var _cachedCfg = localStorage.getItem('adora_rewards_config');
          if (_cachedCfg) {
            window.adoraConfig = JSON.parse(_cachedCfg);
          }
          // Restore raw bookings for breakdown drilldown
          if (!window.adoraRawBookings || window.adoraRawBookings.length === 0) {
            var _cachedRaw = localStorage.getItem('adora_rewards_rawBookings');
            if (_cachedRaw) {
              window.adoraRawBookings = JSON.parse(_cachedRaw);
            }
          }
        } catch (_) {}

        // CRITICAL ORDER: toggleBreakdownColumns BEFORE renderUI
        // (mirrors _processAdoraTransferPayload flow: toggleBreakdownColumns → updateFilters → renderUI)
        if (typeof toggleBreakdownColumns === 'function') toggleBreakdownColumns(true);
        if (typeof updateFilters === 'function') updateFilters();
        if (typeof renderUI === 'function') renderUI('الكل');
        // جلب الحد الأدنى لحجوزات الموظف من إعدادات الأدمن وإعادة الرسم عند الوصول (لا نعطّل أول رسم)
        if (typeof fetchConfigFromFirebase === 'function') {
          fetchConfigFromFirebase().then(function(c) {
            if (c && typeof c.minBookingThreshold === 'number') {
              window.minBookingThreshold = c.minBookingThreshold;
              if (typeof renderUI === 'function') renderUI('الكل');
            }
          }).catch(function() {});
        }
        if (typeof updateBreakdownFooterTotals === 'function') updateBreakdownFooterTotals();
        // Refresh fast-path guard: ensure footer totals are recalculated after async row rendering.
        // In breakdown mode, initial paint can happen before all computed fields settle.
        requestAnimationFrame(function () {
          try { if (typeof updateFooterTotals === 'function') updateFooterTotals(); } catch (_) {}
          try { if (typeof updateBreakdownFooterTotals === 'function') updateBreakdownFooterTotals(); } catch (_) {}
        });
        setTimeout(function () {
          try { if (typeof updateFooterTotals === 'function') updateFooterTotals(); } catch (_) {}
          try { if (typeof updateBreakdownFooterTotals === 'function') updateBreakdownFooterTotals(); } catch (_) {}
        }, 180);
        setTimeout(function () {
          try { if (typeof updateFooterTotals === 'function') updateFooterTotals(); } catch (_) {}
          try { if (typeof updateBreakdownFooterTotals === 'function') updateBreakdownFooterTotals(); } catch (_) {}
        }, 520);
        if (typeof updateFooterSummaryColspans === 'function') setTimeout(updateFooterSummaryColspans, 80);
        if (typeof initializeRoleBasedUI === 'function') {
          var _urlAdmin = typeof window !== 'undefined' && window.location && new URLSearchParams(window.location.search).get('admin');
          var _role = _urlAdmin ? 'admin' : (localStorage.getItem('adora_current_role') || '');
          if (_urlAdmin) try { localStorage.setItem('adora_current_role', 'admin'); } catch (_) {}
          if (_role) initializeRoleBasedUI(_role);
        }
        if (typeof hideTransferLoadingOverlay === 'function') hideTransferLoadingOverlay();
        logVerbose('✅ Refresh fast-path complete — ' + db.length + ' employees loaded');
        // Background: fetch latest from Firebase (HR/supervisor inputs, discounts, etc.)
        // then sync current state back to Firebase
        if (typeof _adoraBackgroundFirebaseSync === 'function') {
          setTimeout(function() { _adoraBackgroundFirebaseSync({}, { uploadAfterMerge: false }); }, 300);
        }
        return; // Done — no need for transfer payload
      }
    }

    // FALLBACK: Ask opener for payload (postMessage) and retry localStorage; then show help
    logVerbose('⏳ No localStorage payload — requesting from opener and retrying...');
    if (typeof hideTransferLoadingOverlay === 'function') hideTransferLoadingOverlay();
    var tbody = document.getElementById('mainTable');
    if (tbody) {
      tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-white/60 text-sm"><div class="flex flex-col items-center gap-3"><div class="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div><span>جاري استقبال البيانات من نظام التحليل...</span></div></td></tr>';
    }
    function requestPayloadFromOpener() {
      if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage({ type: 'ADORA_REQUEST_PAYLOAD' }, '*'); } catch (_) {}
      }
    }
    requestPayloadFromOpener();
    setTimeout(requestPayloadFromOpener, 300);
    var lsRetries = 0;
    var lsRetryInterval = setInterval(function() {
      lsRetries++;
      try {
        var retryRaw = localStorage.getItem('adora_transfer_payload');
        if (retryRaw) {
          clearInterval(lsRetryInterval);
          var retryPayload = JSON.parse(retryRaw);
          localStorage.removeItem('adora_transfer_payload');
          logVerbose('✅ Transfer payload found in localStorage (retry ' + lsRetries + ')');
          _processAdoraTransferPayload(retryPayload);
          return;
        }
      } catch (_) {}
      requestPayloadFromOpener();
      if (lsRetries >= 24) {
        clearInterval(lsRetryInterval);
        if (typeof hideTransferLoadingOverlay === 'function') hideTransferLoadingOverlay();
        if (tbody) {
          tbody.innerHTML = '<tr><td colspan="9" class="p-8 text-center text-slate-300 text-sm"><div class="flex flex-col items-center gap-4">'
            + '<p>لم تُستلم بيانات. من نظام التحليل اضغط زر «نقل للمكافآت» بعد تشغيل التحليل.</p>'
            + '<a href="/" class="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30 transition-colors">الذهاب لنظام التحليل</a>'
            + '</div></td></tr>';
        }
      }
    }, 500);
    return; // Don't run doAppInit — data will come via postMessage or localStorage retry
  }

  if (role && role !== 'admin' && typeof loadAdminTokens === 'function' && typeof validateAdminAccess === 'function') {
    (async () => {
      loadAdminTokens();
      const v = validateAdminAccess(role, token, period);
      if (v.valid) {
        localStorage.setItem('adora_current_role', role);
        localStorage.setItem('adora_current_token', token);
        localStorage.setItem('adora_current_period', period);
        if (typeof logAdminAction === 'function') {
          logAdminAction(role, 'page_access', { period: period, timestamp: new Date().toISOString() });
        }
        await doAppInit();
        return;
      }
      var overlay = document.createElement('div');
      overlay.id = 'rbacVerifyOverlay';
      overlay.setAttribute('role', 'status');
      overlay.setAttribute('aria-live', 'polite');
      overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0f172a 0%,#1a1f35 100%);color:#fff;font-family:\'IBM Plex Sans Arabic\',Arial,sans-serif;';
      overlay.innerHTML = '<div style="text-align:center;padding:2rem;"><div style="font-size:2.5rem;margin-bottom:1rem;">⏳</div><h1 style="font-size:1.125rem;font-weight:800;color:#94a3b8;">جاري التحقق من الرابط...</h1><p style="font-size:0.8125rem;color:#64748b;margin-top:0.5rem;">قد يستغرق ذلك بضع ثوانٍ. تأكد من اتصال الإنترنت.</p></div>';
      document.body.appendChild(overlay);
      if (typeof initializeFirebase === 'function') initializeFirebase();
      var startTime = Date.now();
      var maxWaitMs = 14000;
      var ok = false;
      for (var w = 0; w < 12 && (Date.now() - startTime) < maxWaitMs; w++) {
        if (typeof window !== 'undefined' && window.storage) break;
        await new Promise(function(r) { setTimeout(r, 500); });
      }
      for (var attempt = 0; attempt < 3 && !ok && (Date.now() - startTime) < maxWaitMs; attempt++) {
        try {
          if (typeof tryValidateAdminAccessFromFirebase === 'function') ok = await tryValidateAdminAccessFromFirebase(role, token, period);
        } catch (e) { if (console && console.warn) console.warn(e); }
        if (ok) break;
        if (attempt < 2) await new Promise(function(r) { setTimeout(r, 1500); });
      }
      var elOverlay = document.getElementById('rbacVerifyOverlay');
      if (elOverlay && elOverlay.parentNode) elOverlay.parentNode.removeChild(elOverlay);
      if (ok) {
        // بدون reload: توكن محفوظ في localStorage من tryValidateAdminAccessFromFirebase — نتابع مباشرة لتسريع فتح الرابط
        await doAppInit();
        return;
      }
      if (role && token && period && typeof acceptAdminAccessFromUrl === 'function') {
        try {
          if (acceptAdminAccessFromUrl(role, token, period)) {
            localStorage.setItem('adora_current_role', role);
            localStorage.setItem('adora_current_token', token);
            localStorage.setItem('adora_current_period', period);
            if (typeof logAdminAction === 'function') {
              logAdminAction(role, 'page_access', { period: period, fromUrlFallback: true, timestamp: new Date().toISOString() });
            }
            await doAppInit();
            return;
          }
        } catch (e) { if (console && console.warn) console.warn(e); }
      }
      var rawReason = v.reason || 'الرابط غير صحيح أو الفترة مغلقة';
      if (rawReason === 'الفترة غير موجودة') {
        rawReason = 'تعذّر جلب بيانات الرابط من الخادم. تأكد أن الأدمن نسخ الرابط من «إدارة الإداريين» بعد رفع ملف الفترة، وأن اتصال الإنترنت يعمل.';
      }
      function escapeHtml(s) {
        if (s == null || typeof s !== 'string') return '';
        var div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
      }
      var reason = escapeHtml(rawReason);
      var adminErrorHtml = '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0f172a 0%,#1a1f35 100%);color:#fff;font-family:\'IBM Plex Sans Arabic\',Arial,sans-serif;padding:1rem;">' +
        '<div style="text-align:center;padding:2rem;max-width:580px;">' +
        '<div style="font-size:4rem;margin-bottom:1rem;">🔒</div>' +
        '<h1 style="font-size:1.5rem;font-weight:900;margin-bottom:1rem;color:#ef4444;">رابط الإداري لا يفتح</h1>' +
        '<p style="color:#fbbf24;font-weight:700;margin-bottom:0.5rem;font-size:0.95rem;">سبب عدم فتح الرابط:</p>' +
        '<p style="color:#94a3b8;margin-bottom:1.25rem;line-height:1.6;">' + reason + '</p>' +
        '<div style="background:rgba(64,224,208,0.08);border:1px solid rgba(64,224,208,0.3);border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;text-align:right;">' +
        '<p style="color:#6ee7b7;font-weight:700;margin-bottom:0.5rem;font-size:0.95rem;">ماذا تفعل أنت (الإداري)؟</p>' +
        '<p style="color:#cbd5e1;font-size:0.9rem;margin:0;line-height:1.6;">تواصل مع من يملك صلاحية الأدمن واطلب منه إرسال رابط جديد. روابط الإداريين تعمل أثناء الفترة ولا تحتاج إغلاقًا.</p>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.35);border-radius:12px;padding:1.25rem;margin-bottom:1.25rem;text-align:right;">' +
        '<p style="color:#fbbf24;font-weight:700;margin-bottom:0.5rem;font-size:0.95rem;">ماذا يفعل الأدمن؟</p>' +
        '<p style="color:#cbd5e1;font-size:0.9rem;margin:0;line-height:1.6;">من لوحة الأدمن → «إدارة الإداريين» → انسخ الرابط المخصص لدور هذا الإداري وأرسله له. التفعيل يكون فوراً بعد النسخ (يُفضّل بعد رفع ملف الفترة).</p>' +
        '</div>' +
        '<p style="color:#64748b;font-size:0.875rem;">يرجى التواصل مع من يملك صلاحية الأدمن.</p>' +
        '</div></div>';
      document.body.innerHTML = adminErrorHtml;
    })();
    return;
  }
  doAppInit().catch(function () {});
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', doRbacThenInit);
} else {
  doRbacThenInit();
}

// Theme toggle: wire button to AdoraTheme (shared/theme.js)
function updateThemeButtonIcon() {
  var btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  var sun = btn.querySelector('.theme-icon-sun');
  var moon = btn.querySelector('.theme-icon-moon');
  if (!sun || !moon) return;
  var theme = (typeof window.AdoraTheme !== 'undefined' && window.AdoraTheme.getTheme) ? window.AdoraTheme.getTheme() : 'dark';
  if (theme === 'dark') {
    sun.classList.remove('hidden');
    moon.classList.add('hidden');
  } else {
    sun.classList.add('hidden');
    moon.classList.remove('hidden');
  }
}
function setupThemeToggle() {
  var btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  if (typeof window.AdoraTheme === 'undefined') {
    setTimeout(setupThemeToggle, 30);
    return;
  }
  btn.addEventListener('click', function () {
    window.AdoraTheme.toggleTheme();
    updateThemeButtonIcon();
  });
  updateThemeButtonIcon();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupThemeToggle);
} else {
  setupThemeToggle();
}

// إغلاق النوافذ المنبثقة بمفتاح Escape (UX)
(function setupEscapeCloseModals() {
  var modalCloseMap = {
    conditionsModal: 'closeConditionsModal',
    ratingExplanationModal: 'closeRatingExplanationModal',
    instructionsModal: 'closeInstructionsModal',
    employeeReportModal: 'closeEmployeeReportModal',
    closePeriodModal: 'closeClosePeriodModal',
    employeeCodesModal: 'closeEmployeeCodesModal',
    adminManagementModal: 'closeAdminManagementModal',
    discountsModal: 'closeDiscountsModal',
    mostDiscountsDetailModal: 'closeMostDiscountsDetailModal',
    manageDiscountTypesModal: 'closeManageDiscountTypesModal'
  };
  function onKeyDown(e) {
    if (e.key !== 'Escape') return;
    var modals = document.querySelectorAll('[id$="Modal"]');
    for (var i = modals.length - 1; i >= 0; i--) {
      var m = modals[i];
      if (!m.classList.contains('hidden') && m.style.display !== 'none') {
        var closeFn = modalCloseMap[m.id];
        if (closeFn && typeof window[closeFn] === 'function') {
          e.preventDefault();
          window[closeFn](e);
        }
        return;
      }
    }
  }
  document.addEventListener('keydown', onKeyDown);
})();
// === File Upload Handler ===
var EXCEL_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
var EXCEL_ALLOWED_TYPES = ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel'];
var EXCEL_ALLOWED_EXT = /\.xlsx?$/i;
function isExcelFileAllowed(file) {
  if (!file || !file.name) return false;
  if (file.size <= 0 || file.size > EXCEL_MAX_SIZE_BYTES) return false;
  var extOk = EXCEL_ALLOWED_EXT.test(file.name);
  var typeOk = EXCEL_ALLOWED_TYPES.indexOf(file.type) !== -1 || file.type === '' || file.type === 'application/octet-stream';
  return extOk && typeOk;
}
document.getElementById('fileInput').addEventListener('change', (e) => {
const file = e.target.files[0];
if (!file) return;
if (!isExcelFileAllowed(file)) {
  showToast('الرجاء رفع ملف إكسيل (.xlsx) بحجم لا يتجاوز 10 ميجابايت', 'error');
  e.target.value = '';
  return;
}
const reader = new FileReader();
reader.onload = async (evt) => {
if (typeof showLoadingOverlay === 'function') showLoadingOverlay('جاري تحميل الملف...');
try {
await loadScript('https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js');
var XLSX = typeof window.XLSX !== 'undefined' ? window.XLSX : null;
if (!XLSX) { showToast('تعذر تحميل أداة قراءة الإكسيل', 'error'); return; }
const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
const sheet = wb.Sheets[wb.SheetNames[0]];
// 1. Parse with formatting for robust Date Extraction
const rowsFormatted = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
// --- Robust Date Extraction (extracted to parseExcelDates for maintainability) ---
var dateResult = parseExcelDates(rowsFormatted);
reportStartDate = dateResult.minDate || null;
var periodText = dateResult.periodText || '';
var periodRangeEl = document.getElementById('periodRange');
if (periodRangeEl) periodRangeEl.innerText = periodText;
var headerPeriodRangeEl = document.getElementById('headerPeriodRange');
if (headerPeriodRangeEl) headerPeriodRangeEl.innerText = periodText;
if (periodText) localStorage.setItem('adora_rewards_periodText', periodText);
// ---- end date extraction ----
function parseExcelDates(rowsFormatted) {
// Matches YYYY-MM-DD (from Excel format) or DD/MM/YYYY (from text cells)
const datePattern = /(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)|(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/g;
let minDate = null;
let maxDate = null;
// Search for "التاريخ من" and "التاريخ الي" in ALL rows (not just first 20)
// التاريخ ممكن يتغير من صف إلى صف آخر
// First pass: Look for exact labels "التاريخ من" and "التاريخ الي" in ALL rows
logVerbose('🔍 Starting date extraction from Excel...');
rowsFormatted.forEach((row, rowIndex) => {
row.forEach((cell, cellIndex) => {
if (!cell) return;
const str = String(cell).trim();
const lowerStr = str.toLowerCase();
// Check for exact date labels
const isDateFrom = lowerStr.includes('التاريخ من') || lowerStr.includes('date from');
const isDateTo = lowerStr.includes('التاريخ الي') || lowerStr.includes('التاريخ إلى') || lowerStr.includes('date to');
if (isDateFrom || isDateTo) {
logVerbose('📍 Found date label at row', rowIndex, 'cell', cellIndex, ':', str);
// Apply same logic as employee name extraction: search ALL cells in the row
// But prioritize dates CLOSER to the label in the CORRECT direction
let foundDate = false;
let closestDate = null;
let closestDistance = Infinity;
// Search ALL cells in the same row (like employee name extraction does)
row.forEach((cell, i) => {
if (!cell) return;
const cellStr = String(cell).trim();
const distance = Math.abs(i - cellIndex); // Distance from label
// Skip if too far (more than 30 cells away) - prioritize closer dates
if (distance > 30) return;
// Determine direction: BEFORE (left) or AFTER (right) the label
const isBefore = i < cellIndex;
const isAfter = i > cellIndex;
logVerbose('  Checking cell', i, '(distance:', distance, isBefore ? 'BEFORE' : isAfter ? 'AFTER' : 'SAME', '):', cellStr.substring(0, 50));
let iso = null;
// Pattern 1: Standard date formats (YYYY-MM-DD or DD/MM/YYYY, with optional time)
const dateMatches = cellStr.match(datePattern);
if (dateMatches && dateMatches.length > 0) {
iso = dateMatches[0];
// Remove time part if exists (e.g., "00:00 2026-01-01" -> "2026-01-01")
// Handle both formats: "00:00 2026-01-01" and "2026-01-01 00:00"
if (iso.includes(' ')) {
const parts = iso.split(' ');
// Check if first part is time (HH:MM) or date
if (parts[0].includes(':') && parts[1] && parts[1].match(/\d{4}-\d{2}-\d{2}/)) {
iso = parts[1]; // Take date part
} else if (parts[0].match(/\d{4}-\d{2}-\d{2}/)) {
iso = parts[0]; // Take date part
}
}
if (iso.includes('/')) {
const parts = iso.split('/');
if (parts.length === 3) iso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
}
} else {
// Pattern 2: Excel date serial number
const excelDateMatch = cellStr.match(/^(\d{5,})$|^(\d{4,5}\.\d+)$/);
if (excelDateMatch) {
const serial = parseFloat(excelDateMatch[0]);
if (serial > 40000 && serial < 50000) {
const excelDate = new Date((serial - 25569) * 86400 * 1000);
const year = excelDate.getFullYear();
if (year === 2026) {
const month = String(excelDate.getMonth() + 1).padStart(2, '0');
const day = String(excelDate.getDate()).padStart(2, '0');
iso = `${year}-${month}-${day}`;
logVerbose('  📅 Parsed Excel serial', serial, 'to date:', iso);
}
}
}
}
if (iso) {
// Verify date is in 2026 to avoid wrong dates
const dateYear = iso.split('-')[0];
if (dateYear === '2026') {
// Prioritize dates based on label position:
// - "التاريخ من" should prefer dates BEFORE it (left side) - closest BEFORE
// - "التاريخ الي" should prefer dates AFTER it (right side) - closest AFTER
let shouldUse = false;
if (isDateFrom) {
// For "التاريخ من", ONLY use dates BEFORE the label
if (isBefore) {
// This date is before label - use it if no date before was found yet, or if this is closer
if (closestDate === null) {
shouldUse = true;
} else {
// Check if current closest date is also before
const currentIsBefore = row.findIndex((c, idx) => 
idx < cellIndex && c && String(c).includes(closestDate)) < cellIndex;
if (currentIsBefore) {
// Both are before - use the closer one
shouldUse = distance < closestDistance;
} else {
// Current is after, this is before - always prefer this
shouldUse = true;
}
}
} else {
// This date is after label - NEVER use it for "التاريخ من"
shouldUse = false;
}
} else if (isDateTo) {
// For "التاريخ الي", prefer dates BEFORE the label (left side)
// In Excel, "التاريخ الي" is on the right, date is on the left (same as "التاريخ من")
if (isBefore) {
// This date is before label - use it if no date before was found yet, or if this is closer
if (closestDate === null) {
shouldUse = true;
} else {
// Check if current closest date is also before
const currentIsBefore = row.findIndex((c, idx) => 
idx < cellIndex && c && String(c).includes(closestDate)) < cellIndex;
if (currentIsBefore) {
// Both are before - use the closer one
shouldUse = distance < closestDistance;
} else {
// Current is after, this is before - always prefer this
shouldUse = true;
}
}
} else {
// This date is after label - NEVER use it for "التاريخ الي"
shouldUse = false;
}
}
// If should use, update
if (shouldUse) {
closestDate = iso;
closestDistance = distance;
logVerbose('  ✅ Found', isDateFrom ? 'minDate' : 'maxDate', 'candidate in cell', i, ':', iso);
}
}
}
});
// Use the closest date found
if (closestDate) {
logVerbose('  ✅ Using closest', isDateFrom ? 'minDate' : 'maxDate', ':', closestDate, '(distance:', closestDistance, ')');
if (isDateFrom && !minDate) {
minDate = closestDate;
foundDate = true;
}
if (isDateTo && !maxDate) {
maxDate = closestDate;
foundDate = true;
}
}
// If not found in same row, check next row same column and adjacent columns (±5)
if ((isDateFrom && !minDate) || (isDateTo && !maxDate)) {
if (rowIndex + 1 < rowsFormatted.length) {
const nextRow = rowsFormatted[rowIndex + 1];
// Check same column and adjacent columns (±5) - increased range
for (let colOffset = -5; colOffset <= 5; colOffset++) {
const checkCol = cellIndex + colOffset;
if (checkCol >= 0 && checkCol < nextRow.length && nextRow[checkCol]) {
const nextRowStr = String(nextRow[checkCol]).trim();
logVerbose('  Checking next row, column', checkCol, ':', nextRowStr.substring(0, 50));
let iso = null;
// Try standard date patterns
const dateMatches = nextRowStr.match(datePattern);
if (dateMatches && dateMatches.length > 0) {
iso = dateMatches[0];
iso = iso.split(' ')[0];
if (iso.includes('/')) {
const parts = iso.split('/');
if (parts.length === 3) iso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
}
} else {
// Try Excel date serial number
const excelDateMatch = nextRowStr.match(/^(\d{5,})$|^(\d{4,5}\.\d+)$/);
if (excelDateMatch) {
const serial = parseFloat(excelDateMatch[0]);
if (serial > 40000 && serial < 50000) {
const excelDate = new Date((serial - 25569) * 86400 * 1000);
const year = excelDate.getFullYear();
if (year === 2026) {
const month = String(excelDate.getMonth() + 1).padStart(2, '0');
const day = String(excelDate.getDate()).padStart(2, '0');
iso = `${year}-${month}-${day}`;
logVerbose('  📅 Parsed Excel serial', serial, 'to date:', iso);
}
}
}
}
if (iso) {
// Verify date is in 2026 to avoid wrong dates
const dateYear = iso.split('-')[0];
if (dateYear !== '2026') {
logVerbose('  ⚠️ Skipping date not in 2026:', iso);
continue; // Skip dates not in 2026
}
logVerbose('  ✅ Found', isDateFrom ? 'minDate' : 'maxDate', 'in next row:', iso);
if (isDateFrom && !minDate) {
minDate = iso;
foundDate = true;
break;
}
if (isDateTo && !maxDate) {
maxDate = iso;
foundDate = true;
break;
}
}
}
}
// Also check previous row (in case date is above the label) - expanded range
if (rowIndex > 0 && ((isDateFrom && !minDate) || (isDateTo && !maxDate))) {
const prevRow = rowsFormatted[rowIndex - 1];
logVerbose('  Checking previous row (row', rowIndex - 1, ') around column', cellIndex, '...');
// Expanded range: check ±10 columns around the label position
for (let colOffset = -10; colOffset <= 10; colOffset++) {
const checkCol = cellIndex + colOffset;
if (checkCol >= 0 && checkCol < prevRow.length && prevRow[checkCol]) {
const prevRowStr = String(prevRow[checkCol]).trim();
logVerbose('  Checking previous row, column', checkCol, ':', prevRowStr.substring(0, 50));
let iso = null;
// Try standard date patterns
const dateMatches = prevRowStr.match(datePattern);
if (dateMatches && dateMatches.length > 0) {
iso = dateMatches[0];
iso = iso.split(' ')[0];
if (iso.includes('/')) {
const parts = iso.split('/');
if (parts.length === 3) iso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
}
} else {
// Try Excel date serial number
const excelDateMatch = prevRowStr.match(/^(\d{5,})$|^(\d{4,5}\.\d+)$/);
if (excelDateMatch) {
const serial = parseFloat(excelDateMatch[0]);
if (serial > 40000 && serial < 50000) {
const excelDate = new Date((serial - 25569) * 86400 * 1000);
const year = excelDate.getFullYear();
if (year === 2026) {
const month = String(excelDate.getMonth() + 1).padStart(2, '0');
const day = String(excelDate.getDate()).padStart(2, '0');
iso = `${year}-${month}-${day}`;
logVerbose('  📅 Parsed Excel serial', serial, 'to date:', iso);
}
}
}
}
if (iso) {
const dateYear = iso.split('-')[0];
if (dateYear === '2026') {
logVerbose('  ✅ Found', isDateFrom ? 'minDate' : 'maxDate', 'in previous row:', iso);
if (isDateFrom && !minDate) {
minDate = iso;
foundDate = true;
break;
}
if (isDateTo && !maxDate) {
maxDate = iso;
foundDate = true;
break;
}
}
}
}
}
}
}
}
if (!foundDate) {
logVerbose('  ❌ No date found near', str, 'at row', rowIndex, 'cell', cellIndex);
}
}
});
});
// Second pass: If still not found, search for "من" and "إلى" ONLY in header rows (first 30 rows)
// This prevents extracting dates from data rows
if (!minDate || !maxDate) {
logVerbose('⚠️ First pass did not find dates, trying second pass...');
const headerRows = rowsFormatted.slice(0, 30); // Only search in first 30 rows (header area)
headerRows.forEach((row, rowIndex) => {
const rowStr = row.join(' ').toLowerCase();
const hasFrom = rowStr.includes('من') && !rowStr.includes('التاريخ من');
const hasTo = (rowStr.includes('إلى') || rowStr.includes('الى')) && !rowStr.includes('التاريخ الي') && !rowStr.includes('التاريخ إلى');
if (hasFrom || hasTo) {
logVerbose('📍 Found "من" or "إلى" in row', rowIndex, ':', rowStr.substring(0, 100));
row.forEach((cell, cellIndex) => {
if (!cell) return;
const str = String(cell).trim();
const matches = str.match(datePattern);
if (matches && matches.length > 0) {
let iso = matches[0];
if (iso.includes('/')) {
const parts = iso.split('/');
if (parts.length === 3) iso = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
}
// Verify date is in 2026 (current year) to avoid wrong dates
const dateYear = iso.split('-')[0];
if (dateYear !== '2026') {
logVerbose('⚠️ Skipping date not in 2026:', iso);
return; // Skip dates not in 2026
}
// Check if this date is near "من" or "إلى" in the row
const cellLower = str.toLowerCase();
const isNearFrom = hasFrom && (cellLower.includes('من') || (cellIndex > 0 && String(row[cellIndex - 1] || '').toLowerCase().includes('من')));
const isNearTo = hasTo && (cellLower.includes('إلى') || cellLower.includes('الى') || (cellIndex > 0 && String(row[cellIndex - 1] || '').toLowerCase().includes('إلى')));
if (isNearFrom && !minDate) {
minDate = iso;
logVerbose('✅ Found minDate in second pass:', iso);
}
if (isNearTo && !maxDate) {
maxDate = iso;
logVerbose('✅ Found maxDate in second pass:', iso);
}
}
});
}
});
}
logVerbose('📊 Final dates - minDate:', minDate, 'maxDate:', maxDate);
// Update Print Report Directly
let periodText = ""; // Empty by default - will show nothing if no dates found
// Debug: Check if dates are found but not properly set
if (!minDate && !maxDate) {
logVerbose('❌ Both minDate and maxDate are null');
} else if (!minDate) {
logVerbose('⚠️ minDate is null, but maxDate is:', maxDate);
} else if (!maxDate) {
logVerbose('⚠️ maxDate is null, but minDate is:', minDate);
}
if (minDate && maxDate) {
// Format dates as DD-MM-YYYY
const formatDate = (isoDate) => {
const parts = isoDate.split('-');
if (parts.length === 3) {
return `${parts[2]}-${parts[1]}-${parts[0]}`;
}
return isoDate;
};
periodText = `من ${formatDate(minDate)} إلى ${formatDate(maxDate)}`;
reportStartDate = minDate; // Store start date for report month name
logVerbose('✅ Dates found - Period:', periodText, 'minDate:', minDate, 'maxDate:', maxDate);
} else if (minDate) {
const formatDate = (isoDate) => {
const parts = isoDate.split('-');
if (parts.length === 3) {
return `${parts[2]}-${parts[1]}-${parts[0]}`;
}
return isoDate;
};
periodText = `من ${formatDate(minDate)}`;
reportStartDate = minDate; // Store start date for report month name
logVerbose('⚠️ Only minDate found - Period:', periodText, 'minDate:', minDate);
} else {
// If no dates found, leave empty - DO NOT extract dates randomly from data
logVerbose('❌ No dates found near "التاريخ من" or "التاريخ الي" labels');
}
return { periodText: periodText, minDate: minDate, maxDate: maxDate };
}
// -----------------------------
// 2. Parse as RAW for reliable Data Processing (numbers as numbers)
const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
await processData(rowsRaw);
if (db.length > 0) {
  showToast('✅ تم تحميل البيانات بنجاح');
} else {
  showToast('الرجاء رفع ملف تقرير إحصائيات الموظفين بصيغة اكسيل', 'error');
}
} catch (error) {
console.error(error);
showToast('❌ خطأ في قراءة الملف: ' + error.message, 'error');
} finally {
if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
}
};
reader.readAsArrayBuffer(file);
});
// === Data Processing ===
// Firebase-First: عند رفع ملف جديد، نجلب الفترة الحالية من Firebase دائماً (حتى لو localStorage فيه بيانات) ثم ندمج: نحدث count فقط من الإكسيل، وباقي البيانات (تقييمات، حضور، خصومات) تبقى من Firebase.
async function processData(rows) {
// Firebase-First: جلب البيانات الحالية من Firebase دائماً
let oldDb = [];
if (typeof reportStartDate === 'string' && reportStartDate && /^\d{4}-\d{2}-\d{2}/.test(reportStartDate)) {
try {
logVerbose('🔄 جاري جلب الفترة الحالية من Firebase للدمج مع الإكسيل...');
if (typeof initializeFirebase === 'function') initializeFirebase();
var waitStart = Date.now();
while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < 5000) {
await new Promise(function (r) { setTimeout(r, 150); });
}
var periodId = reportStartDate.substring(0, 7).replace('-', '_');
var data = null;
// محاولة 1: periods/periodId.json (نسخة ثابتة للفترة)
if (typeof fetchPeriodFromFirebase === 'function') data = await fetchPeriodFromFirebase(periodId);
// محاولة 2: live.json (آخر نسخة محدثة)
if (!data || !Array.isArray(data.db) || data.db.length === 0) {
if (typeof fetchLivePeriodFromFirebase === 'function') data = await fetchLivePeriodFromFirebase();
}
if (data && Array.isArray(data.db) && data.db.length > 0) {
oldDb = data.db;
if (data.negativeRatingsCount && typeof data.negativeRatingsCount === 'object') {
  try {
    branchNegativeRatingsCount = data.negativeRatingsCount;
    if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
  } catch (_) {}
  if (typeof updateNegativeRatingsHeader === 'function') updateNegativeRatingsHeader();
}
if (Array.isArray(data.discounts)) {
  try { localStorage.setItem('adora_rewards_discounts', JSON.stringify(data.discounts)); } catch (_) {}
}
if (Array.isArray(data.discountTypes)) {
  try { localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(data.discountTypes)); } catch (_) {}
}
// طوال ما الفترة مفتوحة: إدخالات الإداريين (تقييمات، حضور، خصومات، سلبية) من live.json — نستكمل بها دائماً عند رفع ملف جديد
if (oldDb.length > 0 && typeof window.fetchLivePeriodFromFirebase === 'function') {
  try {
    var liveData = await window.fetchLivePeriodFromFirebase();
    if (liveData && Array.isArray(liveData.db) && liveData.db.length > 0) {
      if (typeof window.mergeEvaluationsFromSourceIntoDb === 'function') {
        var enriched = window.mergeEvaluationsFromSourceIntoDb(oldDb, liveData.db);
        if (enriched > 0) logVerbose('✅ تم استكمال إدخالات الإداريين من live.json للدمج مع الإكسيل:', enriched, 'حقل');
      }
      if (!(branchNegativeRatingsCount && Object.keys(branchNegativeRatingsCount).length > 0) && liveData.negativeRatingsCount && typeof liveData.negativeRatingsCount === 'object') {
        branchNegativeRatingsCount = liveData.negativeRatingsCount;
        if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
        if (typeof updateNegativeRatingsHeader === 'function') updateNegativeRatingsHeader();
      }
      if (Array.isArray(liveData.discounts) && (!data.discounts || data.discounts.length === 0)) {
        try { localStorage.setItem('adora_rewards_discounts', JSON.stringify(liveData.discounts)); } catch (_) {}
      }
      if (Array.isArray(liveData.discountTypes) && (!data.discountTypes || data.discountTypes.length === 0)) {
        try { localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(liveData.discountTypes)); } catch (_) {}
      }
    }
  } catch (_) {}
}
logVerbose('✅ تم جلب البيانات الحالية من Firebase:', oldDb.length, 'موظف (سيتم دمج: تحديث count فقط، الباقي يبقى)');
}
} catch (e) {
console.warn('⚠️ فشل جلب البيانات من Firebase:', e.message || e);
}
}

// احتياطي: لو Firebase فشل أو لا توجد فترة، نحاول localStorage كـ cache
if (oldDb.length === 0) {
try {
const savedDb = localStorage.getItem('adora_rewards_db');
if (savedDb) {
oldDb = JSON.parse(savedDb);
if (!Array.isArray(oldDb)) oldDb = [];
else logVerbose('⚠️ استخدام البيانات من localStorage (cache) — Firebase لم يُحمّل:', oldDb.length, 'employees');
}
} catch (error) {
console.error('❌ Error loading from localStorage:', error);
}
}

// Create a map of old employees by name+branch for quick lookup
const oldEmployeesMap = new Map();
oldDb.forEach(emp => {
const key = `${emp.name}|${emp.branch}`;
oldEmployeesMap.set(key, emp);
});

// Parse new data from Excel file
const newEmployees = [];
branches = new Set();
let currentBranch = "تجاهل";
const skipKeywords = ["نشاط", "تاريخ", "طبع", "بواسطة", "إجمالي", "المجموع", "SAR", "/", "إليت"];
const branchNames = ["الكورنيش", "الأندلس", "الاندلس", "حفر", "الباطن"];
rows.forEach((row) => {
const rowStr = row.join(' ');
// Detect branch
if (rowStr.includes("إليت")) {
if (rowStr.includes("الكورنيش")) currentBranch = "الكورنيش";
else if (rowStr.includes("الاندلس") || rowStr.includes("الأندلس")) currentBranch = "الأندلس";
else if (rowStr.includes("حفر") || rowStr.includes("الباطن")) currentBranch = "تجاهل";
}
if (currentBranch === "تجاهل") return;
let name = "", count = 0;
row.forEach(cell => {
const val = String(cell || "").trim();
const num = parseInt(val);
// Extract booking count
if (!val.includes("/") && !val.includes(".") && val.length < 4 && !isNaN(num) && num >= 10) {
count = num;
}
// Extract employee name (take FIRST valid name, not last)
// Skip if it's a branch name or contains skip keywords
const isBranchName = branchNames.some(b => val === b || val.includes(b));
const hasSkipKeyword = skipKeywords.some(k => val.includes(k));
if (!name && isNaN(val) && val.length > 3 && !hasSkipKeyword && !isBranchName && !val.includes("إليت")) {
name = val.split(' ').slice(0, 2).join(' ');
}
});
if (name && count >= 10) {
newEmployees.push({ name, count, branch: currentBranch });
branches.add(currentBranch);
}
});

// Merge old and new data — لا نمسح أبداً إدخالات المشرف (تقييمات) ولا HR (حضور) ولا الخصومات؛ تُمسح فقط عند إغلاق الفترة
db = [];
// Update window.db
if (typeof window !== 'undefined') {
  window.db = db;
}
let updatedCount = 0;
let newCount = 0;
newEmployees.forEach(newEmp => {
const key = `${newEmp.name}|${newEmp.branch}`;
const oldEmp = oldEmployeesMap.get(key);
  
if (oldEmp) {
// موظف موجود قديماً: نحدّث رقم الحجوزات من الملف فقط، ونبقي كل إدخالات المشرف وHR والخصومات كما هي
const employeeCode = getOrCreateEmployeeCode(newEmp.name);
const mergedEmp = {
...oldEmp, // كل بيانات الإداري: تقييمات، تم/لم يتم، أيام المتكررين، إلخ
count: newEmp.count, // من الملف الجديد فقط
employeeCode: employeeCode
// لا نعيد حساب totalAttendanceDays ولا attendance26Days — نُبقي ما أدخله الإداري كما هو
};
db.push(mergedEmp);
// Update window.db
if (typeof window !== 'undefined') {
  window.db = db;
}
updatedCount++;
logVerbose('✅ Updated employee:', newEmp.name, '(', newEmp.branch, ')', {
oldCount: oldEmp.count,
newCount: newEmp.count,
hasEvaluations: !!(oldEmp.evaluationsBooking || oldEmp.evaluationsGoogle),
evaluationsBooking: oldEmp.evaluationsBooking || 0,
evaluationsGoogle: oldEmp.evaluationsGoogle || 0,
hasAttendanceDays: !!(oldEmp.attendanceDaysPerBranch && Object.keys(oldEmp.attendanceDaysPerBranch || {}).length > 0)
});
} else {
// New employee: add with all data from new file
const employeeCode = getOrCreateEmployeeCode(newEmp.name);
db.push({
...newEmp,
id: crypto.randomUUID(),
employeeCode: employeeCode,
evaluations: 0,
evaluationsBooking: 0,
evaluationsGoogle: 0,
totalAttendanceDays: 0,
attendance26Days: false,
attendanceDaysPerBranch: {}
});
newCount++;
logVerbose('➕ Added new employee:', newEmp.name, '(', newEmp.branch, ')');
}
});
// Update window.db after all db updates
if (typeof window !== 'undefined') {
  window.db = db;
}
logVerbose('📊 Merge Summary:', updatedCount, 'updated,', newCount, 'new,', db.length, 'total');

// Employees in old data but not in new file are automatically excluded (deleted)
const deletedEmployees = oldDb.filter(oldEmp => {
const key = `${oldEmp.name}|${oldEmp.branch}`;
return !newEmployees.some(newEmp => `${newEmp.name}|${newEmp.branch}` === key);
});
if (deletedEmployees.length > 0) {
logVerbose('🗑️ Deleted employees (not in new file):', deletedEmployees.map(function(e) { return e.name + ' (' + e.branch + ')'; }).join(', '));
}
normalizeDuplicateAttendance(db);

// إذا لم نكن جلبنا التقييمات السلبية من Firebase (مثلاً بعد خروج ورفع ملف): جلبها الآن حتى لا تظهر أصفار
var hasNegativeRatings = typeof branchNegativeRatingsCount === 'object' && Object.keys(branchNegativeRatingsCount || {}).length > 0;
if (!hasNegativeRatings && db.length > 0) {
  try {
    if (typeof initializeFirebase === 'function') initializeFirebase();
    var waitStart = Date.now();
    while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < 5000) {
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    var periodId = (reportStartDate && /^\d{4}-\d{2}-\d{2}/.test(reportStartDate)) ? reportStartDate.substring(0, 7).replace('-', '_') : (new Date().getFullYear() + '_' + String(new Date().getMonth() + 1).padStart(2, '0'));
    var liveData = typeof fetchLivePeriodFromFirebase === 'function' ? await fetchLivePeriodFromFirebase() : null;
    if (!liveData || !liveData.negativeRatingsCount) liveData = typeof fetchPeriodFromFirebase === 'function' ? await fetchPeriodFromFirebase(periodId) : null;
    if (liveData && liveData.negativeRatingsCount && typeof liveData.negativeRatingsCount === 'object') {
      branchNegativeRatingsCount = liveData.negativeRatingsCount;
      if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
      if (typeof updateNegativeRatingsHeader === 'function') updateNegativeRatingsHeader();
    }
  } catch (_) {}
}

if (db.length > 0) {
// Save to localStorage — لا نمسح ولا نستبدل adora_rewards_discounts ولا adora_rewards_discountTypes؛ تبقى حتى إغلاق الفترة فقط
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
if (typeof window !== 'undefined') {
  window.db = db;
}
localStorage.setItem('adora_rewards_branches', JSON.stringify([...branches]));
if (typeof branchNegativeRatingsCount === 'object' && branchNegativeRatingsCount !== null) {
  try { localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(branchNegativeRatingsCount)); } catch (_) {}
}
localStorage.setItem('adora_rewards_evalRate', currentEvalRate.toString());
if (reportStartDate) {
localStorage.setItem('adora_rewards_startDate', reportStartDate);
}
if (typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
if (typeof initializeAdminTokensForPeriod === 'function') initializeAdminTokensForPeriod();
if (typeof saveAdminTokens === 'function') saveAdminTokens();
logVerbose('✅ Data saved to localStorage:', {
totalEmployees: db.length,
branches: [...branches],
sampleEmployee: db[0] ? { name: db[0].name, count: db[0].count, hasEvaluations: !!(db[0].evaluationsBooking || db[0].evaluationsGoogle) } : null
});
// Verify save was successful
const verify = localStorage.getItem('adora_rewards_db');
if (verify) {
const verifyData = JSON.parse(verify);
logVerbose('✅ Verification: localStorage contains', verifyData.length, 'employees');
} else {
console.error('❌ Verification failed: localStorage is empty after save!');
}
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
// التحقق من توفر localStorage دون كتابة مفاتيح (لا تلويث التخزين)
try {
  void localStorage.length;
  logVerbose('✅ localStorage is available and working');
} catch (storageError) {
  console.error('❌ localStorage is not available:', storageError);
  alert('⚠️ تحذير: لا يمكن حفظ البيانات. يرجى التحقق من إعدادات المتصفح (قد يكون في وضع التصفح الخاص أو محظور localStorage)');
}
}
// إظهار اللوحة فقط عند وجود بيانات (لا نُخفِي الرفع بعد خروج الأدمن — adora_admin_just_logged_out أو عدم وجود adora_rewards_db)
var hasStoredData = false;
try {
  var stored = localStorage.getItem('adora_rewards_db');
  if (stored) {
    var parsed = JSON.parse(stored);
    hasStoredData = Array.isArray(parsed) && parsed.length > 0;
  }
} catch (_) {}
if (!localStorage.getItem('adora_admin_just_logged_out') && hasStoredData) {
  var u = document.getElementById('uploadBox');
  var d = document.getElementById('dashboard');
  var a = document.getElementById('actionBtns');
  if (u) u.classList.add('hidden');
  if (d) d.classList.remove('hidden');
  if (a) a.style.display = 'flex';
  if (typeof loadCumulativePointsFromFirebase === 'function') {
    loadCumulativePointsFromFirebase().then(function () {
      if (typeof populateCumulativePointsCards === 'function') populateCumulativePointsCards();
    });
  }
  loadDataFromStorage();
  if (typeof updateFilters === 'function') updateFilters();
  if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
  if (typeof renderUI === 'function') renderUI(typeof currentFilter !== 'undefined' ? currentFilter : 'الكل');
}
updatePrintButtonText();
// Format date as YYYY/MM/DD in Arabic numerals
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth() + 1;
const day = now.getDate();
// Convert to Arabic-Indic numerals
const arabicNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
const toArabicNum = (num) => String(num).split('').map(d => arabicNumerals[parseInt(d)]).join('');
var reportDateEl = document.getElementById('reportDate');
if (reportDateEl) reportDateEl.innerText = `${toArabicNum(year)}/${toArabicNum(month)}/${toArabicNum(day)}`;
// Generate report month name from start date
function getMonthNameFromDate(dateString) {
if (!dateString) return '';
const months = [
'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];
try {
// Parse date (format: YYYY-MM-DD)
const parts = dateString.split('-');
if (parts.length === 3) {
const monthIndex = parseInt(parts[1]) - 1;
if (monthIndex >= 0 && monthIndex < 12) {
return months[monthIndex];
}
}
} catch (e) {
console.error('Error parsing date for month name:', e);
}
return '';
}
// Use month name from start date, or fallback to current month
const months = [
'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];
const reportMonthName = reportStartDate ? getMonthNameFromDate(reportStartDate) : months[month - 1];
const reportNumberEl = document.getElementById('reportNumber');
if (reportNumberEl) {
reportNumberEl.innerText = reportMonthName || `RPT-${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}-${Date.now().toString().slice(-4)}`;
}
updateFilters();
updatePrintButtonText();
renderUI('الكل');
}
}
// updateEvalRate function removed — rates are now configurable via SettingsPanel (rewardPricing)

// مصدر واحد لـ branchWinners و branchLosers — تُستدعى من getFooterTotals، renderUI، الطباعة، وحوافز الالتزام/التفوق
function computeBranchWinnersAndLosers(dataDb, branchesSet) {
  const branchWinners = {};
  const branchLosers = {};
  const arr = Array.isArray(branchesSet) ? branchesSet : [...(branchesSet || [])];
  arr.forEach(b => {
    branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
    branchLosers[b] = { net: {val: Infinity, ids: []}, eval: {val: Infinity, ids: []}, evalBooking: {val: Infinity, ids: []}, evalGoogle: {val: Infinity, ids: []}, book: {val: Infinity, ids: []} };
  });
  var _pricing = getPricingConfig();
  (dataDb || []).forEach(emp => {
    const evBooking = emp.evaluationsBooking || 0;
    const evGoogle = emp.evaluationsGoogle || 0;
    const totalEval = evBooking + evGoogle;
    const gross = computeGrossFromBreakdown(emp, _pricing);
    const fund = gross * getSupportFundRate();
    let net = gross - fund;
    const attendance26Days = emp.attendance26Days === true;
    net = net + (attendance26Days ? net * 0.25 : 0);
    const bw = branchWinners[emp.branch];
    const bl = branchLosers[emp.branch];
    if (!bw || !bl) return;
    if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
    else if (net === bw.net.val) { bw.net.ids.push(emp.id); }
    if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
    else if (evBooking === bw.eval.val) { bw.eval.ids.push(emp.id); }
    if (evBooking > bw.evalBooking.val) { bw.evalBooking.val = evBooking; bw.evalBooking.ids = [emp.id]; }
    else if (evBooking === bw.evalBooking.val) { bw.evalBooking.ids.push(emp.id); }
    if (evGoogle > bw.evalGoogle.val) { bw.evalGoogle.val = evGoogle; bw.evalGoogle.ids = [emp.id]; }
    else if (evGoogle === bw.evalGoogle.val) { bw.evalGoogle.ids.push(emp.id); }
    if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
    else if (emp.count === bw.book.val) { bw.book.ids.push(emp.id); }
    const empNameCount = (dataDb || []).filter(e => e.name === emp.name).length;
    let empAttendanceDays = attendance26Days ? 26 : 0;
    if (empNameCount > 1) empAttendanceDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
    if (empAttendanceDays >= 26) {
      let isHighestDays = true;
      (dataDb || []).filter(e => e.branch === emp.branch).forEach(otherEmp => {
        if (otherEmp.name === emp.name) return;
        const otherNameCount = (dataDb || []).filter(e => e.name === otherEmp.name).length;
        let otherDays = otherEmp.attendance26Days === true ? 26 : 0;
        if (otherNameCount > 1) otherDays = otherEmp.totalAttendanceDays || (otherEmp.attendance26Days === true ? 26 : 0);
        if (otherDays > empAttendanceDays) isHighestDays = false;
      });
      if (isHighestDays) {
        if (bw.attendance.val === -1) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
        else if (empAttendanceDays > bw.attendance.val) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
        else if (empAttendanceDays === bw.attendance.val) { bw.attendance.ids.push(emp.id); }
      }
    }
    if (net > 0 && net < bl.net.val) { bl.net.val = net; bl.net.ids = [emp.id]; }
    else if (net > 0 && net === bl.net.val) { bl.net.ids.push(emp.id); }
    if (totalEval < bl.eval.val || (totalEval === 0 && bl.eval.val > 0)) { bl.eval.val = totalEval; bl.eval.ids = [emp.id]; }
    else if (totalEval === bl.eval.val) { bl.eval.ids.push(emp.id); }
    if (evBooking < bl.evalBooking.val || (evBooking === 0 && bl.evalBooking.val > 0)) { bl.evalBooking.val = evBooking; bl.evalBooking.ids = [emp.id]; }
    else if (evBooking === bl.evalBooking.val) { bl.evalBooking.ids.push(emp.id); }
    if (evGoogle < bl.evalGoogle.val || (evGoogle === 0 && bl.evalGoogle.val > 0)) { bl.evalGoogle.val = evGoogle; bl.evalGoogle.ids = [emp.id]; }
    else if (evGoogle === bl.evalGoogle.val) { bl.evalGoogle.ids.push(emp.id); }
    if (emp.count > 0 && emp.count < bl.book.val) { bl.book.val = emp.count; bl.book.ids = [emp.id]; }
    else if (emp.count > 0 && emp.count === bl.book.val) { bl.book.ids.push(emp.id); }
  });
  return { branchWinners, branchLosers };
}

// مصدر واحد للإجماليات: دالة واحدة تُرجع كل القيم للكروت والتذييل (لا نسخ من DOM)
function getFooterTotals() {
  let filtered = [...db];
  if (currentFilter !== 'الكل') filtered = filtered.filter(d => d.branch === currentFilter);
  const { branchWinners } = computeBranchWinnersAndLosers(db, branches);
  var _pricing = getPricingConfig();
  let totalFund = 0, totalNet = 0, totalEval = 0, totalNetNoEval = 0;
  let statEmployees = 0, statBookings = 0;
  if (currentFilter === 'الكل') {
    const seenNames = new Set();
    filtered.forEach(emp => {
      if (seenNames.has(emp.name)) return;
      seenNames.add(emp.name);
      statEmployees += 1;
      const allEmpBranches = db.filter(e => e.name === emp.name);
      statBookings += allEmpBranches.reduce((s, b) => s + (b.count || 0), 0);
      let empFund = 0, totalNetFromBranches = 0, hasExcellence = false, hasCommitment = false;
      // For duplicates: determine which branch gets the 25% challenge bonus (same logic as calcStats)
      let challengeRowId = null;
      if (allEmpBranches.length > 1) {
        let maxChallengeTotalAmount = -1;
        allEmpBranches.forEach(e => {
          const eGross = computeGrossFromBreakdown(e, _pricing);
          const eFund = eGross * getSupportFundRate();
          let eNet = eGross - eFund;
          const eAtt = e.attendance26Days === true;
          const eBonus = eAtt ? eNet * 0.25 : 0;
          eNet = eNet + eBonus;
          if (eAtt && eBonus > 0 && eNet > maxChallengeTotalAmount) {
            maxChallengeTotalAmount = eNet;
            challengeRowId = e.id;
          }
        });
      }
      allEmpBranches.forEach(branchEmp => {
        const gross = computeGrossFromBreakdown(branchEmp, _pricing);
        const fund = gross * getSupportFundRate();
        let branchNet = gross - fund;
        const attendance26Days = branchEmp.attendance26Days === true;
        // For duplicates: only apply 25% to the selected branch; for singles: apply normally
        const applyChallenge = allEmpBranches.length > 1 ? (challengeRowId === branchEmp.id && attendance26Days) : attendance26Days;
        branchNet = branchNet + (applyChallenge ? branchNet * 0.25 : 0);
        empFund += fund;
        totalNetFromBranches += branchNet;
        const bw = branchWinners[branchEmp.branch];
        if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0 && bw.eval.val > 0) hasExcellence = true;
        if (bw && attendance26Days && (bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0 || bw.book.ids.includes(branchEmp.id) && bw.book.val > 0)) hasCommitment = true;
      });
      totalFund += empFund;
      let duplicateFinalNet = totalNetFromBranches + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
      if (typeof getTotalDiscountForEmployee === 'function') duplicateFinalNet = Math.max(0, duplicateFinalNet - getTotalDiscountForEmployee(emp.name));
      totalNet += duplicateFinalNet;
      allEmpBranches.forEach(b => {
        totalEval += (b.evaluationsBooking || 0) + (b.evaluationsGoogle || 0);
        var r = b.count > 100 ? 3 : (b.count > 50 ? 2 : 1);
        totalNetNoEval += (b.count * r) * 0.85;
      });
    });
  } else {
    statEmployees = filtered.length;
    statBookings = filtered.reduce((s, emp) => s + (emp.count || 0), 0);
    var _pricingStats = getPricingConfig();
    filtered.forEach(emp => {
      const evBooking = emp.evaluationsBooking || 0;
      const evGoogle = emp.evaluationsGoogle || 0;
      const empTotalEval = evBooking + evGoogle;
      const gross = computeGrossFromBreakdown(emp, _pricingStats);
      const fund = gross * getSupportFundRate();
      let net = gross - fund;
      const attendance26Days = emp.attendance26Days === true;
      net = net + (attendance26Days ? net * 0.25 : 0);
      // Gross without evaluations for "net without eval" stat
      var grossNoEval = gross - (evBooking * (_pricingStats.rateEvalBooking || 0)) - (evGoogle * (_pricingStats.rateEvalGoogle || 0));
      totalNetNoEval += grossNoEval * 0.85;
      totalFund += fund;
      const hasExcellenceBonus = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0 && branchWinners[emp.branch].eval.val > 0;
      const excellenceBonus = hasExcellenceBonus ? 50 : 0;
      const isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
      const isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
      const hasCommitmentBonus = attendance26Days && (isMostEval || isMostBook);
      const commitmentBonus = hasCommitmentBonus ? 50 : 0;
      let employeeFinalNet = net + excellenceBonus + commitmentBonus;
      if (typeof getDiscountForEmployeeInBranch === 'function') {
        let employeeDiscount = getDiscountForEmployeeInBranch(emp.name, net);
        const applyHotelHere = typeof getBranchWithMaxNegativeRatingsForEmployee === 'function' && getBranchWithMaxNegativeRatingsForEmployee(emp.name) === emp.branch;
        if (typeof getHotelRatingDeductionForEmployee === 'function' && applyHotelHere) employeeDiscount += getHotelRatingDeductionForEmployee(emp.name);
        employeeFinalNet = Math.max(0, employeeFinalNet - employeeDiscount);
      }
      totalNet += employeeFinalNet;
      totalEval += empTotalEval;
    });
  }
  const safeTotalNet = isNaN(totalNet) || !isFinite(totalNet) ? 0 : totalNet;
  const safeTotalFund = isNaN(totalFund) || !isFinite(totalFund) ? 0 : totalFund;
  const finalTotal = safeTotalNet + safeTotalFund;
  return { statEmployees, statBookings, totalFund, totalNet, totalEval, totalNetNoEval, finalTotal };
}

// updateFooterTotals، updateBreakdownFooterTotals، updateFooterSummaryColspans معرّفات في rewards-table.js

// updateEvalBooking و updateEvalGoogle معرّفتان في rewards-table.js

// تطبيع أيام الحضور للموظف المتكرر بعد التحميل: كائن واحد مشترك لكل الاسم حتى لا يبقى كل صف له كائن منفصل
function normalizeDuplicateAttendance(dataDb) {
  if (!Array.isArray(dataDb)) return;
  const nameToRows = {};
  dataDb.forEach((emp) => {
    if (!nameToRows[emp.name]) nameToRows[emp.name] = [];
    nameToRows[emp.name].push(emp);
  });
  Object.keys(nameToRows).forEach((name) => {
    const rows = nameToRows[name];
    if (rows.length <= 1) return;
    const sharedMap = {};
    rows.forEach((emp) => {
      const b = emp.branch;
      const val = (emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[b] !== undefined)
        ? emp.attendanceDaysPerBranch[b]
        : (emp.totalAttendanceDays !== undefined ? emp.totalAttendanceDays : (emp.attendance26Days === true ? 26 : 0));
      if (val !== undefined && val !== '') sharedMap[b] = typeof val === 'number' ? val : (parseInt(val, 10) || 0);
    });
    const totalDays = Object.values(sharedMap).reduce((s, d) => s + (parseInt(d, 10) || 0), 0);
    rows.forEach((emp) => {
      emp.attendanceDaysPerBranch = sharedMap;
      emp.totalAttendanceDays = totalDays;
      emp.attendance26Days = totalDays >= 26;
    });
  });
}

// Function to update attendance days for duplicate employees
// Handle attendance days input for single branch (one number only - can be any number: 8, 22, 30, etc.)
function handleAttendanceDaysInputSingle(inputElement, empName, branchName) {
// Get current value
let value = inputElement.value;
// Remove any characters that are not digits (allows ANY number: odd, even, single-digit, multi-digit)
value = value.replace(/[^0-9]/g, '');
// Update input value
inputElement.value = value;
// Update attendance days for this specific branch (allows ANY number: odd or even, single or multi-digit)
// Store current cursor position to restore after update
const cursorPos = inputElement.selectionStart;
// For duplicates: update data but don't re-render during typing to avoid losing focus
// We'll re-render on blur instead
if (value !== '') {
const numValue = parseInt(value) || 0;
// Accept ANY number (odd or even) - no restrictions
// Pass false to prevent re-render during typing (will re-render on blur)
updateAttendanceDaysForBranch(empName, branchName, numValue, false);
// Restore cursor position
setTimeout(() => {
inputElement.setSelectionRange(cursorPos, cursorPos);
}, 0);
} else {
// If empty, set to 0
updateAttendanceDaysForBranch(empName, branchName, 0, false);
}
}
// Handle attendance days input on blur (when user finishes typing)
// لا نستدعي renderUI هنا — نحدّث البيانات ثم نحدّث عرض الصف فقط لتجنّب فلاش وإعادة رسم الجدول (Tab/الماوس يعملان بسلاسة)
function handleAttendanceDaysBlur(inputElement, empName, branchName) {
  var value = inputElement.value;
  value = (value || '').replace(/[^0-9]/g, '');
  inputElement.value = value;
  var numValue = value !== '' ? (parseInt(value, 10) || 0) : 0;
  var oldVal = 0;
  var first = typeof db !== 'undefined' && db && db.filter(function (e) { return e.name === empName; })[0];
  if (first && first.attendanceDaysPerBranch && first.attendanceDaysPerBranch[branchName] !== undefined) {
    oldVal = parseInt(first.attendanceDaysPerBranch[branchName], 10) || 0;
  }
  updateAttendanceDaysForBranch(empName, branchName, numValue, false);
  patchAttendanceRowDisplay(inputElement, empName);
  if (typeof logAdminAction === 'function') {
    var role = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
    if (role) { logAdminAction(role, 'update_attendance_days', { employeeName: empName, branch: branchName, oldValue: oldVal, newValue: numValue }); }
  }
}

// تحديث عرض خلية الحضور في الصف فقط (تم/لم يتم + الـ checkbox) بدون إعادة رسم الجدول
function patchAttendanceRowDisplay(inputElement, empName) {
  var row = inputElement && inputElement.closest ? inputElement.closest('tr') : null;
  if (!row || typeof db === 'undefined') return;
  var firstEmp = db.filter(function (e) { return e.name === empName; })[0];
  if (!firstEmp) return;
  var totalDays = 0;
  if (firstEmp.attendanceDaysPerBranch && typeof firstEmp.attendanceDaysPerBranch === 'object') {
    totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce(function (sum, d) { return sum + (parseInt(d, 10) || 0); }, 0);
  }
  var done26 = totalDays >= 26;
  var toggle = row.querySelector('.attendance-toggle');
  var statusSpan = row.querySelector('.col-attendance .attendance-indicator span');
  if (toggle) {
    toggle.checked = !!done26;
  }
  if (statusSpan) {
    statusSpan.textContent = done26 ? 'تم' : 'لم يتم';
    statusSpan.className = (statusSpan.className || '').replace(/\btext-(green|red)-400\b/g, '').trim() + (done26 ? ' text-green-400' : ' text-red-400');
  }
  var totalDiv = row.querySelector('.col-attendance div.text-green-400.font-bold');
  if (totalDiv && totalDiv.textContent && totalDiv.textContent.indexOf('المجموع:') !== -1) {
    totalDiv.textContent = 'المجموع: ' + totalDays;
  }
}
// updateAttendanceDaysForBranch معرّفة في rewards-table.js

// ── Eval-input navigation: data-driven (survives renderUI DOM rebuilds) ──
// Instead of saving DOM references (which die on re-render), we save {empId, evalType}
// and locate the fresh input element after renderUI completes.

/** Resolve the NEXT eval target using data attributes (not DOM refs). */
function _resolveEvalTarget(currentInput, reverse) {
  var allInputs = Array.from(document.querySelectorAll('#mainTable .eval-input'));
  // Filter out inputs in badges-row
  allInputs = allInputs.filter(function(inp) {
    var tr = inp.closest('tr');
    return tr && !tr.classList.contains('badges-row');
  });
  var idx = allInputs.indexOf(currentInput);
  if (idx < 0) return null;
  var nextIdx = reverse ? idx - 1 : idx + 1;
  if (nextIdx < 0 || nextIdx >= allInputs.length) return null;
  var target = allInputs[nextIdx];
  return { empId: target.getAttribute('data-emp-id'), evalType: target.getAttribute('data-eval-type') };
}

/** Focus an eval input by empId + evalType. Returns true if focused. */
function _focusEvalByData(empId, evalType) {
  if (!empId) return false;
  var sel = '#mainTable .eval-input[data-emp-id="' + empId + '"][data-eval-type="' + evalType + '"]';
  var el = document.querySelector(sel);
  if (el) { el.focus(); el.select(); return true; }
  return false;
}

// Global: pending focus target after renderUI (set by handleEvalKey, consumed by restoreEvalFocus)
window._pendingEvalFocus = null;

/** Called after renderUI to restore focus to the pending target. */
function restoreEvalFocus() {
  var t = window._pendingEvalFocus;
  if (!t) return;
  window._pendingEvalFocus = null;
  requestAnimationFrame(function() {
    _focusEvalByData(t.empId, t.evalType);
  });
}

/** Debounced deferred refresh — runs renderUI + updateBadges ONCE after the user stops navigating for 800ms */
var _deferredEvalTimer = null;
var _tableEditSessionActive = false;
var _pendingTableRefreshAfterEdit = false;
function _isInsideTargetTable(node) {
  var table = document.getElementById('targetTable');
  return !!(table && node && table.contains(node));
}
function _isTableEditableTarget(node) {
  if (!node || !node.matches) return false;
  return node.matches('.eval-input, .attendance-days-input, .attendance-toggle, .negative-ratings-input');
}
function _markPendingTableRefreshAfterEdit() {
  _pendingTableRefreshAfterEdit = true;
}
function _flushPendingTableRefreshAfterEdit() {
  if (!_pendingTableRefreshAfterEdit) return;
  _pendingTableRefreshAfterEdit = false;
  updateBadges();
  if (typeof renderUI === 'function' && typeof currentFilter !== 'undefined') renderUI(currentFilter);
}
function _initTableEditSessionGuards() {
  if (typeof document === 'undefined' || document.__adoraTableEditGuardsInit) return;
  document.__adoraTableEditGuardsInit = true;
  document.addEventListener('focusin', function(e) {
    var t = e.target;
    if (_isTableEditableTarget(t) && _isInsideTargetTable(t)) {
      _tableEditSessionActive = true;
      return;
    }
    if (_tableEditSessionActive && !_isInsideTargetTable(t)) {
      _tableEditSessionActive = false;
      _flushPendingTableRefreshAfterEdit();
    }
  });
  // Mouse/touch outside table should also flush pending refresh once.
  document.addEventListener('pointerdown', function(e) {
    if (!_tableEditSessionActive) return;
    if (_isInsideTargetTable(e.target)) return;
    _tableEditSessionActive = false;
    setTimeout(_flushPendingTableRefreshAfterEdit, 0);
  });
}
_initTableEditSessionGuards();
function _scheduleDeferredEvalRefresh() {
  if (_deferredEvalTimer) clearTimeout(_deferredEvalTimer);
  _deferredEvalTimer = setTimeout(function() {
    _deferredEvalTimer = null;
    // Find currently focused input so we can restore it after refresh
    var focused = document.activeElement;
    var restoreTarget = null;
    if (focused && focused.classList && focused.classList.contains('eval-input')) {
      restoreTarget = { empId: focused.getAttribute('data-emp-id'), evalType: focused.getAttribute('data-eval-type') };
    }
    // أثناء جلسة التعديل داخل الجدول: أجّل الفرز/إعادة الرسم لحين الخروج من الجدول.
    if (_tableEditSessionActive) {
      _markPendingTableRefreshAfterEdit();
      return;
    }
    updateBadges();
    var filter = (typeof window !== 'undefined' && window.currentFilter !== undefined) ? window.currentFilter : currentFilter;
    if (typeof renderUI === 'function' && filter !== undefined) renderUI(filter);
    // Restore focus after DOM rebuild
    if (restoreTarget) {
      requestAnimationFrame(function() { _focusEvalByData(restoreTarget.empId, restoreTarget.evalType); });
    }
  }, 500);
}

/** Lightweight live refresh while typing evals: keep bonus/winner badges in sync without full table rebuild. */
var _liveEvalIndicatorsTimer = null;
function _scheduleLiveEvalIndicatorsRefresh() {
  if (_liveEvalIndicatorsTimer) clearTimeout(_liveEvalIndicatorsTimer);
  _liveEvalIndicatorsTimer = setTimeout(function() {
    _liveEvalIndicatorsTimer = null;
    try {
      // أثناء الكتابة: حدّث الحوافز فقط لتجنّب قفزات الصفوف الناتجة من إعادة بناء badges.
      if (typeof updateExcellenceBonusRow === 'function') updateExcellenceBonusRow();
    } catch (_) {}
  }, 120);
}

function handleEvalKey(e, currentInput) {
  if (e.key === 'Tab' || e.key === 'Enter' || e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    e.preventDefault();
    e.stopPropagation();
    var reverse = (e.key === 'Tab' && e.shiftKey) || e.key === 'ArrowLeft' || e.key === 'ArrowUp';
    var target = _resolveEvalTarget(currentInput, reverse);
    if (!target) return;
    // Mark navigation so onblur skips renderUI
    window._evalNavActive = true;
    // Blur current input (triggers onblur → save data only, NO renderUI)
    currentInput.blur();
    // Focus next input directly (DOM is still alive since renderUI was skipped)
    _focusEvalByData(target.empId, target.evalType);
  }
}
function updateAttendance(id, checked, toggleEl) {
const item = db.find(i => i.id === id);
if (!item) return;
// الكل للعرض والتجميع فقط — لا تعديل لأي أحد (بما فيه الأدمن)، التعديل في الفروع
if (typeof currentFilter !== 'undefined' && currentFilter === 'الكل') {
  showToast('❌ التعديل في الفروع فقط — الكل للعرض والتجميع', 'error');
  if (toggleEl) toggleEl.checked = item.attendance26Days === true;
  return;
}
var currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'hr' && currentRole !== 'admin') {
  showToast('❌ غير مصرح لك بتعديل الحضور', 'error');
  if (toggleEl) toggleEl.checked = item.attendance26Days === true;
  return;
}
const oldValue = item.attendance26Days === true;
item.attendance26Days = checked;
// للمتكرر: تفعيل المؤشر = كتابة 26 يوم — ليتطابق عرض «تم» في الكل
if (typeof updateAttendanceDaysForBranch === 'function' && db.filter(e => e.name === item.name).length > 1) {
  updateAttendanceDaysForBranch(item.name, item.branch, checked ? 26 : 0, false);
}
markLocalRewardsDirty();
// Log admin action
if (typeof logAdminAction === 'function' && currentRole) {
  logAdminAction(currentRole, 'update_attendance', {
    employeeName: item.name,
    employeeId: id,
    branch: item.branch,
    oldValue: oldValue,
    newValue: checked
  });
}
// Update toggle visual state
const label = toggleEl.closest('label');
const statusSpan = label.querySelector('span');
if (statusSpan) {
if (checked) {
statusSpan.className = 'ml-2 text-xs font-bold text-green-400';
statusSpan.innerText = 'تم';
} else {
statusSpan.className = 'ml-2 text-xs font-bold text-red-400';
statusSpan.innerText = 'لم يتم';
}
}
// Recalculate and update row
const row = toggleEl.closest('tr');
if (row) {
const { branchWinners } = computeBranchWinnersAndLosers(db, branches);
// Recalculate stats for this employee
const evBooking = item.evaluationsBooking || 0;
const evGoogle = item.evaluationsGoogle || 0;
const ev = evBooking + evGoogle; // Total evaluations (Booking + Google Maps)
// الحوافز الإضافية مرتبطة بعدد تقييمات Booking فقط
const hasExcellenceBonus = branchWinners[item.branch]?.book.ids.includes(item.id) && 
branchWinners[item.branch]?.eval.ids.includes(item.id) &&
branchWinners[item.branch].book.val > 0 && 
branchWinners[item.branch].eval.val > 0;
const excellenceBonus = hasExcellenceBonus ? 50 : 0;
// Check if this employee has commitment bonus
const isMostEval = branchWinners[item.branch]?.eval.ids.includes(item.id) && branchWinners[item.branch].eval.val > 0;
const isMostBook = branchWinners[item.branch]?.book.ids.includes(item.id) && branchWinners[item.branch].book.val > 0;
const hasCommitmentBonus = checked && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
const gross = computeGrossFromBreakdown(item);
const fund = gross * getSupportFundRate();
let net = gross - fund;
// Apply 25% bonus if employee completed 26 days, or 25% discount if not
const attendanceBonus = checked ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
// Update DOM
row.dataset.fund = fund;
row.dataset.net = net + excellenceBonus + commitmentBonus; // Include bonuses in net
row.dataset.eval = ev;
const fundCell = row.querySelector('.col-fund');
const netCell = row.querySelector('.col-net');
if (fundCell) fundCell.innerText = `-${fund.toFixed(1)}`;
if (netCell) {
let display = '';
const baseNet = gross - fund;
const finalNet = baseNet + attendanceBonus + excellenceBonus + commitmentBonus;
// Show final net (white) - الرقم الأبيض فقط بدون إضافات (الإضافات موجودة في تقرير الموظف)
display = `<span class="text-white print:text-black font-black">${finalNet.toFixed(2)}</span>`;
netCell.className = 'col-net p-2 text-left font-mono text-sm font-semibold text-white bg-white/[0.04] px-2 print:text-black number-display';
netCell.innerHTML = display;
}
}
// Update footer totals and stats immediately
updateFooterTotals();
updateDashboardStats();
// Update commitment bonus row immediately
updateCommitmentBonusRow();
// Update excellence bonus row immediately
updateExcellenceBonusRow();
// Update badges immediately for all rows
// Use requestAnimationFrame to ensure DOM is ready
requestAnimationFrame(() => {
updateBadges();
// Also update after a short delay to ensure badges are visible
setTimeout(() => {
updateBadges();
}, 100);
});
// Save to localStorage after update
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
if (typeof window !== 'undefined') {
  window.db = db;
}
if (typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
}
}
// === Filter Pills ===
function updateFilters() {
const container = document.getElementById('branchFilters');
let html = `
<button onclick="setFilter('الكل')" 
class="filter-pill active px-4 py-2 rounded-lg text-xs font-bold transition-all text-[#0a0e1a] shadow-[0_0_20px_rgba(64,224,208,0.3)]" 
data-filter="الكل">
الكل
</button>
`;
branches.forEach(b => {
  const bAttr = typeof escAttr === 'function' ? escAttr(b) : String(b).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const bHtml = typeof escHtml === 'function' ? escHtml(b) : String(b).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  html += `
<button onclick="setFilter('${bAttr}')" 
class="filter-pill px-4 py-2 rounded-lg text-xs font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-turquoise/50 transition-all" 
data-filter="${bHtml}">
${bHtml}
</button>
`;
});
container.innerHTML = html;
}
function updateReportTitle() {
const titleEl = document.getElementById('reportTitle');
if (titleEl) {
if (currentFilter === 'الكل') {
titleEl.innerText = 'تقرير استحقاق المكافآت الرسمي';
} else {
titleEl.innerText = `تقرير استحقاق المكافآت الرسمي - ${currentFilter}`;
}
}
}
function setFilter(filter) {
currentFilter = filter;
clearBonusesRowUI();
// Update active state
document.querySelectorAll('.filter-pill').forEach(btn => {
if (btn.dataset.filter === filter) {
btn.classList.add('active', 'text-[#0a0e1a]', 'shadow-[0_0_20px_rgba(64,224,208,0.3)]');
btn.classList.remove('text-white', 'bg-white/5', 'border', 'border-white/10');
} else {
btn.classList.remove('active', 'text-[#0a0e1a]', 'shadow-[0_0_20px_rgba(64,224,208,0.3)]');
btn.classList.add('text-white', 'bg-white/5', 'border', 'border-white/10');
}
});
updateReportTitle();
updatePrintButtonText();
renderUI(filter);
// Ensure badges are updated after filter change
// renderUI already calls updateBadges, but we add an extra call to be safe
setTimeout(() => {
updateBadges();
}, 200);
}
function clearBonusesRowUI() {
const bonusesCombinedRow = document.getElementById('bonusesCombinedRow');
const commitmentBlock = document.getElementById('commitmentBonusBlock');
const excellenceBlock = document.getElementById('excellenceBonusBlock');
const commitmentText = document.getElementById('commitmentBonusText');
const excellenceText = document.getElementById('excellenceBonusText');
const commitmentValue = document.getElementById('commitmentBonusValue');
const excellenceValue = document.getElementById('excellenceBonusValue');
if (bonusesCombinedRow) bonusesCombinedRow.style.display = 'none';
if (commitmentBlock) commitmentBlock.style.display = 'none';
if (excellenceBlock) excellenceBlock.style.display = 'none';
if (commitmentText) commitmentText.innerHTML = '';
if (excellenceText) excellenceText.innerHTML = '';
if (commitmentValue) commitmentValue.innerText = '';
if (excellenceValue) excellenceValue.innerText = '';
}
function updatePrintButtonText() {
var lb = document.getElementById('printAllBtnLabel');
var lbM = document.getElementById('printAllBtnLabelMobile');
if (lb) lb.textContent = (currentFilter === 'الكل') ? 'طباعة الكل' : 'طباعة ' + currentFilter;
if (lbM) lbM.textContent = (currentFilter === 'الكل') ? 'الكل' : currentFilter;
}
// === Checkbox Management ===
function toggleAll(master) {
document.querySelectorAll('.emp-checkbox').forEach(box => {
box.checked = master.checked;
});
updateSelectedUI();
}
function updateSelectedUI() {
var selectedCount = document.querySelectorAll('.emp-checkbox:checked').length;
var btn = document.getElementById('printSelectedBtn');
if (!btn) return;
if (selectedCount > 0) {
btn.classList.remove('hidden');
btn.innerHTML = '<span class="action-btn-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg></span><span class="hidden sm:inline">طباعة المحدد (' + selectedCount + ')</span><span class="sm:hidden">محدد</span>';
} else {
btn.classList.add('hidden');
}
}
// === Badge Update Function (Real-time) ===
function updateBadges() {
// Check if any employee in ANY branch has evaluations > 0 (global check)
const hasAnyEvaluations = db.some(emp => ((emp.evaluationsBooking || 0) + (emp.evaluationsGoogle || 0)) > 0);
const { branchWinners, branchLosers } = computeBranchWinnersAndLosers(db, branches);
// Calculate view winners/losers
// Use currentFilter from global scope (set by renderUI)
let filtered = [...db];
const activeFilter = typeof currentFilter !== 'undefined' ? currentFilter : 'الكل';
if (activeFilter !== 'الكل') {
filtered = filtered.filter(d => d.branch === activeFilter);
}
let viewWinners = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []} };
let viewLosers = { net: {val: Infinity, ids: []}, eval: {val: Infinity, ids: []}, evalBooking: {val: Infinity, ids: []}, evalGoogle: {val: Infinity, ids: []}, book: {val: Infinity, ids: []} };
var _pFooter = getPricingConfig();
filtered.forEach(emp => {
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle; // For financial calculations only
const gross = computeGrossFromBreakdown(emp, _pFooter);
const fund = gross * getSupportFundRate();
let net = gross - fund;
// Apply attendance bonus/discount for accurate net calculation
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const attendanceBonus = attendance26Days ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
if (net > viewWinners.net.val) { viewWinners.net.val = net; viewWinners.net.ids = [emp.id]; }
else if (net === viewWinners.net.val) { viewWinners.net.ids.push(emp.id); }
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
if (evBooking > viewWinners.eval.val) { viewWinners.eval.val = evBooking; viewWinners.eval.ids = [emp.id]; }
else if (evBooking === viewWinners.eval.val) { viewWinners.eval.ids.push(emp.id); }
// Separate tracking for Booking evaluations
if (evBooking > viewWinners.evalBooking.val) { viewWinners.evalBooking.val = evBooking; viewWinners.evalBooking.ids = [emp.id]; }
else if (evBooking === viewWinners.evalBooking.val) { viewWinners.evalBooking.ids.push(emp.id); }
// Separate tracking for Google Maps evaluations
if (evGoogle > viewWinners.evalGoogle.val) { viewWinners.evalGoogle.val = evGoogle; viewWinners.evalGoogle.ids = [emp.id]; }
else if (evGoogle === viewWinners.evalGoogle.val) { viewWinners.evalGoogle.ids.push(emp.id); }
if (emp.count > viewWinners.book.val) { viewWinners.book.val = emp.count; viewWinners.book.ids = [emp.id]; }
else if (emp.count === viewWinners.book.val) { viewWinners.book.ids.push(emp.id); }
if (net > 0 && net < viewLosers.net.val) { viewLosers.net.val = net; viewLosers.net.ids = [emp.id]; }
else if (net > 0 && net === viewLosers.net.val) { viewLosers.net.ids.push(emp.id); }
// "الأقل تقييماً" = Booking فقط (NOT Google Maps)
if (evBooking < viewLosers.eval.val || (evBooking === 0 && viewLosers.eval.val > 0)) { 
viewLosers.eval.val = evBooking; 
viewLosers.eval.ids = [emp.id]; 
} else if (evBooking === viewLosers.eval.val) { 
viewLosers.eval.ids.push(emp.id); 
}
// Separate tracking for Booking evaluations (losers)
if (evBooking < viewLosers.evalBooking.val || (evBooking === 0 && viewLosers.evalBooking.val > 0)) { 
viewLosers.evalBooking.val = evBooking; 
viewLosers.evalBooking.ids = [emp.id]; 
} else if (evBooking === viewLosers.evalBooking.val) { 
viewLosers.evalBooking.ids.push(emp.id); 
}
// Separate tracking for Google Maps evaluations (losers)
if (evGoogle < viewLosers.evalGoogle.val || (evGoogle === 0 && viewLosers.evalGoogle.val > 0)) { 
viewLosers.evalGoogle.val = evGoogle; 
viewLosers.evalGoogle.ids = [emp.id]; 
} else if (evGoogle === viewLosers.evalGoogle.val) { 
viewLosers.evalGoogle.ids.push(emp.id); 
}
if (emp.count > 0 && emp.count < viewLosers.book.val) { viewLosers.book.val = emp.count; viewLosers.book.ids = [emp.id]; }
else if (emp.count > 0 && emp.count === viewLosers.book.val) { viewLosers.book.ids.push(emp.id); }
});
// عند «الكل»: استبدال بطل الحجوزات وبطل التقييم بالمُجمّع (مجموع كل الفروع) وليس أعلى صف
if (activeFilter === 'الكل') {
  const seenAgg = new Set();
  let bestEval = -1, bestEvalId = null;
  let bestBook = -1, bestBookId = null;
  db.forEach(function (emp) {
    if (seenAgg.has(emp.name)) return;
    seenAgg.add(emp.name);
    const allBr = db.filter(function (e) { return e.name === emp.name; });
    let sumEval = 0, sumBook = 0;
    allBr.forEach(function (b) {
      sumEval += (b.evaluationsBooking || 0);
      sumBook += (b.count || 0);
    });
    if (sumEval > bestEval) { bestEval = sumEval; bestEvalId = allBr[0].id; }
    if (sumBook > bestBook) { bestBook = sumBook; bestBookId = allBr[0].id; }
  });
  if (bestEvalId != null) { viewWinners.eval.val = bestEval; viewWinners.eval.ids = [bestEvalId]; }
  if (bestBookId != null) { viewWinners.book.val = bestBook; viewWinners.book.ids = [bestBookId]; }
}
// Update badges in all rows (including badges-row) — في عرض «الكل» إخفاء صف الشارات (تظهر في الفروع فقط)
const activeFilterBadges = typeof currentFilter !== 'undefined' ? currentFilter : 'الكل';
if (activeFilterBadges === 'الكل') {
  document.querySelectorAll('#mainTable tr.badges-row').forEach(function(r) { r.remove(); });
}
const employeeRows = document.querySelectorAll('#mainTable tr[data-name]:not(.badges-row)');
employeeRows.forEach(empRow => {
const empId = empRow.dataset.id || empRow.dataset.empId;
const rName = empRow.dataset.name;
const rBranch = empRow.dataset.branch;
if (!empId && !rName) return;
// Find employee
const emp = empId ? db.find(d => d.id === empId) : (rName && rBranch ? db.find(d => d.name === rName && d.branch === rBranch) : null);
if (!emp) return;
if (activeFilterBadges === 'الكل') return;
// Check if badges-row exists for this employee
// Try multiple selectors to find the badges-row
let badgesRow = document.querySelector(`tr.badges-row[data-emp-id="${emp.id}"]`);
// If not found, try to find it by checking next sibling
if (!badgesRow) {
const nextSibling = empRow.nextElementSibling;
if (nextSibling && nextSibling.classList.contains('badges-row') && 
    (nextSibling.dataset.empId === emp.id || nextSibling.dataset.branch === emp.branch)) {
    badgesRow = nextSibling;
}
}
if (!badgesRow) {
// Create badges-row if it doesn't exist
badgesRow = document.createElement('tr');
badgesRow.className = 'badges-row';
badgesRow.setAttribute('data-emp-id', emp.id);
badgesRow.setAttribute('data-branch', emp.branch);
const td = document.createElement('td');
var visibleCols = 0;
var mainRow = document.querySelector('.main-header-row');
if (mainRow) mainRow.querySelectorAll('th').forEach(function(th) { if (th.offsetParent !== null && window.getComputedStyle(th).display !== 'none') visibleCols++; });
td.setAttribute('colspan', String(visibleCols > 0 ? visibleCols : 99));
const badgeWrap = document.createElement('div');
badgeWrap.className = 'badges-wrapper';
td.appendChild(badgeWrap);
badgesRow.appendChild(td);
// Insert badges-row after employee row
empRow.insertAdjacentElement('afterend', badgesRow);
}
});
// Now update all badges (including newly created ones)
// First, update badges for all badges-rows directly
const badgesRows = document.querySelectorAll('#mainTable tr.badges-row');
badgesRows.forEach(badgesRow => {
const empId = badgesRow.dataset.empId;
if (!empId) return;
const emp = db.find(d => d.id === empId);
if (!emp) return;
const badgeWrap = badgesRow.querySelector('.badges-wrapper');
if (!badgeWrap) return;
// Calculate badges for this employee
const activeFilter = typeof currentFilter !== 'undefined' ? currentFilter : 'الكل';
let badgesHtml = '';
// Get all branches for this employee name (use emp.name instead of rName for badges-row compatibility)
const allEmpBranches = db.filter(d => d.name === emp.name);
if (activeFilter === 'الكل') {
// When showing "الكل": accumulate badges from all branches (only "best" badges, not "worst")
const branchBadges = { eval: [], evalBooking: [], evalGoogle: [], book: [] };
allEmpBranches.forEach(empBranch => {
// "الأكثر تقييماً" = Booking فقط
const bw = branchWinners[empBranch.branch];
if (!bw) return; // Skip if branch not found
const isBranchMaxEval = bw.eval?.ids?.includes(empBranch.id) && bw.eval?.val > 0;
const isBranchMaxEvalBooking = bw.evalBooking?.ids?.includes(empBranch.id) && bw.evalBooking?.val > 0;
const isBranchMaxEvalGoogle = bw.evalGoogle?.ids?.includes(empBranch.id) && bw.evalGoogle?.val > 0;
const isBranchMaxBook = bw.book?.ids?.includes(empBranch.id) && bw.book?.val > 0;
// Only show evaluation badges if at least one employee has evaluations > 0
if (isBranchMaxEval && hasAnyEvaluations && !branchBadges.eval.includes(empBranch.branch)) {
branchBadges.eval.push(empBranch.branch);
}
if (isBranchMaxEvalBooking && hasAnyEvaluations && !branchBadges.evalBooking.includes(empBranch.branch)) {
branchBadges.evalBooking.push(empBranch.branch);
}
if (isBranchMaxEvalGoogle && hasAnyEvaluations && !branchBadges.evalGoogle.includes(empBranch.branch)) {
branchBadges.evalGoogle.push(empBranch.branch);
}
if (isBranchMaxBook && !branchBadges.book.includes(empBranch.branch)) {
branchBadges.book.push(empBranch.branch);
}
});
// Add badges with branch names
// "الأكثر تقييماً" = Booking فقط
if (branchBadges.eval.length > 0) {
const branchText = branchBadges.eval.length === 1 
? `بال${branchBadges.eval[0]}` 
: branchBadges.eval.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.eval.length} فروع`;
badgesHtml += `<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً (Booking)">⭐ الأفضل تقييماً ${branchText}</span>`;
}
// شارة منفصلة: أكثر تقييم Booking
if (branchBadges.evalBooking.length > 0) {
const branchText = branchBadges.evalBooking.length === 1 
? `بال${branchBadges.evalBooking[0]}` 
: branchBadges.evalBooking.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.evalBooking.length} فروع`;
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="أكثر تقييم Booking">📱 أكثر تقييم Booking ${branchText}</span>`;
}
// شارة منفصلة: أكثر تقييم Google Maps
if (branchBadges.evalGoogle.length > 0) {
const branchText = branchBadges.evalGoogle.length === 1 
? `بال${branchBadges.evalGoogle[0]}` 
: branchBadges.evalGoogle.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.evalGoogle.length} فروع`;
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600" title="أكثر تقييم Google Maps">🗺️ أكثر تقييم Google Maps ${branchText}</span>`;
}
if (branchBadges.book.length > 0) {
const branchText = branchBadges.book.length === 1 
? `بال${branchBadges.book[0]}` 
: branchBadges.book.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.book.length} فروع`;
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات">🎯 الأكثر حجوزات ${branchText}</span>`;
}
// View badges (only when showing "الكل")
// Only show evaluation badges if at least one employee has evaluations > 0
if (viewWinners.eval.ids.includes(emp.id) && viewWinners.eval.val > 0 && hasAnyEvaluations) {
// Find branches where this employee exists (all branches for this employee name)
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `في ${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-yellow-500 text-xs print:text-yellow-700 font-bold" title="الأعلى تقييماً في الكل">⭐ بطل التقييم ${branchText}</span>`;
}
if (viewWinners.book.ids.includes(emp.id) && viewWinners.book.val > 0) {
// Find branches where this employee exists (all branches for this employee name)
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `في ${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-blue-500 text-xs print:text-blue-700 font-bold" title="الأكثر حجوزات في الكل">🎯 بطل الحجوزات ${branchText}</span>`;
}
// Show "worst in الكل" badge - "الأقل تقييماً" = Booking فقط
if (viewLosers.eval.ids.includes(emp.id) && viewLosers.eval.val < Infinity && viewLosers.eval.val === 0 && (emp.evaluationsBooking || 0) === 0 && hasAnyEvaluations) {
const worstBranches = allEmpBranches.filter(eb => viewLosers.eval.ids.includes(eb.id));
const uniqueBranches = [...new Set(worstBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `بال${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل تقييماً في الكل (Booking)"><span class="text-red-500 text-[8px] leading-none inline-block">↓</span> الأقل تقييماً ${branchText}</span>`;
}
if (viewLosers.book.ids.includes(emp.id) && viewLosers.book.val < Infinity) {
const worstBranches = allEmpBranches.filter(eb => viewLosers.book.ids.includes(eb.id));
const uniqueBranches = [...new Set(worstBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `بال${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل حجوزات في الكل">😟 الأقل حجوزات ${branchText}</span>`;
}
} else {
// When showing specific branch: show only badges for current branch
// Use global hasAnyEvaluations check (all branches)
// "الأكثر تقييماً" = Booking فقط
const bw = branchWinners[emp.branch];
const isBranchMaxEval = bw?.eval?.ids?.includes(emp.id) && bw?.eval?.val > 0;
const isBranchMaxEvalBooking = bw?.evalBooking?.ids?.includes(emp.id) && bw?.evalBooking?.val > 0;
const isBranchMaxEvalGoogle = bw?.evalGoogle?.ids?.includes(emp.id) && bw?.evalGoogle?.val > 0;
const isBranchMaxBook = bw?.book?.ids?.includes(emp.id) && bw?.book?.val > 0;
if (isBranchMaxEval && hasAnyEvaluations) {
badgesHtml += `<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً في ${emp.branch} (Booking)">⭐ الأفضل تقييماً في ${emp.branch}</span>`;
}
// شارة منفصلة: أكثر تقييم Booking
if (isBranchMaxEvalBooking && hasAnyEvaluations) {
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="أكثر تقييم Booking في ${emp.branch}">📱 أكثر تقييم Booking في ${emp.branch}</span>`;
}
// شارة منفصلة: أكثر تقييم Google Maps
if (isBranchMaxEvalGoogle && hasAnyEvaluations) {
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600" title="أكثر تقييم Google Maps في ${emp.branch}">🗺️ أكثر تقييم Google Maps في ${emp.branch}</span>`;
}
if (isBranchMaxBook) {
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات في ${emp.branch}">🎯 الأكثر حجوزات في ${emp.branch}</span>`;
}
// "الأقل تقييماً" = Booking فقط
const bl = branchLosers[emp.branch];
const isBranchMinEval = bl?.eval?.ids?.includes(emp.id) && bl?.eval?.val < Infinity && (emp.evaluationsBooking || 0) === 0;
const isBranchMinBook = bl?.book?.ids?.includes(emp.id) && bl?.book?.val < Infinity;
// Use global hasAnyEvaluations check (all branches) - if ANY employee in ANY branch has evaluation, show badge
if (isBranchMinEval && hasAnyEvaluations) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل تقييماً في ${emp.branch} (Booking)"><span class="text-red-400 text-[8px] leading-none inline-block">↓</span> الأقل تقييماً في ${emp.branch}</span>`;
}
if (isBranchMinBook) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل حجوزات في ${emp.branch}">😟 الأقل حجوزات في ${emp.branch}</span>`;
}
}
// Commitment badge - Show ONLY for employees with attendance26Days = true
// CRITICAL: Get fresh data from db to ensure we check the current state after updateAttendance
const currentEmpFromDb = db.find(d => d.id === emp.id);
if (!currentEmpFromDb) {
badgeWrap.innerHTML = badgesHtml; // Update with current badges (without commitment badge)
return; // Skip if employee not found
}
// For duplicate employees: check totalAttendanceDays >= 26, for non-duplicates: check attendance26Days === true
const empNameCount = db.filter(e => e.name === emp.name).length;
let attendance26Days = false;
if (empNameCount > 1) {
// Duplicate employee: use totalAttendanceDays
const totalDays = currentEmpFromDb.totalAttendanceDays || 0;
attendance26Days = totalDays >= 26;
} else {
// Non-duplicate: use attendance26Days flag
attendance26Days = currentEmpFromDb.attendance26Days === true;
}
if (attendance26Days === true) {
if (activeFilter !== 'الكل') {
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً في ${emp.branch}">✓ الأكثر التزاماً في ${emp.branch}</span>`;
} else {
// When showing "الكل": find all branches where this employee has attendance26Days = true
// For duplicates: check all branches where totalAttendanceDays >= 26
// For non-duplicates: check branches where attendance26Days === true
const currentEmpBranches = allEmpBranches.filter(eb => {
if (empNameCount > 1) {
// Duplicate: check totalAttendanceDays
const totalDays = eb.totalAttendanceDays || 0;
return totalDays >= 26;
} else {
// Non-duplicate: check attendance26Days flag
return eb.attendance26Days === true;
}
});
const uniqueBranches = [...new Set(currentEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: uniqueBranches.length > 0
? `${uniqueBranches.length} فروع`
: emp.branch;
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً">✓ الأكثر التزاماً ${branchText}</span>`;
}
}
// Excellence badge (most bookings + most evaluations in same branch) - check for current employee only
const isCurrentEmpMaxEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
const isCurrentEmpMaxBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
const hasExcellence = isCurrentEmpMaxBook && isCurrentEmpMaxEval;
if (hasExcellence) {
if (activeFilter !== 'الكل') {
// When showing specific branch: show only current branch
badgesHtml += `<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات) في ${emp.branch}">✨ مبدع ${emp.branch}</span>`;
} else {
// When showing "الكل": find only branches where THIS specific employee (emp.id) has excellence
// Only check branches where the current employee (emp.id) exists and has excellence
const currentEmpBranches = allEmpBranches.filter(eb => eb.id === emp.id);
const excellenceBranches = currentEmpBranches.filter(eb => 
branchWinners[eb.branch]?.eval.ids.includes(eb.id) && 
branchWinners[eb.branch]?.book.ids.includes(eb.id) &&
branchWinners[eb.branch].eval.val > 0 &&
branchWinners[eb.branch].book.val > 0
);
const uniqueBranches = [...new Set(excellenceBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: uniqueBranches.length > 0
? `${uniqueBranches.length} فروع`
: emp.branch; // Fallback to current branch if no matches
badgesHtml += `<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات)">✨ مبدع ${branchText}</span>`;
}
}
badgeWrap.innerHTML = badgesHtml;
});
}
// === UI Rendering ===
function updateDashboardStats() {
var _pricingRenderUI = getPricingConfig();
// Helper to calc stats (CRITICAL: Must include attendance bonus/discount + excellence bonus + commitment bonus to match renderUI logic)
const calcStats = (emp) => {
const rate = getDisplayRate(emp.count);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle;
const gross = computeGrossFromBreakdown(emp, _pricingRenderUI);
const fund = gross * getSupportFundRate();
let net = gross - fund;
// CRITICAL: Apply attendance bonus/discount to match renderUI calculation
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const attendanceBonus = attendance26Days ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
const ev = evBooking; // Use Booking evaluations only for "الأكثر تقييماً"
// Check for excellence bonus and commitment bonus (need branchWinners from renderUI context)
// Note: This calcStats is used for dashboard stats, so we need to recalculate branchWinners
// For now, we'll include bonuses in the return but they'll be calculated in the main loop
return { net, fund, ev, count: emp.count, branch: emp.branch, name: emp.name, id: emp.id };
};
// 1. Branch Winners from single source
const { branchWinners } = computeBranchWinnersAndLosers(db, branches);
// 2. Calculate View Winners & Totals (with attendance bonus/discount) — للفروع فقط تُستخدم هذه الإجماليات؛ عند «الكل» الإجماليات النهائية تُحدَّث من الحلقة الرئيسية لاحقاً
let filtered = [...db];
if (currentFilter !== 'الكل') {
filtered = filtered.filter(d => d.branch === currentFilter);
}
// تطبيق الحد الأدنى لحجوزات الموظف من إعدادات الأدمن (config/settings.json في Firebase)
var minThreshold = (typeof window !== 'undefined' && window.minBookingThreshold != null) ? window.minBookingThreshold : 0;
if (minThreshold > 0) {
  if (currentFilter === 'الكل') {
    var nameToAggCount = {};
    filtered.forEach(function(e) { nameToAggCount[e.name] = (nameToAggCount[e.name] || 0) + (e.count || 0); });
    filtered = filtered.filter(function(e) { return (nameToAggCount[e.name] || 0) >= minThreshold; });
  } else {
    filtered = filtered.filter(function(e) { return (e.count || 0) >= minThreshold; });
  }
}
let viewWinners = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []} };
let totalNet = 0, totalBookings = 0, totalFund = 0;
filtered.forEach(emp => {
const s = calcStats(emp);
// Check for excellence bonus and commitment bonus
const hasExcellenceBonus = branchWinners[emp.branch]?.book.ids.includes(emp.id) && 
branchWinners[emp.branch]?.eval.ids.includes(emp.id) &&
branchWinners[emp.branch].book.val > 0 && 
branchWinners[emp.branch].eval.val > 0;
const excellenceBonus = hasExcellenceBonus ? 50 : 0;
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
const isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
const hasCommitmentBonus = attendance26Days && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
totalNet += s.net + excellenceBonus + commitmentBonus; // Include all bonuses
totalFund += s.fund; // Add fund for total calculation
totalBookings += s.count;
// viewWinners.net يُحدَّث لاحقاً من نفس مصدر الجدول (getDisplayNetForEmployee) ليكون الرقم مرآة لأعلى صافي في الجدول
// عند «الكل» لا نحدّث eval/book من الصفوف — نعتمد على التجميع (مجموع الحجوزات/التقييم لكل شخص) فقط
if (currentFilter !== 'الكل') {
  if (s.ev > viewWinners.eval.val) { viewWinners.eval.val = s.ev; viewWinners.eval.ids = [s.id]; }
  else if (s.ev === viewWinners.eval.val) { viewWinners.eval.ids.push(s.id); }
  if (s.count > viewWinners.book.val) { viewWinners.book.val = s.count; viewWinners.book.ids = [s.id]; }
  else if (s.count === viewWinners.book.val) { viewWinners.book.ids.push(s.id); }
}
});
// كروت إحصائية عادلة: من إجماليات «الكل» المُجمّعة (متكرر + غير متكرر) وليس من الفروع فقط
const seenNames = new Set();
let bestAggNetVal = -1, bestAggNetName = null, bestAggNetFirstId = null;
let bestAggEvalVal = -1, bestAggEvalName = null, bestAggEvalFirstId = null;
let bestAggBookVal = -1, bestAggBookName = null, bestAggBookFirstId = null;
db.forEach(emp => {
  if (seenNames.has(emp.name)) return;
  seenNames.add(emp.name);
  const allEmpBranches = db.filter(e => e.name === emp.name);
  let totalNetFromBranches = 0, hasExcellence = false, hasCommitment = false;
  let aggEval = 0, aggCount = 0;
  allEmpBranches.forEach(branchEmp => {
    const evBooking = branchEmp.evaluationsBooking || 0;
    const evGoogle = branchEmp.evaluationsGoogle || 0;
    aggEval += evBooking;
    aggCount += branchEmp.count || 0;
    const gross = computeGrossFromBreakdown(branchEmp, _pricingRenderUI);
    const fund = gross * getSupportFundRate();
    let branchNet = gross - fund;
    const attendance26Days = branchEmp.attendance26Days === true;
    branchNet = branchNet + (attendance26Days ? branchNet * 0.25 : 0);
    totalNetFromBranches += branchNet;
    const bw = branchWinners[branchEmp.branch];
    if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0 && bw.eval.val > 0) hasExcellence = true;
    if (bw && attendance26Days && (bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0 || bw.book.ids.includes(branchEmp.id) && bw.book.val > 0)) hasCommitment = true;
  });
  let aggNet = totalNetFromBranches + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
  // خصم الخصم ليطابق الجدول (نفس منطق عمود الصافي)
  var discountFn = typeof getTotalDiscountForEmployee === 'function' ? getTotalDiscountForEmployee : (typeof window !== 'undefined' && typeof window.getTotalDiscountForEmployee === 'function' ? window.getTotalDiscountForEmployee : null);
  if (discountFn) { try { aggNet = Math.max(0, aggNet - (discountFn(emp.name) || 0)); } catch (e) {} }
  if (aggNet > bestAggNetVal) {
    bestAggNetVal = aggNet;
    bestAggNetName = emp.name;
    bestAggNetFirstId = allEmpBranches[0].id;
  }
  if (aggEval > bestAggEvalVal) {
    bestAggEvalVal = aggEval;
    bestAggEvalName = emp.name;
    bestAggEvalFirstId = allEmpBranches[0].id;
  }
  if (aggCount > bestAggBookVal) {
    bestAggBookVal = aggCount;
    bestAggBookName = emp.name;
    bestAggBookFirstId = allEmpBranches[0].id;
  }
});
// كارت «أعلى صافي» = مرآة لأعلى رقم في عمود الصافي بالجدول (نفس getDisplayNetForEmployee) — لا نستبدل بـ bestAggNetVal
const seenNamesAgg = new Set();
filtered.forEach(emp => {
  let displayNet = 0;
  if (typeof getDisplayNetForEmployee === 'function') {
    if (currentFilter === 'الكل') {
      const isDup = db.filter(e => e.name === emp.name).length > 1;
      if (isDup) {
        if (seenNamesAgg.has(emp.name)) return;
        seenNamesAgg.add(emp.name);
        displayNet = getDisplayNetForEmployee(emp.name, { aggregated: true });
      } else {
        displayNet = getDisplayNetForEmployee(emp.id);
      }
    } else {
      displayNet = getDisplayNetForEmployee(emp.id);
    }
  }
  if (displayNet > viewWinners.net.val) { viewWinners.net.val = displayNet; viewWinners.net.ids = [emp.id]; }
  else if (displayNet === viewWinners.net.val && displayNet > 0) { viewWinners.net.ids.push(emp.id); }
});
if (bestAggEvalName != null && bestAggEvalFirstId != null) {
  viewWinners.eval.val = bestAggEvalVal;
  viewWinners.eval.ids = [bestAggEvalFirstId];
}
if (bestAggBookName != null && bestAggBookFirstId != null) {
  viewWinners.book.val = bestAggBookVal;
  viewWinners.book.ids = [bestAggBookFirstId];
}
// statEmployees, statBookings, statTotal — مصدر واحد فقط: updateFooterTotals() من getFooterTotals()
// Update Cards — الأرقام من إجماليات الكل المُجمّعة فالاسم بدون فرع
const getWinnerName = (wObj) => {
if (wObj.val <= 0) return '-';
const winner = db.find(d => d.id === wObj.ids[0]);
return winner ? (winner.name + (currentFilter === 'الكل' ? ` (${winner.branch})` : '')) : '-';
};
const topEarnerNameEl = document.getElementById('topEarnerName');
const topEarnerValueEl = document.getElementById('topEarnerValue');
if (topEarnerNameEl) topEarnerNameEl.innerText = getWinnerName(viewWinners.net);
if (topEarnerValueEl) topEarnerValueEl.innerText = viewWinners.net.val > 0 ? viewWinners.net.val.toFixed(2) + ' ريال' : '-';
const topRatedNameEl = document.getElementById('topRatedName');
const topRatedValueEl = document.getElementById('topRatedValue');
if (topRatedNameEl) topRatedNameEl.innerText = viewWinners.eval.val > 0 ? (bestAggEvalName != null ? bestAggEvalName : getWinnerName(viewWinners.eval)) : '-';
if (topRatedValueEl) topRatedValueEl.innerText = viewWinners.eval.val > 0 ? viewWinners.eval.val + ' تقييم' : '-';
const topBookerNameEl = document.getElementById('topBookerName');
const topBookerValueEl = document.getElementById('topBookerValue');
if (topBookerNameEl) topBookerNameEl.innerText = viewWinners.book.val > 0 ? (bestAggBookName != null ? bestAggBookName : getWinnerName(viewWinners.book)) : '-';
if (topBookerValueEl) topBookerValueEl.innerText = viewWinners.book.val > 0 ? viewWinners.book.val + ' حجز' : '-';
// 4. Update Bonus Stat Cards
updateCommitmentBonusRow();
updateExcellenceBonusRow();
// 5. Update Badges in DOM
const rows = document.querySelectorAll('#mainTable tr');
rows.forEach(row => {
const rBranch = row.dataset.branch;
// Find ID from db based on name/branch combo if ID not on row? 
// Better to put ID on row. I'll add ID to renderUI.
// Fallback: match by name/branch
const rName = row.dataset.name;
const emp = db.find(d => d.name === rName && d.branch === rBranch);
const badgeWrap = row.querySelector('.badges-wrapper');
if (emp && badgeWrap) {
let badgesHtml = '';
const isViewNet = viewWinners.net.ids.includes(emp.id) && viewWinners.net.val > 0;
const isBranchNet = branchWinners[emp.branch]?.net.ids.includes(emp.id) && branchWinners[emp.branch].net.val > 0;
if (isViewNet || isBranchNet) badgesHtml += '<span class="text-green-400 text-xs" title="الأعلى دخلاً">🏆</span>';
const isViewEval = viewWinners.eval.ids.includes(emp.id) && viewWinners.eval.val > 0;
const isBranchEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
if (isViewEval || isBranchEval) badgesHtml += '<span class="text-yellow-400 text-xs" title="الأعلى تقييماً">⭐</span>';
const isViewBook = viewWinners.book.ids.includes(emp.id) && viewWinners.book.val > 0;
const isBranchBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
if (isViewBook || isBranchBook) badgesHtml += '<span class="text-blue-400 text-xs" title="الأكثر حجوزات">📊</span>';
badgeWrap.innerHTML = badgesHtml;
}
});
}
function updateCommitmentBonusRow() {
var _bonusData = _collectBonusEmployeesFromBranches();
const commitmentEmployees = _bonusData.commitment;
// Update commitment bonus block (صف الحوافز الموحد)
const bonusesCombinedRow = document.getElementById('bonusesCombinedRow');
const commitmentText = document.getElementById('commitmentBonusText');
const commitmentValue = document.getElementById('commitmentBonusValue');
const commitmentBlock = document.getElementById('commitmentBonusBlock');
let displayCommitmentEmployees = commitmentEmployees;
let displayCommitmentBonus = commitmentEmployees.length * 50;
if (currentFilter !== 'الكل') {
displayCommitmentEmployees = commitmentEmployees.filter(e => e.branch === currentFilter);
displayCommitmentBonus = displayCommitmentEmployees.length * 50;
}
if (commitmentBlock) commitmentBlock.style.display = displayCommitmentEmployees.length > 0 ? '' : 'none';
if (commitmentText) {
if (displayCommitmentEmployees.length > 0) {
const employeesHtml = formatBonusEmployeesAsRows(displayCommitmentEmployees, false);
commitmentText.innerHTML = employeesHtml;
} else commitmentText.innerHTML = '';
}
if (commitmentValue) commitmentValue.innerText = displayCommitmentEmployees.length > 0 ? `+${displayCommitmentBonus.toFixed(2)}` : '';
// Update commitment bonus stat card
const topCommitmentName = document.getElementById('topCommitmentName');
const topCommitmentValue = document.getElementById('topCommitmentValue');
if (commitmentEmployees.length > 0) {
// Filter by current filter
let displayEmployees = commitmentEmployees;
if (currentFilter !== 'الكل') {
displayEmployees = commitmentEmployees.filter(e => e.branch === currentFilter);
}
if (displayEmployees.length > 0) {
const names = displayEmployees.map(e => {
if (currentFilter === 'الكل') {
return `${e.name} (${e.branch})`;
} else {
return e.name;
}
}).join(' - ');
if (topCommitmentName) topCommitmentName.innerText = names;
if (topCommitmentValue) {
const total = displayEmployees.length * 50;
topCommitmentValue.innerText = total.toFixed(0) + ' ريال';
}
} else {
if (topCommitmentName) topCommitmentName.innerText = '-';
if (topCommitmentValue) topCommitmentValue.innerText = '0';
}
} else {
if (topCommitmentName) topCommitmentName.innerText = '-';
if (topCommitmentValue) topCommitmentValue.innerText = '0';
}
}
function updateExcellenceBonusRow() {
var _bonusData = _collectBonusEmployeesFromBranches();
const excellenceEmployees = _bonusData.excellence;
const commitmentEmployees = _bonusData.commitment;
// Update commitment bonus block
updateCommitmentBonusRow();
// Update excellence bonus block (نفس صف الحوافز الموحد)
const excellenceText = document.getElementById('excellenceBonusText');
const excellenceValue = document.getElementById('excellenceBonusValue');
const excellenceBlock = document.getElementById('excellenceBonusBlock');
let displayExcellenceEmployees = excellenceEmployees;
let displayExcellenceBonus = excellenceEmployees.length * 50;
if (currentFilter !== 'الكل') {
displayExcellenceEmployees = excellenceEmployees.filter(e => e.branch === currentFilter);
displayExcellenceBonus = displayExcellenceEmployees.length * 50;
}
if (excellenceBlock) excellenceBlock.style.display = displayExcellenceEmployees.length > 0 ? '' : 'none';
if (excellenceText) {
if (displayExcellenceEmployees.length > 0) {
const employeesHtml = formatBonusEmployeesAsRows(displayExcellenceEmployees, false);
excellenceText.innerHTML = employeesHtml;
} else excellenceText.innerHTML = '';
}
if (excellenceValue) excellenceValue.innerText = displayExcellenceEmployees.length > 0 ? `+${displayExcellenceBonus.toFixed(2)}` : '';
// إظهار صف الحوافز الموحد (بدون عمود إجمالي الحوافز — القيمة مضافة للصافي تلقائياً)
const bonusesCombinedRow = document.getElementById('bonusesCombinedRow');
const hasCommitment = (currentFilter === 'الكل' ? commitmentEmployees : commitmentEmployees.filter(e => e.branch === currentFilter)).length > 0;
const hasExcellence = displayExcellenceEmployees.length > 0;
if (bonusesCombinedRow) bonusesCombinedRow.style.display = (hasCommitment || hasExcellence) ? 'table-row' : 'none';
// Update excellence bonus stat card
const topExcellenceName = document.getElementById('topExcellenceName');
const topExcellenceValue = document.getElementById('topExcellenceValue');
if (excellenceEmployees.length > 0) {
// Filter by current filter
let displayEmployees = excellenceEmployees;
if (currentFilter !== 'الكل') {
displayEmployees = excellenceEmployees.filter(e => e.branch === currentFilter);
}
if (displayEmployees.length > 0) {
const names = displayEmployees.map(e => {
if (currentFilter === 'الكل') {
return `${e.name} (${e.branch})`;
} else {
return e.name;
}
}).join(' - ');
if (topExcellenceName) topExcellenceName.innerText = names;
if (topExcellenceValue) {
const total = displayEmployees.length * 50;
topExcellenceValue.innerText = total.toFixed(0) + ' ريال';
}
} else {
if (topExcellenceName) topExcellenceName.innerText = '-';
if (topExcellenceValue) topExcellenceValue.innerText = '0';
}
} else {
if (topExcellenceName) topExcellenceName.innerText = '-';
if (topExcellenceValue) topExcellenceValue.innerText = '0';
}
}
// مصدر واحد لحوافز الالتزام والتميز — يمر على كل فرع ويجمع النتائج.
// للموظف المتكرر: يُعرض مرة واحدة فقط مع كل الفروع التي حقق فيها الحافز.
function _collectBonusEmployeesFromBranches() {
  const { branchWinners } = computeBranchWinnersAndLosers(db, branches);
  var rawCommitment = [];
  var rawExcellence = [];
  var branchList = Object.keys(branchWinners || {}).filter(Boolean);
  if (branchList.length === 0 && db && db.length > 0) {
    branchList = [...new Set(db.map(function (e) { return e.branch; }).filter(Boolean))];
  }

  branchList.forEach(function (branch) {
    var bw = branchWinners[branch];
    if (!bw) return;
    var branchEmps = db.filter(function (e) { return e.branch === branch; });
    branchEmps.forEach(function (emp) {
      var isMaxBook = bw.book && bw.book.val > 0 && bw.book.ids.includes(emp.id);
      var isMaxEval = bw.eval && bw.eval.val > 0 && bw.eval.ids.includes(emp.id);
      if (isMaxBook && isMaxEval) {
        rawExcellence.push({ name: emp.name, branch: branch, reason: 'السبب: الأكثر تقييماً والأكثر حجوزات في الفرع' });
      }
      var att = emp.attendance26Days === true;
      var isMostEval = bw.eval && bw.eval.val > 0 && bw.eval.ids.includes(emp.id);
      var isMostBook = bw.book && bw.book.val > 0 && bw.book.ids.includes(emp.id);
      if (att && (isMostEval || isMostBook)) {
        var reason = (isMostEval && isMostBook) ? 'بطل الالتزام ورضاء العميل والانجاز' : (isMostEval ? 'بطل الالتزام ورضاء العميل' : 'بطل الالتزام والانجاز');
        rawCommitment.push({ name: emp.name, branch: branch, reason: reason });
      }
    });
  });

  function dedup(raw) {
    var map = {};
    raw.forEach(function (item) {
      if (!map[item.name]) {
        map[item.name] = { name: item.name, branch: item.branch, branches: [item.branch], reason: item.reason };
      } else {
        if (map[item.name].branches.indexOf(item.branch) < 0) {
          map[item.name].branches.push(item.branch);
          map[item.name].branch = map[item.name].branches.join(' - ');
        }
      }
    });
    return Object.keys(map).map(function (n) { return map[n]; });
  }

  var commitment = dedup(rawCommitment);
  var excellence = dedup(rawExcellence);

  if (currentFilter !== 'الكل') {
    commitment = rawCommitment.filter(function (e) { return e.branch === currentFilter; });
    excellence = rawExcellence.filter(function (e) { return e.branch === currentFilter; });
  }

  return { commitment: commitment, excellence: excellence };
}
function escapeBonusHtml(value) {
return String(value == null ? '' : value)
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;');
}
function formatBonusEmployeesAsRows(employees, includeReason) {
if (!employees || employees.length === 0) return '';
return employees.map((e, i) => {
const safeName = escapeBonusHtml(e.name);
const safeBranch = escapeBonusHtml(e.branch);
const safeReason = includeReason ? escapeBonusHtml(e.reason) : '';
const num = i + 1;
const reasonPart = includeReason && safeReason ? ` <span class="text-turquoise/70">${safeReason}</span>` : '';
return `<span class="inline text-[10.5px] leading-tight"><span class="text-turquoise/60">${num}.</span> <span class="font-semibold text-white/90">${safeName}</span> <span class="text-turquoise/70">(${safeBranch})</span>${reasonPart}</span>`;
}).join(' · ');
}
function renderUI(filter) {
// Update currentFilter to match the filter parameter (واحدّث window حتى rewards-table.js وغيره يقرؤونه)
currentFilter = filter;
if (typeof window !== 'undefined') window.currentFilter = filter;
// Cache pricing config once per render cycle
var _pricingRenderUI = getPricingConfig();
// Sync table header eval rates with config (so "30 ر.س" / "10 ر.س" match SettingsPanel)
if (typeof updateEvalRatesInTableHeader === 'function') updateEvalRatesInTableHeader();

// Check role and filter restrictions
const currentRole = localStorage.getItem('adora_current_role');
// المشرف: الكل عرض فقط، التقييمات في الفروع. HR: الكل عرض فقط، تم/لم يتم وعدد الأيام للمتكرر في الفروع فقط — لا نفرض "الكل" على HR.

var selectAllEl = document.getElementById('selectAll');
if (selectAllEl) selectAllEl.checked = false;
const tbody = document.getElementById('mainTable');
tbody.innerHTML = '';
// evalRateInput removed - replaced with separate Booking and Google Maps columns with fixed rates
// Update report title based on filter
updateReportTitle();
// --- 1. Pre-calculate Winners & Losers (Branch & View) ---
const { branchWinners, branchLosers } = computeBranchWinnersAndLosers(db, branches);
// --- Stats Helper (after branchWinners is calculated) ---
// Helper to calculate aggregated stats for duplicate employees
const getAggregatedStats = (empName) => {
const allEmpBranches = db.filter(e => e.name === empName);
const totalCount = allEmpBranches.reduce((sum, e) => sum + (e.count || 0), 0);
const totalEvalBooking = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsBooking || 0), 0);
const totalEvalGoogle = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsGoogle || 0), 0);
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
const totalEval = totalEvalBooking; // Use Booking evaluations only for "الأكثر تقييماً"
// إجمالي أيام الحضور للمتكرر: مجموع أيام كل فرع من صف ذلك الفرع (يعمل مع أو بدون مشاركة attendanceDaysPerBranch)
let totalDays = 0;
allEmpBranches.forEach((e) => {
  const branchDays = (e.attendanceDaysPerBranch && e.attendanceDaysPerBranch[e.branch] !== undefined)
    ? (parseInt(e.attendanceDaysPerBranch[e.branch], 10) || 0)
    : (e.totalAttendanceDays !== undefined ? e.totalAttendanceDays : (e.attendance26Days === true ? 26 : 0));
  totalDays += typeof branchDays === 'number' ? branchDays : (parseInt(branchDays, 10) || 0);
});
if (totalDays === 0 && allEmpBranches[0]) {
  const first = allEmpBranches[0];
  totalDays = first.totalAttendanceDays !== undefined ? first.totalAttendanceDays : (first.attendance26Days === true ? 26 : 0);
}
return { totalCount, totalEval, totalEvalBooking, totalEvalGoogle, totalDays };
};
const calcStats = (emp) => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
const ev = evBooking; // Use Booking evaluations only for "الأكثر تقييماً"
// Check if this is a duplicate employee (same name in multiple branches)
// Calculate nameCount on the fly if not available
const nameCount = nameCounts[emp.name] || db.filter(e => e.name === emp.name).length;
const isDuplicate = nameCount > 1;
// For duplicate employees: calculate aggregated totals
let aggregatedCount = emp.count;
let aggregatedEvalBooking = emp.evaluationsBooking || 0;
let aggregatedEvalGoogle = emp.evaluationsGoogle || 0;
let aggregatedEval = aggregatedEvalBooking; // "الأكثر تقييماً" = Booking فقط
// Calculate aggregated days from attendanceDaysPerBranch
let aggregatedDays = 0;
if (isDuplicate && emp.attendanceDaysPerBranch) {
aggregatedDays = Object.values(emp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
aggregatedDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
}
if (isDuplicate) {
const agg = getAggregatedStats(emp.name);
aggregatedCount = agg.totalCount;
aggregatedEval = agg.totalEvalBooking; // "الأكثر تقييماً" = Booking فقط
aggregatedEvalBooking = agg.totalEvalBooking;
aggregatedEvalGoogle = agg.totalEvalGoogle;
// Use calculated aggregatedDays from above
aggregatedDays = agg.totalDays;
}
// Check excellence bonus: الحوافز الإضافية مرتبطة بعدد تقييمات Booking فقط
let hasExcellenceBonus = false;
if (isDuplicate) {
// For duplicate: check if aggregated total (count + evalBooking) is highest in ANY branch
// Compare: aggregatedCount + aggregatedEvalBooking vs all other employees in each branch
[...branches].forEach(branch => {
const branchEmployees = db.filter(e => e.branch === branch);
let hasBothHighest = false;
// Check if this employee has highest bookings AND highest Booking evaluations in this branch
let isHighestBookInBranch = true;
let isHighestEvalInBranch = true;
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === emp.name) return; // Skip self
const otherAgg = nameCounts[otherEmp.name] > 1 ? getAggregatedStats(otherEmp.name) : { 
totalCount: otherEmp.count || 0, 
totalEvalBooking: otherEmp.evaluationsBooking || 0 
};
// Check bookings
if (otherAgg.totalCount > aggregatedCount) {
isHighestBookInBranch = false;
}
// Check evaluations (Booking فقط)
if (otherAgg.totalEvalBooking > aggregatedEvalBooking) {
isHighestEvalInBranch = false;
}
});
// Excellence bonus: must have BOTH highest bookings AND highest Booking evaluations in same branch
if (isHighestBookInBranch && isHighestEvalInBranch && aggregatedCount > 0 && aggregatedEvalBooking > 0) {
hasBothHighest = true;
}
if (hasBothHighest) {
hasExcellenceBonus = true;
}
});
} else {
// For non-duplicate: use existing logic - الحوافز الإضافية مرتبطة بعدد تقييمات Booking فقط
hasExcellenceBonus = branchWinners[emp.branch]?.book.ids.includes(emp.id) && 
branchWinners[emp.branch]?.eval.ids.includes(emp.id) &&
branchWinners[emp.branch].book.val > 0 && 
branchWinners[emp.branch].eval.val > 0;
}
const excellenceBonus = hasExcellenceBonus ? 50 : 0;
// Check commitment bonus: use aggregated days for duplicates
// For duplicates: check if aggregated days >= 26 AND user manually activated "تم"
// For non-duplicates: check if user manually activated "تم"
const attendance26Days = isDuplicate ? (aggregatedDays >= 26 && emp.attendance26Days === true) : (emp.attendance26Days === true);
let isMostCommitted = false;
let isMostEval = false;
let isMostBook = false;
if (isDuplicate) {
// For duplicate: check if aggregated total is highest in ANY branch
[...branches].forEach(branch => {
const branchEmployees = db.filter(e => e.branch === branch);
let isHighestDaysInBranch = true;
let isHighestEvalInBranch = true;
let isHighestBookInBranch = true;
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === emp.name) return; // Skip self
const otherAgg = nameCounts[otherEmp.name] > 1 ? getAggregatedStats(otherEmp.name) : { 
totalDays: otherEmp.attendance26Days === true ? 26 : 0,
totalEvalBooking: otherEmp.evaluationsBooking || 0,
totalCount: otherEmp.count || 0
};
// Check days
if (otherAgg.totalDays > aggregatedDays) {
isHighestDaysInBranch = false;
}
// Check evaluations (Booking فقط)
if (otherAgg.totalEvalBooking > aggregatedEvalBooking) {
isHighestEvalInBranch = false;
}
// Check bookings
if (otherAgg.totalCount > aggregatedCount) {
isHighestBookInBranch = false;
}
});
if (isHighestDaysInBranch && aggregatedDays >= 26) isMostCommitted = true;
if (isHighestEvalInBranch && aggregatedEvalBooking > 0) isMostEval = true;
if (isHighestBookInBranch && aggregatedCount > 0) isMostBook = true;
});
} else {
// For non-duplicate: "الأكثر تقييماً" = Booking فقط
isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
}
const hasCommitmentBonus = attendance26Days && (isMostEval || isMostBook);
isMostCommitted = hasCommitmentBonus;
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
// Calculate net (for this specific branch row)
// evBooking and evGoogle are already defined at the start of calcStats function
const gross = computeGrossFromBreakdown(emp, _pricingRenderUI);
const fund = gross * getSupportFundRate();
let net = gross - fund;
// Apply 25% bonus only if user manually activated "تم" (no discount)
const attendanceBonus = attendance26Days ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
return { 
net, ev, count: emp.count, branch: emp.branch, name: emp.name, id: emp.id, fund, 
excellenceBonus, hasExcellenceBonus, commitmentBonus, hasCommitmentBonus, 
attendance26Days, attendanceBonus, gross: gross - fund,
isDuplicate, aggregatedCount, aggregatedEval, aggregatedEvalBooking, aggregatedEvalGoogle, aggregatedDays, isMostCommitted, isMostEval, isMostBook
};
};
// الفروع عند الإداريين مفصولين موظفينهم: عند اختيار فرع معين يُعرض فقط موظفو هذا الفرع (مشرف، HR، حسابات، أدمن).
let filtered = [...db];
if (filter !== 'الكل') {
  filtered = filtered.filter(d => d.branch === filter);
}
// Calculate nameCounts FIRST (before calcStats) - from ALL db, not just filtered
// This is critical: we need to know if an employee is duplicate across ALL branches
const nameCounts = {};
db.forEach(emp => {
nameCounts[emp.name] = (nameCounts[emp.name] || 0) + 1;
});
let viewWinners = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []} };
let viewLosers = { net: {val: Infinity, ids: []}, eval: {val: Infinity, ids: []}, evalBooking: {val: Infinity, ids: []}, evalGoogle: {val: Infinity, ids: []}, book: {val: Infinity, ids: []} };
filtered.forEach(emp => {
const s = calcStats(emp);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
// Winners (Best)
if (s.net > viewWinners.net.val) { viewWinners.net.val = s.net; viewWinners.net.ids = [s.id]; }
else if (s.net === viewWinners.net.val) { viewWinners.net.ids.push(s.id); }
// "الأكثر تقييماً" = Booking فقط
if (s.ev > viewWinners.eval.val) { viewWinners.eval.val = s.ev; viewWinners.eval.ids = [s.id]; }
else if (s.ev === viewWinners.eval.val) { viewWinners.eval.ids.push(s.id); }
// Separate tracking for Booking evaluations
if (evBooking > viewWinners.evalBooking.val) { viewWinners.evalBooking.val = evBooking; viewWinners.evalBooking.ids = [s.id]; }
else if (evBooking === viewWinners.evalBooking.val) { viewWinners.evalBooking.ids.push(s.id); }
// Separate tracking for Google Maps evaluations
if (evGoogle > viewWinners.evalGoogle.val) { viewWinners.evalGoogle.val = evGoogle; viewWinners.evalGoogle.ids = [s.id]; }
else if (evGoogle === viewWinners.evalGoogle.val) { viewWinners.evalGoogle.ids.push(s.id); }
if (s.count > viewWinners.book.val) { viewWinners.book.val = s.count; viewWinners.book.ids = [s.id]; }
else if (s.count === viewWinners.book.val) { viewWinners.book.ids.push(s.id); }
// Losers (Worst) - only if value > 0
if (s.net > 0 && s.net < viewLosers.net.val) { viewLosers.net.val = s.net; viewLosers.net.ids = [s.id]; }
else if (s.net > 0 && s.net === viewLosers.net.val) { viewLosers.net.ids.push(s.id); }
// "الأقل تقييماً" = Booking فقط
if (s.ev < viewLosers.eval.val || (s.ev === 0 && viewLosers.eval.val > 0)) { 
viewLosers.eval.val = s.ev; 
viewLosers.eval.ids = [s.id]; 
} else if (s.ev === viewLosers.eval.val) { 
viewLosers.eval.ids.push(s.id); 
}
// Separate tracking for Booking evaluations (losers)
if (evBooking < viewLosers.evalBooking.val || (evBooking === 0 && viewLosers.evalBooking.val > 0)) { 
viewLosers.evalBooking.val = evBooking; 
viewLosers.evalBooking.ids = [s.id]; 
} else if (evBooking === viewLosers.evalBooking.val) { 
viewLosers.evalBooking.ids.push(s.id); 
}
// Separate tracking for Google Maps evaluations (losers)
if (evGoogle < viewLosers.evalGoogle.val || (evGoogle === 0 && viewLosers.evalGoogle.val > 0)) { 
viewLosers.evalGoogle.val = evGoogle; 
viewLosers.evalGoogle.ids = [s.id]; 
} else if (evGoogle === viewLosers.evalGoogle.val) { 
viewLosers.evalGoogle.ids.push(s.id); 
}
if (s.count > 0 && s.count < viewLosers.book.val) { viewLosers.book.val = s.count; viewLosers.book.ids = [s.id]; }
else if (s.count > 0 && s.count === viewLosers.book.val) { viewLosers.book.ids.push(s.id); }
});
// خريطة صافي مُجمّع لكل اسم (للفرز عند عرض «الكل») — nameAgg يجب أن يكون في scope الفرز لاحقاً حتى عند filter !== 'الكل'
let nameToAggNet = {};
let nameAgg = {}; // فارغ عند فرع معيّن؛ يُملأ عند «الكل» فقط
// عند «الكل»: كروت الفائزين من إجماليات مُجمّعة لكل اسم (ليس أعلى صف فقط)
if (filter === 'الكل') {
  const seenNames = new Set();
  filtered.forEach(emp => {
    if (seenNames.has(emp.name)) return;
    seenNames.add(emp.name);
    const allEmpBranches = db.filter(e => e.name === emp.name);
    let totalNetFromBranches = 0;
    let hasExcellence = false;
    let hasCommitment = false;
    allEmpBranches.forEach(branchEmp => {
      const gross = computeGrossFromBreakdown(branchEmp, _pricingRenderUI);
      const fund = gross * getSupportFundRate();
      let branchNet = gross - fund;
      const attendance26Days = branchEmp.attendance26Days === true;
      branchNet = branchNet + (attendance26Days ? branchNet * 0.25 : 0);
      totalNetFromBranches += branchNet;
      const bw = branchWinners[branchEmp.branch];
      if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0 && bw.eval.val > 0) hasExcellence = true;
      if (bw && attendance26Days && (bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0 || bw.book.ids.includes(branchEmp.id) && bw.book.val > 0)) hasCommitment = true;
    });
    let aggNet = totalNetFromBranches + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
    if (typeof getTotalDiscountForEmployee === 'function') aggNet = Math.max(0, aggNet - getTotalDiscountForEmployee(emp.name));
    const agg = getAggregatedStats(emp.name);
    const firstId = allEmpBranches[0].id;
    const hasAttendance26 = allEmpBranches.some(b => b.attendance26Days === true);
    let aggBreakdown = {};
    if (window.adoraTransferMode && allEmpBranches.length > 0) {
      aggBreakdown = {
        aggStaffCount: allEmpBranches.reduce((s, e) => s + (e._staffCount || 0), 0),
        aggReception: allEmpBranches.reduce((s, e) => s + (e._reception || 0), 0),
        aggBooking: allEmpBranches.reduce((s, e) => s + (e._booking || 0), 0),
        aggMorning: allEmpBranches.reduce((s, e) => s + (e._morning || 0), 0),
        aggEvening: allEmpBranches.reduce((s, e) => s + (e._evening || 0), 0),
        aggNight: allEmpBranches.reduce((s, e) => s + (e._night || 0), 0),
        aggAlertCount: allEmpBranches.reduce((s, e) => s + (e._alertCount || 0), 0),
        aggAlertTotal: allEmpBranches.reduce((s, e) => s + (e._alertTotal || 0), 0),
        aggVipRooms: {}
      };
      const activeVips = window.adoraActiveVipRooms || [];
      activeVips.forEach(function (num) {
        aggBreakdown.aggVipRooms[num] = allEmpBranches.reduce(function (s, e) {
          return s + ((e._vipRooms && e._vipRooms[num]) || 0);
        }, 0);
      });
    }
    nameAgg[emp.name] = { aggNet, aggEval: agg.totalEvalBooking, aggCount: agg.totalCount, totalEvalGoogle: agg.totalEvalGoogle, hasAttendance26, firstId, ...aggBreakdown };
  });
  Object.keys(nameAgg).forEach(n => { nameToAggNet[n] = nameAgg[n].aggNet; });
  const nameToPoints = {};
  const nameToLevel = {};
  const nameToRank = {};
  const namesList = Object.keys(nameAgg);
  if (namesList.length > 0) {
    // ترتيب حسب الصافي المُجمّع فقط: الأعلى = أفضل تقييم، الأقل = سيء (بدون معادلات)
    const sorted = [...namesList].sort((a, b) => (nameAgg[b].aggNet || 0) - (nameAgg[a].aggNet || 0));
    const N = sorted.length;
    sorted.forEach((name, index) => {
      const rank = index + 1;
      const percentile = N > 1 ? (rank - 1) / (N - 1) : 0;
      let level = 'سيء';
      if (percentile < 0.2) level = 'ممتاز';
      else if (percentile < 0.4) level = 'جيد جداً';
      else if (percentile < 0.6) level = 'جيد';
      else if (percentile < 0.8) level = 'ضعيف';
      const points = Math.round((1 - percentile) * 100);
      nameToPoints[name] = points;
      nameToLevel[name] = level;
      nameToRank[name] = rank;
    });
  }
  const totalNames = namesList.length;
  let bestNetName = null, bestEvalName = null, bestBookName = null;
  let bestNetVal = -1, bestEvalVal = -1, bestBookVal = -1;
  Object.keys(nameAgg).forEach(name => {
    const a = nameAgg[name];
    if (a.aggNet > bestNetVal) { bestNetVal = a.aggNet; bestNetName = name; }
    if (a.aggEval > bestEvalVal) { bestEvalVal = a.aggEval; bestEvalName = name; }
    if (a.aggCount > bestBookVal) { bestBookVal = a.aggCount; bestBookName = name; }
  });
  // كارت «أعلى صافي» = مرآة لأعلى رقم في عمود الصافي بالجدول (نفس getDisplayNetForEmployee)
  const seenNamesDisp = new Set();
  filtered.forEach(emp => {
    let displayNet = 0;
    if (typeof getDisplayNetForEmployee === 'function') {
      const isDup = db.filter(e => e.name === emp.name).length > 1;
      if (isDup) {
        if (seenNamesDisp.has(emp.name)) return;
        seenNamesDisp.add(emp.name);
        displayNet = getDisplayNetForEmployee(emp.name, { aggregated: true });
      } else {
        displayNet = getDisplayNetForEmployee(emp.id);
      }
    }
    if (displayNet > viewWinners.net.val) { viewWinners.net.val = displayNet; viewWinners.net.ids = [emp.id]; }
    else if (displayNet === viewWinners.net.val && displayNet > 0) { viewWinners.net.ids.push(emp.id); }
  });
  if (bestEvalName != null) { viewWinners.eval.val = bestEvalVal; viewWinners.eval.ids = [nameAgg[bestEvalName].firstId]; }
  if (bestBookName != null) { viewWinners.book.val = bestBookVal; viewWinners.book.ids = [nameAgg[bestBookName].firstId]; }
}
// Check if any employee has evaluations > 0 (to show/hide evaluation badges) - check ALL branches, not just filtered
const hasAnyEvaluations = db.some(emp => ((emp.evaluationsBooking || 0) + (emp.evaluationsGoogle || 0)) > 0);
// Update Cards — عند «الكل» نعرض الاسم فقط (بدون فرع) لأن القيمة مُجمّعة
const getWinnerName = (wObj, nameOnly) => {
if (wObj.val <= 0 || !wObj.ids || !wObj.ids[0]) return '-';
const winner = db.find(d => d.id === wObj.ids[0]);
if (!winner) return '-';
return nameOnly ? winner.name : (winner.name + (filter === 'الكل' ? ` (${winner.branch})` : ''));
};
const nameOnly = (filter === 'الكل');
document.getElementById('topEarnerName').innerText = getWinnerName(viewWinners.net, nameOnly);
document.getElementById('topEarnerValue').innerText = viewWinners.net.val > 0 ? viewWinners.net.val.toFixed(2) + ' ريال' : '-';
document.getElementById('topRatedName').innerText = getWinnerName(viewWinners.eval, nameOnly);
document.getElementById('topRatedValue').innerText = viewWinners.eval.val > 0 ? viewWinners.eval.val + ' تقييم' : '-';
document.getElementById('topBookerName').innerText = getWinnerName(viewWinners.book, nameOnly);
document.getElementById('topBookerValue').innerText = viewWinners.book.val > 0 ? viewWinners.book.val + ' حجز' : '-';
// Apply Sort — عند «الكل» الفرز بالصافي المُجمّع للموظف (من كل الفروع)، وإلا صافي الفرع. دعم فرز حسب أي عمود من الترويسة.
function getSortValue(emp, key, nameAgg, filter, nameCounts) {
  const isDup = filter === 'الكل' && (nameCounts[emp.name] || 0) > 1;
  const agg = nameAgg[emp.name];
  if (key === 'net') {
    return isDup && agg ? agg.aggNet : calcStats(emp).net;
  }
  if (key === 'name') return emp.name;
  if (key === 'evaluations') return emp.evaluations || 0;
  if (key === 'count') return isDup && agg ? (agg.aggCount || 0) : (emp.count || 0);
  if (key === 'evaluationsBooking') return isDup && agg ? (agg.aggEval || 0) : (emp.evaluationsBooking || 0);
  if (key === 'evaluationsGoogle') return isDup && agg ? (agg.totalEvalGoogle || 0) : (emp.evaluationsGoogle || 0);
  if (key === 'attendance26Days') return (isDup && agg ? agg.hasAttendance26 : emp.attendance26Days === true) ? 1 : 0;
  if (key === 'staffCount') return isDup && agg && agg.aggStaffCount != null ? agg.aggStaffCount : (emp._staffCount || 0);
  if (key === 'reception') return isDup && agg && agg.aggReception != null ? agg.aggReception : (emp._reception || 0);
  if (key === 'booking') return isDup && agg && agg.aggBooking != null ? agg.aggBooking : (emp._booking || 0);
  if (key === 'morning') return isDup && agg && agg.aggMorning != null ? agg.aggMorning : (emp._morning || 0);
  if (key === 'evening') return isDup && agg && agg.aggEvening != null ? agg.aggEvening : (emp._evening || 0);
  if (key === 'night') return isDup && agg && agg.aggNight != null ? agg.aggNight : (emp._night || 0);
  if (key === 'alertCount') return isDup && agg && agg.aggAlertCount != null ? agg.aggAlertCount : (emp._alertCount || 0);
  if (key === 'alertTotal') return isDup && agg && agg.aggAlertTotal != null ? agg.aggAlertTotal : (emp._alertTotal || 0);
  if (key.indexOf('vip_') === 0) {
    const num = key.replace('vip_', '');
    if (isDup && agg && agg.aggVipRooms && agg.aggVipRooms[num] != null) return agg.aggVipRooms[num];
    return (emp._vipRooms && emp._vipRooms[num]) || 0;
  }
  return emp[key] != null ? emp[key] : 0;
}
filtered.sort((a, b) => {
  const valA = getSortValue(a, currentSort.key, nameAgg, filter, nameCounts);
  const valB = getSortValue(b, currentSort.key, nameAgg, filter, nameCounts);
  if (currentSort.key === 'name') {
    return currentSort.order === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
  }
  const cmp = currentSort.order === 'asc' ? valA - valB : valB - valA;
  if (cmp === 0) return a.name.localeCompare(b.name, 'ar');
  return cmp;
});
let totalFund = 0, totalNet = 0, totalBookings = 0, totalEval = 0;
let totalNetNoEval = 0;
let totalExcellenceBonus = 0;
let excellenceEmployees = []; // Employees with excellence bonus
let lastEmpKey = ""; // Track last employee key (name + branch) instead of just name
// Track which duplicate employees already got their bonus applied (to apply only once)
// First pass: determine which row should get the bonus for each duplicate employee
const bonusApplied = {}; // { empName: { excellenceRowId: null, commitmentRowId: null, challengeRowId: null } }
// Pre-calculate which row gets bonus for duplicates
filtered.forEach((emp) => {
if (nameCounts[emp.name] > 1) {
if (!bonusApplied[emp.name]) {
const s = calcStats(emp);
const allEmpRows = filtered.filter(e => e.name === emp.name);
// Find row that achieved excellence bonus (has highest net, or first row if equal)
let excellenceRowId = null;
if (s.hasExcellenceBonus) {
let maxNet = calcStats(allEmpRows[0]).net;
excellenceRowId = allEmpRows[0].id;
allEmpRows.forEach(e => {
const stats = calcStats(e);
if (stats.net > maxNet) {
maxNet = stats.net;
excellenceRowId = e.id;
}
});
}
// Find row that achieved commitment bonus (has highest total amount including commitment bonus)
// First, check all branches to see if employee qualifies for commitment bonus in any branch
let commitmentRowId = null;
let maxTotalAmount = -1;
allEmpRows.forEach(e => {
const stats = calcStats(e);
// Only consider branches where employee actually qualifies for commitment bonus
if (stats.hasCommitmentBonus) {
// Calculate total amount including commitment bonus for this branch
const totalAmount = stats.net + stats.commitmentBonus;
if (totalAmount > maxTotalAmount) {
maxTotalAmount = totalAmount;
commitmentRowId = e.id;
}
}
});
// Find row that should get challenge bonus (25%) - has highest total amount (net + attendanceBonus)
// First, check all branches to see if employee qualifies for challenge bonus (attendance26Days = true) in any branch
let challengeRowId = null;
let maxChallengeTotalAmount = -1;
allEmpRows.forEach(e => {
const stats = calcStats(e);
// Only consider branches where employee actually qualifies for challenge bonus (attendance26Days = true)
if (stats.attendance26Days && stats.attendanceBonus > 0) {
// Calculate total amount including challenge bonus for this branch
// Note: stats.net already includes attendanceBonus, so we use it directly
const totalAmount = stats.net;
if (totalAmount > maxChallengeTotalAmount) {
maxChallengeTotalAmount = totalAmount;
challengeRowId = e.id;
}
}
});
bonusApplied[emp.name] = {
excellenceRowId: excellenceRowId,
commitmentRowId: commitmentRowId,
challengeRowId: challengeRowId
};
}
}
});
// In "الكل" view: group duplicate employees into single row
// Track which employee names we've already displayed
const displayedNames = new Set();
let displayIndex = 0;
var rowHtmls = [];
var evalTabIndex = 0; // ترتيب Tab للمشرف بين خانات التقييم (مثل HR)
// عدد الأعمدة المرئية في الترويسة لتمديد صف الشارات حتى نهاية الجدول (مطابق للـ footer)
var tableColCount = (function() {
  var mainRow = document.querySelector('.main-header-row');
  if (!mainRow) return 99;
  var n = 0;
  mainRow.querySelectorAll('th').forEach(function(th) {
    if (th.offsetParent !== null && window.getComputedStyle(th).display !== 'none') n++;
  });
  return n > 0 ? n : 99;
})();

// Ensure we process ALL employees in "الكل" view
filtered.forEach((emp, index) => {
// In "الكل" view: skip duplicate rows (show only first occurrence per name)
// For non-duplicate employees: always display
// For duplicate employees: display only once (first occurrence)
if (filter === 'الكل' && nameCounts[emp.name] > 1) {
if (displayedNames.has(emp.name)) {
// Skip this duplicate row - already displayed in aggregated form
return;
}
displayedNames.add(emp.name);
}
// All other employees (non-duplicates) will be displayed normally

const s = calcStats(emp);
var _grossNoEval = computeGrossFromBreakdown(emp, _pricingRenderUI) - ((emp.evaluationsBooking || 0) * (_pricingRenderUI.rateEvalBooking || 0)) - ((emp.evaluationsGoogle || 0) * (_pricingRenderUI.rateEvalGoogle || 0));
totalNetNoEval += _grossNoEval * 0.85;
// For duplicate employees: apply bonus only once (on the designated row)
let finalExcellenceBonus = s.excellenceBonus;
let finalCommitmentBonus = s.commitmentBonus;
let finalAttendanceBonus = s.attendanceBonus;
let finalAttendance26Days = s.attendance26Days;
let finalHasExcellenceBonus = s.hasExcellenceBonus;
let finalHasCommitmentBonus = s.hasCommitmentBonus;
if (s.isDuplicate) {
const shouldApplyExcellence = bonusApplied[emp.name]?.excellenceRowId === emp.id;
const shouldApplyCommitment = bonusApplied[emp.name]?.commitmentRowId === emp.id;
const shouldApplyChallenge = bonusApplied[emp.name]?.challengeRowId === emp.id;
finalExcellenceBonus = shouldApplyExcellence ? s.excellenceBonus : 0;
finalCommitmentBonus = shouldApplyCommitment ? s.commitmentBonus : 0;
// For duplicates in "الكل" view: sum net from all branches instead of using single branch net
let duplicateFinalNet = 0;
if (filter === 'الكل' && s.isDuplicate) {
// Get all branches for this employee
const allEmpBranches = db.filter(e => e.name === emp.name);
// حافز تحدي الظروف (25%): يُعطى مرة واحدة للمتكرر — الفرع الذي له أعلى صافي بعد الـ 25% (نفس منطق challengeRowId)
let challengeRowId = null;
let maxChallengeTotalAmount = -1;
allEmpBranches.forEach(branchEmp => {
  const branchRate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
  const branchEvBooking = branchEmp.evaluationsBooking || 0;
  const branchEvGoogle = branchEmp.evaluationsGoogle || 0;
  const branchGross = computeGrossFromBreakdown(branchEmp);
  const branchFund = branchGross * getSupportFundRate();
  let eNet = branchGross - branchFund;
  const eAttendance26Days = branchEmp.attendance26Days === true;
  const eAttendanceBonus = eAttendance26Days ? eNet * 0.25 : 0;
  eNet = eNet + eAttendanceBonus;
  if (eAttendance26Days && eAttendanceBonus > 0 && eNet > maxChallengeTotalAmount) {
    maxChallengeTotalAmount = eNet;
    challengeRowId = branchEmp.id;
  }
});
let totalNetFromBranches = 0;
let totalFundFromBranches = 0;
let hasExcellenceForEmployee = false;
let hasCommitmentForEmployee = false;
allEmpBranches.forEach(branchEmp => {
// Calculate net for this branch (25% only for the branch that won challengeRowId)
const branchRate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
const branchEvBooking = branchEmp.evaluationsBooking || 0;
const branchEvGoogle = branchEmp.evaluationsGoogle || 0;
const branchGross = computeGrossFromBreakdown(branchEmp);
const branchFund = branchGross * getSupportFundRate();
let branchNet = branchGross - branchFund;
const branchAttendance26Days = branchEmp.attendance26Days === true;
const branchAttendanceBonus = (branchAttendance26Days && challengeRowId === branchEmp.id) ? branchNet * 0.25 : 0;
branchNet = branchNet + branchAttendanceBonus;
totalNetFromBranches += branchNet;
totalFundFromBranches += branchFund;
// Check if employee has excellence/commitment in ANY branch (to match card "الأكثر مكافأة")
const bw = branchWinners[branchEmp.branch];
if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0 && bw.eval.val > 0) hasExcellenceForEmployee = true;
if (bw && branchAttendance26Days && ((bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0) || (bw.book.ids.includes(branchEmp.id) && bw.book.val > 0))) hasCommitmentForEmployee = true;
});
// Add fund to totalFund (sum from all branches)
totalFund += totalFundFromBranches;
// Use employee-level bonuses (any branch) so table net matches card "الأكثر مكافأة"
finalExcellenceBonus = hasExcellenceForEmployee ? 50 : 0;
finalCommitmentBonus = hasCommitmentForEmployee ? 50 : 0;
finalHasExcellenceBonus = hasExcellenceForEmployee;
finalHasCommitmentBonus = hasCommitmentForEmployee;
// Add bonuses once (not per branch)
duplicateFinalNet = totalNetFromBranches + finalExcellenceBonus + finalCommitmentBonus;
// Apply discounts (calculate total discount from all branches)
if (typeof getTotalDiscountForEmployee === 'function') {
  const totalDiscountAmount = getTotalDiscountForEmployee(emp.name);
  duplicateFinalNet = Math.max(0, duplicateFinalNet - totalDiscountAmount);
}
} else {
// For branch view: use existing logic
totalFund += s.fund; // Add fund only for branch view
if (!shouldApplyChallenge && s.attendanceBonus > 0) {
// Remove attendanceBonus from net (it was already added in calcStats)
s.net = s.net - s.attendanceBonus;
finalAttendanceBonus = 0;
finalAttendance26Days = false;
} else if (shouldApplyChallenge) {
// Keep attendanceBonus as calculated
finalAttendanceBonus = s.attendanceBonus;
finalAttendance26Days = s.attendance26Days;
}
duplicateFinalNet = s.net + finalExcellenceBonus + finalCommitmentBonus + finalAttendanceBonus;
if (typeof getDiscountForEmployeeInBranch === 'function') {
  let employeeDiscount = getDiscountForEmployeeInBranch(emp.name, s.net + finalAttendanceBonus);
  if (typeof getHotelRatingDeductionForEmployee === 'function') employeeDiscount += getHotelRatingDeductionForEmployee(emp.name);
  duplicateFinalNet = Math.max(0, duplicateFinalNet - employeeDiscount);
}
}
totalNet += duplicateFinalNet;
} else {
totalFund += s.fund;
let nonDuplicateFinalNet = s.net + s.excellenceBonus + s.commitmentBonus;
if (typeof getDiscountForEmployeeInBranch === 'function') {
  let employeeDiscount = getDiscountForEmployeeInBranch(emp.name, s.net);
  if (typeof getHotelRatingDeductionForEmployee === 'function') employeeDiscount += getHotelRatingDeductionForEmployee(emp.name);
  nonDuplicateFinalNet = Math.max(0, nonDuplicateFinalNet - employeeDiscount);
}
totalNet += nonDuplicateFinalNet;
}
// Update s object to reflect actual bonus application (for display)
s.excellenceBonus = finalExcellenceBonus;
s.hasExcellenceBonus = finalHasExcellenceBonus;
s.commitmentBonus = finalCommitmentBonus;
s.hasCommitmentBonus = finalHasCommitmentBonus;
s.attendanceBonus = finalAttendanceBonus;
s.attendance26Days = finalAttendance26Days;
// For duplicates in "الكل" view: use aggregated totals
if (filter === 'الكل' && nameCounts[emp.name] > 1) {
totalBookings += s.aggregatedCount || s.count;
totalEval += s.aggregatedEval || s.ev;
} else {
totalBookings += s.count;
totalEval += s.ev;
}
// Track excellence bonus
if (s.hasExcellenceBonus) {
if (s.isDuplicate) {
// For duplicate: only count once
if (!excellenceEmployees.find(e => e.name === emp.name)) {
totalExcellenceBonus += s.excellenceBonus;
excellenceEmployees.push({ name: emp.name, branch: emp.branch });
}
} else {
totalExcellenceBonus += s.excellenceBonus;
excellenceEmployees.push({ name: emp.name, branch: emp.branch });
}
}
// In "الكل" view: mark as duplicate if name appears in multiple branches
const isDuplicate = (filter === 'الكل' && nameCounts[emp.name] > 1);
const showBranch = (filter === 'الكل' && nameCounts[emp.name] > 1);
rowHtmls.push(`
<tr data-fund="${s.fund}" 
data-net="${s.net}" 
data-eval="${s.ev}"
data-name="${emp.name}"
data-branch="${emp.branch}"
data-id="${emp.id}"
class="${isDuplicate ? 'bg-orange-400/8 is-dup-row group border-l-4 border-orange-300/40' : 'hover:bg-white/5'}"
style="animation: fadeInUp 0.4s ease-out ${displayIndex * 0.03}s both;">
<td class="p-2 text-right checkbox-col no-print">
<input type="checkbox" 
class="emp-checkbox cursor-pointer accent-turquoise" 
onclick="updateSelectedUI()">
</td>
<td class="col-m p-2 text-right font-mono text-gray-400 text-sm font-medium">
${displayIndex + 1}
</td>
<td class="col-name p-2 text-right">
${(isDuplicate && filter === 'الكل') ? `
<div style="text-align: right; direction: rtl;">
<div class="font-bold text-sm text-orange-100 print:text-black" style="text-align: right; direction: rtl;">
<span onclick="${filter === 'الكل' ? `handleEmployeeNameClick('${(typeof escAttr === 'function' ? escAttr(emp.name) : String(emp.name || '').replace(/'/g, "\\'"))}', '${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/'/g, "\\'"))}', true)` : `showEmployeeReport('${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/'/g, "\\'"))}')`}" class="cursor-pointer hover:text-turquoise transition-colors" title="اضغط لعرض التقرير">${(typeof escHtml === 'function' ? escHtml(emp.name) : String(emp.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'))}</span>
<span class="badges-wrapper" style="display: inline-block; margin-right: 4px;">
${(() => {
let badgesHtml = '';
const allEmpBranches = db.filter(d => d.name === emp.name);
if (filter === 'الكل' && typeof nameToPoints !== 'undefined' && nameToPoints[emp.name] != null) {
const pts = nameToPoints[emp.name];
const lvl = nameToLevel[emp.name];
const barPct = Math.min(100, Math.max(0, pts));
const rank = typeof nameToRank !== 'undefined' ? nameToRank[emp.name] : 0;
const total = typeof totalNames !== 'undefined' ? totalNames : 0;
const ratingColor = lvl === 'ممتاز' ? 'text-green-400' : lvl === 'جيد جداً' ? 'text-green-300' : lvl === 'جيد' ? 'text-yellow-400' : lvl === 'ضعيف' ? 'text-orange-400' : 'text-red-400';
return '<div class="mt-1.5 w-full max-w-[180px] rounded-full overflow-hidden relative" style="height: 6px;"><div style="position: absolute; inset: 0; background: #4b5563;"></div><div style="position: absolute; left: 0; top: 0; width: ' + barPct + '%; height: 100%; background: linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e 100%);"></div><span style="position: absolute; left: ' + barPct + '%; top: 0; transform: translateX(-50%); width: 4px; height: 100%; background: #fff; border-radius: 2px; box-shadow: 0 0 2px rgba(0,0,0,0.5);"></span></div><div class="flex flex-col items-start gap-0.5 mt-1"><span class="text-xs ' + ratingColor + '">ترتيب ' + rank + ' من ' + total + '</span><div class="text-xs font-semibold ' + ratingColor + '">' + lvl + '</div></div>';
}
if (filter === 'الكل') {
const branchBadges = { eval: [], book: [] };
allEmpBranches.forEach(empBranch => {
const isBranchMaxEval = branchWinners[empBranch.branch]?.eval.ids.includes(empBranch.id) && branchWinners[empBranch.branch].eval.val > 0;
const isBranchMaxBook = branchWinners[empBranch.branch]?.book.ids.includes(empBranch.id) && branchWinners[empBranch.branch].book.val > 0;
if (isBranchMaxEval && hasAnyEvaluations && !branchBadges.eval.includes(empBranch.branch)) branchBadges.eval.push(empBranch.branch);
if (isBranchMaxBook && !branchBadges.book.includes(empBranch.branch)) branchBadges.book.push(empBranch.branch);
});
if (branchBadges.eval.length > 0) {
const branchText = branchBadges.eval.length === 1 ? 'بال' + branchBadges.eval[0] : branchBadges.eval.length === 2 ? 'في الفرعين' : 'في ' + branchBadges.eval.length + ' فروع';
badgesHtml += '<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً">⭐ الأفضل تقييماً ' + branchText + '</span>';
}
if (branchBadges.book.length > 0) {
const branchText = branchBadges.book.length === 1 ? 'بال' + branchBadges.book[0] : branchBadges.book.length === 2 ? 'في الفرعين' : 'في ' + branchBadges.book.length + ' فروع';
badgesHtml += '<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات">🎯 الأكثر حجوزات ' + branchText + '</span>';
}
if (viewWinners.eval.ids.includes(emp.id) && viewWinners.eval.val > 0 && hasAnyEvaluations) {
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 ? 'في ' + uniqueBranches[0] : uniqueBranches.length === 2 ? 'في الفرعين' : 'في ' + uniqueBranches.length + ' فروع';
badgesHtml += '<span class="text-yellow-500 text-xs print:text-yellow-700 font-bold" title="الأعلى تقييماً في الكل">⭐ بطل التقييم ' + branchText + '</span>';
}
if (viewWinners.book.ids.includes(emp.id) && viewWinners.book.val > 0) {
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 ? 'في ' + uniqueBranches[0] : uniqueBranches.length === 2 ? 'في الفرعين' : 'في ' + uniqueBranches.length + ' فروع';
badgesHtml += '<span class="text-blue-500 text-xs print:text-blue-700 font-bold" title="الأكثر حجوزات في الكل">🎯 بطل الحجوزات ' + branchText + '</span>';
}
if (viewLosers.eval.ids.includes(emp.id) && viewLosers.eval.val < Infinity && viewLosers.eval.val === 0 && ((emp.evaluationsBooking || 0) + (emp.evaluationsGoogle || 0)) === 0 && hasAnyEvaluations) {
const worstBranches = allEmpBranches.filter(eb => viewLosers.eval.ids.includes(eb.id));
const uniqueBranches = [...new Set(worstBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 ? 'بال' + uniqueBranches[0] : uniqueBranches.length === 2 ? 'في الفرعين' : 'في ' + uniqueBranches.length + ' فروع';
badgesHtml += '<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل تقييماً في الكل"><span class="text-red-500 text-[8px] leading-none inline-block">↓</span> الأقل تقييماً ' + branchText + '</span>';
}
if (viewLosers.book.ids.includes(emp.id) && viewLosers.book.val < Infinity) {
const worstBranches = allEmpBranches.filter(eb => viewLosers.book.ids.includes(eb.id));
const uniqueBranches = [...new Set(worstBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 ? 'بال' + uniqueBranches[0] : uniqueBranches.length === 2 ? 'في الفرعين' : 'في ' + uniqueBranches.length + ' فروع';
badgesHtml += '<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل حجوزات في الكل">😟 الأقل حجوزات ' + branchText + '</span>';
}
} else {
// When showing specific branch: show only badges for current branch
// Check if any employee in ANY branch has evaluations > 0 (global check)
const branchHasEvaluations = db.some(e => ((e.evaluationsBooking || 0) + (e.evaluationsGoogle || 0)) > 0);
// "الأكثر تقييماً" = Booking فقط
const bw = branchWinners[emp.branch];
const isBranchMaxEval = bw?.eval?.ids?.includes(emp.id) && bw?.eval?.val > 0;
const isBranchMaxEvalBooking = bw?.evalBooking?.ids?.includes(emp.id) && bw?.evalBooking?.val > 0;
const isBranchMaxEvalGoogle = bw?.evalGoogle?.ids?.includes(emp.id) && bw?.evalGoogle?.val > 0;
const isBranchMaxBook = bw?.book?.ids?.includes(emp.id) && bw?.book?.val > 0;
// Only show evaluation badges if at least one employee in branch has evaluations > 0
if (isBranchMaxEval && branchHasEvaluations) {
badgesHtml += `<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً في ${emp.branch} (Booking)">⭐ الأفضل تقييماً في ${emp.branch}</span>`;
}
// شارة منفصلة: أكثر تقييم Booking
if (isBranchMaxEvalBooking && branchHasEvaluations) {
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="أكثر تقييم Booking في ${emp.branch}">📱 أكثر تقييم Booking في ${emp.branch}</span>`;
}
// شارة منفصلة: أكثر تقييم Google Maps
if (isBranchMaxEvalGoogle && branchHasEvaluations) {
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600" title="أكثر تقييم Google Maps في ${emp.branch}">🗺️ أكثر تقييم Google Maps في ${emp.branch}</span>`;
}
if (isBranchMaxBook) {
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات في ${emp.branch}">🎯 الأكثر حجوزات في ${emp.branch}</span>`;
}
// "الأقل تقييماً" = Booking فقط
const bl = branchLosers[emp.branch];
const isBranchMinEval = bl?.eval?.ids?.includes(emp.id) && bl?.eval?.val < Infinity && (emp.evaluationsBooking || 0) === 0;
const isBranchMinBook = bl?.book?.ids?.includes(emp.id) && bl?.book?.val < Infinity;
// Only show evaluation badges if at least one employee in branch has evaluations > 0
if (isBranchMinEval && branchHasEvaluations) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل تقييماً في ${emp.branch} (Booking)"><span class="text-red-400 text-[8px] leading-none inline-block">↓</span> الأقل تقييماً في ${emp.branch}</span>`;
}
if (isBranchMinBook) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل حجوزات في ${emp.branch}">😟 الأقل حجوزات في ${emp.branch}</span>`;
}
}
// Commitment badge - Show ONLY for employees with attendance26Days = true
// CRITICAL: Get fresh data from db to ensure we check the current state
const currentEmpFromDb = db.find(d => d.id === emp.id);
const attendance26Days = currentEmpFromDb ? (currentEmpFromDb.attendance26Days !== false) : false;
if (attendance26Days === true) {
if (filter !== 'الكل') {
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً في ${emp.branch}">✓ الأكثر التزاماً في ${emp.branch}</span>`;
} else {
// When showing "الكل": find all branches where this employee has attendance26Days = true
const currentEmpBranches = allEmpBranches.filter(eb => eb.id === emp.id && eb.attendance26Days !== false);
const uniqueBranches = [...new Set(currentEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: uniqueBranches.length > 0
? `${uniqueBranches.length} فروع`
: emp.branch;
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً">✓ الأكثر التزاماً ${branchText}</span>`;
}
}
// Excellence badge (most bookings + most evaluations in same branch) - check for current employee only
const isCurrentEmpMaxEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
const isCurrentEmpMaxBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
const hasExcellence = isCurrentEmpMaxBook && isCurrentEmpMaxEval;
if (hasExcellence) {
if (filter !== 'الكل') {
// When showing specific branch: show only current branch
badgesHtml += `<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات) في ${emp.branch}">✨ مبدع ${emp.branch}</span>`;
} else {
// When showing "الكل": find only branches where THIS specific employee (emp.id) has excellence
// Only check branches where the current employee (emp.id) exists and has excellence
const currentEmpBranches = allEmpBranches.filter(eb => eb.id === emp.id);
const excellenceBranches = currentEmpBranches.filter(eb => 
branchWinners[eb.branch]?.eval.ids.includes(eb.id) && 
branchWinners[eb.branch]?.book.ids.includes(eb.id) &&
branchWinners[eb.branch].eval.val > 0 &&
branchWinners[eb.branch].book.val > 0
);
const uniqueBranches = [...new Set(excellenceBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: uniqueBranches.length > 0
? `${uniqueBranches.length} فروع`
: emp.branch; // Fallback to current branch if no matches
badgesHtml += `<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات)">✨ مبدع ${branchText}</span>`;
}
}
return badgesHtml;
})()}
</span>
</div>
<div class="text-[10px] text-orange-400/50 font-semibold mt-0.5" style="text-align: right;">
${(() => {
// For duplicate employees: show all branches joined with " - "
if (isDuplicate && filter === 'الكل') {
const allEmpBranches = db.filter(d => d.name === emp.name);
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
return uniqueBranches.join(' - ');
}
// For non-duplicate or branch view: show current branch
return emp.branch;
})()}
</div>
</div>
` : `
<div class="font-bold text-sm text-white print:text-black" style="text-align: right; direction: rtl;">
<span onclick="${filter === 'الكل' ? `handleEmployeeNameClick('${(typeof escAttr === 'function' ? escAttr(emp.name) : String(emp.name || '').replace(/'/g, "\\'"))}', '${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/'/g, "\\'"))}', false)` : `showEmployeeReport('${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/'/g, "\\'"))}')`}" class="cursor-pointer hover:text-turquoise transition-colors" title="اضغط لعرض التقرير">${(typeof escHtml === 'function' ? escHtml(emp.name) : String(emp.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'))}</span>
</div>
${showBranch && !isDuplicate ? `
<div class="text-[10px] text-turquoise/60 font-semibold uppercase no-print mt-0.5 tracking-wider">
${emp.branch}
</div>
` : ''}
`}
</td>
<td class="col-count col-count-single p-2 text-center font-mono font-semibold text-white print:text-black text-sm number-display" ${window.adoraTransferMode ? 'style="display:none"' : ''}>
${(filter === 'الكل' && isDuplicate) ? (s.aggregatedCount || emp.count) : emp.count}
</td>
${window.adoraTransferMode ? (function() {
  var bk = emp;
  var allBranches = db.filter(function(e) { return e.name === emp.name; });
  var isDup = filter === 'الكل' && allBranches.length > 1;
  var staffCount = isDup ? allBranches.reduce(function(s, e) { return s + (e._staffCount || 0); }, 0) : (bk._staffCount || 0);
  var reception = isDup ? allBranches.reduce(function(s, e) { return s + (e._reception || 0); }, 0) : (bk._reception || 0);
  var booking = isDup ? allBranches.reduce(function(s, e) { return s + (e._booking || 0); }, 0) : (bk._booking || 0);
  var morning = isDup ? allBranches.reduce(function(s, e) { return s + (e._morning || 0); }, 0) : (bk._morning || 0);
  var evening = isDup ? allBranches.reduce(function(s, e) { return s + (e._evening || 0); }, 0) : (bk._evening || 0);
  var night = isDup ? allBranches.reduce(function(s, e) { return s + (e._night || 0); }, 0) : (bk._night || 0);
  var alertCount = isDup ? allBranches.reduce(function(s, e) { return s + (e._alertCount || 0); }, 0) : (bk._alertCount || 0);
  var alertTotal = isDup ? allBranches.reduce(function(s, e) { return s + (e._alertTotal || 0); }, 0) : (bk._alertTotal || 0);
  // VIP rooms
  var vipRooms = {};
  if (isDup) {
    allBranches.forEach(function(e) {
      if (e._vipRooms) Object.keys(e._vipRooms).forEach(function(k) { vipRooms[k] = (vipRooms[k] || 0) + (e._vipRooms[k] || 0); });
    });
  } else {
    vipRooms = bk._vipRooms || {};
  }
  var empNameEsc = typeof escAttr === 'function' ? escAttr(emp.name) : String(emp.name || '').replace(/'/g, "\\'");
  var empBranchEsc = isDup ? '' : (typeof escAttr === 'function' ? escAttr(emp.branch) : String(emp.branch || '').replace(/'/g, "\\'"));
  function cell(val, type, extraClass) {
    var cls = 'col-breakdown p-2 text-center font-mono text-sm font-medium ' + (extraClass || '');
    if (val > 0) {
      return '<td class="' + cls + '"><button onclick="openBreakdownDrilldown(\'' + empNameEsc + '\', \'' + empBranchEsc + '\', \'' + type + '\')" class="hover:underline cursor-pointer transition-colors font-medium">' + val + '</button></td>';
    }
    return '<td class="' + cls + '">—</td>';
  }
  var html = '';
  html += '<td class="col-breakdown td-section-end p-2 text-center font-mono font-semibold text-cyan-300 text-sm">' + staffCount + '</td>';
  html += cell(reception, 'استقبال', 'text-emerald-300');
  html += cell(booking, 'بوكينج', 'text-orange-300 td-section-start');
  html += cell(morning, 'صباح', 'text-amber-300');
  html += cell(evening, 'مساء', 'text-indigo-300');
  html += cell(night, 'ليل', 'text-gray-300 td-section-start');
  var activeVips = window.adoraActiveVipRooms || [];
  activeVips.forEach(function(num, vipIdx) {
    var count = vipRooms[num] || 0;
    var sectionClass = vipIdx === activeVips.length - 1 ? ' td-section-start' : '';
    if (count > 0) {
      html += '<td class="col-breakdown p-2 text-center font-mono font-semibold text-amber-300 text-sm' + sectionClass + '"><button onclick="openBreakdownDrilldown(\'' + empNameEsc + '\', \'' + empBranchEsc + '\', \'vip\', \'' + num + '\')" class="hover:underline cursor-pointer">' + count + '</button></td>';
    } else {
      html += '<td class="col-breakdown p-2 text-center font-mono text-sm text-gray-500' + sectionClass + '">0</td>';
    }
  });
  html += cell(alertCount, 'alert', 'text-red-300');
  html += '<td class="col-breakdown td-section-start p-2 text-center font-mono text-sm">' + (alertTotal > 0 ? '<button onclick="openBreakdownDrilldown(\'' + empNameEsc + '\', \'' + empBranchEsc + '\', \'alertTotal\')" class="text-red-300 hover:underline cursor-pointer font-medium">' + Math.round(alertTotal).toLocaleString('en-SA') + '</button>' : '<span class="text-gray-500">—</span>') + '</td>';
  return html;
})() : ''}
<td class="col-attendance td-section-start p-2 text-center${(() => { try { var r = localStorage.getItem('adora_current_role'); var submitted = typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted(); return (r === 'hr' && !submitted) ? ' admin-entry-zone admin-entry-hr' : ''; } catch(e) { return ''; } })()}">
<div class="flex flex-row items-center justify-center gap-1">
<div class="attendance-readonly-accounting flex flex-col items-center gap-1" style="display:none;">${(() => { const allEb = db.filter(e => e.name === emp.name); const isDup = filter === 'الكل' && allEb.length > 1; let days = 0, totalDays = 0, branchDaysStr = (emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[emp.branch]) || '0'; if (isDup && filter === 'الكل') { totalDays = allEb.reduce((s, eb) => s + (parseInt(eb.attendanceDaysPerBranch && eb.attendanceDaysPerBranch[eb.branch]) || 0), 0); days = totalDays; } else { days = parseInt(branchDaysStr) || 0; } const colorClass = days >= 26 ? 'text-green-400' : 'text-red-400'; const statusText = days >= 26 ? 'تم' : 'لم يتم'; const daysSpan = days < 26 ? '<span class="text-yellow-300 text-sm font-bold">' + days + ' يوم</span>' : ''; const totalSpan = (isDup && filter === 'الكل') ? '' : (!isDup ? '<span class="text-[9px] text-yellow-300">' + emp.branch + ': ' + branchDaysStr + '</span>' : ''); const statusWithTotal = (isDup && filter === 'الكل' && days >= 26) ? (statusText + ' ' + totalDays) : statusText;
return '<span class="text-[9px] font-bold ' + colorClass + '">' + statusWithTotal + '</span>' + daysSpan + totalSpan; })()}</div>
<div class="attendance-editable inline-flex flex-col items-center justify-center gap-0.5 text-[9px] leading-tight max-w-[85px]">
${filter === 'الكل' ? (() => {
// الكل: عرض نص الحالة فقط بدون toggle — التعديل من الفروع
let statusText, statusColor;
if (isDuplicate) {
const allEmpBranches = db.filter(e => e.name === emp.name);
const firstEmp = allEmpBranches[0];
let totalDays = 0;
if (firstEmp && firstEmp.attendanceDaysPerBranch) {
totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
totalDays = firstEmp?.totalAttendanceDays || 0;
}
// تفعيل المؤشر في أي فرع = تم — يعادل 26 يوم
const hasToggleInAnyBranch = allEmpBranches.some(eb => eb.attendance26Days === true);
const ok = totalDays >= 26 || hasToggleInAnyBranch;
statusText = ok ? '✓ تم ' + totalDays : '✗ لم يتم';
const badgeClass = ok ? 'px-1 py-0.5 rounded text-[9px] font-bold bg-green-500/15 text-green-400 border border-green-500/20 whitespace-nowrap' : 'px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/20 whitespace-nowrap';
return '<div class="text-center leading-tight max-w-[75px] mx-auto truncate"><span class="inline-block max-w-full truncate ' + badgeClass + '">' + statusText + '</span></div>';
} else {
let totalDaysSingle = 0;
if (emp.attendanceDaysPerBranch && emp.branch) {
  totalDaysSingle = parseInt(emp.attendanceDaysPerBranch[emp.branch], 10) || 0;
} else if (typeof emp.totalAttendanceDays === 'number') {
  totalDaysSingle = emp.totalAttendanceDays;
}
statusText = emp.attendance26Days === true ? 'تم ' + totalDaysSingle : 'لم يتم';
statusColor = emp.attendance26Days === true ? 'text-green-400' : 'text-red-400';
const okSingle = emp.attendance26Days === true;
const badgeClassSingle = okSingle ? 'px-1 py-0.5 rounded text-[9px] font-bold bg-green-500/15 text-green-400 border border-green-500/20' : 'px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/20';
return '<div class="text-center leading-tight max-w-[75px] mx-auto"><span class="inline-block ' + badgeClassSingle + '">' + (okSingle ? '✓ ' : '✗ ') + statusText + '</span></div>';
}
})() : `<div class="attendance-indicator">
<label class="relative inline-flex items-center" style="justify-content: center; ${(() => {
const rr = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
const canEditAttendance = rr === 'hr' || rr === 'admin';
// In branch views: check if employee is duplicate
const allEmpBranches = db.filter(e => e.name === emp.name);
const isEmpDuplicate = allEmpBranches.length > 1;
return 'cursor: pointer;';
})()}">
<input type="checkbox" 
class="attendance-toggle" 
data-emp-id="${emp.id}"
${(() => {
// For branch views: use employee's own status
return (emp.attendance26Days === true) ? 'checked' : '';
})()}
${(() => {
const currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'hr' && currentRole !== 'admin') return 'disabled';
// بعد إرسال HR: عرض فقط في كل الفروع
if (currentRole === 'hr' && typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted()) return 'disabled';
return '';
})()}
${(() => {
const currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'hr' && currentRole !== 'admin') return '';
// بعد إرسال HR: لا تعديل
if (currentRole === 'hr' && typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted()) return '';
return 'onchange="updateAttendance(\'' + emp.id + '\', this.checked, this)"';
})()}
title="تفعيل/إلغاء تفعيل إتمام 26 يوم دوام">
<div></div>
</label>
</div>`}
${(function() {
// Check if employee is duplicate (exists in multiple branches)
const allEmpBranches = db.filter(function(e) { return e.name === emp.name; });
const isDuplicate = allEmpBranches.length > 1;
const roleForHr = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
const canEditHr = roleForHr === 'hr' || roleForHr === 'admin';
// الكل للعرض فقط — العدد مُضمَّن في البادج (تم 26) أعلاه — لا نكرر
if (!isDuplicate && filter === 'الكل') {
  return '';
}
// غير متكرر في عرض الفرع: حقل أيام البصمة — HR وأدمن (خانات إدخال نشطة لجميع الموظفين في الفروع)
if (!isDuplicate && filter !== 'الكل') {
var bName = emp.branch;
var bDays = (emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[bName]) || '';
var en = (emp.name || '').replace(/'/g, "\\'");
var bn = (bName || '').replace(/'/g, "\\'");
var roleForReadOnly = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
var readOnly = roleForReadOnly && roleForReadOnly !== 'hr' && roleForReadOnly !== 'admin';
if (roleForReadOnly === 'hr' && typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted()) readOnly = true;
if (readOnly) {
return '<div class="inline-flex items-center justify-center gap-1.5">' +
'<span class="text-yellow-300 font-bold text-sm">' + bDays + '</span></div>';
}
return '<div class="inline-flex items-center justify-center gap-1.5">' +
'<input type="text" dir="rtl" class="attendance-days-input w-16 bg-yellow-400/10 border-2 border-yellow-400/60 rounded px-2 py-1 text-right text-sm text-yellow-300 font-bold focus:outline-none focus:border-yellow-400 focus:bg-yellow-400/20 transition-all font-sans" ' +
'data-emp-name="' + (typeof escHtml === 'function' ? escHtml(emp.name) : (emp.name || '').replace(/"/g, '&quot;')) + '" data-emp-branch="' + (typeof escHtml === 'function' ? escHtml(bName) : (bName || '').replace(/"/g, '&quot;')) + '" placeholder="0" value="' + (typeof escHtml === 'function' ? escHtml(String(bDays)) : String(bDays).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')) + '" ' +
'oninput="handleAttendanceDaysInputSingle(this, \'' + en + '\', \'' + bn + '\')" onblur="handleAttendanceDaysBlur(this, \'' + en + '\', \'' + bn + '\')" ' +
'onkeydown="if(event.key === \'Enter\') { this.blur(); }" title="أيام الحضور في ' + bName + ' (أدخل أي رقم: 8، 22، 30، إلخ)">' +
'</div>';
}
if (!isDuplicate) return '';
let inputsHtml = '';
if (filter === 'الكل') {
// المتكرر في الكل: «تم/لم يتم · المجموع» مُضمَّن في الـ badge أعلاه — لا نكرر
inputsHtml = '';
} else {
// In branch view: show only current branch input (editable)
const branchDays = emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[emp.branch] 
? emp.attendanceDaysPerBranch[emp.branch] 
: '';
const branchNameForInput = emp.branch;
const empNameForInput = emp.name;
const currentRole = localStorage.getItem('adora_current_role');
let isReadOnly = currentRole && currentRole !== 'hr' && currentRole !== 'admin';
if (currentRole === 'hr' && typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted()) isReadOnly = true;
if (isReadOnly) {
  const branchOk = (emp.attendance26Days === true) || (parseInt(branchDays, 10) || 0) >= 26;
  const branchBadge = branchOk ? 'px-1 py-0.5 rounded text-[9px] font-bold bg-green-500/15 text-green-400 border border-green-500/20' : 'px-1 py-0.5 rounded text-[9px] font-bold bg-red-500/15 text-red-400 border border-red-500/20';
  inputsHtml += '<div class="inline-flex items-center justify-center gap-1.5">' +
  '<span class="' + branchBadge + '">' + (branchOk ? '✓ تم' : '✗ لم يتم') + ' · ' + (branchDays || '0') + '</span>' +
  '</div>';
} else {
  inputsHtml += '<div class="inline-flex items-center justify-center gap-1.5">' +
  '<input type="text" dir="rtl" ' +
  'class="attendance-days-input w-16 bg-yellow-400/10 border-2 border-yellow-400/60 rounded px-2 py-1 text-right text-sm text-yellow-300 font-bold focus:outline-none focus:border-yellow-400 focus:bg-yellow-400/20 transition-all font-sans" ' +
  'data-emp-name="' + (typeof escHtml === 'function' ? escHtml(empNameForInput) : (empNameForInput || '').replace(/"/g, '&quot;')) + '" ' +
  'data-emp-branch="' + (typeof escHtml === 'function' ? escHtml(branchNameForInput) : (branchNameForInput || '').replace(/"/g, '&quot;')) + '" ' +
  'placeholder="0" ' +
  'value="' + (typeof escHtml === 'function' ? escHtml(String(branchDays)) : String(branchDays || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')) + '" ' +
  'oninput="handleAttendanceDaysInputSingle(this, \'' + (empNameForInput || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\', \'' + (branchNameForInput || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')" ' +
  'onblur="handleAttendanceDaysBlur(this, \'' + (empNameForInput || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\', \'' + (branchNameForInput || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'") + '\')" ' +
  'onkeydown="if(event.key === \'Enter\') { this.blur(); }" ' +
  'title="أيام الحضور في ' + branchNameForInput + ' (أدخل أي رقم: 8، 22، 30، إلخ)">' +
  '</div>';
}
}
return inputsHtml;
})()}
</div>
</div>
</td>
<td class="col-rate p-2 text-center font-mono text-sm text-gray-300 print:text-black font-medium">
${(emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1))} ريال
</td>
<td class="col-eval-booking p-2 text-center${(() => { try { var r = localStorage.getItem('adora_current_role'); var submitted = typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted(); return (r === 'supervisor' && filter !== 'الكل' && !submitted) ? ' admin-entry-zone admin-entry-supervisor' : ''; } catch(e) { return ''; } })()}">
${(() => {
  const currentRole = localStorage.getItem('adora_current_role');
  const viewOnlyAll = (filter === 'الكل');
  const submittedViewOnly = typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted();
  const isReadOnly = viewOnlyAll || (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin') || submittedViewOnly;
  if (isReadOnly) {
    return `<span class="text-blue-400 font-mono font-semibold text-sm number-display">${isDuplicate ? (s.aggregatedEvalBooking || emp.evaluationsBooking || 0) : (emp.evaluationsBooking || 0)}</span>`;
  }
  return `<input type="text" inputmode="numeric" pattern="[0-9]*" lang="en" dir="ltr" tabindex="${++evalTabIndex}"
data-emp-id="${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/"/g, '&quot;').replace(/'/g, "\\'"))}"
data-eval-type="booking"
value="${emp.evaluationsBooking || ''}" placeholder="0"
oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateEvalBooking('${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/'/g, "\\'"))}', this.value, this, false)"
onblur="updateEvalBooking('${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/'/g, "\\'"))}', this.value, this, true)"
onkeydown="handleEvalKey(event, this)"
class="eval-input text-blue-400 min-w-[3.25rem] w-20 bg-white/5 border border-blue-400/50 rounded px-2 py-1.5 text-center text-base focus:outline-none focus:border-blue-400 transition-colors number-display font-sans">`;
})()}
</td>
<td class="col-eval-google p-2 text-center${(() => { try { var r = localStorage.getItem('adora_current_role'); var submitted = typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted(); return (r === 'supervisor' && filter !== 'الكل' && !submitted) ? ' admin-entry-zone admin-entry-supervisor' : ''; } catch(e) { return ''; } })()}">
${(() => {
  const currentRole = localStorage.getItem('adora_current_role');
  const viewOnlyAll = (filter === 'الكل');
  const submittedViewOnly = typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted();
  const isReadOnly = viewOnlyAll || (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin') || submittedViewOnly;
  if (isReadOnly) {
    return `<span class="text-green-400 font-mono font-semibold text-sm number-display">${isDuplicate ? (s.aggregatedEvalGoogle || emp.evaluationsGoogle || 0) : (emp.evaluationsGoogle || 0)}</span>`;
  }
  return `<input type="text" inputmode="numeric" pattern="[0-9]*" lang="en" dir="ltr" tabindex="${++evalTabIndex}"
data-emp-id="${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/"/g, '&quot;').replace(/'/g, "\\'"))}"
data-eval-type="google"
value="${emp.evaluationsGoogle || ''}" placeholder="0"
oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateEvalGoogle('${emp.id}', this.value, this, false)"
onblur="updateEvalGoogle('${emp.id}', this.value, this, true)"
onkeydown="handleEvalKey(event, this)"
class="eval-input text-green-400 min-w-[3.25rem] w-20 bg-white/5 border border-green-400/50 rounded px-2 py-1.5 text-center text-base focus:outline-none focus:border-green-400 transition-colors number-display font-sans">`;
})()}
</td>
<td class="col-net p-2 text-left font-mono text-sm font-semibold px-2 print:text-black number-display text-white bg-white/[0.04]">
${(() => {
// مصدر واحد: نفس رقم التقرير والجدول — بدون إعادة حساب
const displayNet = (filter === 'الكل' && isDuplicate)
  ? (typeof getDisplayNetForEmployee === 'function' ? getDisplayNetForEmployee(emp.name, { aggregated: true }) : 0)
  : (typeof getDisplayNetForEmployee === 'function' ? getDisplayNetForEmployee(emp.id) : 0);
return `<span class="text-white print:text-black font-semibold">${Number(displayNet).toFixed(2)}</span>`;
})()}
</td>
</tr>
${(() => {
// Generate badges row (separate row for badges)
let badgesHtml = '';
// Get all branches for this employee name
const allEmpBranches = db.filter(d => d.name === emp.name);
if (filter === 'الكل') {
// When showing "الكل": accumulate badges from all branches (only "best" badges, not "worst")
const branchBadges = { eval: [], evalBooking: [], evalGoogle: [], book: [] };
allEmpBranches.forEach(empBranch => {
// "الأكثر تقييماً" = Booking فقط
const bw = branchWinners[empBranch.branch];
if (!bw) return; // Skip if branch not found
const isBranchMaxEval = bw.eval?.ids?.includes(empBranch.id) && bw.eval?.val > 0;
const isBranchMaxEvalBooking = bw.evalBooking?.ids?.includes(empBranch.id) && bw.evalBooking?.val > 0;
const isBranchMaxEvalGoogle = bw.evalGoogle?.ids?.includes(empBranch.id) && bw.evalGoogle?.val > 0;
const isBranchMaxBook = bw.book?.ids?.includes(empBranch.id) && bw.book?.val > 0;
// Only show evaluation badges if at least one employee has evaluations > 0
if (isBranchMaxEval && hasAnyEvaluations && !branchBadges.eval.includes(empBranch.branch)) {
branchBadges.eval.push(empBranch.branch);
}
if (isBranchMaxEvalBooking && hasAnyEvaluations && !branchBadges.evalBooking.includes(empBranch.branch)) {
branchBadges.evalBooking.push(empBranch.branch);
}
if (isBranchMaxEvalGoogle && hasAnyEvaluations && !branchBadges.evalGoogle.includes(empBranch.branch)) {
branchBadges.evalGoogle.push(empBranch.branch);
}
if (isBranchMaxBook && !branchBadges.book.includes(empBranch.branch)) {
branchBadges.book.push(empBranch.branch);
}
});
// Add badges with branch names
// "الأكثر تقييماً" = Booking فقط
if (branchBadges.eval.length > 0) {
const branchText = branchBadges.eval.length === 1 
? `بال${branchBadges.eval[0]}` 
: branchBadges.eval.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.eval.length} فروع`;
badgesHtml += `<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً (Booking)">⭐ الأفضل تقييماً ${branchText}</span>`;
}
// شارة منفصلة: أكثر تقييم Booking
if (branchBadges.evalBooking.length > 0) {
const branchText = branchBadges.evalBooking.length === 1 
? `بال${branchBadges.evalBooking[0]}` 
: branchBadges.evalBooking.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.evalBooking.length} فروع`;
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="أكثر تقييم Booking">📱 أكثر تقييم Booking ${branchText}</span>`;
}
// شارة منفصلة: أكثر تقييم Google Maps
if (branchBadges.evalGoogle.length > 0) {
const branchText = branchBadges.evalGoogle.length === 1 
? `بال${branchBadges.evalGoogle[0]}` 
: branchBadges.evalGoogle.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.evalGoogle.length} فروع`;
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600" title="أكثر تقييم Google Maps">🗺️ أكثر تقييم Google Maps ${branchText}</span>`;
}
if (branchBadges.book.length > 0) {
const branchText = branchBadges.book.length === 1 
? `بال${branchBadges.book[0]}` 
: branchBadges.book.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.book.length} فروع`;
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات">🎯 الأكثر حجوزات ${branchText}</span>`;
}
// View badges (only when showing "الكل")
// "الأكثر تقييماً" = Booking فقط
if (viewWinners.eval.ids.includes(emp.id) && viewWinners.eval.val > 0 && hasAnyEvaluations) {
// Find branches where this employee exists (all branches for this employee name)
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `في ${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-yellow-500 text-xs print:text-yellow-700 font-bold" title="الأعلى تقييماً في الكل (Booking)">⭐ بطل التقييم ${branchText}</span>`;
}
// شارة منفصلة: أكثر تقييم Booking في الكل
if (viewWinners.evalBooking && viewWinners.evalBooking.ids.includes(emp.id) && viewWinners.evalBooking.val > 0 && hasAnyEvaluations) {
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `في ${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-blue-500 text-xs print:text-blue-700 font-bold" title="أكثر تقييم Booking في الكل">📱 بطل Booking ${branchText}</span>`;
}
// شارة منفصلة: أكثر تقييم Google Maps في الكل
if (viewWinners.evalGoogle && viewWinners.evalGoogle.ids.includes(emp.id) && viewWinners.evalGoogle.val > 0 && hasAnyEvaluations) {
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `في ${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-green-500 text-xs print:text-green-700 font-bold" title="أكثر تقييم Google Maps في الكل">🗺️ بطل Google Maps ${branchText}</span>`;
}
if (viewWinners.book.ids.includes(emp.id) && viewWinners.book.val > 0) {
// Find branches where this employee exists (all branches for this employee name)
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `في ${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-blue-500 text-xs print:text-blue-700 font-bold" title="الأكثر حجوزات في الكل">🎯 بطل الحجوزات ${branchText}</span>`;
}
// Only show "worst in الكل" badge - "الأقل تقييماً" = Booking فقط
if (viewLosers.eval.ids.includes(emp.id) && viewLosers.eval.val < Infinity && viewLosers.eval.val === 0 && (emp.evaluationsBooking || 0) === 0 && hasAnyEvaluations) {
const worstBranches = allEmpBranches.filter(eb => viewLosers.eval.ids.includes(eb.id));
const uniqueBranches = [...new Set(worstBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `بال${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل تقييماً في الكل (Booking)"><span class="text-red-500 text-[8px] leading-none inline-block">↓</span> الأقل تقييماً ${branchText}</span>`;
}
if (viewLosers.book.ids.includes(emp.id) && viewLosers.book.val < Infinity) {
const worstBranches = allEmpBranches.filter(eb => viewLosers.book.ids.includes(eb.id));
const uniqueBranches = [...new Set(worstBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `بال${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل حجوزات في الكل">😟 الأقل حجوزات ${branchText}</span>`;
}
} else {
// When showing specific branch: show only badges for current branch
// Check if any employee in ANY branch has evaluations > 0 (global check)
const branchHasEvaluations = db.some(e => ((e.evaluationsBooking || 0) + (e.evaluationsGoogle || 0)) > 0);
// "الأكثر تقييماً" = Booking فقط
const bw = branchWinners[emp.branch];
const isBranchMaxEval = bw?.eval?.ids?.includes(emp.id) && bw?.eval?.val > 0;
const isBranchMaxEvalBooking = bw?.evalBooking?.ids?.includes(emp.id) && bw?.evalBooking?.val > 0;
const isBranchMaxEvalGoogle = bw?.evalGoogle?.ids?.includes(emp.id) && bw?.evalGoogle?.val > 0;
const isBranchMaxBook = bw?.book?.ids?.includes(emp.id) && bw?.book?.val > 0;
// Only show evaluation badges if at least one employee in branch has evaluations > 0
if (isBranchMaxEval && branchHasEvaluations) {
badgesHtml += `<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً في ${emp.branch} (Booking)">⭐ الأفضل تقييماً في ${emp.branch}</span>`;
}
// شارة منفصلة: أكثر تقييم Booking
if (isBranchMaxEvalBooking && branchHasEvaluations) {
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="أكثر تقييم Booking في ${emp.branch}">📱 أكثر تقييم Booking في ${emp.branch}</span>`;
}
// شارة منفصلة: أكثر تقييم Google Maps
if (isBranchMaxEvalGoogle && branchHasEvaluations) {
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600" title="أكثر تقييم Google Maps في ${emp.branch}">🗺️ أكثر تقييم Google Maps في ${emp.branch}</span>`;
}
if (isBranchMaxBook) {
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات في ${emp.branch}">🎯 الأكثر حجوزات في ${emp.branch}</span>`;
}
// "الأقل تقييماً" = Booking فقط
const bl = branchLosers[emp.branch];
const isBranchMinEval = bl?.eval?.ids?.includes(emp.id) && bl?.eval?.val < Infinity && (emp.evaluationsBooking || 0) === 0;
const isBranchMinBook = bl?.book?.ids?.includes(emp.id) && bl?.book?.val < Infinity;
// Only show evaluation badges if at least one employee in branch has evaluations > 0
if (isBranchMinEval && branchHasEvaluations) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل تقييماً في ${emp.branch} (Booking)"><span class="text-red-400 text-[8px] leading-none inline-block">↓</span> الأقل تقييماً في ${emp.branch}</span>`;
}
if (isBranchMinBook) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل حجوزات في ${emp.branch}">😟 الأقل حجوزات في ${emp.branch}</span>`;
}
}
// Commitment badge - Show for employees with attendance26Days = true (using aggregated days for duplicates)
const currentEmpFromDb = db.find(d => d.id === emp.id);
// Use user's manual setting only (default: false) - no auto-calculation
let attendance26Days = currentEmpFromDb ? (currentEmpFromDb.attendance26Days === true) : false;
if (attendance26Days === true) {
if (filter !== 'الكل') {
// Show branch-specific badge
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً في ${emp.branch}">✓ الأكثر التزاماً في ${emp.branch}</span>`;
// For duplicate: also show aggregated badge if applicable
if (nameCounts[emp.name] > 1 && s.isMostCommitted) {
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: `${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-green-500 text-xs print:text-green-700 font-bold" title="الأكثر التزاماً (إجمالي: ${s.aggregatedDays} يوم في ${branchText})">🏆 بطل الالتزام (إجمالي: ${s.aggregatedDays} يوم)</span>`;
}
} else {
// When showing "الكل": show aggregated badge
if (nameCounts[emp.name] > 1) {
// For duplicate: show aggregated badge
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: uniqueBranches.length > 0
? `${uniqueBranches.length} فروع`
: emp.branch;
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً (إجمالي: ${s.aggregatedDays} يوم)">✓ الأكثر التزاماً ${branchText} (${s.aggregatedDays} يوم)</span>`;
// Show aggregated champion badge if applicable
if (s.isMostCommitted) {
badgesHtml += `<span class="text-green-500 text-xs print:text-green-700 font-bold" title="بطل الالتزام (إجمالي: ${s.aggregatedDays} يوم في ${branchText})">🏆 بطل الالتزام (إجمالي: ${s.aggregatedDays} يوم)</span>`;
}
} else {
// For non-duplicate: show branch-specific badge
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً">✓ الأكثر التزاماً في ${emp.branch}</span>`;
}
}
}
// Excellence badge - Show branch-specific + aggregated for duplicates
const isCurrentEmpMaxEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
const isCurrentEmpMaxBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
const hasExcellence = isCurrentEmpMaxBook && isCurrentEmpMaxEval;
// Show branch-specific excellence badge
if (hasExcellence) {
if (filter !== 'الكل') {
badgesHtml += `<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات) في ${emp.branch}">✨ مبدع ${emp.branch}</span>`;
} else {
const currentEmpBranches = allEmpBranches.filter(eb => eb.id === emp.id);
const excellenceBranches = currentEmpBranches.filter(eb => 
branchWinners[eb.branch]?.eval.ids.includes(eb.id) && 
branchWinners[eb.branch]?.book.ids.includes(eb.id) &&
branchWinners[eb.branch].eval.val > 0 &&
branchWinners[eb.branch].book.val > 0
);
const uniqueBranches = [...new Set(excellenceBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: uniqueBranches.length > 0
? `${uniqueBranches.length} فروع`
: emp.branch;
badgesHtml += `<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات)">✨ مبدع ${branchText}</span>`;
}
}
// For duplicate employees: show aggregated excellence badge if applicable
if (nameCounts[emp.name] > 1 && s.hasExcellenceBonus) {
const uniqueBranches = [...new Set(allEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: `${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-turquoise-500 text-xs print:text-turquoise-700 font-bold" title="بطل التفوق (إجمالي: ${s.aggregatedCount} حجز + ${s.aggregatedEval} تقييم في ${branchText})">🏆 بطل التفوق (إجمالي: ${s.aggregatedCount} حجز + ${s.aggregatedEval} تقييم)</span>`;
}
// Only show badges row if there are badges (string concat to avoid nested template closing outer)
if (badgesHtml) {
return '<tr class="badges-row" data-emp-id="' + (emp.id || '').replace(/"/g, '&quot;') + '" data-branch="' + (emp.branch || '').replace(/"/g, '&quot;') + '"><td colspan="' + tableColCount + '"><div class="badges-wrapper">' + badgesHtml + '</div></td></tr>';
}
return '';
})()}
`);
// Increment display index after adding this visible row (so first row shows 1)
displayIndex++;
});
// رسم الجدول تدريجياً (chunked) لتقليل تجميد الواجهة عند عدد كبير من الموظفين
var RENDER_CHUNK_SIZE = 35;
tbody.innerHTML = '';
function appendChunk(startIndex) {
  var end = Math.min(startIndex + RENDER_CHUNK_SIZE, rowHtmls.length);
  for (var i = startIndex; i < end; i++) tbody.insertAdjacentHTML('beforeend', rowHtmls[i]);
  if (end < rowHtmls.length) {
    requestAnimationFrame(function () { appendChunk(end); });
  } else {
    runAfterTableRender();
  }
}
/** زيادة/نقصان التقييمات السلبية لفرع (من أزرار +/−) ثم حفظ ومزامنة وإعادة رسم. */
function applyNegativeRatingStep(branch, delta) {
  // Role guard: admin + supervisor فقط؛ المشرف بعد الإرسال لا يعدّل
  var _roleNeg = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
  if (_roleNeg && _roleNeg !== 'admin' && _roleNeg !== 'supervisor') {
    if (typeof showToast === 'function') showToast('❌ غير مصرح لك بتعديل التقييمات السلبية', 'error');
    return;
  }
  if (_roleNeg === 'supervisor' && typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted()) return;
  if (typeof branchNegativeRatingsCount === 'undefined') return;
  var n = (parseInt(branchNegativeRatingsCount[branch], 10) || 0) + delta;
  branchNegativeRatingsCount[branch] = Math.max(0, n);
  try { localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(branchNegativeRatingsCount)); } catch (e) {}
  if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
  var shouldSync = (_roleNeg !== 'supervisor' && _roleNeg !== 'hr') || (typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted());
  if (shouldSync && typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
  if (typeof renderUI === 'function') renderUI(typeof currentFilter !== 'undefined' ? currentFilter : 'الكل');
}
if (typeof window !== 'undefined') window.applyNegativeRatingStep = applyNegativeRatingStep;

function updateNegativeRatingsHeader() {
  const cell = document.getElementById('negativeRatingsCell');
  const row = document.getElementById('negativeRatingsHeaderRow');
  if (!cell || !row) return;
  row.classList.add('leading-tight');
  // صف التقييمات السلبية: للمشرف والأدمن فقط — إخفاؤه عن HR والحسابات والمدير
  var currentRole = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
  var isAdmin = typeof isAdminMode === 'function' && isAdminMode();
  if (currentRole !== 'supervisor' && !isAdmin) {
    row.style.display = 'none';
    return;
  }
  let branchList = typeof branches !== 'undefined' ? [...branches] : [];
  if (branchList.length === 0) {
    row.style.display = 'none';
    return;
  }
  // عند اختيار فرع معين (الكورنيش أو الأندلس): عرض خانة هذا الفرع فقط. في «الكل» عرض كل الفروع
  if (typeof currentFilter !== 'undefined' && currentFilter !== 'الكل' && branchList.indexOf(currentFilter) >= 0) {
    branchList = [currentFilter];
  }
  row.style.display = 'table-row';
  // مصدر واحد مع التقييمات والحضور: من نفس الـ payload (Firebase أو localStorage). نفضّل window لأن applyLivePeriod والـ polling يحدّثانه.
  const counts = (typeof window !== 'undefined' && window.branchNegativeRatingsCount && typeof window.branchNegativeRatingsCount === 'object')
    ? window.branchNegativeRatingsCount
    : (typeof branchNegativeRatingsCount !== 'undefined' ? branchNegativeRatingsCount : {});
  let total = 0;
  function escapeHtmlBranch(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  // المشرف: يدخل التقييمات السلبية حتى يرسل؛ بعد الإرسال (isAdminLinkSubmitted) تصبح للعرض فقط مثل باقي التقييمات.
  const supervisorSubmitted = (currentRole === 'supervisor' && typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted());
  const isAllView = (typeof currentFilter !== 'undefined' && currentFilter === 'الكل');
  const readOnlyNegRatings = isAllView || supervisorSubmitted;
  const parts = branchList.map(b => {
    const val = parseInt(counts[b], 10) || 0;
    total += val;
    const labelSafe = escapeHtmlBranch(b);
    if (readOnlyNegRatings) {
      return `<span class="inline-flex items-center gap-1 mx-0.5 align-middle"><label class="text-gray-400 text-[9px]">${labelSafe}:</label><span class="text-white font-bold text-[11px]">${val}</span></span>`;
    }
    const displayVal = val === 0 ? '' : String(val);
    return `<span class="inline-flex items-center gap-1 mx-0.5 align-middle"><label class="text-gray-400 text-[9px]">${labelSafe}:</label><span class="inline-flex items-center rounded border border-white/20 bg-white/5 overflow-hidden"><button type="button" class="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 border-r border-white/20 text-sm font-bold leading-none select-none" data-branch="${labelSafe}" onclick="(function(br){ if(typeof applyNegativeRatingStep==='function') applyNegativeRatingStep(br,-1); })(this.getAttribute('data-branch'))" aria-label="ناقص">−</button><input type="number" min="0" step="1" value="${displayVal}" placeholder="0" data-branch="${labelSafe}" class="negative-ratings-input w-10 px-0.5 py-0.5 text-center text-white bg-transparent border-0 text-[11px] number-display focus:outline-none focus:ring-0" onfocus="this.select()" onchange="(function(b,v){ if(typeof branchNegativeRatingsCount==='undefined') return; branchNegativeRatingsCount[b]=Math.max(0,parseInt(v,10)||0); try{ localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(branchNegativeRatingsCount)); }catch(e){} if(typeof window!=='undefined') window.branchNegativeRatingsCount=branchNegativeRatingsCount; if(typeof syncLivePeriodToFirebase==='function') syncLivePeriodToFirebase(); if(typeof renderUI==='function') renderUI(typeof currentFilter!=='undefined'?currentFilter:'الكل'); })(this.dataset.branch, this.value)"><button type="button" class="w-6 h-6 flex items-center justify-center text-white hover:bg-white/20 border-l border-white/20 text-sm font-bold leading-none select-none" data-branch="${labelSafe}" onclick="(function(br){ if(typeof applyNegativeRatingStep==='function') applyNegativeRatingStep(br,1); })(this.getAttribute('data-branch'))" aria-label="زائد">+</button></span></span>`;
  }).join(' ');
  const totalHtml = (typeof currentFilter !== 'undefined' && currentFilter === 'الكل') ? `<span class="text-primary-500 font-bold text-[11px] mr-1">إجمالي: ${total}</span>` : '';
  cell.innerHTML = (totalHtml ? totalHtml + ' ' : '') + parts;
}

function runAfterTableRender() {
  if (typeof setupTableHeaderSort === 'function') setupTableHeaderSort();
  if (typeof updateTableHeaderSortIndicator === 'function') updateTableHeaderSortIndicator();
  if (typeof updateNegativeRatingsHeader === 'function') updateNegativeRatingsHeader();
  // تحديث colspan الـ footer بعد بناء الجدول
  setTimeout(updateFooterSummaryColspans, 80);
  // استخدم دالة موحّدة واحدة للحوافز حتى لا تُكتب نتيجة قديمة فوق النتيجة الصحيحة.
  if (typeof updateExcellenceBonusRow === 'function') updateExcellenceBonusRow();
// Footer and stat cards are set by updateFooterTotals() (called at end of renderUI) from getFooterTotals() — single source of truth

// Hide/show elements based on role (after render)
setTimeout(() => {
  const currentRole = localStorage.getItem('adora_current_role');
  const tbl = document.getElementById('targetTable');
  if (currentRole === 'supervisor') {
    // المشرف: خانات التقييمات فقط — إخفاء الحضور والحجوزات والصافي والإجماليات والكروت
    if (tbl) {
      tbl.querySelectorAll('th.col-attendance, td.col-attendance').forEach(el => { el.style.display = 'none'; });
      tbl.querySelectorAll('th.col-count, td.col-count').forEach(el => { el.style.display = 'none'; });
      tbl.querySelectorAll('th.col-net, td.col-net').forEach(el => { el.style.display = 'none'; });
      const r1 = document.getElementById('footerRowTotal');
      const r2 = document.getElementById('footerRowFinalTotal');
      if (r1) r1.style.display = 'none';
      if (r2) r2.style.display = 'none';
    }
    const statsGridSup = document.querySelector('.stats-grid-container');
    if (statsGridSup) statsGridSup.style.display = 'none';
    document.querySelectorAll('.attendance-toggle, .attendance-days-input').forEach(el => {
      el.style.display = 'none';
    });
  } else if (currentRole === 'hr') {
    // HR: خانات إدخال أيام الحضور فقط — إخفاء الصافي والحجوزات والتقييمات والإجماليات والكروت
    if (tbl) {
      tbl.querySelectorAll('th.col-eval-booking, th.col-eval-google, td.col-eval-booking, td.col-eval-google').forEach(el => { el.style.display = 'none'; });
      tbl.querySelectorAll('th.col-count, td.col-count').forEach(el => { el.style.display = 'none'; });
      tbl.querySelectorAll('th.col-net, td.col-net').forEach(el => { el.style.display = 'none'; });
      const r1 = document.getElementById('footerRowTotal');
      const r2 = document.getElementById('footerRowFinalTotal');
      if (r1) r1.style.display = 'none';
      if (r2) r2.style.display = 'none';
    }
    const statsGrid = document.querySelector('.stats-grid-container');
    if (statsGrid) statsGrid.style.display = 'none';
    document.querySelectorAll('.attendance-indicator').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.eval-input').forEach(el => { el.style.display = 'none'; });
  } else if (currentRole === 'accounting') {
    // الحسابات: إخفاء عمود بطل تحدي الظروف/أيام البصمة (لـ HR فقط)
    if (tbl) {
      tbl.querySelectorAll('th.col-attendance, td.col-attendance').forEach(el => { el.style.display = 'none'; });
    }
    document.querySelectorAll('.attendance-readonly-accounting').forEach(el => { el.style.display = 'flex'; });
    document.querySelectorAll('.attendance-editable').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.eval-input, .attendance-toggle, .attendance-days-input').forEach(el => {
      el.style.display = 'none';
    });
  } else {
    // أدمن أو بدون دور: إظهار كل الأعمدة والمؤشرات (بما فيها الصافي والكروت والإجماليات)
    if (tbl) {
      tbl.querySelectorAll('th.col-attendance, td.col-attendance, th.col-count, td.col-count, th.col-eval-booking, th.col-eval-google, td.col-eval-booking, td.col-eval-google, th.col-net, td.col-net').forEach(el => { el.style.removeProperty('display'); });
      const r1 = document.getElementById('footerRowTotal');
      const r2 = document.getElementById('footerRowFinalTotal');
      if (r1) r1.style.removeProperty('display');
      if (r2) r2.style.removeProperty('display');
    }
    const statsGridEl = document.querySelector('.stats-grid-container');
    if (statsGridEl) statsGridEl.style.removeProperty('display');
    document.querySelectorAll('.attendance-indicator').forEach(el => { el.style.removeProperty('display'); });
    document.querySelectorAll('.attendance-readonly-accounting').forEach(el => { el.style.display = 'none'; });
    document.querySelectorAll('.attendance-editable').forEach(el => { el.style.removeProperty('display'); });
    document.querySelectorAll('.eval-input, .attendance-toggle, .attendance-days-input').forEach(el => { el.style.removeProperty('display'); });
  }
  // تحديث colspan الـ footer بعد تغيير الدور
  setTimeout(updateFooterSummaryColspans, 150);
}, 100);
// Get winner objects for badges
const getWinnerObj = (wObj) => {
if (!wObj || wObj.val <= 0) return { val: 0, name: '', branch: '' };
const winner = db.find(d => d.id === wObj.ids[0]);
return winner ? { val: wObj.val, name: winner.name, branch: winner.branch } : { val: 0, name: '', branch: '' };
};
// Ensure viewWinners is defined
if (!viewWinners) {
viewWinners = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []} };
}
const maxNet = getWinnerObj(viewWinners.net);
const maxEval = getWinnerObj(viewWinners.eval);
const maxBook = getWinnerObj(viewWinners.book);
// Update New Cards — عند «الكل» الاسم فقط (القيمة مُجمّعة)
const displayName = (name, branch) => (filter === 'الكل' ? name : (name + (branch ? ` (${branch})` : '')));
document.getElementById('topEarnerName').innerText = maxNet.val > 0 ? displayName(maxNet.name, maxNet.branch) : '-';
document.getElementById('topEarnerValue').innerText = maxNet.val > 0 ? maxNet.val.toFixed(2) + ' ريال' : '-';
document.getElementById('topRatedName').innerText = maxEval.val > 0 ? displayName(maxEval.name, maxEval.branch) : '-';
document.getElementById('topRatedValue').innerText = maxEval.val > 0 ? maxEval.val + ' تقييم' : '-';
document.getElementById('topBookerName').innerText = maxBook.val > 0 ? displayName(maxBook.name, maxBook.branch) : '-';
document.getElementById('topBookerValue').innerText = maxBook.val > 0 ? maxBook.val + ' حجز' : '-';
// Real-time Badge Update in Table
// Note: hasAnyEvaluations is already defined above in renderUI function scope
const getLoserObj = (lObj) => {
if (!lObj || lObj.val >= Infinity) return { val: Infinity, name: '', branch: '' };
const loser = db.find(d => d.id === lObj.ids[0]);
return loser ? { val: lObj.val, name: loser.name, branch: loser.branch } : { val: Infinity, name: '', branch: '' };
};
const minNet = getLoserObj(viewLosers.net);
const minEval = getLoserObj(viewLosers.eval);
const minBook = getLoserObj(viewLosers.book);
const rows = document.querySelectorAll('#mainTable tr');
rows.forEach(row => {
const rName = row.dataset.name;
const rBranch = row.dataset.branch;
const badgeWrap = row.querySelector('.badges-wrapper');
if (rName && badgeWrap) {
const emp = db.find(d => d.name === rName && d.branch === rBranch);
if (!emp) return;
let badgesHtml = '';
// Get all branches for this employee name (for cumulative badges)
const allEmpBranches = db.filter(d => d.name === rName);
if (filter === 'الكل') {
// When showing "الكل": accumulate badges from all branches (only "best" badges, not "worst")
allEmpBranches.forEach(empBranch => {
const isBranchMaxEval = branchWinners[empBranch.branch]?.eval.ids.includes(empBranch.id) && branchWinners[empBranch.branch].eval.val > 0;
const isBranchMaxBook = branchWinners[empBranch.branch]?.book.ids.includes(empBranch.id) && branchWinners[empBranch.branch].book.val > 0;
// Only show evaluation badges if at least one employee has evaluations > 0
if (isBranchMaxEval && hasAnyEvaluations) {
badgesHtml += '<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً">⭐ الأفضل تقييماً</span>';
}
if (isBranchMaxBook) {
badgesHtml += '<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات">🎯 الأكثر حجوزات</span>';
}
// Note: "worst" badges removed from branches to avoid clutter - only show "worst in الكل" badge
});
// View badges (only when showing "الكل")
// Only show evaluation badges if at least one employee has evaluations > 0
if (viewWinners.eval.ids.includes(emp.id) && viewWinners.eval.val > 0 && hasAnyEvaluations) {
badgesHtml += '<span class="text-yellow-500 text-xs print:text-yellow-700 font-bold" title="الأعلى تقييماً في الكل">⭐ بطل التقييم</span>';
}
if (viewWinners.book.ids.includes(emp.id) && viewWinners.book.val > 0) {
badgesHtml += '<span class="text-blue-500 text-xs print:text-blue-700 font-bold" title="الأكثر حجوزات في الكل">🎯 بطل الحجوزات</span>';
}
// Only show "worst in الكل" badge (not from individual branches to avoid clutter)
// Only show evaluation badges if at least one employee has evaluations > 0
if (viewLosers.eval.ids.includes(emp.id) && viewLosers.eval.val < Infinity && viewLosers.eval.val === 0 && ((emp.evaluationsBooking || 0) + (emp.evaluationsGoogle || 0)) === 0 && hasAnyEvaluations) {
badgesHtml += '<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل تقييماً في الكل"><span class="text-red-500">↓</span> الأقل تقييماً</span>';
}
if (viewLosers.book.ids.includes(emp.id) && viewLosers.book.val < Infinity) {
badgesHtml += '<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل حجوزات في الكل">😟 الأقل حجوزات</span>';
}
} else {
// When showing specific branch: show only badges for current branch
// Check if any employee in ANY branch has evaluations > 0 (global check)
const branchHasEvaluations = db.some(e => (e.evaluations || 0) > 0);
const bw = branchWinners[emp.branch];
const isBranchMaxEval = bw?.eval?.ids?.includes(emp.id) && bw?.eval?.val > 0;
const isBranchMaxBook = bw?.book?.ids?.includes(emp.id) && bw?.book?.val > 0;
// Only show evaluation badges if at least one employee in branch has evaluations > 0
if (isBranchMaxEval && branchHasEvaluations) {
badgesHtml += `<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً في ${emp.branch}">⭐ ${emp.branch}</span>`;
}
if (isBranchMaxBook) {
badgesHtml += `<span class="text-blue-400 text-xs print:text-blue-600" title="الأكثر حجوزات في ${emp.branch}">🎯 ${emp.branch}</span>`;
}
const bl = branchLosers[emp.branch];
const isBranchMinEval = bl?.eval?.ids?.includes(emp.id) && bl?.eval?.val < Infinity && ((emp.evaluationsBooking || 0) + (emp.evaluationsGoogle || 0)) === 0;
const isBranchMinBook = bl?.book?.ids?.includes(emp.id) && bl?.book?.val < Infinity;
// Only show evaluation badges if at least one employee in branch has evaluations > 0
if (isBranchMinEval && branchHasEvaluations) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل تقييماً في ${emp.branch}"><span class="text-red-400">↓</span> ${emp.branch}</span>`;
}
if (isBranchMinBook) {
badgesHtml += `<span class="text-red-400 text-xs print:text-red-600" title="الأقل حجوزات في ${emp.branch}">😟 ${emp.branch}</span>`;
}
}
// Commitment badge - Show ONLY for employees with attendance26Days = true
// CRITICAL: Get fresh data from db to ensure we check the current state after updateAttendance
const currentEmpFromDb = db.find(d => d.id === emp.id);
const attendance26Days = currentEmpFromDb ? (currentEmpFromDb.attendance26Days !== false) : false;
if (attendance26Days === true) {
if (currentFilter !== 'الكل') {
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً في ${emp.branch}">✓ الأكثر التزاماً في ${emp.branch}</span>`;
} else {
// When showing "الكل": find all branches where this employee has attendance26Days = true
const allEmpBranches = db.filter(d => d.name === rName);
const currentEmpBranches = allEmpBranches.filter(eb => eb.id === emp.id && eb.attendance26Days !== false);
const uniqueBranches = [...new Set(currentEmpBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? uniqueBranches[0] 
: uniqueBranches.length === 2 
? 'الفرعين' 
: uniqueBranches.length > 0
? `${uniqueBranches.length} فروع`
: emp.branch;
badgesHtml += `<span class="text-green-400 text-xs print:text-green-600 font-bold" title="الأكثر التزاماً">✓ الأكثر التزاماً ${branchText}</span>`;
}
}
// Excellence badge (most bookings + most evaluations in same branch) - check for current employee only
const isCurrentEmpMaxEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
const isCurrentEmpMaxBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
const hasExcellence = isCurrentEmpMaxBook && isCurrentEmpMaxEval;
if (hasExcellence) {
badgesHtml += currentFilter !== 'الكل' ? 
`<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات) في ${emp.branch}">✨ مبدع ${emp.branch}</span>` :
'<span class="text-turquoise-400 text-xs print:text-turquoise-600 font-bold" title="مبدع الشهر - تفوق متكرر (أكثر حجوزات + أكثر تقييمات)">✨ مبدع الشهر</span>';
}
badgeWrap.innerHTML = badgesHtml;
}
});
// Update footer totals and bonus rows after rendering
updateFooterTotals();
updateDashboardStats();
// Update badges immediately for all rows (after renderUI completes)
// Use requestAnimationFrame to ensure DOM is fully rendered
requestAnimationFrame(() => {
updateBadges();
// Also update after a short delay to ensure all badges are visible (especially after filter change)
setTimeout(() => {
updateBadges();
}, 150);
});
// إذا صفحة الإحصائيات مفتوحة: حدّثها بالبيانات الحالية (تقييمات سلبية، خصومات، إلخ)
setTimeout(function () {
  try {
    var rp = document.getElementById('reportsPage');
    var sc = document.getElementById('statisticsReportsContent');
    if (rp && !rp.classList.contains('hidden') && sc && !sc.classList.contains('hidden') && typeof loadStatisticsPage === 'function') {
      loadStatisticsPage();
    }
  } catch (e) {}
}, 50);
}
appendChunk(0);
}
// === Print Functionality ===
function smartPrint(onlySelected) {
try {
// Generate professional print report
generateProfessionalPrintReport(onlySelected);
} catch (error) {
console.error('Error in smartPrint:', error);
alert('حدث خطأ أثناء الطباعة: ' + error.message);
}
}

/** تصدير جدول الكل كـ PDF احترافي: نفس رؤوس وأعمدة جدول الكل، خلفية بيضاء وألوان أبيض/أسود/رمادي، ترويسة تقرير مكافآت فنادق إليت. */
function exportPdfTableAll() {
  if (typeof db === 'undefined' || !Array.isArray(db) || db.length === 0) {
    if (typeof showToast === 'function') showToast('لا توجد بيانات لتصدير جدول الكل.', 'error');
    else alert('لا توجد بيانات لتصدير جدول الكل.');
    return;
  }
  var uniqueNames = [];
  db.forEach(function (e) {
    if (uniqueNames.indexOf(e.name) === -1) uniqueNames.push(e.name);
  });
  // ترتيب حسب الأعلى صافي في الأعلى
  uniqueNames.sort(function (a, b) {
    var netA = typeof getDisplayNetForEmployee === 'function' ? getDisplayNetForEmployee(a, { aggregated: true }) : 0;
    var netB = typeof getDisplayNetForEmployee === 'function' ? getDisplayNetForEmployee(b, { aggregated: true }) : 0;
    return (Number(netB) || 0) - (Number(netA) || 0);
  });
  var periodText = (document.getElementById('headerPeriodRange') && document.getElementById('headerPeriodRange').innerText) ? document.getElementById('headerPeriodRange').innerText : '-';
  var reportDate = typeof getReportDateGregorian === 'function' ? getReportDateGregorian() : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function td(v, align) { align = align || 'center'; return '<td style="padding:5px 6px;border:1px solid #b0b0b0;text-align:' + align + ';font-size:10px;color:#1a1a1a;">' + esc(String(v)) + '</td>'; }
  function tdTotal(v, align) { align = align || 'center'; return '<td style="padding:6px 8px;border:1px solid #333;text-align:' + align + ';font-size:10px;font-weight:700;color:#1a1a1a;background:#f5f5f5;">' + esc(String(v)) + '</td>'; }
  var hasBreakdown = window.adoraTransferMode && db.some(function (e) { return e._reception != null || e._booking != null || e._morning != null; });
  var vipRooms = (window.adoraActiveVipRooms && window.adoraActiveVipRooms.length > 0) ? window.adoraActiveVipRooms : [];
  var nVip = vipRooms.length;

  var thStyle = 'padding:5px 6px;border:1px solid #0d9488;font-size:9px;font-weight:600;background:#0d9488;color:#fff;';
  var thGroupStyle = 'padding:6px 8px;border:1px solid #0d9488;font-size:10px;font-weight:700;background:#0d9488;color:#fff;';
  var groupRow = '';
  var subRow = '';
  if (hasBreakdown && nVip > 0) {
    groupRow = '<tr>' +
      '<th colspan="2" style="' + thGroupStyle + '">بيانات الموظف</th>' +
      '<th colspan="6" style="' + thGroupStyle + '">الحجوزات</th>' +
      '<th colspan="3" style="' + thGroupStyle + '">الشفتات</th>' +
      '<th colspan="' + nVip + '" style="' + thGroupStyle + '">VIP</th>' +
      '<th colspan="2" style="' + thGroupStyle + '">تنبيهات</th>' +
      '<th style="' + thGroupStyle + '">الحضور</th>' +
      '<th colspan="2" style="' + thGroupStyle + '">التقييمات</th>' +
      '<th style="' + thGroupStyle + '">المكافأة</th></tr>';
    subRow = '<tr>' +
      '<th style="' + thStyle + '">م</th><th style="' + thStyle + '">الموظف</th>' +
      '<th style="' + thStyle + '">العقود</th><th style="' + thStyle + '">استقبال</th><th style="' + thStyle + '">بوكينج</th>' +
      '<th style="' + thStyle + '">صباح</th><th style="' + thStyle + '">مساء</th><th style="' + thStyle + '">ليل</th>' +
      '<th style="' + thStyle + '">صباح</th><th style="' + thStyle + '">مساء</th><th style="' + thStyle + '">ليل</th>';
    vipRooms.forEach(function (num) { subRow += '<th style="' + thStyle + '">' + num + '</th>'; });
    subRow += '<th style="' + thStyle + '">تنبيه</th><th style="' + thStyle + '">نقص SAR</th>' +
      '<th style="' + thStyle + '">بطل تحدي الظروف</th>' +
      '<th style="' + thStyle + '">GOOGLE</th><th style="' + thStyle + '">BOOKING</th>' +
      '<th style="' + thStyle + '">الصافي</th></tr>';
  } else {
    groupRow = '<tr>' +
      '<th colspan="2" style="' + thGroupStyle + '">بيانات الموظف</th>' +
      '<th style="' + thGroupStyle + '">الحجوزات</th>' +
      '<th style="' + thGroupStyle + '">الحضور</th>' +
      '<th colspan="2" style="' + thGroupStyle + '">التقييمات</th>' +
      '<th style="' + thGroupStyle + '">المكافأة</th></tr>';
    subRow = '<tr>' +
      '<th style="' + thStyle + '">م</th><th style="' + thStyle + '">الموظف</th>' +
      '<th style="' + thStyle + '">عدد الحجوزات</th>' +
      '<th style="' + thStyle + '">الحضور</th>' +
      '<th style="' + thStyle + '">GOOGLE</th><th style="' + thStyle + '">BOOKING</th>' +
      '<th style="' + thStyle + '">الصافي</th></tr>';
  }

  var totals = {
    contracts: 0, reception: 0, booking: 0, morning: 0, evening: 0, night: 0,
    alertCount: 0, alertTotal: 0, evalBooking: 0, evalGoogle: 0, count: 0, net: 0
  };
  var rowsHtml = '';
  uniqueNames.forEach(function (name, idx) {
    var allEmpBranches = db.filter(function (e) { return e.name === name; });
    var agg = {
      count: 0, reception: 0, booking: 0, morning: 0, evening: 0, night: 0,
      alertCount: 0, alertTotal: 0, evalBooking: 0, evalGoogle: 0,
      attendanceDone: false, vipRooms: {}
    };
    allEmpBranches.forEach(function (e) {
      agg.count += e.count || 0;
      agg.reception += e._reception || 0;
      agg.booking += e._booking || 0;
      agg.morning += e._morning || 0;
      agg.evening += e._evening || 0;
      agg.night += e._night || 0;
      agg.alertCount += e._alertCount || 0;
      agg.alertTotal += e._alertTotal || 0;
      agg.evalBooking += e.evaluationsBooking || 0;
      agg.evalGoogle += e.evaluationsGoogle || 0;
      if (e.attendance26Days === true) agg.attendanceDone = true;
      if (e._vipRooms && typeof e._vipRooms === 'object') {
        Object.keys(e._vipRooms).forEach(function (k) { agg.vipRooms[k] = (agg.vipRooms[k] || 0) + (e._vipRooms[k] || 0); });
      }
    });
    var net = typeof getDisplayNetForEmployee === 'function' ? getDisplayNetForEmployee(name, { aggregated: true }) : 0;
    var netStr = (typeof net === 'number' && !isNaN(net)) ? Number(net).toFixed(2) : '0.00';
    var attendanceStr = agg.attendanceDone ? 'تم' : 'لم يتم';

    if (hasBreakdown && nVip > 0) {
      var contracts = allEmpBranches.reduce(function (s, e) { return s + (e._bookingRegular || 0); }, 0);
      totals.contracts += contracts;
      totals.reception += agg.reception;
      totals.booking += agg.booking;
      totals.morning += agg.morning;
      totals.evening += agg.evening;
      totals.night += agg.night;
      totals.alertCount += agg.alertCount;
      totals.alertTotal += agg.alertTotal;
      totals.evalGoogle += agg.evalGoogle;
      totals.evalBooking += agg.evalBooking;
      totals.net += typeof net === 'number' && !isNaN(net) ? net : 0;
      rowsHtml += '<tr>' + td(idx + 1) + td(name, 'right');
      rowsHtml += td(contracts) + td(agg.reception) + td(agg.booking) + td(agg.morning) + td(agg.evening) + td(agg.night);
      rowsHtml += td(agg.morning) + td(agg.evening) + td(agg.night);
      vipRooms.forEach(function (num) { rowsHtml += td(agg.vipRooms[num] || 0); });
      rowsHtml += td(agg.alertCount) + td(agg.alertTotal > 0 ? Math.round(agg.alertTotal).toLocaleString('en-SA') : '—') + td(attendanceStr) + td(agg.evalGoogle) + td(agg.evalBooking) + td(netStr, 'left') + '</tr>';
    } else {
      totals.count += agg.count;
      totals.evalGoogle += agg.evalGoogle;
      totals.evalBooking += agg.evalBooking;
      totals.net += typeof net === 'number' && !isNaN(net) ? net : 0;
      rowsHtml += '<tr>' + td(idx + 1) + td(name, 'right') + td(agg.count) + td(attendanceStr) + td(agg.evalGoogle) + td(agg.evalBooking) + td(netStr, 'left') + '</tr>';
    }
  });

  var totalNetStr = (totals.net != null && !isNaN(totals.net)) ? Number(totals.net).toFixed(2) : '0.00';
  if (hasBreakdown && nVip > 0) {
    rowsHtml += '<tr>' + tdTotal('الإجمالي', 'right') + tdTotal('', 'right');
    rowsHtml += tdTotal(totals.contracts) + tdTotal(totals.reception) + tdTotal(totals.booking) + tdTotal(totals.morning) + tdTotal(totals.evening) + tdTotal(totals.night);
    rowsHtml += tdTotal(totals.morning) + tdTotal(totals.evening) + tdTotal(totals.night);
    vipRooms.forEach(function () { rowsHtml += tdTotal(''); });
    rowsHtml += tdTotal(totals.alertCount) + tdTotal(totals.alertTotal > 0 ? Math.round(totals.alertTotal).toLocaleString('en-SA') : '—') + tdTotal('') + tdTotal(totals.evalGoogle) + tdTotal(totals.evalBooking) + tdTotal(totalNetStr, 'left') + '</tr>';
  } else {
    rowsHtml += '<tr>' + tdTotal('الإجمالي', 'right') + tdTotal('', 'right') + tdTotal(totals.count) + tdTotal('') + tdTotal(totals.evalGoogle) + tdTotal(totals.evalBooking) + tdTotal(totalNetStr, 'left') + '</tr>';
  }

  var approvalHtml = '<div style="margin-top:24px;display:flex;flex-wrap:wrap;gap:24px;justify-content:space-between;">' +
    '<div style="flex:1;min-width:160px;"><div style="border:1px solid #999;padding:14px;text-align:center;min-height:56px;background:#fafafa;">' +
    '<div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#1a1a1a;">اعتماد المشرف</div>' +
    '<div style="font-size:10px;color:#666;">التوقيع / الختم</div></div></div>' +
    '<div style="flex:1;min-width:160px;"><div style="border:1px solid #999;padding:14px;text-align:center;min-height:56px;background:#fafafa;">' +
    '<div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#1a1a1a;">اعتماد مدير التشغيل</div>' +
    '<div style="font-size:10px;color:#666;">التوقيع / الختم</div></div></div></div>' +
    '<div style="margin-top:12px;"><div style="border:1px solid #999;padding:14px;text-align:center;min-height:56px;max-width:260px;background:#fafafa;">' +
    '<div style="font-weight:700;font-size:12px;margin-bottom:6px;color:#1a1a1a;">اعتماد الحسابات</div>' +
    '<div style="font-size:10px;color:#666;">التوقيع / الختم</div></div></div>';

  var tableHtml = '<table dir="rtl" style="width:100%;border-collapse:collapse;font-family:\'Tajawal\',\'Segoe UI\',Arial,sans-serif;background:#fff;">' +
    '<thead>' + groupRow + subRow + '</thead><tbody>' + rowsHtml + '</tbody></table>';
  var titleHtml = '<div style="margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #333;">' +
    '<h1 style="margin:0 0 6px 0;font-size:18px;font-weight:700;color:#1a1a1a;font-family:\'Tajawal\',\'Segoe UI\',Arial,sans-serif;">تقرير مكافآت فنادق إليت</h1>' +
    '<p style="margin:0;font-size:12px;color:#444;font-family:\'Tajawal\',\'Segoe UI\',Arial,sans-serif;">الفترة من ' + esc(periodText) + ' إلى تاريخ التصدير: ' + esc(reportDate) + '</p></div>';
  var fullHtml = '<div dir="rtl" lang="ar" style="padding:14px;background:#fff;color:#1a1a1a;font-family:\'Tajawal\',\'Segoe UI\',Arial,sans-serif;">' + titleHtml + tableHtml + approvalHtml + '</div>';
  var fileName = 'تقرير-مكافآت-الكل-' + (periodText.replace(/\s/g, '-').replace(/[^\w\u0600-\u06FF\-]/g, '').substring(0, 25)) + '.pdf';
  if (fileName.length > 55) fileName = fileName.substring(0, 55); else if (fileName.indexOf('.pdf') !== fileName.length - 4) fileName = fileName + '.pdf';
  var btn = document.getElementById('exportPdfTableAllBtn');
  if (btn) btn.disabled = true;
  loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js').then(function () {
    var html2pdfFn = typeof window.html2pdf !== 'undefined' ? window.html2pdf : null;
    if (!html2pdfFn) { if (btn) btn.disabled = false; return Promise.reject(new Error('html2pdf not available')); }
    var link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    var wrapper = document.createElement('div');
    wrapper.setAttribute('dir', 'rtl');
    wrapper.setAttribute('lang', 'ar');
    wrapper.style.cssText = 'width:270mm;max-width:100%;margin:0 auto;padding:0;background:#fff;color:#1a1a1a;font-family:\'Tajawal\',\'Segoe UI\',Arial,sans-serif;';
    wrapper.innerHTML = fullHtml;
    document.body.appendChild(wrapper);
    var opt = {
      margin: [8, 8, 8, 8],
      filename: fileName,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 1.5, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
    };
    return html2pdfFn().set(opt).from(wrapper).outputPdf('blob').then(function (blob) {
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      if (typeof showToast === 'function') showToast('تم تحميل PDF تقرير جدول الكل');
      return { blob: blob, fileName: fileName };
    }).catch(function (err) {
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
      throw err;
    });
  }).then(function () { if (btn) btn.disabled = false; }).catch(function (err) {
    if (btn) btn.disabled = false;
    console.error('exportPdfTableAll', err);
    if (typeof showToast === 'function') showToast('فشل تصدير PDF. جرّب مرة أخرى.', 'error');
    else alert('فشل تصدير PDF: ' + (err && err.message ? err.message : err));
  });
}

function generateProfessionalPrintReport(onlySelected) {
// Get data
const filter = currentFilter;
const periodText = document.getElementById('headerPeriodRange')?.innerText || '-';
const reportDate = new Date().toLocaleDateString('ar-SA', { year: 'numeric', month: 'long', day: 'numeric' });
// Filter employees
let employeesToPrint = [];
if (onlySelected) {
const rows = document.querySelectorAll('#mainTable tr:not(.badges-row)');
rows.forEach(row => {
const checkbox = row.querySelector('.emp-checkbox');
if (checkbox && checkbox.checked) {
// Try multiple attribute names for compatibility
const empId = row.dataset.id || row.dataset.empId || row.getAttribute('data-id') || row.getAttribute('data-emp-id');
// Also try to get from name and branch if ID not found
if (!empId) {
const empName = row.dataset.name;
const empBranch = row.dataset.branch;
if (empName && empBranch) {
const emp = db.find(e => e.name === empName && e.branch === empBranch);
if (emp) {
employeesToPrint.push(emp);
return;
}
}
}
if (empId) {
const emp = db.find(e => e.id === empId);
if (emp) employeesToPrint.push(emp);
}
}
});
// If no employees found, show alert
if (employeesToPrint.length === 0) {
alert('لم يتم تحديد أي موظف للطباعة. يرجى تحديد موظف واحد على الأقل.');
return;
}
} else {
employeesToPrint = filter === 'الكل' ? [...db] : db.filter(e => e.branch === filter);
}
// Sort by name
employeesToPrint.sort((a, b) => a.name.localeCompare(b.name, 'ar'));
// Pricing config for calcStats (مطلوب لحساب الإجمالي والصافي في التقرير)
const _pricingRenderUI = getPricingConfig();
// Calculate totals
let totalFund = 0, totalNet = 0, totalEval = 0, totalBookings = 0, totalNetNoEval = 0;
let totalExcellenceBonus = 0, totalCommitmentBonus = 0;
const { branchWinners } = computeBranchWinnersAndLosers(db, branches);
// Calculate nameCounts for duplicate detection
const nameCounts = {};
db.forEach(e => {
nameCounts[e.name] = (nameCounts[e.name] || 0) + 1;
});
// Use same calcStats function from renderUI
const calcStats = (emp) => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const ev = evBooking;
const nameCount = nameCounts[emp.name] || 1;
const isDuplicate = nameCount > 1;
let aggregatedCount = emp.count;
let aggregatedEvalBooking = evBooking;
let aggregatedDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
if (isDuplicate) {
const allEmpBranches = db.filter(e => e.name === emp.name);
aggregatedCount = allEmpBranches.reduce((sum, e) => sum + (e.count || 0), 0);
aggregatedEvalBooking = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsBooking || 0), 0);
const firstEmp = allEmpBranches[0];
if (firstEmp.attendanceDaysPerBranch) {
aggregatedDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
aggregatedDays = firstEmp.totalAttendanceDays || (firstEmp.attendance26Days === true ? 26 : 0);
}
}
let hasExcellenceBonus = false;
if (isDuplicate) {
[...branches].forEach(branch => {
const branchEmployees = db.filter(e => e.branch === branch);
let isHighestBookInBranch = true;
let isHighestEvalInBranch = true;
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === emp.name) return;
const otherAgg = nameCounts[otherEmp.name] > 1 ? {
totalCount: db.filter(e => e.name === otherEmp.name).reduce((sum, e) => sum + (e.count || 0), 0),
totalEvalBooking: db.filter(e => e.name === otherEmp.name).reduce((sum, e) => sum + (e.evaluationsBooking || 0), 0)
} : { totalCount: otherEmp.count || 0, totalEvalBooking: otherEmp.evaluationsBooking || 0 };
if (otherAgg.totalCount > aggregatedCount) isHighestBookInBranch = false;
if (otherAgg.totalEvalBooking > aggregatedEvalBooking) isHighestEvalInBranch = false;
});
if (isHighestBookInBranch && isHighestEvalInBranch && aggregatedCount > 0 && aggregatedEvalBooking > 0) {
hasExcellenceBonus = true;
}
});
} else {
hasExcellenceBonus = branchWinners[emp.branch]?.book.ids.includes(emp.id) && 
branchWinners[emp.branch]?.eval.ids.includes(emp.id) &&
branchWinners[emp.branch].book.val > 0 && 
branchWinners[emp.branch].eval.val > 0;
}
const excellenceBonus = hasExcellenceBonus ? 50 : 0;
const attendance26Days = isDuplicate ? (aggregatedDays >= 26 && emp.attendance26Days === true) : (emp.attendance26Days === true);
let isMostCommitted = false;
let isMostEval = false;
let isMostBook = false;
if (isDuplicate) {
[...branches].forEach(branch => {
const branchEmployees = db.filter(e => e.branch === branch);
let isHighestDaysInBranch = true;
let isHighestEvalInBranch = true;
let isHighestBookInBranch = true;
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === emp.name) return;
const otherAgg = nameCounts[otherEmp.name] > 1 ? {
totalDays: db.filter(e => e.name === otherEmp.name).reduce((sum, e) => {
if (e.attendanceDaysPerBranch) {
return Object.values(e.attendanceDaysPerBranch).reduce((s, d) => s + (parseInt(d) || 0), 0);
}
return e.totalAttendanceDays || (e.attendance26Days === true ? 26 : 0);
}, 0),
totalEvalBooking: db.filter(e => e.name === otherEmp.name).reduce((sum, e) => sum + (e.evaluationsBooking || 0), 0),
totalCount: db.filter(e => e.name === otherEmp.name).reduce((sum, e) => sum + (e.count || 0), 0)
} : {
totalDays: otherEmp.attendance26Days === true ? 26 : 0,
totalEvalBooking: otherEmp.evaluationsBooking || 0,
totalCount: otherEmp.count || 0
};
if (otherAgg.totalDays > aggregatedDays) isHighestDaysInBranch = false;
if (otherAgg.totalEvalBooking > aggregatedEvalBooking) isHighestEvalInBranch = false;
if (otherAgg.totalCount > aggregatedCount) isHighestBookInBranch = false;
});
if (isHighestDaysInBranch && aggregatedDays >= 26) isMostCommitted = true;
if (isHighestEvalInBranch && aggregatedEvalBooking > 0) isMostEval = true;
if (isHighestBookInBranch && aggregatedCount > 0) isMostBook = true;
});
} else {
isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
}
const hasCommitmentBonus = attendance26Days && (isMostEval || isMostBook);
isMostCommitted = hasCommitmentBonus;
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
const gross = computeGrossFromBreakdown(emp, _pricingRenderUI);
const fund = gross * getSupportFundRate();
let net = gross - fund;
const attendanceBonus = attendance26Days ? net * 0.25 : 0;
net = net + attendanceBonus;
return { net, ev, count: emp.count, branch: emp.branch, name: emp.name, id: emp.id, fund, 
excellenceBonus, hasExcellenceBonus, commitmentBonus, hasCommitmentBonus, 
attendance26Days, attendanceBonus, gross, evBooking, evGoogle, isDuplicate };
};
// Calculate bonusApplied for duplicates (same logic as renderUI)
const bonusApplied = {};
employeesToPrint.forEach((emp) => {
if (nameCounts[emp.name] > 1) {
if (!bonusApplied[emp.name]) {
const s = calcStats(emp);
const allEmpRows = employeesToPrint.filter(e => e.name === emp.name);
let excellenceRowId = null;
if (s.hasExcellenceBonus) {
let maxNet = calcStats(allEmpRows[0]).net;
excellenceRowId = allEmpRows[0].id;
allEmpRows.forEach(e => {
const stats = calcStats(e);
if (stats.net > maxNet) {
maxNet = stats.net;
excellenceRowId = e.id;
}
});
}
let commitmentRowId = null;
let maxTotalAmount = -1;
allEmpRows.forEach(e => {
const stats = calcStats(e);
if (stats.hasCommitmentBonus) {
const totalAmount = stats.net + stats.commitmentBonus;
if (totalAmount > maxTotalAmount) {
maxTotalAmount = totalAmount;
commitmentRowId = e.id;
}
}
});
let challengeRowId = null;
let maxChallengeTotalAmount = -1;
allEmpRows.forEach(e => {
const stats = calcStats(e);
if (stats.attendance26Days && stats.attendanceBonus > 0) {
const totalAmount = stats.net;
if (totalAmount > maxChallengeTotalAmount) {
maxChallengeTotalAmount = totalAmount;
challengeRowId = e.id;
}
}
});
bonusApplied[emp.name] = {
excellenceRowId: excellenceRowId,
commitmentRowId: commitmentRowId,
challengeRowId: challengeRowId
};
}
}
});
// Process employees for print — عند "طباعة الكل" نُجمّع المتكررين في صف واحد مثل عرض "الكل"
const printRows = [];
if (filter === 'الكل' && !onlySelected) {
  // One row per unique employee name (aggregated like "الكل" view)
  const uniqueNames = [...new Set(db.map(e => e.name))];
  uniqueNames.sort((a, b) => a.localeCompare(b, 'ar'));
  uniqueNames.forEach(name => {
    const allEmpBranches = db.filter(e => e.name === name);
    const firstEmp = allEmpBranches[0];
    const aggregatedCount = allEmpBranches.reduce((sum, e) => sum + (e.count || 0), 0);
    const aggregatedEvalBooking = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsBooking || 0), 0);
    const aggregatedEvalGoogle = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsGoogle || 0), 0);
    let aggregatedDays = 0;
    if (firstEmp && firstEmp.attendanceDaysPerBranch) {
      aggregatedDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
    } else {
      aggregatedDays = firstEmp?.totalAttendanceDays || (firstEmp?.attendance26Days === true ? 26 : 0);
    }
    // حافز تحدي الظروف (25%): مرة واحدة للمتكرر — الفرع الذي له أعلى صافي بعد الـ 25%
    let challengeRowId = null;
    let maxChallengeTotalAmount = -1;
    allEmpBranches.forEach(branchEmp => {
      const branchRate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
      const branchEvBooking = branchEmp.evaluationsBooking || 0;
      const branchEvGoogle = branchEmp.evaluationsGoogle || 0;
      const branchGross = computeGrossFromBreakdown(branchEmp);
      const branchFund = branchGross * getSupportFundRate();
      let eNet = branchGross - branchFund;
      const eAttendance26Days = branchEmp.attendance26Days === true;
      const eAttendanceBonus = eAttendance26Days ? eNet * 0.25 : 0;
      eNet = eNet + eAttendanceBonus;
      if (eAttendance26Days && eAttendanceBonus > 0 && eNet > maxChallengeTotalAmount) {
        maxChallengeTotalAmount = eNet;
        challengeRowId = branchEmp.id;
      }
    });
    let totalNetFromBranches = 0;
    let totalFundFromBranches = 0;
    let hasExcellenceForEmployee = false;
    let hasCommitmentForEmployee = false;
    allEmpBranches.forEach(branchEmp => {
      const branchRate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
      const branchEvBooking = branchEmp.evaluationsBooking || 0;
      const branchEvGoogle = branchEmp.evaluationsGoogle || 0;
      const branchGross = computeGrossFromBreakdown(branchEmp);
      const branchFund = branchGross * getSupportFundRate();
      let branchNet = branchGross - branchFund;
      const branchAttendance26Days = branchEmp.attendance26Days === true;
      const branchAttendanceBonus = (branchAttendance26Days && challengeRowId === branchEmp.id) ? branchNet * 0.25 : 0;
      branchNet = branchNet + branchAttendanceBonus;
      totalNetFromBranches += branchNet;
      totalFundFromBranches += branchFund;
      const bw = branchWinners[branchEmp.branch];
      if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0 && bw.eval.val > 0) hasExcellenceForEmployee = true;
      if (bw && branchAttendance26Days && ((bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0) || (bw.book.ids.includes(branchEmp.id) && bw.book.val > 0))) hasCommitmentForEmployee = true;
    });
    const finalExcellenceBonus = hasExcellenceForEmployee ? 50 : 0;
    const finalCommitmentBonus = hasCommitmentForEmployee ? 50 : 0;
    const attendance26Days = aggregatedDays >= 26 && allEmpBranches.some(e => e.attendance26Days === true);
    let finalNet = totalNetFromBranches + finalExcellenceBonus + finalCommitmentBonus;
    let totalDiscountAmount = 0;
    let discountDetails = [];
    if (typeof getTotalDiscountForEmployee === 'function') {
      totalDiscountAmount = getTotalDiscountForEmployee(name) || 0;
      finalNet = Math.max(0, finalNet - totalDiscountAmount);
    }
    if (typeof getDiscountDetailsForEmployee === 'function') {
      discountDetails = getDiscountDetailsForEmployee(name);
    }
    const rate = getDisplayRate(aggregatedCount);
    // Build a virtual emp for gross calculation using aggregated breakdown fields
    var _aggEmp = { _reception: 0, _booking: 0, _morning: 0, _evening: 0, _night: 0, _receptionMorning: 0, _receptionEvening: 0, _receptionNight: 0, _bookingRegular: 0, _vipRooms: {}, _vipBySource: {}, _vipMorning: 0, _vipEvening: 0, _vipNight: 0, evaluationsBooking: aggregatedEvalBooking, evaluationsGoogle: aggregatedEvalGoogle };
    allEmpBranches.forEach(function(be) { _aggEmp._reception += be._reception || 0; _aggEmp._booking += be._booking || 0; _aggEmp._morning += be._morning || 0; _aggEmp._evening += be._evening || 0; _aggEmp._night += be._night || 0; _aggEmp._receptionMorning += be._receptionMorning || 0; _aggEmp._receptionEvening += be._receptionEvening || 0; _aggEmp._receptionNight += be._receptionNight || 0; _aggEmp._bookingRegular += be._bookingRegular || 0; _aggEmp._vipMorning += be._vipMorning || 0; _aggEmp._vipEvening += be._vipEvening || 0; _aggEmp._vipNight += be._vipNight || 0; if (be._vipRooms) Object.keys(be._vipRooms).forEach(function(k) { _aggEmp._vipRooms[k] = (_aggEmp._vipRooms[k] || 0) + (be._vipRooms[k] || 0); }); if (be._vipBySource) Object.keys(be._vipBySource).forEach(function(k) { if (!_aggEmp._vipBySource[k]) _aggEmp._vipBySource[k] = { reception: 0, booking: 0 }; _aggEmp._vipBySource[k].reception += (be._vipBySource[k].reception || 0); _aggEmp._vipBySource[k].booking += (be._vipBySource[k].booking || 0); }); });
    const gross = computeGrossFromBreakdown(_aggEmp);
    const fund = totalFundFromBranches;
    const badges = [];
    if (finalExcellenceBonus > 0) badges.push('خبير إرضاء العميل في الفرع');
    if (finalCommitmentBonus > 0) badges.push('حافز الالتزام والانجاز');
    if (attendance26Days) badges.push('بطل تحدي الظروف');
    if (totalDiscountAmount > 0) {
      discountDetails.forEach(d => badges.push(d.isHotelRating ? `خصم ${d.discountType}: ${(d.amount || 0).toFixed(2)} ريال` : `خصم ${d.discountPercentage}% (${d.discountType})`));
    }
    totalFund += totalFundFromBranches;
    totalNet += finalNet;
    totalEval += aggregatedEvalBooking + aggregatedEvalGoogle;
    totalBookings += aggregatedCount;
    // مطابقة getFooterTotals: totalNetNoEval = مجموع لكل فرع (b.count * r_b) * 0.85
    allEmpBranches.forEach(b => {
      const r = b.count > 100 ? 3 : (b.count > 50 ? 2 : 1);
      totalNetNoEval += (b.count * r) * 0.85;
    });
    totalExcellenceBonus += finalExcellenceBonus;
    totalCommitmentBonus += finalCommitmentBonus;
    const explanations = [];
    if (hasExcellenceForEmployee) explanations.push(`خبير إرضاء العميل في الفرع: +${finalExcellenceBonus.toFixed(2)} ريال`);
    if (hasCommitmentForEmployee) explanations.push(`حافز الالتزام والانجاز: +${finalCommitmentBonus.toFixed(2)} ريال`);
    const explanationText = explanations.length > 0 ? explanations.join(' | ') : '';
    printRows.push({
      name: name,
      branch: 'جميع الفروع',
      count: aggregatedCount,
      totalDiscountAmount: totalDiscountAmount,
      discountDetails: discountDetails,
      rate: rate,
      evBooking: aggregatedEvalBooking,
      evGoogle: aggregatedEvalGoogle,
      gross: gross,
      fund: fund,
      net: totalNetFromBranches,
      attendanceBonus: 0,
      excellenceBonus: finalExcellenceBonus,
      commitmentBonus: finalCommitmentBonus,
      finalNet: finalNet,
      badges: badges,
      attendance26Days: attendance26Days,
      explanation: explanationText
    });
  });
} else {
  // Per-row (فرع معين أو طباعة المحدد)
  employeesToPrint.forEach(emp => {
    const s = calcStats(emp);
    let finalExcellenceBonus = s.excellenceBonus;
    let finalCommitmentBonus = s.commitmentBonus;
    let finalAttendanceBonus = s.attendanceBonus;
    let finalAttendance26Days = s.attendance26Days;
    if (s.isDuplicate) {
      const shouldApplyExcellence = bonusApplied[emp.name]?.excellenceRowId === emp.id;
      const shouldApplyCommitment = bonusApplied[emp.name]?.commitmentRowId === emp.id;
      const shouldApplyChallenge = bonusApplied[emp.name]?.challengeRowId === emp.id;
      finalExcellenceBonus = shouldApplyExcellence ? s.excellenceBonus : 0;
      finalCommitmentBonus = shouldApplyCommitment ? s.commitmentBonus : 0;
      if (!shouldApplyChallenge && s.attendanceBonus > 0) {
        s.net = s.net - s.attendanceBonus;
        finalAttendanceBonus = 0;
        finalAttendance26Days = false;
      } else if (shouldApplyChallenge) {
        finalAttendanceBonus = s.attendanceBonus;
        finalAttendance26Days = s.attendance26Days;
      }
    }
    let finalNet = s.net + finalExcellenceBonus + finalCommitmentBonus;
    let totalDiscountAmount = 0;
    let discountDetails = [];
    if (typeof getDiscountForEmployeeInBranch === 'function') {
      const branchBaseNet = s.net;
      totalDiscountAmount = getDiscountForEmployeeInBranch(s.name, branchBaseNet);
      const applyHotelHere = typeof getBranchWithMaxNegativeRatingsForEmployee === 'function' && getBranchWithMaxNegativeRatingsForEmployee(s.name) === s.branch;
      if (typeof getHotelRatingDeductionForEmployee === 'function' && applyHotelHere) totalDiscountAmount += getHotelRatingDeductionForEmployee(s.name);
      finalNet = Math.max(0, finalNet - totalDiscountAmount);
    }
    if (typeof getDiscountDetailsForEmployee === 'function') {
      discountDetails = getDiscountDetailsForEmployee(s.name, s.branch);
    }
    const badges = [];
    if (finalExcellenceBonus > 0) badges.push('خبير إرضاء العميل في الفرع');
    if (finalCommitmentBonus > 0) badges.push('حافز الالتزام والانجاز');
    if (finalAttendance26Days) badges.push('بطل تحدي الظروف');
    if (totalDiscountAmount > 0) {
      discountDetails.forEach(d => badges.push(d.isHotelRating ? `خصم ${d.discountType}: ${(d.amount || 0).toFixed(2)} ريال` : `خصم ${d.discountPercentage}% (${d.discountType})`));
    }
    totalFund += s.fund;
    totalNet += finalNet;
    totalEval += s.evBooking + s.evGoogle;
    totalBookings += s.count;
    totalNetNoEval += (s.count * (s.count > 100 ? 3 : (s.count > 50 ? 2 : 1))) * 0.85;
    totalExcellenceBonus += finalExcellenceBonus;
    totalCommitmentBonus += finalCommitmentBonus;
    const explanations = [];
    if (finalAttendanceBonus > 0) {
      explanations.push(`حافز تحدي الظروف (25%): +${finalAttendanceBonus.toFixed(2)} ريال`);
    }
    if (finalExcellenceBonus > 0) {
      const isMostEval = branchWinners[s.branch]?.eval.ids.includes(s.id) && branchWinners[s.branch].eval.val > 0;
      const isMostBook = branchWinners[s.branch]?.book.ids.includes(s.id) && branchWinners[s.branch].book.val > 0;
      if (isMostEval && isMostBook) {
        explanations.push(`خبير إرضاء العميل في الفرع: +${finalExcellenceBonus.toFixed(2)} ريال`);
      }
    }
    if (finalCommitmentBonus > 0) {
      const isMostEval = branchWinners[s.branch]?.eval.ids.includes(s.id) && branchWinners[s.branch].eval.val > 0;
      const isMostBook = branchWinners[s.branch]?.book.ids.includes(s.id) && branchWinners[s.branch].book.val > 0;
      if (finalAttendance26Days && (isMostEval || isMostBook)) {
        explanations.push(`${isMostEval ? 'حافز الالتزام ورضاء العميل' : 'حافز الالتزام والانجاز'}: +${finalCommitmentBonus.toFixed(2)} ريال`);
      }
    }
    const explanationText = explanations.length > 0 ? explanations.join(' | ') : '';
    printRows.push({
      name: s.name,
      branch: s.branch,
      count: s.count,
      totalDiscountAmount: totalDiscountAmount,
      discountDetails: discountDetails,
      rate: s.count > 100 ? 3 : (s.count > 50 ? 2 : 1),
      evBooking: s.evBooking,
      evGoogle: s.evGoogle,
      gross: s.gross,
      fund: s.fund,
      net: s.net,
      attendanceBonus: finalAttendanceBonus,
      excellenceBonus: finalExcellenceBonus,
      commitmentBonus: finalCommitmentBonus,
      finalNet: finalNet,
      badges: badges,
      attendance26Days: finalAttendance26Days,
      explanation: explanationText
    });
  });
}
// Validate that we have employees to print
if (printRows.length === 0) {
alert('لا توجد بيانات للطباعة. يرجى التأكد من تحديد الموظفين بشكل صحيح.');
return;
}

// Generate HTML — عند طباعة الكل تكون الصفحة بالعرض (landscape) وتقرير محاسبي بصفوف ضيقة بدون أيقونات
const printWindow = window.open('', '_blank');
const reportTitle = filter === 'الكل' ? 'جميع الفروع' : filter;
const useLandscape = !onlySelected && filter === 'الكل';
const accountingStyle = !onlySelected && filter === 'الكل';
const printContent = generatePrintHTML(reportTitle, periodText, reportDate, printRows, {
totalFund, totalNet, totalEval, totalBookings, totalNetNoEval,
totalExcellenceBonus, totalCommitmentBonus
}, useLandscape, accountingStyle);
printWindow.document.write(printContent);
printWindow.document.close();
setTimeout(() => {
printWindow.print();
}, 250);
}
function generatePrintHTML(reportTitle, periodText, reportDate, rows, totals, useLandscape, accountingStyle) {
const pageOrientation = (useLandscape === true) ? 'landscape' : 'portrait';
const compact = accountingStyle === true;
return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير المكافآت - ${reportTitle}</title>
<style>
@page {
  size: A4 ${pageOrientation};
  margin: ${compact ? '6mm' : '10mm'};
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  font-family: 'IBM Plex Sans Arabic', 'Arial', sans-serif;
  direction: rtl;
  background: #fff;
  color: #111;
  padding: ${compact ? '2mm' : '4mm'};
  font-size: ${compact ? '8px' : '10px'};
  line-height: ${compact ? '1.2' : '1.35'};
}
.header {
  border-bottom: 2px solid #0d9488;
  padding-bottom: ${compact ? '4px' : '8px'};
  margin-bottom: ${compact ? '4px' : '8px'};
  text-align: center;
  page-break-after: avoid;
}
.header h1 { font-size: ${compact ? '14px' : '16px'}; font-weight: 900; margin-bottom: 2px; color: #111; }
.header h2 { font-size: ${compact ? '10px' : '12px'}; font-weight: 700; color: #333; margin-bottom: 2px; }
.header .info {
  font-size: ${compact ? '8px' : '10px'};
  color: #444;
  margin-top: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: ${compact ? '2px 0' : '6px 0'};
  font-size: ${compact ? '7px' : '9px'};
  page-break-inside: auto;
}
thead { display: table-header-group; background: #f0fdfa; border-bottom: 2px solid #0d9488; }
thead th {
  padding: ${compact ? '2px 1px' : '5px 3px'};
  text-align: center;
  font-weight: 800;
  font-size: ${compact ? '7px' : '9px'};
  color: #0f766e;
  border: 1px solid #99f6e4;
  background: #ccfbf1;
}
tbody tr { border-bottom: 1px solid #e5e7eb; page-break-inside: avoid; }
tbody tr:nth-child(even) { background: #f8fafc; }
tbody td {
  padding: ${compact ? '2px 1px' : '4px 3px'};
  text-align: center;
  border: 1px solid #e2e8f0;
  font-size: ${compact ? '7px' : '9px'};
  vertical-align: middle;
}
td.name-col { text-align: right; font-weight: 700; padding-right: ${compact ? '3px' : '6px'}; color: #111; }
td.branch-col { text-align: center; color: #475569; font-size: ${compact ? '6.5px' : '8.5px'}; }
td.badge-col { text-align: right; padding-right: ${compact ? '2px' : '6px'}; font-size: ${compact ? '6px' : '8px'}; }
td.badge-col span {
  display: inline-block;
  background: #e0f2fe;
  color: #0369a1;
  padding: ${compact ? '1px 2px' : '2px 4px'};
  margin: 1px;
  border-radius: 2px;
  font-weight: 600;
}
td.number-col { font-weight: 700; font-family: 'IBM Plex Sans Arabic', 'Courier New', monospace; }
td.bonus-col { color: #047857; font-weight: 800; font-size: ${compact ? '6px' : 'inherit'}; }
tfoot { background: #f0fdfa; border-top: 2px solid #0d9488; }
tfoot tr.summary-row { background: #ccfbf1; font-weight: 800; }
tfoot td {
  padding: ${compact ? '3px 2px' : '5px 4px'};
  font-size: ${compact ? '8px' : '10px'};
  font-weight: 900;
  border: 1px solid #0d9488;
  text-align: center;
  color: #111;
}
tfoot td.label-col { text-align: right; padding-right: ${compact ? '4px' : '8px'}; }
.footer {
  margin-top: ${compact ? '4px' : '10px'};
  padding-top: ${compact ? '3px' : '6px'};
  border-top: 1px solid #cbd5e1;
  text-align: center;
  font-size: ${compact ? '7px' : '9px'};
  color: #64748b;
}
.approval-stamp-inline {
  display: inline-flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 60px;
  padding: 5px 6px;
  border: 1.5px solid #991b1b;
  border-radius: 50%;
  background: #fef2f2;
  text-align: center;
}
.approval-stamp-inline .checkmark { display: block; color: #047857; font-size: 12px; font-weight: 900; }
.approval-stamp-inline .dept { display: block; color: #991b1b; font-size: 7px; font-weight: 700; }
.approval-stamp-inline .approv { display: block; color: #991b1b; font-size: 8px; font-weight: 800; }
@media print { body { margin: 0; padding: 0; } }
</style>
</head>
<body>
<div class="header">
<h1>فندق إليت <span style="color: #0d9488;">Elite Hotel</span></h1>
<h2>تقرير استحقاق المكافآت الرسمي</h2>
<div class="info">
<span><strong>الفرع:</strong> ${reportTitle}</span>
<span><strong>الفترة:</strong> ${periodText}</span>
<span><strong>تاريخ التقرير:</strong> ${reportDate}</span>
</div>
</div>
<table>
<thead>
<tr>
<th style="width: 4%;">#</th>
<th style="width: 16%;">اسم الموظف</th>
<th style="width: 9%;">الفرع</th>
<th style="width: 7%;" class="group-divider-subtle">العقود</th>
<th style="width: 7%;">التقييمات</th>
<th style="width: 9%;" class="group-divider-subtle">الإجمالي</th>
<th style="width: 9%;">مساهمة شركاء النجاح</th>
<th style="width: 9%;">الصافي</th>
<th style="width: 10%;" class="group-divider-subtle">الحوافز</th>
<th style="width: 10%;">الإجمالي النهائي</th>
<th style="width: 10%;" class="group-divider-subtle">الملاحظات</th>
</tr>
</thead>
<tbody>
${rows.map((row, index) => {
const badgesHtml = row.badges.length > 0 
? row.badges.map(b => `<span>${b}</span>`).join('')
: '-';
const bonuses = [];
if (row.attendanceBonus > 0) bonuses.push(`+${row.attendanceBonus.toFixed(2)} (25%)`);
if (row.excellenceBonus > 0) bonuses.push(`+${row.excellenceBonus.toFixed(2)}`);
if (row.commitmentBonus > 0) bonuses.push(`+${row.commitmentBonus.toFixed(2)}`);
if (row.totalDiscountAmount > 0 && row.discountDetails) {
  row.discountDetails.forEach(d => {
    var appliedByLabel = d.appliedBy && d.appliedBy.trim() ? d.appliedBy : 'الأدمن';
    if (d.isHotelRating && d.amount != null) {
      bonuses.push(`-${Number(d.amount).toFixed(2)} (${d.discountType})`);
    } else {
      bonuses.push(`-${(row.finalNet / (1 - d.discountPercentage / 100) * (d.discountPercentage / 100)).toFixed(2)} (${d.discountPercentage}% ${d.discountType} - مطبق من ${appliedByLabel})`);
    }
  });
}
const bonusesText = bonuses.length > 0 ? bonuses.join('<br>') : '-';
return `<tr>
<td class="number-col">${index + 1}</td>
<td class="name-col">${row.name}</td>
<td class="branch-col">${row.branch}</td>
<td class="number-col group-divider-subtle">${row.count}</td>
<td class="number-col">${row.evBooking + row.evGoogle}</td>
<td class="number-col group-divider-subtle">${row.gross.toFixed(2)}</td>
<td class="number-col">${row.fund.toFixed(2)}</td>
<td class="number-col">${row.net.toFixed(2)}</td>
<td class="bonus-col group-divider-subtle" style="font-size: 8px;">${bonusesText}</td>
<td class="number-col" style="color: #006400; font-size: 11px;">${row.finalNet.toFixed(2)}</td>
<td class="badge-col group-divider-subtle">${badgesHtml}</td>
</tr>`;
}).join('')}
</tbody>
<tfoot>
<tr class="summary-row">
<td colspan="6" class="label-col">الإجماليات:</td>
<td class="number-col">${totals.totalFund.toFixed(2)}</td>
<td class="number-col">${(totals.totalNet - totals.totalExcellenceBonus - totals.totalCommitmentBonus).toFixed(2)}</td>
<td class="number-col">${(totals.totalExcellenceBonus + totals.totalCommitmentBonus).toFixed(2)}</td>
<td class="number-col" style="color: #006400; font-size: 12px;">${totals.totalNet.toFixed(2)}</td>
<td></td>
</tr>
<tr>
<td colspan="3" class="label-col">إجمالي العقود:</td>
<td class="number-col" colspan="2">${totals.totalBookings}</td>
<td colspan="6"></td>
</tr>
<tr>
<td colspan="3" class="label-col">إجمالي التقييمات:</td>
<td class="number-col" colspan="2">${totals.totalEval}</td>
<td colspan="6"></td>
</tr>
<tr>
<td colspan="3" class="label-col">مساهمة شركاء النجاح (إجمالي):</td>
<td class="number-col" colspan="2">${totals.totalFund.toFixed(2)}</td>
<td colspan="6"></td>
</tr>
<tr class="summary-row" style="background: #d4edda; border-top: 3px solid #40E0D0;">
<td colspan="9" class="label-col" style="font-size: 14px; color: #000; font-weight: 900; text-align: right; padding-right: 20px;">الإجمالي الكلي (عمال + موظفين):</td>
<td class="number-col" style="font-size: 16px; color: #006400; font-weight: 900; text-align: center;">${(totals.totalFund + totals.totalNet).toFixed(2)}</td>
<td></td>
</tr>
</tfoot>
</table>
<div class="explanations-section" style="margin-top: 25px; padding-top: 15px; padding-bottom: 80px; border-top: 2px solid #ddd; position: relative; z-index: 10;">
<h3 style="font-size: 13px; font-weight: 800; color: #000; margin-bottom: 12px; text-align: right;">شرح المبالغ المستحقة:</h3>
<div style="font-size: 9px; line-height: 2; color: #555; font-weight: 300; position: relative; z-index: 10; padding-right: 150px;">
${rows.map((row, index) => {
// Build detailed explanation
// Start with name and final net
let explanation = `<strong style="font-weight: 700; color: #000;">${row.name}</strong> (${row.branch}): <strong style="font-weight: 700; color: #006400;">${row.finalNet.toFixed(2)} ريال</strong> بسبب `;

// Base calculation: bookings + evaluations
const baseParts = [];
const count = row.count || 0;
const evBooking = row.evBooking || 0;
const evGoogle = row.evGoogle || 0;
const rate = row.rate || (count > 100 ? 3 : (count > 50 ? 2 : 1));

var _pe = getPricingConfig();
// Build detailed breakdown explanation
var _exEmp = row._emp || {};
var _exRegMorning = Math.max(0, (_exEmp._morning || 0) - (_exEmp._vipMorning || 0));
var _exRegEvening = Math.max(0, (_exEmp._evening || 0) - (_exEmp._vipEvening || 0));
var _exRegNight = Math.max(0, (_exEmp._night || 0) - (_exEmp._vipNight || 0));
if (_exRegMorning > 0) baseParts.push(`${_exRegMorning} صباح × ${_pe.rateMorning}`);
if (_exRegEvening > 0) baseParts.push(`${_exRegEvening} مساء × ${_pe.rateEvening}`);
if (_exRegNight > 0) baseParts.push(`${_exRegNight} ليل × ${_pe.rateNight}`);
// VIP by source
var _exVipBySource = _exEmp._vipBySource || {};
var _exBranchVipRates = (_pe.rateVipByBranch && row.branch) ? (_pe.rateVipByBranch[row.branch] || {}) : {};
var _exVipDefault = _pe.rateVipDefault || { reception: 0, booking: 0 };
Object.keys(_exVipBySource).forEach(function(roomNum) {
  var src = _exVipBySource[roomNum];
  var rates = _exBranchVipRates[roomNum] || _exVipDefault;
  if ((src.reception || 0) > 0) baseParts.push(`${src.reception} VIP ${roomNum} استقبال × ${rates.reception || 0}`);
  if ((src.booking || 0) > 0) baseParts.push(`${src.booking} VIP ${roomNum} بوكينج × ${rates.booking || 0}`);
});
if (evBooking > 0) baseParts.push(`${evBooking} تقييم بوكينج × ${_pe.rateEvalBooking}`);
if (evGoogle > 0) baseParts.push(`${evGoogle} تقييم جوجل × ${_pe.rateEvalGoogle}`);

if (baseParts.length > 0) {
  explanation += baseParts.join(' + ');
  // Use actual gross from row data or recalculate
  var _empForExpl = row._emp || { count: count, _reception: 0, _booking: 0, _morning: 0, _evening: 0, _night: 0, _vipRooms: {}, _vipBySource: {}, _vipMorning: 0, _vipEvening: 0, _vipNight: 0, evaluationsBooking: evBooking, evaluationsGoogle: evGoogle };
  const grossAmount = computeGrossFromBreakdown(_empForExpl, _pe);
  explanation += ` = ${grossAmount.toFixed(2)} ريال`;
} else {
  explanation += '0.00 ريال';
}

// Subtract fund (participation) - always shown if exists
const fund = row.fund || 0;
if (fund > 0) {
  explanation += ` - مشاركة شركاء النجاح ${fund.toFixed(2)} ريال`;
}

// Add attendance bonus
const attendanceBonus = row.attendanceBonus || 0;
if (attendanceBonus > 0) {
  const attendance26Days = row.attendance26Days || false;
  explanation += ` + حافز تحدي الظروف ${attendanceBonus.toFixed(2)} ريال (25% بسبب ${attendance26Days ? '26 يوم' : 'الحضور'})`;
}

// Add excellence bonus
const excellenceBonus = row.excellenceBonus || 0;
if (excellenceBonus > 0) {
  explanation += ` + خبير إرضاء العميل في الفرع ${excellenceBonus.toFixed(2)} ريال`;
}

// Add commitment bonus
const commitmentBonus = row.commitmentBonus || 0;
if (commitmentBonus > 0) {
  explanation += ` + حافز الالتزام والانجاز ${commitmentBonus.toFixed(2)} ريال`;
}

// Subtract discounts
const totalDiscountAmount = row.totalDiscountAmount || 0;
if (totalDiscountAmount > 0 && row.discountDetails && Array.isArray(row.discountDetails)) {
  const netForDiscount = row.net || 0;
  row.discountDetails.forEach(d => {
    const eventDate = d.eventDate ? new Date(d.eventDate + 'T00:00:00').toLocaleDateString('ar-SA') : '';
    const appliedByLabel = (d.appliedBy && typeof d.appliedBy === 'string' && d.appliedBy.trim()) ? d.appliedBy.trim() : (d.appliedBy || 'الأدمن');
    if (d.isHotelRating && d.amount != null) {
      explanation += ` - خصم ${Number(d.amount).toFixed(2)} ريال (${d.discountType})`;
    } else {
      const discountAmount = (netForDiscount * (d.discountPercentage / 100));
      explanation += ` - خصم ${discountAmount.toFixed(2)} ريال (${d.discountPercentage}% ${d.eventDate ? `- ${eventDate} ` : ''}${d.discountType} - مطبق من ${appliedByLabel})`;
    }
  });
}

return `<div style="margin-bottom: 8px; padding: 6px 10px; border-right: 2px solid #e0e0e0; text-align: right; font-size: 9px; line-height: 1.5; background: ${index % 2 === 0 ? '#f9f9f9' : '#ffffff'};">
${explanation}
</div>`;
}).join('')}
</div>
</div>
<div class="footer">
<p>تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة المكافآت</p>
<p>تاريخ الطباعة: ${reportDate}</p>
</div>
</body>
</html>`;
}
function performPrint(onlySelected, originalSort) {
try {
const rows = document.querySelectorAll('#mainTable tr');
let printFund = 0, printNet = 0, printEval = 0, printBookings = 0;
let printNetNoEval = 0;
const footFundEl = document.getElementById('footFund');
const footNetEl = document.getElementById('footNet');
const footNetNoEvalEl = document.getElementById('footNetNoEval');
const footEvalCountEl = document.getElementById('footEvalCount');
const footBookingCountEl = document.getElementById('footBookingCount');
const footTotalFundEl = document.getElementById('footTotalFund');
const footTotalNetEl = document.getElementById('footTotalNet');
if (!footFundEl || !footNetEl || !footNetNoEvalEl || !footEvalCountEl || !footBookingCountEl || !footTotalFundEl || !footTotalNetEl) {
console.error('Required elements not found for printing');
return;
}
const originalFund = footFundEl.innerText;
const originalNet = footNetEl.innerText;
const originalNetNoEval = footNetNoEvalEl.innerText;
const originalEvalCount = footEvalCountEl.innerText;
const originalBookingCount = footBookingCountEl.innerText;
const originalTotalFund = footTotalFundEl.innerText;
const originalTotalNet = footTotalNetEl.innerText;
rows.forEach(row => {
// Skip badges rows - they will be handled automatically
if (row.classList.contains('badges-row')) {
return;
}
const checkbox = row.querySelector('.emp-checkbox');
if (!checkbox) return;
const isChecked = checkbox.checked;
const colCountEl = row.querySelector('.col-count');
const bookingCount = colCountEl ? parseInt(colCountEl.innerText) || 0 : 0;
// Calc No-Eval for this row
const rate = bookingCount > 100 ? 3 : (bookingCount > 50 ? 2 : 1);
const netNoEval = (bookingCount * rate) * 0.85;
if (onlySelected) {
if (isChecked) {
row.classList.add('selected-for-print');
// Also mark the next badges row if it exists
const nextRow = row.nextElementSibling;
if (nextRow && nextRow.classList.contains('badges-row') && nextRow.dataset.empId === row.dataset.empId) {
nextRow.classList.add('selected-for-print');
}
printFund += parseFloat(row.dataset.fund);
printNet += parseFloat(row.dataset.net);
printEval += parseInt(row.dataset.eval || 0);
printBookings += bookingCount;
printNetNoEval += netNoEval;
} else {
row.classList.remove('selected-for-print');
// Also hide the next badges row if it exists
const nextRow = row.nextElementSibling;
if (nextRow && nextRow.classList.contains('badges-row') && nextRow.dataset.empId === row.dataset.empId) {
nextRow.classList.remove('selected-for-print');
}
}
} else {
printFund += parseFloat(row.dataset.fund);
printNet += parseFloat(row.dataset.net);
printEval += parseInt(row.dataset.eval || 0);
printBookings += bookingCount;
printNetNoEval += netNoEval;
}
});
// Update totals for print
// إجمالي (عمال + موظفين) = مجموع كل الصافي لكل الموظفين + مجموع كل الصافي للعمال (منفصلين في خانتين)
// الخانة الأولى: نسب العمال (fund) - الخانة الثانية: الصافي للموظفين (net)
if (footFundEl) footFundEl.innerText = printFund.toFixed(1); // نسب العمال (بدون علامة -)
if (footNetEl) footNetEl.innerText = printNet.toFixed(2); // الصافي للموظفين
if (footNetNoEvalEl) footNetNoEvalEl.innerText = printNetNoEval.toFixed(2);
if (footEvalCountEl) footEvalCountEl.innerText = printEval;
// footEvalValue removed from display
if (footBookingCountEl) footBookingCountEl.innerText = printBookings;
// إجمالي النهائي لكل فريق العمل = مجموع كل الصافي لكل الموظفين + مجموع كل الصافي للعمال (في خانة واحدة فقط)
// الرقم النهائي المجمع = printNet + printFund
const printFinalTotal = printNet + printFund; // المجموع النهائي
if (footTotalFundEl) footTotalFundEl.innerText = ''; // إخفاء خانة العمال
if (footTotalNetEl) footTotalNetEl.innerText = printFinalTotal.toFixed(2); // الرقم النهائي المجمع
if (onlySelected) {
const targetTableEl = document.getElementById('targetTable');
if (targetTableEl) targetTableEl.classList.add('print-only-selected');
}
// Replace badges with descriptive text for printing
function replaceBadgesForPrint() {
document.querySelectorAll('.badges-wrapper span').forEach(badge => {
const text = badge.innerText || badge.textContent || '';
const row = badge.closest('tr');
// Get branch from parent employee row if this is a badges row
let branch = row?.dataset.branch || '';
if (!branch && row?.classList.contains('badges-row')) {
const empId = row.dataset.empId;
const empRow = document.querySelector(`tr[data-emp-id="${empId}"]:not(.badges-row)`);
branch = empRow?.dataset.branch || '';
}
// Replace emojis with descriptive text
let newText = text;
// Check title attribute for more context
const title = badge.getAttribute('title') || '';
if (text.includes('بطل التقييم') || title.includes('الأعلى تقييماً في الكل')) {
newText = 'الأعلى تقييماً في الكل';
} else if (text.includes('بطل الحجوزات') || title.includes('الأكثر حجوزات في الكل')) {
newText = 'الأكثر حجوزات في الكل';
} else if (text.includes('الأفضل تقييماً') || (title.includes('الأعلى تقييماً') && !title.includes('الكل'))) {
// Check if branch name is already in text
if (text.includes('بال') || text.includes('في الفرعين') || text.includes('فروع')) {
newText = text.replace(/[⭐🎯↓😟✨➥]/g, '').trim();
} else {
newText = `الأعلى تقييماً في ${branch}`;
}
} else if ((text.includes('الأكثر حجوزات') && !text.includes('بطل')) || (title.includes('الأكثر حجوزات') && !title.includes('الكل'))) {
// Check if branch name is already in text
if (text.includes('بال') || text.includes('في الفرعين') || text.includes('فروع')) {
newText = text.replace(/[⭐🎯↓😟✨➥]/g, '').trim();
} else {
newText = `الأكثر حجوزات في ${branch}`;
}
} else if (text.includes('الأقل تقييماً') || title.includes('الأقل تقييماً')) {
// Check if branch name is already in text
if (text.includes('بال') || text.includes('في الفرعين') || text.includes('فروع')) {
newText = text.replace(/[⭐🎯↓😟✨➥]/g, '').trim();
} else if (title.includes('الكل')) {
newText = 'الأقل تقييماً في الكل';
} else {
newText = `الأقل تقييماً في ${branch}`;
}
} else if (text.includes('الأقل حجوزات') || title.includes('الأقل حجوزات')) {
// Check if branch name is already in text
if (text.includes('بال') || text.includes('في الفرعين') || text.includes('فروع')) {
newText = text.replace(/[⭐🎯↓😟✨➥]/g, '').trim();
} else if (title.includes('الكل')) {
newText = 'الأقل حجوزات في الكل';
} else {
newText = `الأقل حجوزات في ${branch}`;
}
} else if (text.includes('مبدع')) {
// Check if branch name is already in text
if (text.includes('الكورنيش') || text.includes('الأندلس') || text.includes('الفرعين') || text.includes('فروع')) {
newText = text.replace(/[⭐🎯↓😟✨➥]/g, '').trim();
} else if (branch) {
newText = `مبدع ${branch}`;
} else {
newText = 'مبدع الشهر';
}
} else if (text.includes('⭐') && branch) {
newText = `الأعلى تقييماً في ${branch}`;
} else if (text.includes('🎯') && branch) {
newText = `الأكثر حجوزات في ${branch}`;
}
// Remove emojis and keep only text
newText = newText.replace(/[⭐🎯↓😟✨➥]/g, '').trim();
if (newText) {
badge.innerText = newText;
badge.style.color = '#000';
badge.style.fontSize = '8px';
}
});
}
replaceBadgesForPrint();
// Add class to body if printing "الكل" (All) to reduce row heights
const isPrintingAll = !onlySelected && currentFilter === 'الكل';
if (isPrintingAll) {
document.body.classList.add('print-all-view');
}
window.print();
// Remove class after printing
setTimeout(() => {
if (isPrintingAll) {
document.body.classList.remove('print-all-view');
}
}, 1000);
// Restore original values and sort
setTimeout(() => {
if (footFundEl) footFundEl.innerText = originalFund;
if (footNetEl) footNetEl.innerText = originalNet;
if (footNetNoEvalEl) footNetNoEvalEl.innerText = originalNetNoEval;
if (footEvalCountEl) footEvalCountEl.innerText = originalEvalCount;
// footEvalValue removed from display
if (footBookingCountEl) footBookingCountEl.innerText = originalBookingCount;
if (footTotalFundEl) footTotalFundEl.innerText = originalTotalFund;
if (footTotalNetEl) footTotalNetEl.innerText = originalTotalNet;
const targetTableEl = document.getElementById('targetTable');
if (targetTableEl) targetTableEl.classList.remove('print-only-selected');
// Restore original sort
if (originalSort && (originalSort.key !== currentSort.key || originalSort.order !== currentSort.order)) {
currentSort.key = originalSort.key;
currentSort.order = originalSort.order;
updateSortIcons();
renderUI(currentFilter);
}
}, 500);
} catch (error) {
console.error('Error in performPrint:', error);
alert('حدث خطأ أثناء الطباعة: ' + error.message);
}
}
// === Toast Notifications ===
function showToast(message, type = 'success') {
  var toast = document.createElement('div');
  toast.className = 'toast toast--' + (type === 'error' ? 'error' : type === 'info' ? 'info' : 'success');
  toast.setAttribute('role', 'alert');
  toast.innerText = message;
  document.body.appendChild(toast);
  setTimeout(function () {
    toast.style.animation = 'toastSlideIn 0.35s ease-out reverse';
    setTimeout(function () { toast.remove(); }, 400);
  }, 3200);
}
// === Loading Overlay (رفع الملف / المزامنة) ===
function showLoadingOverlay(message) {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('loadingOverlay');
  if (el) return;
  el = document.createElement('div');
  el.id = 'loadingOverlay';
  el.setAttribute('aria-busy', 'true');
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:99999;backdrop-filter:blur(4px);';
  el.innerHTML = '<div style="background:rgba(15,23,41,0.95);padding:1.5rem 2rem;border-radius:1rem;border:1px solid rgba(20,184,166,0.35);text-align:center;"><div style="width:40px;height:40px;border:3px solid rgba(20,184,166,0.3);border-top-color:#14b8a6;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 0.75rem;"></div><p style="color:#e2e8f0;font-weight:700;">' + (message || 'جاري التحميل...') + '</p></div>';
  document.body.appendChild(el);
}
function hideLoadingOverlay() {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('loadingOverlay');
  if (el) el.remove();
}
// Conditions Modal — مصدر واحد: shared/conditions-content.json + getPricingConfig()
var conditionsContentSchemaCache = null;

function getConditionsContentSchema(callback) {
  if (conditionsContentSchemaCache) {
    callback(conditionsContentSchemaCache);
    return;
  }
  var pathname = (typeof window !== 'undefined' && window.location && window.location.pathname) ? window.location.pathname : '';
  var base = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
  var url = pathname.indexOf('/rewards') >= 0 ? (base + '/rewards/shared/conditions-content.json') : (base + '/shared/conditions-content.json');
  fetch(url).then(function(r) { return r.ok ? r.json() : Promise.reject(new Error('Not ok')); }).then(function(data) {
    conditionsContentSchemaCache = data;
    callback(data);
  }).catch(function() {
    callback(null);
  });
}

function conditionsReplaceTemplates(str, pricing) {
  if (!str || !pricing) return str;
  return String(str)
    .replace(/\{\{rateMorning\}\}/g, pricing.rateMorning)
    .replace(/\{\{rateEvening\}\}/g, pricing.rateEvening)
    .replace(/\{\{rateNight\}\}/g, pricing.rateNight)
    .replace(/\{\{rateBooking\}\}/g, pricing.rateBooking)
    .replace(/\{\{rateContract\}\}/g, pricing.rateContract != null ? pricing.rateContract : 200)
    .replace(/\{\{vipDescription\}\}/g, pricing.vipDescription != null ? pricing.vipDescription : 'حجوزات VIP — تُسعّر من خانات VIP (استقبال/بوكينج لكل غرفة)')
    .replace(/\{\{rateEvalBooking\}\}/g, pricing.rateEvalBooking)
    .replace(/\{\{rateEvalGoogle\}\}/g, pricing.rateEvalGoogle)
    .replace(/\{\{minEvalCorniche\}\}/g, pricing.minEvalCorniche != null ? pricing.minEvalCorniche : 8.7)
    .replace(/\{\{minEvalAndalus\}\}/g, pricing.minEvalAndalus != null ? pricing.minEvalAndalus : 8.2)
    .replace(/\{\{minEvalGoogle\}\}/g, pricing.minEvalGoogle != null ? pricing.minEvalGoogle : 4.3)
    .replace(/\{\{supportFundPercent\}\}/g, pricing.supportFundPercent != null ? pricing.supportFundPercent : 15);
}

// مطابق لـ THEME_CLASSES في React (App.tsx ConditionsPopup) — لون التوركواز الموحد #14b8a6
var CONDITIONS_THEME_CLASSES = {
  turquoise: { wrap: 'bg-[#14b8a6]/10 rounded-xl p-4 border border-[#14b8a6]/30', title: 'text-[#14b8a6]', bullet: 'text-[#14b8a6]' },
  amber: { wrap: 'bg-amber-500/10 rounded-xl p-4 border border-amber-500/30', title: 'text-amber-400', bullet: 'text-amber-400' },
  yellow: { wrap: 'bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/30', title: 'text-yellow-400', bullet: 'text-yellow-400' },
  green: { wrap: 'bg-green-500/10 rounded-xl p-4 border border-green-500/30', title: 'text-green-400', bullet: 'text-green-400' },
  orange: { wrap: 'bg-orange-500/10 rounded-xl p-4 border border-orange-500/30', title: 'text-orange-400', bullet: 'text-orange-400' },
  red: { wrap: 'bg-red-500/10 rounded-xl p-4 border border-red-500/30', title: 'text-red-400', bullet: 'text-red-400' }
};

function buildConditionsModalHtml(pricing, schema) {
  if (!schema || !schema.sections || !pricing) return '';
  var _rp = pricing;
  var vipByBranch = _rp.rateVipByBranch || {};
  var vipDefault = _rp.rateVipDefault || { reception: 0, booking: 0 };
  var html = '';
  var themeClasses = CONDITIONS_THEME_CLASSES;

  schema.sections.forEach(function(sec) {
    var theme = themeClasses[sec.theme] || themeClasses.turquoise;
    if (sec.id === 'vip') {
      var branchNames = Object.keys(vipByBranch);
      if (branchNames.length === 0 && !(vipDefault.reception > 0 || vipDefault.booking > 0)) return;
      html += '<div class="' + theme.wrap + '"><h4 class="text-base font-bold ' + theme.title + ' mb-3 flex items-center gap-2"><span>' + (sec.icon || '') + '</span><span>' + escHtml(conditionsReplaceTemplates(sec.title || '', _rp)) + '</span></h4><ul class="space-y-2 list-none text-sm text-gray-300">';
      branchNames.forEach(function(branch) {
        var rooms = vipByBranch[branch];
        var roomNums = Object.keys(rooms);
        if (roomNums.length === 0) return;
        var roomParts = [];
        roomNums.forEach(function(room) {
          var r = rooms[room];
          roomParts.push('غرفة ' + escHtml(room) + ' (استقبال: ' + (r.reception || 0) + ' ريال، بوكينج: ' + (r.booking || 0) + ' ريال)');
        });
        html += '<li class="flex items-start gap-2"><span class="' + theme.bullet + ' font-bold">•</span><span class="text-amber-200/90"><strong class="text-amber-300">' + escHtml(branch) + ':</strong> ' + roomParts.join(' — ') + '</span></li>';
      });
      if (vipDefault.reception > 0 || vipDefault.booking > 0) {
        html += '<li class="flex items-start gap-2"><span class="' + theme.bullet + ' font-bold">•</span><span class="text-amber-200/90"><strong class="text-amber-300">VIP افتراضي:</strong> استقبال: ' + vipDefault.reception + ' ريال، بوكينج: ' + vipDefault.booking + ' ريال لكل حجز</span></li>';
      }
      html += '</ul></div>';
      return;
    }

    var isPointsSection = sec.id === 'points';
    var ulClass = 'space-y-2 list-none text-sm text-gray-300' + (isPointsSection ? ' grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2' : '');
    html += '<div class="' + theme.wrap + '"><h4 class="text-base font-bold ' + theme.title + ' mb-3 flex items-center gap-2"><span>' + (sec.icon || '') + '</span><span>' + escHtml(conditionsReplaceTemplates(sec.title || '', _rp)) + '</span></h4><ul class="' + ulClass + '">';
    (sec.items || []).forEach(function(item) {
      if (item.placeholder === 'instructionsButton') {
        html += '<li class="flex items-start gap-2 flex-wrap items-center"><span class="' + theme.bullet + ' font-bold">•</span><span class="text-gray-400">' + escHtml(item.staticBefore || '') + '</span>';
        html += '<button type="button" onclick="event.stopPropagation(); showInstructionsModal();" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-[#14b8a6] bg-[#14b8a6]/20 border border-[#14b8a6]/40 hover:bg-[#14b8a6]/30 transition-colors mt-1 sm:mt-0"><span>او اضغط هنا</span></button></li>';
        return;
      }
      var raw = item.template ? conditionsReplaceTemplates(item.template, _rp) : (item.static || '');
      var text = escHtml(raw);
      if (item.template && item.template.indexOf('ريال') !== -1) text = '<strong class="text-white">' + text + '</strong>';
      html += '<li class="flex items-start gap-2"><span class="' + theme.bullet + ' font-bold">•</span><span>' + text + '</span></li>';
    });
    html += '</ul></div>';
  });

  return html;
}

function buildConditionsPrintDocument(pricing, schema) {
  if (!schema || !schema.sections || !pricing) return '<p>تعذر تحميل المحتوى.</p>';
  var _rp = pricing;
  var vipByBranch = _rp.rateVipByBranch || {};
  var vipDefault = _rp.rateVipDefault || { reception: 0, booking: 0 };
  var title = schema.modalTitle || 'شروط الحصول على المكافآت';
  var body = '<h1>' + escHtml(title) + '</h1>';

  var sectionClass = {
    turquoise: 'section contracts',
    amber: 'section',
    yellow: 'section evaluations',
    green: 'section attendance',
    orange: 'section',
    red: 'section discounts'
  };
  var sectionStyle = {
    orange: 'background-color: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.4); border-right: 5px solid rgba(245, 158, 11, 0.6);',
    amber: 'background-color: rgba(245, 158, 11, 0.06); border-color: rgba(245, 158, 11, 0.35); border-right: 5px solid rgba(245, 158, 11, 0.5);'
  };

  schema.sections.forEach(function(sec) {
    if (sec.id === 'vip') {
      var branchNames = Object.keys(vipByBranch);
      if (branchNames.length === 0 && !(vipDefault.reception > 0 || vipDefault.booking > 0)) return;
      body += '<div class="section" style="background-color: rgba(245, 158, 11, 0.08); border-color: rgba(245, 158, 11, 0.4); border-right: 5px solid rgba(245, 158, 11, 0.6);"><h2>' + (sec.icon || '') + ' ' + escHtml(conditionsReplaceTemplates(sec.title || '', _rp)) + '</h2><ul>';
      branchNames.forEach(function(branch) {
        var rooms = vipByBranch[branch];
        var roomNums = Object.keys(rooms);
        if (roomNums.length === 0) return;
        var roomParts = [];
        roomNums.forEach(function(room) {
          var r = rooms[room];
          roomParts.push('غرفة ' + escHtml(room) + ' (استقبال: ' + (r.reception || 0) + ' ريال، بوكينج: ' + (r.booking || 0) + ' ريال)');
        });
        body += '<li><strong>' + escHtml(branch) + ':</strong> ' + roomParts.join(' — ') + '</li>';
      });
      if (vipDefault.reception > 0 || vipDefault.booking > 0) {
        body += '<li><strong>VIP افتراضي:</strong> استقبال: ' + vipDefault.reception + ' ريال، بوكينج: ' + vipDefault.booking + ' ريال لكل حجز</li>';
      }
      body += '</ul></div>';
      return;
    }

    var cls = sectionClass[sec.theme] || 'section';
    var style = sectionStyle[sec.theme] ? ' style="' + sectionStyle[sec.theme] + '"' : '';
    body += '<div class="' + cls + '"' + style + '><h2>' + (sec.icon || '') + ' ' + escHtml(conditionsReplaceTemplates(sec.title || '', _rp)) + '</h2><ul>';
    (sec.items || []).forEach(function(item) {
      if (item.placeholder === 'instructionsButton') {
        body += '<li>' + escHtml(item.staticBefore || '') + '.</li>';
        return;
      }
      var text = item.template ? conditionsReplaceTemplates(item.template, _rp) : (item.static || '');
      body += '<li>' + (item.template && item.template.indexOf('ريال') !== -1 ? '<strong>' + escHtml(text) + '</strong>' : escHtml(text)) + '</li>';
    });
    body += '</ul></div>';
  });

  return '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">' +
    '<title>' + escHtml(title) + '</title>' +
    '<style>@page { size: A4 portrait; margin: 10mm; } * { margin: 0; padding: 0; box-sizing: border-box; } body { font-family: "IBM Plex Sans Arabic", Arial, sans-serif; padding: 8px 12px; background: #fff; color: #111; line-height: 1.4; direction: rtl; font-size: 10px; } h1 { font-size: 16px; font-weight: 900; color: #111; margin-bottom: 8px; text-align: center; border-bottom: 2px solid #0d9488; padding-bottom: 6px; } .section { margin-bottom: 8px; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; page-break-inside: avoid; } .section.contracts { background-color: rgba(59, 130, 246, 0.08); border-color: rgba(59, 130, 246, 0.35); border-right: 4px solid rgba(59, 130, 246, 0.6); } .section.evaluations { background-color: rgba(234, 179, 8, 0.08); border-color: rgba(234, 179, 8, 0.35); border-right: 4px solid rgba(234, 179, 8, 0.6); } .section.attendance { background-color: rgba(16, 185, 129, 0.08); border-color: rgba(16, 185, 129, 0.35); border-right: 4px solid rgba(16, 185, 129, 0.6); } .section.discounts { background-color: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.35); border-right: 4px solid rgba(239, 68, 68, 0.6); } h2 { font-size: 11px; font-weight: 800; color: #111; margin: 0 0 6px 0; } ul { list-style: none; padding: 0; margin: 0; } li { font-size: 9.5px; font-weight: 600; color: #111; margin: 4px 0; padding-right: 14px; position: relative; line-height: 1.4; text-align: right; } li::before { content: "•"; position: absolute; right: 0; top: 0; font-weight: 900; color: #0d9488; } @media print { body { padding: 4mm 6mm; } .conditions-one-page { page-break-after: avoid; page-break-inside: avoid; } }</style></head><body><div class="conditions-one-page">' +
    body +
    '</div></body></html>';
}

/**
 * Populate the conditions modal from shared/conditions-content.json + getPricingConfig().
 * Called every time the modal is opened so it always reflects current settings.
 */
function populateConditionsModalContent() {
  var container = document.getElementById('conditionsModalContent');
  if (!container) return;
  container.innerHTML = '<p class="text-gray-400 py-4 text-center">جاري تحميل الشروط...</p>';
  getConditionsContentSchema(function(schema) {
    if (!container) return;
    if (!schema) {
      container.innerHTML = '<p class="text-red-400/90 py-4 text-center">تعذر تحميل محتوى الشروط. تأكد من توفر ملف shared/conditions-content.json.</p>';
      return;
    }
    var pricing = getPricingConfig();
    container.innerHTML = buildConditionsModalHtml(pricing, schema);
  });
}

/**
 * Populate the INLINE print-conditions section (visible only during browser Ctrl+P print).
 * Uses same source: conditions-content.json + getPricingConfig().
 */
function populatePrintConditionsInline() {
  var container = document.getElementById('printConditionsInlineContent');
  if (!container) return;
  container.innerHTML = '<p style="text-align:right;direction:rtl;">جاري التحميل...</p>';
  getConditionsContentSchema(function(schema) {
    if (!container) return;
    if (!schema) {
      container.innerHTML = '<p style="text-align:right;direction:rtl;color:#999;">تعذر تحميل محتوى الشروط.</p>';
      return;
    }
    var pricing = getPricingConfig();
    var doc = buildConditionsPrintDocument(pricing, schema);
    var start = doc.indexOf('<div class="conditions-one-page">');
    var end = doc.indexOf('</div></body>');
    if (start !== -1 && end !== -1) {
      var inner = doc.substring(start + 31, end);
      container.innerHTML = '<h3 style="font-size: 16px; font-weight: 900; color: #111; margin: 0 0 12px 0; text-align: center; direction: rtl; border-bottom: 2px solid #0d9488; padding-bottom: 8px;">' + escHtml(schema.modalTitle || 'شروط الحصول على المكافآت') + '</h3>' + inner;
    } else {
      container.innerHTML = '<p style="text-align:right;direction:rtl;">تعذر تحميل محتوى الشروط.</p>';
    }
  });
}

// Auto-populate print conditions before browser print (Ctrl+P)
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', function() {
    populatePrintConditionsInline();
  });
}

function showConditionsModal() {
populateConditionsModalContent();
const modal = document.getElementById('conditionsModal');
if (modal) {
modal.style.setProperty('z-index', '999', 'important');
modal.classList.remove('hidden');
modal.classList.add('flex');
}
}
function closeConditionsModal(event) {
if (event && event.target !== event.currentTarget) return;
const modal = document.getElementById('conditionsModal');
if (modal) {
modal.classList.add('hidden');
modal.classList.remove('flex');
}
}

/** نافذة «كيفية حساب التقييم» — تظهر من صفحة الإحصائيات فقط */
function showRatingExplanationModal() {
const modal = document.getElementById('ratingExplanationModal');
if (modal) {
modal.style.setProperty('z-index', '999', 'important');
modal.classList.remove('hidden');
modal.classList.add('flex');
}
}
function closeRatingExplanationModal(event) {
if (event && event.target !== event.currentTarget) return;
const modal = document.getElementById('ratingExplanationModal');
if (modal) {
modal.classList.add('hidden');
modal.classList.remove('flex');
}
}

function showInstructionsModal() {
var body = document.getElementById('instructionsModalBody');
var modal = document.getElementById('instructionsModal');
if (!body || !modal) return;
// تُحدَّث في كل فتح لظهور أنواع الخصم الإضافية التي أضافها المدير
body.innerHTML = getInstructionsContent();
modal.classList.remove('hidden');
modal.classList.add('flex');
}

function closeInstructionsModal(event) {
if (event && event.target !== event.currentTarget) return;
const modal = document.getElementById('instructionsModal');
if (modal) {
modal.classList.add('hidden');
modal.classList.remove('flex');
}
}

function printInstructionsModal() {
var content = typeof getInstructionsContent === 'function' ? getInstructionsContent() : (document.getElementById('instructionsModalBody') && document.getElementById('instructionsModalBody').innerHTML) || '';
var base = window.location.origin + (window.location.pathname || '').replace(/[^/]*$/, '');
var printWin = window.open('', '_blank');
if (!printWin) { if (typeof showToast === 'function') showToast('❌ يرجى السماح بالنوافذ المنبثقة للطباعة', 'error'); return; }
printWin.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>لائحة تعليمات وسياسات عمل موظفي الاستقبال</title><link rel="stylesheet" href="' + base + 'src/styles.css"><style>@page{size:A4 portrait;margin:10mm}body{background:#fff!important;color:#111!important;padding:6mm 8mm;font-family:"IBM Plex Sans Arabic",Arial,sans-serif;font-size:10px;line-height:1.4}@media print{body{background:#fff!important;color:#111!important}.no-print{display:none!important}</style></head><body>' +
  '<h1 style="font-size:16px;font-weight:900;color:#111;margin-bottom:10px;text-align:center;border-bottom:2px solid #0d9488;padding-bottom:8px;">لائحة تعليمات وسياسات عمل موظفي الاستقبال</h1>' +
  '<div style="max-width:100%;margin:0 auto;font-size:10px;line-height:1.4;">' + content + '</div></body></html>');
printWin.document.close();
printWin.focus();
setTimeout(function () { if (typeof scaleToFitA4 === 'function') scaleToFitA4(printWin.document); printWin.print(); }, 400);
}

function getCustomInstructionsSectionHtml() {
try {
var all = [];
try { all = JSON.parse(localStorage.getItem('adora_rewards_discountTypes') || '[]'); } catch (e) { }
var def = (typeof window !== 'undefined' && window.DEFAULT_DISCOUNT_CLAUSES_55) ? window.DEFAULT_DISCOUNT_CLAUSES_55 : [];
var custom = all.filter(function (t) { return t && def.indexOf(t) < 0; });
if (custom.length === 0) return '';
var lis = custom.map(function (t) {
var s = String(t).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
return '<li class="flex gap-2"><span class="text-purple-400">•</span><span>' + s + '</span></li>';
}).join('');
return '<div class="bg-purple-500/10 rounded-xl p-4 border border-purple-500/30"><h4 class="text-purple-400 font-bold mb-2 text-base">أنواع خصم إضافية (أضافها المدير)</h4><p class="text-gray-400 text-xs mb-2">تظهر تلقائياً هنا عند إضافة المدير نوع خصم جديد من نافذة الخصومات.</p><ul class="space-y-2 text-gray-300 list-none">' + lis + '</ul></div>';
} catch (e) { return ''; }
}

function getInstructionsContent() {
return '<div class="space-y-5">' +
'<p class="text-gray-300 text-center border-b border-white/10 pb-3">تهدف هذه اللائحة إلى تنظيم سير العمل في قسم الاستقبال وضمان تقديم أفضل خدمة ممكنة للنزلاء. يجب على جميع الموظفين الالتزام التام بالتعليمات والسياسات المذكورة أدناه.</p>' +
'<div class="bg-turquoise/10 rounded-xl p-4 border border-turquoise/30"><h4 class="text-turquoise font-bold mb-2 text-base">القسم الأول: المظهر العام والسلوكيات الأساسية</h4><ul class="space-y-2 text-gray-300 list-none"><li class="flex gap-2"><span class="text-turquoise">•</span><span>المظهر الشخصي: يجب على الموظف العناية بنظافته الشخصية، بما في ذلك نظافة الأسنان، الملابس، والرائحة وتعليق الاسم والالتزام بالزي السعودي الرسمي.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>التواجد في مكان العمل: يلتزم الموظف بالتواجد في مكتب الاستقبال خلال فترة دوامه، ولا يجوز له التواجد في أماكن غير مخصصة لعمله مثل المقهى أو المخزن أو خارج المبنى.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>استخدام الهاتف: يمنع استخدام الهاتف الجوال الشخصي أمام النزلاء خلال ساعات العمل. كما يمنع إعطاء الرقم الشخصي للنزيل تحت أي ظرف.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>التعامل مع النزلاء: يمنع الجلوس في حال وجود نزيل في منطقة الاستقبال. يجب إعطاء الأولوية للنزيل وعدم الانشغال بأي شيء آخر أثناء التحدث معه.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>يُمنع تسجيل دخول النزيل دون إثبات هوية ساري المفعول. يجب التحقق من الهوية بمطابقة الأصل عند تسجيل الدخول وتسجيل بياناتها فقط، دون طلب أو أخذ نسخة منها (كارت العائلة غير الزامي).</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>في حال تأخر إدخال النزيل إلى الوحدة المحجوزة في الوقت المحدد، يجب استلام الحقائب وحفظها، وتوفير مكان مناسب للسائح يتم فيه تقديم المشروبات أو الوجبات مجانًا أثناء الانتظار.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>السلوك العام: ممنوع تناول الطعام أو الشراب أمام النزلاء. يجب الحفاظ على نظافة وترتيب مكتب الاستقبال بشكل دائم، وتجنب ترك الأوراق والأكواب وغيرها من الأشياء المتناثرة.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>التعامل مع الخلافات: في حال حدوث أي خلاف بين الموظفين، يمنع منعًا باتًا مناقشة الأمر أمام النزلاء. يجب إبلاغ المدير المسؤول فورًا.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>الهدوء: يجب أن يكون موظف الاستقبال مسؤولًا عن الحفاظ على بيئة هادئة ومنظمة في منطقة الاستقبال. يمنع تواجد أكثر من ثلاثة أشخاص في الاستقبال، سواء كانوا موظفين أو عمالًا أو إداريين.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>الخصوصية: ممنوع إعطاء أي معلومات عن النزلاء لأي شخص كان في حال طلب أي شخص معلومات عن نزيل، يجب إخباره بالاتصال به مباشرة او بضرورة احضار اذن رسمي من الجهة الرسمية المختصة.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>المهام الشخصية: يجب الاحتفاظ بالأمور الشخصية، مثل المكالمات الهاتفية ورسائل الجوال ومواقع التواصل الاجتماعي، بعيدًا عن وقت ومكان العمل.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>تسجيل كافة الملاحظات: تسجيل أي ملاحظه للنزلاء مكتوبه حتى لو تم حلها وإبلاغ مشرف الاستقبال بها كسجل توثيق.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>التأكد من جاهزية أدوات العمل: عند بدء الدوام يجب التأكد من جاهزية (الكاميرات – التلفون – الانترنت – تكييف الاستقبال – تلفزيون الاستقبال – موسيقي الاستقبال – الطابعة – صرف نقدي – تسجيل المرافقين – ترحيل شموس – التواصل مع الحجوزات – فتح الغرف الشاغرة – الحضور وعدم الحضور – توقيع كل العقود – الرد على كل الرسائل – تحصيل كل الرسوم – فحص برنامج المفاتيح – تدوين ملاحظات الشفت السابق) في حال وجود أي تقصير من الموظف السابق يجب ابلاغ المشرف فوراً.</span></li><li class="flex gap-2"><span class="text-turquoise">•</span><span>في حال وجود موظف سياحة: في فرع الكورنيش يتم فتح الغرف القديمة فقط وغير مسموح بفتح الغرف الجديدة بالدور الثالث والرابع.</span></li></ul></div>' +
'<div class="bg-blue-500/10 rounded-xl p-4 border border-blue-500/30"><h4 class="text-blue-400 font-bold mb-2 text-base">القسم الثاني: إجراءات الحجوزات والدفع</h4><ul class="space-y-2 text-gray-300 list-none"><li class="flex gap-2"><span class="text-blue-400">•</span><span>التسعير: غير مسموح بالتفاوض على الأسعار المكتوبة في قائمة الأسعار إلا في حالات محددة يتم إبلاغ الموظف بها مسبقًا. لا يختص مدير التشغيل أو المشرف بالتفاوض على الأسعار مع النزلاء.</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>الحجوزات الشهرية: يجب أن تكون الإيجارات الشهرية مدفوعة مقدمًا وغير مستردة.</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>العقود: من الضروري توقيع النزيل على عقد تسجيل الدخول لضمان حقوق المنشأة في حال وجود أي مشكلة.</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>التأمين: يتم احتساب مبلغ تأمين قدره 100 ريال كحد أدنى على كل نزيل. يُستحسن تحصيل التأمين كاش فيجب سؤال النزيل عن توافر كاش. يتم رد مبلغ التأمين عند تسجيل الخروج بعد خصم خدمات الفندق (مثل المغسلة والميني بار إن وجد). في حال عدم أخذ التأمين، يتحمل الموظف مسؤولية أي مستحقات للنزيل. بعض الحالات يتم التغاضي فيها عن تحصيل التأمين (حجوزات المطار – تابي وتمارا – بوكينج الأجانب).</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>يُمنع اشتراط أن يكون حجز الوحدة لأكثر من ليلة واحدة.</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>غير مسموح بتسجيل رقم جوال غير دقيق او مكتمل للنزيل (يطبق على الأرقام الدولية يتم كتابه رقم النزيل في الملاحظات فقط على نزيل مع تسجيل رقم الفندق ببيانات النزيل).</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>المستحقات المالية: في حال تجاوز المبلغ المستحق على النزيل إيجار ليلة واحدة، يجب على موظف الاستقبال إبلاغ المشرف المباشر لمطالبة النزيل بالدفع قبل بداية الشفت التالي وفي حال عدم القدرة على التحصيل يتم نقل مسؤوليه التحصيل لشفت الليل.</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>المدفوعات: عند رد أي مبالغ متبقية للنزيل (بخلاف التأمين)، يجب توقيعه على سند الصرف.</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>السندات والفواتير: مسموح بإعطاء النزيل صوره من العقد والسندات والفاتورة بعد الخروج وممنوع تسجيل سند خدمه او فاتورة بقيمة صفر.</span></li><li class="flex gap-2"><span class="text-blue-400">•</span><span>الحسابات: كل موظف مسؤول عن حسابه على النظام. يجب إغلاق الحساب بعد انتهاء الدوام.</span></li></ul></div>' +
'<div class="bg-green-500/10 rounded-xl p-4 border border-green-500/30"><h4 class="text-green-400 font-bold mb-2 text-base">القسم الثالث: التعامل مع النزلاء والخدمات</h4><ul class="space-y-2 text-gray-300 list-none"><li class="flex gap-2"><span class="text-green-400">•</span><span>ترحيل العقود: يجب ترحيل جميع العقود على نظام شموس وتسجيل المرافقين خصوصاً الحجوزات المجمعة ومراجعة ذلك بداية كل شفت وفي حال وجود عميل غير مرحل من خلال نزيل يتم ترحيله يدوي وفي حال عدم الترحيل يجب ابلاغ المشرف ومدير التشغيل.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>الضيافة: يمكن تقديم ضيافة مجانية (قهوة، شاي، تمر) لأي نزيل حسب تقدير موظف الاستقبال للأمر.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>النزلاء المميزون: يتم تقديم ضيافة خاصة (قهوة وتمر) لعملاء أجنحة الـ VIP وضيوف المالك. كما يجب منحهم اهتمامًا خاصًا اثناء استقبالهم، خصوصًا في حال وجود نزلاء آخرين كما يجب ارسال العمال قبل دخول النزل لإعادة تنظيف الملحق مع إعطاء النزيل أولوية الخروج المتأخر.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>لنزلاء تجهيزات ذكري الزواج – تقليل التواصل مع النزيل وعدم التواصل المتكرر لتسجيل الخروج.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>النظافة: رسمياً تتوفر خدمة التنظيف للنزلاء من الساعة 11:00 صباحًا إلى 9:00 مساءً. يحصل النزلاء الشهري على هذه الخدمة مرتين إلى ثلاث مرات أسبوعيًا كحد أقصى. لا تدخل في مشكله مع نزيل على شيء بسيط اجعل المرونة ورضاء النزيل هما البوصلة.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>تحديد صلاحية الغرف: غير مسموح بتحويل حالة الغرفة إلى نظيفة إلا بعد فحص وتأكيد من مشرف العمال.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>فحص الغرف: مشرف العمال هو المسؤول الأول عن فحص الغرفة عند خروج النزيل في حال الانشغال يمكن لحامل الحقائب القيام بعمليه فحص الغرفة. لا يسمح بتسجيل خروج النزيل دون فحص الغرفة. يتحمل الموظف مسؤولية أي تلف أو نقصان بعد خروج النزيل في حال عدم فحص الغرفة. يتم ابلاغ النزيل بالانتظار في الاستقبال لحين التأكد من عدم نسيان أغراض له في الغرفة.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>تغيير الغرف: غير مسموح بنقل نزيل من غرفة إلى أخرى دون ذكر سبب النقل في نزيل.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>الصيانة: لا يجوز إدخال أي غرفة للصيانة دون ذكر السبب الفعلي على برنامج نزيل ومن ثم إبلاغ مشرف العمال وفني الصيانة.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>الاستجابة للطلبات: يجب الرد على اتصالات الفندق ورسائل الواتساب وبوكينج في أسرع وقت ممكن. ممنوع وضع هاتف الفندق او الجوال على الوضع الصامت.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>الاتصال: يجب استخدام تحية رسمية عند الرد على الهاتف، مثل: السلام عليكم، معك فندق إليت، أنا (اسم الموظف)، كيف أقدر أخدمك؟</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>تحويل المكالمات: في حال طلب النزيل خدمة غير مختص بها الموظف، يجب تحويل الاتصال بطريقة مؤدبة، مثل: دقيقة من فضلك، سيتم تحويل المكالمة إلى الإدارة.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>إشعار النزيل بوقتٍ كافٍ قبل البدء بأي أعمال صيانة أو نحوها تخص المرافق أو التجهيزات، والتي قد ينتج عنها إزعاج أو ضوضاء تصل إلى الوحدة التي يقيم فيها، مع توضيح موعد بدء الأعمال وانتهائها بشكلٍ دقيق.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>المفقودات: يُبلغ السائح بأي مفقودات تخصه يتم العثور عليها، ويتم الاحتفاظ بها مدة لا تقل عن (30) يومًا وتُحتسب المدة من تاريخ إبلاغ النزيل، وفي حال تعذر إبلاغه تُخطر الجهات المختصة بذلك.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>يُحظر الامتناع عن إعادة أمتعة النزيل أو مقتنياته الشخصية، سواء كانت مودعة في الاستقبال أو موجودة داخل الوحدة التي يشغلها.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>يُمنع اتخاذ أي إجراء يُلزم السائح بمغادرة الوحدة بعد تسجيل دخوله مثل فصل الكهرباء.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>يُلتزم بإبلاغ الجهات المختصة والوزارة فورًا، وبشكلٍ مباشر، من خلال القنوات المخصصة لذلك، عن أي حادث يتعلق بالأمن أو السلامة في الفندق.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>تأكد من توفير وحدة بديلة للسائح فورًا في الفرع الثاني او مكان قريب مساوية أو أعلى فئة وتصنيفًا، أو إعادة المبلغ المدفوع، في الحالات التالية: انقطاع الخدمات الأساسية مثل الكهرباء والماء لأكثر من ساعتين. كما يجب توفير وحدة بديلة أو إعادة المبلغ إذا تعذّر على السائح دخول الوحدة المحجوزة بعد تجاوز موعد الدخول بساعتين.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>الخروج من الغرف: يمنع على موظف الاستقبال الصعود منفرداً إلى أي غرفة (شاغرة أو مشغولة) تحت أي مبرر، إلا بعلم الإدارة.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>الزوار: يمنع صعود أي شخص (مندوب، سائق، توصيل مطاعم) إلى الغرفة إلا بعد تواصل النزيل بالاستقبال ومرافقة أحد العمال له. في حال بقاء الزائر في الغرفة لأكثر من دقيقة، يجب تسجيل هويته في ملاحظات الغرفة.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>التواصل اللاسلكي: يجب أن يكون التواصل مع مشرف النظافة أو العمال عبر الجهاز اللاسلكي إن وجدت في أضيق الحدود بكلمات مختصره متفق عليها مسبقاً، وبنداء طارئ وبدون تفاصيل مطوله.</span></li><li class="flex gap-2"><span class="text-green-400">•</span><span>الخروج المتأخر: يُسمح للنزيل بالخروج ورد المبلغ المدفوع في حال لم يمر على دخوله أكثر من نصف ساعة، ودون استخدام محتويات الغرفة. يتم فحص الغرفة من قبل عامل قبل رد المبلغ للنزيل وتوقيعه على سند استلام المبلغ.</span></li></ul></div>' +
'<div class="bg-yellow-500/10 rounded-xl p-4 border border-yellow-500/30"><h4 class="text-yellow-400 font-bold mb-2 text-base">القسم الرابع: إجراءات بوكينج وتسجيل الخروج</h4><ul class="space-y-2 text-gray-300 list-none"><li class="flex gap-2"><span class="text-yellow-400">•</span><span><strong>الحجوزات عبر بوكينج:</strong> غير مسموح بطلب إلغاء الحجز من النزيل. يتم منح أولوية التواصل صباحاً لنزيل بوكينج، حتى لو كان رقمه خاطئًا يتم التواصل معه عن طريق رسائل الموقع، الحالة الوحيدة المسموح فيها بعدم التواصل معه هي امتلاء الفندق بالكامل. يمنع محاسبة نزلاء بوكينج بمبلغ مخالف للحجز أو بعدد ليال أقل. يُسمح بطلب التأمين من نزلاء بوكينج بقيمة 100 ريال كحد أدنى وتزيد قيمة التأمين حسب رؤية الموظف. يجب متابعة إلغاء الحجوزات عبر بوكينج، حيث يتم فتح الغرفة تلقائيًا على الموقع. يجب على الموظف تعديل وضع المتاح ورفع السعر لضمان عدم الحجز. لا يُسمح ابلاغ النزيل بإلغاء حجز نزيل بوكينج بسبب عدم توفر غرفة في حال وصوله للفندق في الوقت الرسمي للدخول. يجب عرض خيارين: ترقية مجانية للحجز، أو تحويله إلى فرعنا الآخر مع ذكر المميزات المتاحة. يتم عمل عدم حضور للنزلاء الساعة 12 الليل.</span></li><li class="flex gap-2"><span class="text-yellow-400">•</span><span><strong>تسجيل الخروج:</strong> موعد الخروج الرسمي هو الساعة 2:00 ظهرًا. يتم الاتصال بالنزيل من الساعة 12 ظهراً للاستفسار عن تجديد الإقامة أو المغادرة. الخروج المتأخر: في حال رغبة النزيل في الخروج بعد الموعد الرسمي (بحد أقصى الساعة 8:00 مساءً)، يتم احتساب خدمة خروج متأخر. يتم تفعيل هذه الخدمة في الأيام التي لا توجد فيها مواسم. الدخول المبكر: في حال رغبة النزيل في الدخول المبكر (من الساعة 4:00 فجرًا)، يتم احتساب خدمة دخول مبكر. يتم تفعيل هذه الخدمة في الأيام التي لا توجد فيها حجوزات، وفي حال توافر أكثر من 3 شقق شاغرة.</span></li></ul><p class="mt-3 text-yellow-200/90 text-xs">أثناء مغادرة نزيل بوكينج، يمكنك تشجيعه على حجز إقامته القادمة مباشرةً من الفندق للاستفادة من المزايا: خصم 5% عند الاحتفاظ بكارت الفندق، مرونة في المواعيد، إمكانية الحجز المسبق عبر الهاتف، الانضمام لعضوية (Elite) لخصومات تصل إلى 15%، وسؤال النزيل عن الملاحظات والاقتراحات وطلب تقييم الفندق على خرائط جوجل.</p></div>' +
'<div class="bg-red-500/10 rounded-xl p-4 border border-red-500/30"><h4 class="text-red-400 font-bold mb-2 text-base">القسم الخامس: سياسات الدوام والإجازات</h4><ul class="space-y-2 text-gray-300 list-none"><li class="flex gap-2"><span class="text-red-400">•</span><span>الدوام الرسمي: يجب على جميع الموظفين الالتزام بالجدول المحدد والمعتمد من مشرف الاستقبال.</span></li><li class="flex gap-2"><span class="text-red-400">•</span><span>استبدال الدوام: يمنع استبدال أيام الإجازة أو الدوام إلا بالتنسيق مع الزميل وقبل 24 ساعة ويوجد ما يثبت الطلب وموافقه الزميل على ذلك.</span></li><li class="flex gap-2"><span class="text-red-400">•</span><span>التأخير: مسموح بتأخير بحد أقصى 15 دقيقة في الظروف الطارئة. يتم تطبيق جزاء حسب رؤية الإدارة ويتم مضاعفة الجزاء وتوجيه إنذار رسمي في حال تكرار التأخير.</span></li><li class="flex gap-2"><span class="text-red-400">•</span><span>الغياب: في حال الرغبة في الغياب، يجب تقديم طلب مكتوب قبل 24 ساعة على الأقل. الغياب بدون طلب مكتوب يعتبر غيابًا بدون اذن ويتم خصم يومين. يتم مضاعفة الجزاء وتوجيه إنذار رسمي في حال التكرار.</span></li></ul></div>' +
(getCustomInstructionsSectionHtml()) +
'</div>';
}

// === Reports Page Functions ===
let currentReportsBranchFilter = 'الكل';
function showReportsPage() {
const reportsPage = document.getElementById('reportsPage');
const dashboard = document.getElementById('dashboard');
const actionBtns = document.getElementById('actionBtns');
if (!reportsPage || !dashboard) return;
// Hide dashboard and show reports page
dashboard.classList.add('hidden');
reportsPage.classList.remove('hidden');
// Hide header action buttons to avoid conflicts
if (actionBtns) {
actionBtns.style.display = 'none';
actionBtns.style.setProperty('display', 'none', 'important');
}
// Populate reports page
populateReportsPage();
// إخفاء زر "رجوع" للإداريين كي لا يصلوا للمشروع الكامل
var adminRoles = ['supervisor', 'hr', 'accounting', 'manager'];
var r = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
var urlRole = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search).get('role') : null;
var isAdminRole = (r && adminRoles.indexOf(r) >= 0) || (urlRole && adminRoles.indexOf(urlRole) >= 0);
if (isAdminRole && reportsPage) {
  var backBtn = reportsPage.querySelector('button[onclick*="hideReportsPage"]');
  if (backBtn) backBtn.style.display = 'none';
}
// صلاحيات المدير: عرض تبويب «الإحصائيات» فقط وإخفاء التبويبين الآخرين وزر طباعة كل التقارير
var isManager = (r === 'manager' || urlRole === 'manager');
var tabCurrent = document.getElementById('reportsTabCurrent');
var tabArchived = document.getElementById('reportsTabArchived');
var tabStatistics = document.getElementById('reportsTabStatistics');
var printAllBtn = reportsPage && reportsPage.querySelector('button[onclick*="printAllEmployeeReports"]');
var codesBtn = reportsPage && reportsPage.querySelector('button[onclick*="showEmployeeCodesModal"]');
if (isManager && reportsPage) {
  if (tabCurrent) { tabCurrent.style.display = 'none'; }
  if (tabArchived) { tabArchived.style.display = 'none'; }
  if (tabStatistics) { tabStatistics.style.display = ''; }
  if (typeof switchReportsTab === 'function') switchReportsTab('statistics');
  if (printAllBtn) printAllBtn.style.display = 'none';
  if (codesBtn) codesBtn.style.display = 'none';
  // المدير العام (صفحة موجودة): جدول التقييم + كروت النقاط التراكمية فقط + أرشيف الإحصائيات أسفل الجدول — الترويسة (شروط المكافآت فقط) من rewards-rbac
  var tabsBar = document.getElementById('reportsTabsBar');
  var cumulativeSection = document.getElementById('cumulativePointsSection');
  var headerBlock = document.getElementById('currentPeriodStatsHeaderBlock');
  var archivedStatsSection = document.getElementById('archivedPeriodsSection');
  var statsContent = document.getElementById('statisticsReportsContent');
  var statsBlock = document.getElementById('currentPeriodStatsBlock');
  var clearCumulativeBtn = document.getElementById('clearCumulativePointsBtn');
  if (tabsBar) tabsBar.style.display = 'none';
  if (headerBlock) headerBlock.style.display = 'none';
  if (cumulativeSection) {
    cumulativeSection.style.display = '';
    if (clearCumulativeBtn) clearCumulativeBtn.style.display = 'none';
    var cumulativeBody = document.getElementById('cumulativePointsBody');
    if (cumulativeBody) { cumulativeBody.style.display = ''; }
    var arrow = document.getElementById('cumulativePointsArrow');
    if (arrow) arrow.style.transform = 'rotate(-90deg)';
  }
  if (archivedStatsSection) {
    archivedStatsSection.classList.remove('hidden');
    archivedStatsSection.setAttribute('aria-hidden', 'false');
    if (typeof loadArchivedStatsPeriodsList === 'function') loadArchivedStatsPeriodsList();
  }
  if (statsContent && statsBlock && cumulativeSection && archivedStatsSection) {
    statsContent.style.display = 'flex';
    statsContent.style.flexDirection = 'column';
    statsBlock.style.order = '1';
    cumulativeSection.style.order = '2';
    archivedStatsSection.style.order = '3';
  }
} else {
  if (tabCurrent) tabCurrent.style.display = '';
  if (tabArchived) tabArchived.style.display = '';
  if (tabStatistics) tabStatistics.style.display = '';
  if (printAllBtn) printAllBtn.style.display = '';
  if (codesBtn) codesBtn.style.display = '';
  var tabsBar = document.getElementById('reportsTabsBar');
  var cumulativeSection = document.getElementById('cumulativePointsSection');
  var headerBlock = document.getElementById('currentPeriodStatsHeaderBlock');
  var archivedStatsSection = document.getElementById('archivedPeriodsSection');
  var statsContent = document.getElementById('statisticsReportsContent');
  var statsBlock = document.getElementById('currentPeriodStatsBlock');
  var clearCumulativeBtn = document.getElementById('clearCumulativePointsBtn');
  if (tabsBar) tabsBar.style.display = '';
  if (cumulativeSection) { cumulativeSection.style.display = ''; cumulativeSection.style.order = ''; }
  if (headerBlock) headerBlock.style.display = '';
  if (archivedStatsSection) {
    archivedStatsSection.classList.add('hidden');
    archivedStatsSection.setAttribute('aria-hidden', 'true');
    archivedStatsSection.style.order = '';
  }
  if (statsContent) { statsContent.style.display = ''; statsContent.style.flexDirection = ''; }
  if (statsBlock) statsBlock.style.order = '';
  if (clearCumulativeBtn) clearCumulativeBtn.style.display = '';
}
// زر «مسح كل الفترات (بداية جديدة)» للأدمن فقط — إخفاؤه عن المدير العام (manager) والحسابات وHR والمشرف
var clearArchivedBtn = document.getElementById('clearArchivedPeriodsBtn');
var isAdminOnly = typeof isAdminMode === 'function' && isAdminMode();
var currentRoleForClear = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
var hideClearFromManager = (currentRoleForClear === 'manager');
if (clearArchivedBtn) clearArchivedBtn.style.display = (isAdminOnly && !hideClearFromManager) ? '' : 'none';
}
function hideReportsPage() {
  var adminRoles = ['supervisor', 'hr', 'accounting', 'manager'];
  var currentRole = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
  var urlRole = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search).get('role') : null;
  var isAdminRole = (currentRole && adminRoles.indexOf(currentRole) >= 0) || (urlRole && adminRoles.indexOf(urlRole) >= 0);
  if (isAdminRole) {
    showAdminNoReturnScreen();
    return;
  }
  const reportsPage = document.getElementById('reportsPage');
  const dashboard = document.getElementById('dashboard');
  const actionBtns = document.getElementById('actionBtns');
  if (!reportsPage || !dashboard) return;
  reportsPage.classList.add('hidden');
  dashboard.classList.remove('hidden');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty('display');
  }
}

function showAdminSubmittedScreen() {
  try {
    if (typeof db !== 'undefined' && db && db.length > 0) {
      try {
        localStorage.setItem('adora_rewards_db', JSON.stringify(db));
        if (typeof branches !== 'undefined' && branches) localStorage.setItem('adora_rewards_branches', JSON.stringify([...branches]));
        if (typeof reportStartDate !== 'undefined') localStorage.setItem('adora_rewards_startDate', reportStartDate || '');
        if (typeof currentEvalRate !== 'undefined') localStorage.setItem('adora_rewards_evalRate', String(currentEvalRate || 20));
        if (typeof employeeCodesMap !== 'undefined') localStorage.setItem('adora_rewards_employeeCodes', JSON.stringify(employeeCodesMap || {}));
      } catch (e) {}
    }
    const periodId = typeof getCurrentPeriodId === 'function' ? getCurrentPeriodId() : '';
    const role = localStorage.getItem('adora_current_role') || '';
    if (periodId && role) {
      try { localStorage.setItem('adora_admin_submitted_' + periodId + '_' + role, Date.now().toString()); } catch (e) {}
    }
    localStorage.removeItem('adora_current_role');
    localStorage.removeItem('adora_current_token');
    localStorage.removeItem('adora_current_period');
  } catch (e) {}
  var countdownSec = 3;
  var countdownElId = 'adora-close-countdown';
  document.body.innerHTML = '\n    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0f172a 0%,#1a1f35 100%);color:#fff;font-family:\'IBM Plex Sans Arabic\',Arial,sans-serif;text-align:center;padding:2rem;">\n      <div style="max-width:480px;">\n        <div style="font-size:4rem;margin-bottom:1rem;">✅</div>\n        <h1 style="font-size:1.5rem;font-weight:900;margin-bottom:1rem;color:#6ee7b7;">تم ربط البيانات بالجدول</h1>\n        <p style="color:#94a3b8;margin-bottom:1rem;">شكراً. تم حفظ إدخالك ولا يمكنك الرجوع لتعديل البيانات من هذا الرابط.</p>\n        <p id="' + countdownElId + '" style="color:#6ee7b7;font-size:1rem;font-weight:700;margin-bottom:1.5rem;">جاري إغلاق الصفحة خلال ' + countdownSec + ' ثانية...</p>\n        <p style="color:#64748b;font-size:0.875rem;">يمكنك إغلاق هذه الصفحة يدوياً إذا لم تُغلق تلقائياً.</p>\n      </div>\n    </div>\n  ';
  var countdownEl = document.getElementById(countdownElId);
  var t = setInterval(function () {
    countdownSec--;
    if (countdownEl) countdownEl.textContent = countdownSec > 0 ? 'جاري إغلاق الصفحة خلال ' + countdownSec + ' ثانية...' : 'جاري الإغلاق...';
    if (countdownSec <= 0) {
      clearInterval(t);
      try { window.close(); } catch (e) {}
      if (countdownEl) countdownEl.textContent = 'يمكنك إغلاق هذه الصفحة الآن.';
    }
  }, 1000);
}

function submitAdminAndLock() {
  var banner = document.getElementById('roleWelcomeBanner');
  var sendBtn = banner ? banner.querySelector('button[onclick*="submitAdminAndLock"]') : null;
  if (sendBtn) sendBtn.disabled = true;

  var progressWrap = document.getElementById('submitProgressWrap');
  var progressBar = document.getElementById('submitProgressBar');
  if (!progressWrap && banner) {
    progressWrap = document.createElement('div');
    progressWrap.id = 'submitProgressWrap';
    progressWrap.className = 'mt-2 w-full max-w-[200px]';
    progressWrap.style.cssText = 'display: none;';
    progressWrap.innerHTML = '<div class="mt-1.5 w-full rounded-full overflow-hidden relative" style="height: 6px;"><div style="position: absolute; inset: 0; background: #4b5563;"></div><div id="submitProgressBar" style="position: absolute; left: 0; top: 0; width: 0%; height: 100%; background: linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e 100%); transition: width 0.25s ease;"></div></div>';
    var btnContainer = (sendBtn && sendBtn.parentElement) || banner.querySelector('.flex-shrink-0');
    if (btnContainer) btnContainer.appendChild(progressWrap);
  }
  if (progressWrap) {
    progressWrap.style.display = 'block';
    progressBar = document.getElementById('submitProgressBar');
  }
  function setProgress(pct) {
    if (progressBar) progressBar.style.width = (pct || 0) + '%';
  }
  setProgress(0);
  setTimeout(function () { setProgress(25); }, 150);
  // تفريغ الحقل النشط (blur) لضمان حفظ آخر قيمة في localStorage قبل الرفع
  try {
    var ae = document.activeElement;
    if (ae && ae.classList && (ae.classList.contains('eval-input') || ae.classList.contains('attendance-toggle') || ae.classList.contains('attendance-days-input')))
      ae.blur();
  } catch (_) {}
  // تهيئة Firebase قبل الإرسال (صفحة المشرف/HR قد تكون فتحت قبل اكتمال التهيئة)
  if (typeof initializeFirebase === 'function') initializeFirebase();
  var syncPromise = new Promise(function (resolve, reject) {
    setTimeout(function () {
      // دفع قيم حقول HR (أيام الحضور) من الـ DOM إلى db و localStorage قبل الرفع — مثل المشرف
      if (typeof flushAdminInputsToStorage === 'function') flushAdminInputsToStorage();
      var p = typeof doSyncLivePeriodNow === 'function' ? doSyncLivePeriodNow() : Promise.resolve();
      p.then(resolve).catch(reject);
    }, 300);
  });
  syncPromise.then(function () {
    setProgress(100);
    if (typeof showToast === 'function') showToast('تم الإرسال بنجاح', 'success');
    setTimeout(function () {
      if (progressWrap) progressWrap.style.display = 'none';
      if (sendBtn) sendBtn.disabled = false;
      showAdminSubmittedScreen();
    }, 400);
  }).catch(function (err) {
    setProgress(0);
    if (progressWrap) progressWrap.style.display = 'none';
    if (sendBtn) sendBtn.disabled = false;
    var msg = (err && err.message) ? err.message : 'حدث خطأ أثناء المزامنة';
    if (typeof showToast === 'function') showToast(msg, 'error');
  });
}

function showAdminNoReturnScreen() {
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0f172a 0%,#1a1f35 100%);color:#fff;font-family:'IBM Plex Sans Arabic',Arial,sans-serif;text-align:center;padding:2rem;">
      <div style="max-width:480px;">
        <div style="font-size:3rem;margin-bottom:1rem;">🔒</div>
        <h1 style="font-size:1.25rem;font-weight:900;margin-bottom:1rem;color:#fbbf24;">لا يمكنك الرجوع للمشروع</h1>
        <p style="color:#94a3b8;margin-bottom:1.5rem;">أنت ترى صفحتك فقط. استخدم زر «إرسال الرابط» في أعلى الصفحة لإنهاء الإدخال وربط البيانات بالجدول، ثم يُقفل الرابط.</p>
        <button type="button" onclick="location.reload()" style="background:#6ee7b7;color:#0f172a;padding:10px 20px;border-radius:8px;font-weight:800;cursor:pointer;border:none;">العودة لصفحتي</button>
      </div>
    </div>
  `;
}
function populateReportsPage() {
// Ensure actionBtns stays hidden when reports page is open
const actionBtns = document.getElementById('actionBtns');
if (actionBtns) {
  actionBtns.style.display = 'none';
  actionBtns.style.setProperty('display', 'none', 'important');
}
// Populate branch filters
const branchFiltersContainer = document.querySelector('#reportsPage .flex.flex-wrap.gap-2');
if (branchFiltersContainer) {
let html = `
<button onclick="filterReportsByBranch('الكل')" 
class="filter-reports-pill ${currentReportsBranchFilter === 'الكل' ? 'active' : ''} px-4 py-2 rounded-lg text-sm font-bold transition-all ${currentReportsBranchFilter === 'الكل' ? 'text-white shadow-[0_0_20px_rgba(64,224,208,0.3)]' : 'text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-turquoise/50'}" 
data-filter="الكل">
الكل
</button>
`;
branches.forEach(b => {
  const isActive = currentReportsBranchFilter === b;
  const bAttr = typeof escAttr === 'function' ? escAttr(b) : String(b).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  const bHtml = typeof escHtml === 'function' ? escHtml(b) : String(b).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  html += `
<button onclick="filterReportsByBranch('${bAttr}')" 
class="filter-reports-pill ${isActive ? 'active' : ''} px-4 py-2 rounded-lg text-sm font-bold transition-all ${isActive ? 'text-white shadow-[0_0_20px_rgba(64,224,208,0.3)]' : 'text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-turquoise/50'}" 
data-filter="${bHtml}">
${bHtml}
</button>
`;
});
branchFiltersContainer.innerHTML = html;
}
// Populate employees grid
const grid = document.getElementById('reportsEmployeesGrid');
if (!grid) return;
grid.innerHTML = '';
// Get unique employees (handle duplicates)
const uniqueEmployees = new Map();
let filteredDb = [...db];
if (currentReportsBranchFilter !== 'الكل') {
filteredDb = filteredDb.filter(emp => emp.branch === currentReportsBranchFilter);
}
filteredDb.forEach(emp => {
const key = emp.name;
if (!uniqueEmployees.has(key)) {
uniqueEmployees.set(key, []);
}
uniqueEmployees.get(key).push(emp);
});
// Sort by name
const sortedNames = Array.from(uniqueEmployees.keys()).sort();
sortedNames.forEach(name => {
const employees = uniqueEmployees.get(name);
const isDuplicate = employees.length > 1;
const card = document.createElement('div');
card.className = 'glass p-3 rounded-lg border border-white/15 hover:border-turquoise/40 transition-all cursor-pointer min-w-0';
// Create click handler function
const handleCardClick = (e) => {
e.preventDefault();
e.stopPropagation();
if (isDuplicate) {
if (typeof showEmployeeReportAggregated === 'function') showEmployeeReportAggregated(name);
} else {
showEmployeeReport(employees[0].id);
}
};
card.onclick = handleCardClick;
card.addEventListener('click', handleCardClick);
const branchesText = isDuplicate ? employees.map(e => e.branch).join('، ') : employees[0].branch;
// مصدر واحد: نفس الصافي المعروض في الجدول والتقرير (بدون إعادة حساب)
let totalCount = 0;
employees.forEach(emp => { totalCount += emp.count || 0; });
const totalNet = typeof getDisplayNetForEmployee === 'function'
  ? (isDuplicate ? getDisplayNetForEmployee(name, { aggregated: true }) : getDisplayNetForEmployee(employees[0].id))
  : 0;
const nameSafe = typeof escHtml === 'function' ? escHtml(name) : String(name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const branchesTextSafe = typeof escHtml === 'function' ? escHtml(branchesText) : String(branchesText || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
card.innerHTML = `
<div class="flex flex-col gap-1.5">
<div class="flex items-center justify-between gap-2 min-w-0">
<h3 class="text-sm font-bold text-white truncate">${nameSafe}</h3>
${isDuplicate ? '<span class="text-[10px] text-turquoise font-semibold bg-turquoise/15 px-1.5 py-0.5 rounded shrink-0">متكرر</span>' : ''}
</div>
<p class="text-xs text-gray-400 truncate">${branchesTextSafe}</p>
<div class="flex items-center gap-2 text-xs">
${isDuplicate
  ? `<span class="text-gray-400">${totalCount} حجز إجمالي</span><span class="text-white/50">·</span><span class="text-turquoise font-semibold">${totalNet.toFixed(2)} ر</span>`
  : `<span class="text-gray-400">${employees[0].count} حجز</span><span class="text-white/50">·</span><span class="text-turquoise font-semibold">${totalNet.toFixed(2)} ر</span>`
}
</div>
<div class="flex items-center justify-end pt-1 border-t border-white/10 mt-0.5">
<span class="text-[10px] text-turquoise/90 font-medium">عرض التقرير ←</span>
</div>
</div>
`;
grid.appendChild(card);
});
}
function filterReportsByBranch(branch) {
currentReportsBranchFilter = branch;
// Ensure actionBtns stays hidden
const actionBtns = document.getElementById('actionBtns');
if (actionBtns) {
  actionBtns.style.display = 'none';
  actionBtns.style.setProperty('display', 'none', 'important');
}
populateReportsPage();
}
// Debounce for reports search (performance: avoid re-filter on every key)
let reportsSearchTimeout = null;
function scheduleReportsFilter(inputEl) {
if (reportsSearchTimeout) clearTimeout(reportsSearchTimeout);
reportsSearchTimeout = setTimeout(function () {
filterReportsEmployees(inputEl ? inputEl.value : '');
}, 300);
}
function filterReportsEmployees(searchTerm) {
const grid = document.getElementById('reportsEmployeesGrid');
if (!grid) return;
const cards = grid.querySelectorAll('div');
const term = (searchTerm || '').trim().toLowerCase();
cards.forEach(card => {
const text = card.textContent.toLowerCase();
card.style.display = text.includes(term) ? 'block' : 'none';
});
}
// عند الضغط على اسم موظف (عرض الكل): نفس آلية جمع الصافي — تقرير مجمع بالاسم (فرع واحد أو كل الفروع). لا نعتمد على isDuplicate.
function handleEmployeeNameClick(empName, empId, _isDuplicate) {
  if (typeof showEmployeeReportAggregated === 'function' && empName) {
    showEmployeeReportAggregated(empName);
    return;
  }
  if (empId && typeof showEmployeeReport === 'function') {
    showEmployeeReport(empId);
    return;
  }
  const firstEmp = db && db.find(function (e) { return e.name === empName; });
  if (firstEmp && typeof showEmployeeReport === 'function') {
    showEmployeeReport(firstEmp.id);
  }
}
function showBranchSelectionForReport(empName, employees) {
const modal = document.getElementById('employeeReportModal');
if (!modal) return;
const content = document.getElementById('employeeReportContent');
const title = document.getElementById('reportEmployeeName');
if (!content || !title) return;
title.innerText = `اختر الفرع - ${empName}`;
content.innerHTML = `
<div class="space-y-3">
<p class="text-white mb-4 font-semibold">الموظف موجود في ${employees.length} فروع. اختر الفرع لعرض التقرير:</p>
${employees.map(emp => `
<div onclick="showEmployeeReport('${(typeof escAttr === 'function' ? escAttr(emp.id) : String(emp.id || '').replace(/'/g, "\\'"))}')" class="p-4 rounded-xl cursor-pointer transition-all" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(64, 224, 208, 0.3);" onmouseover="this.style.background='rgba(255, 255, 255, 0.15)'; this.style.borderColor='rgba(64, 224, 208, 0.6)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.borderColor='rgba(64, 224, 208, 0.3)';">
<div class="flex items-center justify-between">
<div>
<h3 class="text-lg font-bold text-white">${(typeof escHtml === 'function' ? escHtml(emp.name) : String(emp.name || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'))}</h3>
<p class="text-sm text-gray-300 mt-1">الفرع: <span class="text-turquoise font-semibold">${(typeof escHtml === 'function' ? escHtml(emp.branch) : String(emp.branch || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'))}</span></p>
</div>
<span class="text-turquoise text-xl">→</span>
</div>
</div>
`).join('')}
</div>
`;
modal.style.setProperty('display', 'flex', 'important');
modal.style.setProperty('z-index', '1000', 'important');
modal.classList.remove('hidden');
}
function calculateEmployeeReport(empId) {
const emp = db.find(e => e.id === empId);
if (!emp) return null;
const { branchWinners } = computeBranchWinnersAndLosers(db, branches);
// Calculate employee's details
const _p = getPricingConfig();
const rate = getDisplayRate(emp.count);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const gross = computeGrossFromBreakdown(emp, _p);
const fund = gross * getSupportFundRate();
let net = gross - fund;
const netBeforeAttendanceBonus = net; // Save net before attendance bonus
const attendance26Days = emp.attendance26Days === true;
// Get actual attendance days
const empNameCount = db.filter(e => e.name === emp.name).length;
let actualAttendanceDays = attendance26Days ? 26 : 0;
if (empNameCount > 1) {
actualAttendanceDays = emp.totalAttendanceDays || (attendance26Days ? 26 : 0);
}
// For duplicate employees: check if this branch should get challenge bonus (25%)
let attendanceBonus = 0;
let finalAttendance26Days = attendance26Days;
if (empNameCount > 1) {
// Duplicate employee: find which branch should get challenge bonus
const allEmpRows = db.filter(e => e.name === emp.name);
let challengeRowId = null;
let maxChallengeTotalAmount = -1;
allEmpRows.forEach(e => {
const eRate = e.count > 100 ? 3 : (e.count > 50 ? 2 : 1);
const eEvBooking = e.evaluationsBooking || 0;
const eEvGoogle = e.evaluationsGoogle || 0;
const eGross = computeGrossFromBreakdown(e);
const eFund = eGross * getSupportFundRate();
let eNet = eGross - eFund;
const eAttendance26Days = e.attendance26Days === true;
const eAttendanceBonus = eAttendance26Days ? eNet * 0.25 : 0;
eNet = eNet + eAttendanceBonus;
// Only consider branches where employee actually qualifies for challenge bonus
if (eAttendance26Days && eAttendanceBonus > 0) {
if (eNet > maxChallengeTotalAmount) {
maxChallengeTotalAmount = eNet;
challengeRowId = e.id;
}
}
});
// Only apply challenge bonus if this is the selected branch
if (challengeRowId === emp.id && attendance26Days) {
attendanceBonus = net * 0.25;
net = net + attendanceBonus;
} else {
// Don't apply challenge bonus in this branch
attendanceBonus = 0;
finalAttendance26Days = false;
}
} else {
// Non-duplicate: apply challenge bonus normally
attendanceBonus = attendance26Days ? net * 0.25 : 0;
net = net + attendanceBonus;
}
// Check bonuses
const bw = branchWinners[emp.branch];
const hasExcellenceBonus = bw?.book.ids.includes(emp.id) && bw?.eval.ids.includes(emp.id) && bw.book.val > 0 && bw.eval.val > 0;
const excellenceBonus = hasExcellenceBonus ? 50 : 0;
const isMostEval = bw?.eval.ids.includes(emp.id) && bw.eval.val > 0;
const isMostBook = bw?.book.ids.includes(emp.id) && bw.book.val > 0;
const hasCommitmentBonus = finalAttendance26Days && (isMostEval || isMostBook);
const isMostCommitted = hasCommitmentBonus;
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
let finalNet = net + excellenceBonus + commitmentBonus;

let totalDiscountAmount = 0;
let discountDetails = [];
if (typeof getDiscountForEmployeeInBranch === 'function') {
  const branchBaseNet = net;
  totalDiscountAmount = getDiscountForEmployeeInBranch(emp.name, branchBaseNet);
  const applyHotelHere = typeof getBranchWithMaxNegativeRatingsForEmployee === 'function' && getBranchWithMaxNegativeRatingsForEmployee(emp.name) === emp.branch;
  if (typeof getHotelRatingDeductionForEmployee === 'function' && applyHotelHere) totalDiscountAmount += getHotelRatingDeductionForEmployee(emp.name);
  finalNet = Math.max(0, finalNet - totalDiscountAmount);
}
if (typeof getDiscountDetailsForEmployee === 'function') {
  discountDetails = getDiscountDetailsForEmployee(emp.name, emp.branch);
}

var breakdown = {
  staffCount: emp._staffCount != null ? emp._staffCount : (emp.count || 0),
  reception: emp._reception || 0,
  booking: emp._booking || 0,
  morning: emp._morning || 0,
  evening: emp._evening || 0,
  night: emp._night || 0,
  vipRooms: emp._vipRooms || {},
  vipTotal: emp._vipTotal || 0,
  alertCount: emp._alertCount || 0,
  alertTotal: emp._alertTotal || 0
};
return {
emp,
rate,
evBooking,
evGoogle,
gross,
fund,
net,
netBeforeAttendanceBonus,
attendanceBonus,
actualAttendanceDays,
excellenceBonus,
commitmentBonus,
finalNet,
totalDiscountAmount,
discountDetails,
hasExcellenceBonus,
hasCommitmentBonus,
attendance26Days: finalAttendance26Days,
isMostCommitted,
isMostEval,
isMostBook,
maxEvalCount: bw?.eval.val || 0,
maxBookCount: bw?.book.val || 0,
breakdown: breakdown
};
}
/** بناء نصوص تفصيل "X في الفرع أ و Y في الفرع ب" للموظف المتكرر */
function buildBreakdownTextForAggregated(allEmpBranches) {
  function part(branch, val) { return (val != null && val !== '' ? val : 0) + ' في ' + branch; }
  return {
    staffCount: allEmpBranches.map(function (e) { return part(e.branch, e._staffCount != null ? e._staffCount : e.count); }).join(' و '),
    reception: allEmpBranches.map(function (e) { return part(e.branch, e._reception); }).join(' و '),
    booking: allEmpBranches.map(function (e) { return part(e.branch, e._booking); }).join(' و '),
    morning: allEmpBranches.map(function (e) { return part(e.branch, e._morning); }).join(' و '),
    evening: allEmpBranches.map(function (e) { return part(e.branch, e._evening); }).join(' و '),
    night: allEmpBranches.map(function (e) { return part(e.branch, e._night); }).join(' و '),
    vipTotal: allEmpBranches.map(function (e) { return part(e.branch, e._vipTotal); }).join(' و '),
    alertCount: allEmpBranches.map(function (e) { return part(e.branch, e._alertCount); }).join(' و '),
    alertTotal: allEmpBranches.map(function (e) { return part(e.branch, e._alertTotal); }).join(' و ')
  };
}
/** تقرير مجمع للموظف المتكرر (اسم واحد = تقرير واحد يجمع كل الفروع). غير متكرر: نفس نتيجة calculateEmployeeReport. */
function calculateAggregatedEmployeeReport(empName) {
  const allEmpBranches = db.filter(function (e) { return e.name === empName; });
  if (allEmpBranches.length === 0) return null;
  if (allEmpBranches.length === 1) return calculateEmployeeReport(allEmpBranches[0].id);
  // Inline aggregated stats calculation (getAggregatedStats is scoped inside renderUI and not accessible here)
  var totalCount = allEmpBranches.reduce(function (s, e) { return s + (e.count || 0); }, 0);
  var totalEvalBooking = allEmpBranches.reduce(function (s, e) { return s + (e.evaluationsBooking || 0); }, 0);
  var totalEvalGoogle = allEmpBranches.reduce(function (s, e) { return s + (e.evaluationsGoogle || 0); }, 0);
  var totalDays = 0;
  allEmpBranches.forEach(function (e) {
    var branchDays = (e.attendanceDaysPerBranch && e.attendanceDaysPerBranch[e.branch] !== undefined)
      ? (parseInt(e.attendanceDaysPerBranch[e.branch], 10) || 0)
      : (e.totalAttendanceDays !== undefined ? e.totalAttendanceDays : (e.attendance26Days === true ? 26 : 0));
    totalDays += typeof branchDays === 'number' ? branchDays : (parseInt(branchDays, 10) || 0);
  });
  if (totalDays === 0 && allEmpBranches[0]) {
    var first = allEmpBranches[0];
    totalDays = first.totalAttendanceDays !== undefined ? first.totalAttendanceDays : (first.attendance26Days === true ? 26 : 0);
  }
  const rate = getDisplayRate(totalCount);
  // Compute aggregated gross as SUM of per-branch grosses (each branch uses its correct VIP rates)
  var gross = 0;
  allEmpBranches.forEach(function(be) { gross += computeGrossFromBreakdown(be); });
  const branchReports = allEmpBranches.map(function (e) { return calculateEmployeeReport(e.id); }).filter(Boolean);
  let totalNetFromBranches = 0;
  let hasExcellenceForEmployee = false;
  let hasCommitmentForEmployee = false;
  const branchWinners = typeof computeBranchWinnersAndLosers === 'function' ? computeBranchWinnersAndLosers(db, branches).branchWinners : {};
  // For duplicates: determine which branch gets the 25% challenge bonus (same logic as calcStats)
  let challengeRowIdAgg = null;
  {
    let maxChallengeTotalAgg = -1;
    allEmpBranches.forEach(function (e) {
      const eGross = computeGrossFromBreakdown(e);
      const eFund = eGross * getSupportFundRate();
      let eNet = eGross - eFund;
      const eAtt = e.attendance26Days === true;
      const eBonus = eAtt ? eNet * 0.25 : 0;
      eNet = eNet + eBonus;
      if (eAtt && eBonus > 0 && eNet > maxChallengeTotalAgg) {
        maxChallengeTotalAgg = eNet;
        challengeRowIdAgg = e.id;
      }
    });
  }
  allEmpBranches.forEach(function (branchEmp) {
    const branchGross = computeGrossFromBreakdown(branchEmp);
    const branchFund = branchGross * getSupportFundRate();
    let branchNet = branchGross - branchFund;
    const branchAttendance26Days = branchEmp.attendance26Days === true;
    // Only apply 25% to the selected branch (challengeRowId)
    const applyChallenge = challengeRowIdAgg === branchEmp.id && branchAttendance26Days;
    const branchAttendanceBonus = applyChallenge ? branchNet * 0.25 : 0;
    branchNet = branchNet + branchAttendanceBonus;
    totalNetFromBranches += branchNet;
    const bw = branchWinners[branchEmp.branch];
    if (bw && bw.book && bw.book.ids && bw.book.ids.includes(branchEmp.id) && bw.eval && bw.eval.ids && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0 && bw.eval.val > 0) hasExcellenceForEmployee = true;
    if (bw && branchAttendance26Days && ((bw.eval && bw.eval.ids && bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0) || (bw.book && bw.book.ids && bw.book.ids.includes(branchEmp.id) && bw.book.val > 0))) hasCommitmentForEmployee = true;
  });
  // الصافي = مرآة لمجموع صافي الفرعين (حافز 25% مرة واحدة، حوافز 50 مرة واحدة، خصم مرة واحدة).
  var totalFundFromBranches = 0;
  branchReports.forEach(function (r) {
    totalFundFromBranches += (r.fund != null ? r.fund : 0);
  });
  let totalDiscountAmount = 0;
  if (typeof getTotalDiscountForEmployee === 'function') {
    totalDiscountAmount = getTotalDiscountForEmployee(empName) || 0;
  }
  // استخدام totalNetFromBranches (25% مرة واحدة) + حوافز مرة واحدة − خصم مرة واحدة = نفس رقم الجدول
  let finalNet = totalNetFromBranches + (hasExcellenceForEmployee ? 50 : 0) + (hasCommitmentForEmployee ? 50 : 0);
  finalNet = Math.max(0, finalNet - totalDiscountAmount);
  let fund = totalFundFromBranches;
  const attendance26Days = totalDays >= 26;
  // حافز تحدي الظروف يُضاف مرة واحدة (من الفرع الذي حقق فيه أعلى صافي)
  let attendanceBonus = 0;
  if (challengeRowIdAgg && attendance26Days) {
    const challBranch = allEmpBranches.find(function (e) { return e.id === challengeRowIdAgg; });
    if (challBranch) {
      const challGross = computeGrossFromBreakdown(challBranch);
      const challNet = challGross - challGross * getSupportFundRate();
      attendanceBonus = challNet * 0.25;
    }
  }
  const netBeforeAttendanceBonus = totalNetFromBranches - attendanceBonus;
  let net = finalNet;
  let discountDetails = [];
  if (typeof getDiscountDetailsForEmployee === 'function') discountDetails = getDiscountDetailsForEmployee(empName) || [];
  const hasExcellenceBonus = hasExcellenceForEmployee;
  const hasCommitmentBonus = hasCommitmentForEmployee;
  const excellenceBonus = hasExcellenceBonus ? 50 : 0;
  const commitmentBonus = hasCommitmentBonus ? 50 : 0;
  const branchesLabel = allEmpBranches.map(function (e) { return e.branch; }).join('، ');
  const syntheticEmp = { name: empName, branch: 'جميع الفروع (' + branchesLabel + ')', id: allEmpBranches[0].id, count: totalCount };
  const maxEvalCount = branchReports.length ? Math.max.apply(null, branchReports.map(function (r) { return r.maxEvalCount || 0; })) : 0;
  const maxBookCount = branchReports.length ? Math.max.apply(null, branchReports.map(function (r) { return r.maxBookCount || 0; })) : 0;
  var breakdownText = typeof buildBreakdownTextForAggregated === 'function' ? buildBreakdownTextForAggregated(allEmpBranches) : null;
  return {
    emp: syntheticEmp,
    rate: rate,
    evBooking: totalEvalBooking,
    evGoogle: totalEvalGoogle,
    gross: gross,
    fund: fund,
    net: net,
    netBeforeAttendanceBonus: netBeforeAttendanceBonus,
    attendanceBonus: attendanceBonus,
    actualAttendanceDays: totalDays,
    excellenceBonus: excellenceBonus,
    commitmentBonus: commitmentBonus,
    finalNet: finalNet,
    totalDiscountAmount: totalDiscountAmount,
    discountDetails: discountDetails,
    hasExcellenceBonus: hasExcellenceBonus,
    hasCommitmentBonus: hasCommitmentBonus,
    attendance26Days: attendance26Days,
    isMostCommitted: branchReports.some(function (r) { return r.isMostCommitted; }),
    isMostEval: branchReports.some(function (r) { return r.isMostEval; }),
    isMostBook: branchReports.some(function (r) { return r.isMostBook; }),
    maxEvalCount: maxEvalCount,
    maxBookCount: maxBookCount,
    branchReports: branchReports,
    breakdownText: breakdownText
  };
}
/** مصدر واحد للصافي المعروض: جدول الرئيسي، التقرير، كروت التقارير، وجدول الإحصائيات يعرضون نفس الرقم بدون إعادة حساب. */
function getDisplayNetForEmployee(empIdOrName, opts) {
  opts = opts || {};
  if (opts.aggregated) {
    var report = typeof calculateAggregatedEmployeeReport === 'function' ? calculateAggregatedEmployeeReport(empIdOrName) : null;
    return report && report.finalNet != null ? report.finalNet : 0;
  }
  var report = typeof calculateEmployeeReport === 'function' ? calculateEmployeeReport(empIdOrName) : null;
  return report && report.finalNet != null ? report.finalNet : 0;
}

/** عرض تقرير مجمع واحد للموظف المتكرر (جميع الفروع) مع تفاصيل كل فرع في المودال. options.pointsMode = true من صفحة الإحصائيات (رصيد النقاط، نفس التقرير بالمسميات نقطة والـ 15% كـ +). */
function showEmployeeReportAggregated(empName, options) {
  options = options || {};
  var pointsMode = !!options.pointsMode;
  var report = typeof calculateAggregatedEmployeeReport === 'function' ? calculateAggregatedEmployeeReport(empName) : null;
  if (!report) return;
  var modal = document.getElementById('employeeReportModal');
  var content = document.getElementById('employeeReportContent');
  var title = document.getElementById('reportEmployeeName');
  if (!modal || !content || !title) return;
  var emp = report.emp;
  var fund = report.fund != null ? report.fund : (report.gross != null ? report.gross * getSupportFundRate() : 0);
  var unit = pointsMode ? 'نقطة' : 'ريال';
  var mainTotal = pointsMode ? (report.finalNet + fund) : report.finalNet;
  var periodText = document.getElementById('headerPeriodRange') ? document.getElementById('headerPeriodRange').innerText : '-';
  var reportDate = getReportDateGregorian();
  var branchReports = report.branchReports || [];
  var esc = function (s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  title.innerText = pointsMode ? ('تقرير النقاط — ' + esc(emp.name)) : ('تقرير ' + esc(emp.name) + ' - ' + (branchReports.length > 1 ? 'جميع الفروع' : esc(emp.branch)));
  content.innerHTML = typeof buildEmployeeReportModalHTML === 'function' ? normalizeBonusNamingText(buildEmployeeReportModalHTML(report, { periodText: periodText, reportDate: reportDate, pointsMode: pointsMode })) : '<p class="text-red-400">خطأ في بناء التقرير</p>';
  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('z-index', '1000', 'important');
  modal.classList.remove('hidden');
  modal.dataset.empId = (branchReports.length && branchReports[0].emp) ? branchReports[0].emp.id : '';
  modal.dataset.aggregatedName = empName;
  modal.dataset.pointsMode = pointsMode ? '1' : '';
}
/** يبني HTML كامل لمحتوى مودال تقرير الموظف (مفرد أو مجمع) — نفس الشكل للطباعة والعرض */
function normalizeBonusNamingText(html) {
  return String(html || '')
    .replaceAll('حافز الأفضل تقييماً + الأكثر حجوزات', 'خبير إرضاء العميل في الفرع')
    .replaceAll('حافز التفوق', 'خبير إرضاء العميل في الفرع')
    .replaceAll('حافز الجمع بين الحضور والأكثر تميز (الأكثر حجوزات أو الأفضل تقييم)', 'حافز الالتزام والانجاز')
    .replaceAll('حافز الجمع بين الحضور والأكثر تميز', 'حافز الالتزام والانجاز');
}
function getReportDateGregorian() {
  return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function buildEmployeeReportModalHTML(report, opts) {
  if (report.branchReports && report.branchReports.length > 1) {
    return buildEmployeeReportModalHTMLMultiBranch(report, opts);
  }
  opts = opts || {};
  var _rp = getPricingConfig();
  var periodText = opts.periodText || '-';
  var reportDate = opts.reportDate || getReportDateGregorian();
  var pointsMode = !!opts.pointsMode;
  var emp = report.emp;
  var rate = report.rate;
  var evBooking = report.evBooking || 0;
  var evGoogle = report.evGoogle || 0;
  var gross = report.gross || 0;
  var fund = report.fund != null ? report.fund : gross * getSupportFundRate();
  var finalNet = report.finalNet != null ? report.finalNet : 0;
  var mainTotal = pointsMode ? (finalNet + fund) : finalNet;
  var totalDiscountAmount = report.totalDiscountAmount || 0;
  var discountDetails = report.discountDetails || [];
  var unit = pointsMode ? 'نقطة' : 'ريال';
  var fundSign = pointsMode ? '+' : '-';
  var fundLabel = pointsMode ? 'مساهمة شركاء النجاح في نقاطك (' + (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%)' : 'مساهمة شركاء النجاح (' + (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%)';
  var summaryTitle = (pointsMode ? 'رصيد النقاط من الفترة' : 'المبلغ الصافي المستحق');
  var attendanceBonus = report.attendanceBonus || 0;
  var actualAttendanceDays = report.actualAttendanceDays != null ? report.actualAttendanceDays : 0;
  var excellenceBonus = report.excellenceBonus || 0;
  var commitmentBonus = report.commitmentBonus || 0;
  var hasExcellenceBonus = report.hasExcellenceBonus;
  var hasCommitmentBonus = report.hasCommitmentBonus;
  var attendance26Days = report.attendance26Days;
  var maxEvalCount = report.maxEvalCount || 0;
  var maxBookCount = report.maxBookCount || 0;
  var isMostEval = report.isMostEval;
  var isMostBook = report.isMostBook;
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var commitmentExplain = hasCommitmentBonus ? ('الأكثر التزاماً (26+ يوم)' + (isMostEval && isMostBook ? ' + الأعلى تقييماً بـ ' + maxEvalCount + ' تقييم والأكثر حجوزات ' + maxBookCount + ' حجز' : isMostEval ? ' + الأعلى تقييماً بـ ' + maxEvalCount + ' تقييم' : isMostBook ? ' + الأكثر حجوزات ' + maxBookCount + ' حجز' : '') + ' في فرع ' + esc(emp.branch)) : '';
  var breakdownBlock = '';
  if (report.breakdown || report.breakdownText) {
    var _bd = report.breakdownText || report.breakdown;
    var _attDays = report.actualAttendanceDays != null ? report.actualAttendanceDays : actualAttendanceDays;
    breakdownBlock = '<div class="space-y-3">' +
      '<h5 class="text-base font-bold text-turquoise flex items-center gap-2"><span>📋</span><span>تفاصيل الحجوزات والشفتات والتنبيهات</span></h5>' +
      // — الحجوزات
      '<div class="bg-cyan-500/10 p-3 rounded-xl border border-cyan-500/30">' +
        '<p class="text-sm font-bold text-cyan-300 mb-2">📦 الحجوزات</p>' +
        '<div class="grid grid-cols-3 gap-2">' +
          '<div class="bg-cyan-500/5 p-2 rounded-lg border border-cyan-500/20 text-center"><p class="text-xs text-gray-400">العقود</p><p class="text-lg font-black text-white">' + (_bd.staffCount || 0) + '</p></div>' +
          '<div class="bg-cyan-500/5 p-2 rounded-lg border border-cyan-500/20 text-center"><p class="text-xs text-gray-400">استقبال</p><p class="text-lg font-black text-white">' + (_bd.reception || 0) + '</p></div>' +
          '<div class="bg-cyan-500/5 p-2 rounded-lg border border-cyan-500/20 text-center"><p class="text-xs text-gray-400">بوكينج</p><p class="text-lg font-black text-white">' + (_bd.booking || 0) + '</p></div>' +
        '</div>' +
      '</div>' +
      // — الشفتات
      '<div class="bg-amber-500/10 p-3 rounded-xl border border-amber-500/30">' +
        '<p class="text-sm font-bold text-amber-300 mb-2">🕐 الشفتات</p>' +
        '<div class="grid grid-cols-3 gap-2">' +
          '<div class="bg-amber-500/5 p-2 rounded-lg border border-amber-500/20 text-center"><p class="text-xs text-gray-400">صباح</p><p class="text-lg font-black text-white">' + (_bd.morning || 0) + '</p></div>' +
          '<div class="bg-amber-500/5 p-2 rounded-lg border border-amber-500/20 text-center"><p class="text-xs text-gray-400">مساء</p><p class="text-lg font-black text-white">' + (_bd.evening || 0) + '</p></div>' +
          '<div class="bg-amber-500/5 p-2 rounded-lg border border-amber-500/20 text-center"><p class="text-xs text-gray-400">ليل</p><p class="text-lg font-black text-white">' + (_bd.night || 0) + '</p></div>' +
        '</div>' +
        (_bd.vipTotal ? '<div class="mt-2 bg-purple-500/10 p-2 rounded-lg border border-purple-500/30 flex justify-between items-center"><span class="text-sm text-purple-300 font-bold">👑 إجمالي VIP</span><span class="text-lg font-black text-white">' + _bd.vipTotal + '</span></div>' : '') +
      '</div>' +
      // — التنبيهات
      '<div class="bg-red-500/10 p-3 rounded-xl border border-red-500/30">' +
        '<div class="flex justify-between items-center">' +
          '<span class="text-sm font-bold text-red-300">⚠️ التنبيهات</span>' +
          '<span class="text-lg font-black text-white">' + (_bd.alertCount || 0) + '</span>' +
        '</div>' +
      '</div>' +
      // — أيام الحضور
      '<div class="bg-green-500/10 p-3 rounded-xl border border-green-500/30">' +
        '<div class="flex justify-between items-center">' +
          '<span class="text-sm font-bold text-green-300">📅 أيام الحضور</span>' +
          '<span class="text-lg font-black text-white">' + _attDays + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }
  var discountBlock = totalDiscountAmount > 0 && discountDetails.length > 0 ? ('<div class="bg-red-500/10 p-4 rounded-xl border border-red-500/30"><h5 class="text-base font-bold text-red-400 mb-3 flex items-center gap-2"><span>💰</span><span>الخصومات المطبقة</span></h5><div class="space-y-2 text-sm">' + discountDetails.map(function (discount) {
    var eventDate = discount.eventDate ? new Date(discount.eventDate + 'T00:00:00').toLocaleDateString('ar-SA') : '';
    var amt = discount.isHotelRating && discount.amount != null ? Number(discount.amount) : (typeof calculateAggregatedNetForEmployee === 'function' ? calculateAggregatedNetForEmployee(emp.name) * (discount.discountPercentage / 100) : 0);
    var label = discount.isHotelRating ? discount.discountType : discount.discountType + ' (' + discount.discountPercentage + '%)';
    return '<div class="bg-red-500/5 p-3 rounded-lg border border-red-500/20"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">' + esc(label) + ':</span><span class="font-bold text-red-400">-' + amt.toFixed(2) + ' ' + unit + '</span></div><p class="text-xs text-gray-400 mt-1">' + (discount.isHotelRating ? discount.discountType : 'تم خصم ' + discount.discountPercentage + '% بسبب ' + discount.discountType) + (eventDate ? ' - تاريخ الحدث: ' + eventDate : '') + '</p>' + (discount.isHotelRating ? '' : '<p class="text-xs text-gray-500 mt-0.5">مطبق من: ' + (discount.appliedBy || 'الأدمن') + '</p>') + '</div>';
  }).join('') + '</div></div>') : '';
  // كل الأرقام من الـ payload = جدول "ملخص المكافآت لكل موظف" (مصدر موثّق واحد)
  return normalizeBonusNamingText('<div class="space-y-3 employee-report-content"><div class="bg-gradient-to-r from-turquoise/20 to-transparent p-3 rounded-lg border border-turquoise/30"><h3 class="text-lg font-black text-turquoise mb-1">' + esc(emp.name) + '</h3><p class="text-xs text-gray-300">الفرع: <span class="text-turquoise font-bold">' + esc(emp.branch) + '</span></p><p class="text-xs text-gray-300">الفترة: <span class="text-turquoise font-bold">' + esc(periodText) + '</span></p><p class="text-xs text-gray-300">تاريخ التقرير: <span class="text-turquoise font-bold">' + reportDate + '</span></p></div><div class="bg-gradient-to-r from-turquoise/20 to-transparent p-4 rounded-lg border border-turquoise/30 text-center"><h4 class="text-base font-bold text-turquoise mb-1">' + summaryTitle + '</h4><p class="text-2xl font-black text-white">' + mainTotal.toFixed(2) + ' <span class="text-base text-turquoise">' + unit + '</span></p>' + (totalDiscountAmount > 0 ? '<p class="text-sm text-red-400 mt-2">بعد خصم ' + totalDiscountAmount.toFixed(2) + ' ' + unit + '</p>' : '') + (pointsMode ? '<p class="text-xs text-gray-400 mt-2">(صافي النقاط + مساهمة شركاء النجاح في نقاطك)</p>' : '') + '</div>' + breakdownBlock + discountBlock + '<div class="space-y-3">' + (function(){
var bd=report.breakdown||{};
var totalM=bd.morning||0,totalE=bd.evening||0,totalN=bd.night||0,bdV=bd.vipTotal||0;
var useNew = (emp._receptionMorning != null || emp._bookingRegular != null);
var regM, regE, regN, shiftAmt, bookingAmt, recM, recE, recN, bkReg;
if(useNew){
  recM=emp._receptionMorning||0; recE=emp._receptionEvening||0; recN=emp._receptionNight||0;
  bkReg=emp._bookingRegular||0;
  shiftAmt=recM*_rp.rateMorning+recE*_rp.rateEvening+recN*_rp.rateNight;
  bookingAmt=bkReg*(_rp.rateBooking||0);
}else{
  regM=Math.max(0,totalM-(emp._vipMorning||0)); regE=Math.max(0,totalE-(emp._vipEvening||0)); regN=Math.max(0,totalN-(emp._vipNight||0));
  shiftAmt=regM*_rp.rateMorning+regE*_rp.rateEvening+regN*_rp.rateNight;
  bookingAmt=0;
}
var dispM=emp._morning!= null?emp._morning:(emp['صباح']!= null?emp['صباح']:(useNew?recM:regM));
var dispE=emp._evening!= null?emp._evening:(emp['مساء']!= null?emp['مساء']:(useNew?recE:regE));
var dispN=emp._night!= null?emp._night:(emp['ليل']!= null?emp['ليل']:(useNew?recN:regN));
var vipBySource=emp._vipBySource||{};
var vipDef=_rp.rateVipDefault||{reception:0,booking:0};
var brVip=(_rp.rateVipByBranch&&emp.branch)?(_rp.rateVipByBranch[emp.branch]||{}):{};
var vipAmt=0;var vipRoomLines=[];
function w(n){return n===1?'حجز':'حجوزات';}
if(bdV>0){
  Object.keys(vipBySource).forEach(function(rn){
    var src=vipBySource[rn];var rates=brVip[String(rn)]||vipDef;
    var rRec=src.reception||0,rBk=src.booking||0,cnt=rRec+rBk;
    if(cnt<=0)return;
    var roomAmt=rRec*(rates.reception||0)+rBk*(rates.booking||0);
    vipAmt+=roomAmt;
    var recRate=rates.reception||0,bkRate=rates.booking||0;
    var parts=[];
    if(rRec>0)parts.push(rRec+' استقبال × '+recRate+' '+unit);
    if(rBk>0)parts.push(rBk+' بوكينج × '+bkRate+' '+unit);
    var explain=parts.length>0?' <span class="text-[10px] text-gray-500">('+parts.join(' و ')+')</span>':'';
    vipRoomLines.push('<div class="flex justify-between items-center py-0.5"><span class="text-gray-400">غرفة '+rn+': '+cnt+' '+w(cnt)+explain+'</span><span class="font-bold text-violet-400">= '+roomAmt.toFixed(2)+' '+unit+'</span></div>');
  });
}
var gbOnly=shiftAmt+bookingAmt+vipAmt;
var recCount,bkCount,refCount=emp.count||0;
if(useNew){
  recCount=(recM||0)+(recE||0)+(recN||0); bkCount=bkReg||0;
}else{
  recCount=(regM||0)+(regE||0)+(regN||0); bkCount=0;
}
var nM=useNew?recM:regM,nE=useNew?recE:regE,nN=useNew?recN:regN;
var amtM=(useNew?recM*_rp.rateMorning:regM*_rp.rateMorning),amtE=(useNew?recE*_rp.rateEvening:regE*_rp.rateEvening),amtN=(useNew?recN*_rp.rateNight:regN*_rp.rateNight);
var sec1='<div class="text-emerald-400/95 font-semibold text-sm mb-1">🟢 أولاً: حجوزات الشفتات (الاستقبال العادي)</div><div class="text-xs text-gray-400 mb-2">الحجوزات بعد استبعاد الـ VIP والبوكينج</div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">الشفت الصباحي: '+nM+' '+w(nM)+' × '+_rp.rateMorning+' '+unit+'</span><span class="font-bold text-blue-300">= '+amtM.toFixed(2)+' '+unit+'</span></div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">الشفت المسائي: '+nE+' '+w(nE)+' × '+_rp.rateEvening+' '+unit+'</span><span class="font-bold text-blue-300">= '+amtE.toFixed(2)+' '+unit+'</span></div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">الشفت الليلي: '+nN+' '+w(nN)+' × '+_rp.rateNight+' '+unit+'</span><span class="font-bold text-blue-300">= '+amtN.toFixed(2)+' '+unit+'</span></div>';
var sec2=bkCount>0?'<div class="text-orange-400/95 font-semibold text-sm mb-1 mt-3">🟠 ثانياً: حجوزات العمولة الثابتة (بوكينج)</div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">بوكينج عادي: '+bkCount+' '+w(bkCount)+' × '+(_rp.rateBooking||0)+' '+unit+'</span><span class="font-bold text-orange-300">= '+bookingAmt.toFixed(2)+' '+unit+'</span></div>':'';
var sec3=vipRoomLines.length>0?'<div class="text-violet-400/95 font-semibold text-sm mb-1 mt-3">👑 ثالثاً: حجوزات الـ VIP (سعر الغرفة)</div>'+vipRoomLines.join(''):'';
var footer='<div class="flex justify-between items-center pt-3 mt-2 border-t border-white/10"><span class="font-bold text-green-400">💰 المجموع النهائي للمكافأة:</span><span class="font-bold text-blue-400">'+gbOnly.toFixed(2)+' '+unit+'</span></div><div class="text-xs text-gray-400 mt-1">(إجمالي الحجوزات: '+refCount+' حجز)</div>';
return '<div class="bg-blue-500/10 p-3 rounded-lg border border-blue-500/30"><h5 class="text-sm font-bold text-blue-400 mb-1 flex items-center gap-1"><span>📊</span><span>مكافآت الحجوزات</span></h5>'+sec1+sec2+sec3+footer+'</div></div>';
})() + '<div class="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/30"><h5 class="text-sm font-bold text-yellow-400 mb-1 flex items-center gap-1"><span>⭐</span><span>مكافآت التقييمات</span></h5><div class="space-y-1 text-xs text-gray-300"><div class="flex justify-between items-center"><span>تقييمات Booking: ' + evBooking + ' × ' + _rp.rateEvalBooking + ' ' + unit + '/تقييم</span><span class="font-bold text-yellow-400">' + (evBooking * _rp.rateEvalBooking).toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center"><span>تقييمات Google Maps: ' + evGoogle + ' × ' + _rp.rateEvalGoogle + ' ' + unit + '/تقييم</span><span class="font-bold text-yellow-400">' + (evGoogle * _rp.rateEvalGoogle).toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center pt-1 border-t border-yellow-500/30 mt-1"><span class="font-bold text-green-400">إجمالي مكافآت التقييمات:</span><span class="font-bold text-yellow-400 text-sm">' + ((evBooking * _rp.rateEvalBooking) + (evGoogle * _rp.rateEvalGoogle)).toFixed(2) + ' ' + unit + '</span></div></div></div><div class="bg-purple-500/10 p-3 rounded-lg border border-purple-500/30"><h5 class="text-sm font-bold text-purple-400 mb-1">الإجمالي قبل مساهمة شركاء النجاح</h5><div class="flex justify-between items-center text-xs"><span class="text-gray-300">إجمالي المكافآت (حجوزات + تقييمات):</span><span class="font-bold text-white text-sm">' + gross.toFixed(2) + ' ' + unit + '</span></div></div><div class="bg-orange-500/10 p-3 rounded-lg border border-orange-500/30"><h5 class="text-sm font-bold text-orange-400 mb-1">' + (pointsMode ? 'مساهمة شركاء النجاح في نقاطك' : 'مساهمة شركاء النجاح') + '</h5><div class="space-y-1 text-xs text-gray-300"><div class="flex justify-between items-center"><span>' + fundLabel + '</span><span class="font-bold text-orange-400">' + fundSign + fund.toFixed(2) + ' ' + unit + '</span></div><p class="text-[10px] text-orange-300/60 mt-1">⚠️ هذه النسبة تُخصم من المبلغ المالي فقط ولا تؤثر على تقييم الأداء أو رصيد النقاط التراكمي.</p></div><div class="bg-turquoise/10 p-3 rounded-lg border border-turquoise/30"><h5 class="text-sm font-bold text-turquoise mb-1">الحوافز الإضافية</h5><div class="space-y-2 text-xs">' + (attendance26Days ? '<div class="bg-green-500/10 p-3 rounded-lg border border-green-500/30"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">✓ حافز تحدي الظروف (25%):</span><span class="font-bold text-green-400">+' + attendanceBonus.toFixed(2) + ' ' + unit + '</span></div><p class="text-xs text-gray-400 mt-1">تم إتمام ' + actualAttendanceDays + ' يوماً وأكثر من العطاء</p></div>' : '') + (hasExcellenceBonus ? '<div class="bg-turquoise/20 p-3 rounded-lg border border-turquoise/50"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">✨ حافز الأفضل تقييماً + الأكثر حجوزات:</span><span class="font-bold text-turquoise">+' + excellenceBonus.toFixed(2) + ' ' + unit + '</span></div><p class="text-xs text-gray-400 mt-1">الأعلى تقييماً بـ ' + maxEvalCount + ' تقييم والأكثر حجوزات ' + maxBookCount + ' حجز في ' + esc(emp.branch) + '</p></div>' : '') + (hasCommitmentBonus ? '<div class="bg-purple-500/20 p-3 rounded-lg border border-purple-500/50"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">✓ حافز الجمع بين الحضور والأكثر تميز:</span><span class="font-bold text-purple-400">+' + commitmentBonus.toFixed(2) + ' ' + unit + '</span></div>' + (commitmentExplain ? '<p class="text-xs text-gray-400 mt-1">' + commitmentExplain + '</p>' : '') + '</div>' : '') + (!attendance26Days && !hasExcellenceBonus && !hasCommitmentBonus ? '<p class="text-gray-400 text-center py-2">لا توجد حوافز إضافية</p>' : '') + '</div></div>' + (function(){var nbf=gross-fund;var lines='<div class="bg-gradient-to-r from-slate-800/50 to-slate-900/50 p-3 rounded-lg border border-white/10"><h5 class="text-sm font-bold text-white mb-1">ملخص الحساب</h5><div class="space-y-1 text-xs"><div class="flex justify-between items-center text-gray-300"><span>إجمالي المكافآت:</span><span class="font-bold text-white">'+gross.toFixed(2)+' '+unit+'</span></div><div class="flex justify-between items-center text-gray-300"><span>'+fundLabel+'</span><span class="font-bold text-orange-400">'+fundSign+fund.toFixed(2)+' '+unit+'</span></div><div class="flex justify-between items-center text-gray-300"><span>الصافي قبل الحوافز:</span><span class="font-bold text-white">'+nbf.toFixed(2)+' '+unit+'</span></div>';if(attendanceBonus>0)lines+='<div class="flex justify-between items-center text-green-400"><span>+ حافز تحدي الظروف (25%):</span><span class="font-bold">+'+attendanceBonus.toFixed(2)+' '+unit+'</span></div>';if(excellenceBonus>0)lines+='<div class="flex justify-between items-center text-turquoise"><span>+ حافز التفوق:</span><span class="font-bold">+'+excellenceBonus.toFixed(2)+' '+unit+'</span></div>';if(commitmentBonus>0)lines+='<div class="flex justify-between items-center text-purple-400"><span>+ حافز الالتزام:</span><span class="font-bold">+'+commitmentBonus.toFixed(2)+' '+unit+'</span></div>';if(totalDiscountAmount>0)lines+='<div class="flex justify-between items-center text-red-400"><span>− الخصومات:</span><span class="font-bold">-'+totalDiscountAmount.toFixed(2)+' '+unit+'</span></div>';lines+='<div class="flex justify-between items-center pt-1 border-t border-white/10"><span class="font-bold text-turquoise text-sm">'+summaryTitle+':</span><span class="font-bold text-white text-base">'+mainTotal.toFixed(2)+' '+unit+'</span></div></div></div>';return lines;})() + '</div></div>');
}

/** تقرير موظف متكرر: كل فرع بياناته منفصلة (كورنيش ثم أندلس) في تقرير واحد */
function buildEmployeeReportModalHTMLMultiBranch(report, opts) {
  opts = opts || {};
  var _rp = getPricingConfig();
  var periodText = opts.periodText || '-';
  var reportDate = opts.reportDate || getReportDateGregorian();
  var pointsMode = !!opts.pointsMode;
  var emp = report.emp;
  var branchReports = report.branchReports || [];
  var unit = pointsMode ? 'نقطة' : 'ريال';
  var fundSign = pointsMode ? '+' : '-';
  var fundLabel = pointsMode ? 'مساهمة شركاء النجاح في نقاطك (' + (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%)' : 'مساهمة شركاء النجاح (' + (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%)';
  var gross = report.gross || 0;
  var fund = report.fund != null ? report.fund : (gross * getSupportFundRate());
  var mainTotal = pointsMode ? (report.finalNet + fund) : report.finalNet;
  var totalDiscountAmount = report.totalDiscountAmount || 0;
  var discountDetails = report.discountDetails || [];
  var summaryTitle = pointsMode ? 'رصيد النقاط من الفترة (الإجمالي)' : 'المبلغ الصافي المستحق (الإجمالي)';
  var attendanceBonus = report.attendanceBonus || 0;
  var actualAttendanceDays = report.actualAttendanceDays != null ? report.actualAttendanceDays : 0;
  var hasExcellenceBonus = report.hasExcellenceBonus;
  var hasCommitmentBonus = report.hasCommitmentBonus;
  var excellenceBonus = report.excellenceBonus || 0;
  var commitmentBonus = report.commitmentBonus || 0;
  var attendance26Days = report.attendance26Days;
  var maxEvalCount = report.maxEvalCount || 0;
  var maxBookCount = report.maxBookCount || 0;
  var isMostEval = report.isMostEval;
  var isMostBook = report.isMostBook;
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var commitmentExplainMulti = hasCommitmentBonus ? ('الأكثر التزاماً (26+ يوم)' + (isMostEval && isMostBook ? ' + الأعلى تقييماً بـ ' + maxEvalCount + ' تقييم والأكثر حجوزات ' + maxBookCount + ' حجز' : isMostEval ? ' + الأعلى تقييماً بـ ' + maxEvalCount + ' تقييم' : isMostBook ? ' + الأكثر حجوزات ' + maxBookCount + ' حجز' : '') + ' في أحد الفروع') : '';
  var disclaimer = '<p class="text-xs text-amber-400/90 mt-2">الإجمالي أعلاه محسوب على مستوى الاسم (حوافز وخصومات مرة واحدة).</p>';
  var header = '<div class="bg-gradient-to-r from-turquoise/20 to-transparent p-3 rounded-lg border border-turquoise/30"><h3 class="text-lg font-black text-turquoise mb-1">' + esc(emp.name) + '</h3><p class="text-xs text-gray-300">الفروع: <span class="text-turquoise font-bold">' + esc(emp.branch) + '</span></p><p class="text-xs text-gray-300">الفترة: <span class="text-turquoise font-bold">' + esc(periodText) + '</span></p><p class="text-xs text-gray-300">تاريخ التقرير: <span class="text-turquoise font-bold">' + reportDate + '</span></p></div>';
  var summary = '<div class="bg-gradient-to-r from-turquoise/20 to-transparent p-4 rounded-lg border border-turquoise/30 text-center"><h4 class="text-base font-bold text-turquoise mb-1">' + summaryTitle + '</h4><p class="text-2xl font-black text-white">' + mainTotal.toFixed(2) + ' <span class="text-base text-turquoise">' + unit + '</span></p>' + (totalDiscountAmount > 0 ? '<p class="text-xs text-red-400 mt-1">بعد خصم ' + totalDiscountAmount.toFixed(2) + ' ' + unit + '</p>' : '') + (pointsMode ? '<p class="text-[10px] text-gray-400 mt-1">(صافي النقاط + مساهمة شركاء النجاح في نقاطك)</p>' : '') + disclaimer + '</div>';
  var breakdownPerBranch = '';
  branchReports.forEach(function (r) {
    var be = r.emp;
    var b = r.breakdown || (be._staffCount != null ? { staffCount: be._staffCount, reception: be._reception || 0, booking: be._booking || 0, morning: be._morning || 0, evening: be._evening || 0, night: be._night || 0, vipTotal: be._vipTotal || 0, alertCount: be._alertCount || 0, alertTotal: be._alertTotal || 0 } : null);
    if (!b) return;
    var _attD = r.actualAttendanceDays != null ? r.actualAttendanceDays : 0;
    breakdownPerBranch += '<div class="p-3 rounded-lg border border-turquoise/20 bg-turquoise/5 mb-3">' +
      '<p class="font-bold text-turquoise mb-2 text-sm">' + esc(be.branch) + '</p>' +
      '<div class="space-y-2">' +
        // الحجوزات
        '<div class="grid grid-cols-3 gap-1.5">' +
          '<div class="bg-cyan-500/10 p-1.5 rounded-lg border border-cyan-500/20 text-center"><p class="text-[10px] text-gray-400">العقود</p><p class="text-sm font-black text-white">' + b.staffCount + '</p></div>' +
          '<div class="bg-cyan-500/10 p-1.5 rounded-lg border border-cyan-500/20 text-center"><p class="text-[10px] text-gray-400">استقبال</p><p class="text-sm font-black text-white">' + b.reception + '</p></div>' +
          '<div class="bg-cyan-500/10 p-1.5 rounded-lg border border-cyan-500/20 text-center"><p class="text-[10px] text-gray-400">بوكينج</p><p class="text-sm font-black text-white">' + b.booking + '</p></div>' +
        '</div>' +
        // الشفتات
        '<div class="grid grid-cols-3 gap-1.5">' +
          '<div class="bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20 text-center"><p class="text-[10px] text-gray-400">صباح</p><p class="text-sm font-black text-white">' + b.morning + '</p></div>' +
          '<div class="bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20 text-center"><p class="text-[10px] text-gray-400">مساء</p><p class="text-sm font-black text-white">' + b.evening + '</p></div>' +
          '<div class="bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20 text-center"><p class="text-[10px] text-gray-400">ليل</p><p class="text-sm font-black text-white">' + b.night + '</p></div>' +
        '</div>' +
        (b.vipTotal ? '<div class="bg-purple-500/10 p-1.5 rounded-lg border border-purple-500/30 flex justify-between items-center"><span class="text-xs text-purple-300 font-bold">👑 VIP</span><span class="text-sm font-black text-white">' + b.vipTotal + '</span></div>' : '') +
        // التنبيهات + الحضور
        '<div class="grid grid-cols-2 gap-1.5">' +
          '<div class="bg-red-500/10 p-1.5 rounded-lg border border-red-500/20 flex justify-between items-center"><span class="text-xs text-red-300">⚠️ تنبيهات</span><span class="text-sm font-black text-white">' + b.alertCount + '</span></div>' +
          '<div class="bg-green-500/10 p-1.5 rounded-lg border border-green-500/20 flex justify-between items-center"><span class="text-xs text-green-300">📅 حضور</span><span class="text-sm font-black text-white">' + _attD + '</span></div>' +
        '</div>' +
      '</div></div>';
  });
  var breakdownBlock = breakdownPerBranch ? '<div class="space-y-2"><h5 class="text-sm font-bold text-turquoise flex items-center gap-1"><span>📋</span><span>تفاصيل الحجوزات والشفتات والتنبيهات (كل فرع)</span></h5>' + breakdownPerBranch + '</div>' : '';
  var discountBlock = totalDiscountAmount > 0 && discountDetails.length > 0 ? ('<div class="bg-red-500/10 p-3 rounded-lg border border-red-500/30"><h5 class="text-sm font-bold text-red-400 mb-1 flex items-center gap-1"><span>💰</span><span>الخصومات المطبقة</span></h5><div class="space-y-1 text-xs">' + discountDetails.map(function (d) {
    var amt = d.isHotelRating && d.amount != null ? Number(d.amount) : (typeof calculateAggregatedNetForEmployee === 'function' ? calculateAggregatedNetForEmployee(emp.name) * (d.discountPercentage / 100) : 0);
    var label = d.isHotelRating ? d.discountType : d.discountType + ' (' + d.discountPercentage + '%)';
    return '<div class="bg-red-500/5 p-3 rounded-lg border border-red-500/20"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">' + esc(label) + ':</span><span class="font-bold text-red-400">-' + amt.toFixed(2) + ' ' + unit + '</span></div></div>';
  }).join('') + '</div></div>') : '';
  var bookingsSection = '<div class="bg-blue-500/10 p-3 rounded-lg border border-blue-500/30"><h5 class="text-sm font-bold text-blue-400 mb-1 flex items-center gap-1"><span>📊</span><span>مكافآت الحجوزات</span></h5><div class="space-y-2">';
  var _sumBranchBookOnly = 0;
  function wBranch(n) { return n === 1 ? 'حجز' : 'حجوزات'; }
  branchReports.forEach(function (r) {
    var be = r.emp;
    var bc = be.count || 0;
    var rbd = r.breakdown || {};
    var totalM = rbd.morning || 0, totalE = rbd.evening || 0, totalN = rbd.night || 0, rbV = rbd.vipTotal || 0;
    var useNew = (be._receptionMorning != null || be._bookingRegular != null);
    var shiftAmt, bookingAmt, recCount, bkCount;
    var dispM = be._morning != null ? be._morning : (be['صباح'] != null ? be['صباح'] : 0);
    var dispE = be._evening != null ? be._evening : (be['مساء'] != null ? be['مساء'] : 0);
    var dispN = be._night != null ? be._night : (be['ليل'] != null ? be['ليل'] : 0);
    if (useNew) {
      var recM = be._receptionMorning || 0, recE = be._receptionEvening || 0, recN = be._receptionNight || 0, bkReg = be._bookingRegular || 0;
      recCount = recM + recE + recN;
      bkCount = bkReg;
      shiftAmt = recM * _rp.rateMorning + recE * _rp.rateEvening + recN * _rp.rateNight;
      bookingAmt = bkReg * (_rp.rateBooking || 0);
      if (dispM === 0 && dispE === 0 && dispN === 0) { dispM = recM; dispE = recE; dispN = recN; }
    } else {
      var regM = Math.max(0, totalM - (be._vipMorning || 0)), regE = Math.max(0, totalE - (be._vipEvening || 0)), regN = Math.max(0, totalN - (be._vipNight || 0));
      recCount = regM + regE + regN;
      bkCount = 0;
      shiftAmt = regM * _rp.rateMorning + regE * _rp.rateEvening + regN * _rp.rateNight;
      bookingAmt = 0;
      if (dispM === 0 && dispE === 0 && dispN === 0) { dispM = regM; dispE = regE; dispN = regN; }
    }
    var nM = useNew ? (be._receptionMorning || 0) : (totalM - (be._vipMorning || 0)), nE = useNew ? (be._receptionEvening || 0) : (totalE - (be._vipEvening || 0)), nN = useNew ? (be._receptionNight || 0) : (totalN - (be._vipNight || 0));
    nM = Math.max(0, nM); nE = Math.max(0, nE); nN = Math.max(0, nN);
    var amtM = nM * _rp.rateMorning, amtE = nE * _rp.rateEvening, amtN = nN * _rp.rateNight;
    var vipBySource = be._vipBySource || {};
    var vipDef = _rp.rateVipDefault || { reception: 0, booking: 0 };
    var brVip = (_rp.rateVipByBranch && be.branch) ? (_rp.rateVipByBranch[be.branch] || {}) : {};
    var vipRoomLines = [];
    var vipAmtSum = 0;
    if (rbV > 0) {
      Object.keys(vipBySource).forEach(function(rn) {
        var src = vipBySource[rn];
        var rates = brVip[String(rn)] || vipDef;
        var rRec = src.reception || 0, rBk = src.booking || 0, cnt = rRec + rBk;
        if (cnt <= 0) return;
        var roomAmt = rRec * (rates.reception || 0) + rBk * (rates.booking || 0);
        vipAmtSum += roomAmt;
        var recRate = rates.reception || 0, bkRate = rates.booking || 0;
        var parts = [];
        if (rRec > 0) parts.push(rRec + ' استقبال × ' + recRate + ' ' + unit);
        if (rBk > 0) parts.push(rBk + ' بوكينج × ' + bkRate + ' ' + unit);
        var explain = parts.length > 0 ? ' <span class="text-[10px] text-gray-500">(' + parts.join(' و ') + ')</span>' : '';
        vipRoomLines.push('<div class="flex justify-between items-center py-0.5"><span class="text-gray-400">غرفة ' + rn + ': ' + cnt + ' ' + wBranch(cnt) + explain + '</span><span class="font-bold text-violet-400">= ' + roomAmt.toFixed(2) + ' ' + unit + '</span></div>');
      });
    }
    var sec1 = '<div class="text-emerald-400/95 font-semibold text-sm mb-1">🟢 أولاً: حجوزات الشفتات (الاستقبال العادي)</div><div class="text-xs text-gray-400 mb-2">الحجوزات بعد استبعاد الـ VIP والبوكينج</div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">الشفت الصباحي: ' + nM + ' ' + wBranch(nM) + ' × ' + _rp.rateMorning + ' ' + unit + '</span><span class="font-bold text-blue-300">= ' + amtM.toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">الشفت المسائي: ' + nE + ' ' + wBranch(nE) + ' × ' + _rp.rateEvening + ' ' + unit + '</span><span class="font-bold text-blue-300">= ' + amtE.toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">الشفت الليلي: ' + nN + ' ' + wBranch(nN) + ' × ' + _rp.rateNight + ' ' + unit + '</span><span class="font-bold text-blue-300">= ' + amtN.toFixed(2) + ' ' + unit + '</span></div>';
    var sec2 = bkCount > 0 ? '<div class="text-orange-400/95 font-semibold text-sm mb-1 mt-3">🟠 ثانياً: حجوزات العمولة الثابتة (بوكينج)</div><div class="flex justify-between items-center py-0.5"><span class="text-gray-400">بوكينج عادي: ' + bkCount + ' ' + wBranch(bkCount) + ' × ' + (_rp.rateBooking || 0) + ' ' + unit + '</span><span class="font-bold text-orange-300">= ' + bookingAmt.toFixed(2) + ' ' + unit + '</span></div>' : '';
    var sec3 = vipRoomLines.length > 0 ? '<div class="text-violet-400/95 font-semibold text-sm mb-1 mt-3">👑 ثالثاً: حجوزات الـ VIP (سعر الغرفة)</div>' + vipRoomLines.join('') : '';
    var footer = '<div class="flex justify-between items-center pt-2 border-t border-white/10"><span class="font-bold text-green-400">💰 المجموع النهائي للمكافأة:</span><span class="font-bold text-blue-400">' + (shiftAmt + bookingAmt + vipAmtSum).toFixed(2) + ' ' + unit + '</span></div><div class="text-xs text-gray-400 mt-1">(إجمالي الحجوزات: ' + bc + ' حجز)</div>';
    var rbBookOnly = computeGrossFromBreakdown(be, _rp) - ((r.evBooking || 0) * (_rp.rateEvalBooking || 0) + (r.evGoogle || 0) * (_rp.rateEvalGoogle || 0));
    _sumBranchBookOnly += rbBookOnly;
    bookingsSection += '<div class="p-3 rounded-lg border border-blue-500/20 bg-blue-500/5"><p class="font-bold text-blue-300 mb-2">' + esc(be.branch) + '</p><div class="space-y-2 text-sm text-gray-300">' + sec1 + sec2 + sec3 + footer + '</div></div>';
  });
  var aggBookOnly = _sumBranchBookOnly;
  bookingsSection += '<div class="p-3 rounded-lg border-2 border-blue-400/40 bg-blue-500/10 mt-2"><p class="font-bold text-blue-200 mb-2">الإجمالي (كل الفروع)</p><div class="space-y-2 text-sm text-gray-300"><div class="flex justify-between items-center"><span>💰 المجموع النهائي للمكافأة:</span><span class="font-bold text-blue-400">' + aggBookOnly.toFixed(2) + ' ' + unit + '</span></div><div class="text-xs text-gray-400 mt-1">(إجمالي الحجوزات: ' + (emp.count || 0) + ' حجز)</div></div></div></div></div>';
  var evalsSection = '<div class="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/30"><h5 class="text-sm font-bold text-yellow-400 mb-1 flex items-center gap-1"><span>⭐</span><span>مكافآت التقييمات</span></h5><div class="space-y-2">';
  branchReports.forEach(function (r) {
    var be = r.emp;
    var eb = r.evBooking || 0;
    var eg = r.evGoogle || 0;
    var tot = (eb * _rp.rateEvalBooking) + (eg * _rp.rateEvalGoogle);
    evalsSection += '<div class="p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5"><p class="font-bold text-yellow-300 mb-2">' + esc(be.branch) + '</p><div class="space-y-2 text-sm text-gray-300"><div class="flex justify-between items-center"><span>تقييمات Booking: ' + eb + ' × ' + _rp.rateEvalBooking + ' ' + unit + '/تقييم</span><span class="font-bold text-yellow-400">' + (eb * _rp.rateEvalBooking).toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center"><span>تقييمات Google Maps: ' + eg + ' × ' + _rp.rateEvalGoogle + ' ' + unit + '/تقييم</span><span class="font-bold text-yellow-400">' + (eg * _rp.rateEvalGoogle).toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center pt-2 border-t border-white/10"><span class="font-bold text-green-400">إجمالي التقييمات (الفرع):</span><span class="font-bold text-yellow-400">' + tot.toFixed(2) + ' ' + unit + '</span></div></div></div>';
  });
  evalsSection += '<div class="p-3 rounded-lg border-2 border-yellow-400/40 bg-yellow-500/10 mt-2"><p class="font-bold text-yellow-200 mb-2">الإجمالي (كل الفروع)</p><div class="space-y-2 text-sm text-gray-300"><div class="flex justify-between items-center"><span>تقييمات Booking: ' + (report.evBooking || 0) + ' × ' + _rp.rateEvalBooking + ' ' + unit + '/تقييم</span><span class="font-bold text-yellow-400">' + ((report.evBooking || 0) * _rp.rateEvalBooking).toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center"><span>تقييمات Google Maps: ' + (report.evGoogle || 0) + ' × ' + _rp.rateEvalGoogle + ' ' + unit + '/تقييم</span><span class="font-bold text-yellow-400">' + ((report.evGoogle || 0) * _rp.rateEvalGoogle).toFixed(2) + ' ' + unit + '</span></div><div class="flex justify-between items-center pt-2 border-t-2 border-yellow-500/30"><span class="font-bold text-green-400">إجمالي مكافآت التقييمات:</span><span class="font-bold text-yellow-400 text-lg">' + (((report.evBooking || 0) * _rp.rateEvalBooking) + ((report.evGoogle || 0) * _rp.rateEvalGoogle)).toFixed(2) + ' ' + unit + '</span></div></div></div></div></div>';
  var rest = '<div class="bg-purple-500/10 p-3 rounded-lg border border-purple-500/30"><h5 class="text-sm font-bold text-purple-400 mb-1">الإجمالي قبل مساهمة شركاء النجاح</h5><div class="flex justify-between items-center text-xs"><span class="text-gray-300">إجمالي المكافآت (حجوزات + تقييمات):</span><span class="font-bold text-white text-sm">' + gross.toFixed(2) + ' ' + unit + '</span></div></div><div class="bg-orange-500/10 p-3 rounded-lg border border-orange-500/30 space-y-2 shadow-sm"><h5 class="text-sm font-bold text-orange-400">' + (pointsMode ? 'مساهمة شركاء النجاح في نقاطك' : 'مساهمة شركاء النجاح') + '</h5><div class="flex justify-between items-baseline gap-4 text-xs"><span class="text-gray-300">' + (pointsMode ? 'النسبة (' + (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%)' : (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%') + '</span><span class="font-bold text-orange-400 shrink-0">' + fundSign + fund.toFixed(2) + ' ' + unit + '</span></div><p class="text-[10px] text-orange-300/60 leading-snug">⚠️ تُخصم من المبلغ المالي فقط ولا تؤثر على تقييم الأداء أو رصيد النقاط التراكمي.</p></div><div class="bg-turquoise/10 p-3 rounded-lg border border-turquoise/30 border-t-2 border-teal-400/60 mt-4"><h5 class="text-sm font-bold text-turquoise mb-1">الحوافز الإضافية</h5><div class="space-y-2 text-xs">' + (attendance26Days ? '<div class="bg-green-500/10 p-3 rounded-lg border border-green-500/30"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">✓ حافز تحدي الظروف (25%):</span><span class="font-bold text-green-400">+' + attendanceBonus.toFixed(2) + ' ' + unit + '</span></div><p class="text-xs text-gray-400 mt-1">تم إتمام ' + actualAttendanceDays + ' يوماً وأكثر من العطاء</p></div>' : '') + (hasExcellenceBonus ? '<div class="bg-turquoise/20 p-3 rounded-lg border border-turquoise/50"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">✨ حافز الأفضل تقييماً + الأكثر حجوزات</span><span class="font-bold text-turquoise">+' + excellenceBonus.toFixed(2) + ' ' + unit + '</span></div></div>' : '') + (hasCommitmentBonus ? '<div class="bg-purple-500/20 p-3 rounded-lg border border-purple-500/50"><div class="flex justify-between items-center mb-1"><span class="text-gray-300">✓ حافز الجمع بين الحضور والأكثر تميز</span><span class="font-bold text-purple-400">+' + commitmentBonus.toFixed(2) + ' ' + unit + '</span></div>' + (commitmentExplainMulti ? '<p class="text-xs text-gray-400 mt-1">' + commitmentExplainMulti + '</p>' : '') + '</div>' : '') + (!attendance26Days && !hasExcellenceBonus && !hasCommitmentBonus ? '<p class="text-gray-400 text-center py-2">لا توجد حوافز إضافية</p>' : '') + '</div></div>' + (function(){var nbf=gross-fund;var totalDisc=report.totalDiscountAmount||0;var lines='<div class="bg-gradient-to-r from-slate-800/50 to-slate-900/50 p-3 rounded-lg border border-white/10"><h5 class="text-sm font-bold text-white mb-1">ملخص الحساب</h5><div class="space-y-1 text-xs"><div class="flex justify-between items-center text-gray-300"><span>إجمالي المكافآت:</span><span class="font-bold text-white">'+gross.toFixed(2)+' '+unit+'</span></div><div class="flex justify-between items-center text-gray-300"><span>'+fundLabel+'</span><span class="font-bold text-orange-400">'+fundSign+fund.toFixed(2)+' '+unit+'</span></div><div class="flex justify-between items-center text-gray-300"><span>الصافي قبل الحوافز:</span><span class="font-bold text-white">'+nbf.toFixed(2)+' '+unit+'</span></div>';if(attendanceBonus>0)lines+='<div class="flex justify-between items-center text-green-400"><span>+ حافز تحدي الظروف (25%):</span><span class="font-bold">+'+attendanceBonus.toFixed(2)+' '+unit+'</span></div>';if(excellenceBonus>0)lines+='<div class="flex justify-between items-center text-turquoise"><span>+ حافز التفوق:</span><span class="font-bold">+'+excellenceBonus.toFixed(2)+' '+unit+'</span></div>';if(commitmentBonus>0)lines+='<div class="flex justify-between items-center text-purple-400"><span>+ حافز الالتزام:</span><span class="font-bold">+'+commitmentBonus.toFixed(2)+' '+unit+'</span></div>';if(totalDisc>0)lines+='<div class="flex justify-between items-center text-red-400"><span>− الخصومات:</span><span class="font-bold">-'+totalDisc.toFixed(2)+' '+unit+'</span></div>';lines+='<div class="flex justify-between items-center pt-1 border-t border-white/10"><span class="font-bold text-turquoise text-sm">'+summaryTitle+':</span><span class="font-bold text-white text-base">'+mainTotal.toFixed(2)+' '+unit+'</span></div></div></div>';return lines;})();
  return normalizeBonusNamingText('<div class="space-y-3 employee-report-content">' + header + summary + breakdownBlock + discountBlock + '<div class="space-y-2">' + bookingsSection + evalsSection + rest + '</div></div>');
}
function showEmployeeReport(empId, options) {
  options = options || {};
  const pointsMode = !!options.pointsMode;
  const modal = document.getElementById('employeeReportModal');
  const content = document.getElementById('employeeReportContent');
  const title = document.getElementById('reportEmployeeName');
  if (!modal) {
    console.error('Modal not found!');
    alert('خطأ: لم يتم العثور على نافذة التقرير');
    return;
  }
  if (!content) {
    console.error('Content not found!');
    alert('خطأ: لم يتم العثور على محتوى التقرير');
    return;
  }
  if (!title) {
    console.error('Title not found!');
    alert('خطأ: لم يتم العثور على عنوان التقرير');
    return;
  }
  const report = calculateEmployeeReport(empId);
  if (!report) {
    content.innerHTML = '<p class="text-red-400">❌ لم يتم العثور على الموظف</p>';
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('z-index', '1000', 'important');
    modal.classList.remove('hidden');
    return;
  }
  const emp = report.emp;
  title.innerText = pointsMode ? `تقرير النقاط — ${emp.name}` : `تقرير ${emp.name} - ${emp.branch}`;
  const periodText = document.getElementById('headerPeriodRange')?.innerText || '-';
  const reportDate = getReportDateGregorian();
  content.innerHTML = typeof buildEmployeeReportModalHTML === 'function' ? normalizeBonusNamingText(buildEmployeeReportModalHTML(report, { periodText, reportDate, pointsMode })) : '<p class="text-red-400">خطأ في بناء التقرير</p>';
  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('z-index', '1000', 'important');
  modal.style.setProperty('visibility', 'visible', 'important');
  modal.style.setProperty('opacity', '1', 'important');
  modal.classList.remove('hidden');
  modal.dataset.empId = empId;
  modal.dataset.aggregatedName = '';
  modal.dataset.pointsMode = pointsMode ? '1' : '';
}
function closeEmployeeReportModal(event) {
// If event is provided, only close if clicking on the background (not inside modal content)
if (event) {
// Prevent closing if clicking inside the modal content
if (event.target !== event.currentTarget) {
return;
}
// Stop event propagation to prevent multiple triggers
event.stopPropagation();
}
const modal = document.getElementById('employeeReportModal');
if (modal) {
// Remove inline styles to reset modal state
modal.style.removeProperty('display');
modal.style.removeProperty('z-index');
modal.style.removeProperty('visibility');
modal.style.removeProperty('opacity');
// Hide modal
modal.classList.add('hidden');
modal.classList.remove('flex');
}
}

/** إغلاق نافذة تقرير الموظف وفتح صفحة التقارير على تبويب الإحصائيات (قياس مستوى التقدم) */
function openProgressReportPage() {
closeEmployeeReportModal();
const reportsPage = document.getElementById('reportsPage');
const dashboard = document.getElementById('dashboard');
const actionBtns = document.getElementById('actionBtns');
if (!reportsPage || !dashboard) return;
dashboard.classList.add('hidden');
reportsPage.classList.remove('hidden');
if (actionBtns) {
  actionBtns.style.display = 'none';
  actionBtns.style.setProperty('display', 'none', 'important');
}
if (typeof populateReportsPage === 'function') populateReportsPage();
setTimeout(function () {
  if (typeof switchReportsTab === 'function') switchReportsTab('statistics');
}, 100);
setTimeout(function () {
  if (typeof loadStatisticsPage === 'function') loadStatisticsPage();
}, 350);
}

function getEmployeeReportPrintStyles(forAllReports) {
  return `@page {
  size: A4 portrait;
  margin: 8mm;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { height: auto; min-height: 100%; overflow: visible; width: 100%; }
body {
  font-family: 'IBM Plex Sans Arabic', Arial, sans-serif;
  direction: rtl;
  background: #fff;
  color: #0c0c0c;
  padding: 0;
  font-size: 10px;
  line-height: 1.32;
  max-width: 190mm;
  margin: 0 auto;
}
@page { size: A4 portrait; margin: 10mm; }
.print-page {
  width: 100%;
  max-width: 190mm;
  page-break-inside: avoid;
  page-break-after: always;
  padding: 4mm 5mm;
  padding-bottom: 12mm;
}
.print-page:last-child { page-break-after: avoid; padding-bottom: 18mm; }
.detail-section.final-summary-section { padding-bottom: 8mm; margin-bottom: 0; }
.header {
  border-bottom: 2px solid #0d9488;
  padding-bottom: 5px;
  margin-bottom: 5px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
}
.header h1 { font-size: 13px; font-weight: 900; color: #0c0c0c; }
.header p { font-size: 9px; color: #1c1c1c; margin: 1px 0; line-height: 1.25; }
.header-right { text-align: left; }
.detail-section {
  margin-bottom: 6px;
  padding: 6px 8px 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  background: #f8fafc;
  page-break-inside: avoid;
  border-right-width: 3px;
  border-right-color: #94a3b8;
}
.detail-section.section-breakdown { border-right-color: #64748b; background: #f1f5f9; }
.detail-section.section-bookings { border-right-color: #0ea5e9; background: #f0f9ff; }
.detail-section.section-evals { border-right-color: #eab308; background: #fefce8; }
.detail-section.section-fund { border-right-color: #f97316; background: #fff7ed; }
.detail-section.section-bonuses { border-right-color: #14b8a6; background: #f0fdfa; }
.detail-section.section-discounts { border-right-color: #dc2626; background: #fef2f2; }
.detail-section.section-final { border-right-color: #0d9488; background: #ccfbf1; }
.detail-section h3 {
  font-size: 10px;
  font-weight: 800;
  color: #0c0c0c;
  margin-bottom: 3px;
  border-bottom: 1px solid #cbd5e1;
  padding-bottom: 2px;
}
.detail-section.section-breakdown h3 { border-bottom-color: #64748b; color: #334155; }
.detail-section.section-bookings h3 { border-bottom-color: #0ea5e9; color: #0369a1; }
.detail-section.section-evals h3 { border-bottom-color: #eab308; color: #a16207; }
.detail-section.section-fund h3 { border-bottom-color: #f97316; color: #c2410c; }
.detail-section.section-bonuses h3 { border-bottom-color: #14b8a6; color: #0f766e; }
.detail-section.section-discounts h3 { border-bottom-color: #dc2626; color: #b91c1c; }
.detail-section.section-final h3 { border-bottom-color: #0d9488; color: #0f766e; }
.summary-box {
  background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
  color: #fff;
  padding: 8px 10px;
  border-radius: 6px;
  text-align: center;
  margin: 6px 0;
  page-break-inside: avoid;
}
.summary-box h2 { font-size: 10px; font-weight: 800; margin-bottom: 2px; }
.summary-box .amount { font-size: 16px; font-weight: 900; margin-top: 2px; }
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 2px 0;
  border-bottom: 0.5px solid #cbd5e1;
  font-size: 9px;
  line-height: 1.25;
  color: #0c0c0c;
}
.row:last-child { border-bottom: none; }
.row > div { flex: 1; min-width: 0; }
.row > div > span:first-child { display: block; font-weight: 700; color: #0c0c0c; }
.row > div > span:last-child { display: block; font-size: 8px; color: #334155; line-height: 1.2; }
.row strong { color: #0c0c0c; font-weight: 800; }
.total-row {
  font-weight: 900;
  font-size: 10px;
  border-top: 1.5px solid #0d9488;
  padding-top: 3px;
  margin-top: 3px;
  color: #0c0c0c;
}
.approval-stamp {
  margin: 4mm auto 0;
  text-align: center;
  width: 64px;
  min-height: 64px;
  border: 2px solid #991b1b;
  border-radius: 50%;
  padding: 8px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  page-break-inside: avoid;
  background: #fef2f2;
}
.approval-stamp .checkmark { color: #047857; font-size: 18px; font-weight: 900; line-height: 1; }
.approval-stamp .department { color: #991b1b; font-size: 8px; font-weight: 700; line-height: 1.1; }
.approval-stamp .approved { color: #991b1b; font-size: 9px; font-weight: 800; line-height: 1.1; }
.fund-note { font-size: 8px; color: #334155; margin-top: 2px; line-height: 1.25; }
`;
}

/** Auto-scale each .print-page to fit within a single A4 page (printable area ~285mm). Call before window.print(). */
function scaleToFitA4(doc) {
  if (!doc) return;
  var pages = doc.querySelectorAll('.print-page');
  if (!pages.length) return;
  // A4 printable height with 6mm top+bottom margins = 297-12 = 285mm ≈ 1077px at 96dpi
  var maxH = 1077;
  pages.forEach(function(page) {
    // Reset any previous scale
    page.style.transform = '';
    page.style.transformOrigin = 'top right';
    var h = page.scrollHeight;
    if (h > maxH) {
      var scale = maxH / h;
      // Don't scale below 0.6 — readability limit
      if (scale < 0.6) scale = 0.6;
      page.style.transform = 'scale(' + scale + ')';
      page.style.height = maxH + 'px';
      page.style.overflow = 'hidden';
    }
  });
}

function buildEmployeeReportBodyContent(report, periodText, reportDate, options) {
  options = options || {};
  const pointsMode = !!options.pointsMode;
  const { emp, rate, evBooking, evGoogle, gross, fund, net, netBeforeAttendanceBonus, attendanceBonus, actualAttendanceDays, excellenceBonus, commitmentBonus, finalNet, totalDiscountAmount, discountDetails, hasExcellenceBonus, hasCommitmentBonus, attendance26Days, isMostCommitted, isMostEval, isMostBook, maxEvalCount, maxBookCount, breakdown, breakdownText } = report;
  const _p = getPricingConfig();
  const unit = pointsMode ? 'نقطة' : 'ريال';
  const mainTotal = pointsMode ? (finalNet + fund) : finalNet;
  const fundSign = pointsMode ? '+' : '-';
  const summaryTitle = pointsMode ? 'رصيد النقاط من الفترة' : 'المبلغ الصافي المستحق';
  var hasBreakdown = breakdown || breakdownText;
  function rowBreakdown(label, val) {
    if (val == null || (typeof val === 'string' && val.trim() === '')) return '';
    return '<div class="row"><span>' + label + ':</span><span><strong>' + (typeof val === 'number' ? val : val) + '</strong></span></div>';
  }
  var breakdownSection = '';
  if (hasBreakdown) {
    var bt = breakdownText;
    var b = breakdown;
    breakdownSection = '<div class="detail-section section-breakdown"><h3>📋 تفاصيل الحجوزات والشفتات والتنبيهات</h3>' +
      (bt ? (
        rowBreakdown('العقود', bt.staffCount) +
        rowBreakdown('استقبال', bt.reception) +
        rowBreakdown('بوكينج', bt.booking) +
        rowBreakdown('صباح', bt.morning) +
        rowBreakdown('مساء', bt.evening) +
        rowBreakdown('ليل', bt.night) +
        (bt.vipTotal ? rowBreakdown('إجمالي VIP', bt.vipTotal) : '') +
        rowBreakdown('عدد التنبيهات', bt.alertCount)
      ) : b ? (
        rowBreakdown('العقود', b.staffCount) +
        rowBreakdown('استقبال', b.reception) +
        rowBreakdown('بوكينج', b.booking) +
        rowBreakdown('صباح', b.morning) +
        rowBreakdown('مساء', b.evening) +
        rowBreakdown('ليل', b.night) +
        (b.vipTotal ? rowBreakdown('إجمالي VIP', b.vipTotal) : '') +
        rowBreakdown('عدد التنبيهات', b.alertCount)
      ) : '') +
      rowBreakdown('أيام الحضور', report.actualAttendanceDays != null ? report.actualAttendanceDays : actualAttendanceDays) +
      '</div>';
  }
  return `
<div class="print-page">
<div class="header">
<div>
<h1>فندق إليت - ${pointsMode ? 'تقرير النقاط' : 'تقرير المكافآت'}</h1>
<p><strong>الموظف:</strong> ${emp.name} | <strong>الفرع:</strong> ${emp.branch}</p>
</div>
<div class="header-right">
<p><strong>الفترة:</strong> ${periodText}</p>
<p><strong>التاريخ:</strong> ${reportDate}</p>
</div>
</div>
<div class="summary-box">
<h2>${summaryTitle}</h2>
<div class="amount">${mainTotal.toFixed(2)} ${unit}</div>
${totalDiscountAmount > 0 ? `<p style="font-size: 7px; margin-top: 1px; opacity: 0.9;">بعد خصم ${totalDiscountAmount.toFixed(2)} ${unit}</p>` : ''}
${pointsMode ? '<p style="font-size: 7px; margin-top: 1px; opacity: 0.9;">(صافي النقاط + مساهمة شركاء النجاح في نقاطك)</p>' : ''}
</div>
${breakdownSection}
${(function(){
var _bd = breakdown || {};
var _totalM = _bd.morning || 0, _totalE = _bd.evening || 0, _totalN = _bd.night || 0, _bdV = _bd.vipTotal || 0;
var _useNew = (emp._receptionMorning != null || emp._bookingRegular != null);
var _shiftAmt, _bookingAmt, _recM, _recE, _recN, _bkReg, _regM, _regE, _regN;
if (_useNew) {
  _recM = emp._receptionMorning || 0; _recE = emp._receptionEvening || 0; _recN = emp._receptionNight || 0; _bkReg = emp._bookingRegular || 0;
  _shiftAmt = _recM * _p.rateMorning + _recE * _p.rateEvening + _recN * _p.rateNight;
  _bookingAmt = _bkReg * (_p.rateBooking || 0);
} else {
  _regM = Math.max(0, _totalM - (emp._vipMorning || 0)); _regE = Math.max(0, _totalE - (emp._vipEvening || 0)); _regN = Math.max(0, _totalN - (emp._vipNight || 0));
  _shiftAmt = _regM * _p.rateMorning + _regE * _p.rateEvening + _regN * _p.rateNight;
  _bookingAmt = 0;
}
var _nM = _useNew ? _recM : _regM, _nE = _useNew ? _recE : _regE, _nN = _useNew ? _recN : _regN;
var _amtM = _nM * _p.rateMorning, _amtE = _nE * _p.rateEvening, _amtN = _nN * _p.rateNight;
function _w(n){ return n === 1 ? 'حجز' : 'حجوزات'; }
var _sec1 = '<p style="font-weight:700;margin-bottom:2px;">🟢 أولاً: حجوزات الشفتات (الاستقبال العادي)</p><p style="font-size:9px;opacity:0.9;margin-bottom:4px;">الحجوزات بعد استبعاد الـ VIP والبوكينج</p><div class="row"><span>الشفت الصباحي: ' + _nM + ' ' + _w(_nM) + ' × ' + _p.rateMorning + ' ' + unit + '</span><span><strong>= ' + _amtM.toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>الشفت المسائي: ' + _nE + ' ' + _w(_nE) + ' × ' + _p.rateEvening + ' ' + unit + '</span><span><strong>= ' + _amtE.toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>الشفت الليلي: ' + _nN + ' ' + _w(_nN) + ' × ' + _p.rateNight + ' ' + unit + '</span><span><strong>= ' + _amtN.toFixed(2) + ' ' + unit + '</strong></span></div>';
var _bkCount = _useNew ? (_bkReg || 0) : 0;
var _sec2 = _bkCount > 0 ? '<p style="font-weight:700;margin:6px 0 2px;">🟠 ثانياً: حجوزات العمولة الثابتة (بوكينج)</p><div class="row"><span>بوكينج عادي: ' + _bkCount + ' ' + _w(_bkCount) + ' × ' + (_p.rateBooking || 0) + ' ' + unit + '</span><span><strong>= ' + _bookingAmt.toFixed(2) + ' ' + unit + '</strong></span></div>' : '';
var _vbs = emp._vipBySource || {};
var _vDef = _p.rateVipDefault || { reception: 0, booking: 0 };
var _brVip = (_p.rateVipByBranch && emp.branch) ? (_p.rateVipByBranch[emp.branch] || {}) : {};
var _vipAmt = 0;
var _vipRows = '';
if (_bdV > 0) {
  Object.keys(_vbs).forEach(function(rn) {
    var src = _vbs[rn]; var rates = _brVip[String(rn)] || _vDef;
    var rRec = src.reception || 0, rBk = src.booking || 0, cnt = rRec + rBk;
    if (cnt <= 0) return;
    var roomAmt = rRec * (rates.reception || 0) + rBk * (rates.booking || 0);
    _vipAmt += roomAmt;
    _vipRows += '<div class="row"><span>غرفة ' + rn + ': ' + cnt + ' ' + _w(cnt) + '</span><span><strong>= ' + roomAmt.toFixed(2) + ' ' + unit + '</strong></span></div>';
  });
}
var _sec3 = _vipRows ? '<p style="font-weight:700;margin:6px 0 2px;">👑 ثالثاً: حجوزات الـ VIP (سعر الغرفة)</p>' + _vipRows : '';
var _gbOnly = _shiftAmt + _bookingAmt + _vipAmt;
var _refCount = emp.count || 0;
return '<div class="detail-section section-bookings"><h3>📊 مكافآت الحجوزات</h3>' + _sec1 + _sec2 + _sec3 + '<div class="row total-row"><span>💰 المجموع النهائي للمكافأة:</span><span><strong>' + _gbOnly.toFixed(2) + ' ' + unit + '</strong></span></div><p style="font-size:9px;opacity:0.9;">(إجمالي الحجوزات: ' + _refCount + ' حجز)</p></div>';
})()}
<div class="detail-section section-evals">
<h3>⭐ مكافآت التقييمات</h3>
<div class="row">
<span>تقييمات Booking: ${evBooking} × ${_p.rateEvalBooking} ${unit}/تقييم</span>
<span><strong>${(evBooking * _p.rateEvalBooking).toFixed(2)} ${unit}</strong></span>
</div>
<div class="row">
<span>تقييمات Google Maps: ${evGoogle} × ${_p.rateEvalGoogle} ${unit}/تقييم</span>
<span><strong>${(evGoogle * _p.rateEvalGoogle).toFixed(2)} ${unit}</strong></span>
</div>
<div class="row total-row">
<span>إجمالي مكافآت التقييمات:</span>
<span><strong>${((evBooking * _p.rateEvalBooking) + (evGoogle * _p.rateEvalGoogle)).toFixed(2)} ${unit}</strong></span>
</div>
</div>
<div class="detail-section section-fund">
<h3>${pointsMode ? 'الإجمالي ومساهمة شركاء النجاح في نقاطك' : 'الإجمالي ومساهمة شركاء النجاح'}</h3>
<div class="row">
<span>إجمالي المكافآت (حجوزات + تقييمات):</span>
<span><strong>${gross.toFixed(2)} ${unit}</strong></span>
</div>
<div class="row">
<span>${pointsMode ? 'مساهمة شركاء النجاح في نقاطك (' + (_p.supportFundPercent != null ? _p.supportFundPercent : 15) + '%)' : 'مساهمة شركاء النجاح (' + (_p.supportFundPercent != null ? _p.supportFundPercent : 15) + '%)'}:</span>
<span><strong style="color: #ef4444;">${fundSign}${fund.toFixed(2)} ${unit}</strong></span>
</div>
<p class="fund-note">⚠️ النسبة تُخصم من المبلغ المالي فقط ولا تؤثر على تقييم الأداء أو رصيد النقاط التراكمي.</p>
<div class="row total-row">
<span>${pointsMode ? 'رصيد النقاط من الفترة:' : 'الصافي بعد مساهمة شركاء النجاح:'}</span>
<span><strong>${mainTotal.toFixed(2)} ${unit}</strong></span>
</div>
</div>
${attendanceBonus > 0 || excellenceBonus > 0 || commitmentBonus > 0 ? `
<div class="detail-section section-bonuses">
<h3>🏆 الحوافز الإضافية</h3>
${attendance26Days ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 2px;">
<div style="flex: 1;">
<span>✓ حافز تحدي الظروف (25%):</span>
<span style="display: block; font-size: 8px; color: #666; margin-top: 1px; margin-right: 10px;">تم إتمام ${actualAttendanceDays} يوماً وأكثر من العطاء (الصافي قبل الحافز: ${netBeforeAttendanceBonus.toFixed(2)} ${unit} × 25% = ${attendanceBonus.toFixed(2)} ${unit})</span>
</div>
<span><strong style="color: #10b981;">+${attendanceBonus.toFixed(2)} ${unit}</strong></span>
</div>
` : ''}
${hasExcellenceBonus ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 2px;">
<div style="flex: 1;">
<span>✨ خبير إرضاء العميل في الفرع:</span>
<span style="display: block; font-size: 8px; color: #666; margin-top: 1px; margin-right: 10px;">الأعلى تقييماً بـ ${maxEvalCount} تقييم والأكثر حجوزات ${maxBookCount} حجز في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #14b8a6;">+${excellenceBonus.toFixed(2)} ${unit}</strong></span>
</div>
` : ''}
${hasCommitmentBonus ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 2px;">
<div style="flex: 1;">
<span>✓ ${isMostEval ? 'حافز الالتزام ورضاء العميل' : 'حافز الالتزام والانجاز'}:</span>
<span style="display: block; font-size: 8px; color: #666; margin-top: 1px; margin-right: 10px;">الأكثر التزاماً (26+ يوم)${isMostEval && isMostBook ? ` + الأعلى تقييماً بـ ${maxEvalCount} تقييم والأكثر حجوزات ${maxBookCount} حجز` : isMostEval ? ` + الأعلى تقييماً بـ ${maxEvalCount} تقييم` : isMostBook ? ` + الأكثر حجوزات ${maxBookCount} حجز` : ''} في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #a855f7;">+${commitmentBonus.toFixed(2)} ${unit}</strong></span>
</div>
` : ''}
</div>
` : ''}
${totalDiscountAmount > 0 ? `
<div class="detail-section section-discounts">
<h3>💰 الخصومات المطبقة</h3>
${discountDetails.map(discount => {
  const discountAmount = discount.isHotelRating && discount.amount != null ? Number(discount.amount) : (typeof calculateAggregatedNetForEmployee === 'function' ? (calculateAggregatedNetForEmployee(emp.name) * (discount.discountPercentage / 100)) : 0);
  const appliedByLabel = (discount.appliedBy && typeof discount.appliedBy === 'string' && discount.appliedBy.trim()) ? discount.appliedBy : (discount.appliedBy || 'الأدمن');
  const label = discount.isHotelRating ? discount.discountType : `${discount.discountType} (${discount.discountPercentage}%)`;
  const sub = discount.isHotelRating ? discount.discountType : `تم خصم ${discount.discountPercentage}% بسبب ${discount.discountType} - مطبق من ${appliedByLabel}`;
  return `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 2px;">
<div style="flex: 1;">
<span>${label}:</span>
<span style="display: block; font-size: 8px; color: #666; margin-top: 1px; margin-right: 10px;">${sub}</span>
</div>
<span><strong style="color: #b91c1c;">-${discountAmount.toFixed(2)} ${unit}</strong></span>
</div>
`;
}).join('')}
<div class="row total-row">
<span>إجمالي الخصومات:</span>
<span><strong style="color: #ef4444;">-${totalDiscountAmount.toFixed(2)} ${unit}</strong></span>
</div>
</div>
` : ''}
<div class="detail-section final-summary-section section-final">
<h3>ملخص الحساب النهائي</h3>
<div class="row">
<span>إجمالي المكافآت:</span>
<span><strong>${gross.toFixed(2)} ${unit}</strong></span>
</div>
<div class="row">
<span>${pointsMode ? 'مساهمة شركاء النجاح في نقاطك' : 'مساهمة شركاء النجاح'}:</span>
<span><strong style="color: #ef4444;">${fundSign}${fund.toFixed(2)} ${unit}</strong></span>
</div>
<div class="row">
<span>${pointsMode ? 'رصيد النقاط من الفترة:' : 'الصافي بعد مساهمة شركاء النجاح:'}</span>
<span><strong>${mainTotal.toFixed(2)} ${unit}</strong></span>
</div>
${attendanceBonus > 0 ? `
<div class="row">
<span>حافز تحدي الظروف (25%):</span>
<span><strong style="color: #10b981;">+${attendanceBonus.toFixed(2)} ${unit}</strong></span>
</div>
` : ''}
${excellenceBonus > 0 ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 2px;">
<div style="flex: 1;">
<span>خبير إرضاء العميل في الفرع:</span>
<span style="display: block; font-size: 8px; color: #666; margin-top: 1px; margin-right: 10px;">الأعلى تقييماً (${evBooking} تقييم Booking) والأكثر حجوزات (${emp.count} حجز) في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #14b8a6;">+${excellenceBonus.toFixed(2)} ${unit}</strong></span>
</div>
` : ''}
${commitmentBonus > 0 ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 2px;">
<div style="flex: 1;">
<span>${isMostEval ? 'حافز الالتزام ورضاء العميل' : 'حافز الالتزام والانجاز'}:</span>
<span style="display: block; font-size: 8px; color: #666; margin-top: 1px; margin-right: 10px;">الأكثر التزاماً (26+ يوم)${isMostEval && isMostBook ? ' + الأعلى تقييماً والأكثر حجوزات' : isMostEval ? ' + الأعلى تقييماً' : isMostBook ? ' + الأكثر حجوزات' : ''} في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #a855f7;">+${commitmentBonus.toFixed(2)} ${unit}</strong></span>
</div>
` : ''}
${totalDiscountAmount > 0 ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 2px; margin-bottom: 2px;">
<span>إجمالي الخصومات:</span>
<span><strong style="color: #ef4444;">-${totalDiscountAmount.toFixed(2)} ${unit}</strong></span>
</div>
` : ''}
<div class="row total-row" style="background: #f0fdf4; padding: 2px 4px; border-radius: 2px; margin-top: 2px;">
<span style="font-size: 10px;">${summaryTitle}:</span>
<span style="font-size: 13px; color: #10b981;"><strong>${mainTotal.toFixed(2)} ${unit}</strong></span>
</div>
</div>
</div>
<div class="approval-stamp">
<span class="checkmark">✓</span>
<div class="department">إدارة التشغيل</div>
<div class="approved">معتمد</div>
</div>
`;
}

/** Print-ready HTML for aggregated (multi-branch) employee report — same logic as modal (استقبال/بوكينج عادي/VIP). */
function buildEmployeeReportBodyContentMultiBranch(report, periodText, reportDate, options) {
  options = options || {};
  var pointsMode = !!options.pointsMode;
  var emp = report.emp;
  var branchReports = report.branchReports || [];
  var _rp = getPricingConfig();
  var unit = pointsMode ? 'نقطة' : 'ريال';
  var fundSign = pointsMode ? '+' : '-';
  var fundLabel = pointsMode ? 'مساهمة شركاء النجاح في نقاطك (' + (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%)' : 'مساهمة شركاء النجاح (' + (_rp.supportFundPercent != null ? _rp.supportFundPercent : 15) + '%)';
  var gross = report.gross || 0;
  var fund = report.fund != null ? report.fund : (gross * getSupportFundRate());
  var mainTotal = pointsMode ? (report.finalNet + fund) : report.finalNet;
  var totalDiscountAmount = report.totalDiscountAmount || 0;
  var discountDetails = report.discountDetails || [];
  var summaryTitle = pointsMode ? 'رصيد النقاط من الفترة (الإجمالي)' : 'المبلغ الصافي المستحق (الإجمالي)';
  var attendanceBonus = report.attendanceBonus || 0;
  var actualAttendanceDays = report.actualAttendanceDays != null ? report.actualAttendanceDays : 0;
  var hasExcellenceBonus = report.hasExcellenceBonus;
  var hasCommitmentBonus = report.hasCommitmentBonus;
  var excellenceBonus = report.excellenceBonus || 0;
  var commitmentBonus = report.commitmentBonus || 0;
  var attendance26Days = report.attendance26Days;
  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  var header = '<div class="header"><div><h1>فندق إليت - ' + (pointsMode ? 'تقرير النقاط' : 'تقرير المكافآت') + '</h1><p><strong>الموظف:</strong> ' + esc(emp.name) + ' | <strong>الفروع:</strong> ' + esc(emp.branch) + '</p></div><div class="header-right"><p><strong>الفترة:</strong> ' + esc(periodText) + '</p><p><strong>التاريخ:</strong> ' + esc(reportDate) + '</p></div></div>';
  var summary = '<div class="summary-box"><h2>' + summaryTitle + '</h2><div class="amount">' + mainTotal.toFixed(2) + ' ' + unit + '</div>' + (totalDiscountAmount > 0 ? '<p style="font-size: 7px; margin-top: 1px; opacity: 0.9;">بعد خصم ' + totalDiscountAmount.toFixed(2) + ' ' + unit + '</p>' : '') + (pointsMode ? '<p style="font-size: 7px;">(صافي النقاط + مساهمة شركاء النجاح في نقاطك)</p>' : '') + '<p class="fund-note">الإجمالي أعلاه محسوب على مستوى الاسم (حوافز وخصومات مرة واحدة).</p></div>';
  var breakdownPerBranch = '';
  branchReports.forEach(function(r) {
    var be = r.emp;
    var b = r.breakdown || {};
    var _attD = r.actualAttendanceDays != null ? r.actualAttendanceDays : 0;
    breakdownPerBranch += '<div class="detail-section" style="margin-bottom: 3px;"><h3>' + esc(be.branch) + '</h3><div class="row"><span>العقود</span><span><strong>' + (b.staffCount != null ? b.staffCount : (be.count || 0)) + '</strong></span></div><div class="row"><span>استقبال</span><span><strong>' + (b.reception != null ? b.reception : 0) + '</strong></span></div><div class="row"><span>بوكينج</span><span><strong>' + (b.booking != null ? b.booking : 0) + '</strong></span></div><div class="row"><span>صباح</span><span><strong>' + (b.morning != null ? b.morning : 0) + '</strong></span></div><div class="row"><span>مساء</span><span><strong>' + (b.evening != null ? b.evening : 0) + '</strong></span></div><div class="row"><span>ليل</span><span><strong>' + (b.night != null ? b.night : 0) + '</strong></span></div>' + (b.vipTotal ? '<div class="row"><span>VIP</span><span><strong>' + b.vipTotal + '</strong></span></div>' : '') + '<div class="row"><span>حضور</span><span><strong>' + _attD + '</strong></span></div></div>';
  });
  var breakdownBlock = breakdownPerBranch ? '<div class="detail-section section-breakdown"><h3>📋 تفاصيل الحجوزات والشفتات (كل فرع)</h3>' + breakdownPerBranch + '</div>' : '';
  var discountBlock = '';
  if (totalDiscountAmount > 0 && discountDetails.length > 0) {
    discountBlock = '<div class="detail-section section-discounts"><h3>💰 الخصومات المطبقة</h3>' + discountDetails.map(function(d) {
      var amt = d.isHotelRating && d.amount != null ? Number(d.amount) : (typeof calculateAggregatedNetForEmployee === 'function' ? calculateAggregatedNetForEmployee(emp.name) * (d.discountPercentage / 100) : 0);
      var label = d.isHotelRating ? d.discountType : d.discountType + ' (' + d.discountPercentage + '%)';
      return '<div class="row"><span>' + esc(label) + '</span><span><strong style="color: #ef4444;">-' + amt.toFixed(2) + ' ' + unit + '</strong></span></div>';
    }).join('') + '</div>';
  }
  var bookingsSection = '<div class="detail-section section-bookings"><h3>📊 مكافآت الحجوزات</h3>';
  var _sumBranchBookOnly = 0;
  function _wPrint(n) { return n === 1 ? 'حجز' : 'حجوزات'; }
  branchReports.forEach(function(r) {
    var be = r.emp;
    var bc = be.count || 0;
    var rbd = r.breakdown || {};
    var totalM = rbd.morning || 0, totalE = rbd.evening || 0, totalN = rbd.night || 0, rbV = rbd.vipTotal || 0;
    var useNew = (be._receptionMorning != null || be._bookingRegular != null);
    var shiftAmt, bookingAmt, recCount, bkCount;
    if (useNew) {
      var recM = be._receptionMorning || 0, recE = be._receptionEvening || 0, recN = be._receptionNight || 0, bkReg = be._bookingRegular || 0;
      recCount = recM + recE + recN; bkCount = bkReg;
      shiftAmt = recM * _rp.rateMorning + recE * _rp.rateEvening + recN * _rp.rateNight;
      bookingAmt = bkReg * (_rp.rateBooking || 0);
    } else {
      var regM = Math.max(0, totalM - (be._vipMorning || 0)), regE = Math.max(0, totalE - (be._vipEvening || 0)), regN = Math.max(0, totalN - (be._vipNight || 0));
      recCount = regM + regE + regN; bkCount = 0;
      shiftAmt = regM * _rp.rateMorning + regE * _rp.rateEvening + regN * _rp.rateNight;
      bookingAmt = 0;
    }
    var nM = useNew ? (be._receptionMorning || 0) : Math.max(0, totalM - (be._vipMorning || 0)), nE = useNew ? (be._receptionEvening || 0) : Math.max(0, totalE - (be._vipEvening || 0)), nN = useNew ? (be._receptionNight || 0) : Math.max(0, totalN - (be._vipNight || 0));
    var amtM = nM * _rp.rateMorning, amtE = nE * _rp.rateEvening, amtN = nN * _rp.rateNight;
    var sec1 = '<p style="font-weight:800;font-size:9px;margin-bottom:1px;">' + esc(be.branch) + '</p><p style="font-weight:700;margin-bottom:2px;">🟢 أولاً: حجوزات الشفتات (الاستقبال العادي)</p><p style="font-size:8px;opacity:0.9;margin-bottom:2px;">الحجوزات بعد استبعاد الـ VIP والبوكينج</p><div class="row"><span>الشفت الصباحي: ' + nM + ' ' + _wPrint(nM) + ' × ' + _rp.rateMorning + ' ' + unit + '</span><span><strong>= ' + amtM.toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>الشفت المسائي: ' + nE + ' ' + _wPrint(nE) + ' × ' + _rp.rateEvening + ' ' + unit + '</span><span><strong>= ' + amtE.toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>الشفت الليلي: ' + nN + ' ' + _wPrint(nN) + ' × ' + _rp.rateNight + ' ' + unit + '</span><span><strong>= ' + amtN.toFixed(2) + ' ' + unit + '</strong></span></div>';
    var sec2 = bkCount > 0 ? '<p style="font-weight:700;margin:4px 0 2px;">🟠 ثانياً: حجوزات العمولة الثابتة (بوكينج)</p><div class="row"><span>بوكينج عادي: ' + bkCount + ' ' + _wPrint(bkCount) + ' × ' + (_rp.rateBooking || 0) + ' ' + unit + '</span><span><strong>= ' + bookingAmt.toFixed(2) + ' ' + unit + '</strong></span></div>' : '';
    var vipBySource = be._vipBySource || {};
    var vipDef = _rp.rateVipDefault || { reception: 0, booking: 0 };
    var brVip = (_rp.rateVipByBranch && be.branch) ? (_rp.rateVipByBranch[be.branch] || {}) : {};
    var vipRows = '';
    var vipAmtSum = 0;
    if (rbV > 0) {
      Object.keys(vipBySource).forEach(function(rn) {
        var src = vipBySource[rn];
        var rates = brVip[String(rn)] || vipDef;
        var rRec = src.reception || 0, rBk = src.booking || 0, cnt = rRec + rBk;
        if (cnt <= 0) return;
        var roomAmt = rRec * (rates.reception || 0) + rBk * (rates.booking || 0);
        vipAmtSum += roomAmt;
        vipRows += '<div class="row"><span>غرفة ' + rn + ': ' + cnt + ' ' + _wPrint(cnt) + '</span><span><strong>= ' + roomAmt.toFixed(2) + ' ' + unit + '</strong></span></div>';
      });
    }
    var sec3 = vipRows ? '<p style="font-weight:700;margin:4px 0 2px;">👑 ثالثاً: حجوزات الـ VIP (سعر الغرفة)</p>' + vipRows : '';
    var rbBookOnly = shiftAmt + bookingAmt + vipAmtSum;
    _sumBranchBookOnly += rbBookOnly;
    bookingsSection += '<div style="margin-bottom:4px;padding:3px;border:0.5px solid #e5e7eb;">' + sec1 + sec2 + sec3 + '<div class="row total-row"><span>💰 المجموع النهائي للمكافأة:</span><span><strong>' + rbBookOnly.toFixed(2) + ' ' + unit + '</strong></span></div><p style="font-size:8px;opacity:0.9;">(إجمالي الحجوزات: ' + bc + ' حجز)</p></div>';
  });
  bookingsSection += '<div class="row total-row" style="margin-top:4px;"><span>💰 المجموع النهائي للمكافأة (كل الفروع):</span><span><strong>' + _sumBranchBookOnly.toFixed(2) + ' ' + unit + '</strong></span></div><p style="font-size:8px;opacity:0.9;">(إجمالي الحجوزات: ' + (emp.count || 0) + ' حجز)</p></div>';
  var evalsSection = '<div class="detail-section section-evals"><h3>⭐ مكافآت التقييمات</h3>';
  branchReports.forEach(function(r) {
    var be = r.emp;
    var eb = r.evBooking || 0, eg = r.evGoogle || 0;
    var tot = (eb * _rp.rateEvalBooking) + (eg * _rp.rateEvalGoogle);
    evalsSection += '<div style="margin-bottom: 2px;"><p style="font-weight: 800; font-size: 9px;">' + esc(be.branch) + '</p><div class="row"><span>تقييمات Booking: ' + eb + ' × ' + _rp.rateEvalBooking + '</span><span><strong>' + (eb * _rp.rateEvalBooking).toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>تقييمات Google Maps: ' + eg + ' × ' + _rp.rateEvalGoogle + '</span><span><strong>' + (eg * _rp.rateEvalGoogle).toFixed(2) + ' ' + unit + '</strong></span></div><div class="row total-row"><span>إجمالي التقييمات (الفرع)</span><span><strong>' + tot.toFixed(2) + ' ' + unit + '</strong></span></div></div>';
  });
  var evalTotal = (report.evBooking || 0) * (_rp.rateEvalBooking || 0) + (report.evGoogle || 0) * (_rp.rateEvalGoogle || 0);
  evalsSection += '<div class="row total-row"><span>إجمالي مكافآت التقييمات</span><span><strong>' + evalTotal.toFixed(2) + ' ' + unit + '</strong></span></div></div>';
  var rest = '<div class="detail-section section-fund"><h3>الإجمالي ومساهمة شركاء النجاح</h3><div class="row"><span>إجمالي المكافآت (حجوزات + تقييمات)</span><span><strong>' + gross.toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>' + fundLabel + '</span><span><strong style="color: #ef4444;">' + fundSign + fund.toFixed(2) + ' ' + unit + '</strong></span></div><p class="fund-note">⚠️ النسبة تُخصم من المبلغ المالي فقط ولا تؤثر على تقييم الأداء أو رصيد النقاط التراكمي.</p></div>';
  rest += '<div class="detail-section section-bonuses"><h3>🏆 الحوافز الإضافية</h3>';
  if (attendance26Days && attendanceBonus > 0) rest += '<div class="row"><span>✓ حافز تحدي الظروف (25%)</span><span><strong style="color: #10b981;">+' + attendanceBonus.toFixed(2) + ' ' + unit + '</strong></span></div>';
  if (hasExcellenceBonus) rest += '<div class="row"><span>✨ خبير إرضاء العميل في الفرع</span><span><strong style="color: #14b8a6;">+' + excellenceBonus.toFixed(2) + ' ' + unit + '</strong></span></div>';
  if (hasCommitmentBonus) rest += '<div class="row"><span>✓ حافز الالتزام والانجاز</span><span><strong style="color: #a855f7;">+' + commitmentBonus.toFixed(2) + ' ' + unit + '</strong></span></div>';
  if (!attendance26Days && !hasExcellenceBonus && !hasCommitmentBonus) rest += '<div class="row"><span>لا توجد حوافز إضافية</span><span>—</span></div>';
  rest += '</div>';
  var nbf = gross - fund;
  rest += '<div class="detail-section final-summary-section section-final"><h3>ملخص الحساب النهائي</h3><div class="row"><span>إجمالي المكافآت</span><span><strong>' + gross.toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>' + fundLabel + '</span><span><strong style="color: #b91c1c;">' + fundSign + fund.toFixed(2) + ' ' + unit + '</strong></span></div><div class="row"><span>الصافي قبل الحوافز</span><span><strong>' + nbf.toFixed(2) + ' ' + unit + '</strong></span></div>';
  if (attendanceBonus > 0) rest += '<div class="row"><span>+ حافز تحدي الظروف</span><span><strong style="color: #047857;">+' + attendanceBonus.toFixed(2) + ' ' + unit + '</strong></span></div>';
  if (excellenceBonus > 0) rest += '<div class="row"><span>+ حافز التفوق</span><span><strong>+' + excellenceBonus.toFixed(2) + ' ' + unit + '</strong></span></div>';
  if (commitmentBonus > 0) rest += '<div class="row"><span>+ حافز الالتزام</span><span><strong>+' + commitmentBonus.toFixed(2) + ' ' + unit + '</strong></span></div>';
  if (totalDiscountAmount > 0) rest += '<div class="row"><span>− الخصومات</span><span><strong style="color: #b91c1c;">-' + totalDiscountAmount.toFixed(2) + ' ' + unit + '</strong></span></div>';
  rest += '<div class="row total-row" style="background: #f0fdf4;"><span>' + summaryTitle + '</span><span><strong style="font-size: 13px; color: #047857;">' + mainTotal.toFixed(2) + ' ' + unit + '</strong></span></div></div>';
  rest += '<div class="approval-stamp"><span class="checkmark">✓</span><div class="department">إدارة التشغيل</div><div class="approved">معتمد</div></div>';
  return '<div class="print-page">' + header + summary + breakdownBlock + discountBlock + bookingsSection + evalsSection + rest + '</div>';
}

function printEmployeeReport() {
  const modal = document.getElementById('employeeReportModal');
  if (!modal) return;
  const empId = modal.dataset.empId;
  const aggregatedName = modal.dataset.aggregatedName;
  const pointsMode = modal.dataset.pointsMode === '1';
  let report = null;
  if (aggregatedName && typeof calculateAggregatedEmployeeReport === 'function') {
    report = calculateAggregatedEmployeeReport(aggregatedName);
  } else if (empId && typeof calculateEmployeeReport === 'function') {
    report = calculateEmployeeReport(empId);
  }
  if (!report) return;
  const periodText = document.getElementById('headerPeriodRange')?.innerText || '-';
  const reportDate = getReportDateGregorian();
  const printWindow = window.open('', '_blank');
  const bodyContent = (report.branchReports && report.branchReports.length > 1 && typeof buildEmployeeReportBodyContentMultiBranch === 'function')
    ? buildEmployeeReportBodyContentMultiBranch(report, periodText, reportDate, { pointsMode: pointsMode })
    : buildEmployeeReportBodyContent(report, periodText, reportDate, { pointsMode: pointsMode });
  const fullHtml = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>' + (pointsMode ? 'تقرير النقاط - ' : 'تقرير ') + report.emp.name + '</title><style>' + getEmployeeReportPrintStyles() + '</style></head><body>' + bodyContent + '</body></html>';
  printWindow.document.write(fullHtml);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(function () { scaleToFitA4(printWindow.document); printWindow.print(); }, 300);
}

/**
 * مصدر واحد: تحويل تقرير الموظف إلى PDF باستخدام نفس HTML المُنسّق المستخدم في الطباعة
 * (بدلاً من نسخ محتوى المودال الذي كان ينتج PDF سيئاً).
 * يُستدعى من زر التحميل وزر الواتساب.
 * @returns {Promise<{blob: Blob, fileName: string}>}
 */
function generateEmployeeReportPdfBlob() {
  var modal = document.getElementById('employeeReportModal');
  if (!modal) return Promise.reject(new Error('employeeReportModal missing'));
  var empId = modal.dataset.empId;
  var aggregatedName = modal.dataset.aggregatedName;
  var pointsMode = modal.dataset.pointsMode === '1';
  var report = null;
  if (aggregatedName && typeof calculateAggregatedEmployeeReport === 'function') {
    report = calculateAggregatedEmployeeReport(aggregatedName);
  } else if (empId && typeof calculateEmployeeReport === 'function') {
    report = calculateEmployeeReport(empId);
  }
  if (!report || !report.emp) return Promise.reject(new Error('لا يوجد تقرير للتحميل. افتح تقرير موظف أولاً.'));
  var periodText = (document.getElementById('headerPeriodRange') && document.getElementById('headerPeriodRange').innerText) || '-';
  var reportDate = typeof getReportDateGregorian === 'function' ? getReportDateGregorian() : new Date().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  var bodyContent = (report.branchReports && report.branchReports.length > 1 && typeof buildEmployeeReportBodyContentMultiBranch === 'function')
    ? buildEmployeeReportBodyContentMultiBranch(report, periodText, reportDate, { pointsMode: pointsMode })
    : buildEmployeeReportBodyContent(report, periodText, reportDate, { pointsMode: pointsMode });
  var printStyles = typeof getEmployeeReportPrintStyles === 'function' ? getEmployeeReportPrintStyles() : '';
  var fileName = (report.emp.name || 'تقرير-موظف').replace(/[^\w\u0600-\u06FF\s-]/g, '').trim();
  fileName = (fileName.length > 50 ? fileName.substring(0, 50) : fileName) + '.pdf';

  return loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js').then(function () {
    var html2pdfFn = typeof window.html2pdf !== 'undefined' ? window.html2pdf : null;
    if (!html2pdfFn) return Promise.reject(new Error('html2pdf not available'));
    var wrapper = document.createElement('div');
    wrapper.setAttribute('dir', 'rtl');
    wrapper.setAttribute('lang', 'ar');
    wrapper.style.cssText = 'width: 190mm; max-width: 100%; margin: 0 auto; padding: 0 0 20mm 0; background: #fff; color: #0c0c0c; font-family: "IBM Plex Sans Arabic", Arial, sans-serif; box-sizing: border-box; min-height: auto; overflow: visible;';
    wrapper.innerHTML = '<style>' + printStyles + '</style>' + bodyContent;
    document.body.appendChild(wrapper);
    var opt = {
      margin: [10, 10, 16, 10],
      filename: fileName,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 1.8, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: 'auto', avoid: ['.row', '.detail-section', '.summary-box', '.approval-stamp', '.header'] }
    };
    return html2pdfFn().set(opt).from(wrapper).outputPdf('blob').then(function (blob) {
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
      return { blob: blob, fileName: fileName };
    }).catch(function (err) {
      if (document.body.contains(wrapper)) document.body.removeChild(wrapper);
      throw err;
    });
  });
}

/** تحميل تقرير الموظف كـ PDF فقط — لا مشاركة ولا فتح واتساب. */
function downloadEmployeeReportPdf() {
  generateEmployeeReportPdfBlob().then(function (result) {
    var url = URL.createObjectURL(result.blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = result.fileName;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    if (typeof showToast === 'function') showToast('تم تحميل التقرير PDF');
    else alert('تم تحميل التقرير.');
  }).catch(function (err) {
    console.error('downloadEmployeeReportPdf', err);
    alert('حدث خطأ أثناء إنشاء PDF. جرّب طباعة التقرير ثم «حفظ كـ PDF» من نافذة الطباعة.');
  });
}

/** إرسال تقرير الموظف PDF على الواتساب: مشاركة (اختر واتساب) أو تحميل + فتح ويب واتساب. */
function shareEmployeeReportViaWhatsApp() {
  generateEmployeeReportPdfBlob().then(function (result) {
    var file = new File([result.blob], result.fileName, { type: 'application/pdf' });
    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ title: 'تقرير موظف', files: [file] }).then(function () {
        if (typeof showToast === 'function') showToast('اختر واتساب أو جهة الاتصال ثم أرسل التقرير');
        else alert('اختر واتساب أو جهة الاتصال ثم أرسل التقرير');
      }).catch(function (e) {
        if (e.name !== 'AbortError') doDownloadAndOpenWhatsApp(result.blob, result.fileName);
      });
    } else {
      doDownloadAndOpenWhatsApp(result.blob, result.fileName);
    }
  }).catch(function (err) {
    console.error('shareEmployeeReportViaWhatsApp', err);
    alert('حدث خطأ أثناء إنشاء PDF. جرّب طباعة التقرير ثم «حفظ كـ PDF» من نافذة الطباعة.');
  });

  function doDownloadAndOpenWhatsApp(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
    window.open('https://web.whatsapp.com', '_blank', 'noopener');
    if (typeof showToast === 'function') showToast('تم تحميل التقرير وفتح واتساب — ارفق الملف من مجلد التحميلات واختر جهة الاتصال');
    else alert('تم تحميل التقرير وفتح واتساب. ارفق الملف من مجلد التحميلات واختر جهة الاتصال.');
  }
}

function printAllEmployeeReports() {
  if (typeof db === 'undefined' || !Array.isArray(db) || db.length === 0) {
    alert('لا توجد بيانات موظفين للطباعة.');
    return;
  }
  const periodText = document.getElementById('headerPeriodRange')?.innerText || '-';
  const reportDate = getReportDateGregorian();
  const bodyParts = [];
  const uniqueNames = [];
  db.forEach(function (emp) {
    if (uniqueNames.indexOf(emp.name) === -1) uniqueNames.push(emp.name);
  });
  uniqueNames.forEach(function (empName) {
    const report = typeof calculateAggregatedEmployeeReport === 'function'
      ? calculateAggregatedEmployeeReport(empName)
      : (db.find(function (e) { return e.name === empName; }) ? calculateEmployeeReport(db.find(function (e) { return e.name === empName; }).id) : null);
    if (report) {
      const body = (report.branchReports && report.branchReports.length > 1 && typeof buildEmployeeReportBodyContentMultiBranch === 'function')
        ? buildEmployeeReportBodyContentMultiBranch(report, periodText, reportDate)
        : buildEmployeeReportBodyContent(report, periodText, reportDate);
      bodyParts.push(body);
    }
  });
  if (bodyParts.length === 0) {
    alert('لا توجد تقارير جاهزة للطباعة.');
    return;
  }
  const fullHtml = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>تقارير الموظفين - الكل</title><style>' + getEmployeeReportPrintStyles(true) + '</style></head><body class="multi-report">' + bodyParts.join('') + '</body></html>';
  const printWindow = window.open('', '_blank');
  printWindow.document.write(fullHtml);
  printWindow.document.close();
  printWindow.focus();
  var delay = Math.max(500, bodyParts.length * 80);
  setTimeout(function () {
    scaleToFitA4(printWindow.document);
    printWindow.print();
  }, delay);
}
// === Role-Based UI: initializeRoleBasedUI، hideElementsFor*، showRoleWelcomeMessage في rewards-rbac.js ===

function printConditions() {
  getConditionsContentSchema(function(schema) {
    if (!schema) {
      if (typeof alert !== 'undefined') alert('تعذر تحميل محتوى الشروط. تأكد من توفر shared/conditions-content.json.');
      return;
    }
    var pricing = getPricingConfig();
    var printContent = buildConditionsPrintDocument(pricing, schema);
    var printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(printContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(function() {
      var wrapper = printWindow.document.querySelector('.conditions-one-page');
      if (wrapper && !wrapper.classList.contains('print-page')) wrapper.classList.add('print-page');
      if (typeof scaleToFitA4 === 'function') scaleToFitA4(printWindow.document);
      printWindow.print();
    }, 300);
  });
}

// === Firebase: دوال التهيئة والمزامنة والفترة الحية في rewards-firebase.js ===
