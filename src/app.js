// === Verbose logging: تفصيلي في التطوير فقط، إيقاف في الإنتاج ===
function logVerbose() {
  try {
    if (typeof window !== 'undefined' && window.location && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'))
      console.log.apply(console, arguments);
  } catch (e) {}
}

// === Role-Based Access Control (RBAC) ===
// تحويل رابط المسار إلى query: /supervisor/TOKEN/2026_01 → ?role=supervisor&token=TOKEN&period=2026_01 (إعادة تحميل لقراءة الـ params)
(function () {
  if (typeof window === 'undefined' || !window.location || !window.location.pathname) return;
  var pathname = window.location.pathname;
  var m = pathname.match(/^\/(supervisor|hr|accounting|manager)\/([^/]+)\/([^/]+)\/?$/);
  if (m) {
    var q = '?role=' + encodeURIComponent(m[1]) + '&token=' + encodeURIComponent(m[2]) + '&period=' + encodeURIComponent(m[3]);
    var newUrl = window.location.origin + '/' + q;
    if (window.location.href !== newUrl) window.location.replace(newUrl);
    return;
  }
  // /e/كود الموظف → ?code=كود
  var parts = pathname.split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === 'e' && parts[1]) {
    window.location.replace(window.location.origin + '/?code=' + encodeURIComponent(parts[1]));
  }
})();
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
let currentEvalRate = 20;
let reportStartDate = null; // Store the start date for report month name
let employeeCodesMap = {}; // Map employee names to codes
let discounts = []; // Array of discount objects: { employeeName, discountType, discountPercentage, appliedAt, id }
// Make discounts available globally
if (typeof window !== 'undefined') {
  window.discounts = discounts;
}
// يُعبّأ من loadDiscountTypes (البنود الـ 55 + ما يضيفه المدير)
let discountTypes = [];

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
// غيّر هذا المفتاح قبل النشر — راجع SECURITY.md (قسم "مفتاح الأدمن")
const ADMIN_SECRET_KEY = 'ayman5255'; // Change before production — see SECURITY.md
if (typeof window !== 'undefined') {
  window.getAdminSecretKey = function () { return ADMIN_SECRET_KEY; };
}

// === Security: Check if user is in employee mode ===
function isEmployeeMode() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('code');
}

// === Security: Check if user is admin ===
function isAdminMode() {
  const urlParams = new URLSearchParams(window.location.search);
  const adminKey = urlParams.get('admin');
  return adminKey === ADMIN_SECRET_KEY;
}

// Security: عند التطوير المحلي (localhost/127.0.0.1) بدون params يُسمح بالدخول للاختبار
function isLocalDevAllowed() {
  if (typeof window === 'undefined' || !window.location || !window.location.hostname) return false;
  var h = window.location.hostname;
  if (h !== 'localhost' && h !== '127.0.0.1') return false;
  return !role && !token && !period && !code;
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
if (!isAdminMode() && !isRbacFromUrl && !isLocalDevAllowed()) {
  // Not admin, not employee, not valid RBAC link, and not local dev - block access
  var existingBanner = document.getElementById('roleWelcomeBanner');
  if (existingBanner && existingBanner.parentNode) existingBanner.parentNode.removeChild(existingBanner);
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%); color: white; font-family: 'IBM Plex Sans Arabic', sans-serif; text-align: center; padding: 2rem;">
      <div style="background: rgba(255, 255, 255, 0.1); padding: 3rem; border-radius: 20px; border: 2px solid rgba(239, 68, 68, 0.5); max-width: 560px;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
        <h1 style="font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; color: #ef4444;">غير مصرح بالدخول</h1>
        <p style="color: #fbbf24; font-weight: 700; margin-bottom: 0.75rem; font-size: 0.95rem;">سبب عدم فتح الرابط:</p>
        <p style="color: #94a3b8; margin-bottom: 1rem; font-size: 0.9rem;">لم تُستخدم صلاحية صحيحة: إما رابط أدمن، أو رابط إداري (مشرف/حسابات)، أو رابط موظف بكود.</p>
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
if (savedDb && savedBranches) {
db = JSON.parse(savedDb);
branches = new Set(JSON.parse(savedBranches));
// Update window.db after loading
if (typeof window !== 'undefined') {
  window.db = db;
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
function returnToUpload(clearPeriodData) {
try {
var isAdmin = (typeof window !== 'undefined' && window.location && window.location.search) && new URLSearchParams(window.location.search).get('admin') === ADMIN_SECRET_KEY;
// قراءة الجلسة الحالية قبل المسح (لإزالة توكنها من adora_admin_tokens)
var r = localStorage.getItem('adora_current_role');
var p = localStorage.getItem('adora_current_period');
// مسح جلسة الإداري دائماً
localStorage.removeItem('adora_current_role');
localStorage.removeItem('adora_current_token');
localStorage.removeItem('adora_current_period');
if (clearPeriodData) {
  // إغلاق الفترة: مسح بيانات الفترة
  localStorage.removeItem('adora_rewards_db');
  localStorage.removeItem('adora_rewards_branches');
  localStorage.removeItem('adora_rewards_evalRate');
  localStorage.removeItem('adora_rewards_startDate');
  localStorage.removeItem('adora_rewards_periodText');
} else if (isAdmin) {
  // خروج الأدمن: مسح بيانات الفترة لظهور صفحة الرفع بعد التوجيه (بدون ?admin= يظهر «غير مصرح»)
  localStorage.removeItem('adora_rewards_db');
  localStorage.removeItem('adora_rewards_branches');
  localStorage.removeItem('adora_rewards_evalRate');
  localStorage.removeItem('adora_rewards_startDate');
  localStorage.removeItem('adora_rewards_periodText');
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
// إعادة توجيه: الأدمن → صفحة الرفع بنفس صلاحية الأدمن (?admin=...)؛ غيره → الصفحة الرئيسية
if (typeof window !== 'undefined' && window.location) {
  var targetUrl = (isAdmin ? window.location.origin + '/?admin=' + encodeURIComponent(ADMIN_SECRET_KEY) : window.location.origin + '/');
  window.location.replace(targetUrl);
  return;
}
} catch (error) {
console.error('❌ Error clearing:', error);
}
}
let currentSort = { key: 'net', order: 'desc' }; // Default: sort by net (highest first)
// === Sorting ===
// Sorting is now automatic by employee name (ascending) - no manual sorting needed
function toggleSort(key) {
// Disabled - sorting is always by name ascending
}
function updateSortIcons() {
// Disabled - no sort icons needed
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
      loadingWrap.className = 'flex flex-col items-center justify-center gap-3 py-12 px-4 text-white/90';
      loadingWrap.innerHTML = '<span class="admin-link-load-spinner inline-block w-8 h-8 border-2 border-[rgba(64,224,208,0.4)] rounded-full border-t-[#40E0D0]"></span><span class="font-bold">جاري تحميل بيانات الفترة من الخادم...</span>';
      var tbody = document.getElementById('mainTable');
      if (tbody && tbody.parentNode) tbody.parentNode.insertBefore(loadingWrap, tbody);
    }
    (async function fetchAndApplyLivePeriod() {
      var el = document.getElementById('adminLinkLoadingWrap');
      try {
        if (typeof initializeFirebase === 'function') initializeFirebase();
        var waitStart = Date.now();
        var maxWaitMs = 12000;
        while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < maxWaitMs) {
          await new Promise(function (r) { setTimeout(r, 150); });
        }
        var live = null;
        // أولاً: جلب periods/periodId.json (الملف الذي يُكتب عند فتح «إدارة الإداريين») — أنسب لفتح الرابط لأول مرة على جهاز الموظف
        if (urlPeriod && typeof fetchPeriodFromFirebase === 'function') {
          for (var attemptPeriod = 0; attemptPeriod < 4 && !live; attemptPeriod++) {
            live = await fetchPeriodFromFirebase(urlPeriod);
            if (!live && attemptPeriod < 3) await new Promise(function (r) { setTimeout(r, 1200); });
          }
        }
        // ثانياً: إن لم يُحمّل، جرب live.json (قد يكون محدّثاً من جهاز آخر)
        if (!live || !Array.isArray(live.db) || live.db.length === 0) {
          var maxAttempts = 4;
          for (var attempt = 0; attempt < maxAttempts; attempt++) {
            if (typeof fetchLivePeriodFromFirebase === 'function') live = await fetchLivePeriodFromFirebase();
            if (live && Array.isArray(live.db) && live.db.length > 0) break;
            if (attempt < maxAttempts - 1) await new Promise(function (r) { setTimeout(r, 1200); });
          }
        }
        // احتياطي أخير: إعادة محاولة periods/periodId.json
        if ((!live || !Array.isArray(live.db) || live.db.length === 0) && urlPeriod && typeof fetchPeriodFromFirebase === 'function') {
          live = await fetchPeriodFromFirebase(urlPeriod);
        }
        if (!isEmployeeMode() && live && Array.isArray(live.db) && live.db.length > 0 && typeof applyLivePeriod === 'function') {
          applyLivePeriod(live);
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
          if (el) {
            el.innerHTML = '<div class="text-center"><p class="font-bold text-amber-400 mb-2">تعذّر تحميل بيانات الفترة</p><p class="text-sm text-gray-400 mb-4">تحقق من الاتصال بالإنترنت. تأكد أن الأدمن رفع ملف الفترة وفتح «إدارة الإداريين» لتفعيل الرابط.</p><button type="button" id="retryPeriodBtn" onclick="location.reload()" class="px-4 py-2 rounded-xl font-bold focus:outline-none focus:ring-2 focus:ring-[#14b8a6] focus:ring-offset-2 focus:ring-offset-[#0f172a]" style="background:rgba(20,184,166,0.2);color:#14b8a6;border:1px solid rgba(20,184,166,0.5);">إعادة المحاولة</button></div>';
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
      if (!isEmployeeMode() && typeof startLivePeriodPolling === 'function') startLivePeriodPolling();
    })();
    if (!isEmployeeMode() && typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
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
    // إذا جلبنا بيانات من Firebase: نطبقها ونعرض اللوحة
    if (!isEmployeeMode() && live && Array.isArray(live.db) && live.db.length > 0 && typeof applyLivePeriod === 'function') {
      applyLivePeriod(live);
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
  if (!isEmployeeMode() && typeof startLivePeriodPolling === 'function') startLivePeriodPolling();
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

function isAdminLinkSubmitted() {
  try {
    var r = localStorage.getItem('adora_current_role');
    var p = localStorage.getItem('adora_current_period');
    if (!r || !p) return false;
    return !!localStorage.getItem('adora_admin_submitted_' + p + '_' + r);
  } catch (e) { return false; }
}

function doRbacThenInit() {
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

// Merge old and new data
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
// Employee exists in both old and new: update only count from new file.
// بيانات الإداريين والخصومات تبقى كما هي حتى إغلاق الفترة — الارتباط باسم الموظف.
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

if (db.length > 0) {
// Save to localStorage — adora_rewards_discounts لا تُمس؛ تبقى مرتبطة باسم الموظف حتى إغلاق الفترة
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
if (typeof window !== 'undefined') {
  window.db = db;
}
localStorage.setItem('adora_rewards_branches', JSON.stringify([...branches]));
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
// Check if localStorage is available
try {
localStorage.setItem('test', 'test');
localStorage.removeItem('test');
logVerbose('✅ localStorage is available and working');
} catch (storageError) {
console.error('❌ localStorage is not available:', storageError);
alert('⚠️ تحذير: لا يمكن حفظ البيانات. يرجى التحقق من إعدادات المتصفح (قد يكون في وضع التصفح الخاص أو محظور localStorage)');
}
}
document.getElementById('uploadBox').classList.add('hidden');
document.getElementById('dashboard').classList.remove('hidden');
document.getElementById('actionBtns').style.display = 'flex';
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
// updateEvalRate function removed - rates are now fixed (20 for Booking, 10 for Google Maps)
// This function is no longer needed as rates cannot be changed

// مصدر واحد للإجماليات: دالة واحدة تُرجع كل القيم للكروت والتذييل (لا نسخ من DOM)
function getFooterTotals() {
  let filtered = [...db];
  if (currentFilter !== 'الكل') filtered = filtered.filter(d => d.branch === currentFilter);
  const branchWinners = {};
  [...branches].forEach(b => {
    branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
  });
  db.forEach(emp => {
    const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
    const evBooking = emp.evaluationsBooking || 0;
    const evGoogle = emp.evaluationsGoogle || 0;
    const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
    const fund = gross * 0.15;
    let net = gross - fund;
    const attendance26Days = emp.attendance26Days === true;
    net = net + (attendance26Days ? net * 0.25 : 0);
    const bw = branchWinners[emp.branch];
    if (!bw) return;
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
    const empNameCount = db.filter(e => e.name === emp.name).length;
    let empAttendanceDays = attendance26Days ? 26 : 0;
    if (empNameCount > 1) empAttendanceDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
    if (empAttendanceDays >= 26) {
      let isHighestDays = true;
      db.filter(e => e.branch === emp.branch).forEach(otherEmp => {
        if (otherEmp.name === emp.name) return;
        const otherNameCount = db.filter(e => e.name === otherEmp.name).length;
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
  });
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
      allEmpBranches.forEach(branchEmp => {
        const rate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
        const evBooking = branchEmp.evaluationsBooking || 0;
        const evGoogle = branchEmp.evaluationsGoogle || 0;
        const gross = (branchEmp.count * rate) + (evBooking * 20) + (evGoogle * 10);
        const fund = gross * 0.15;
        let branchNet = gross - fund;
        const attendance26Days = branchEmp.attendance26Days === true;
        branchNet = branchNet + (attendance26Days ? branchNet * 0.25 : 0);
        empFund += fund;
        totalNetFromBranches += branchNet;
        const bw = branchWinners[branchEmp.branch];
        if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0) hasExcellence = true;
        if (bw && attendance26Days && bw.attendance.ids.includes(branchEmp.id) && (bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0 || bw.book.ids.includes(branchEmp.id) && bw.book.val > 0)) hasCommitment = true;
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
    filtered.forEach(emp => {
      const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
      const evBooking = emp.evaluationsBooking || 0;
      const evGoogle = emp.evaluationsGoogle || 0;
      const empTotalEval = evBooking + evGoogle;
      const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
      const fund = gross * 0.15;
      let net = gross - fund;
      const attendance26Days = emp.attendance26Days === true;
      net = net + (attendance26Days ? net * 0.25 : 0);
      totalNetNoEval += (emp.count * rate) * 0.85;
      totalFund += fund;
      const hasExcellenceBonus = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
      const excellenceBonus = hasExcellenceBonus ? 50 : 0;
      const isMostCommitted = branchWinners[emp.branch]?.attendance.ids.includes(emp.id);
      const isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
      const isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
      const hasCommitmentBonus = attendance26Days && isMostCommitted && (isMostEval || isMostBook);
      const commitmentBonus = hasCommitmentBonus ? 50 : 0;
      let employeeFinalNet = net + excellenceBonus + commitmentBonus;
      if (typeof getDiscountForEmployeeInBranch === 'function') {
        const employeeDiscount = getDiscountForEmployeeInBranch(emp.name, net);
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

function updateFooterTotals() {
  const t = getFooterTotals();
  const footEvalCountEl = document.getElementById('footEvalCount');
  const footBookingCountEl = document.getElementById('footBookingCount');
  const footFundEl = document.getElementById('footFund');
  const footNetEl = document.getElementById('footNet');
  const footNetNoEvalEl = document.getElementById('footNetNoEval');
  const footTotalNetEl = document.getElementById('footTotalNet');
  const statEmployeesEl = document.getElementById('statEmployees');
  const statBookingsEl = document.getElementById('statBookings');
  const statTotalEl = document.getElementById('statTotal');
  if (footEvalCountEl) footEvalCountEl.innerText = t.totalEval;
  if (footBookingCountEl) footBookingCountEl.innerText = t.statBookings;
  if (footFundEl) footFundEl.innerText = t.totalFund.toFixed(1);
  if (footNetEl) footNetEl.innerText = t.totalNet.toFixed(2);
  if (footNetNoEvalEl) footNetNoEvalEl.innerText = t.totalNetNoEval.toFixed(2);
  const footTotalFundEl = document.getElementById('footTotalFund');
  if (footTotalFundEl) footTotalFundEl.innerText = '';
  if (footTotalNetEl) footTotalNetEl.innerText = t.finalTotal.toFixed(2);
  if (statEmployeesEl) statEmployeesEl.innerText = t.statEmployees;
  if (statBookingsEl) statBookingsEl.innerText = t.statBookings;
  if (statTotalEl) statTotalEl.innerText = isNaN(t.finalTotal) || !isFinite(t.finalTotal) ? '0' : t.finalTotal.toFixed(0);
  updateCommitmentBonusRow();
  if (typeof loadCurrentPeriodStats === 'function') {
    const reportsPage = document.getElementById('reportsPage');
    const statisticsContent = document.getElementById('statisticsReportsContent');
    if (reportsPage && !reportsPage.classList.contains('hidden') && statisticsContent && !statisticsContent.classList.contains('hidden')) {
      loadCurrentPeriodStats();
      if (typeof populateEmployeePerformanceTable === 'function') populateEmployeePerformanceTable();
    }
  }
  return;
}
function updateEvalBooking(id, val, inputEl, shouldRender = false) {
const item = db.find(i => i.id === id);
if (!item) return;
// Check role permissions
const currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin') {
  showToast('❌ غير مصرح لك بتعديل التقييمات', 'error');
  if (inputEl) inputEl.value = item.evaluationsBooking || 0;
  return;
}
// الكل للعرض والتجميع فقط — لا تعديل لأي أحد (بما فيه الأدمن)، التعديل في الفروع
if (typeof currentFilter !== 'undefined' && currentFilter === 'الكل') {
  showToast('❌ التعديل في الفروع فقط — الكل للعرض والتجميع', 'error');
  if (inputEl) inputEl.value = item.evaluationsBooking || 0;
  return;
}
// Ensure valid number
const newVal = parseInt(val) || 0;
const oldVal = item.evaluationsBooking || 0;
item.evaluationsBooking = newVal;
// Log admin action
if (typeof logAdminAction === 'function' && currentRole) {
  logAdminAction(currentRole, 'update_eval_booking', {
    employeeName: item.name,
    employeeId: id,
    branch: item.branch,
    oldValue: oldVal,
    newValue: newVal
  });
}
// Save to localStorage
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
if (typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
}
// Update badges immediately (always, even during typing)
updateBadges();
// Only re-render if shouldRender is true (on blur, not on input)
if (shouldRender) {
// Update footer totals without full re-render to avoid lag
updateFooterTotals();
// Update badges again after update
setTimeout(() => {
updateBadges();
}, 50);
// Don't move automatically on blur - let user control navigation with Tab/Enter/Arrows
}
}
function updateEvalGoogle(id, val, inputEl, shouldRender = false) {
const item = db.find(i => i.id === id);
if (!item) return;
// Check role permissions
const currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin') {
  showToast('❌ غير مصرح لك بتعديل التقييمات', 'error');
  if (inputEl) inputEl.value = item.evaluationsGoogle || 0;
  return;
}
// الكل للعرض والتجميع فقط — لا تعديل لأي أحد (بما فيه الأدمن)، التعديل في الفروع
if (typeof currentFilter !== 'undefined' && currentFilter === 'الكل') {
  showToast('❌ التعديل في الفروع فقط — الكل للعرض والتجميع', 'error');
  if (inputEl) inputEl.value = item.evaluationsGoogle || 0;
  return;
}
// Ensure valid number
const newVal = parseInt(val) || 0;
const oldVal = item.evaluationsGoogle || 0;
item.evaluationsGoogle = newVal;
// Log admin action
if (typeof logAdminAction === 'function' && currentRole) {
  logAdminAction(currentRole, 'update_eval_google', {
    employeeName: item.name,
    employeeId: id,
    branch: item.branch,
    oldValue: oldVal,
    newValue: newVal
  });
}
// Save to localStorage immediately (always save, even during typing)
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
if (typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
}
// Update window.db after db modification
if (typeof window !== 'undefined') {
  window.db = db;
}
// Update badges immediately (always, even during typing)
updateBadges();
// Only re-render if shouldRender is true (on blur, not on input)
if (shouldRender) {
// Update footer totals without full re-render to avoid lag
updateFooterTotals();
// Update badges again after update
setTimeout(() => {
updateBadges();
}, 50);
// Don't move automatically on blur - let user control navigation with Tab/Enter/Arrows
}
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
function handleAttendanceDaysBlur(inputElement, empName, branchName) {
// Get current value
let value = inputElement.value;
// Remove any characters that are not digits
value = value.replace(/[^0-9]/g, '');
// Update input value
inputElement.value = value;
// Update attendance days and render UI now that user finished typing
if (value !== '') {
const numValue = parseInt(value) || 0;
updateAttendanceDaysForBranch(empName, branchName, numValue, true);
} else {
updateAttendanceDaysForBranch(empName, branchName, 0, true);
}
}
function updateAttendanceDaysForBranch(empName, branchName, days, shouldRender = true) {
var currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'hr' && currentRole !== 'admin') {
  if (shouldRender) showToast('❌ غير مصرح لك بتعديل أيام الحضور', 'error');
  return;
}
// الكل للعرض فقط — إدخال أيام الحضور من الفروع فقط (المشرف وHR يدخلون في الفرع)
if (typeof currentFilter !== 'undefined' && currentFilter === 'الكل') {
  if (shouldRender) showToast('❌ التعديل في الفروع فقط — الكل للعرض والتجميع', 'error');
  return;
}
// Ensure days is a valid positive number (accepts any number: odd, even, single-digit, multi-digit)
days = Math.max(0, parseInt(days) || 0);
// No restriction on odd/even numbers - accept 8, 22, 30, 15, etc.
// Get all employees with this name
const employeesWithSameName = db.filter(emp => emp.name === empName);
// Get old value for logging
let oldValue = 0;
if (employeesWithSameName.length > 0 && employeesWithSameName[0].attendanceDaysPerBranch) {
  oldValue = employeesWithSameName[0].attendanceDaysPerBranch[branchName] || 0;
}
// Initialize attendanceDaysPerBranch if it doesn't exist
employeesWithSameName.forEach((emp) => {
if (!emp.attendanceDaysPerBranch) {
emp.attendanceDaysPerBranch = {};
}
});
// Update the specific branch's days for all employees with this name
employeesWithSameName.forEach((emp) => {
// Update the specific branch
emp.attendanceDaysPerBranch[branchName] = days;
// Calculate total days from all branches
const totalDays = Object.values(emp.attendanceDaysPerBranch).reduce((sum, d) => {
return sum + (parseInt(d) || 0);
}, 0);
// Update totalAttendanceDays
emp.totalAttendanceDays = totalDays;
// Auto-update attendance26Days based on total days (26 or more = true, less = false)
emp.attendance26Days = totalDays >= 26;
});
// Log admin action
if (typeof logAdminAction === 'function' && currentRole && shouldRender) {
  logAdminAction(currentRole, 'update_attendance_days', {
    employeeName: empName,
    branch: branchName,
    oldValue: oldValue,
    newValue: days
  });
}
// Save to localStorage
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
if (typeof window !== 'undefined') {
  window.db = db;
}
if (typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
}
// Re-render UI only if shouldRender is true (to avoid losing focus during typing)
if (shouldRender) {
renderUI(currentFilter);
}
}
// Function to move to next input field smoothly
function moveToNextEvalInput(currentInput) {
  const row = currentInput.closest('tr');
  if (!row) return;
  
  // Find all eval inputs in the same row
  const sameRowInputs = Array.from(row.querySelectorAll('.eval-input'));
  if (sameRowInputs.length >= 2) {
    const currentIndex = sameRowInputs.indexOf(currentInput);
    
    if (currentIndex === 0) {
      // Currently on Booking → move to Google Maps in same row
      if (sameRowInputs[1]) {
        // Use setTimeout to ensure blur completes first
        setTimeout(() => {
          sameRowInputs[1].focus();
          sameRowInputs[1].select();
        }, 10);
        return true;
      }
    } else if (currentIndex === 1) {
      // Currently on Google Maps → move to Booking in next row
      const nextRow = row.nextElementSibling;
      if (nextRow && !nextRow.classList.contains('badges-row')) {
        const nextRowInputs = Array.from(nextRow.querySelectorAll('.eval-input'));
        if (nextRowInputs.length > 0) {
          // Move to Booking (first input) in next row
          setTimeout(() => {
            nextRowInputs[0].focus();
            nextRowInputs[0].select();
          }, 10);
          return true;
        }
      }
    }
  }
  
  // Fallback: move to next input in order
  const allInputs = [...document.querySelectorAll('.eval-input')];
  const index = allInputs.indexOf(currentInput);
  if (index > -1 && index < allInputs.length - 1) {
    const nextInput = allInputs[index + 1];
    // Skip if next input is in a badges-row
    const nextRow = nextInput.closest('tr');
    if (nextRow && !nextRow.classList.contains('badges-row')) {
      setTimeout(() => {
        nextInput.focus();
        nextInput.select();
      }, 10);
      return true;
    }
  }
  
  return false;
}

function handleEvalKey(e, currentInput) {
  // Only handle Tab and Enter for eval inputs - prevent default to stop normal tab behavior
  if (e.key === 'Tab') {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.shiftKey) {
      // Shift+Tab: Move to previous eval input
      moveToPreviousEvalInput(currentInput);
    } else {
      // Tab: Move to next eval input
      moveToNextEvalInput(currentInput);
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    e.stopPropagation();
    moveToNextEvalInput(currentInput);
  } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
    // Allow arrow keys to move to next field
    e.preventDefault();
    moveToNextEvalInput(currentInput);
  } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
    // Move to previous field
    e.preventDefault();
    moveToPreviousEvalInput(currentInput);
  }
}

// Function to move to previous input field smoothly
function moveToPreviousEvalInput(currentInput) {
  const row = currentInput.closest('tr');
  if (!row) return;
  
  // Find all eval inputs in the same row
  const sameRowInputs = Array.from(row.querySelectorAll('.eval-input'));
  if (sameRowInputs.length >= 2) {
    const currentIndex = sameRowInputs.indexOf(currentInput);
    
    if (currentIndex === 1) {
      // Currently on Google Maps → move to Booking in same row
      if (sameRowInputs[0]) {
        setTimeout(() => {
          sameRowInputs[0].focus();
          sameRowInputs[0].select();
        }, 10);
        return true;
      }
    } else if (currentIndex === 0) {
      // Currently on Booking → move to Google Maps in previous row
      const prevRow = row.previousElementSibling;
      if (prevRow && !prevRow.classList.contains('badges-row')) {
        const prevRowInputs = Array.from(prevRow.querySelectorAll('.eval-input'));
        if (prevRowInputs.length > 1) {
          setTimeout(() => {
            prevRowInputs[1].focus();
            prevRowInputs[1].select();
          }, 10);
          return true;
        } else if (prevRowInputs.length > 0) {
          setTimeout(() => {
            prevRowInputs[0].focus();
            prevRowInputs[0].select();
          }, 10);
          return true;
        }
      }
    }
  }
  
  // Fallback: move to previous input in order
  const allInputs = [...document.querySelectorAll('.eval-input')];
  const index = allInputs.indexOf(currentInput);
  if (index > 0) {
    const prevInput = allInputs[index - 1];
    // Skip if prev input is in a badges-row
    const prevRow = prevInput.closest('tr');
    if (prevRow && !prevRow.classList.contains('badges-row')) {
      setTimeout(() => {
        prevInput.focus();
        prevInput.select();
      }, 10);
      return true;
    }
  }
  
  return false;
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
// Recalculate branch winners to check for excellence bonus and commitment bonus
const branchWinners = {}; 
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
});
// Calculate branch winners (including attendance bonus/discount)
db.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
// Apply attendance bonus/discount
const empAttendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const empAttendanceBonus = empAttendance26Days ? net * 0.25 : 0;
net = net + empAttendanceBonus; // No discount - only bonus if activated
const bw = branchWinners[emp.branch];
if (!bw) return;
if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
else if (net === bw.net.val) { bw.net.ids.push(emp.id); }
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
else if (evBooking === bw.eval.val) { bw.eval.ids.push(emp.id); }
if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
else if (emp.count === bw.book.val) { bw.book.ids.push(emp.id); }
// Track most committed (attendance26Days = true)
// For duplicate employees: use totalAttendanceDays
const empNameCount = db.filter(e => e.name === emp.name).length;
let empAttendanceDays = empAttendance26Days ? 26 : 0;
if (empNameCount > 1) {
empAttendanceDays = emp.totalAttendanceDays || (empAttendance26Days ? 26 : 0);
}
if (empAttendanceDays >= 26) {
// Compare with other employees in this branch
let isHighestDays = true;
const branchEmployees = db.filter(e => e.branch === emp.branch);
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === emp.name) return;
const otherNameCount = db.filter(e => e.name === otherEmp.name).length;
let otherDays = otherEmp.attendance26Days === true ? 26 : 0;
if (otherNameCount > 1) {
otherDays = otherEmp.totalAttendanceDays || (otherEmp.attendance26Days === true ? 26 : 0);
}
if (otherDays > empAttendanceDays) {
isHighestDays = false;
}
});
if (isHighestDays) {
if (bw.attendance.val === -1) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [emp.id];
} else if (empAttendanceDays > bw.attendance.val) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [emp.id];
} else if (empAttendanceDays === bw.attendance.val) {
bw.attendance.ids.push(emp.id);
}
}
}
});
// Recalculate stats for this employee
const rate = item.count > 100 ? 3 : (item.count > 50 ? 2 : 1);
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
const isMostCommitted = branchWinners[item.branch]?.attendance.ids.includes(item.id);
// "الأكثر تقييماً" = Booking فقط
const isMostEval = branchWinners[item.branch]?.eval.ids.includes(item.id) && branchWinners[item.branch].eval.val > 0;
const isMostBook = branchWinners[item.branch]?.book.ids.includes(item.id) && branchWinners[item.branch].book.val > 0;
const hasCommitmentBonus = checked && isMostCommitted && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
const gross = (item.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
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
netCell.className = hasCommitmentBonus ? 'col-net p-2 text-left font-black text-white bg-purple-500/[0.08] px-4 print:text-black text-xl number-display' : (hasExcellenceBonus ? 'col-net p-2 text-left font-black text-white bg-turquoise/[0.08] px-4 print:text-black text-xl number-display' : 'col-net p-2 text-left font-black text-white bg-turquoise/[0.08] px-4 print:text-black text-xl number-display');
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
class="filter-pill active px-8 py-3 rounded-xl text-sm font-bold transition-all text-[#0a0e1a] shadow-[0_0_20px_rgba(64,224,208,0.3)]" 
data-filter="الكل">
الكل
</button>
`;
branches.forEach(b => {
html += `
<button onclick="setFilter('${b}')" 
class="filter-pill px-8 py-3 rounded-xl text-sm font-bold text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-turquoise/50 transition-all" 
data-filter="${b}">
${b}
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
// Recalculate branch winners/losers
const branchWinners = {}; 
const branchLosers = {};
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
branchLosers[b] = { net: {val: Infinity, ids: []}, eval: {val: Infinity, ids: []}, evalBooking: {val: Infinity, ids: []}, evalGoogle: {val: Infinity, ids: []}, book: {val: Infinity, ids: []} };
});
// Calculate branch winners/losers (CRITICAL: Include attendance bonus/discount for accurate net calculation)
db.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle; // For financial calculations only
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
// Apply attendance bonus/discount for accurate net calculation
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const attendanceBonus = attendance26Days ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
const bw = branchWinners[emp.branch];
const bl = branchLosers[emp.branch];
if (!bw || !bl) return;
if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
else if (net === bw.net.val) { bw.net.ids.push(emp.id); }
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
else if (evBooking === bw.eval.val) { bw.eval.ids.push(emp.id); }
// Separate tracking for Booking evaluations
if (evBooking > bw.evalBooking.val) { bw.evalBooking.val = evBooking; bw.evalBooking.ids = [emp.id]; }
else if (evBooking === bw.evalBooking.val) { bw.evalBooking.ids.push(emp.id); }
// Separate tracking for Google Maps evaluations
if (evGoogle > bw.evalGoogle.val) { bw.evalGoogle.val = evGoogle; bw.evalGoogle.ids = [emp.id]; }
else if (evGoogle === bw.evalGoogle.val) { bw.evalGoogle.ids.push(emp.id); }
if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
else if (emp.count === bw.book.val) { bw.book.ids.push(emp.id); }
// Track most committed (attendance26Days = true)
// For duplicate employees: use totalAttendanceDays
const empNameCount = db.filter(e => e.name === emp.name).length;
let empAttendanceDays = attendance26Days === true ? 26 : 0;
if (empNameCount > 1) {
empAttendanceDays = emp.totalAttendanceDays || (attendance26Days ? 26 : 0);
}
if (empAttendanceDays >= 26) {
// Compare with other employees in this branch
let isHighestDays = true;
const branchEmployees = db.filter(e => e.branch === emp.branch);
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === emp.name) return;
const otherNameCount = db.filter(e => e.name === otherEmp.name).length;
let otherDays = otherEmp.attendance26Days === true ? 26 : 0;
if (otherNameCount > 1) {
otherDays = otherEmp.totalAttendanceDays || (otherEmp.attendance26Days === true ? 26 : 0);
}
if (otherDays > empAttendanceDays) {
isHighestDays = false;
}
});
if (isHighestDays) {
if (bw.attendance.val === -1) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [emp.id];
} else if (empAttendanceDays > bw.attendance.val) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [emp.id];
} else if (empAttendanceDays === bw.attendance.val) {
bw.attendance.ids.push(emp.id);
}
}
}
if (net > 0 && net < bl.net.val) { bl.net.val = net; bl.net.ids = [emp.id]; }
else if (net > 0 && net === bl.net.val) { bl.net.ids.push(emp.id); }
// "الأقل تقييماً" = Booking فقط (NOT Google Maps)
if (evBooking < bl.eval.val || (evBooking === 0 && bl.eval.val > 0)) { 
bl.eval.val = evBooking; 
bl.eval.ids = [emp.id]; 
} else if (evBooking === bl.eval.val) { 
bl.eval.ids.push(emp.id); 
}
// Separate tracking for Booking evaluations (losers)
if (evBooking < bl.evalBooking.val || (evBooking === 0 && bl.evalBooking.val > 0)) { 
bl.evalBooking.val = evBooking; 
bl.evalBooking.ids = [emp.id]; 
} else if (evBooking === bl.evalBooking.val) { 
bl.evalBooking.ids.push(emp.id); 
}
// Separate tracking for Google Maps evaluations (losers)
if (evGoogle < bl.evalGoogle.val || (evGoogle === 0 && bl.evalGoogle.val > 0)) { 
bl.evalGoogle.val = evGoogle; 
bl.evalGoogle.ids = [emp.id]; 
} else if (evGoogle === bl.evalGoogle.val) { 
bl.evalGoogle.ids.push(emp.id); 
}
if (emp.count > 0 && emp.count < bl.book.val) { bl.book.val = emp.count; bl.book.ids = [emp.id]; }
else if (emp.count > 0 && emp.count === bl.book.val) { bl.book.ids.push(emp.id); }
});
// Calculate view winners/losers
// Use currentFilter from global scope (set by renderUI)
let filtered = [...db];
const activeFilter = typeof currentFilter !== 'undefined' ? currentFilter : 'الكل';
if (activeFilter !== 'الكل') {
filtered = filtered.filter(d => d.branch === activeFilter);
}
let viewWinners = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []} };
let viewLosers = { net: {val: Infinity, ids: []}, eval: {val: Infinity, ids: []}, evalBooking: {val: Infinity, ids: []}, evalGoogle: {val: Infinity, ids: []}, book: {val: Infinity, ids: []} };
filtered.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle; // For financial calculations only
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
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
// Update badges in all rows (including badges-row)
// First, find all employee rows and ensure they have badges-rows
const employeeRows = document.querySelectorAll('#mainTable tr[data-name]:not(.badges-row)');
employeeRows.forEach(empRow => {
const empId = empRow.dataset.id || empRow.dataset.empId;
const rName = empRow.dataset.name;
const rBranch = empRow.dataset.branch;
if (!empId && !rName) return;
// Find employee
const emp = empId ? db.find(d => d.id === empId) : (rName && rBranch ? db.find(d => d.name === rName && d.branch === rBranch) : null);
if (!emp) return;
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
badgesRow.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
const td = document.createElement('td');
td.className = 'col-name p-2';
td.setAttribute('colspan', '8');
td.style.paddingRight = '16px';
td.style.paddingTop = '4px';
td.style.paddingBottom = '4px';
const badgeWrap = document.createElement('div');
badgeWrap.className = 'badges-wrapper flex flex-wrap gap-2 items-center';
badgeWrap.style.direction = 'rtl';
badgeWrap.style.textAlign = 'right';
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
// Helper to calc stats (CRITICAL: Must include attendance bonus/discount + excellence bonus + commitment bonus to match renderUI logic)
const calcStats = (emp) => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
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
return { net, ev, count: emp.count, branch: emp.branch, name: emp.name, id: emp.id };
};
// 1. Calculate Branch Winners (All Branches) - CRITICAL: Include attendance bonus/discount
const branchWinners = {}; 
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
});
// 2. Calculate Stats & Winners (with attendance bonus/discount)
db.forEach(emp => {
const s = calcStats(emp);
const bw = branchWinners[emp.branch];
if (!bw) return;
if (s.net > bw.net.val) { bw.net.val = s.net; bw.net.ids = [s.id]; }
else if (s.net === bw.net.val) { bw.net.ids.push(s.id); }
// "الأكثر تقييماً" = Booking فقط
if (s.ev > bw.eval.val) { bw.eval.val = s.ev; bw.eval.ids = [s.id]; }
else if (s.ev === bw.eval.val) { bw.eval.ids.push(s.id); }
// Separate tracking for Booking and Google Maps
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
if (evBooking > bw.evalBooking.val) { bw.evalBooking.val = evBooking; bw.evalBooking.ids = [s.id]; }
else if (evBooking === bw.evalBooking.val) { bw.evalBooking.ids.push(s.id); }
if (evGoogle > bw.evalGoogle.val) { bw.evalGoogle.val = evGoogle; bw.evalGoogle.ids = [s.id]; }
else if (evGoogle === bw.evalGoogle.val) { bw.evalGoogle.ids.push(s.id); }
if (s.count > bw.book.val) { bw.book.val = s.count; bw.book.ids = [s.id]; }
else if (s.count === bw.book.val) { bw.book.ids.push(s.id); }
// Track most committed (attendance26Days = true)
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
if (attendance26Days === true) {
if (bw.attendance.val === -1) {
bw.attendance.val = 1;
bw.attendance.ids = [emp.id];
} else {
bw.attendance.ids.push(emp.id);
}
}
});
// 3. Calculate View Winners & Totals (with attendance bonus/discount) — للفروع فقط تُستخدم هذه الإجماليات؛ عند «الكل» الإجماليات النهائية تُحدَّث من الحلقة الرئيسية لاحقاً
let filtered = [...db];
if (currentFilter !== 'الكل') {
filtered = filtered.filter(d => d.branch === currentFilter);
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
const isMostCommitted = branchWinners[emp.branch]?.attendance.ids.includes(emp.id);
const isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
const isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
const hasCommitmentBonus = attendance26Days && isMostCommitted && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
totalNet += s.net + excellenceBonus + commitmentBonus; // Include all bonuses
totalFund += s.fund; // Add fund for total calculation
totalBookings += s.count;
if (s.net > viewWinners.net.val) { viewWinners.net.val = s.net; viewWinners.net.ids = [s.id]; }
else if (s.net === viewWinners.net.val) { viewWinners.net.ids.push(s.id); }
if (s.ev > viewWinners.eval.val) { viewWinners.eval.val = s.ev; viewWinners.eval.ids = [s.id]; }
else if (s.ev === viewWinners.eval.val) { viewWinners.eval.ids.push(s.id); }
if (s.count > viewWinners.book.val) { viewWinners.book.val = s.count; viewWinners.book.ids = [s.id]; }
else if (s.count === viewWinners.book.val) { viewWinners.book.ids.push(s.id); }
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
    const rate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
    const evBooking = branchEmp.evaluationsBooking || 0;
    const evGoogle = branchEmp.evaluationsGoogle || 0;
    aggEval += evBooking;
    aggCount += branchEmp.count || 0;
    const gross = (branchEmp.count * rate) + (evBooking * 20) + (evGoogle * 10);
    const fund = gross * 0.15;
    let branchNet = gross - fund;
    const attendance26Days = branchEmp.attendance26Days === true;
    branchNet = branchNet + (attendance26Days ? branchNet * 0.25 : 0);
    totalNetFromBranches += branchNet;
    const bw = branchWinners[branchEmp.branch];
    if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0) hasExcellence = true;
    if (bw && attendance26Days && bw.attendance.ids.includes(branchEmp.id) && (bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0 || bw.book.ids.includes(branchEmp.id) && bw.book.val > 0)) hasCommitment = true;
  });
  let aggNet = totalNetFromBranches + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
  if (typeof getTotalDiscountForEmployee === 'function') aggNet = Math.max(0, aggNet - getTotalDiscountForEmployee(emp.name));
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
if (bestAggNetName != null && bestAggNetFirstId != null) {
  viewWinners.net.val = bestAggNetVal;
  viewWinners.net.ids = [bestAggNetFirstId];
}
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
if (topEarnerNameEl) topEarnerNameEl.innerText = bestAggNetName != null ? bestAggNetName : getWinnerName(viewWinners.net);
if (topEarnerValueEl) topEarnerValueEl.innerText = viewWinners.net.val > 0 ? viewWinners.net.val.toFixed(2) + ' ريال' : '-';
const topRatedNameEl = document.getElementById('topRatedName');
const topRatedValueEl = document.getElementById('topRatedValue');
if (topRatedNameEl) topRatedNameEl.innerText = bestAggEvalName != null ? bestAggEvalName : getWinnerName(viewWinners.eval);
if (topRatedValueEl) topRatedValueEl.innerText = viewWinners.eval.val > 0 ? viewWinners.eval.val + ' تقييم' : '-';
const topBookerNameEl = document.getElementById('topBookerName');
const topBookerValueEl = document.getElementById('topBookerValue');
if (topBookerNameEl) topBookerNameEl.innerText = bestAggBookName != null ? bestAggBookName : getWinnerName(viewWinners.book);
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
// Recalculate branch winners to check for commitment bonus
const branchWinners = {}; 
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
});
// Calculate branch winners and most committed (attendance26Days = true)
db.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
// Apply attendance bonus/discount
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const attendanceBonus = attendance26Days ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
const bw = branchWinners[emp.branch];
if (!bw) return;
if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
else if (net === bw.net.val) { bw.net.ids.push(emp.id); }
if (totalEval > bw.eval.val) { bw.eval.val = totalEval; bw.eval.ids = [emp.id]; }
else if (totalEval === bw.eval.val) { bw.eval.ids.push(emp.id); }
if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
else if (emp.count === bw.book.val) { bw.book.ids.push(emp.id); }
// Track most committed (attendance26Days = true)
if (attendance26Days === true) {
if (bw.attendance.val === -1) {
bw.attendance.val = 1;
bw.attendance.ids = [emp.id];
} else {
bw.attendance.ids.push(emp.id);
}
}
});
// Find employees with commitment bonus
// Condition: Most committed (attendance26Days = true) AND (most evaluations OR most bookings) in same branch
const commitmentEmployees = [];
let totalCommitmentBonus = 0;
// Filter employees based on current filter - ONLY check employees from the selected branch
let filteredEmployees = [...db];
if (currentFilter !== 'الكل') {
filteredEmployees = filteredEmployees.filter(emp => emp.branch === currentFilter);
}
filteredEmployees.forEach(emp => {
// CRITICAL: Only check branchWinners for the CURRENT filter branch, not all branches
const targetBranch = currentFilter !== 'الكل' ? currentFilter : emp.branch;
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const isMostCommitted = branchWinners[targetBranch]?.attendance.ids.includes(emp.id);
const isMostEval = branchWinners[targetBranch]?.eval.ids.includes(emp.id) && branchWinners[targetBranch].eval.val > 0;
const isMostBook = branchWinners[targetBranch]?.book.ids.includes(emp.id) && branchWinners[targetBranch].book.val > 0;
const hasCommitmentBonus = attendance26Days && isMostCommitted && (isMostEval || isMostBook);
if (hasCommitmentBonus) {
// Determine the reason for commitment bonus
let reason = '';
if (isMostEval && isMostBook) {
reason = 'الأكثر التزاماً والأكثر تقييماً والأكثر حجوزات';
} else if (isMostEval) {
reason = 'الأكثر التزاماً والأكثر تقييماً';
} else if (isMostBook) {
reason = 'الأكثر التزاماً والأكثر حجوزات';
}
commitmentEmployees.push({ 
name: emp.name, 
branch: emp.branch,
reason: reason
});
totalCommitmentBonus += 50;
}
});
// Update commitment bonus block (صف الحوافز الموحد)
const bonusesCombinedRow = document.getElementById('bonusesCombinedRow');
const commitmentText = document.getElementById('commitmentBonusText');
const commitmentValue = document.getElementById('commitmentBonusValue');
const commitmentBlock = document.getElementById('commitmentBonusBlock');
let displayCommitmentEmployees = commitmentEmployees;
let displayCommitmentBonus = totalCommitmentBonus;
if (currentFilter !== 'الكل') {
displayCommitmentEmployees = commitmentEmployees.filter(e => e.branch === currentFilter);
displayCommitmentBonus = displayCommitmentEmployees.length * 50;
}
if (commitmentBlock) commitmentBlock.style.display = displayCommitmentEmployees.length > 0 ? '' : 'none';
if (commitmentText) {
if (displayCommitmentEmployees.length > 0) {
const employeesHtml = displayCommitmentEmployees.map(e =>
`<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-turquoise/10 border border-turquoise/30 text-turquoise" style="min-width: fit-content;"><span class="font-bold">${e.name}</span> <span class="text-turquoise/80 text-[10px]">(${e.branch})</span> <span class="text-turquoise/70 text-[10px]">- ${e.reason}</span></span>`
).join(' ');
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
// Recalculate branch winners to check for excellence bonus
const branchWinners = {}; 
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
});
// Calculate branch winners (including attendance bonus/discount)
db.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
// Apply attendance bonus/discount
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const attendanceBonus = attendance26Days ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
const bw = branchWinners[emp.branch];
if (!bw) return;
if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
else if (net === bw.net.val) { bw.net.ids.push(emp.id); }
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
else if (evBooking === bw.eval.val) { bw.eval.ids.push(emp.id); }
if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
else if (emp.count === bw.book.val) { bw.book.ids.push(emp.id); }
// Track most committed (attendance26Days = true)
if (attendance26Days === true) {
if (bw.attendance.val === -1) {
bw.attendance.val = 1;
bw.attendance.ids = [emp.id];
} else {
bw.attendance.ids.push(emp.id);
}
}
});
// Find employees with excellence bonus (most bookings + most evaluations in same branch)
const excellenceEmployees = [];
let totalExcellenceBonus = 0;
// Filter employees based on current filter - ONLY check employees from the selected branch
let filteredEmployees = [...db];
if (currentFilter !== 'الكل') {
filteredEmployees = filteredEmployees.filter(emp => emp.branch === currentFilter);
}
filteredEmployees.forEach(emp => {
// CRITICAL: Only check branchWinners for the CURRENT filter branch, not all branches
const targetBranch = currentFilter !== 'الكل' ? currentFilter : emp.branch;
const hasExcellenceBonus = branchWinners[targetBranch]?.book.ids.includes(emp.id) && 
branchWinners[targetBranch]?.eval.ids.includes(emp.id) &&
branchWinners[targetBranch].book.val > 0 && 
branchWinners[targetBranch].eval.val > 0;
if (hasExcellenceBonus) {
excellenceEmployees.push({ 
name: emp.name, 
branch: emp.branch,
reason: 'الأكثر تقييماً والأكثر حجوزات'
});
totalExcellenceBonus += 50;
}
});
// حساب commitmentEmployees داخل الدالة لاستخدامها في صف الحوافز الموحد (نفس منطق الكتلة الخارجية)
const commitmentEmployees = [];
let totalCommitmentBonus = 0;
let filteredForCommitment = [...db];
if (currentFilter !== 'الكل') filteredForCommitment = filteredForCommitment.filter(emp => emp.branch === currentFilter);
filteredForCommitment.forEach(emp => {
const targetBranch = currentFilter !== 'الكل' ? currentFilter : emp.branch;
const attendance26Days = emp.attendance26Days === true;
const isMostCommitted = branchWinners[targetBranch]?.attendance.ids.includes(emp.id);
const isMostEval = branchWinners[targetBranch]?.eval.ids.includes(emp.id) && branchWinners[targetBranch].eval.val > 0;
const isMostBook = branchWinners[targetBranch]?.book.ids.includes(emp.id) && branchWinners[targetBranch].book.val > 0;
const hasCommitmentBonus = attendance26Days && isMostCommitted && (isMostEval || isMostBook);
if (hasCommitmentBonus) {
let reason = isMostEval && isMostBook ? 'الأكثر التزاماً والأكثر تقييماً والأكثر حجوزات' : (isMostEval ? 'الأكثر التزاماً والأكثر تقييماً' : 'الأكثر التزاماً والأكثر حجوزات');
commitmentEmployees.push({ name: emp.name, branch: emp.branch, reason: reason });
totalCommitmentBonus += 50;
}
});
// Update commitment bonus block
updateCommitmentBonusRow();
// Update excellence bonus block (نفس صف الحوافز الموحد)
const excellenceText = document.getElementById('excellenceBonusText');
const excellenceValue = document.getElementById('excellenceBonusValue');
const excellenceBlock = document.getElementById('excellenceBonusBlock');
let displayExcellenceEmployees = excellenceEmployees;
let displayExcellenceBonus = totalExcellenceBonus;
if (currentFilter !== 'الكل') {
displayExcellenceEmployees = excellenceEmployees.filter(e => e.branch === currentFilter);
displayExcellenceBonus = displayExcellenceEmployees.length * 50;
}
if (excellenceBlock) excellenceBlock.style.display = displayExcellenceEmployees.length > 0 ? '' : 'none';
if (excellenceText) {
if (displayExcellenceEmployees.length > 0) {
const employeesHtml = displayExcellenceEmployees.map(e =>
`<span class="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-turquoise/10 border border-turquoise/30 text-turquoise" style="min-width: fit-content;"><span class="font-bold">${e.name}</span> <span class="text-turquoise/80 text-[10px]">(${e.branch})</span></span>`
).join(' ');
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
function renderUI(filter) {
// Update currentFilter to match the filter parameter
currentFilter = filter;

// Check role and filter restrictions
const currentRole = localStorage.getItem('adora_current_role');
// المشرف: الكل عرض فقط، التقييمات في الفروع. HR: الكل عرض فقط، تم/لم يتم وعدد الأيام للمتكرر في الفروع فقط — لا نفرض "الكل" على HR.

document.getElementById('selectAll').checked = false;
const tbody = document.getElementById('mainTable');
tbody.innerHTML = '';
// evalRateInput removed - replaced with separate Booking and Google Maps columns with fixed rates
// Update report title based on filter
updateReportTitle();
// --- 1. Pre-calculate Winners & Losers (Branch & View) ---
const branchWinners = {}; 
const branchLosers = {};
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
branchLosers[b] = { net: {val: Infinity, ids: []}, eval: {val: Infinity, ids: []}, book: {val: Infinity, ids: []} };
});
// First pass: calculate branch winners/losers without excellence bonus
db.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
const net = gross - fund;
const bw = branchWinners[emp.branch];
const bl = branchLosers[emp.branch];
if (!bw || !bl) return;
// Winners (Best) - using count and ev directly (not net, to avoid circular dependency)
if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
else if (net === bw.net.val) { bw.net.ids.push(emp.id); }
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
else if (evBooking === bw.eval.val) { bw.eval.ids.push(emp.id); }
if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
else if (emp.count === bw.book.val) { bw.book.ids.push(emp.id); }
// Track most committed (attendance26Days = true)
// For duplicate employees: use totalAttendanceDays
const empNameCount = db.filter(e => e.name === emp.name).length;
let empAttendanceDays = emp.attendance26Days === true ? 26 : 0;
if (empNameCount > 1) {
empAttendanceDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
}
if (empAttendanceDays >= 26) {
// Compare with other employees in this branch (using aggregated days for duplicates)
let isHighestDays = true;
const branchEmployees = db.filter(e => e.branch === emp.branch);
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === emp.name) return; // Skip self
const otherNameCount = db.filter(e => e.name === otherEmp.name).length;
let otherDays = otherEmp.attendance26Days === true ? 26 : 0;
if (otherNameCount > 1) {
otherDays = otherEmp.totalAttendanceDays || (otherEmp.attendance26Days === true ? 26 : 0);
}
if (otherDays > empAttendanceDays) {
isHighestDays = false;
}
});
if (isHighestDays) {
if (bw.attendance.val === -1) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [emp.id];
} else if (empAttendanceDays > bw.attendance.val) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [emp.id];
} else if (empAttendanceDays === bw.attendance.val) {
bw.attendance.ids.push(emp.id);
}
}
}
// Losers (Worst) - only if value > 0
if (net > 0 && net < bl.net.val) { bl.net.val = net; bl.net.ids = [emp.id]; }
else if (net > 0 && net === bl.net.val) { bl.net.ids.push(emp.id); }
// 0 is the worst (less than any positive number)
// Use totalEval (sum of Booking + Google Maps evaluations)
if (totalEval < bl.eval.val || (totalEval === 0 && bl.eval.val > 0)) { 
bl.eval.val = totalEval; 
bl.eval.ids = [emp.id]; 
} else if (totalEval === bl.eval.val) { 
bl.eval.ids.push(emp.id); 
}
if (emp.count > 0 && emp.count < bl.book.val) { bl.book.val = emp.count; bl.book.ids = [emp.id]; }
else if (emp.count > 0 && emp.count === bl.book.val) { bl.book.ids.push(emp.id); }
});
// --- Stats Helper (after branchWinners is calculated) ---
// Helper to calculate aggregated stats for duplicate employees
const getAggregatedStats = (empName) => {
const allEmpBranches = db.filter(e => e.name === empName);
const totalCount = allEmpBranches.reduce((sum, e) => sum + (e.count || 0), 0);
const totalEvalBooking = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsBooking || 0), 0);
const totalEvalGoogle = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsGoogle || 0), 0);
// "الأكثر تقييماً" = Booking فقط (NOT Google Maps)
const totalEval = totalEvalBooking; // Use Booking evaluations only for "الأكثر تقييماً"
// Calculate total days from attendanceDaysPerBranch (use first employee's data since all share the same object)
const firstEmp = allEmpBranches[0];
let totalDays = 0;
if (firstEmp && firstEmp.attendanceDaysPerBranch) {
totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
totalDays = firstEmp?.totalAttendanceDays || (firstEmp?.attendance26Days === true ? 26 : 0);
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
// For non-duplicate: use existing logic - "الأكثر تقييماً" = Booking فقط
isMostCommitted = branchWinners[emp.branch]?.attendance.ids.includes(emp.id);
isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
}
const hasCommitmentBonus = attendance26Days && isMostCommitted && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
// Calculate net (for this specific branch row)
// evBooking and evGoogle are already defined at the start of calcStats function
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
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
// خريطة صافي مُجمّع لكل اسم (للفرز عند عرض «الكل»)
let nameToAggNet = {};
// عند «الكل»: كروت الفائزين من إجماليات مُجمّعة لكل اسم (ليس أعلى صف فقط)
if (filter === 'الكل') {
  const nameAgg = {};
  const seenNames = new Set();
  filtered.forEach(emp => {
    if (seenNames.has(emp.name)) return;
    seenNames.add(emp.name);
    const allEmpBranches = db.filter(e => e.name === emp.name);
    let totalNetFromBranches = 0;
    let hasExcellence = false;
    let hasCommitment = false;
    allEmpBranches.forEach(branchEmp => {
      const rate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
      const evBooking = branchEmp.evaluationsBooking || 0;
      const evGoogle = branchEmp.evaluationsGoogle || 0;
      const gross = (branchEmp.count * rate) + (evBooking * 20) + (evGoogle * 10);
      const fund = gross * 0.15;
      let branchNet = gross - fund;
      const attendance26Days = branchEmp.attendance26Days === true;
      branchNet = branchNet + (attendance26Days ? branchNet * 0.25 : 0);
      totalNetFromBranches += branchNet;
      const bw = branchWinners[branchEmp.branch];
      if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0) hasExcellence = true;
      if (bw && attendance26Days && bw.attendance.ids.includes(branchEmp.id) && (bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0 || bw.book.ids.includes(branchEmp.id) && bw.book.val > 0)) hasCommitment = true;
    });
    let aggNet = totalNetFromBranches + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
    if (typeof getTotalDiscountForEmployee === 'function') aggNet = Math.max(0, aggNet - getTotalDiscountForEmployee(emp.name));
    const agg = getAggregatedStats(emp.name);
    const firstId = allEmpBranches[0].id;
    const hasAttendance26 = allEmpBranches.some(b => b.attendance26Days === true);
    nameAgg[emp.name] = { aggNet, aggEval: agg.totalEvalBooking, aggCount: agg.totalCount, totalEvalGoogle: agg.totalEvalGoogle, hasAttendance26, firstId };
  });
  Object.keys(nameAgg).forEach(n => { nameToAggNet[n] = nameAgg[n].aggNet; });
  const nameToPoints = {};
  const nameToLevel = {};
  const namesList = Object.keys(nameAgg);
  if (namesList.length > 0) {
    const minCount = Math.min(...namesList.map(n => nameAgg[n].aggCount));
    const maxCount = Math.max(...namesList.map(n => nameAgg[n].aggCount));
    const totalEvals = namesList.map(n => nameAgg[n].aggEval + (nameAgg[n].totalEvalGoogle || 0));
    const minEval = Math.min(...totalEvals);
    const maxEval = Math.max(...totalEvals);
    const maxEvalBooking = Math.max(...namesList.map(n => nameAgg[n].aggEval || 0));
    const maxEvalGoogle = Math.max(...namesList.map(n => nameAgg[n].totalEvalGoogle || 0));
    namesList.forEach(name => {
      const a = nameAgg[name];
      const count = a.aggCount || 0;
      const evalBooking = a.aggEval || 0;
      const evalGoogle = a.totalEvalGoogle || 0;
      const totalEval = evalBooking + evalGoogle;
      const has26 = !!a.hasAttendance26;
      const rangeCount = maxCount - minCount;
      const rangeEval = maxEval - minEval;
      const pctCount = rangeCount <= 0 ? 0.5 : (count - minCount) / rangeCount;
      const pctEval = rangeEval <= 0 ? 0.5 : (totalEval - minEval) / rangeEval;
      const combined = (pctCount + pctEval) / 2;
      const boost = has26 ? 0.15 : 0;
      let score = Math.min(1, combined + boost);
      if (typeof getTotalDiscountForEmployee === 'function' && getTotalDiscountForEmployee(name) > 0) score = Math.max(0, score - 0.25);
      const points = Math.round(score * 100);
      let level = 'سيء';
      if (points >= 90) level = 'ممتاز';
      else if (points >= 80) level = 'جيد';
      else if (points >= 60) level = 'متوسط';
      else if (points >= 40) level = 'ضعيف';
      nameToPoints[name] = points;
      nameToLevel[name] = level;
    });
  }
  let bestNetName = null, bestEvalName = null, bestBookName = null;
  let bestNetVal = -1, bestEvalVal = -1, bestBookVal = -1;
  Object.keys(nameAgg).forEach(name => {
    const a = nameAgg[name];
    if (a.aggNet > bestNetVal) { bestNetVal = a.aggNet; bestNetName = name; }
    if (a.aggEval > bestEvalVal) { bestEvalVal = a.aggEval; bestEvalName = name; }
    if (a.aggCount > bestBookVal) { bestBookVal = a.aggCount; bestBookName = name; }
  });
  if (bestNetName != null) { viewWinners.net.val = bestNetVal; viewWinners.net.ids = [nameAgg[bestNetName].firstId]; }
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
// Apply Sort — عند «الكل» الفرز بالصافي المُجمّع للموظف (من كل الفروع)، وإلا صافي الفرع
filtered.sort((a, b) => {
let valA, valB;
if (currentSort.key === 'net') {
  if (filter === 'الكل' && nameToAggNet[a.name] != null && nameToAggNet[b.name] != null) {
    valA = nameToAggNet[a.name];
    valB = nameToAggNet[b.name];
  } else {
    valA = calcStats(a).net;
    valB = calcStats(b).net;
  }
} else if (currentSort.key === 'evaluations') {
valA = a.evaluations || 0;
valB = b.evaluations || 0;
} else if (currentSort.key === 'name') {
valA = a.name;
valB = b.name;
} else {
valA = a[currentSort.key];
valB = b[currentSort.key];
}
if (currentSort.key === 'name') {
return currentSort.order === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
}
const cmp = currentSort.order === 'asc' ? valA - valB : valB - valA;
if (currentSort.key === 'net' && cmp === 0) return a.name.localeCompare(b.name, 'ar');
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
// Increment display index for visible rows
displayIndex++;
totalNetNoEval += (emp.count * (emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1))) * 0.85;
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
// Sum net from each branch (each branch's net already includes attendance bonus)
let totalNetFromBranches = 0;
let totalFundFromBranches = 0;
allEmpBranches.forEach(branchEmp => {
// Calculate net for this branch (same as calcStats but for this specific branch)
const branchRate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
const branchEvBooking = branchEmp.evaluationsBooking || 0;
const branchEvGoogle = branchEmp.evaluationsGoogle || 0;
const branchGross = (branchEmp.count * branchRate) + (branchEvBooking * 20) + (branchEvGoogle * 10);
const branchFund = branchGross * 0.15;
let branchNet = branchGross - branchFund;
// Add attendance bonus for this branch if applicable
const branchAttendance26Days = branchEmp.attendance26Days === true;
const branchAttendanceBonus = branchAttendance26Days ? branchNet * 0.25 : 0;
branchNet = branchNet + branchAttendanceBonus;
totalNetFromBranches += branchNet;
totalFundFromBranches += branchFund;
});
// Add fund to totalFund (sum from all branches)
totalFund += totalFundFromBranches;
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
// Apply discounts for duplicate employees (apply to this branch's net only)
if (typeof getDiscountForEmployeeInBranch === 'function') {
  const employeeDiscount = getDiscountForEmployeeInBranch(emp.name, s.net + finalAttendanceBonus);
  duplicateFinalNet = Math.max(0, duplicateFinalNet - employeeDiscount);
}
}
totalNet += duplicateFinalNet;
} else {
// For non-duplicate: apply bonus normally
totalFund += s.fund; // Add fund for non-duplicate employees
let nonDuplicateFinalNet = s.net + s.excellenceBonus + s.commitmentBonus;
// Apply discounts for non-duplicate employees (apply to this branch's net only)
if (typeof getDiscountForEmployeeInBranch === 'function') {
  const employeeDiscount = getDiscountForEmployeeInBranch(emp.name, s.net);
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
<td class="col-m p-2 text-right text-gray-400 text-sm font-semibold">
${displayIndex + 1}
</td>
<td class="col-name p-2 text-right">
${(isDuplicate && filter === 'الكل') ? `
<div style="text-align: right; direction: rtl;">
<div class="font-bold text-base text-orange-100 print:text-black" style="text-align: right; direction: rtl;">
<span onclick="${filter === 'الكل' ? `handleEmployeeNameClick('${emp.name}', '${emp.id}', true)` : `showEmployeeReport('${emp.id}')`}" class="cursor-pointer hover:text-turquoise transition-colors" title="اضغط لعرض التقرير">${emp.name}</span>
<span class="badges-wrapper" style="display: inline-block; margin-right: 4px;">
${(() => {
let badgesHtml = '';
const allEmpBranches = db.filter(d => d.name === emp.name);
if (filter === 'الكل' && typeof nameToPoints !== 'undefined' && nameToPoints[emp.name] != null) {
const pts = nameToPoints[emp.name];
const lvl = nameToLevel[emp.name];
const barPct = Math.min(100, Math.max(0, pts));
const ratingColor = pts >= 80 ? 'text-green-400' : pts >= 60 ? 'text-yellow-400' : pts >= 40 ? 'text-orange-400' : 'text-red-400';
return '<div class="mt-1.5 w-full max-w-[180px] rounded-full overflow-hidden relative" style="height: 6px;"><div style="position: absolute; inset: 0; background: #4b5563;"></div><div style="position: absolute; left: 0; top: 0; width: ' + barPct + '%; height: 100%; background: linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e 100%);"></div><span style="position: absolute; left: ' + barPct + '%; top: 0; transform: translateX(-50%); width: 4px; height: 100%; background: #fff; border-radius: 2px; box-shadow: 0 0 2px rgba(0,0,0,0.5);"></span></div><div class="flex flex-col items-start gap-0.5 mt-1"><span class="font-bold ' + ratingColor + ' tabular-nums text-sm">' + pts + ' نقطة</span><div class="text-xs font-semibold ' + ratingColor + '">' + lvl + '</div></div>';
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
<div class="font-bold text-base text-white print:text-black" style="text-align: right; direction: rtl;">
<span onclick="${filter === 'الكل' ? `handleEmployeeNameClick('${emp.name}', '${emp.id}', false)` : `showEmployeeReport('${emp.id}')`}" class="cursor-pointer hover:text-turquoise transition-colors" title="اضغط لعرض التقرير">${emp.name}</span>
</div>
${showBranch && !isDuplicate ? `
<div class="text-[10px] text-turquoise/60 font-semibold uppercase no-print mt-0.5 tracking-wider">
${emp.branch}
</div>
` : ''}
`}
</td>
<td class="col-count p-2 text-center font-black text-white print:text-black text-lg number-display">
${(filter === 'الكل' && isDuplicate) ? (s.aggregatedCount || emp.count) : emp.count}
</td>
<td class="col-attendance p-2 text-center${(() => { try { var r = localStorage.getItem('adora_current_role'); return (r === 'hr') ? ' admin-entry-zone admin-entry-hr' : ''; } catch(e) { return ''; } })()}">
<div class="flex flex-col items-center gap-1">
<div class="attendance-readonly-accounting flex flex-col items-center gap-1" style="display:none;">${(() => { const allEb = db.filter(e => e.name === emp.name); const isDup = filter === 'الكل' && allEb.length > 1; let days = 0, totalDays = 0, branchDaysStr = (emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[emp.branch]) || '0'; if (isDup && filter === 'الكل') { totalDays = allEb.reduce((s, eb) => s + (parseInt(eb.attendanceDaysPerBranch && eb.attendanceDaysPerBranch[eb.branch]) || 0), 0); days = totalDays; } else { days = parseInt(branchDaysStr) || 0; } const colorClass = days >= 26 ? 'text-green-400' : 'text-red-400'; const statusText = days >= 26 ? 'تم' : 'لم يتم'; const daysSpan = days < 26 ? '<span class="text-yellow-300 text-sm font-bold">' + days + ' يوم</span>' : ''; const totalSpan = (isDup && filter === 'الكل') ? '<div class="text-[9px] text-green-400 font-bold">المجموع: ' + totalDays + '</div>' : (!isDup ? '<span class="text-[10px] text-yellow-300">' + emp.branch + ': ' + branchDaysStr + '</span>' : ''); return '<span class="text-[10px] font-bold ' + colorClass + '">' + statusText + '</span>' + daysSpan + totalSpan; })()}</div>
<div class="attendance-editable">
<div class="attendance-indicator">
<label class="relative inline-flex items-center" style="flex-direction: row-reverse; justify-content: center; gap: 6px; ${(() => {
const rr = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
const canEditAttendance = rr === 'hr' || rr === 'admin';
// الكل للعرض فقط — لا تعديل (المشرف وHR يدخلون من الفروع فقط)
if (filter === 'الكل') {
  return 'cursor: default;';
}
// In branch views: check if employee is duplicate
const allEmpBranches = db.filter(e => e.name === emp.name);
const isEmpDuplicate = allEmpBranches.length > 1;
return isEmpDuplicate ? 'cursor: default;' : 'cursor: pointer;';
})()}">
<input type="checkbox" 
class="attendance-toggle" 
data-emp-id="${emp.id}"
${(() => {
// For duplicates in "الكل" view: use aggregated days to determine status
if (filter === 'الكل' && isDuplicate) {
const allEmpBranches = db.filter(e => e.name === emp.name);
const firstEmp = allEmpBranches[0];
let totalDays = 0;
if (firstEmp && firstEmp.attendanceDaysPerBranch) {
totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
totalDays = firstEmp?.totalAttendanceDays || 0;
}
return totalDays >= 26 ? 'checked' : '';
}
// For non-duplicates in "الكل": use employee's own status
if (filter === 'الكل') {
return (emp.attendance26Days === true) ? 'checked' : '';
}
// For branch views: use employee's own status
return (emp.attendance26Days === true) ? 'checked' : '';
})()}
${(() => {
const currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'hr' && currentRole !== 'admin') return 'disabled';
// الكل للعرض والتجميع فقط — لا تعديل لأي أحد (بما فيه الأدمن)
if (filter === 'الكل') return 'disabled';
return '';
})()}
${(() => {
// الكل: لا onchange — التعديل في الفروع فقط
if (filter === 'الكل') return '';
const currentRole = localStorage.getItem('adora_current_role');
if (currentRole && currentRole !== 'hr' && currentRole !== 'admin') return '';
return 'onchange="updateAttendance(\'' + emp.id + '\', this.checked, this)"';
})()}
title="${(() => {
// الكل للعرض فقط للجميع
if (filter === 'الكل') return 'للقراءة فقط — التعديل في الفرع';
return 'تفعيل/إلغاء تفعيل إتمام 26 يوم دوام';
})()}">
<div></div>
<span class="text-[10px] font-bold ${(() => {
// For duplicates in "الكل" view: use aggregated days to determine status
if (filter === 'الكل' && isDuplicate) {
const allEmpBranches = db.filter(e => e.name === emp.name);
const firstEmp = allEmpBranches[0];
let totalDays = 0;
if (firstEmp && firstEmp.attendanceDaysPerBranch) {
totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
totalDays = firstEmp?.totalAttendanceDays || 0;
}
return totalDays >= 26 ? 'text-green-400' : 'text-red-400';
}
// For non-duplicates in "الكل": use employee's own status
if (filter === 'الكل') {
return emp.attendance26Days === true ? 'text-green-400' : 'text-red-400';
}
// For branch views: use employee's own status
return emp.attendance26Days === true ? 'text-green-400' : 'text-red-400';
})()} print:text-[9px] print:font-black">
${(() => {
// For duplicates in "الكل" view: use aggregated days to determine status
if (filter === 'الكل' && isDuplicate) {
const allEmpBranches = db.filter(e => e.name === emp.name);
const firstEmp = allEmpBranches[0];
let totalDays = 0;
if (firstEmp && firstEmp.attendanceDaysPerBranch) {
totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
totalDays = firstEmp?.totalAttendanceDays || 0;
}
return totalDays >= 26 ? 'تم' : 'لم يتم';
}
// For non-duplicates in "الكل": use employee's own status
if (filter === 'الكل') {
return emp.attendance26Days === true ? 'تم' : 'لم يتم';
}
// For branch views: use employee's own status
return emp.attendance26Days === true ? 'تم' : 'لم يتم';
})()}
</span>
</label>
</div>
${(function() {
// Check if employee is duplicate (exists in multiple branches)
const allEmpBranches = db.filter(function(e) { return e.name === emp.name; });
const isDuplicate = allEmpBranches.length > 1;
const roleForHr = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
const canEditHr = roleForHr === 'hr' || roleForHr === 'admin';
// الكل للعرض فقط — لا حقل إدخال لأيام الحضور في "الكل" (التعديل في الفروع)
if (!isDuplicate && filter === 'الكل') return '';
// غير متكرر في عرض الفرع: حقل أيام البصمة — HR وأدمن (خانات إدخال نشطة لجميع الموظفين في الفروع)
if (!isDuplicate && filter !== 'الكل') {
var bName = emp.branch;
var bDays = (emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[bName]) || '';
var en = (emp.name || '').replace(/'/g, "\\'");
var bn = (bName || '').replace(/'/g, "\\'");
var roleForReadOnly = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
var readOnly = roleForReadOnly && roleForReadOnly !== 'hr' && roleForReadOnly !== 'admin';
if (readOnly) {
return '<div class="flex items-center justify-center gap-1.5 mt-1">' +
'<span class="text-[10px] text-yellow-300 font-semibold">' + bName + ':</span>' +
'<span class="text-yellow-300 font-bold text-sm">' + bDays + '</span></div>';
}
return '<div class="flex items-center justify-center gap-1.5 mt-1">' +
'<span class="text-[10px] text-yellow-300 font-semibold">' + bName + ':</span>' +
'<input type="text" class="attendance-days-input w-16 bg-yellow-400/10 border-2 border-yellow-400/60 rounded px-2 py-1 text-center text-sm text-yellow-300 font-bold focus:outline-none focus:border-yellow-400 focus:bg-yellow-400/20 transition-all font-sans" ' +
'data-emp-name="' + (emp.name || '').replace(/"/g, '&quot;') + '" data-emp-branch="' + (bName || '').replace(/"/g, '&quot;') + '" placeholder="0" value="' + bDays + '" ' +
'oninput="handleAttendanceDaysInputSingle(this, \'' + en + '\', \'' + bn + '\')" onblur="handleAttendanceDaysBlur(this, \'' + en + '\', \'' + bn + '\')" ' +
'onkeydown="if(event.key === \'Enter\') { this.blur(); }" title="أيام الحضور في ' + bName + ' (أدخل أي رقم: 8، 22، 30، إلخ)">' +
'</div>';
}
if (!isDuplicate) return '';
let inputsHtml = '';
if (filter === 'الكل') {
const totalDays = allEmpBranches.reduce(function(sum, eb) {
const days = eb.attendanceDaysPerBranch && eb.attendanceDaysPerBranch[eb.branch] ? parseInt(eb.attendanceDaysPerBranch[eb.branch]) || 0 : 0;
return sum + days;
}, 0);
// الكل للعرض فقط — عرض المجموع فقط بدون حقول إدخال (التعديل في الفروع)
inputsHtml += '<div class="text-[9px] text-green-400 font-bold">المجموع: ' + totalDays + '</div>';
} else {
// In branch view: show only current branch input (editable)
const branchDays = emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[emp.branch] 
? emp.attendanceDaysPerBranch[emp.branch] 
: '';
const branchNameForInput = emp.branch;
const empNameForInput = emp.name;
const currentRole = localStorage.getItem('adora_current_role');
const isReadOnly = currentRole && currentRole !== 'hr' && currentRole !== 'admin';
if (isReadOnly) {
  inputsHtml += '<div class="flex items-center justify-center gap-1.5 mt-1">' +
  '<span class="text-[10px] text-yellow-300 font-semibold">' + branchNameForInput + ':</span>' +
  '<span class="text-yellow-300 font-bold text-sm">' + branchDays + '</span>' +
  '</div>';
} else {
  inputsHtml += '<div class="flex items-center justify-center gap-1.5 mt-1">' +
  '<span class="text-[10px] text-yellow-300 font-semibold">' + branchNameForInput + ':</span>' +
  '<input type="text" ' +
  'class="attendance-days-input w-16 bg-yellow-400/10 border-2 border-yellow-400/60 rounded px-2 py-1 text-center text-sm text-yellow-300 font-bold focus:outline-none focus:border-yellow-400 focus:bg-yellow-400/20 transition-all font-sans" ' +
  'data-emp-name="' + empNameForInput + '" ' +
  'data-emp-branch="' + branchNameForInput + '" ' +
  'placeholder="0" ' +
  'value="' + branchDays + '" ' +
  'oninput="handleAttendanceDaysInputSingle(this, \'' + empNameForInput + '\', \'' + branchNameForInput + '\')" ' +
  'onblur="handleAttendanceDaysBlur(this, \'' + empNameForInput + '\', \'' + branchNameForInput + '\')" ' +
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
<td class="col-rate p-2 text-center text-xs text-gray-300 print:text-black font-medium">
${(emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1))} ريال
</td>
<td class="col-eval-booking p-2 text-center${(() => { try { var r = localStorage.getItem('adora_current_role'); return (r === 'supervisor' && filter !== 'الكل') ? ' admin-entry-zone admin-entry-supervisor' : ''; } catch(e) { return ''; } })()}">
${(() => {
  const currentRole = localStorage.getItem('adora_current_role');
  const viewOnlyAll = (filter === 'الكل');
  const isReadOnly = viewOnlyAll || (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin');
  if (isReadOnly) {
    return `<span class="text-blue-400 font-bold text-base number-display">${isDuplicate ? (s.aggregatedEvalBooking || emp.evaluationsBooking || 0) : (emp.evaluationsBooking || 0)}</span>`;
  }
  return `<input type="text" inputmode="numeric" pattern="[0-9]*" lang="en" dir="ltr"
value="${emp.evaluationsBooking || ''}" placeholder="0"
oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateEvalBooking('${emp.id}', this.value, this, false)"
onblur="updateEvalBooking('${emp.id}', this.value, this, true)"
onkeydown="handleEvalKey(event, this)"
class="eval-input text-blue-400 w-16 bg-white/5 border border-blue-400/50 rounded px-2 py-1 text-center focus:outline-none focus:border-blue-400 transition-colors number-display font-sans">`;
})()}
</td>
<td class="col-eval-google p-2 text-center${(() => { try { var r = localStorage.getItem('adora_current_role'); return (r === 'supervisor' && filter !== 'الكل') ? ' admin-entry-zone admin-entry-supervisor' : ''; } catch(e) { return ''; } })()}">
${(() => {
  const currentRole = localStorage.getItem('adora_current_role');
  const viewOnlyAll = (filter === 'الكل');
  const isReadOnly = viewOnlyAll || (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin');
  if (isReadOnly) {
    return `<span class="text-green-400 font-bold text-base number-display">${isDuplicate ? (s.aggregatedEvalGoogle || emp.evaluationsGoogle || 0) : (emp.evaluationsGoogle || 0)}</span>`;
  }
  return `<input type="text" inputmode="numeric" pattern="[0-9]*" lang="en" dir="ltr"
value="${emp.evaluationsGoogle || ''}" placeholder="0"
oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateEvalGoogle('${emp.id}', this.value, this, false)"
onblur="updateEvalGoogle('${emp.id}', this.value, this, true)"
onkeydown="handleEvalKey(event, this)"
class="eval-input text-green-400 w-16 bg-white/5 border border-green-400/50 rounded px-2 py-1 text-center focus:outline-none focus:border-green-400 transition-colors number-display font-sans">`;
})()}
</td>
<td class="col-net p-2 text-left font-black px-4 print:text-black text-xl number-display ${s.attendanceBonus > 0 ? 'text-white bg-green-500/[0.08]' : (s.hasCommitmentBonus ? 'text-white bg-purple-500/[0.08]' : (s.hasExcellenceBonus ? 'text-white bg-turquoise/[0.08]' : 'text-white bg-turquoise/[0.08]'))}">
${(() => {
let display = '';
// For duplicates in "الكل" view: sum net from all branches instead of recalculating
let baseNet, finalNet, aggAttendanceBonus = 0;
if (filter === 'الكل' && isDuplicate) {
// Get all branches for this employee — نفس منطق nameAgg ليتطابق الكارد مع الجدول
const allEmpBranches = db.filter(e => e.name === emp.name);
let totalNetFromBranches = 0;
let totalAttendanceBonus = 0;
let hasExcellence = false;
let hasCommitment = false;
allEmpBranches.forEach(branchEmp => {
const branchRate = branchEmp.count > 100 ? 3 : (branchEmp.count > 50 ? 2 : 1);
const branchEvBooking = branchEmp.evaluationsBooking || 0;
const branchEvGoogle = branchEmp.evaluationsGoogle || 0;
const branchGross = (branchEmp.count * branchRate) + (branchEvBooking * 20) + (branchEvGoogle * 10);
const branchFund = branchGross * 0.15;
let branchNet = branchGross - branchFund;
const branchAttendance26Days = branchEmp.attendance26Days === true;
const branchAttendanceBonus = branchAttendance26Days ? branchNet * 0.25 : 0;
branchNet = branchNet + branchAttendanceBonus;
totalNetFromBranches += branchNet;
totalAttendanceBonus += branchAttendanceBonus;
const bw = branchWinners[branchEmp.branch];
if (bw && bw.book.ids.includes(branchEmp.id) && bw.eval.ids.includes(branchEmp.id) && bw.book.val > 0) hasExcellence = true;
if (bw && branchAttendance26Days && bw.attendance.ids.includes(branchEmp.id) && (bw.eval.ids.includes(branchEmp.id) && bw.eval.val > 0 || bw.book.ids.includes(branchEmp.id) && bw.book.val > 0)) hasCommitment = true;
});
baseNet = totalNetFromBranches;
aggAttendanceBonus = totalAttendanceBonus;
// حوافز من أي فرع (مطابق لـ nameAgg وكارت «أعلى صافي»)
finalNet = baseNet + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
} else {
// baseNet هو الصافي بعد attendance bonus/discount (بدون الحوافز)
baseNet = s.net; // s.net يتضمن attendance bonus/discount فقط
// Calculate final net including all bonuses (excellence + commitment)
finalNet = baseNet + s.excellenceBonus + s.commitmentBonus;
}
// Apply discounts (if function exists)
let totalDiscountAmount = 0;
if (typeof getDiscountForEmployeeInBranch === 'function' && typeof getTotalDiscountForEmployee === 'function') {
  if (filter === 'الكل' && isDuplicate) {
    // For duplicates in "الكل" view: calculate total discount from all branches
    totalDiscountAmount = getTotalDiscountForEmployee(emp.name);
  } else {
    // For non-duplicates or branch view: apply discount to this branch's net only
    totalDiscountAmount = getDiscountForEmployeeInBranch(emp.name, baseNet);
  }
  finalNet = Math.max(0, finalNet - totalDiscountAmount); // Ensure net doesn't go below 0
}
// الصافي الأبيض يجب أن يتضمن الحوافز مباشرة
// Show final net (white) - الرقم الأبيض فقط بدون إضافات (الإضافات موجودة في تقرير الموظف)
display = `<span class="text-white print:text-black font-black">${finalNet.toFixed(2)}</span>`;
return display;
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
return '<tr class="badges-row" data-emp-id="' + (emp.id || '').replace(/"/g, '&quot;') + '" data-branch="' + (emp.branch || '').replace(/"/g, '&quot;') + '" style="background-color: rgba(255, 255, 255, 0.02);"><td class="col-name p-2" colspan="8" style="padding-right: 16px; padding-top: 4px; padding-bottom: 4px;"><div class="badges-wrapper flex flex-wrap gap-2 items-center" style="direction: rtl; text-align: right;">' + badgesHtml + '</div></td></tr>';
}
return '';
})()}
`);
});
// رسم الجدول تدريجياً (chunked) لتقليل تجميد الواجهة عند عدد كبير من الموظفين
var RENDER_CHUNK_SIZE = 14;
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
function runAfterTableRender() {
// Update Excellence Bonus (صف الحوافز الموحد)
const bonusesRow = document.getElementById('bonusesCombinedRow');
const excellenceText = document.getElementById('excellenceBonusText');
const excellenceValue = document.getElementById('excellenceBonusValue');
const excellenceBlock = document.getElementById('excellenceBonusBlock');
if (excellenceEmployees.length > 0) {
if (bonusesRow) bonusesRow.style.display = 'table-row';
if (excellenceBlock) excellenceBlock.style.display = '';
if (excellenceText) {
const names = excellenceEmployees.map(e => `${e.name} (${e.branch})`).join(' - ');
excellenceText.innerHTML = names;
}
if (excellenceValue) excellenceValue.innerText = `+${totalExcellenceBonus.toFixed(2)}`;
} else {
if (excellenceBlock) excellenceBlock.style.display = 'none';
}
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
// Calculate totals
let totalFund = 0, totalNet = 0, totalEval = 0, totalBookings = 0, totalNetNoEval = 0;
let totalExcellenceBonus = 0, totalCommitmentBonus = 0;
const branchWinners = {};
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
});
// Calculate branch winners
db.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
const attendance26Days = emp.attendance26Days === true;
const attendanceBonus = attendance26Days ? net * 0.25 : 0;
net = net + attendanceBonus;
const bw = branchWinners[emp.branch];
if (bw) {
if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
else if (net === bw.net.val) { bw.net.ids.push(emp.id); }
if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
else if (evBooking === bw.eval.val) { bw.eval.ids.push(emp.id); }
if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
else if (emp.count === bw.book.val) { bw.book.ids.push(emp.id); }
if (attendance26Days) {
if (bw.attendance.val === -1) { bw.attendance.val = 1; bw.attendance.ids = [emp.id]; }
else { bw.attendance.ids.push(emp.id); }
}
}
});
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
isMostCommitted = branchWinners[emp.branch]?.attendance.ids.includes(emp.id);
isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
}
const hasCommitmentBonus = attendance26Days && isMostCommitted && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
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
// Process employees for print
const printRows = [];
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
// Apply discounts (apply to this branch's net only)
let totalDiscountAmount = 0;
let discountDetails = [];
if (typeof getDiscountForEmployeeInBranch === 'function') {
  // Calculate base net for this branch (before bonuses)
  const branchBaseNet = s.net; // s.net already includes attendance bonus
  totalDiscountAmount = getDiscountForEmployeeInBranch(s.name, branchBaseNet);
  finalNet = Math.max(0, finalNet - totalDiscountAmount);
}
if (typeof getDiscountDetailsForEmployee === 'function') {
  discountDetails = getDiscountDetailsForEmployee(s.name);
}
// Badges
const badges = [];
if (finalExcellenceBonus > 0) badges.push('حافز التفوق');
if (finalCommitmentBonus > 0) badges.push('حافز الالتزام');
if (finalAttendance26Days) badges.push('بطل تحدي الظروف');
if (totalDiscountAmount > 0) {
  discountDetails.forEach(d => badges.push(`خصم ${d.discountPercentage}% (${d.discountType})`));
}
totalFund += s.fund;
totalNet += finalNet;
totalEval += s.evBooking + s.evGoogle;
totalBookings += s.count;
totalNetNoEval += (s.count * (s.count > 100 ? 3 : (s.count > 50 ? 2 : 1))) * 0.85;
totalExcellenceBonus += finalExcellenceBonus;
totalCommitmentBonus += finalCommitmentBonus;
// Generate detailed explanation for this employee
const explanations = [];
if (finalAttendanceBonus > 0) {
explanations.push(`حافز تحدي الظروف (25%): +${finalAttendanceBonus.toFixed(2)} ريال`);
}
if (finalExcellenceBonus > 0) {
const isMostEval = branchWinners[s.branch]?.eval.ids.includes(s.id) && branchWinners[s.branch].eval.val > 0;
const isMostBook = branchWinners[s.branch]?.book.ids.includes(s.id) && branchWinners[s.branch].book.val > 0;
if (isMostEval && isMostBook) {
explanations.push(`حافز التفوق (الأعلى تقييماً والأكثر حجوزات): +${finalExcellenceBonus.toFixed(2)} ريال`);
}
}
if (finalCommitmentBonus > 0) {
const isMostCommitted = branchWinners[s.branch]?.attendance.ids.includes(s.id);
const isMostEval = branchWinners[s.branch]?.eval.ids.includes(s.id) && branchWinners[s.branch].eval.val > 0;
const isMostBook = branchWinners[s.branch]?.book.ids.includes(s.id) && branchWinners[s.branch].book.val > 0;
if (isMostCommitted && (isMostEval || isMostBook)) {
explanations.push(`حافز الالتزام (الأكثر التزاماً + ${isMostEval ? 'الأعلى تقييماً' : 'الأكثر حجوزات'}): +${finalCommitmentBonus.toFixed(2)} ريال`);
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
// Validate that we have employees to print
if (printRows.length === 0) {
alert('لا توجد بيانات للطباعة. يرجى التأكد من تحديد الموظفين بشكل صحيح.');
return;
}

// Generate HTML — عند طباعة الكل تكون الصفحة بالعرض (landscape)
const printWindow = window.open('', '_blank');
const reportTitle = filter === 'الكل' ? 'جميع الفروع' : filter;
const useLandscape = !onlySelected && filter === 'الكل';
const printContent = generatePrintHTML(reportTitle, periodText, reportDate, printRows, {
totalFund, totalNet, totalEval, totalBookings, totalNetNoEval,
totalExcellenceBonus, totalCommitmentBonus
}, useLandscape);
printWindow.document.write(printContent);
printWindow.document.close();
setTimeout(() => {
printWindow.print();
}, 250);
}
function generatePrintHTML(reportTitle, periodText, reportDate, rows, totals, useLandscape) {
const pageOrientation = (useLandscape === true) ? 'landscape' : 'portrait';
return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير المكافآت - ${reportTitle}</title>
<style>
@page {
size: A4 ${pageOrientation};
margin: 15mm 10mm;
}
* {
margin: 0;
padding: 0;
box-sizing: border-box;
}
body {
font-family: 'IBM Plex Sans Arabic', 'Arial', sans-serif;
direction: rtl;
background: white;
color: #000;
padding: 0;
font-size: 11px;
line-height: 1.4;
}
.header {
border-bottom: 4px solid #40E0D0;
padding-bottom: 15px;
margin-bottom: 20px;
text-align: center;
}
.header h1 {
font-size: 24px;
font-weight: 900;
color: #000;
margin-bottom: 8px;
}
.header h2 {
font-size: 18px;
font-weight: 700;
color: #333;
margin-bottom: 5px;
}
.header .info {
font-size: 12px;
color: #666;
margin-top: 10px;
display: flex;
justify-content: space-between;
align-items: center;
}
table {
width: 100%;
border-collapse: collapse;
margin: 15px 0;
font-size: 10px;
page-break-inside: auto;
}
thead {
background: #f8f9fa;
border-bottom: 3px solid #40E0D0;
}
thead th {
padding: 10px 6px;
text-align: center;
font-weight: 800;
font-size: 11px;
color: #000;
border: 1px solid #ddd;
background: #e8f4f8;
}
tbody tr {
border-bottom: 1px solid #e0e0e0;
page-break-inside: avoid;
}
tbody tr:nth-child(even) {
background: #f9f9f9;
}
tbody td {
padding: 8px 6px;
text-align: center;
border: 1px solid #e0e0e0;
font-size: 10px;
vertical-align: middle;
}
td.name-col {
text-align: right;
font-weight: 700;
padding-right: 10px;
}
td.branch-col {
text-align: center;
color: #555;
font-size: 9px;
}
td.badge-col {
text-align: right;
padding-right: 8px;
font-size: 8px;
}
td.badge-col span {
display: inline-block;
background: #e8f4f8;
color: #0066cc;
padding: 2px 6px;
margin: 2px;
border-radius: 3px;
font-weight: 600;
}
td.number-col {
font-weight: 700;
font-family: 'Courier New', monospace;
}
td.bonus-col {
color: #006400;
font-weight: 800;
}
tfoot {
background: #f0f0f0;
border-top: 3px solid #40E0D0;
}
tfoot tr.summary-row {
background: #e8f4f8;
font-weight: 800;
}
tfoot td {
padding: 12px 8px;
font-size: 11px;
font-weight: 900;
border: 2px solid #40E0D0;
text-align: center;
}
tfoot td.label-col {
text-align: right;
padding-right: 15px;
font-size: 12px;
}
.footer {
margin-top: 30px;
padding-top: 15px;
border-top: 2px solid #ddd;
text-align: center;
font-size: 10px;
color: #666;
}
/* ختم واحد فقط في آخر الجدول — لا position:fixed لئلا يتكرر في كل صفحة */
.approval-stamp-inline {
display: inline-flex;
flex-direction: column;
justify-content: center;
align-items: center;
width: 90px;
padding: 8px 10px;
border: 2px solid #8b0000;
border-radius: 50%;
background: rgba(255,255,255,0.98);
box-shadow: 0 1px 3px rgba(0,0,0,0.15);
text-align: center;
}
.approval-stamp-inline .checkmark { display: block; color: #006400; font-size: 16px; font-weight: 900; margin-bottom: 2px; }
.approval-stamp-inline .dept { display: block; color: #8b0000; font-size: 9px; font-weight: 700; }
.approval-stamp-inline .approv { display: block; color: #8b0000; font-size: 10px; font-weight: 800; }
@media print {
body { margin: 0; padding: 0; }
}
</style>
</head>
<body>
<div class="header">
<h1>فندق إليت <span style="color: #40E0D0;">Elite Hotel</span></h1>
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
<th style="width: 7%;">العقود</th>
<th style="width: 7%;">التقييمات</th>
<th style="width: 9%;">الإجمالي</th>
<th style="width: 9%;">مساهمة شركاء النجاح</th>
<th style="width: 9%;">الصافي</th>
<th style="width: 10%;">الحوافز</th>
<th style="width: 10%;">الإجمالي النهائي</th>
<th style="width: 10%;">الملاحظات</th>
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
    bonuses.push(`-${(row.finalNet / (1 - d.discountPercentage / 100) * (d.discountPercentage / 100)).toFixed(2)} (${d.discountPercentage}% ${d.discountType} - مطبق من ${appliedByLabel})`);
  });
}
const bonusesText = bonuses.length > 0 ? bonuses.join('<br>') : '-';
return `<tr>
<td class="number-col">${index + 1}</td>
<td class="name-col">${row.name}</td>
<td class="branch-col">${row.branch}</td>
<td class="number-col">${row.count}</td>
<td class="number-col">${row.evBooking + row.evGoogle}</td>
<td class="number-col">${row.gross.toFixed(2)}</td>
<td class="number-col">${row.fund.toFixed(2)}</td>
<td class="number-col">${row.net.toFixed(2)}</td>
<td class="bonus-col" style="font-size: 8px;">${bonusesText}</td>
<td class="number-col" style="color: #006400; font-size: 11px;">${row.finalNet.toFixed(2)}</td>
<td class="badge-col">${badgesHtml}</td>
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

if (count > 0) baseParts.push(`${count} حجوزات × ${rate}`);
if (evBooking > 0) baseParts.push(`${evBooking} تقييم بوكينج × 20`);
if (evGoogle > 0) baseParts.push(`${evGoogle} تقييم جوجل × 10`);

if (baseParts.length > 0) {
  explanation += baseParts.join(' + ');
  const grossAmount = (count * rate) + (evBooking * 20) + (evGoogle * 10);
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
  explanation += ` + حافز التفوق ${excellenceBonus.toFixed(2)} ريال`;
}

// Add commitment bonus
const commitmentBonus = row.commitmentBonus || 0;
if (commitmentBonus > 0) {
  explanation += ` + حافز الالتزام ${commitmentBonus.toFixed(2)} ريال`;
}

// Subtract discounts
const totalDiscountAmount = row.totalDiscountAmount || 0;
if (totalDiscountAmount > 0 && row.discountDetails && Array.isArray(row.discountDetails)) {
  // Discount is calculated from row.net (net after attendance bonus, before excellence/commitment bonuses)
  const netForDiscount = row.net || 0;
  row.discountDetails.forEach(d => {
    const discountAmount = (netForDiscount * (d.discountPercentage / 100));
    const eventDate = d.eventDate ? new Date(d.eventDate + 'T00:00:00').toLocaleDateString('ar-SA') : '';
    const appliedByLabel = (d.appliedBy && typeof d.appliedBy === 'string' && d.appliedBy.trim()) ? d.appliedBy.trim() : (d.appliedBy || 'الأدمن');
    explanation += ` - خصم ${discountAmount.toFixed(2)} ريال (${d.discountPercentage}% ${d.eventDate ? `- ${eventDate} ` : ''}${d.discountType} - مطبق من ${appliedByLabel})`;
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
// Conditions Modal Functions
function showConditionsModal() {
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
printWin.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>لائحة تعليمات وسياسات عمل موظفي الاستقبال</title><link rel="stylesheet" href="' + base + 'src/styles.css"><style>@media print{body{background:#0f172a;color:#e2e8f0;} .no-print{display:none;}}</style></head><body class="bg-[#0f172a] text-gray-300 p-4" style="background:#0f172a;color:#e2e8f0;padding:1rem;font-family:\'IBM Plex Sans Arabic\',Arial,sans-serif;">' +
  '<h1 style="font-size:1.25rem;font-weight:900;color:#40E0D0;margin-bottom:1rem;text-align:center;border-bottom:2px solid rgba(64,224,208,0.4);padding-bottom:0.5rem;">لائحة تعليمات وسياسات عمل موظفي الاستقبال</h1>' +
  '<div style="max-width:800px;margin:0 auto;">' + content + '</div></body></html>');
printWin.document.close();
printWin.focus();
setTimeout(function () { printWin.print(); }, 400);
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
        if (typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
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
  document.body.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:center;min-height:100vh;background:linear-gradient(135deg,#0f172a 0%,#1a1f35 100%);color:#fff;font-family:'IBM Plex Sans Arabic',Arial,sans-serif;text-align:center;padding:2rem;">
      <div style="max-width:480px;">
        <div style="font-size:4rem;margin-bottom:1rem;">✅</div>
        <h1 style="font-size:1.5rem;font-weight:900;margin-bottom:1rem;color:#6ee7b7;">تم ربط البيانات بالجدول</h1>
        <p style="color:#94a3b8;margin-bottom:2rem;">شكراً. تم حفظ إدخالك ولا يمكنك الرجوع لتعديل البيانات من هذا الرابط.</p>
        <p style="color:#64748b;font-size:0.875rem;">يمكنك إغلاق هذه الصفحة.</p>
      </div>
    </div>
  `;
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
      var p = typeof doSyncLivePeriodNow === 'function' ? doSyncLivePeriodNow() : Promise.resolve();
      p.then(resolve).catch(reject);
    }, 200);
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
html += `
<button onclick="filterReportsByBranch('${b}')" 
class="filter-reports-pill ${isActive ? 'active' : ''} px-4 py-2 rounded-lg text-sm font-bold transition-all ${isActive ? 'text-white shadow-[0_0_20px_rgba(64,224,208,0.3)]' : 'text-white bg-white/5 border border-white/10 hover:bg-white/10 hover:border-turquoise/50'}" 
data-filter="${b}">
${b}
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
card.className = 'glass p-4 rounded-xl border border-white/20 hover:border-turquoise/50 transition-all cursor-pointer';
// Create click handler function
const handleCardClick = (e) => {
e.preventDefault();
e.stopPropagation();
console.log('Card clicked:', name, 'isDuplicate:', isDuplicate, 'empId:', isDuplicate ? 'multiple' : employees[0].id);
if (isDuplicate) {
showBranchSelectionForReport(name, employees);
} else {
const empId = employees[0].id;
console.log('Calling showEmployeeReport with empId:', empId);
showEmployeeReport(empId);
}
};
// Attach click handler to card - use both onclick and addEventListener for compatibility
card.onclick = handleCardClick;
card.addEventListener('click', handleCardClick);
const nameText = isDuplicate ? `${name} (${employees.length} فروع)` : name;
const branchesText = isDuplicate ? employees.map(e => e.branch).join('، ') : employees[0].branch;
// Calculate total for display
let totalCount = 0;
let totalNet = 0;
employees.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
const attendanceBonus = emp.attendance26Days === true ? net * 0.25 : 0;
net = net + attendanceBonus;
totalCount += emp.count;
totalNet += net;
});
card.innerHTML = `
<div class="flex flex-col gap-2">
<div class="flex items-center justify-between">
<h3 class="text-lg font-bold text-white">${name}</h3>
${isDuplicate ? '<span class="text-xs text-turquoise font-bold bg-turquoise/20 px-2 py-1 rounded">متكرر</span>' : ''}
</div>
<p class="text-sm text-gray-300">الفرع: <span class="text-turquoise font-semibold">${branchesText}</span></p>
${isDuplicate ? '' : `
<div class="mt-2 pt-2 border-t border-white/10">
<div class="flex justify-between items-center">
<span class="text-xs text-gray-400">الحجوزات:</span>
<span class="text-sm font-bold text-white">${employees[0].count}</span>
</div>
<div class="flex justify-between items-center mt-1">
<span class="text-xs text-gray-400">المبلغ الصافي:</span>
<span class="text-sm font-bold text-turquoise">${totalNet.toFixed(2)} ريال</span>
</div>
</div>
`}
<div class="mt-2 pt-2 border-t border-turquoise/30">
<span class="text-xs text-turquoise font-semibold">عرض التقرير →</span>
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
// Handle click on employee name in table (when showing "الكل" view)
function handleEmployeeNameClick(empName, empId, isDuplicate) {
// Check if employee is actually duplicate (exists in multiple branches)
const allEmployeesWithSameName = db.filter(emp => emp.name === empName);
const actualIsDuplicate = allEmployeesWithSameName.length > 1;
  
if (actualIsDuplicate) {
// Show branch selection modal
showBranchSelectionForReport(empName, allEmployeesWithSameName);
} else {
// Not duplicate - show report directly
const employee = db.find(e => e.id === empId);
if (employee) {
showEmployeeReport(empId);
} else {
// Fallback: find first employee with this name
const firstEmp = allEmployeesWithSameName[0];
if (firstEmp) {
showEmployeeReport(firstEmp.id);
}
}
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
<div onclick="showEmployeeReport('${emp.id}')" class="p-4 rounded-xl cursor-pointer transition-all" style="background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(64, 224, 208, 0.3);" onmouseover="this.style.background='rgba(255, 255, 255, 0.15)'; this.style.borderColor='rgba(64, 224, 208, 0.6)';" onmouseout="this.style.background='rgba(255, 255, 255, 0.1)'; this.style.borderColor='rgba(64, 224, 208, 0.3)';">
<div class="flex items-center justify-between">
<div>
<h3 class="text-lg font-bold text-white">${emp.name}</h3>
<p class="text-sm text-gray-300 mt-1">الفرع: <span class="text-turquoise font-semibold">${emp.branch}</span></p>
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
// Recalculate branch winners for bonuses
const branchWinners = {};
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
});
db.forEach(e => {
const rate = e.count > 100 ? 3 : (e.count > 50 ? 2 : 1);
const evBooking = e.evaluationsBooking || 0;
const evGoogle = e.evaluationsGoogle || 0;
const gross = (e.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
const attendance26Days = e.attendance26Days === true;
const attendanceBonus = attendance26Days ? net * 0.25 : 0;
net = net + attendanceBonus;
const bw = branchWinners[e.branch];
if (!bw) return;
if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [e.id]; }
else if (net === bw.net.val) { bw.net.ids.push(e.id); }
if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [e.id]; }
else if (evBooking === bw.eval.val) { bw.eval.ids.push(e.id); }
if (evBooking > bw.evalBooking.val) { bw.evalBooking.val = evBooking; bw.evalBooking.ids = [e.id]; }
else if (evBooking === bw.evalBooking.val) { bw.evalBooking.ids.push(e.id); }
if (evGoogle > bw.evalGoogle.val) { bw.evalGoogle.val = evGoogle; bw.evalGoogle.ids = [e.id]; }
else if (evGoogle === bw.evalGoogle.val) { bw.evalGoogle.ids.push(e.id); }
if (e.count > bw.book.val) { bw.book.val = e.count; bw.book.ids = [e.id]; }
else if (e.count === bw.book.val) { bw.book.ids.push(e.id); }
const empNameCount = db.filter(emp => emp.name === e.name).length;
let empAttendanceDays = attendance26Days ? 26 : 0;
if (empNameCount > 1) {
empAttendanceDays = e.totalAttendanceDays || (attendance26Days ? 26 : 0);
}
if (empAttendanceDays >= 26) {
let isHighestDays = true;
const branchEmployees = db.filter(emp => emp.branch === e.branch);
branchEmployees.forEach(otherEmp => {
if (otherEmp.name === e.name) return;
const otherNameCount = db.filter(emp => emp.name === otherEmp.name).length;
let otherDays = otherEmp.attendance26Days === true ? 26 : 0;
if (otherNameCount > 1) {
otherDays = otherEmp.totalAttendanceDays || (otherEmp.attendance26Days === true ? 26 : 0);
}
if (otherDays > empAttendanceDays) {
isHighestDays = false;
}
});
if (isHighestDays) {
if (bw.attendance.val === -1) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [e.id];
} else if (empAttendanceDays > bw.attendance.val) {
bw.attendance.val = empAttendanceDays;
bw.attendance.ids = [e.id];
} else if (empAttendanceDays === bw.attendance.val) {
bw.attendance.ids.push(e.id);
}
}
}
});
// Calculate employee's details
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
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
const eGross = (e.count * eRate) + (eEvBooking * 20) + (eEvGoogle * 10);
const eFund = eGross * 0.15;
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
const isMostCommitted = bw?.attendance.ids.includes(emp.id);
const isMostEval = bw?.eval.ids.includes(emp.id) && bw.eval.val > 0;
const isMostBook = bw?.book.ids.includes(emp.id) && bw.book.val > 0;
const hasCommitmentBonus = finalAttendance26Days && isMostCommitted && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
let finalNet = net + excellenceBonus + commitmentBonus;

// Apply discounts (apply to this branch's net only)
let totalDiscountAmount = 0;
let discountDetails = [];
if (typeof getDiscountForEmployeeInBranch === 'function') {
  // Calculate base net for this branch (before bonuses)
  const branchBaseNet = net; // net already includes attendance bonus
  totalDiscountAmount = getDiscountForEmployeeInBranch(emp.name, branchBaseNet);
  finalNet = Math.max(0, finalNet - totalDiscountAmount);
}
if (typeof getDiscountDetailsForEmployee === 'function') {
  discountDetails = getDiscountDetailsForEmployee(emp.name);
}

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
maxBookCount: bw?.book.val || 0
};
}
function showEmployeeReport(empId) {
console.log('showEmployeeReport called with empId:', empId);
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
console.log('All modal elements found:', { modal: modal.id, content: content.id, title: title.id });
console.log('Modal elements found, calculating report...');
const report = calculateEmployeeReport(empId);
if (!report) {
console.error('Report calculation returned null for empId:', empId);
content.innerHTML = '<p class="text-red-400">❌ لم يتم العثور على الموظف</p>';
modal.style.setProperty('display', 'flex', 'important');
modal.style.setProperty('z-index', '1000', 'important');
modal.classList.remove('hidden');
return;
}
console.log('Report calculated successfully, preparing content...');
const { emp, rate, evBooking, evGoogle, gross, fund, net, netBeforeAttendanceBonus, attendanceBonus, actualAttendanceDays, excellenceBonus, commitmentBonus, finalNet, totalDiscountAmount, discountDetails, hasExcellenceBonus, hasCommitmentBonus, attendance26Days, isMostEval, isMostBook, maxEvalCount, maxBookCount } = report;
title.innerText = `تقرير ${emp.name} - ${emp.branch}`;
const periodText = document.getElementById('headerPeriodRange')?.innerText || '-';
const reportDate = new Date().toLocaleDateString('ar-SA');
content.innerHTML = `
<div class="space-y-4">
<!-- Header -->
<div class="bg-gradient-to-r from-turquoise/20 to-transparent p-4 rounded-xl border border-turquoise/30">
<h3 class="text-xl font-black text-turquoise mb-2">${emp.name}</h3>
<p class="text-sm text-gray-300">الفرع: <span class="text-turquoise font-bold">${emp.branch}</span></p>
<p class="text-sm text-gray-300">الفترة: <span class="text-turquoise font-bold">${periodText}</span></p>
<p class="text-sm text-gray-300">تاريخ التقرير: <span class="text-turquoise font-bold">${reportDate}</span></p>
</div>
<!-- Summary Card -->
<div class="bg-gradient-to-r from-green-500/20 to-transparent p-6 rounded-xl border border-green-500/30 text-center">
<h4 class="text-lg font-bold text-green-400 mb-2">المبلغ الصافي المستحق</h4>
<p class="text-3xl font-black text-white">${finalNet.toFixed(2)} <span class="text-lg text-green-400">ريال</span></p>
${totalDiscountAmount > 0 ? `
<p class="text-sm text-red-400 mt-2">بعد خصم ${totalDiscountAmount.toFixed(2)} ريال</p>
` : ''}
</div>
${totalDiscountAmount > 0 ? `
<!-- Discounts Section -->
<div class="bg-red-500/10 p-4 rounded-xl border border-red-500/30">
<h5 class="text-base font-bold text-red-400 mb-3 flex items-center gap-2">
<span>💰</span>
<span>الخصومات المطبقة</span>
</h5>
<div class="space-y-2 text-sm">
${discountDetails.map(discount => {
  const eventDate = discount.eventDate ? new Date(discount.eventDate + 'T00:00:00').toLocaleDateString('ar-SA') : '';
  return `
<div class="bg-red-500/5 p-3 rounded-lg border border-red-500/20">
<div class="flex justify-between items-center mb-1">
<span class="text-gray-300">${discount.discountType} (${discount.discountPercentage}%):</span>
<span class="font-bold text-red-400">-${(calculateAggregatedNetForEmployee(emp.name) * (discount.discountPercentage / 100)).toFixed(2)} ريال</span>
</div>
<p class="text-xs text-gray-400 mt-1">تم خصم ${discount.discountPercentage}% بسبب ${discount.discountType}${eventDate ? ` - تاريخ الحدث: ${eventDate}` : ''}</p>
<p class="text-xs text-gray-500 mt-0.5">مطبق من: ${discount.appliedBy || 'الأدمن'}</p>
</div>
`;
}).join('')}
</div>
</div>
` : ''}
<!-- Details -->
<div class="space-y-3">
<!-- Bookings -->
<div class="bg-blue-500/10 p-4 rounded-xl border border-blue-500/30">
<h5 class="text-base font-bold text-blue-400 mb-3 flex items-center gap-2">
<span>📊</span>
<span>مكافآت الحجوزات</span>
</h5>
<div class="space-y-2 text-sm text-gray-300">
<div class="flex justify-between items-center">
<span>عدد الحجوزات:</span>
<span class="font-bold text-white">${emp.count}</span>
</div>
<div class="flex justify-between items-center">
<span>الفئة (نقطة لكل عقد):</span>
<span class="font-bold text-white">${rate} ريال</span>
</div>
<div class="flex justify-between items-center pt-2 border-t border-white/10">
<span class="font-bold text-green-400">إجمالي مكافآت الحجوزات:</span>
<span class="font-bold text-blue-400">${(emp.count * rate).toFixed(2)} ريال</span>
</div>
</div>
</div>
<!-- Evaluations -->
<div class="bg-yellow-500/10 p-4 rounded-xl border border-yellow-500/30">
<h5 class="text-base font-bold text-yellow-400 mb-3 flex items-center gap-2">
<span>⭐</span>
<span>مكافآت التقييمات</span>
</h5>
<div class="space-y-2 text-sm text-gray-300">
<div class="flex justify-between items-center">
<span>تقييمات Booking:</span>
<span class="font-bold text-white">${evBooking}</span>
</div>
<div class="flex justify-between items-center">
<span>مكافأة لكل تقييم Booking:</span>
<span class="font-bold text-white">20 ريال</span>
</div>
<div class="flex justify-between items-center pt-2 border-t border-white/10">
<span class="font-bold text-green-400">إجمالي مكافآت Booking:</span>
<span class="font-bold text-yellow-400">${(evBooking * 20).toFixed(2)} ريال</span>
</div>
<div class="flex justify-between items-center mt-3">
<span>تقييمات Google Maps:</span>
<span class="font-bold text-white">${evGoogle}</span>
</div>
<div class="flex justify-between items-center">
<span>مكافأة لكل تقييم Google Maps:</span>
<span class="font-bold text-white">10 ريال</span>
</div>
<div class="flex justify-between items-center pt-2 border-t border-white/10">
<span class="font-bold text-green-400">إجمالي مكافآت Google Maps:</span>
<span class="font-bold text-yellow-400">${(evGoogle * 10).toFixed(2)} ريال</span>
</div>
<div class="flex justify-between items-center pt-3 border-t-2 border-yellow-500/30 mt-3">
<span class="font-bold text-green-400">إجمالي مكافآت التقييمات:</span>
<span class="font-bold text-yellow-400 text-lg">${((evBooking * 20) + (evGoogle * 10)).toFixed(2)} ريال</span>
</div>
</div>
</div>
<!-- Gross Total -->
<div class="bg-purple-500/10 p-4 rounded-xl border border-purple-500/30">
<h5 class="text-base font-bold text-purple-400 mb-3">الإجمالي قبل مساهمة شركاء النجاح</h5>
<div class="flex justify-between items-center">
<span class="text-sm text-gray-300">إجمالي المكافآت (حجوزات + تقييمات):</span>
<span class="font-bold text-white text-lg">${gross.toFixed(2)} ريال</span>
</div>
</div>
<!-- Deductions -->
<div class="bg-orange-500/10 p-4 rounded-xl border border-orange-500/30">
<h5 class="text-base font-bold text-orange-400 mb-3">مساهمة شركاء النجاح</h5>
<div class="space-y-2 text-sm text-gray-300">
<div class="flex justify-between items-center">
<span>مساهمة شركاء النجاح (15%):</span>
<span class="font-bold text-orange-400">-${fund.toFixed(2)} ريال</span>
</div>
<div class="flex justify-between items-center pt-2 border-t border-white/10">
<span class="font-bold text-green-400">إجمالي مساهمة شركاء النجاح:</span>
<span class="font-bold text-orange-400">-${fund.toFixed(2)} ريال</span>
</div>
</div>
</div>
<!-- Bonuses -->
<div class="bg-turquoise/10 p-4 rounded-xl border border-turquoise/30">
<h5 class="text-base font-bold text-turquoise mb-3">الحوافز الإضافية</h5>
<div class="space-y-3 text-sm">
${attendance26Days ? `
<div class="bg-green-500/10 p-3 rounded-lg border border-green-500/30">
<div class="flex justify-between items-center mb-1">
<span class="text-gray-300">✓ حافز تحدي الظروف (25%):</span>
<span class="font-bold text-green-400">+${attendanceBonus.toFixed(2)} ريال</span>
</div>
<p class="text-xs text-gray-400 mt-1">تم إتمام ${actualAttendanceDays} يوماً وأكثر من العطاء (الصافي قبل الحافز: ${netBeforeAttendanceBonus.toFixed(2)} ريال × 25% = ${attendanceBonus.toFixed(2)} ريال) - يتم حسابها من خلال بصمه الموظف</p>
</div>
` : ''}
${hasExcellenceBonus ? `
<div class="bg-turquoise/20 p-3 rounded-lg border border-turquoise/50">
<div class="flex justify-between items-center mb-1">
<span class="text-gray-300">✨ حافز التفوق:</span>
<span class="font-bold text-turquoise">+${excellenceBonus.toFixed(2)} ريال</span>
</div>
<p class="text-xs text-gray-400 mt-1">الأعلى تقييماً بـ ${maxEvalCount} تقييم والأكثر حجوزات ${maxBookCount} حجز في ${emp.branch}</p>
</div>
` : ''}
${hasCommitmentBonus ? `
<div class="bg-purple-500/20 p-3 rounded-lg border border-purple-500/50">
<div class="flex justify-between items-center mb-1">
<span class="text-gray-300">✓ حافز التزام:</span>
<span class="font-bold text-purple-400">+${commitmentBonus.toFixed(2)} ريال</span>
</div>
<p class="text-xs text-gray-400 mt-1">الأكثر التزاماً + ${isMostEval && isMostBook ? `(الأعلى تقييماً بـ ${maxEvalCount} تقييم والأكثر حجوزات ${maxBookCount} حجز)` : isMostEval ? `(الأعلى تقييماً بـ ${maxEvalCount} تقييم)` : isMostBook ? `(الأكثر حجوزات ${maxBookCount} حجز)` : ''} في ${emp.branch}</p>
</div>
` : ''}
${!attendance26Days && !hasExcellenceBonus && !hasCommitmentBonus ? `
<p class="text-gray-400 text-center py-2">لا توجد حوافز إضافية</p>
` : ''}
</div>
</div>
<!-- Calculation Summary -->
<div class="bg-gradient-to-r from-slate-800/50 to-slate-900/50 p-4 rounded-xl border border-white/10">
<h5 class="text-base font-bold text-white mb-3">ملخص الحساب</h5>
<div class="space-y-2 text-sm">
<div class="flex justify-between items-center text-gray-300">
<span>إجمالي المكافآت:</span>
<span class="font-bold text-white">${gross.toFixed(2)} ريال</span>
</div>
<div class="flex justify-between items-center text-gray-300">
<span>مساهمة شركاء النجاح:</span>
<span class="font-bold text-orange-400">-${fund.toFixed(2)} ريال</span>
</div>
<div class="flex justify-between items-center text-gray-300 pt-2 border-t border-white/10">
<span>الصافي بعد مساهمة شركاء النجاح:</span>
<span class="font-bold text-white">${(gross - fund).toFixed(2)} ريال</span>
</div>
${attendanceBonus > 0 ? `
<div class="flex justify-between items-center text-gray-300">
<span>حافز تحدي الظروف (25%):</span>
<span class="font-bold text-green-400">+${attendanceBonus.toFixed(2)} ريال</span>
</div>
` : ''}
${excellenceBonus > 0 ? `
<div class="flex justify-between items-center text-gray-300">
<span>حافز التفوق:</span>
<span class="font-bold text-turquoise">+${excellenceBonus.toFixed(2)} ريال</span>
</div>
` : ''}
${commitmentBonus > 0 ? `
<div class="flex justify-between items-center text-gray-300">
<span>حافز التزام:</span>
<span class="font-bold text-purple-400">+${commitmentBonus.toFixed(2)} ريال</span>
</div>
` : ''}
${totalDiscountAmount > 0 ? `
${discountDetails.map(discount => {
  const eventDate = discount.eventDate ? new Date(discount.eventDate + 'T00:00:00').toLocaleDateString('ar-SA') : '';
  const appliedByLabel = (discount.appliedBy && typeof discount.appliedBy === 'string' && discount.appliedBy.trim()) ? discount.appliedBy : (discount.appliedBy || 'الأدمن');
  return `
<div class="flex justify-between items-center text-gray-300">
<span>خصم ${discount.discountPercentage}% (${discount.discountType})${eventDate ? ` - ${eventDate}` : ''} - مطبق من ${appliedByLabel}:</span>
<span class="font-bold text-red-400">-${(finalNet / (1 - discount.discountPercentage / 100) * (discount.discountPercentage / 100)).toFixed(2)} ريال</span>
</div>
`;
}).join('')}
<div class="flex justify-between items-center text-gray-300 pt-2 border-t border-white/10">
<span class="font-bold text-white">إجمالي الخصومات:</span>
<span class="font-bold text-red-400">-${totalDiscountAmount.toFixed(2)} ريال</span>
</div>
` : ''}
<div class="flex justify-between items-center pt-3 border-t-2 border-turquoise/50 mt-2">
<span class="text-lg font-bold text-green-400">المبلغ الصافي المستحق:</span>
<span class="text-2xl font-black text-turquoise">${finalNet.toFixed(2)} ريال</span>
</div>
</div>
</div>
</div>
`;
// Show modal after content is set
console.log('Setting modal content, about to show modal...');
// Force modal to be visible - use !important to override Tailwind's hidden class
modal.style.setProperty('display', 'flex', 'important');
modal.style.setProperty('z-index', '1000', 'important');
modal.style.setProperty('visibility', 'visible', 'important');
modal.style.setProperty('opacity', '1', 'important');
modal.classList.remove('hidden');
console.log('Modal should be visible now. Modal classes:', modal.className, 'Modal display:', window.getComputedStyle(modal).display, 'Modal z-index:', window.getComputedStyle(modal).zIndex);
// Store current employee ID for printing
modal.dataset.empId = empId;
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

function printEmployeeReport() {
const modal = document.getElementById('employeeReportModal');
if (!modal) return;
const empId = modal.dataset.empId;
if (!empId) return;
const report = calculateEmployeeReport(empId);
if (!report) return;
const { emp, rate, evBooking, evGoogle, gross, fund, net, netBeforeAttendanceBonus, attendanceBonus, actualAttendanceDays, excellenceBonus, commitmentBonus, finalNet, totalDiscountAmount, discountDetails, hasExcellenceBonus, hasCommitmentBonus, attendance26Days, isMostCommitted, isMostEval, isMostBook, maxEvalCount, maxBookCount } = report;
const periodText = document.getElementById('headerPeriodRange')?.innerText || '-';
const reportDate = new Date().toLocaleDateString('ar-SA');
const printWindow = window.open('', '_blank');
const printContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير ${emp.name}</title>
<style>
@page {
size: A4 portrait;
margin: 10mm 8mm;
}
* {
margin: 0;
padding: 0;
box-sizing: border-box;
}
html, body {
height: 100%;
overflow: hidden;
}
body {
font-family: 'IBM Plex Sans Arabic', Arial, sans-serif;
direction: rtl;
background: white;
color: #000;
padding: 8px;
font-size: 10px;
line-height: 1.3;
max-height: 277mm;
overflow: hidden;
}
.header {
border-bottom: 2px solid #40E0D0;
padding-bottom: 6px;
margin-bottom: 8px;
}
.header h1 {
font-size: 16px;
font-weight: 900;
color: #000;
margin-bottom: 4px;
}
.header p {
font-size: 10px;
color: #333;
margin: 2px 0;
}
.detail-section {
margin-bottom: 8px;
padding: 8px;
border: 1px solid #e5e7eb;
border-radius: 4px;
background: #f9fafb;
}
.detail-section h3 {
font-size: 12px;
font-weight: 800;
color: #000;
margin-bottom: 5px;
border-bottom: 1px solid #40E0D0;
padding-bottom: 2px;
}
.summary-box {
background: linear-gradient(135deg, #10b981 0%, #059669 100%);
color: white;
padding: 10px;
border-radius: 4px;
text-align: center;
margin: 8px 0;
}
.summary-box h2 {
font-size: 12px;
font-weight: 800;
margin-bottom: 4px;
}
.summary-box .amount {
font-size: 24px;
font-weight: 900;
margin-top: 4px;
}
.row {
display: flex;
justify-content: space-between;
align-items: flex-start;
padding: 5px 0;
border-bottom: 1px solid #e5e7eb;
font-size: 10px;
}
.row:last-child {
border-bottom: none;
}
.row > div {
flex: 1;
min-width: 0;
}
.row > div > span:first-child {
display: block;
font-weight: 600;
margin-bottom: 3px;
}
.row > div > span:last-child {
display: block;
font-size: 8px;
color: #666;
line-height: 1.4;
}
.total-row {
font-weight: 900;
font-size: 12px;
border-top: 2px solid #40E0D0;
padding-top: 5px;
margin-top: 5px;
}
.approval-stamp {
position: fixed;
bottom: 20mm;
left: 50%;
transform: translateX(-50%);
text-align: center;
width: 120px;
height: 120px;
border: 3px solid #8b0000;
border-radius: 50%;
padding: 20px;
background: rgba(255, 255, 255, 0.95);
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;
box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
}
.approval-stamp::before {
content: '';
position: absolute;
top: -2px;
left: -2px;
right: -2px;
bottom: -2px;
border: 1px solid #8b0000;
border-radius: 50%;
opacity: 0.3;
}
.approval-stamp .checkmark {
color: #006400;
font-size: 28px;
font-weight: 900;
margin-bottom: 5px;
line-height: 1;
}
.approval-stamp .department {
color: #8b0000;
font-size: 11px;
font-weight: 700;
margin-bottom: 3px;
line-height: 1.2;
}
.approval-stamp .approved {
color: #8b0000;
font-size: 13px;
font-weight: 800;
line-height: 1.2;
}
</style>
</head>
<body>
<div class="header">
<h1>فندق إليت - تقرير المكافآت</h1>
<p><strong>الموظف:</strong> ${emp.name}</p>
<p><strong>الفرع:</strong> ${emp.branch}</p>
<p><strong>الفترة:</strong> ${periodText}</p>
<p><strong>تاريخ التقرير:</strong> ${reportDate}</p>
</div>
<div class="summary-box">
<h2>المبلغ الصافي المستحق</h2>
<div class="amount">${finalNet.toFixed(2)} ريال</div>
${totalDiscountAmount > 0 ? `<p style="font-size: 10px; margin-top: 4px; opacity: 0.9;">بعد خصم ${totalDiscountAmount.toFixed(2)} ريال</p>` : ''}
</div>
<div class="detail-section">
<h3>📊 مكافآت الحجوزات</h3>
<div class="row">
<span>عدد الحجوزات:</span>
<span><strong>${emp.count}</strong></span>
</div>
<div class="row">
<span>الفئة (نقطة لكل عقد):</span>
<span><strong>${rate} ريال</strong></span>
</div>
<div class="row total-row">
<span>إجمالي مكافآت الحجوزات:</span>
<span><strong>${(emp.count * rate).toFixed(2)} ريال</strong></span>
</div>
</div>
<div class="detail-section">
<h3>⭐ مكافآت التقييمات</h3>
<div class="row">
<span>تقييمات Booking:</span>
<span><strong>${evBooking}</strong></span>
</div>
<div class="row">
<span>مكافأة لكل تقييم Booking:</span>
<span><strong>20 ريال</strong></span>
</div>
<div class="row">
<span>إجمالي مكافآت Booking:</span>
<span><strong>${(evBooking * 20).toFixed(2)} ريال</strong></span>
</div>
<div class="row">
<span>تقييمات Google Maps:</span>
<span><strong>${evGoogle}</strong></span>
</div>
<div class="row">
<span>مكافأة لكل تقييم Google Maps:</span>
<span><strong>10 ريال</strong></span>
</div>
<div class="row">
<span>إجمالي مكافآت Google Maps:</span>
<span><strong>${(evGoogle * 10).toFixed(2)} ريال</strong></span>
</div>
<div class="row total-row">
<span>إجمالي مكافآت التقييمات:</span>
<span><strong>${((evBooking * 20) + (evGoogle * 10)).toFixed(2)} ريال</strong></span>
</div>
</div>
<div class="detail-section">
<h3>الإجمالي ومساهمة شركاء النجاح</h3>
<div class="row">
<span>إجمالي المكافآت (حجوزات + تقييمات):</span>
<span><strong>${gross.toFixed(2)} ريال</strong></span>
</div>
<div class="row">
<span>مساهمة شركاء النجاح (15%):</span>
<span><strong style="color: #ef4444;">-${fund.toFixed(2)} ريال</strong></span>
</div>
<div class="row total-row">
<span>الصافي بعد مساهمة شركاء النجاح:</span>
<span><strong>${(gross - fund).toFixed(2)} ريال</strong></span>
</div>
</div>
${attendanceBonus > 0 || excellenceBonus > 0 || commitmentBonus > 0 ? `
<div class="detail-section">
<h3>🏆 الحوافز الإضافية</h3>
${attendance26Days ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>✓ حافز تحدي الظروف (25%):</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">تم إتمام ${actualAttendanceDays} يوماً وأكثر من العطاء (الصافي قبل الحافز: ${netBeforeAttendanceBonus.toFixed(2)} ريال × 25% = ${attendanceBonus.toFixed(2)} ريال) - يتم حسابها من خلال بصمه الموظف</span>
</div>
<span><strong style="color: #10b981;">+${attendanceBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
${hasExcellenceBonus ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>✨ حافز التفوق:</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">الأعلى تقييماً بـ ${maxEvalCount} تقييم والأكثر حجوزات ${maxBookCount} حجز في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #14b8a6;">+${excellenceBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
${hasCommitmentBonus ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>✓ حافز التزام:</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">الأكثر التزاماً (26+ يوم)${isMostEval && isMostBook ? ` + الأعلى تقييماً بـ ${maxEvalCount} تقييم والأكثر حجوزات ${maxBookCount} حجز` : isMostEval ? ` + الأعلى تقييماً بـ ${maxEvalCount} تقييم` : isMostBook ? ` + الأكثر حجوزات ${maxBookCount} حجز` : ''} في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #a855f7;">+${commitmentBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
</div>
` : ''}
${totalDiscountAmount > 0 ? `
<div class="detail-section">
<h3>💰 الخصومات المطبقة</h3>
${discountDetails.map(discount => {
  const discountAmount = typeof calculateAggregatedNetForEmployee === 'function' 
    ? (calculateAggregatedNetForEmployee(emp.name) * (discount.discountPercentage / 100))
    : 0;
  const appliedByLabel = (discount.appliedBy && typeof discount.appliedBy === 'string' && discount.appliedBy.trim()) ? discount.appliedBy : (discount.appliedBy || 'الأدمن');
  return `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>${discount.discountType} (${discount.discountPercentage}%):</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">تم خصم ${discount.discountPercentage}% بسبب ${discount.discountType} - مطبق من ${appliedByLabel}</span>
</div>
<span><strong style="color: #ef4444;">-${discountAmount.toFixed(2)} ريال</strong></span>
</div>
`;
}).join('')}
<div class="row total-row">
<span>إجمالي الخصومات:</span>
<span><strong style="color: #ef4444;">-${totalDiscountAmount.toFixed(2)} ريال</strong></span>
</div>
</div>
` : ''}
<div class="detail-section">
<h3>ملخص الحساب النهائي</h3>
<div class="row">
<span>إجمالي المكافآت:</span>
<span><strong>${gross.toFixed(2)} ريال</strong></span>
</div>
<div class="row">
<span>مساهمة شركاء النجاح:</span>
<span><strong style="color: #ef4444;">-${fund.toFixed(2)} ريال</strong></span>
</div>
<div class="row">
<span>الصافي بعد مساهمة شركاء النجاح:</span>
<span><strong>${(gross - fund).toFixed(2)} ريال</strong></span>
</div>
${attendanceBonus > 0 ? `
<div class="row">
<span>حافز تحدي الظروف (25%):</span>
<span><strong style="color: #10b981;">+${attendanceBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
${excellenceBonus > 0 ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>حافز التفوق:</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">الأعلى تقييماً (${evBooking} تقييم Booking) والأكثر حجوزات (${emp.count} حجز) في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #14b8a6;">+${excellenceBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
${commitmentBonus > 0 ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>حافز التزام:</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">الأكثر التزاماً (26+ يوم)${isMostEval && isMostBook ? ' + الأعلى تقييماً والأكثر حجوزات' : isMostEval ? ' + الأعلى تقييماً' : isMostBook ? ' + الأكثر حجوزات' : ''} في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #a855f7;">+${commitmentBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
${totalDiscountAmount > 0 ? `
${discountDetails.map(discount => {
  const discountAmount = typeof calculateAggregatedNetForEmployee === 'function' 
    ? (calculateAggregatedNetForEmployee(emp.name) * (discount.discountPercentage / 100))
    : 0;
  const eventDate = discount.eventDate ? new Date(discount.eventDate + 'T00:00:00').toLocaleDateString('ar-SA') : '';
  const appliedByLabel = (discount.appliedBy && typeof discount.appliedBy === 'string' && discount.appliedBy.trim()) ? discount.appliedBy : (discount.appliedBy || 'الأدمن');
  return `
<div class="row">
<span>خصم ${discount.discountPercentage}% (${discount.discountType})${eventDate ? ` - ${eventDate}` : ''} - مطبق من ${appliedByLabel}:</span>
<span><strong style="color: #ef4444;">-${discountAmount.toFixed(2)} ريال</strong></span>
</div>
`;
}).join('')}
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<span>إجمالي الخصومات:</span>
<span><strong style="color: #ef4444;">-${totalDiscountAmount.toFixed(2)} ريال</strong></span>
</div>
` : ''}
<div class="row total-row" style="background: #f0fdf4; padding: 8px; border-radius: 4px; margin-top: 8px;">
<span style="font-size: 14px;">المبلغ الصافي المستحق:</span>
<span style="font-size: 20px; color: #10b981;"><strong>${finalNet.toFixed(2)} ريال</strong></span>
</div>
</div>
<div class="approval-stamp">
<span class="checkmark">✓</span>
<div class="department">إدارة التشغيل</div>
<div class="approved">معتمد</div>
</div>
</body>
</html>
`;
printWindow.document.write(printContent);
printWindow.document.close();
printWindow.focus();
setTimeout(() => {
printWindow.print();
}, 250);
}
// === Role-Based UI Functions ===
function initializeRoleBasedUI(role) {
  // Hide all action buttons by default
  const actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'none';
  }
  
  // Hide upload box
  const uploadBox = document.getElementById('uploadBox');
  if (uploadBox) {
    uploadBox.classList.add('hidden');
  }
  
  // Show dashboard
  const dashboard = document.getElementById('dashboard');
  if (dashboard) {
    dashboard.classList.remove('hidden');
  }
  
  // Body class for role-specific table layout (e.g. supervisor columns)
  document.body.classList.remove('role-supervisor', 'role-hr', 'role-accounting', 'role-manager');
  if (role === 'supervisor') {
    document.body.classList.add('role-supervisor');
  } else if (role === 'hr') {
    document.body.classList.add('role-hr');
  } else if (role === 'accounting') {
    document.body.classList.add('role-accounting');
  } else if (role === 'manager') {
    document.body.classList.add('role-manager');
  }

  // Hide elements based on role — أزرار الفروع (الكل + كل فرع) تبقى ظاهرة؛ عند اختيار فرع يُعرض فقط موظفوه
  if (role === 'supervisor') {
    // المشرف: يرى الكل + كل فرع؛ الكل للعرض فقط، التقييمات يُدخلها في الفروع فقط
    hideElementsForSupervisor();
  } else if (role === 'hr') {
    // HR: يرى الكل + كل فرع؛ الكل للعرض فقط، تم/لم يتم وأيام المتكررين في الفروع فقط
    hideElementsForHR();
  } else if (role === 'accounting') {
    // الحسابات: كل الفروع (عرض + طباعة حسب الفرع المختار)
    hideElementsForAccounting();
  } else if (role === 'manager') {
    // Manager: Statistics page only — إخفاء زر الأكواد وزر الرجوع عن المدير العام
    hideElementsForManager();
    var rp = document.getElementById('reportsPage');
    if (rp) {
      var backBtn = rp.querySelector('button[onclick*="hideReportsPage"]');
      var codesBtn = rp.querySelector('button[onclick*="showEmployeeCodesModal"]');
      if (backBtn) backBtn.style.display = 'none';
      if (codesBtn) codesBtn.style.display = 'none';
    }
  }
  
  // منع رجوع المتصفح من فتح المشروع الكامل: عند ضغط "رجوع المتصفح" نعرض شاشة إنهاء فقط
  if (['supervisor', 'hr', 'accounting', 'manager'].indexOf(role) >= 0) {
    try {
      if (typeof history !== 'undefined' && history.pushState) {
        history.pushState({ adminRestricted: true }, '', window.location.href);
      }
      window.addEventListener('popstate', function adminPopstate(e) {
        var r = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
        var urlRole = new URLSearchParams(window.location.search).get('role');
        var adminRoles = ['supervisor', 'hr', 'accounting', 'manager'];
        var isAdmin = (r && adminRoles.indexOf(r) >= 0) || (urlRole && adminRoles.indexOf(urlRole) >= 0);
        if (isAdmin && typeof showAdminNoReturnScreen === 'function') {
          showAdminNoReturnScreen();
          if (history.pushState) history.pushState({ adminRestricted: true }, '', window.location.href);
        }
      });
    } catch (err) {}
  }
  
  // للاختبار: إلغاء حالة «تم الإرسال» عند وجود reset_submitted=1 في الرابط (لتمكين إدخال بيانات من المشرف/HR مرة أخرى)
  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('reset_submitted') === '1') {
      var p = (params.get('period') || '').trim();
      if (p && role) localStorage.removeItem('adora_admin_submitted_' + p + '_' + role);
    }
  } catch (_) {}

  // Show welcome message
  showRoleWelcomeMessage(role);

  // إذا فتح الرابط بعد الإرسال: عرض فقط — تعطيل كل خانات الإدخال + عرض «الكل» فقط (إخفاء أزرار الفروع)
  if (typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted()) {
    setTimeout(function applySubmittedViewOnly() {
      document.querySelectorAll('.eval-input').forEach(function (el) { el.disabled = true; el.style.opacity = '0.7'; });
      document.querySelectorAll('.attendance-toggle').forEach(function (el) { el.disabled = true; el.style.opacity = '0.7'; });
      document.querySelectorAll('.attendance-days-input').forEach(function (el) { el.disabled = true; el.style.opacity = '0.7'; });
    }, 200);
    // المشرف و HR بعد الإرسال: يعرض لهما «الكل» فقط — الفروع تظهر للإدخال قبل الإرسال فقط
    if (role === 'supervisor' || role === 'hr') {
      currentFilter = 'الكل';
      if (typeof updateFilters === 'function') updateFilters();
      var container = document.getElementById('branchFilters');
      if (container) {
        container.querySelectorAll('.filter-pill[data-filter]').forEach(function (btn) {
          btn.style.display = btn.getAttribute('data-filter') === 'الكل' ? '' : 'none';
        });
      }
      if (typeof updateReportTitle === 'function') updateReportTitle();
      if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
      if (typeof renderUI === 'function') renderUI('الكل');
    }
  }
}

function hideElementsForSupervisor() {
  // المشرف يرى "الكل" + كل فرع — الكل للعرض فقط، يدخل التقييمات في الفروع فقط. لا نخفي أزرار الفروع.
  // زر شروط المكافآت معروض لكل الإداريين والموظفين
  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    actionBtns.querySelectorAll('button').forEach(function (b) {
      var onclick = b.getAttribute('onclick') || '';
      b.style.display = (onclick.indexOf('showConditionsModal') >= 0 || onclick.indexOf('showDiscountsModal') >= 0) ? '' : 'none';
    });
  }
  
  // Hide attendance inputs and toggles
  document.querySelectorAll('.attendance-toggle, .attendance-days-input').forEach(el => {
    el.style.display = 'none';
  });
  
  // زر الخصومات يظهر للمشرف (نفس صلاحيات الأدمن في تطبيق الخصم)
  
  // Hide reports button
  const reportsBtn = document.querySelector('[onclick*="showReportsPage"]');
  if (reportsBtn) reportsBtn.style.display = 'none';
  
  // Hide print buttons
  document.querySelectorAll('[onclick*="smartPrint"], [onclick*="printConditions"]').forEach(btn => {
    btn.style.display = 'none';
  });
  
  // Hide close period button
  const closePeriodBtn = document.querySelector('[onclick*="showClosePeriodModal"]');
  if (closePeriodBtn) closePeriodBtn.style.display = 'none';
  
  // Make evaluation inputs editable (they already are)
  // But disable other inputs
  document.querySelectorAll('input[type="text"]:not(.eval-input)').forEach(input => {
    input.disabled = true;
    input.style.opacity = '0.5';
  });
}

function hideElementsForHR() {
  // HR يرى كل الفروع (الكل + كل فرع) لتعديل تم/لم يتم وعدد الأيام في كل فرع
  // لا نخفي أزرار الفروع. زر شروط المكافآت معروض لكل الإداريين والموظفين
  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    actionBtns.querySelectorAll('button').forEach(function (b) {
      b.style.display = (b.getAttribute('onclick') || '').indexOf('showConditionsModal') >= 0 ? '' : 'none';
    });
  }
  
  // Hide evaluation inputs
  document.querySelectorAll('.eval-input').forEach(el => {
    el.style.display = 'none';
  });
  
  // Hide discount button
  const discountBtn = document.querySelector('[onclick*="showDiscountsModal"]');
  if (discountBtn) discountBtn.style.display = 'none';
  
  // Hide reports button
  const reportsBtn = document.querySelector('[onclick*="showReportsPage"]');
  if (reportsBtn) reportsBtn.style.display = 'none';
  
  // Hide print buttons
  document.querySelectorAll('[onclick*="smartPrint"], [onclick*="printConditions"]').forEach(btn => {
    btn.style.display = 'none';
  });
  
  // Hide close period button
  const closePeriodBtn = document.querySelector('[onclick*="showClosePeriodModal"]');
  if (closePeriodBtn) closePeriodBtn.style.display = 'none';
  
  // Make attendance inputs editable (they already are)
  // But disable other inputs
  document.querySelectorAll('input[type="text"]:not(.attendance-days-input)').forEach(input => {
    input.disabled = true;
    input.style.opacity = '0.5';
  });
}

function hideElementsForAccounting() {
  // Hide evaluation inputs
  document.querySelectorAll('.eval-input').forEach(el => {
    el.style.display = 'none';
  });
  
  // Hide attendance inputs and toggles
  document.querySelectorAll('.attendance-toggle, .attendance-days-input').forEach(el => {
    el.style.display = 'none';
  });
  
  // Hide discount button
  const discountBtn = document.querySelector('[onclick*="showDiscountsModal"]');
  if (discountBtn) discountBtn.style.display = 'none';
  
  // Hide close period button
  const closePeriodBtn = document.querySelector('[onclick*="showClosePeriodModal"]');
  if (closePeriodBtn) closePeriodBtn.style.display = 'none';
  
  // Hide admin management button
  const adminBtn = document.querySelector('[onclick*="showAdminManagementModal"]');
  if (adminBtn) adminBtn.style.display = 'none';
  
  // الحسابات: إظهار الترويسة + زر شروط المكافآت + أزرار الطباعة (الكل والمحدد)
  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    actionBtns.querySelectorAll('button').forEach(function (b) {
      var onclick = b.getAttribute('onclick') || '';
      var isConditions = onclick.indexOf('showConditionsModal') >= 0;
      var isPrint = onclick.indexOf('smartPrint') >= 0 || (b.id === 'printAllBtn' || b.id === 'printSelectedBtn');
      b.style.display = (isConditions || isPrint) ? '' : 'none';
    });
  }
  var printAllBtn = document.getElementById('printAllBtn');
  var printSelectedBtn = document.getElementById('printSelectedBtn');
  if (printAllBtn) printAllBtn.style.display = '';
  if (printSelectedBtn) printSelectedBtn.style.display = '';
  
  // Disable all inputs
  document.querySelectorAll('input[type="text"], input[type="checkbox"]').forEach(input => {
    input.disabled = true;
    input.style.opacity = '0.5';
  });
  
  // Make employee names clickable (already implemented in renderUI)
  setTimeout(() => {
    document.querySelectorAll('.col-name span[onclick]').forEach(span => {
      span.style.cursor = 'pointer';
      span.classList.add('hover:text-turquoise', 'transition-colors');
    });
  }, 200);
}

function hideElementsForManager() {
  document.getElementById('dashboard')?.classList.add('hidden');
  document.getElementById('uploadBox')?.classList.add('hidden');
  // المدير: إظهار زر شروط المكافآت فقط (معروض لكل الإداريين والموظفين)
  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    actionBtns.querySelectorAll('button').forEach(function (b) {
      b.style.display = (b.getAttribute('onclick') || '').indexOf('showConditionsModal') >= 0 ? '' : 'none';
    });
  }
  
  const reportsPage = document.getElementById('reportsPage');
  if (reportsPage) {
    reportsPage.classList.remove('hidden');
    var rp = document.getElementById('reportsPage');
    if (rp) {
      var backBtn = rp.querySelector('button[onclick*="hideReportsPage"]');
      var codesBtn = rp.querySelector('button[onclick*="showEmployeeCodesModal"]');
      if (backBtn) backBtn.style.display = 'none';
      if (codesBtn) codesBtn.style.display = 'none';
    }
    setTimeout(() => {
      if (typeof switchReportsTab === 'function') switchReportsTab('statistics');
    }, 100);
    setTimeout(() => {
      if (typeof loadStatisticsPage === 'function') loadStatisticsPage();
    }, 350);
  }
}

function showRoleWelcomeMessage(role) {
  var roleNames = { supervisor: 'المشرف', hr: 'HR', accounting: 'الحسابات', manager: 'المدير العام' };
  var roleIcons = { supervisor: '👨\u200D💼', hr: '👔', accounting: '💰', manager: '👑' };
  var roleName = roleNames[role] || role;
  var roleIcon = roleIcons[role] || '👋';
  var isViewOnly = (role === 'accounting' || role === 'manager') || (typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted());
  var displayName = '';
  try {
    var params = new URLSearchParams(window.location.search);
    var nameFromUrl = params.get('name');
    if (nameFromUrl) displayName = decodeURIComponent(nameFromUrl).trim();
    if (!displayName && typeof getAdminNameForRole === 'function') displayName = (getAdminNameForRole(role) || '').trim();
    if (!displayName) displayName = roleName;
  } catch (e) { displayName = roleName; }
  var instruction = '';
  if (isViewOnly) {
    instruction = 'عرض وطباعة فقط.';
  } else if (role === 'supervisor') {
    instruction = 'أدخل تقييمات Booking و Google لكل فرع، ثم اضغط «إرسال» لإرسال البيانات لإدارة التشغيل.';
  } else if (role === 'hr') {
    instruction = 'أدخل معدلات الالتزام (26 يوم) وأيام الحضور للمتكررين، ثم اضغط «إرسال» لإرسال البيانات لإدارة التشغيل.';
  } else {
    instruction = 'أدخل البيانات المطلوبة ثم اضغط «إرسال» لإرسالها لإدارة التشغيل.';
  }
  var banner = document.createElement('div');
  banner.id = 'roleWelcomeBanner';
  banner.className = 'fixed top-0 left-0 right-0 z-[9999] text-white';
  banner.style.cssText = 'background: linear-gradient(135deg, rgba(15, 23, 41, 0.98) 0%, rgba(26, 31, 53, 0.98) 100%); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-bottom: 1px solid rgba(20, 184, 166, 0.25); box-shadow: 0 4px 24px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.05); padding: 0.875rem 1rem 0.875rem 1.25rem;';
  var sendBtn = !isViewOnly ? '<button type="button" onclick="submitAdminAndLock()" class="flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all hover:opacity-95 min-h-[40px] flex items-center justify-center gap-2" style="background: rgba(20, 184, 166, 0.25); border: 1px solid rgba(20, 184, 166, 0.6); color: #fff; box-shadow: 0 2px 12px rgba(20, 184, 166, 0.2);">إرسال</button>' : '';
  banner.innerHTML =
    '<div class="flex flex-wrap items-center justify-between gap-3 max-w-6xl mx-auto" style="direction: rtl;">' +
      '<div class="flex items-center gap-3 flex-wrap flex-1 min-w-0">' +
        '<span class="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center text-xl" style="background: rgba(20, 184, 166, 0.2); border: 1px solid rgba(20, 184, 166, 0.4);">' + roleIcon + '</span>' +
        '<div class="min-w-0">' +
          '<div class="flex items-center gap-2 flex-wrap">' +
            '<span class="font-bold text-base sm:text-lg tracking-tight text-white">مرحباً، ' + (displayName || roleName) + '</span>' +
            (displayName !== roleName ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold flex-shrink-0" style="background: rgba(20, 184, 166, 0.2); color: #5eead4;">' + roleName + '</span>' : '') +
          '</div>' +
          '<p class="text-sm text-white/85 mt-0.5" style="margin:0;line-height:1.4;">' + instruction + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="flex items-center gap-2 flex-shrink-0">' +
        sendBtn +
      '</div>' +
    '</div>';
  document.body.insertBefore(banner, document.body.firstChild);
  var adminRoles = ['supervisor', 'hr', 'accounting', 'manager'];
  if (adminRoles.indexOf(role) < 0) {
    setTimeout(function () {
      if (banner.parentNode) banner.remove();
    }, 5000);
  }
}

function printConditions() {
const printWindow = window.open('', '_blank');
const printContent = `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>شروط الحصول على المكافآت</title>
<style>
@page {
size: A4 portrait;
margin: 10mm 12mm;
}
* {
margin: 0;
padding: 0;
box-sizing: border-box;
}
body {
font-family: 'Arial', 'Segoe UI', 'Tahoma', sans-serif;
padding: 10px 14px;
background: #fff;
color: #000;
line-height: 1.4;
direction: rtl;
font-size: 11px;
}
h1 {
font-size: 18px;
font-weight: 900;
color: #000;
margin-bottom: 10px;
text-align: center;
border-bottom: 2px solid #40E0D0;
padding-bottom: 8px;
letter-spacing: 0.5px;
}
.section {
margin-bottom: 8px;
padding: 8px 12px;
border-radius: 6px;
border: 1px solid #ddd;
page-break-inside: avoid;
box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}
.section.contracts {
background-color: rgba(59, 130, 246, 0.08);
border-color: rgba(59, 130, 246, 0.4);
border-right: 5px solid rgba(59, 130, 246, 0.6);
}
.section.evaluations {
background-color: rgba(234, 179, 8, 0.08);
border-color: rgba(234, 179, 8, 0.4);
border-right: 5px solid rgba(234, 179, 8, 0.6);
}
.section.bonuses {
background-color: rgba(20, 184, 166, 0.08);
border-color: rgba(20, 184, 166, 0.4);
border-right: 5px solid rgba(20, 184, 166, 0.6);
}
.section.attendance {
background-color: rgba(16, 185, 129, 0.08);
border-color: rgba(16, 185, 129, 0.4);
border-right: 5px solid rgba(16, 185, 129, 0.6);
}
.section.discounts {
background-color: rgba(239, 68, 68, 0.08);
border-color: rgba(239, 68, 68, 0.4);
border-right: 5px solid rgba(239, 68, 68, 0.6);
}
h2 {
font-size: 12px;
font-weight: 800;
color: #000;
margin: 0 0 6px 0;
display: flex;
align-items: center;
gap: 6px;
padding-bottom: 4px;
border-bottom: 1px solid rgba(0,0,0,0.1);
}
ul {
list-style: none;
padding: 0;
margin: 0;
}
li {
font-size: 10px;
font-weight: 600;
color: #000;
margin: 4px 0;
padding-right: 18px;
padding-left: 8px;
position: relative;
line-height: 1.5;
text-align: right;
}
li::before {
content: '•';
position: absolute;
right: 0;
top: 0;
font-weight: 900;
color: #000;
font-size: 12px;
}
.highlight-red {
color: #dc2626;
font-weight: 700;
background-color: rgba(220, 38, 38, 0.05);
padding: 6px 10px;
border-radius: 4px;
border-right: 2px solid #dc2626;
margin: 4px 0;
}
.highlight-green {
color: #10b981;
font-weight: 700;
background-color: rgba(16, 185, 129, 0.05);
padding: 6px 10px;
border-radius: 4px;
border-right: 2px solid #10b981;
margin: 4px 0;
}
@media print {
@page {
size: A4 portrait;
margin: 10mm 12mm;
}
body {
padding: 8px 12px;
page-break-after: avoid;
}
.conditions-one-page {
page-break-after: avoid;
page-break-inside: avoid;
}
.section {
page-break-inside: avoid;
margin-bottom: 6px;
padding: 6px 10px;
}
h1 {
font-size: 16px;
margin-bottom: 8px;
padding-bottom: 6px;
}
h2 {
font-size: 11px;
margin-bottom: 4px;
}
li {
font-size: 9.5px;
margin: 3px 0;
line-height: 1.45;
}
.highlight-red, .highlight-green {
padding: 4px 8px;
}
}
</style>
</head>
<body>
<div class="conditions-one-page">
<h1>شروط الحصول على المكافآت</h1>
<div class="section contracts">
<h2>📊 مكافآت العقود</h2>
<ul>
<li>نقطة واحدة (1 ريال) لكل عقد حتى 50 عقد</li>
<li>ريالان (2 ريال) لكل عقد من 51 إلى 100 عقد</li>
<li>ثلاثة ريالات (3 ريال) لكل عقد أكثر من 100 عقد</li>
</ul>
</div>
<div class="section evaluations">
<h2>⭐ مكافآت التقييمات</h2>
<ul>
<li>20 ريال لكل تقييم Booking (ثابت)</li>
<li>10 ريال لكل تقييم Google Maps (ثابت)</li>
</ul>
</div>
<div class="section attendance">
<h2>✓ حوافز تحدي الظروف</h2>
<ul>
<li class="highlight-green">مكافأة 25% إضافية للموظفين الذين أتموا 26 يوماً وأكثر من العطاء (بطل تحدي الظروف) (يتم التطبيق بناء على بصمه الحضور والانصراف)</li>
</ul>
</div>
<div class="section bonuses">
<h2>🏆 الحوافز الإضافية</h2>
<ul>
<li>50 ريال حافز تفوق (الأعلى تقييماً والأكثر حجوزات في نفس الفرع)</li>
<li>50 ريال حافز التزام مضافه الى الـ 25% كباقي الموظفين الذين تموا 26 يوم دوام (الموظف الذي جمع الأكثر التزاماً + الأعلى تقييماً أو الأكثر حجوزات في نفس الفرع)</li>
</ul>
</div>
<div class="section discounts" style="background-color: rgba(239, 68, 68, 0.08); border-color: rgba(239, 68, 68, 0.4); border-right: 5px solid rgba(239, 68, 68, 0.6);">
<h2>💰 خصومات التقصير</h2>
<ul>
<li>الحفاظ علي معايير الجودة والأداء 💎</li>
<li class="highlight-red">تطبق إدارة التشغيل خصومات تتراوح بين 15% إلى 50% من صافي المستحق في حالات تقصير الموظفين وعدم اتباع التعليمات</li>
<li>( فى حال عدم استلامك نسخه من التعليمات اطلب نسختك المطبوعه الان ).</li>
<li>تُحدد نسبة الخصم بناءً على جسامة التأثير على جودة الخدمة، وتُسجل رسمياً في سجل وأرشيف الموظف وتؤثر على تقييم اداءه.</li>
<li>هدفنا الالتزام بالتعليمات لضمان استمرار تميز "إليت" وتجنب أي إجراءات تؤثر على مبلغ المكافأة النهائي.</li>
</ul>
</div>
</div>
</body>
</html>
`;
printWindow.document.write(printContent);
printWindow.document.close();
printWindow.focus();
setTimeout(() => {
printWindow.print();
}, 250);
}

// === Firebase Storage Functions ===
// Initialize Firebase when SDK loads
let firebaseInitAttempts = 0;
const MAX_INIT_ATTEMPTS = 5;

function initializeFirebase() {
  var config = typeof window !== 'undefined' && window.firebaseConfig ? window.firebaseConfig : null;
  if (typeof firebase === 'undefined') {
    firebaseInitAttempts++;
    if (firebaseInitAttempts < MAX_INIT_ATTEMPTS) {
      console.log('⏳ Waiting for Firebase SDK... (attempt ' + firebaseInitAttempts + '/' + MAX_INIT_ATTEMPTS + ')');
      setTimeout(initializeFirebase, 1000);
      return;
    } else {
      console.error('❌ Firebase SDK failed to load after multiple attempts');
      storage = null;
      return;
    }
  }
  if (typeof window !== 'undefined' && window.storage) {
    storage = window.storage;
    firebaseApp = firebase.apps && firebase.apps[0] ? firebase.apps[0] : null;
    if (storage) return;
  }
  if (!config) {
    console.warn('⚠️ firebaseConfig not found (load firebase-config.js)');
    return;
  }
  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebaseApp = firebase.initializeApp(config);
      console.log('✅ Firebase app initialized');
    } else {
      firebaseApp = firebase.apps[0];
      console.log('✅ Firebase app already initialized');
    }
    if (firebaseApp && typeof firebase.storage === 'function') {
      storage = firebase.storage();
      if (typeof window !== 'undefined') window.storage = storage;
      console.log('✅ Firebase Storage initialized');
    } else {
      console.error('❌ Firebase Storage function not available');
      storage = null;
    }
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    storage = null;
  }
}

// === مزامنة الفترة الحية مع Firebase (آخر وضع على كل الأجهزة) ===
const LIVE_PERIOD_PATH = 'periods/live.json';
let syncLivePeriodTimer = null;

/** يجلب آخر وضع الفترة الحية من Firebase. يُستخدم عند فتح التطبيق. يستخدم getBlob لتقليل الزمن وتجنب CORS (مثل admin_tokens). */
async function fetchLivePeriodFromFirebase() {
  const st = typeof storage !== 'undefined' ? storage : (typeof window !== 'undefined' ? window.storage : null);
  if (!st || typeof st.ref !== 'function') return null;
  try {
    const ref = st.ref(LIVE_PERIOD_PATH);
    const blob = await ref.getBlob();
    const text = typeof blob.text === 'function' ? await blob.text() : await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsText(blob);
    });
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.db)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/** يجلب بيانات فترة محددة من Firebase (periods/{periodId}.json) — احتياطي عند فتح رابط إداري عندما live.json فارغ أو غير موجود. */
async function fetchPeriodFromFirebase(periodId) {
  if (!periodId || typeof periodId !== 'string') return null;
  // توحيد التنسيق: الملف يُكتب كـ 2026_01؛ الرابط قد يأتي بـ 2026-01
  var normalizedId = String(periodId).replace(/-/g, '_').trim();
  if (!normalizedId) return null;
  const st = typeof storage !== 'undefined' ? storage : (typeof window !== 'undefined' ? window.storage : null);
  if (!st || typeof st.ref !== 'function') return null;
  try {
    const path = 'periods/' + normalizedId + '.json';
    const ref = st.ref(path);
    const blob = await ref.getBlob();
    const text = typeof blob.text === 'function' ? await blob.text() : await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.onerror = rej;
      r.readAsText(blob);
    });
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.db) || data.db.length === 0) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/** آخر وقت تطبيق معروف من Firebase (لتجنّب استبدال بيانات أحدث بقديمة). */
let lastAppliedLiveModified = 0;

/** يطبّق بيانات الفترة المُحمّلة من Firebase على localStorage دون إعادة رسم الواجهة. */
function applyLivePeriod(data) {
  if (!data || !Array.isArray(data.db)) return;
  try {
    localStorage.setItem('adora_rewards_db', JSON.stringify(data.db));
    const br = data.branches;
    localStorage.setItem('adora_rewards_branches', JSON.stringify(Array.isArray(br) ? br : (br && typeof br.forEach === 'function' ? [...br] : [])));
    if (data.reportStartDate != null) localStorage.setItem('adora_rewards_startDate', String(data.reportStartDate));
    if (data.periodText != null) localStorage.setItem('adora_rewards_periodText', String(data.periodText));
    if (data.evalRate != null) localStorage.setItem('adora_rewards_evalRate', String(data.evalRate));
    if (Array.isArray(data.discounts)) localStorage.setItem('adora_rewards_discounts', JSON.stringify(data.discounts));
    if (Array.isArray(data.discountTypes)) localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(data.discountTypes));
    if (data.employeeCodes && typeof data.employeeCodes === 'object') localStorage.setItem('adora_rewards_employeeCodes', JSON.stringify(data.employeeCodes));
    if (data.lastModified != null) lastAppliedLiveModified = Number(data.lastModified) || 0;
  } catch (e) {
    console.warn('⚠️ applyLivePeriod:', e);
  }
}

/** يرفع آخر وضع الفترة الحية إلى Firebase (مع debounce 150ms — سريع للكتابة الفورية). المشرف وHR: مزامنة في الخلفية بدون إظهار overlay. */
function syncLivePeriodToFirebase() {
  clearTimeout(syncLivePeriodTimer);
  syncLivePeriodTimer = setTimeout(async () => {
    var role = (typeof localStorage !== 'undefined' && localStorage.getItem('adora_current_role')) || '';
    var hideSyncUI = (role === 'supervisor' || role === 'hr');
    const st = typeof storage !== 'undefined' ? storage : (typeof window !== 'undefined' ? window.storage : null);
    if (!st || typeof st.ref !== 'function') return;
    if (!hideSyncUI && typeof showLoadingOverlay === 'function') showLoadingOverlay('جاري المزامنة...');
    try {
      const savedDb = localStorage.getItem('adora_rewards_db');
      if (!savedDb) return;
      const parsed = JSON.parse(savedDb);
      if (!Array.isArray(parsed) || parsed.length === 0) { return; }
      const payload = {
        db: parsed,
        branches: JSON.parse(localStorage.getItem('adora_rewards_branches') || '[]'),
        reportStartDate: localStorage.getItem('adora_rewards_startDate') || null,
        periodText: localStorage.getItem('adora_rewards_periodText') || null,
        evalRate: parseInt(localStorage.getItem('adora_rewards_evalRate'), 10) || 20,
        discounts: (() => { try { return JSON.parse(localStorage.getItem('adora_rewards_discounts') || '[]'); } catch (_) { return []; } })(),
        discountTypes: (() => { try { return JSON.parse(localStorage.getItem('adora_rewards_discountTypes') || '[]'); } catch (_) { return []; } })(),
        employeeCodes: (() => { try { return JSON.parse(localStorage.getItem('adora_rewards_employeeCodes') || '{}'); } catch (_) { return {}; } })(),
        lastModified: Date.now()
      };
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      await st.ref(LIVE_PERIOD_PATH).put(blob);
      if (payload.lastModified) lastAppliedLiveModified = payload.lastModified;
      // كتابة نسخة حسب periodId (periods/2026_01.json) حتى يعمل رابط الإداري من أي جهاز
      var startDate = payload.reportStartDate || localStorage.getItem('adora_rewards_startDate');
      if (startDate && /^\d{4}-\d{2}-\d{2}/.test(String(startDate))) {
        var periodId = String(startDate).substring(0, 7).replace('-', '_');
        try { await st.ref('periods/' + periodId + '.json').put(blob); } catch (_) {}
      }
    } catch (e) {
      // صامت عند الفشل لئلا نزعج المستخدم
    } finally {
      if (!hideSyncUI && typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    }
  }, 150);
}

/** مزامنة فورية (بدون debounce) — تُستدعى عند الضغط على إرسال في المشرف/HR. تُرجع Promise. إذا Firebase غير جاهز: ننتظر ثم نرفض حتى يظهر للمستخدم خطأ. */
function doSyncLivePeriodNow() {
  return new Promise(async function (resolve, reject) {
    var st = typeof storage !== 'undefined' ? storage : (typeof window !== 'undefined' ? window.storage : null);
    if (!st || typeof st.ref !== 'function') {
      if (typeof initializeFirebase === 'function') initializeFirebase();
      var waitStart = Date.now();
      var maxWaitMs = 10000;
      while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < maxWaitMs) {
        await new Promise(function (r) { setTimeout(r, 200); });
      }
      st = typeof storage !== 'undefined' ? storage : (typeof window !== 'undefined' ? window.storage : null);
    }
    if (!st || typeof st.ref !== 'function') {
      reject(new Error('Firebase غير جاهز — تحقق من الاتصال وجرّب مرة أخرى'));
      return;
    }
    try {
      var savedDb = localStorage.getItem('adora_rewards_db');
      if (!savedDb) { resolve(); return; }
      var parsed = JSON.parse(savedDb);
      if (!Array.isArray(parsed) || parsed.length === 0) { resolve(); return; }
      var payload = {
        db: parsed,
        branches: JSON.parse(localStorage.getItem('adora_rewards_branches') || '[]'),
        reportStartDate: localStorage.getItem('adora_rewards_startDate') || null,
        periodText: localStorage.getItem('adora_rewards_periodText') || null,
        evalRate: parseInt(localStorage.getItem('adora_rewards_evalRate'), 10) || 20,
        discounts: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_discounts') || '[]'); } catch (_) { return []; } })(),
        discountTypes: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_discountTypes') || '[]'); } catch (_) { return []; } })(),
        employeeCodes: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_employeeCodes') || '{}'); } catch (_) { return {}; } })(),
        lastModified: Date.now()
      };
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      await st.ref(LIVE_PERIOD_PATH).put(blob);
      if (payload.lastModified && typeof lastAppliedLiveModified !== 'undefined') lastAppliedLiveModified = payload.lastModified;
      var startDate = payload.reportStartDate || (typeof localStorage !== 'undefined' ? localStorage.getItem('adora_rewards_startDate') : null);
      if (startDate && /^\d{4}-\d{2}-\d{2}/.test(String(startDate))) {
        var periodId = String(startDate).substring(0, 7).replace('-', '_');
        try { await st.ref('periods/' + periodId + '.json').put(blob); } catch (_) {}
      }
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

/** جلب دوري لآخر وضع الفترة من Firebase وتحديث الواجهة — الأدمن كل ثانية (تحديث فوري بعد إرسال المشرف/HR)، وباقي الأدوار كل 15 ثانية. */
const LIVE_POLL_INTERVAL_MS = 15000;
const ADMIN_POLL_INTERVAL_MS = 1000;
let livePollTimerId = null;

function startLivePeriodPolling() {
  if (livePollTimerId != null) return;
  if (typeof isEmployeeMode === 'function' && isEmployeeMode()) return;
  function poll() {
    if (typeof isEmployeeMode === 'function' && isEmployeeMode()) return;
    (async function () {
      var role = (typeof localStorage !== 'undefined' && localStorage.getItem('adora_current_role')) || '';
      var indicator = document.getElementById('liveSyncIndicator');
      try {
        if (indicator && role !== 'supervisor' && role !== 'hr') indicator.style.display = 'flex';
        const data = await (typeof fetchLivePeriodFromFirebase === 'function' ? fetchLivePeriodFromFirebase() : null);
        if (!data || !Array.isArray(data.db) || data.db.length === 0) return;
        const remoteModified = Number(data.lastModified) || 0;
        var isAdmin = typeof isAdminMode === 'function' && isAdminMode();
        if (remoteModified <= lastAppliedLiveModified) {
          if (isAdmin) {
            var currentStr = typeof db !== 'undefined' && db && db.length ? JSON.stringify(db.map(function (e) { return { id: e.id, evaluationsBooking: e.evaluationsBooking, evaluationsGoogle: e.evaluationsGoogle, attendance26Days: e.attendance26Days, attendanceDaysPerBranch: e.attendanceDaysPerBranch, totalAttendanceDays: e.totalAttendanceDays }; })) : '';
            var remoteStr = data.db && data.db.length ? JSON.stringify(data.db.map(function (e) { return { id: e.id, evaluationsBooking: e.evaluationsBooking, evaluationsGoogle: e.evaluationsGoogle, attendance26Days: e.attendance26Days, attendanceDaysPerBranch: e.attendanceDaysPerBranch, totalAttendanceDays: e.totalAttendanceDays }; })) : '';
            if (currentStr === remoteStr) return;
          } else return;
        }
        if (typeof applyLivePeriod === 'function') applyLivePeriod(data);
        lastAppliedLiveModified = remoteModified;
        db = data.db;
        if (typeof window !== 'undefined') window.db = db;
        branches = new Set(Array.isArray(data.branches) ? data.branches : []);
        if (data.reportStartDate != null) reportStartDate = data.reportStartDate;
        if (data.evalRate != null) currentEvalRate = parseInt(data.evalRate, 10) || 20;
        if (Array.isArray(data.discounts)) { try { discounts = data.discounts; window.discounts = data.discounts; } catch (_) {} }
        if (Array.isArray(data.discountTypes)) { try { discountTypes = data.discountTypes; window.discountTypes = data.discountTypes; } catch (_) {} }
        if (data.employeeCodes && typeof data.employeeCodes === 'object') { try { employeeCodesMap = data.employeeCodes; if (typeof window !== 'undefined') window.employeeCodesMap = employeeCodesMap; } catch (_) {} }
        if (data.periodText != null) {
          try {
            var periodRangeEl = document.getElementById('periodRange');
            var headerPeriodRangeEl = document.getElementById('headerPeriodRange');
            if (periodRangeEl) periodRangeEl.innerText = data.periodText;
            if (headerPeriodRangeEl) headerPeriodRangeEl.innerText = data.periodText;
          } catch (_) {}
        }
        if (typeof renderUI === 'function' && typeof currentFilter !== 'undefined') {
          requestAnimationFrame(function () { renderUI(currentFilter); });
        }
        if (isAdmin && typeof showToast === 'function') showToast('تم تحديث البيانات من المشرف/HR', 'success');
      } catch (_) {}
      finally {
        if (indicator) indicator.style.display = 'none';
      }
    })();
    var intervalMs = (typeof isAdminMode === 'function' && isAdminMode()) ? ADMIN_POLL_INTERVAL_MS : LIVE_POLL_INTERVAL_MS;
    livePollTimerId = setTimeout(poll, intervalMs);
  }
  var isAdmin = typeof isAdminMode === 'function' && isAdminMode();
  var firstDelay = isAdmin ? 0 : LIVE_POLL_INTERVAL_MS;
  livePollTimerId = setTimeout(poll, firstDelay);
  if (isAdmin && typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && typeof isAdminMode === 'function' && isAdminMode() && livePollTimerId != null) {
        poll();
      }
    });
  }
}

function stopLivePeriodPolling() {
  if (livePollTimerId != null) {
    clearTimeout(livePollTimerId);
    livePollTimerId = null;
  }
}

if (typeof window !== 'undefined') {
  window.initializeFirebase = initializeFirebase;
  window.syncLivePeriodToFirebase = syncLivePeriodToFirebase;
  window.doSyncLivePeriodNow = doSyncLivePeriodNow;
  window.fetchLivePeriodFromFirebase = fetchLivePeriodFromFirebase;
  window.fetchPeriodFromFirebase = fetchPeriodFromFirebase;
  window.applyLivePeriod = applyLivePeriod;
  window.startLivePeriodPolling = startLivePeriodPolling;
  window.stopLivePeriodPolling = stopLivePeriodPolling;
}

// Wait for Firebase SDK to load
window.addEventListener('load', () => {
  // Try immediate initialization
  initializeFirebase();
  
  // Also try after a delay as fallback
  setTimeout(() => {
    if (!storage) {
      console.log('⏳ Retrying Firebase initialization...');
      initializeFirebase();
    }
  }, 1000);
});
