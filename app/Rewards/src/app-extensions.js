// === Admin Management Functions ===
let adminTokens = {}; // Structure: { periodId: { supervisor: {token, name, createdAt, active}, hr: {...}, accounting: {...}, manager: {...} } }
let currentPeriodId = null;
const ADMIN_NAMES_KEY = 'adora_admin_names'; // أسماء الإداريين — محفوظة عبر الفترات

function loadAdminNames() {
  try {
    const raw = localStorage.getItem(ADMIN_NAMES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) { return {}; }
}

function saveAdminNames(names) {
  try {
    localStorage.setItem(ADMIN_NAMES_KEY, JSON.stringify(names));
  } catch (e) {}
}

// Generate unique token
function generateAdminToken() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);
}

// تحويل period من صيغة DDMMYYYY أو DDMMYYYY__DDMMYYYY إلى YYYY_MM ليتوافق مع Firebase (periods/2026_02.json)
function normalizePeriodIdToFirebase(periodId) {
  if (!periodId || typeof periodId !== 'string') return periodId;
  var s = String(periodId).replace(/-/g, '_').trim();
  if (/^\d{4}_\d{1,2}$/.test(s)) return s;
  var m = s.match(/^(\d{2})(\d{2})(\d{4})/);
  if (m) return m[3] + '_' + m[2];
  return s;
}

// Get current period ID (based on header period range أو من الرابط عند الدخول برابط إداري أو startDate بعد استعادة فترة مغلقة)
// يُرجع دائماً بصيغة YYYY_MM (شرطة سفلية) لأن Firebase يُخزّن الملفات بهذا الشكل (periods/2026_01.json)
// مُعرّض على window لاستخدامه من app.js عند كتابة periods/{periodId}.json
function getCurrentPeriodId() {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    const p = new URLSearchParams(window.location.search).get('period');
    if (p) return normalizePeriodIdToFirebase(String(p).replace(/-/g, '_')) || String(p).replace(/-/g, '_');
  }
  try {
    const startDate = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_rewards_startDate') : null;
    if (startDate && /^\d{4}-\d{2}-\d{2}/.test(startDate)) {
      return startDate.substring(0, 7).replace('-', '_');
    }
  } catch (e) {}
  const periodText = document.getElementById('headerPeriodRange')?.innerText || '';
  if (!periodText || periodText === '-') {
    const now = new Date();
    return now.getFullYear() + '_' + String(now.getMonth() + 1).padStart(2, '0');
  }
  var raw = periodText.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
  var parsed = raw ? raw.replace(/-/g, '_') : '';
  return normalizePeriodIdToFirebase(parsed) || parsed || (new Date().getFullYear() + '_' + String(new Date().getMonth() + 1).padStart(2, '0'));
}
if (typeof window !== 'undefined') {
  window.getCurrentPeriodId = getCurrentPeriodId;
  window.normalizePeriodIdToFirebase = normalizePeriodIdToFirebase;
}

// الرصيد التراكمي: مصدر واحد Firebase فقط — { "اسم الموظف": عدد النقاط } مرتبط بالاسم ولا يُمسح أبداً
var CUMULATIVE_FIREBASE_PATH = 'config/cumulativePoints.json';
var CUMULATIVE_REWARD_THRESHOLD = 100000;   // عند الوصول لـ 100,000 نقطة (باكيج التميز)
var CUMULATIVE_REWARD_AMOUNT = 1000;        // (للمنطق الداخلي؛ العرض: باكيج التميز)

/** نسبة صندوق الدعم من الإجمالي (0–1). من إعدادات الأدمن؛ الافتراضي 0.15 */
function getSupportFundRatio() {
  try {
    var p = typeof getPricingConfig === 'function' ? getPricingConfig() : {};
    var percent = p.supportFundPercent != null ? p.supportFundPercent : 15;
    return Math.min(1, Math.max(0, Number(percent) / 100));
  } catch (_) { return 0.15; }
}

/** جلب الرصيد التراكمي من Firebase فقط — يُخزَّن في الذاكرة (window.__cumulativePointsFromFirebase) للعرض، لا تخزين محلي */
async function loadCumulativePointsFromFirebase() {
  var st = (typeof window !== 'undefined' && window.storage) || (typeof storage !== 'undefined' ? storage : null);
  if (!st || typeof st.ref !== 'function') {
    if (typeof window !== 'undefined') window.__cumulativePointsFromFirebase = {};
    return;
  }
  try {
    var ref = st.ref(CUMULATIVE_FIREBASE_PATH);
    var text = null;
    try {
      if (typeof ref.getBlob === 'function') {
        var blob = await ref.getBlob();
        text = typeof blob.text === 'function' ? await blob.text() : await new Promise(function (res, rej) {
          var r = new FileReader();
          r.onload = function () { res(r.result); };
          r.onerror = rej;
          r.readAsText(blob);
        });
      }
    } catch (e1) {
      try {
        var url = await ref.getDownloadURL();
        var resp = await fetch(url);
        if (resp && resp.ok) text = await resp.text();
      } catch (e2) {}
    }
    var data = {};
    if (text) {
      try {
        var parsed = JSON.parse(text);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed;
      } catch (e) {}
    }
    if (typeof window !== 'undefined') window.__cumulativePointsFromFirebase = data;
  } catch (e) {
    if (console && console.warn) console.warn('loadCumulativePointsFromFirebase:', e.message || e);
    if (typeof window !== 'undefined') window.__cumulativePointsFromFirebase = {};
  }
}
if (typeof window !== 'undefined') window.loadCumulativePointsFromFirebase = loadCumulativePointsFromFirebase;

/** رفع الرصيد التراكمي إلى Firebase بعد إغلاق الفترة أو أي تحديث — مصدر واحد لجميع الأجهزة */
async function saveCumulativePointsToFirebase(cumulative) {
  if (!cumulative || typeof cumulative !== 'object') return;
  var st = (typeof window !== 'undefined' && window.storage) || (typeof storage !== 'undefined' ? storage : null);
  if (!st || typeof st.ref !== 'function') return;
  try {
    var blob = new Blob([JSON.stringify(cumulative)], { type: 'application/json' });
    await st.ref(CUMULATIVE_FIREBASE_PATH).put(blob);
  } catch (e) {
    if (console && console.warn) console.warn('saveCumulativePointsToFirebase:', e.message || e);
  }
}
if (typeof window !== 'undefined') window.saveCumulativePointsToFirebase = saveCumulativePointsToFirebase;

/** رسالة تأكيد مسح الرصيد التراكمي — مع «مسح كل الفترات» يصبح المشروع كيوم برمجته (ما تبقى إلا الفترة المفتوحة) */
function getClearCumulativePointsConfirmMessage() {
  return 'سيُمسح الرصيد التراكمي من النقاط لكل الموظفين (من Firebase والذاكرة).\n\nمع زر «مسح كل الفترات» يصبح المشروع كأنه يوم برمجته — لا آثار قديمة إلا الفترة المفتوحة فقط.\n\nلا يمكن التراجع. هل أنت متأكد؟';
}
if (typeof window !== 'undefined') window.getClearCumulativePointsConfirmMessage = getClearCumulativePointsConfirmMessage;

/** عرض تأكيد ثم مسح الرصيد التراكمي (Firebase + الذاكرة) وتحديث العرض */
async function confirmAndClearCumulativePoints() {
  var msg = typeof getClearCumulativePointsConfirmMessage === 'function'
    ? getClearCumulativePointsConfirmMessage()
    : 'سيُمسح الرصيد التراكمي بالكامل. لا يمكن التراجع. هل أنت متأكد؟';
  if (!confirm(msg)) return;
  try {
    if (typeof window !== 'undefined') window.__cumulativePointsFromFirebase = {};
    if (typeof saveCumulativePointsToFirebase === 'function') await saveCumulativePointsToFirebase({});
    if (typeof populateCumulativePointsCards === 'function') populateCumulativePointsCards();
    if (typeof showToast === 'function') showToast('تم مسح الرصيد التراكمي من النقاط.', 'success');
  } catch (e) {
    if (console && console.warn) console.warn('confirmAndClearCumulativePoints:', e);
    if (typeof showToast === 'function') showToast('فشل مسح الرصيد التراكمي: ' + (e.message || ''), 'error');
  }
}
if (typeof window !== 'undefined') window.confirmAndClearCumulativePoints = confirmAndClearCumulativePoints;

// Safe parse of archived periods from localStorage (returns array)
// مسح مرة واحدة: إزالة فترات الاختبار (لم يكن هناك إغلاق فعلي لأي فترة بعد)
function getArchivedPeriodsSafe() {
  try {
    if (!localStorage.getItem('adora_archived_periods_test_cleared')) {
      localStorage.setItem('adora_archived_periods', '[]');
      localStorage.setItem('adora_archived_periods_test_cleared', '1');
    }
    var raw = localStorage.getItem('adora_archived_periods') || '[]';
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) { return []; }
}

// Load admin tokens from localStorage
function loadAdminTokens() {
  try {
    const saved = localStorage.getItem('adora_admin_tokens');
    if (saved) {
      var parsed = JSON.parse(saved);
      adminTokens = (parsed && typeof parsed === 'object') ? parsed : {};
    }
  } catch (error) {
    console.error('❌ Error loading admin tokens:', error);
    adminTokens = {};
  }
}

// Save admin tokens to localStorage and mirror to Firebase (for links to work on other devices)
function saveAdminTokensCore() {
  try {
    localStorage.setItem('adora_admin_tokens', JSON.stringify(adminTokens));
    const periodId = getCurrentPeriodId();
    const st = (typeof window !== 'undefined' && window.storage);
    if (st && periodId && adminTokens[periodId]) {
      (async () => {
        try {
          if (typeof st.ref === 'function') {
            const ref = st.ref('admin_tokens/' + periodId + '.json');
            const blob = new Blob([JSON.stringify(adminTokens[periodId])], { type: 'application/json' });
            await ref.put(blob);
          }
        } catch (e) {
          if (console && console.warn) console.warn('Firebase admin_tokens upload skip:', e);
        }
      })();
    }
  } catch (error) {
    console.error('❌ Error saving admin tokens:', error);
  }
}

var saveAdminTokensDebounceTimer = null;
var SAVE_ADMIN_TOKENS_DEBOUNCE_MS = 500;
function saveAdminTokens() {
  if (saveAdminTokensDebounceTimer != null) clearTimeout(saveAdminTokensDebounceTimer);
  saveAdminTokensDebounceTimer = setTimeout(function () {
    saveAdminTokensDebounceTimer = null;
    saveAdminTokensCore();
  }, SAVE_ADMIN_TOKENS_DEBOUNCE_MS);
}

// التحقق من الرابط عبر Firebase عند فشل localStorage (ليعمل الرابط على جهاز الإداري المستلم)
// نستخدم getBlob() بدل getDownloadURL()+fetch لتجنب CORS — مع timeout حتى لا يعلق التحميل بلا نهاية
var ADMIN_LINK_FETCH_TIMEOUT_MS = 6000;

async function tryValidateAdminAccessFromFirebase(role, token, periodId) {
  const st = (typeof window !== 'undefined' && window.storage);
  if (!st || typeof st.ref !== 'function') return false;
  var attempt = 0;
  var maxAttempts = 3;
  while (attempt < maxAttempts) {
    try {
      var timeoutPromise = new Promise(function(_, rej) {
        setTimeout(function() { rej(new Error('timeout')); }, ADMIN_LINK_FETCH_TIMEOUT_MS);
      });
      var fetchPromise = (async function() {
        const ref = st.ref('admin_tokens/' + periodId + '.json');
        const blob = await ref.getBlob();
        const text = await (typeof blob.text === 'function' ? blob.text() : new Promise(function(res, rej) { var r = new FileReader(); r.onload = function() { res(r.result); }; r.onerror = rej; r.readAsText(blob); }));
        var data;
        try {
          data = JSON.parse(text);
        } catch (parseErr) {
          return false;
        }
        if (!data || typeof data !== 'object') return false;
        const admin = data[role];
        if (!admin || admin.token !== token || admin.active === false) return false;
        if (!adminTokens[periodId]) adminTokens[periodId] = {};
        adminTokens[periodId][role] = admin;
        try {
          localStorage.setItem('adora_admin_tokens', JSON.stringify(adminTokens));
        } catch (e) {}
        localStorage.setItem('adora_current_role', role);
        localStorage.setItem('adora_current_token', token);
        localStorage.setItem('adora_current_period', periodId);
        return true;
      })();
      var result = await Promise.race([fetchPromise, timeoutPromise]);
      if (result === true) return true;
      if (result === false) return false;
    } catch (e) {
      attempt++;
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1500));
      else return false;
    }
  }
  return false;
}

/** عند فشل جلب التوكن من الخادم: قبول الرابط (role, token, period) من الـ URL وحفظه محلياً ليعمل الرابط دون الاعتماد على Firebase. */
function acceptAdminAccessFromUrl(role, token, periodId) {
  if (!role || !token || !periodId) return false;
  var allowed = ['supervisor', 'hr', 'accounting', 'manager'];
  if (allowed.indexOf(role) === -1) return false;
  if (!adminTokens[periodId]) adminTokens[periodId] = {};
  adminTokens[periodId][role] = {
    token: token,
    name: '',
    createdAt: new Date().toISOString(),
    active: true
  };
  try {
    localStorage.setItem('adora_admin_tokens', JSON.stringify(adminTokens));
  } catch (e) { return false; }
  return true;
}

// Initialize admin tokens for current period
function initializeAdminTokensForPeriod() {
  const periodId = getCurrentPeriodId();
  currentPeriodId = periodId;
  
  if (!adminTokens[periodId]) {
    var savedNames = loadAdminNames();
    adminTokens[periodId] = {
      supervisor: {
        token: generateAdminToken(),
        name: savedNames.supervisor || '',
        createdAt: new Date().toISOString(),
        active: true
      },
      hr: {
        token: generateAdminToken(),
        name: savedNames.hr || '',
        createdAt: new Date().toISOString(),
        active: true
      },
      accounting: {
        token: generateAdminToken(),
        name: savedNames.accounting || '',
        createdAt: new Date().toISOString(),
        active: true
      },
      manager: {
        token: generateAdminToken(),
        name: savedNames.manager || '',
        createdAt: new Date().toISOString(),
        active: true
      }
    };
    saveAdminTokens();
  }
}

// Show admin management modal — النافذة تفتح فوراً؛ المزامنة مع Firebase تتم في الخلفية بعد الفتح
function showAdminManagementModal() {
  const modal = document.getElementById('adminManagementModal');
  if (!modal) return;

  if (typeof window.initializeFirebase === 'function') window.initializeFirebase();
  initializeAdminTokensForPeriod();
  saveAdminTokens();

  var hasData = false;
  try {
    var savedDb = localStorage.getItem('adora_rewards_db');
    if (savedDb) {
      var parsed = JSON.parse(savedDb);
      hasData = Array.isArray(parsed) && parsed.length > 0;
    }
  } catch (_) {}

  populateAdminManagementModal(hasData);
  modal.classList.remove('hidden');
  modal.style.display = 'flex';

  if (!hasData) {
    if (typeof showToast === 'function') showToast('يجب رفع ملف الفترة أولاً ثم فتح هذه النافذة لتفعيل الروابط للإداريين', 'error');
    return;
  }

  (async function () {
    try {
      if (typeof window.doSyncLivePeriodNow === 'function') {
        if (typeof showToast === 'function') showToast('جاري تحديث Firebase...', 'info');
        try {
          await window.doSyncLivePeriodNow();
          if (typeof showToast === 'function') showToast('تمت المزامنة مع Firebase. يمكنك الآن إرسال الروابط للإداريين — لا ترسل الرابط قبل ظهور هذه الرسالة.', 'success');
        } catch (syncErr) {
          var msg = (syncErr && syncErr.message) ? String(syncErr.message) : 'فشل تحديث Firebase — تحقق من الاتصال وجرّب فتح «إدارة الإداريين» مرة أخرى';
          if (typeof showToast === 'function') showToast(msg, 'error');
        }
      }
    } catch (_) {}
    saveAdminTokens();
  })();
}

// Close admin management modal
function closeAdminManagementModal(event) {
  if (event && event.target !== event.currentTarget) return;
  const modal = document.getElementById('adminManagementModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Populate admin management modal — hasData: إن كان false يُعرض تحذير أن رفع الملف ضروري لتفعيل الروابط
function populateAdminManagementModal(hasData) {
  const container = document.getElementById('adminManagementContent');
  if (!container) return;
  
  const periodId = getCurrentPeriodId();
  if (!adminTokens[periodId]) adminTokens[periodId] = {};
  const tokens = adminTokens[periodId];
  const periodTextAdminMgmt = (document.getElementById('headerPeriodRange') && document.getElementById('headerPeriodRange').innerText) ? document.getElementById('headerPeriodRange').innerText : 'غير محدد';
  
  var html = '';
  if (hasData === false) {
    html += '<div class="mb-6 p-4 rounded-xl border-2 border-amber-500/50 bg-amber-500/10 text-amber-200" role="alert"><p class="font-bold mb-1">⚠️ يجب رفع ملف الفترة أولاً</p><p class="text-sm text-gray-300">الروابط أدناه لن تعمل للمشرف و HR حتى ترفع ملف الإكسيل ثم تفتح «إدارة الإداريين» مرة أخرى لتحديث Firebase.</p></div>';
  } else {
    html += '<div class="mb-4 p-3 rounded-xl border border-cyan-500/40 bg-cyan-500/10 text-cyan-200" role="status"><p class="text-sm"><strong>💡 قبل إرسال الرابط للمشرف أو HR:</strong> انتظر ظهور «تمت المزامنة» في أعلى الصفحة (بعد النقل من التحليل أو رفع الملف). إن أرسلت الرابط قبل المزامنة، لن يستطيع الإداري تحميل أسماء الموظفين.</p></div>';
  }
  
  const roles = [
    { key: 'supervisor', label: 'المشرف', icon: '👨‍💼', description: 'إدخال تقييمات بوكينج وجوجل' },
    { key: 'hr', label: 'HR', icon: '👔', description: 'تفعيل 26 يوم وإدخال أيام الحضور' },
    { key: 'accounting', label: 'الحسابات', icon: '💰', description: 'عرض التقارير والطباعة' },
    { key: 'manager', label: 'المدير العام', icon: '👑', description: 'عرض الإحصائيات فقط' }
  ];
  
  html += '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  
  const savedNames = loadAdminNames();
  roles.forEach(role => {
    if (!tokens[role.key]) tokens[role.key] = { token: generateAdminToken(), name: savedNames[role.key] || '', createdAt: new Date().toISOString(), active: true };
    const admin = tokens[role.key];
    const baseUrl = window.location.origin;
    const link = baseUrl + '/' + role.key + '/' + admin.token + '/' + periodId;
    const displayName = (admin.name || savedNames[role.key] || '').trim();
    const adminNameEsc = displayName.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const periodEsc = (periodTextAdminMgmt || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const roleLabelEsc = (role.label || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const linkEsc = (link || '').replace(/'/g, "\\'");
    html += `
      <div class="glass p-4 rounded-xl border border-purple-400/30">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-2xl">${role.icon}</span>
          <div>
            <h3 class="text-lg font-bold text-purple-400">${role.label}</h3>
            <p class="text-xs text-gray-400">${role.description}</p>
          </div>
        </div>
        <div class="mb-3 min-w-0">
          <label class="block text-sm font-bold text-gray-300 mb-1">اسم الإداري (اختياري):</label>
          <input type="text" id="adminName_${role.key}" value="${(displayName || '').replace(/"/g, '&quot;')}" 
            placeholder="أدخل اسم الإداري..." 
            tabindex="0"
            class="w-full min-w-0 px-3 py-2.5 rounded-lg text-sm text-white bg-white/10 border border-white/20 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30 min-h-[44px]"
            onchange="updateAdminName('${role.key}', this.value)"
            aria-label="اسم الإداري ${role.label}">
        </div>
        <div class="mb-3 min-w-0">
          <label class="block text-sm font-bold text-gray-300 mb-1">الرابط:</label>
          <div class="flex gap-2 items-stretch min-w-0 flex-wrap sm:flex-nowrap">
            <input type="text" id="adminLink_${role.key}" value="${link.replace(/"/g, '&quot;')}" readonly
              tabindex="0"
              class="flex-1 min-w-[200px] sm:min-w-[280px] px-3 py-2.5 rounded-lg text-sm text-gray-300 bg-white/5 border border-white/20 focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30"
              title="انسخ الرابط من هنا أو زر نسخ"
              aria-label="رابط ${role.label}">
            <button type="button" onclick="copyAdminLink('${role.key}')" tabindex="0"
              class="flex-shrink-0 px-4 py-2.5 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-bold whitespace-nowrap min-h-[44px]">
              📋 نسخ
            </button>
          </div>
        </div>
        <button onclick="sendWhatsAppMessageAdmin('${adminNameEsc}', '${roleLabelEsc}', '${periodEsc}', '${linkEsc}')"
          class="mb-3 w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
          </svg>
          <span>إرسال عبر واتساب</span>
        </button>
        <div class="flex gap-2">
          <button onclick="clearAdminSubmissionAndReopenEntry('${role.key}')" 
            class="flex-1 px-3 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm font-bold"
            title="مسح حالة «تم الإرسال» لهذا الدور — نفس الرابط يفتح واجهة الإدخال مرة أخرى">
            🔄 مسح الإرسال وإعادة الإدخال
          </button>
          <button onclick="testAdminLink('${role.key}')" 
            class="flex-1 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-bold">
            🔗 اختبار
          </button>
        </div>
      </div>
    `;
  });
  saveAdminTokens();
  html += '</div>';
  container.innerHTML = html;
}

// Update admin name — يحفظ في التوكنات الحالية وفي adora_admin_names للاستمرار عبر الفترات
function updateAdminName(role, name) {
  const periodId = getCurrentPeriodId();
  if (!adminTokens[periodId]) {
    initializeAdminTokensForPeriod();
  }
  if (!adminTokens[periodId][role]) {
    adminTokens[periodId][role] = { token: generateAdminToken(), name: '', createdAt: new Date().toISOString(), active: true };
  }
  const trimmed = String(name || '').trim();
  adminTokens[periodId][role].name = trimmed;
  var names = loadAdminNames();
  names[role] = trimmed;
  saveAdminNames(names);
  saveAdminTokens();
  var inp = document.getElementById('adminLink_' + role);
  if (inp) {
    var base = window.location.origin;
    var t = adminTokens[periodId][role].token;
    inp.value = base + '/' + encodeURIComponent(role) + '/' + encodeURIComponent(t) + '/' + encodeURIComponent(periodId);
  }
  showToast('✅ تم تحديث اسم الإداري', 'success');
}

// اسم الإداري للدور الحالي (من localStorage أو بعد جلب Firebase) — للترحيب بالحسابات/المدير
function getAdminNameForRole(role) {
  try {
    var periodId = typeof getCurrentPeriodId === 'function' ? getCurrentPeriodId() : '';
    if (!periodId || typeof adminTokens === 'undefined' || !adminTokens[periodId] || !adminTokens[periodId][role]) return '';
    return String(adminTokens[periodId][role].name || '').trim();
  } catch (e) { return ''; }
}

// Copy admin link — نُفعّل Firebase ونرفع التوكنات عند النسخ ليعمل الرابط على جهاز الإداري
// 1) نسخ من الحقل المعروض، 2) إن فشل: textarea مؤقت — ليعمل حتى مع فتح الـ Console
function copyAdminLink(role) {
  if (typeof window.initializeFirebase === 'function') window.initializeFirebase();
  saveAdminTokens();
  var input = document.getElementById('adminLink_' + role);
  var text = input ? (input.value || '').trim() : '';
  if (!text) {
    if (typeof showToast === 'function') showToast('لا يوجد رابط للنسخ', 'error');
    return;
  }
  var copied = false;
  if (input) {
    try {
      input.focus();
      input.select();
      input.setSelectionRange(0, text.length);
      copied = document.execCommand('copy');
    } catch (e) {}
  }
  if (!copied) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:0;outline:none;boxShadow:none;background:transparent;opacity:0.01;';
    document.body.appendChild(ta);
    ta.focus();
    ta.setSelectionRange(0, text.length);
    try {
      copied = document.execCommand('copy');
    } catch (e) {}
    document.body.removeChild(ta);
  }
  if (copied && typeof showToast === 'function') showToast('✅ تم نسخ الرابط', 'success');
  else if (typeof showToast === 'function') showToast('النسخ فشل — حدّد الرابط في الحقل ثم Ctrl+C', 'error');
}

// مسح إرسال المشرف/HR وإعادة فتح الإدخال — نفس الرابط يعيد واجهة الإدخال (لا تغيير توكن)
function clearAdminSubmissionAndReopenEntry(role) {
  var roleLabel = role === 'supervisor' ? 'المشرف' : (role === 'hr' ? 'HR' : role);
  if (!confirm('مسح حالة «تم الإرسال» لـ ' + roleLabel + '؟ بعد المسح يمكنك إرسال نفس الرابط مرة أخرى وسيظهر له واجهة الإدخال من جديد.')) return;
  var clearFn = typeof window.clearAdminSubmittedForRole === 'function' ? window.clearAdminSubmittedForRole : null;
  if (!clearFn) {
    if (typeof showToast === 'function') showToast('Firebase غير جاهز — تحقق من الاتصال', 'error');
    return;
  }
  clearFn(role)
    .then(function () {
      if (typeof showToast === 'function') showToast('✅ تم مسح الإرسال. أرسل نفس الرابط لـ ' + roleLabel + ' للإدخال مرة أخرى.', 'success');
      if (typeof refreshLivePeriodFromFirebase === 'function') refreshLivePeriodFromFirebase();
    })
    .catch(function (err) {
      if (typeof showToast === 'function') showToast(err && err.message ? err.message : 'فشل مسح الإرسال. تحقق من Firebase.', 'error');
    });
}

// Regenerate admin token (احتياطي — استبدل بالزر «مسح الإرسال وإعادة الإدخال» للمشرف/HR)
function regenerateAdminToken(role) {
  if (!confirm(`هل أنت متأكد من إعادة توليد رابط ${role}؟ الرابط القديم لن يعمل بعد الآن.`)) return;
  
  const periodId = getCurrentPeriodId();
  if (!adminTokens[periodId]) {
    initializeAdminTokensForPeriod();
  }
  adminTokens[periodId][role].token = generateAdminToken();
  adminTokens[periodId][role].createdAt = new Date().toISOString();
  saveAdminTokens();
  
  populateAdminManagementModal();
  showToast('✅ تم إعادة توليد الرابط بنجاح', 'success');
}

// Test admin link
function testAdminLink(role) {
  const periodId = getCurrentPeriodId();
  const admin = adminTokens[periodId]?.[role];
  let link = null;
  if (admin && admin.token) {
    const baseUrl = window.location.origin;
    const isDev = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    if (isDev) {
      link = baseUrl + '/rewards/?role=' + encodeURIComponent(role) + '&token=' + encodeURIComponent(admin.token) + '&period=' + encodeURIComponent(periodId);
    } else {
      link = baseUrl + '/' + role + '/' + admin.token + '/' + periodId;
    }
  }
  if (!link) {
    const input = document.getElementById('adminLink_' + role);
    if (input && input.value) link = input.value;
  }
  if (!link) {
    if (typeof showToast === 'function') showToast('لا يوجد رابط لهذا الدور — جرّب إعادة توليد الرابط', 'error');
    return;
  }
  const w = window.open(link, '_blank', 'noopener');
  if (typeof showToast === 'function') showToast(w ? 'تم فتح الرابط في نافذة جديدة' : 'اسمح بفتح النوافذ المنبثقة للموقع', w ? 'success' : 'info');
}

// Deactivate all tokens for a period (when closing period)
function deactivatePeriodTokens(periodId) {
  if (adminTokens[periodId]) {
    Object.keys(adminTokens[periodId]).forEach(role => {
      adminTokens[periodId][role].active = false;
    });
    saveAdminTokens();
  }
}

// Validate admin token and role
function validateAdminAccess(role, token, periodId) {
  if (!adminTokens[periodId]) {
    return { valid: false, reason: 'الفترة غير موجودة' };
  }
  
  const admin = adminTokens[periodId][role];
  if (!admin) {
    return { valid: false, reason: 'الدور غير موجود' };
  }
  
  if (admin.token !== token) {
    return { valid: false, reason: 'الرابط غير صحيح' };
  }
  
  if (!admin.active) {
    return { valid: false, reason: 'الفترة مغلقة - الرابط غير نشط' };
  }
  
  // Check if period is still current
  const currentPeriod = getCurrentPeriodId();
  if (periodId !== currentPeriod) {
    return { valid: false, reason: 'الفترة المحددة لم تعد نشطة' };
  }
  
  return { valid: true, admin: admin };
}

// Log admin action (audit log)
function logAdminAction(role, action, details) {
  const log = {
    role: role,
    action: action,
    details: details,
    timestamp: new Date().toISOString(),
    periodId: getCurrentPeriodId()
  };
  
  try {
    let logs = [];
    const saved = localStorage.getItem('adora_admin_logs');
    if (saved) {
      var parsed = JSON.parse(saved);
      logs = Array.isArray(parsed) ? parsed : [];
    }
    logs.push(log);
    // Keep only last 1000 logs
    if (logs.length > 1000) {
      logs = logs.slice(-1000);
    }
    localStorage.setItem('adora_admin_logs', JSON.stringify(logs));
    
    // Also try to save to Firebase if available
    // (Firebase code would go here)
  } catch (error) {
    console.error('❌ Error logging admin action:', error);
  }
}

// Initialize admin tokens on load
if (typeof loadAdminTokens === 'function') {
  loadAdminTokens();
}

// === Close Period Functions ===
function showClosePeriodModal() {
  const modal = document.getElementById('closePeriodModal');
  const periodTextEl = document.getElementById('closePeriodPeriodText');
  if (modal && periodTextEl) {
    const periodText = document.getElementById('headerPeriodRange')?.innerText || 'غير محدد';
    periodTextEl.innerText = periodText;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  }
}

function closeClosePeriodModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.closest('.glass')) {
    return;
  }
  const modal = document.getElementById('closePeriodModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

async function confirmClosePeriod() {
  try {
    showToast('⏳ جاري إغلاق الفترة...', 'info');
    
    const periodId = reportStartDate ? reportStartDate.substring(0, 7).replace('-', '_') : 
                     new Date().toISOString().substring(0, 7).replace('-', '_');
    
    // Deactivate all admin tokens for this period
    deactivatePeriodTokens(periodId);
    const periodText = document.getElementById('headerPeriodRange')?.innerText || 'غير محدد';
    const closedAt = new Date().toISOString();
    
    const periodData = {
      periodId: periodId,
      periodText: periodText,
      startDate: reportStartDate || null,
      endDate: closedAt,
      closedAt: closedAt,
      data: {
        db: db,
        branches: [...branches],
        evalRate: currentEvalRate,
        startDate: reportStartDate,
        periodText: periodText,
        employeeCodes: employeeCodesMap,
        discounts: discounts || [],
        discountTypes: discountTypes || [],
        negativeRatingsCount: (typeof window !== 'undefined' && window.branchNegativeRatingsCount) ? window.branchNegativeRatingsCount : {},
        rewardPricing: (typeof getPricingConfig === 'function') ? getPricingConfig() : (typeof window !== 'undefined' && window.rewardPricing ? window.rewardPricing : null)
      }
    };
    
    // Upload to Firebase Storage using CDN
    if (storage && typeof storage.ref === 'function') {
      try {
        const storageRef = storage.ref(`periods/${periodId}.json`);
        const blob = new Blob([JSON.stringify(periodData)], { type: 'application/json' });
        
        // Use put() method with proper error handling
        await storageRef.put(blob);
        console.log('✅ Period uploaded to Firebase Storage');
        
        // Also save to localStorage as backup
        const archivedPeriods = JSON.parse(localStorage.getItem('adora_archived_periods') || '[]');
        const existingIndex = archivedPeriods.findIndex(p => p.periodId === periodId);
        if (existingIndex >= 0) {
          archivedPeriods[existingIndex] = periodData;
        } else {
          archivedPeriods.push(periodData);
        }
        if (archivedPeriods.length > 24) {
          archivedPeriods.shift();
        }
        localStorage.setItem('adora_archived_periods', JSON.stringify(archivedPeriods));
        console.log('✅ Period also saved to localStorage as backup');
      } catch (error) {
        console.error('❌ Firebase upload error:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          stack: error.stack
        });
        
        // Fallback to localStorage
        const archivedPeriods = getArchivedPeriodsSafe();
        const existingIndex = archivedPeriods.findIndex(p => p.periodId === periodId);
        if (existingIndex >= 0) {
          archivedPeriods[existingIndex] = periodData;
        } else {
          archivedPeriods.push(periodData);
        }
        if (archivedPeriods.length > 24) {
          archivedPeriods.shift();
        }
        localStorage.setItem('adora_archived_periods', JSON.stringify(archivedPeriods));
        console.log('✅ Period saved to localStorage (Firebase fallback)');
      }
    } else {
      // Fallback: Save to localStorage
      console.warn('⚠️ Firebase Storage not available, using localStorage only');
      const archivedPeriods = getArchivedPeriodsSafe();
      const existingIndex = archivedPeriods.findIndex(p => p.periodId === periodId);
      if (existingIndex >= 0) {
        archivedPeriods[existingIndex] = periodData;
      } else {
        archivedPeriods.push(periodData);
      }
      if (archivedPeriods.length > 24) {
        archivedPeriods.shift();
      }
      localStorage.setItem('adora_archived_periods', JSON.stringify(archivedPeriods));
      console.log('✅ Period saved to localStorage (Firebase not available)');
    }
    
    // الرصيد التراكمي: Firebase فقط — جلب الحالي من Firebase، إضافة أرصدة الفترة (نسخة الجدول)، حفظ على Firebase، تحديث العرض
    try {
      var pointsThisPeriod = (typeof window !== 'undefined' && window.__lastDisplayedPeriodPoints && typeof window.__lastDisplayedPeriodPoints === 'object' && Object.keys(window.__lastDisplayedPeriodPoints).length > 0)
        ? window.__lastDisplayedPeriodPoints
        : (typeof getEmployeePointsBalanceForPeriodDb === 'function' ? getEmployeePointsBalanceForPeriodDb(db) : (typeof getEmployeePointsForPeriodDb === 'function' ? getEmployeePointsForPeriodDb(db) : {}));
      var cumulative = (typeof window !== 'undefined' && window.__cumulativePointsFromFirebase && typeof window.__cumulativePointsFromFirebase === 'object')
        ? window.__cumulativePointsFromFirebase
        : {};
      if (Object.keys(cumulative).length === 0 && typeof loadCumulativePointsFromFirebase === 'function') {
        await loadCumulativePointsFromFirebase();
        cumulative = (typeof window !== 'undefined' && window.__cumulativePointsFromFirebase && typeof window.__cumulativePointsFromFirebase === 'object')
          ? window.__cumulativePointsFromFirebase
          : {};
      }
      for (var empName in pointsThisPeriod) {
        if (!pointsThisPeriod.hasOwnProperty(empName)) continue;
        var prev = Number(cumulative[empName]) || 0;
        var add = Number(pointsThisPeriod[empName]) || 0;
        cumulative[empName] = prev + add;
      }
      if (typeof saveCumulativePointsToFirebase === 'function') await saveCumulativePointsToFirebase(cumulative);
      if (typeof window !== 'undefined') {
        window.__cumulativePointsFromFirebase = cumulative;
        window.__lastDisplayedPeriodPoints = {};
      }
      if (typeof populateCumulativePointsCards === 'function') populateCumulativePointsCards();
    } catch (e) { console.warn('Cumulative points update on close:', e); }

    showToast('✅ تم إغلاق الفترة بنجاح', 'success');
    closeClosePeriodModal();

    // البقاء في الصفحة والانتقال إلى «الفترات المغلقة» مع تحديد الفترة المغلقة (بدون إعادة توجيه)
    if (typeof returnToUpload === 'function') {
      returnToUpload(true, false, true, function () {
        if (typeof showReportsPage === 'function') showReportsPage();
        if (typeof switchReportsTab === 'function') switchReportsTab('archived');
        if (typeof loadArchivedPeriodsList === 'function') {
          loadArchivedPeriodsList().then(function () {
            var sel = document.getElementById('archivedPeriodSelect');
            if (sel && periodId) {
              sel.value = periodId;
              if (typeof loadArchivedPeriod === 'function') loadArchivedPeriod(periodId);
            }
          });
        }
      });
    }

  } catch (error) {
    console.error('❌ Error closing period:', error);
    showToast('❌ خطأ في إغلاق الفترة: ' + error.message, 'error');
  }
}

// === Employee Codes Modal Functions ===
function showEmployeeCodesModal() {
  const modal = document.getElementById('employeeCodesModal');
  const employeeCodesList = document.getElementById('employeeCodesList');
  const adminLinksList = document.getElementById('adminLinksList');
  if (!modal) return;
  
  // Load admin tokens
  if (typeof loadAdminTokens === 'function') {
    loadAdminTokens();
  }
  if (typeof initializeAdminTokensForPeriod === 'function') {
    initializeAdminTokensForPeriod();
  }
  
  // Populate employee codes
  if (employeeCodesList) {
    const uniqueEmployees = new Map();
    db.forEach(emp => {
      if (!uniqueEmployees.has(emp.name)) {
        uniqueEmployees.set(emp.name, emp);
      }
    });
    
    const sortedEmployees = Array.from(uniqueEmployees.values()).sort((a, b) => a.name.localeCompare(b.name));
    const periodText = document.getElementById('headerPeriodRange')?.innerText || 'غير محدد';
    
    let html = '<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">';
    sortedEmployees.forEach(emp => {
      const code = emp.employeeCode || employeeCodesMap[emp.name] || 'N/A';
      const url = window.location.origin + '/e/' + code;
      html += `
        <div class="glass p-5 rounded-xl border border-white/20 hover:border-turquoise/50 transition-all">
          <div class="text-center">
            <div class="text-lg font-bold text-white mb-2">${emp.name}</div>
            <div class="text-2xl font-black text-turquoise mb-4">${code}</div>
            <div class="flex justify-center mb-3">
              <div class="qr-code-container">
                <div id="qrcode-${code}" class="qr-code-wrapper"></div>
                <div class="qr-code-overlay">
                  <div class="qr-logo">💎</div>
                </div>
              </div>
            </div>
            <button onclick="sendWhatsAppMessage('${code}', '${emp.name}', '${periodText}', '${url}')" 
              class="mt-3 w-full bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg flex items-center justify-center gap-2 transition-all">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <span>إرسال عبر واتساب</span>
            </button>
            <a href="${url}" target="_blank" class="mt-2 text-xs text-turquoise hover:underline inline-flex items-center gap-1">
              <span>افتح الرابط</span>
              <span>🔗</span>
            </a>
          </div>
        </div>
      `;
    });
    html += '</div>';
    employeeCodesList.innerHTML = html;
    
    setTimeout(() => {
      sortedEmployees.forEach(emp => {
        const code = emp.employeeCode || employeeCodesMap[emp.name];
        if (code && typeof QRCode !== 'undefined') {
          const qrElement = document.getElementById(`qrcode-${code}`);
          if (qrElement && !qrElement.querySelector('canvas')) {
            const url = window.location.origin + '/e/' + code;
            new QRCode(qrElement, {
              text: url,
              width: 200,
              height: 200,
              colorDark: '#0f172a',
              colorLight: '#ffffff',
              correctLevel: QRCode.CorrectLevel.H,
              margin: 3
            });
          }
        }
      });
    }, 100);
  }
  
  // روابط الإداريين: مصدر واحد فقط — «إدارة الإداريين» من الترويسة (لا نُكرّر التوليد هنا)
  if (adminLinksList) {
    adminLinksList.innerHTML = `
      <div class="glass p-5 rounded-xl border border-purple-400/30 bg-purple-500/5">
        <p class="text-gray-300 text-sm mb-4 leading-relaxed">
          روابط الإداريين (المشرف، HR، الحسابات، المدير العام) — مكان واحد لنسخ الروابط وتوليدها وإرسالها عبر واتساب. من الترويسة اضغط «إدارة الإداريين».
        </p>
        <button type="button" onclick="closeEmployeeCodesModal(); showAdminManagementModal();" class="w-full px-4 py-3 rounded-xl font-bold text-white transition-all flex items-center justify-center gap-2" style="background: rgba(168, 85, 247, 0.3); border: 1px solid rgba(168, 85, 247, 0.6);">
          <span>👥</span>
          <span>فتح إدارة الإداريين</span>
        </button>
      </div>
    `;
  }
  
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function copyAdminLinkFromCodes(role) {
  if (typeof window.initializeFirebase === 'function') window.initializeFirebase();
  saveAdminTokens();
  const periodId = getCurrentPeriodId();
  const admin = adminTokens[periodId]?.[role];
  if (!admin) return;
  const baseUrl = window.location.origin;
  const link = baseUrl + '/' + role + '/' + admin.token + '/' + periodId;

  var ta = document.createElement('textarea');
  ta.value = link;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;width:2em;height:2em;padding:0;border:0;outline:none;boxShadow:none;background:transparent;opacity:0.01;';
  document.body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(0, link.length);
  var copied = false;
  try {
    copied = document.execCommand('copy');
  } catch (e) {}
  document.body.removeChild(ta);
  if (copied && typeof showToast === 'function') showToast('✅ تم نسخ الرابط', 'success');
  else if (typeof showToast === 'function') showToast('النسخ فشل — حدّد الرابط ثم Ctrl+C', 'error');
}

function closeEmployeeCodesModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.closest('.glass')) {
    return;
  }
  const modal = document.getElementById('employeeCodesModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// === Mobile Branch Selection for Duplicate Employees ===
function showBranchSelectionForMobileEmployee(employees, code) {
  // Hide all main UI elements
  document.getElementById('dashboard')?.classList.add('hidden');
  document.getElementById('uploadBox')?.classList.add('hidden');
  document.getElementById('actionBtns').style.display = 'none';
  const header = document.querySelector('header');
  if (header) header.style.display = 'none';
  
  // Create branch selection UI
  const body = document.body;
  const employeeName = employees[0].name;
  
  body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%); color: white; font-family: 'IBM Plex Sans Arabic', sans-serif; padding: 2rem;">
      <div style="background: rgba(255, 255, 255, 0.1); padding: 3rem; border-radius: 20px; border: 2px solid rgba(20, 184, 166, 0.5); max-width: 600px; width: 100%; backdrop-blur-xl;">
        <h1 style="font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; color: #14b8a6; text-align: center;">اختر الفرع</h1>
        <p style="color: #94a3b8; margin-bottom: 2rem; text-align: center;">${employeeName} موجود في ${employees.length} فروع. اختر الفرع لعرض التقرير:</p>
        <div style="display: flex; flex-direction: column; gap: 1rem;">
          ${employees.map(emp => `
            <button onclick="showMobileEmployeeReport('${emp.id}', '${code}')" 
              style="background: rgba(20, 184, 166, 0.2); border: 2px solid rgba(20, 184, 166, 0.5); color: white; padding: 1.5rem; border-radius: 12px; font-size: 1.1rem; font-weight: 700; cursor: pointer; transition: all 0.3s; text-align: right; display: flex; justify-content: space-between; align-items: center;"
              onmouseover="this.style.background='rgba(20, 184, 166, 0.4)'; this.style.borderColor='rgba(20, 184, 166, 0.8)';"
              onmouseout="this.style.background='rgba(20, 184, 166, 0.2)'; this.style.borderColor='rgba(20, 184, 166, 0.5)';">
              <div>
                <div style="font-size: 1.2rem; font-weight: 900; margin-bottom: 0.5rem;">${emp.branch}</div>
                <div style="font-size: 0.9rem; color: #94a3b8;">الحجوزات: ${emp.count}</div>
              </div>
              <span style="font-size: 1.5rem; color: #14b8a6;">→</span>
            </button>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

// Show employee report for mobile (with ability to switch branches)
function showMobileEmployeeReport(empId, code) {
  // Show employee report
  showEmployeeReport(empId);
  
  // Hide main UI
  document.getElementById('dashboard')?.classList.add('hidden');
  document.getElementById('uploadBox')?.classList.add('hidden');
  document.getElementById('actionBtns').style.display = 'none';
  const header = document.querySelector('header');
  if (header) header.style.display = 'none';
  
  // Check if employee is duplicate
  const employee = db.find(e => e.id === empId);
  if (employee) {
    const allEmployeesWithSameCode = db.filter(emp => (emp.employeeCode || employeeCodesMap[emp.name]) === code);
    
    if (allEmployeesWithSameCode.length > 1) {
      // Add branch switcher to report modal
      const modal = document.getElementById('employeeReportModal');
      if (modal) {
        const content = document.getElementById('employeeReportContent');
        if (content) {
          // Add branch switcher at the top of content
          const branchSwitcher = document.createElement('div');
          branchSwitcher.id = 'mobileBranchSwitcher';
          branchSwitcher.style.cssText = 'background: rgba(20, 184, 166, 0.2); padding: 1rem; border-radius: 12px; margin-bottom: 1.5rem; border: 2px solid rgba(20, 184, 166, 0.5);';
          branchSwitcher.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
              <span style="color: #14b8a6; font-weight: 700; font-size: 0.9rem;">الفرع الحالي: ${employee.branch}</span>
              <button onclick="showBranchSelectionForMobileEmployee([${allEmployeesWithSameCode.map(e => `{id:'${e.id}',name:'${e.name}',branch:'${e.branch}',count:${e.count}}`).join(',')}], '${code}')" 
                style="background: rgba(20, 184, 166, 0.3); border: 1px solid rgba(20, 184, 166, 0.6); color: white; padding: 0.5rem 1rem; border-radius: 8px; font-size: 0.85rem; font-weight: 600; cursor: pointer;">
                🔄 تغيير الفرع
              </button>
            </div>
            <div style="font-size: 0.8rem; color: #94a3b8; text-align: center;">
              يمكنك التنقل بين الفروع: ${allEmployeesWithSameCode.map(e => e.branch).join(' - ')}
            </div>
          `;
          content.insertBefore(branchSwitcher, content.firstChild);
        }
      }
    }
  }
  
  // Show PWA install prompt after 3 seconds
  setTimeout(() => {
    if (deferredPrompt && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
      if (confirm('هل تريد تثبيت التطبيق على جهازك لتسهيل الوصول إلى تقريرك؟')) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          console.log(`User response: ${choiceResult.outcome}`);
          deferredPrompt = null;
        });
      }
    }
  }, 3000);
}

// === WhatsApp Share Function ===
function sendWhatsAppMessage(code, employeeName, periodText, url) {
  try {
    // Get QR code canvas and convert to base64
    const qrElement = document.getElementById(`qrcode-${code}`);
    if (!qrElement) {
      showToast('❌ لم يتم العثور على QR Code', 'error');
      return;
    }
    
    const canvas = qrElement.querySelector('canvas');
    if (!canvas) {
      showToast('⏳ جاري تحميل QR Code...', 'info');
      setTimeout(() => sendWhatsAppMessage(code, employeeName, periodText, url), 500);
      return;
    }
    
    // Convert canvas to blob for download/sharing
    canvas.toBlob((blob) => {
      // Create WhatsApp message with QR code info
      const message = `السلام عليكم - ${employeeName} - الرجاء الاطلاع على مكافآت فترة ${periodText}\n\n🔗 الرابط:\n${url}\n\n📱 يمكنك مسح QR Code أدناه أو فتح الرابط مباشرة`;
      
      // Encode message for URL
      const encodedMessage = encodeURIComponent(message);
      
      // Check if mobile or desktop
      const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      
      if (isMobile) {
        // For mobile: Use WhatsApp API with phone number (you can set a default or ask)
        // Alternative: Use share API if available
        if (navigator.share) {
          // Use Web Share API (works on mobile browsers)
          navigator.share({
            title: `مكافآت ${employeeName}`,
            text: message,
            url: url
          }).catch(err => {
            console.log('Share cancelled or failed:', err);
            // Fallback to WhatsApp URL
            const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
            window.open(whatsappUrl, '_blank');
          });
        } else {
          // Fallback: Open WhatsApp with message
          const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
          window.open(whatsappUrl, '_blank');
          
          // Show instructions to add QR code image manually
          setTimeout(() => {
            showToast('📱 يرجى إضافة QR Code يدوياً من الصورة أعلاه', 'info');
          }, 1000);
        }
      } else {
        // For desktop: Open WhatsApp Web
        const whatsappUrl = `https://web.whatsapp.com/send?text=${encodedMessage}`;
        window.open(whatsappUrl, '_blank');
        
        // Show instructions to add QR code image manually
        setTimeout(() => {
          showToast('💡 يرجى إضافة QR Code يدوياً من الصورة أعلاه', 'info');
        }, 1000);
      }
      
      // Also create a download link for QR code image (optional)
      const qrImageUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `QR-${employeeName}-${code}.png`;
      link.href = qrImageUrl;
      // Don't auto-click, just make it available
      
    }, 'image/png');
    
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error);
    showToast('❌ خطأ في إرسال الرسالة: ' + error.message, 'error');
  }
}

// إرسال رابط الإداري عبر واتساب برسالة ترحيبية (نفس أسلوب الموظفين)
function sendWhatsAppMessageAdmin(adminName, roleLabel, periodText, url) {
  try {
    var displayName = (adminName && String(adminName).trim()) ? String(adminName).trim() : roleLabel;
    var message = 'السلام عليكم - ' + displayName + ' - الرجاء استخدام الرابط أدناه للدخول إلى لوحة المكافآت بدور "' + roleLabel + '" لفترة ' + periodText + '\n\n\uD83D\uDCE2 الرابط:\n' + url;
    var encodedMessage = encodeURIComponent(message);
    var isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (isMobile) {
      if (navigator.share) {
        navigator.share({ title: 'رابط لوحة المكافآت - ' + roleLabel, text: message, url: url }).catch(function () {
          window.open('https://wa.me/?text=' + encodedMessage, '_blank');
        });
      } else {
        window.open('https://wa.me/?text=' + encodedMessage, '_blank');
      }
    } else {
      window.open('https://web.whatsapp.com/send?text=' + encodedMessage, '_blank');
      setTimeout(function () { if (typeof showToast === 'function') showToast('\uD83D\uDCA1 تم فتح واتساب ويب - الصق الرابط في المحادثة إن لزم', 'info'); }, 800);
    }
  } catch (e) {
    console.error('sendWhatsAppMessageAdmin:', e);
    if (typeof showToast === 'function') showToast('\u274C خطأ في إرسال الرسالة', 'error');
  }
}

// === Reports Tabs Functions ===
let currentReportsTab = 'current';

function switchReportsTab(tab) {
  currentReportsTab = tab;
  const currentTab = document.getElementById('reportsTabCurrent');
  const archivedTab = document.getElementById('reportsTabArchived');
  const statisticsTab = document.getElementById('reportsTabStatistics');
  const currentContent = document.getElementById('currentReportsContent');
  const archivedContent = document.getElementById('archivedReportsContent');
  const statisticsContent = document.getElementById('statisticsReportsContent');
  
  // Ensure actionBtns stays hidden when reports page is open
  const actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'none';
    actionBtns.style.setProperty('display', 'none', 'important');
  }
  
  // Reset all tabs
  [currentTab, archivedTab, statisticsTab].forEach(t => {
    if (t) {
      t.classList.remove('text-turquoise', 'border-turquoise');
      t.classList.add('text-gray-400', 'border-transparent');
    }
  });
  
  // Hide all content
  [currentContent, archivedContent, statisticsContent].forEach(c => {
    if (c) c.classList.add('hidden');
  });
  
  if (tab === 'current') {
    if (currentTab) {
      currentTab.classList.add('text-turquoise', 'border-turquoise');
      currentTab.classList.remove('text-gray-400', 'border-transparent');
    }
    if (currentContent) currentContent.classList.remove('hidden');
    populateReportsPage();
  } else if (tab === 'archived') {
    if (archivedTab) {
      archivedTab.classList.add('text-turquoise', 'border-turquoise');
      archivedTab.classList.remove('text-gray-400', 'border-transparent');
    }
    if (archivedContent) archivedContent.classList.remove('hidden');
    loadArchivedPeriodsList();
  } else if (tab === 'statistics') {
    if (statisticsTab) {
      statisticsTab.classList.add('text-turquoise', 'border-turquoise');
      statisticsTab.classList.remove('text-gray-400', 'border-transparent');
    }
    if (statisticsContent) {
      // Force remove hidden class and ensure visibility
      statisticsContent.classList.remove('hidden');
      statisticsContent.style.display = '';
      statisticsContent.style.visibility = '';
      statisticsContent.style.opacity = '';
      console.log('✅ statisticsContent is now visible, display:', window.getComputedStyle(statisticsContent).display);
      // Force immediate load (no delay needed)
      loadStatisticsPage();
    } else {
      console.error('❌ statisticsContent element not found');
      // Try to find it again after a short delay
      setTimeout(() => {
        const retryContent = document.getElementById('statisticsReportsContent');
        if (retryContent) {
          retryContent.classList.remove('hidden');
          retryContent.style.display = '';
          retryContent.style.visibility = '';
          retryContent.style.opacity = '';
          loadStatisticsPage();
        } else {
          console.error('❌ statisticsContent still not found after retry');
        }
      }, 200);
    }
  }
}

// === Archived Periods Functions ===
async function loadArchivedPeriodsList() {
  const select = document.getElementById('archivedPeriodSelect');
  if (!select) return;

  select.innerHTML = '<option value="">-- اختر فترة --</option>';

  if (localStorage.getItem('adora_archived_just_cleared') === '1') {
    return;
  }

  try {
    let periods = [];
    
    if (storage && typeof storage.ref === 'function') {
      try {
        const periodsRef = storage.ref('periods/');
        
        // Check if listAll() method exists
        if (typeof periodsRef.listAll === 'function') {
          const result = await periodsRef.listAll();
          
          if (result && result.items && result.items.length > 0) {
            for (const itemRef of result.items) {
              try {
                var periodIdFromFile = (itemRef.name && itemRef.name.endsWith('.json'))
                  ? itemRef.name.slice(0, -5)
                  : (itemRef.name || '');
                if (!periodIdFromFile || periodIdFromFile.toLowerCase() === 'live') continue;
                const url = await itemRef.getDownloadURL();
                const response = await fetch(url);
                if (response.ok) {
                  const data = await response.json();
                  // استخدام اسم الملف كـ periodId حتى يعمل الجلب عند الاختيار (periods/periodId.json)
                  var periodId = periodIdFromFile;
                  var periodText = data.periodText || data.data?.periodText;
                  if (!periodText && (data.data?.startDate || data.reportStartDate || data.data?.endDate)) {
                    var startStr = (data.data?.startDate || data.reportStartDate || '').toString().substring(0, 10);
                    var endStr = (data.data?.endDate || '').toString().substring(0, 10);
                    periodText = (startStr && endStr) ? ('من ' + startStr + ' إلى ' + endStr) : ('فترة ' + periodId);
                  }
                  if (!periodText) periodText = 'فترة ' + periodId;
                  periods.push({
                    periodId: periodId,
                    periodText: periodText,
                    closedAt: data.closedAt || data.data?.closedAt || data.data?.endDate || null
                  });
                } else {
                  console.warn('⚠️ Failed to fetch period: ' + response.status);
                }
              } catch (itemError) {
                console.warn('⚠️ Error fetching period item:', itemError.message);
              }
            }
          }
        } else {
          console.warn('⚠️ listAll() method not available on storage reference');
        }
      } catch (error) {
        console.error('❌ Firebase Storage list error:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message
        });
        console.log('⚠️ Falling back to localStorage');
      }
    } else {
      console.log('⚠️ Firebase Storage not available, using localStorage');
    }
    
    if (periods.length === 0) {
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        try {
          var raw = JSON.parse(saved);
          periods = (Array.isArray(raw) ? raw : []).map(function (p) {
            var id = p.periodId || p.id;
            return { periodId: id, periodText: p.periodText || ('فترة ' + id), closedAt: p.closedAt || null };
          });
        } catch (e) {
          periods = [];
        }
      }
    } else {
      // دمج فترات localStorage مع قائمة Firebase حتى تظهر الفترة المغلقة فوراً
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        try {
          var raw = JSON.parse(saved);
          var localList = Array.isArray(raw) ? raw : [];
          var existingIds = new Set(periods.map(function (p) { return p.periodId; }));
          localList.forEach(function (p) {
            var id = p.periodId || p.id;
            if (id && !existingIds.has(id)) {
              existingIds.add(id);
              periods.push({
                periodId: id,
                periodText: p.periodText || ('فترة ' + id),
                closedAt: p.closedAt || null
              });
            }
          });
        } catch (e) { /* ignore */ }
      }
    }
    
    // إزالة التكرار بالـ periodId فقط (لا ندمج فترتين مختلفتين لمجرد تشابه النص)
    const byId = new Map();
    periods.forEach(function (p) {
      var id = p.periodId || p.id;
      if (id && !byId.has(id)) byId.set(id, p);
    });
    periods = Array.from(byId.values());
    periods.sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));

    periods.forEach(period => {
      const option = document.createElement('option');
      option.value = period.periodId;
      option.textContent = period.periodText || period.periodId;
      select.appendChild(option);
    });

  } catch (error) {
    console.error('❌ Error loading archived periods:', error);
    showToast('❌ خطأ في تحميل الفترات المغلقة', 'error');
  }
}

async function loadArchivedPeriod(periodId) {
  if (!periodId) return;
  
  try {
    showToast('⏳ جاري تحميل الفترة...', 'info');
    
    let periodData = null;
    
    if (storage && typeof storage.ref === 'function') {
      var pathToTry = ['periods/' + periodId + '.json'];
      if (periodId.indexOf('-') !== -1) pathToTry.push('periods/' + periodId.replace(/-/g, '_') + '.json');
      if (periodId.indexOf('_') !== -1) pathToTry.push('periods/' + periodId.replace(/_/g, '-') + '.json');
      try {
        for (var pi = 0; pi < pathToTry.length && !periodData; pi++) {
          const storageRef = storage.ref(pathToTry[pi]);
          if (typeof storageRef.getDownloadURL !== 'function') continue;
          try {
            const url = await storageRef.getDownloadURL();
            const response = await fetch(url);
            if (response.ok) {
              periodData = await response.json();
              console.log('✅ Period loaded from Firebase Storage:', pathToTry[pi]);
              break;
            }
          } catch (pathErr) { /* try next path */ }
        }
        if (!periodData) {
          console.warn('⚠️ Failed to fetch period from any path');
          console.log('⚠️ Falling back to localStorage');
        }
      } catch (error) {
        console.error('❌ Firebase Storage load error:', error);
        console.log('⚠️ Falling back to localStorage');
      }
    } else {
      console.log('⚠️ Firebase Storage not available, using localStorage');
    }
    
    if (!periodData) {
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        try {
          const periods = JSON.parse(saved);
          periodData = periods.find(p => (p.periodId || p.id) === periodId);
        } catch (e) {
          periodData = null;
        }
      }
    }
    
    if (!periodData) {
      showToast('❌ الفترة غير موجودة', 'error');
      return;
    }
    
    // توحيد الصيغة: دعم ملف إغلاق الفترة { data: { db, branches } } وملف المزامنة { db, branches }
    var dataBlock = periodData.data && Array.isArray(periodData.data.db)
      ? periodData.data
      : (Array.isArray(periodData.db)
          ? {
              db: periodData.db,
              branches: periodData.branches || [],
              evalRate: periodData.evalRate,
              startDate: periodData.reportStartDate || periodData.startDate,
              employeeCodes: periodData.employeeCodes || {},
              discounts: periodData.discounts,
              discountTypes: periodData.discountTypes,
              negativeRatingsCount: periodData.negativeRatingsCount
            }
          : null);
    if (!dataBlock || !dataBlock.db || dataBlock.db.length === 0) {
      showToast('❌ الفترة لا تحتوي على بيانات موظفين', 'error');
      return;
    }
    var periodTextDisplay = periodData.periodText || (dataBlock.startDate ? ('من ' + String(dataBlock.startDate).substring(0, 10) + ' إلى نهاية الفترة') : ('فترة ' + periodId));
    var closedAtDisplay = periodData.closedAt || periodData.lastModified || null;
    
    document.getElementById('archivedPeriodText').textContent = periodTextDisplay;
    document.getElementById('archivedClosedAt').textContent = closedAtDisplay ? new Date(closedAtDisplay).toLocaleDateString('ar-SA') : '—';
    document.getElementById('archivedPeriodInfo').classList.remove('hidden');
    
    db = dataBlock.db;
    branches = new Set(Array.isArray(dataBlock.branches) ? dataBlock.branches : []);
    currentEvalRate = (dataBlock.evalRate != null ? dataBlock.evalRate : periodData.evalRate) || 20;
    reportStartDate = dataBlock.startDate || null;
    employeeCodesMap = dataBlock.employeeCodes || periodData.employeeCodes || {};
    // Restore discounts and discount types from archived period
    if (dataBlock.discounts && Array.isArray(dataBlock.discounts)) {
      discounts = dataBlock.discounts;
      if (typeof window !== 'undefined') window.discounts = discounts;
      if (typeof saveDiscounts === 'function') saveDiscounts();
    }
    if (dataBlock.discountTypes && Array.isArray(dataBlock.discountTypes)) {
      discountTypes = dataBlock.discountTypes;
      if (typeof window !== 'undefined') window.discountTypes = discountTypes;
      if (typeof saveDiscountTypes === 'function') saveDiscountTypes();
    }
    if (dataBlock.negativeRatingsCount && typeof dataBlock.negativeRatingsCount === 'object') {
      try {
        if (typeof window !== 'undefined') window.branchNegativeRatingsCount = dataBlock.negativeRatingsCount;
        localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(dataBlock.negativeRatingsCount));
      } catch (_) {}
    }
    
    populateArchivedReportsGrid();
    
    showToast('✅ تم تحميل الفترة بنجاح', 'success');
    
  } catch (error) {
    console.error('❌ Error loading archived period:', error);
    showToast('❌ خطأ في تحميل الفترة: ' + error.message, 'error');
  }
}

/** رسالة تأكيد مسح الفترات المغلقة — توضّح ما يُمسح (القائمتان) وما لا يُمسح (الرصيد التراكمي) */
function getClearArchivedPeriodsConfirmMessage() {
  return 'سيُمسح:\n• قائمة «اختر فترة» (الفترات المغلقة)\n• قائمة أرشيف الإحصائيات\n(مصدرهما واحد: ملفات الفترات في السحابة)\n\nلن يُمسح:\n• الرصيد التراكمي من النقاط (يبقى على Firebase)\n\nلا يمكن التراجع عن المسح. هل أنت متأكد؟';
}
if (typeof window !== 'undefined') window.getClearArchivedPeriodsConfirmMessage = getClearArchivedPeriodsConfirmMessage;

/** عرض رسالة تأكيد ثم مسح كل الفترات المغلقة إن وافق المستخدم */
function confirmAndClearArchivedPeriods() {
  var msg = typeof getClearArchivedPeriodsConfirmMessage === 'function'
    ? getClearArchivedPeriodsConfirmMessage()
    : 'سيُمسح قائمة الفترات المغلقة وأرشيف الإحصائيات. الرصيد التراكمي لن يُمس. لا يمكن التراجع. هل أنت متأكد؟';
  if (confirm(msg) && typeof clearAllArchivedPeriods === 'function') clearAllArchivedPeriods();
}
if (typeof window !== 'undefined') window.confirmAndClearArchivedPeriods = confirmAndClearArchivedPeriods;

/**
 * مسح كل الفترات المغلقة فقط (من localStorage و Firebase Storage periods/) — الرصيد التراكمي لا يُمس أبداً.
 * يُمسح مصدر قائمة «اختر فترة» وقائمة أرشيف الإحصائيات (كلتاهما تعتمدان على periods/).
 * يُستدعى من زر في الواجهة أو من الكونسول: clearAllArchivedPeriods()
 * الترتيب: 1) مسح قائمة الفترات المغلقة ووضع علم "تم المسح". 2) حذف ملفات Firebase periods/. 3) تحديث الواجهة.
 */
async function clearAllArchivedPeriods() {
  try {
    var st = (typeof window !== 'undefined' && window.storage) || null;

    // 1) مسح قائمة الفترات المغلقة فقط (الرصيد التراكمي لا يُحذف أبداً) ووضع علم حتى تظهر القوائم فارغة
    try {
      localStorage.setItem('adora_archived_periods', '[]');
      localStorage.setItem('adora_archived_just_cleared', '1');
    } catch (e) {}

    // 2) حذف ملفات الفترات من Firebase Storage
    var deleteFailed = 0;
    if (st && typeof st.ref === 'function' && typeof st.ref('periods/').listAll === 'function') {
      try {
        var result = await st.ref('periods/').listAll();
        if (result && result.items && result.items.length > 0) {
          for (var i = 0; i < result.items.length; i++) {
            try {
              if (typeof result.items[i].delete === 'function') await result.items[i].delete();
            } catch (e) {
              deleteFailed++;
              if (console && console.warn) console.warn('حذف فترة:', result.items[i].name, e.message);
            }
          }
        }
      } catch (listErr) {
        if (console && console.warn) console.warn('listAll periods:', listErr.message);
      }
    }

    // 3) تحديث القوائم والواجهة (علم "تم المسح" يبقى حتى ترى الدالتان القوائم فارغة؛ نزيله بعد التحديث)
    if (typeof loadArchivedPeriodsList === 'function') await loadArchivedPeriodsList();
    if (typeof loadArchivedStatsPeriodsList === 'function') await loadArchivedStatsPeriodsList();
    if (typeof populateCumulativePointsCards === 'function') populateCumulativePointsCards();
    try { localStorage.removeItem('adora_archived_just_cleared'); } catch (e) {}

    if (deleteFailed > 0 && typeof showToast === 'function') {
      showToast('تم مسح القائمة محلياً. فشل حذف ' + deleteFailed + ' ملف من السحابة — راجع صلاحيات Firebase Storage.', 'error');
    } else if (typeof showToast === 'function') {
      showToast('تم مسح كل الفترات المغلقة. الرصيد التراكمي لم يُمس.', 'success');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('فشل المسح: ' + (err && err.message ? err.message : 'خطأ'), 'error');
    if (console && console.error) console.error('clearAllArchivedPeriods:', err);
  }
}
if (typeof window !== 'undefined') window.clearAllArchivedPeriods = clearAllArchivedPeriods;

/**
 * استعادة الفترة المغلقة كفترة حالية للتعديل (يعتمد على البيانات المحمّلة في الذاكرة من loadArchivedPeriod).
 * يخزّن في localStorage ويتوافق مع Firebase: لا يمسّ Firebase periods/؛ إغلاق الفترة لاحقاً يحدّث Firebase كالمعتاد.
 */
function restoreArchivedPeriodAsCurrent() {
  try {
    if (!db || db.length === 0) {
      if (typeof showToast === 'function') showToast('⏳ اختر فترةً أولاً من القائمة ثم استعدها', 'info');
      return;
    }
    const periodTextEl = document.getElementById('archivedPeriodText');
    const periodText = (periodTextEl && periodTextEl.textContent) ? periodTextEl.textContent.trim() : (reportStartDate || '').replace(/_/g, '-');
    if (!periodText && periodText !== '') {
      if (typeof showToast === 'function') showToast('❌ لم تُحمَّل فترة بعد', 'error');
      return;
    }

    localStorage.setItem('adora_rewards_db', JSON.stringify(db));
    localStorage.setItem('adora_rewards_branches', JSON.stringify([...branches]));
    localStorage.setItem('adora_rewards_evalRate', String(currentEvalRate || 20));
    localStorage.setItem('adora_rewards_startDate', reportStartDate || '');
    localStorage.setItem('adora_rewards_periodText', periodText || '');
    if (typeof employeeCodesMap !== 'undefined' && employeeCodesMap !== null) {
      try {
        localStorage.setItem('adora_rewards_employeeCodes', JSON.stringify(employeeCodesMap));
      } catch (e) {}
    }
    if (typeof window !== 'undefined' && window.db !== undefined) {
      window.db = db;
    }
    if (typeof window !== 'undefined' && typeof window.syncLivePeriodToFirebase === 'function') {
      window.syncLivePeriodToFirebase();
    }

    if (typeof hideReportsPage === 'function') {
      hideReportsPage();
    }
    const headerEl = document.getElementById('headerPeriodRange');
    const periodRangeEl = document.getElementById('periodRange');
    if (headerEl) headerEl.innerText = periodText || '-';
    if (periodRangeEl) periodRangeEl.innerText = periodText || '-';

    const uploadBox = document.getElementById('uploadBox');
    const dashboard = document.getElementById('dashboard');
    const actionBtns = document.getElementById('actionBtns');
    if (uploadBox) uploadBox.classList.add('hidden');
    if (dashboard) dashboard.classList.remove('hidden');
    if (actionBtns) {
      actionBtns.style.display = 'flex';
      actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    }

    if (typeof updateFilters === 'function') updateFilters();
    if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
    if (typeof renderUI === 'function') renderUI('الكل');

    if (typeof showToast === 'function') showToast('✅ تم استعادة الفترة للتعديل', 'success');
  } catch (error) {
    console.error('❌ Error restoring archived period:', error);
    if (typeof showToast === 'function') showToast('❌ خطأ في استعادة الفترة: ' + (error.message || ''), 'error');
  }
}

function populateArchivedReportsGrid() {
  const grid = document.getElementById('archivedReportsGrid');
  if (!grid) return;
  
  grid.innerHTML = '';
  
  const uniqueEmployees = new Map();
  db.forEach(emp => {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, []);
    }
    uniqueEmployees.get(key).push(emp);
  });
  
  const sortedNames = Array.from(uniqueEmployees.keys()).sort();
  
  sortedNames.forEach(name => {
    const employees = uniqueEmployees.get(name);
    const isDuplicate = employees.length > 1;
    
    const card = document.createElement('div');
    card.className = 'glass p-4 rounded-xl border border-white/20 hover:border-turquoise/50 transition-all cursor-pointer';
    
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
    
    const nameText = isDuplicate ? `${name} (${employees.length} فروع)` : name;
    const branchesText = isDuplicate ? employees.map(e => e.branch).join('، ') : employees[0].branch;
    
    let totalCount = 0;
    let totalNet = 0;
    employees.forEach(emp => {
      const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
      const evBooking = emp.evaluationsBooking || 0;
      const evGoogle = emp.evaluationsGoogle || 0;
      const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
      const fund = gross * getSupportFundRatio();
      let net = gross - fund;
      const attendanceBonus = emp.attendance26Days === true ? net * 0.25 : 0;
      net = net + attendanceBonus;
      totalCount += emp.count;
      totalNet += net;
    });
    
    card.innerHTML = `
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-bold text-white">${nameText}</h3>
        </div>
        <p class="text-sm text-gray-400">${branchesText}</p>
        <div class="flex justify-between items-center mt-2">
          <span class="text-xs text-gray-500">الحجوزات: ${totalCount}</span>
          <span class="text-lg font-black text-turquoise">${totalNet.toFixed(2)} ر.س</span>
        </div>
      </div>
    `;
    
    grid.appendChild(card);
  });
}

// === Mobile Employee Report ===
async function checkMobileEmployeeCode() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');
  
  if (!code) return;

  // مسح جلسة الإداري من التخزين المحلي عند الدخول كموظف — لتفادي خلط اليوزرات عند التبديل لاحقاً
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('adora_current_role');
      localStorage.removeItem('adora_current_token');
      localStorage.removeItem('adora_current_period');
    }
  } catch (e) {}
  
  // First, try to find employee in current db (from localStorage)
  let employee = db.find(emp => (emp.employeeCode || employeeCodesMap[emp.name]) === code);
  
  // If not found in current db, try to load from Firebase Storage (last closed period)
  if (!employee && storage && typeof storage.ref === 'function') {
    try {
      showToast('⏳ جاري تحميل البيانات...', 'info');
      
      // Get list of all periods
      const periodsRef = storage.ref('periods/');
      
      if (typeof periodsRef.listAll === 'function') {
        const result = await periodsRef.listAll();
        
        if (result && result.items && result.items.length > 0) {
          // Get the most recent period (last one)
          const periods = [];
          for (const itemRef of result.items) {
            try {
              if (typeof itemRef.getDownloadURL === 'function') {
                const url = await itemRef.getDownloadURL();
                const response = await fetch(url);
                if (response.ok) {
                  const data = await response.json();
                  periods.push(data);
                } else {
                  console.warn(`⚠️ Failed to fetch period item: ${response.status}`);
                }
              }
            } catch (itemError) {
              console.warn('⚠️ Error fetching period item:', itemError.message);
              // Continue with other items
            }
          }
        
        // Sort by closedAt (newest first)
        periods.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
        
        // Load the most recent period
        const latestPeriod = periods[0];
        if (latestPeriod && latestPeriod.data) {
          // Restore data temporarily — يشمل الخصومات والفروع لئلا يُستخدم بيانات فترة أخرى من localStorage
          const originalDb = db;
          const originalEmployeeCodes = employeeCodesMap;
          const originalDiscounts = (typeof discounts !== 'undefined' ? discounts : (typeof window !== 'undefined' && window.discounts ? window.discounts : []));
          const originalBranches = typeof branches !== 'undefined' && branches ? new Set(branches) : new Set();
          
          db = latestPeriod.data.db || [];
          employeeCodesMap = latestPeriod.data.employeeCodes || {};
          const periodBranches = latestPeriod.data.branches;
          if (typeof branches !== 'undefined') {
            branches = Array.isArray(periodBranches) ? new Set(periodBranches) : (periodBranches && typeof periodBranches.forEach === 'function' ? new Set([...periodBranches]) : new Set());
          }
          const periodDiscounts = Array.isArray(latestPeriod.data.discounts) ? latestPeriod.data.discounts : [];
          if (typeof discounts !== 'undefined') discounts = periodDiscounts;
          if (typeof window !== 'undefined') window.discounts = periodDiscounts;
          
          // Try to find employee again
          employee = db.find(emp => (emp.employeeCode || employeeCodesMap[emp.name]) === code);
          
          // Check if employee is duplicate (exists in multiple branches)
          if (employee) {
            const allEmployeesWithSameCode = db.filter(emp => (emp.employeeCode || employeeCodesMap[emp.name]) === code);
            
            if (allEmployeesWithSameCode.length > 1) {
              // Duplicate employee - show branch selection
              showBranchSelectionForMobileEmployee(allEmployeesWithSameCode, code);
              document.getElementById('dashboard')?.classList.add('hidden');
              document.getElementById('uploadBox')?.classList.add('hidden');
              document.getElementById('actionBtns').style.display = 'none';
              const header = document.querySelector('header');
              if (header) header.style.display = 'none';
              showToast('✅ تم تحميل البيانات', 'success');
              // استعادة الحالة العامة حتى لا تبقى بيانات الفترة المغلقة في الذاكرة عند التبديل لاحقاً
              db = originalDb;
              employeeCodesMap = originalEmployeeCodes;
              if (typeof branches !== 'undefined') branches = originalBranches;
              if (typeof discounts !== 'undefined') discounts = originalDiscounts;
              if (typeof window !== 'undefined') { window.db = db; window.discounts = originalDiscounts; }
              return;
            } else {
              // Single branch - show report directly (يستخدم خصومات وفروع الفترة المغلقة المُسنَدة أعلاه)
              showEmployeeReport(employee.id);
              document.getElementById('dashboard')?.classList.add('hidden');
              document.getElementById('uploadBox')?.classList.add('hidden');
              document.getElementById('actionBtns').style.display = 'none';
              const header = document.querySelector('header');
              if (header) header.style.display = 'none';
              showToast('✅ تم تحميل التقرير', 'success');
              // استعادة الحالة العامة حتى لا تبقى بيانات الفترة المغلقة في الذاكرة عند التبديل لاحقاً
              db = originalDb;
              employeeCodesMap = originalEmployeeCodes;
              if (typeof branches !== 'undefined') branches = originalBranches;
              if (typeof discounts !== 'undefined') discounts = originalDiscounts;
              if (typeof window !== 'undefined') { window.db = db; window.discounts = originalDiscounts; }
              // Show PWA install prompt after 3 seconds
              setTimeout(() => {
                if (deferredPrompt && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                  if (confirm('هل تريد تثبيت التطبيق على جهازك لتسهيل الوصول إلى تقريرك؟')) {
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then((choiceResult) => {
                      console.log(`User response: ${choiceResult.outcome}`);
                      deferredPrompt = null;
                    });
                  }
                }
              }, 3000);
              return;
            }
          }
          
          // Restore original data if employee not found
          db = originalDb;
          employeeCodesMap = originalEmployeeCodes;
          if (typeof branches !== 'undefined') branches = originalBranches;
          if (typeof discounts !== 'undefined') discounts = originalDiscounts;
          if (typeof window !== 'undefined') { window.db = db; window.discounts = originalDiscounts; }
          }
        } else {
          console.warn('⚠️ No periods found in Firebase Storage or listAll() failed');
        }
      } else {
        console.warn('⚠️ listAll() method not available on storage reference');
      }
    } catch (error) {
      console.error('❌ Error loading from Firebase:', error);
      console.error('Error details:', {
        code: error.code,
        message: error.message
      });
    }
  }
  
  // If employee found in current db
  if (employee) {
    // Check if employee is duplicate (exists in multiple branches)
    const allEmployeesWithSameCode = db.filter(emp => (emp.employeeCode || employeeCodesMap[emp.name]) === code);
    
    if (allEmployeesWithSameCode.length > 1) {
      // Duplicate employee - show branch selection
      showBranchSelectionForMobileEmployee(allEmployeesWithSameCode, code);
      document.getElementById('dashboard')?.classList.add('hidden');
      document.getElementById('uploadBox')?.classList.add('hidden');
      document.getElementById('actionBtns').style.display = 'none';
      const header = document.querySelector('header');
      if (header) header.style.display = 'none';
    } else {
      // Single branch - show report directly
      showEmployeeReport(employee.id);
      document.getElementById('dashboard')?.classList.add('hidden');
      document.getElementById('uploadBox')?.classList.add('hidden');
      document.getElementById('actionBtns').style.display = 'none';
      const header = document.querySelector('header');
      if (header) header.style.display = 'none';
      
      // Show PWA install prompt after 3 seconds
      setTimeout(() => {
        if (deferredPrompt && /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
          if (confirm('هل تريد تثبيت التطبيق على جهازك لتسهيل الوصول إلى تقريرك؟')) {
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then((choiceResult) => {
              console.log(`User response: ${choiceResult.outcome}`);
              deferredPrompt = null;
            });
          }
        }
      }, 3000);
    }
  } else {
    // Show error message
    document.getElementById('uploadBox')?.classList.add('hidden');
    document.getElementById('dashboard')?.classList.add('hidden');
    document.getElementById('actionBtns').style.display = 'none';
    const header = document.querySelector('header');
    if (header) header.style.display = 'none';
    
    // Show error message with clear reason
    const body = document.body;
    body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%); color: white; font-family: 'IBM Plex Sans Arabic', sans-serif; text-align: center; padding: 2rem;">
        <div style="background: rgba(255, 255, 255, 0.1); padding: 3rem; border-radius: 20px; border: 2px solid rgba(239, 68, 68, 0.5); max-width: 560px;">
          <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
          <h1 style="font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; color: #ef4444;">رابط الموظف لا يفتح</h1>
          <p style="color: #fbbf24; font-weight: 700; margin-bottom: 0.75rem; font-size: 0.95rem;">سبب عدم فتح الرابط:</p>
          <ul style="color: #94a3b8; text-align: right; margin: 0 auto 1.5rem; padding-right: 1.5rem; max-width: 400px; line-height: 1.7; font-size: 0.9rem;">
            <li>روابط الموظفين تعمل <strong>بعد «إغلاق الفترة» فقط</strong> — الموظف يطلع على نتائج شغله بعد الإغلاق. إن لم تُغلق الفترة بعد، الرابط لا يعمل.</li>
            <li>أو الكود في الرابط غير مسجّل لأي موظف.</li>
          </ul>
          <p style="color: #64748b; font-size: 0.875rem;">إذا كنت موظفاً ولم ينجح الرابط، يرجى التواصل مع الإدارة.</p>
        </div>
      </div>
    `;
  }
}

// === PWA Install Prompt ===
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  
  if (/Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
    setTimeout(() => {
      if (confirm('هل تريد تثبيت التطبيق على جهازك؟')) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then((choiceResult) => {
          console.log(`User response: ${choiceResult.outcome}`);
          deferredPrompt = null;
        });
      }
    }, 2000);
  }
});

// Service Worker: تم إلغاء التسجيل من هنا لتجنّب خطأ MIME عند التحميل عبر proxy (localhost:517x).

// Check for mobile employee code on load
window.addEventListener('load', () => {
  // Wait for Firebase to initialize and data to load
  setTimeout(async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    const adminKey = urlParams.get('admin');
    
    // If code exists, we're in employee mode - check code
    if (code) {
      await checkMobileEmployeeCode();
    } else if (typeof window.getAdminSecretKey === 'function' && adminKey === window.getAdminSecretKey()) {
      // Admin mode - let loadDataFromStorage handle it
      // (loadDataFromStorage already checks for admin mode)
    } else {
      // No code and no admin key - block access
      // loadDataFromStorage will handle the blocking
    }
  }, 1000);
});

// === Discounts Management Functions ===
// Load discounts from localStorage
function loadDiscounts() {
  try {
    const saved = localStorage.getItem('adora_rewards_discounts');
    if (saved) {
      const loadedDiscounts = JSON.parse(saved);
      // Update both local and window scope
      if (typeof discounts !== 'undefined') {
        discounts = loadedDiscounts;
      }
      if (typeof window !== 'undefined') {
        window.discounts = loadedDiscounts;
      }
    } else {
      // Initialize empty array
      if (typeof discounts !== 'undefined') {
        discounts = [];
      }
      if (typeof window !== 'undefined') {
        window.discounts = [];
      }
    }
  } catch (error) {
    console.error('❌ Error loading discounts:', error);
    // Initialize empty array on error
    if (typeof discounts !== 'undefined') {
      discounts = [];
    }
    if (typeof window !== 'undefined') {
      window.discounts = [];
    }
  }
}

// Save discounts to localStorage
function saveDiscounts() {
  try {
    // Get discounts from window
    const discountsToSave = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
    localStorage.setItem('adora_rewards_discounts', JSON.stringify(discountsToSave));
    // Ensure window.discounts is updated
    if (typeof window !== 'undefined') {
      window.discounts = discountsToSave;
    }
    // Update local discounts if defined
    if (typeof discounts !== 'undefined') {
      discounts = discountsToSave;
    }
  } catch (error) {
    console.error('❌ Error saving discounts:', error);
  }
}

// Load discount types from localStorage (البنود الـ 55 + ما أضافه المدير)
// نفضيل البنود المعدّلة من الملف وإسقاط أي مكرر قديم من المحفوظ (نفس رقم البند)
function loadDiscountTypes() {
  try {
    const defaultTypes = (typeof window !== 'undefined' && window.DEFAULT_DISCOUNT_CLAUSES_55) ? window.DEFAULT_DISCOUNT_CLAUSES_55 : [];
    var clauseNumberFrom = function (text) {
      if (!text || typeof text !== 'string') return null;
      var m = text.match(/^(\d+)\.\s/);
      return m ? parseInt(m[1], 10) : null;
    };
    var defaultNumbers = new Set();
    defaultTypes.forEach(function (t) {
      var n = clauseNumberFrom(t);
      if (n != null) defaultNumbers.add(n);
    });

    const saved = localStorage.getItem('adora_rewards_discountTypes');
    if (saved) {
      discountTypes = [...defaultTypes];
      var savedTypes = JSON.parse(saved);
      savedTypes.forEach(function (type) {
        if (!type) return;
        var num = clauseNumberFrom(type);
        if (num != null && defaultNumbers.has(num)) return;
        if (!discountTypes.includes(type)) discountTypes.push(type);
      });
      saveDiscountTypes();
    } else {
      discountTypes = defaultTypes.length ? [...defaultTypes] : [];
      saveDiscountTypes();
    }
  } catch (error) {
    console.error('❌ Error loading discount types:', error);
    discountTypes = (typeof window !== 'undefined' && window.DEFAULT_DISCOUNT_CLAUSES_55) ? [...window.DEFAULT_DISCOUNT_CLAUSES_55] : [];
    saveDiscountTypes();
  }
}

// Save discount types to localStorage
function saveDiscountTypes() {
  try {
    localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(discountTypes));
  } catch (error) {
    console.error('❌ Error saving discount types:', error);
  }
}

// Get discount amount for employee in a specific branch
// This applies discount to the branch's net, not the aggregated net
function getDiscountForEmployeeInBranch(employeeName, branchNet) {
  // Ensure discounts is loaded
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  const currentDiscounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  if (!currentDiscounts || currentDiscounts.length === 0 || !branchNet || branchNet <= 0) return 0;
  
  // Get all discounts for this employee
  const employeeDiscounts = currentDiscounts.filter(d => d.employeeName === employeeName);
  if (employeeDiscounts.length === 0) return 0;
  
  // Calculate discount amount for this branch (apply percentage to branch net)
  const discountAmount = employeeDiscounts.reduce((sum, discount) => {
    return sum + (branchNet * (discount.discountPercentage / 100));
  }, 0);
  
  return discountAmount;
}

// خصم تقييم الفندق: 10 ريال × عدد التقييمات السلبية (أقل من تقييم الفرع). للمتكرر: مرة واحدة من الفرع الذي فيه أعلى صافي للموظف (قبل خصم التقييم السلبي).
function getHotelRatingDeductionForEmployee(employeeName) {
  const counts = (typeof window !== 'undefined' && window.branchNegativeRatingsCount) ? window.branchNegativeRatingsCount : {};
  if (typeof db === 'undefined' || !db.length) return 0;
  const allEmpBranches = db.filter(e => e.name === employeeName);
  if (allEmpBranches.length === 0) return 0;
  if (allEmpBranches.length === 1) {
    const branch = allEmpBranches[0].branch;
    const n = parseInt(counts[branch], 10) || 0;
    return n * 10;
  }
  // متكرر: الفرع الأكثر تقييمات سلبية فقط
  let maxCount = 0;
  allEmpBranches.forEach(emp => {
    const n = parseInt(counts[emp.branch], 10) || 0;
    if (n > maxCount) maxCount = n;
  });
  return maxCount * 10;
}

/** الفرع الذي يُطبَّق فيه خصم التقييم السلبي للموظف المتكرر: الفرع الذي فيه أعلى صافي للموظف (قبل خصم التقييم السلبي)، حتى لا يُخصم من الفرع الضعيف. غير متكرر: فرعه الوحيد. */
function getBranchWithMaxNegativeRatingsForEmployee(employeeName) {
  if (typeof db === 'undefined' || !db.length) return null;
  const allEmpBranches = db.filter(e => e.name === employeeName);
  if (allEmpBranches.length === 0) return null;
  if (allEmpBranches.length === 1) return allEmpBranches[0].branch;
  let maxNet = -Infinity;
  let branchWithMaxNet = null;
  allEmpBranches.forEach(emp => {
    const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
    const evBooking = emp.evaluationsBooking || 0;
    const evGoogle = emp.evaluationsGoogle || 0;
    const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
    const fund = gross * getSupportFundRatio();
    let branchNet = gross - fund;
    const attendance26Days = emp.attendance26Days === true;
    const attendanceBonus = attendance26Days ? branchNet * 0.25 : 0;
    branchNet = branchNet + attendanceBonus;
    if (branchNet > maxNet) { maxNet = branchNet; branchWithMaxNet = emp.branch; }
  });
  return branchWithMaxNet || (allEmpBranches[0] && allEmpBranches[0].branch);
}

// Get total discount amount for employee (sum of discounts from all branches + خصم تقييم الفندق)
function getTotalDiscountForEmployee(employeeName, netBeforeDiscounts = null) {
  // Ensure discounts is loaded
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  const currentDiscounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  let totalDiscount = 0;
  
  if (currentDiscounts && currentDiscounts.length > 0) {
    const employeeDiscounts = currentDiscounts.filter(d => d.employeeName === employeeName);
    if (employeeDiscounts.length > 0) {
      const allEmpBranches = db.filter(e => e.name === employeeName);
      if (allEmpBranches.length > 0) {
        allEmpBranches.forEach(emp => {
          const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
          const evBooking = emp.evaluationsBooking || 0;
          const evGoogle = emp.evaluationsGoogle || 0;
          const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
          const fund = gross * getSupportFundRatio();
          let branchNet = gross - fund;
          const attendance26Days = emp.attendance26Days === true;
          const attendanceBonus = attendance26Days ? branchNet * 0.25 : 0;
          branchNet = branchNet + attendanceBonus;
          const branchDiscount = employeeDiscounts.reduce((sum, discount) => {
            return sum + (branchNet * (discount.discountPercentage / 100));
          }, 0);
          totalDiscount += branchDiscount;
        });
      }
    }
  }
  
  totalDiscount += getHotelRatingDeductionForEmployee(employeeName);
  return totalDiscount;
}
if (typeof window !== 'undefined') {
  window.getTotalDiscountForEmployee = getTotalDiscountForEmployee;
  window.getHotelRatingDeductionForEmployee = getHotelRatingDeductionForEmployee;
  window.getBranchWithMaxNegativeRatingsForEmployee = getBranchWithMaxNegativeRatingsForEmployee;
}

// Get discount details for employee (for display). forBranch: عند عرض صف فرع معيّن للمتكرر، نُظهر خصم التقييم السلبي في الفرع الذي يُطبَّق فيه فقط.
function getDiscountDetailsForEmployee(employeeName, forBranch) {
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  const currentDiscounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  const list = currentDiscounts && currentDiscounts.length > 0
    ? currentDiscounts.filter(d => d.employeeName === employeeName)
    : [];
  const hotelAmount = typeof getHotelRatingDeductionForEmployee === 'function' ? getHotelRatingDeductionForEmployee(employeeName) : 0;
  const showHotelInThisBranch = !forBranch || (typeof getBranchWithMaxNegativeRatingsForEmployee === 'function' && getBranchWithMaxNegativeRatingsForEmployee(employeeName) === forBranch);
  if (hotelAmount > 0 && showHotelInThisBranch) {
    const count = Math.round(hotelAmount / 10) || 1;
    list.push({
      discountType: 'خصم تقييم الفندق — إجمالي مكالمات لم يُرد عليها أدت إلى فقدان فرص حجز:',
      discountPercentage: null,
      amount: hotelAmount,
      isHotelRating: true
    });
  }
  return list;
}

/** فتح نافذة أسباب الخصومات وتواريخها وقيمها لموظف (من كارت أكثر الموظفين خصومات) */
function showMostDiscountsDetail(employeeName) {
  var modal = document.getElementById('mostDiscountsDetailModal');
  var titleEl = document.getElementById('mostDiscountsDetailTitle');
  var bodyEl = document.getElementById('mostDiscountsDetailBody');
  if (!modal || !bodyEl) return;
  var list = [];
  if (typeof getDiscountDetailsForEmployee === 'function') {
    list = getDiscountDetailsForEmployee(employeeName || '') || [];
  }
  if (titleEl) titleEl.textContent = 'أسباب الخصومات وتواريخها وقيمها – ' + (employeeName || '');
  if (list.length === 0) {
    bodyEl.innerHTML = '<p class="text-gray-400">لا توجد خصومات مسجّلة لهذا الموظف.</p>';
  } else {
    bodyEl.innerHTML = list.map(function (d) {
      var eventDate = '';
      if (d.eventDate) {
        try { eventDate = new Date(d.eventDate + 'T00:00:00').toLocaleDateString('ar-SA'); } catch (e) { eventDate = d.eventDate; }
      } else if (d.appliedAt) {
        try { eventDate = new Date(d.appliedAt).toLocaleDateString('ar-SA'); } catch (e) { eventDate = d.appliedAt; }
      } else {
        eventDate = '—';
      }
      var pct = (d.discountPercentage != null && d.discountPercentage !== '') ? Number(d.discountPercentage) : 0;
      var reason = (d.discountType || '—');
      var appliedByText = (d.appliedBy && d.appliedBy.trim()) ? d.appliedBy : 'الأدمن';
      return '<div class="p-3 rounded-lg border border-white/10 bg-white/5">' +
        '<div class="font-bold text-red-400">سبب الخصم: ' + reason + '</div>' +
        '<div class="text-gray-300 mt-1">التاريخ: ' + eventDate + '</div>' +
        '<div class="text-gray-300">النسبة: ' + (isNaN(pct) ? '—' : pct + '%') + '</div>' +
        '<div class="text-gray-400 mt-1 text-xs">مطبق من: ' + appliedByText + '</div>' +
        '</div>';
    }).join('');
  }
  modal.classList.remove('hidden');
  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('z-index', '1005', 'important');
}

function closeMostDiscountsDetailModal(ev) {
  if (ev && ev.target !== ev.currentTarget) return;
  var modal = document.getElementById('mostDiscountsDetailModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Calculate aggregated net for employee (same logic as "الكل" view)
function calculateAggregatedNetForEmployee(employeeName) {
  // Get all employees with this name (from all branches)
  const allEmpBranches = db.filter(e => e.name === employeeName);
  if (allEmpBranches.length === 0) return 0;
  
  // Calculate aggregated stats (same as getAggregatedStats in renderUI)
  const aggregatedCount = allEmpBranches.reduce((sum, e) => sum + (e.count || 0), 0);
  const aggregatedEvalBooking = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsBooking || 0), 0);
  const aggregatedEvalGoogle = allEmpBranches.reduce((sum, e) => sum + (e.evaluationsGoogle || 0), 0);
  
  // Calculate aggregated gross
  const aggregatedRate = aggregatedCount > 100 ? 3 : (aggregatedCount > 50 ? 2 : 1);
  const aggregatedGross = (aggregatedCount * aggregatedRate) + (aggregatedEvalBooking * 20) + (aggregatedEvalGoogle * 10);
  const aggregatedFund = aggregatedGross * getSupportFundRatio();
  let baseNet = aggregatedGross - aggregatedFund;
  
  // Calculate aggregated attendance bonus
  const firstEmp = allEmpBranches[0];
  let totalDays = 0;
  if (firstEmp && firstEmp.attendanceDaysPerBranch) {
    totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
  } else {
    totalDays = firstEmp?.totalAttendanceDays || (firstEmp?.attendance26Days === true ? 26 : 0);
  }
  const aggregatedAttendanceBonus = totalDays >= 26 && firstEmp?.attendance26Days === true ? baseNet * 0.25 : 0;
  baseNet = baseNet + aggregatedAttendanceBonus;
  
  // Calculate excellence and commitment bonuses (need to recalculate branch winners)
  const branchWinners = {};
  [...branches].forEach(b => {
    branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
  });
  
  // Recalculate branch winners (simplified version)
  db.forEach(emp => {
    const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
    const evBooking = emp.evaluationsBooking || 0;
    const evGoogle = emp.evaluationsGoogle || 0;
    const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
    const fund = gross * getSupportFundRatio();
    let net = gross - fund;
    const attendance26Days = emp.attendance26Days === true;
    const attendanceBonus = attendance26Days ? net * 0.25 : 0;
    net = net + attendanceBonus;
    
    const bw = branchWinners[emp.branch];
    if (!bw) return;
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
  });
  
  // Check for excellence and commitment bonuses
  let excellenceBonus = 0;
  let commitmentBonus = 0;
  
  // Check if employee has excellence bonus in any branch
  allEmpBranches.forEach(emp => {
    const bw = branchWinners[emp.branch];
    if (bw?.book.ids.includes(emp.id) && bw?.eval.ids.includes(emp.id) && bw.book.val > 0 && bw.eval.val > 0) {
      excellenceBonus = 50;
    }
    if (totalDays >= 26 && firstEmp?.attendance26Days === true && bw?.attendance.ids.includes(emp.id)) {
      const isMostEval = bw?.eval.ids.includes(emp.id) && bw.eval.val > 0;
      const isMostBook = bw?.book.ids.includes(emp.id) && bw.book.val > 0;
      if (isMostEval || isMostBook) {
        commitmentBonus = 50;
      }
    }
  });
  
  const finalNet = baseNet + excellenceBonus + commitmentBonus;
  return finalNet;
}

// Show discounts modal
function showDiscountsModal() {
  console.log('showDiscountsModal called');
  // الخصومات صلاحية أدمن فقط
  var _role = typeof localStorage !== 'undefined' ? localStorage.getItem('adora_current_role') : null;
  if (_role && _role !== 'admin') {
    if (typeof showToast === 'function') showToast('❌ الخصومات صلاحية المدير فقط', 'error');
    return;
  }
  const modal = document.getElementById('discountsModal');
  if (!modal) {
    console.error('discountsModal not found!');
    return;
  }
  console.log('Modal found, showing...');
  
  // Load discounts and discount types
  loadDiscounts();
  loadDiscountTypes();
  
  // Populate employees list (all unique names from all branches - like "الكل" view)
  updateDiscountEmployeesList();
  
  // Populate discount types
  updateDiscountTypesSelect();
  
  // Populate discounts list
  populateDiscountsList();
  
  // Show modal
  modal.classList.remove('hidden');
  modal.style.setProperty('display', 'flex', 'important');
  modal.style.setProperty('z-index', '1003', 'important');
  modal.style.setProperty('visibility', 'visible', 'important');
  modal.style.setProperty('opacity', '1', 'important');
  console.log('Modal should be visible now. Classes:', modal.className, 'Display:', window.getComputedStyle(modal).display);
}

// Close discounts modal
function closeDiscountsModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.closest('.glass')) {
    return;
  }
  const modal = document.getElementById('discountsModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Update employees list (all unique names from all branches - like "الكل" view)
function updateDiscountEmployeesList() {
  const employeeSelect = document.getElementById('discountEmployeeSelect');
  if (!employeeSelect) return;
  
  // Get unique employee names from ALL branches (like "الكل" view)
  const uniqueEmployees = new Map();
  
  db.forEach(emp => {
    if (!uniqueEmployees.has(emp.name)) {
      uniqueEmployees.set(emp.name, emp);
    }
  });
  
  // Sort by name
  const sortedNames = Array.from(uniqueEmployees.keys()).sort();
  
  employeeSelect.innerHTML = '<option value="">-- اختر الموظف --</option>';
  sortedNames.forEach(name => {
    const option = document.createElement('option');
    option.value = name;
    // Show name with branch count if duplicate
    const allEmpBranches = db.filter(e => e.name === name);
    const branchText = allEmpBranches.length > 1 ? ` (${allEmpBranches.length} فروع)` : '';
    option.textContent = name + branchText;
    employeeSelect.appendChild(option);
  });
  
  // Hide employee info initially
  const employeeInfo = document.getElementById('selectedEmployeeInfo');
  if (employeeInfo) {
    employeeInfo.classList.add('hidden');
  }
}

// Update employee info when selected
function updateDiscountEmployeeInfo() {
  const employeeSelect = document.getElementById('discountEmployeeSelect');
  const employeeInfo = document.getElementById('selectedEmployeeInfo');
  
  if (!employeeSelect || !employeeInfo) return;
  
  const selectedName = employeeSelect.value;
  if (selectedName) {
    showEmployeeDiscountInfo(selectedName);
  } else {
    employeeInfo.classList.add('hidden');
  }
}

// Show employee discount info (aggregated net)
function showEmployeeDiscountInfo(employeeName) {
  const employeeInfo = document.getElementById('selectedEmployeeInfo');
  const employeeNameEl = document.getElementById('selectedEmployeeName');
  const employeeNetEl = document.getElementById('selectedEmployeeNet');
  
  if (!employeeInfo || !employeeNameEl || !employeeNetEl) return;
  
  // Calculate aggregated net
  const aggregatedNet = calculateAggregatedNetForEmployee(employeeName);
  
  employeeNameEl.textContent = employeeName;
  employeeNetEl.textContent = aggregatedNet.toFixed(2);
  
  employeeInfo.classList.remove('hidden');
}

// Update discount types select (البنود الـ 55 + الإضافية، وفي الآخر "إضافة نوع خصم جديد")
function updateDiscountTypesSelect() {
  const select = document.getElementById('discountTypeSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">-- اختر نوع الخصم --</option>';
  (discountTypes || []).forEach(function (type) {
    const option = document.createElement('option');
    option.value = type;
    option.textContent = type;
    select.appendChild(option);
  });
  var addOpt = document.createElement('option');
  addOpt.value = '__add_new__';
  addOpt.textContent = '➕ إضافة نوع خصم جديد';
  addOpt.setAttribute('data-add-new', '1');
  select.appendChild(addOpt);
  
  // قائمة منسدلة عادية (سطر واحد عند الإغلاق — لا listbox)
  select.size = 1;
  select.removeAttribute('size');
  
  select.onchange = function () {
    if (this.value === '__add_new__') {
      this.value = '';
      if (typeof showManageDiscountTypesModal === 'function') showManageDiscountTypesModal();
    }
  };
}

// Add discount
function addDiscount() {
  const employeeSelect = document.getElementById('discountEmployeeSelect');
  const typeSelect = document.getElementById('discountTypeSelect');
  const percentageInput = document.getElementById('discountPercentageInput');
  const eventDateInput = document.getElementById('discountEventDateInput');
  
  if (!employeeSelect || !typeSelect || !percentageInput || !eventDateInput) return;
  
  const employeeName = employeeSelect.value;
  const discountType = typeSelect.value;
  const discountPercentage = parseFloat(percentageInput.value);
  const eventDate = eventDateInput.value;
  
  // Validation
  if (!employeeName) {
    showToast('❌ يرجى اختيار الموظف', 'error');
    return;
  }
  if (!discountType || discountType === '__add_new__') {
    showToast('❌ يرجى اختيار نوع الخصم', 'error');
    return;
  }
  if (isNaN(discountPercentage) || discountPercentage < 1 || discountPercentage > 100) {
    showToast('❌ يرجى إدخال نسبة خصم صحيحة (من 1% إلى 100%)', 'error');
    return;
  }
  if (!eventDate) {
    showToast('❌ يرجى اختيار تاريخ الحدث', 'error');
    return;
  }
  
  // من يطبق الخصم (حسب الدور)
  var role = (typeof localStorage !== 'undefined' && localStorage.getItem('adora_current_role')) || 'admin';
  var appliedBy = role === 'supervisor' ? 'المشرف' : (role === 'manager' ? 'المدير' : 'الأدمن');
  
  // Create discount object
  const discount = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    employeeName: employeeName,
    discountType: discountType,
    discountPercentage: discountPercentage,
    eventDate: eventDate, // تاريخ الحدث
    appliedAt: new Date().toISOString(), // تاريخ إضافة الخصم
    appliedBy: appliedBy // مطبق من: الأدمن / المدير / المشرف
  };
  
  // Add to discounts array
  // Ensure discounts is defined
  if (typeof discounts === 'undefined') {
    loadDiscounts();
  }
  // Get discounts reference from window
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  const discountsRef = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  discountsRef.push(discount);
  // Update window reference
  if (typeof window !== 'undefined') {
    window.discounts = discountsRef;
  }
  saveDiscounts();
  if (typeof window !== 'undefined' && typeof window.syncLivePeriodToFirebase === 'function') {
    window.syncLivePeriodToFirebase();
  }
  
  // Clear form
  employeeSelect.value = '';
  typeSelect.value = '';
  percentageInput.value = '';
  eventDateInput.value = '';
  document.getElementById('selectedEmployeeInfo')?.classList.add('hidden');
  
  // Update UI
  populateDiscountsList();
  
  // Re-render table to show discount
  if (typeof renderUI === 'function') {
    renderUI(currentFilter);
  }
  
  showToast('✅ تم إضافة الخصم بنجاح', 'success');
}

// Populate discounts list
function populateDiscountsList() {
  const list = document.getElementById('discountsList');
  if (!list) return;
  
  // Load discounts first if not already loaded
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  
  // Get discounts from window scope
  let currentDiscounts = [];
  if (typeof window !== 'undefined' && window.discounts) {
    currentDiscounts = window.discounts;
  } else {
    // Fallback: try to load again
    loadDiscounts();
    currentDiscounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  }
  
  // Ensure discounts is an array
  if (!Array.isArray(currentDiscounts) || currentDiscounts.length === 0) {
    list.innerHTML = '<p class="text-gray-400 text-center py-4">لا توجد خصومات مطبقة</p>';
    return;
  }
  
  // Group by employee name
  const discountsByEmployee = {};
  currentDiscounts.forEach(discount => {
    if (!discountsByEmployee[discount.employeeName]) {
      discountsByEmployee[discount.employeeName] = [];
    }
    discountsByEmployee[discount.employeeName].push(discount);
  });
  
  let html = '';
  const escHtml = typeof window !== 'undefined' && typeof window.escHtml === 'function' ? window.escHtml : (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const escAttr = typeof window !== 'undefined' && typeof window.escAttr === 'function' ? window.escAttr : (s) => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  Object.keys(discountsByEmployee).sort().forEach(employeeName => {
    const employeeDiscounts = discountsByEmployee[employeeName];
    // Calculate total discount from all branches (each branch separately)
    const totalDiscountAmount = typeof getTotalDiscountForEmployee === 'function' 
      ? getTotalDiscountForEmployee(employeeName)
      : 0;
    // Calculate aggregated net for display
    const aggregatedNet = calculateAggregatedNetForEmployee(employeeName);
    
    html += `
      <div class="discount-card glass p-3 rounded-lg border border-white/20 min-w-0 overflow-hidden">
        <div class="flex justify-between items-start mb-1 gap-2 min-w-0">
          <div class="min-w-0 flex-1 overflow-hidden">
            <h4 class="text-white font-bold text-sm leading-tight break-words">${escHtml(employeeName)}</h4>
            <p class="text-xs text-gray-400 break-words mt-0.5">الصافي المجمع: ${aggregatedNet.toFixed(2)} ريال</p>
          </div>
          <span class="text-red-400 font-bold text-sm shrink-0">-${totalDiscountAmount.toFixed(2)} ريال</span>
        </div>
        <div class="space-y-1 mt-2 min-w-0">
          ${employeeDiscounts.map(discount => {
            let eventDateStr = '-';
            if (discount.eventDate) {
              try {
                const d = new Date(discount.eventDate + 'T00:00:00');
                const dayName = d.toLocaleDateString('ar-EG', { weekday: 'long' });
                const gregorianDate = d.toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
                eventDateStr = gregorianDate + ' — ' + dayName;
              } catch (e) { eventDateStr = discount.eventDate; }
            }
            const safeId = escAttr(String(discount.id != null ? discount.id : ''));
            return `
            <div class="flex justify-between items-start gap-1.5 bg-white/5 p-1.5 rounded min-w-0 overflow-hidden">
              <div class="min-w-0 flex-1 break-words overflow-hidden">
                <span class="text-xs text-gray-300 break-words block leading-snug">${escHtml(discount.discountType)}</span>
                <span class="text-[11px] text-gray-500">(${escHtml(String(discount.discountPercentage))}%)</span>
                ${discount.eventDate ? `<span class="text-[11px] text-gray-400 block mt-0.5">📅 ${escHtml(eventDateStr)}</span>` : ''}
              </div>
              <button onclick="deleteDiscount('${safeId}')" class="text-red-400 hover:text-red-300 text-xs font-bold px-1.5 py-0.5 rounded hover:bg-red-500/20 transition-colors shrink-0">
                🗑️ حذف
              </button>
            </div>
          `;
          }).join('')}
        </div>
      </div>
    `;
  });
  
  list.innerHTML = html;
}

// Delete discount
function deleteDiscount(discountId) {
  if (!confirm('هل أنت متأكد من حذف هذا الخصم؟')) return;
  
  // Ensure discounts is defined
  if (typeof discounts === 'undefined') {
    loadDiscounts();
  }
  // Get discounts reference from window
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  const discountsRef = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  const updatedDiscounts = discountsRef.filter(d => d.id !== discountId);
  // Update window reference
  if (typeof window !== 'undefined') {
    window.discounts = updatedDiscounts;
  }
  saveDiscounts();
  if (typeof window !== 'undefined' && typeof window.syncLivePeriodToFirebase === 'function') {
    window.syncLivePeriodToFirebase();
  }
  
  populateDiscountsList();
  
  // Re-render table
  if (typeof renderUI === 'function') {
    renderUI(currentFilter);
  }
  
  showToast('✅ تم حذف الخصم بنجاح', 'success');
}

// Show manage discount types modal
function showManageDiscountTypesModal() {
  const modal = document.getElementById('manageDiscountTypesModal');
  if (!modal) return;
  
  loadDiscountTypes();
  populateDiscountTypesList();
  
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

// Close manage discount types modal
function closeManageDiscountTypesModal(event) {
  if (event && event.target !== event.currentTarget && !event.target.closest('.glass')) {
    return;
  }
  const modal = document.getElementById('manageDiscountTypesModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }
}

// Populate discount types list (البنود الـ 55 افتراضية لا تُحذف، الإضافية يُحذف)
function populateDiscountTypesList() {
  const list = document.getElementById('discountTypesList');
  if (!list) return;
  
  var default55 = (typeof window !== 'undefined' && window.DEFAULT_DISCOUNT_CLAUSES_55) ? window.DEFAULT_DISCOUNT_CLAUSES_55 : [];
  var html = '';
  (discountTypes || []).forEach(function (type, index) {
    var isDefault = default55.indexOf(type) >= 0;
    var escaped = String(type).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    html += '<div class="flex justify-between items-center bg-white/5 p-3 rounded gap-2">' +
      '<span class="text-white font-semibold break-words flex-1">' + escaped + '</span>' +
      (isDefault ? '<span class="text-xs text-gray-500 flex-shrink-0">من اللائحة</span>' :
        '<button type="button" onclick="removeDiscountType(' + index + ')" class="text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-500/20 transition-colors flex-shrink-0">🗑️ حذف</button>') +
      '</div>';
  });
  list.innerHTML = html;
}

// Add discount type
function addDiscountType() {
  const input = document.getElementById('newDiscountTypeInput');
  if (!input) return;
  
  const newType = input.value.trim();
  if (!newType) {
    showToast('❌ يرجى إدخال نوع خصم', 'error');
    return;
  }
  
  if (discountTypes.includes(newType)) {
    showToast('❌ هذا النوع موجود بالفعل', 'error');
    return;
  }
  
  discountTypes.push(newType);
  saveDiscountTypes();
  
  input.value = '';
  populateDiscountTypesList();
  updateDiscountTypesSelect();
  
  showToast('✅ تم إضافة نوع الخصم بنجاح', 'success');
}

// Remove discount type
function removeDiscountType(index) {
  if (!confirm('هل أنت متأكد من حذف هذا النوع؟')) return;
  
  discountTypes.splice(index, 1);
  saveDiscountTypes();
  
  populateDiscountTypesList();
  updateDiscountTypesSelect();
  
  showToast('✅ تم حذف نوع الخصم بنجاح', 'success');
}

// === Statistics Page Functions ===
function loadStatisticsPage() {
  console.log('📊 loadStatisticsPage called');
  
  // Check if statistics content is visible
  const statisticsContent = document.getElementById('statisticsReportsContent');
  if (!statisticsContent) {
    console.error('❌ statisticsReportsContent not found');
    return;
  }
  
  // Force check and remove hidden if present
  if (statisticsContent.classList.contains('hidden')) {
    console.log('⚠️ statisticsContent has hidden class, removing it...');
    statisticsContent.classList.remove('hidden');
    statisticsContent.style.display = '';
    statisticsContent.style.visibility = '';
    statisticsContent.style.opacity = '';
  }
  
  // Double check visibility
  const computedStyle = window.getComputedStyle(statisticsContent);
  console.log('✅ statisticsContent visibility check:', {
    display: computedStyle.display,
    visibility: computedStyle.visibility,
    opacity: computedStyle.opacity,
    hasHiddenClass: statisticsContent.classList.contains('hidden')
  });
  
  if (computedStyle.display === 'none' || statisticsContent.classList.contains('hidden')) {
    console.error('❌ statisticsContent is still hidden after removal attempt');
    // Force show
    statisticsContent.style.display = 'block';
    statisticsContent.style.visibility = 'visible';
    statisticsContent.style.opacity = '1';
  }
  
  console.log('✅ statisticsContent is visible, loading stats...');
  
  // Load current period statistics
  loadCurrentPeriodStats();
  
  // Load archived periods list for statistics
  loadArchivedStatsPeriodsList();
  
  // Populate employee performance table
  populateEmployeePerformanceTable();
  
  // ملء كروت الرصيد التراكمي من النقاط
  if (typeof populateCumulativePointsCards === 'function') populateCumulativePointsCards();
  
  console.log('✅ loadStatisticsPage completed');
}

/** Toggle cumulative points section (collapsible) */
function toggleCumulativePoints() {
  var body = document.getElementById('cumulativePointsBody');
  var arrow = document.getElementById('cumulativePointsArrow');
  var hint = arrow ? arrow.parentElement.querySelector('.text-xs') : null;
  if (!body) return;
  var isHidden = body.style.display === 'none';
  body.style.display = isHidden ? '' : 'none';
  if (arrow) arrow.style.transform = isHidden ? 'rotate(-90deg)' : '';
  if (hint) hint.textContent = isHidden ? '(اضغط للطي)' : '(اضغط للتوسيع)';
}
if (typeof window !== 'undefined') window.toggleCumulativePoints = toggleCumulativePoints;

/** ملء كروت الرصيد التراكمي من النقاط — من Firebase فقط (عبر الذاكرة بعد التحميل)، مرتبط باسم الموظف، لا يُمسح أبداً */
function populateCumulativePointsCards() {
  var container = document.getElementById('cumulativePointsCards');
  if (!container) return;
  if (typeof window !== 'undefined' && window.__cumulativePointsFromFirebase === undefined && typeof loadCumulativePointsFromFirebase === 'function') {
    loadCumulativePointsFromFirebase().then(function () {
      if (typeof populateCumulativePointsCards === 'function') populateCumulativePointsCards();
    });
    container.innerHTML = '<p class="col-span-full text-gray-400 text-center py-4">جاري تحميل الرصيد التراكمي من Firebase...</p>';
    return;
  }
  var cumulative = (typeof window !== 'undefined' && window.__cumulativePointsFromFirebase && typeof window.__cumulativePointsFromFirebase === 'object')
    ? window.__cumulativePointsFromFirebase
    : {};
  var entries = [];
  for (var name in cumulative) { if (cumulative.hasOwnProperty(name)) entries.push({ name: name, points: cumulative[name] }); }
  entries.sort(function (a, b) { return (b.points || 0) - (a.points || 0); });
  var threshold = typeof CUMULATIVE_REWARD_THRESHOLD !== 'undefined' ? CUMULATIVE_REWARD_THRESHOLD : 100000;
  var rewardAmount = typeof CUMULATIVE_REWARD_AMOUNT !== 'undefined' ? CUMULATIVE_REWARD_AMOUNT : 1000;
  var html = '';
  if (entries.length === 0) {
    html = '<p class="col-span-full text-gray-400 text-center py-4">لا يوجد رصيد تراكمي بعد. الرصيد يزيد عند كل إغلاق فترة ويُحفظ على Firebase فقط.</p>';
  } else {
    entries.forEach(function (e) {
      var pts = parseFloat(e.points) || 0;
      var eligible = pts >= threshold;
      var cardClass = 'glass p-4 rounded-xl border min-h-[80px] flex flex-col justify-center';
      if (eligible) cardClass += ' border-amber-500/50 bg-amber-500/10';
      else cardClass += ' border-turquoise/30';
      var badge = eligible ? '<span class="text-amber-400 text-xs font-bold mt-1">يستحق باكيج التميز</span>' : '';
      var safeName = String(e.name || '-').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      html += '<div class="' + cardClass + '">' +
        '<span class="font-bold text-white truncate" title="' + safeName + '">' + safeName + '</span>' +
        '<span class="text-turquoise font-black tabular-nums text-lg">' + pts.toLocaleString('ar-SA') + ' نقطة</span>' +
        badge + '</div>';
    });
  }
  container.innerHTML = html;
}

function loadCurrentPeriodStats() {
  console.log('📊 loadCurrentPeriodStats called');
  const container = document.getElementById('currentPeriodStats');
  if (!container) {
    console.error('❌ currentPeriodStats container not found');
    // Try to create it if it doesn't exist
    const parent = document.querySelector('#statisticsReportsContent .mb-8');
    if (parent) {
      const newContainer = document.createElement('div');
      newContainer.id = 'currentPeriodStats';
      newContainer.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-6';
      parent.appendChild(newContainer);
      console.log('✅ Created currentPeriodStats container');
      return loadCurrentPeriodStats(); // Retry
    }
    return;
  }
  
  console.log('✅ currentPeriodStats container found');
  
  // Get db from multiple sources (window.db, localStorage, or empty array)
  let currentDb = [];
  if (typeof window !== 'undefined' && window.db && Array.isArray(window.db) && window.db.length > 0) {
    currentDb = window.db;
    console.log('📊 Using window.db, length:', currentDb.length);
  } else {
    // Try to get from localStorage as fallback
    try {
      const savedDb = localStorage.getItem('adora_rewards_db');
      if (savedDb) {
        currentDb = JSON.parse(savedDb);
        // Update window.db for future use
        if (typeof window !== 'undefined') {
          window.db = currentDb;
        }
        console.log('📊 Using localStorage, length:', currentDb.length);
      } else {
        console.log('⚠️ No data in localStorage');
      }
    } catch (e) {
      console.error('❌ Error loading db from localStorage:', e);
    }
  }
  
  console.log('📊 Final db length:', currentDb.length);
  
  if (!currentDb || currentDb.length === 0) {
    console.log('⚠️ No data available for statistics');
    container.innerHTML = `
      <div class="glass p-4 rounded-xl border border-turquoise/30">
        <div class="text-sm text-gray-400 mb-1">أكثر الموظفين حجوزات</div>
        <div class="text-lg font-black text-turquoise">—</div>
      </div>
      <div class="glass p-4 rounded-xl border border-turquoise/30">
        <div class="text-sm text-gray-400 mb-1">أكثرهم تقييمات بوكينج</div>
        <div class="text-lg font-black text-turquoise">—</div>
      </div>
      <div class="glass p-4 rounded-xl border border-turquoise/30">
        <div class="text-sm text-gray-400 mb-1">أكثرهم تقييمات خرائط</div>
        <div class="text-lg font-black text-turquoise">—</div>
      </div>
      <div class="glass p-4 rounded-xl border border-turquoise/30">
        <div class="text-sm text-gray-400 mb-1">أكثرهم التزاماً في الحضور (26 يوم+)</div>
        <div class="text-lg font-black text-turquoise">—</div>
      </div>
      <div class="glass p-4 rounded-xl border border-turquoise/30">
        <div class="text-sm text-gray-400 mb-1">أكثرهم حصولاً على صافي</div>
        <div class="text-lg font-black text-turquoise">—</div>
      </div>
      <div class="glass p-4 rounded-xl border border-turquoise/30">
        <div class="text-sm text-gray-400 mb-1">أكثر الموظفين خصومات</div>
        <div class="text-lg font-black text-turquoise">—</div>
      </div>
    `;
    return;
  }
  
  // بناء فائزي الفروع (مطابق لـ app.js) لاستخدام حافز التميز 50 وحافز الالتزام 50 ثم الخصم مرة واحدة — ليتطابق الصافي مع الجدول الإداري
  const branches = [...new Set(currentDb.map(e => e.branch).filter(Boolean))];
  const branchWinners = {};
  branches.forEach(b => {
    branchWinners[b] = { net: { val: -1, ids: [] }, eval: { val: -1, ids: [] }, book: { val: -1, ids: [] }, attendance: { val: -1, ids: [] } };
  });
  currentDb.forEach(emp => {
    const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
    const evBooking = emp.evaluationsBooking || 0;
    const evGoogle = emp.evaluationsGoogle || 0;
    const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
    const fund = gross * getSupportFundRatio();
    const net = gross - fund;
    const bw = branchWinners[emp.branch];
    if (!bw) return;
    if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
    else if (net === bw.net.val) bw.net.ids.push(emp.id);
    if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
    else if (evBooking === bw.eval.val) bw.eval.ids.push(emp.id);
    if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
    else if (emp.count === bw.book.val) bw.book.ids.push(emp.id);
    const empNameCount = currentDb.filter(e => e.name === emp.name).length;
    let empAttendanceDays = emp.attendance26Days === true ? 26 : 0;
    if (empNameCount > 1) empAttendanceDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
    if (empAttendanceDays >= 26) {
      let isHighestDays = true;
      currentDb.filter(e => e.branch === emp.branch).forEach(other => {
        if (other.name === emp.name) return;
        const otherNameCount = currentDb.filter(e => e.name === other.name).length;
        let otherDays = other.attendance26Days === true ? 26 : 0;
        if (otherNameCount > 1) otherDays = other.totalAttendanceDays || (other.attendance26Days === true ? 26 : 0);
        if (otherDays > empAttendanceDays) isHighestDays = false;
      });
      if (isHighestDays) {
        if (bw.attendance.val === -1) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
        else if (empAttendanceDays > bw.attendance.val) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
        else if (empAttendanceDays === bw.attendance.val) bw.attendance.ids.push(emp.id);
      }
    }
  });

  // Get unique employees (aggregate duplicates like "الكل" view)
  const uniqueEmployees = new Map();
  currentDb.forEach(emp => {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, []);
    }
    uniqueEmployees.get(key).push(emp);
  });
  
  // Per-employee aggregates for "أوائل" cards — الصافي من نفس مصدر الجدول (calculateEmployeeReport / calculateAggregatedEmployeeReport) ليتطابق الكارت مع الجدول
  const employeeAggregates = [];
  uniqueEmployees.forEach((employees, name) => {
    let totalCount = 0;
    let totalEvalBooking = 0;
    let totalEvalGoogle = 0;
    let hasAttendance26 = false;
    
    employees.forEach(emp => {
      totalCount += emp.count || 0;
      totalEvalBooking += emp.evaluationsBooking || 0;
      totalEvalGoogle += emp.evaluationsGoogle || 0;
      if (emp.attendance26Days === true) hasAttendance26 = true;
    });
    
    let totalNet = 0;
    if (typeof calculateAggregatedEmployeeReport === 'function' && typeof calculateEmployeeReport === 'function') {
      const report = employees.length > 1
        ? calculateAggregatedEmployeeReport(name)
        : calculateEmployeeReport(employees[0].id);
      totalNet = (report && report.finalNet != null) ? report.finalNet : 0;
    }
    
    employeeAggregates.push({
      name,
      totalCount,
      totalEvalBooking,
      totalEvalGoogle,
      totalNet,
      hasAttendance26
    });
  });

  // حساب نقاط التقييم لكل موظف (نفس معادلة الجدول) لاستخدامها في كسر التعادل واختيار "أكثرهم التزاماً"
  const minCount = employeeAggregates.length ? Math.min(...employeeAggregates.map(e => e.totalCount)) : 0;
  const maxCount = employeeAggregates.length ? Math.max(...employeeAggregates.map(e => e.totalCount)) : 0;
  const totalsEval = employeeAggregates.map(e => e.totalEvalBooking + e.totalEvalGoogle);
  const minEval = totalsEval.length ? Math.min(...totalsEval) : 0;
  const maxEval = totalsEval.length ? Math.max(...totalsEval) : 0;
  const rangeCount = maxCount - minCount;
  const rangeEval = maxEval - minEval;
  employeeAggregates.forEach(agg => {
    const totalEval = agg.totalEvalBooking + agg.totalEvalGoogle;
    const pctCount = rangeCount <= 0 ? 0.5 : (agg.totalCount - minCount) / rangeCount;
    const pctEval = rangeEval <= 0 ? 0.5 : (totalEval - minEval) / rangeEval;
    const combined = (pctCount + pctEval) / 2;
    const boost = agg.hasAttendance26 ? 0.15 : 0;
    let score = Math.min(1, combined + boost);
    let discountPoints = 0;
    if (typeof getTotalDiscountForEmployee === 'function' && getTotalDiscountForEmployee(agg.name) > 0) discountPoints += 0.25;
    if (typeof getHotelRatingDeductionForEmployee === 'function' && getHotelRatingDeductionForEmployee(agg.name) > 0) discountPoints += 0.10;
    discountPoints = Math.min(0.10, discountPoints);
    score = Math.max(0, score - discountPoints);
    let rating = Math.round(score * 100);
    if (!agg.hasAttendance26 && rating > 84) rating = 84;
    agg.rating = rating;
  });

  // أوائل: أكثر حجوزات، أكثر تقييم بوكينج، أكثر خرائط، أكثر التزاماً 26 يوم (الأعلى تقييماً)، أكثر صافي — عند التساوي يُختار الأعلى تقييماً
  const byBookings = (a, b) => (b.totalCount !== a.totalCount ? b.totalCount - a.totalCount : (b.rating || 0) - (a.rating || 0));
  const byEvalBooking = (a, b) => (b.totalEvalBooking !== a.totalEvalBooking ? b.totalEvalBooking - a.totalEvalBooking : (b.rating || 0) - (a.rating || 0));
  const byEvalGoogle = (a, b) => (b.totalEvalGoogle !== a.totalEvalGoogle ? b.totalEvalGoogle - a.totalEvalGoogle : (b.rating || 0) - (a.rating || 0));
  const byRating = (a, b) => ((b.rating || 0) !== (a.rating || 0) ? (b.rating || 0) - (a.rating || 0) : (b.totalNet || 0) - (a.totalNet || 0));
  const byNet = (a, b) => (b.totalNet !== a.totalNet ? b.totalNet - a.totalNet : (b.rating || 0) - (a.rating || 0));

  const _topBookings = employeeAggregates.length ? employeeAggregates.slice().sort(byBookings)[0] : null;
  const _topEvalBooking = employeeAggregates.length ? employeeAggregates.slice().sort(byEvalBooking)[0] : null;
  const _topEvalGoogle = employeeAggregates.length ? employeeAggregates.slice().sort(byEvalGoogle)[0] : null;
  const with26 = employeeAggregates.filter(e => e.hasAttendance26);
  const topAttendance26 = with26.length ? with26.slice().sort(byRating)[0] : null;
  const _topNet = employeeAggregates.length ? employeeAggregates.slice().sort(byNet)[0] : null;
  // لا نعرض اسماً في الكروت عندما القيمة = 0 (المفترض أكبر من 0 فقط)
  const topBookings = (_topBookings && (_topBookings.totalCount || 0) > 0) ? _topBookings : null;
  const topEvalBooking = (_topEvalBooking && (_topEvalBooking.totalEvalBooking || 0) > 0) ? _topEvalBooking : null;
  const topEvalGoogle = (_topEvalGoogle && (_topEvalGoogle.totalEvalGoogle || 0) > 0) ? _topEvalGoogle : null;
  const topNet = (_topNet && (_topNet.totalNet || 0) > 0) ? _topNet : null;
  
  // أكثر الموظفين خصومات (من window.discounts)
  let topDiscountsName = null;
  try {
    const dlist = (typeof window !== 'undefined' && window.discounts && Array.isArray(window.discounts)) ? window.discounts : [];
    const byEmp = {};
    dlist.forEach(d => {
      const n = d.employeeName || '';
      if (!n) return;
      if (!byEmp[n]) byEmp[n] = { count: 0, totalPct: 0 };
      byEmp[n].count += 1;
      byEmp[n].totalPct += parseFloat(d.discountPercentage) || 0;
    });
    const sorted = Object.entries(byEmp).sort((a, b) => b[1].count - a[1].count || b[1].totalPct - a[1].totalPct);
    topDiscountsName = sorted.length ? sorted[0][0] : null;
  } catch (e) { /* ignore */ }
  
  const fmt = (n) => (isNaN(n) || !isFinite(n) ? '0' : Number(n).toFixed(0));
  const discountNameEsc = topDiscountsName ? String(topDiscountsName).replace(/\\/g, '\\\\').replace(/'/g, "\\'") : '';
  const discountCardOnclick = topDiscountsName ? `onclick="showMostDiscountsDetail('${discountNameEsc}')"` : '';
  const discountCardClass = 'glass p-4 rounded-xl border border-turquoise/30' + (topDiscountsName ? ' cursor-pointer hover:border-red-400/50 hover:bg-white/5 transition-all' : '');
  // عرض الاسم والرقم فقط عندما القيمة > 0 (لا نعرض 0 في الكروت)
  const showBookings = topBookings && (Number(topBookings.totalCount) || 0) > 0;
  const showEvalB = topEvalBooking && (Number(topEvalBooking.totalEvalBooking) || 0) > 0;
  const showEvalG = topEvalGoogle && (Number(topEvalGoogle.totalEvalGoogle) || 0) > 0;
  const showNet = topNet && (Number(topNet.totalNet) || 0) > 0;
  
  container.innerHTML = `
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثر الموظفين حجوزات</div>
      <div class="text-lg font-black text-turquoise">${showBookings ? topBookings.name : '—'}</div>
      <div class="text-sm text-gray-300">${showBookings ? fmt(topBookings.totalCount) + ' حجز' : ''}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم تقييمات بوكينج</div>
      <div class="text-lg font-black text-turquoise">${showEvalB ? topEvalBooking.name : '—'}</div>
      <div class="text-sm text-gray-300">${showEvalB ? fmt(topEvalBooking.totalEvalBooking) + ' تقييم' : ''}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم تقييمات خرائط</div>
      <div class="text-lg font-black text-turquoise">${showEvalG ? topEvalGoogle.name : '—'}</div>
      <div class="text-sm text-gray-300">${showEvalG ? fmt(topEvalGoogle.totalEvalGoogle) + ' تقييم' : ''}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم التزاماً في الحضور (26 يوم+)</div>
      <div class="text-lg font-black text-turquoise">${topAttendance26 ? topAttendance26.name : '—'}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم حصولاً على صافي</div>
      <div class="text-lg font-black text-turquoise">${showNet ? topNet.name : '—'}</div>
      <div class="text-sm text-green-400">${showNet ? (Number(topNet.totalNet).toFixed(2)) + ' ريال' : ''}</div>
    </div>
    <div class="${discountCardClass}" ${discountCardOnclick} title="${topDiscountsName ? 'اضغط لرؤية أسباب الخصومات وتواريخها وقيمها' : ''}">
      <div class="text-sm text-gray-400 mb-1">أكثر الموظفين خصومات</div>
      <div class="text-lg font-black ${topDiscountsName ? 'text-red-400' : 'text-turquoise'}">${topDiscountsName || '—'}</div>
      <div class="text-sm text-gray-300">${topDiscountsName ? 'اضغط للتفاصيل' : ''}</div>
    </div>
  `;
  
  container.style.display = '';
  container.style.visibility = '';
  container.style.opacity = '';
  
  const containerStyle = window.getComputedStyle(container);
  console.log('✅ Statistics cards (أوائل) rendered:', {
    topBookings: topBookings ? topBookings.name : null,
    topEvalBooking: topEvalBooking ? topEvalBooking.name : null,
    topEvalGoogle: topEvalGoogle ? topEvalGoogle.name : null,
    topAttendance26: topAttendance26 ? topAttendance26.name : null,
    topNet: topNet ? topNet.name : null,
    containerDisplay: containerStyle.display,
    containerVisibility: containerStyle.visibility
  });
  
  const parent = container.parentElement;
  if (parent) {
    parent.style.display = '';
    parent.style.visibility = '';
    parent.style.opacity = '';
  }
}

/** عند الضغط على اسم موظف من صفحة الإحصائيات: فتح تقرير النقاط بنفس آلية جمع الصافي — تقرير مجمع بالاسم (فرع واحد أو كل الفروع). */
function openEmployeeReportFromStats(empName, empId, _isDuplicate) {
  if (typeof window.showEmployeeReportAggregated === 'function' && empName) {
    window.showEmployeeReportAggregated(empName, { pointsMode: true });
    return;
  }
  if (typeof window.showEmployeeReport === 'function' && empId) {
    window.showEmployeeReport(empId, { pointsMode: true });
  }
}

/** تقرير احصائي للنقاط — يستدعي التقرير المجمع بالاسم (نفس آلية calculateAggregatedEmployeeReport: فرع واحد أو كل الفروع). */
function showEmployeePointsReportModal(empName, empId, _isDuplicate) {
  if (typeof window.showEmployeeReportAggregated === 'function' && empName) {
    window.showEmployeeReportAggregated(empName, { pointsMode: true });
    return;
  }
  if (typeof window.showEmployeeReport === 'function' && empId) {
    window.showEmployeeReport(empId, { pointsMode: true });
  }
}
if (typeof window !== 'undefined') {
  window.showEmployeePointsReportModal = showEmployeePointsReportModal;
}

/** حساب نقاط التقييم (0–100) لموظف مجمّع — نفس منطق getRatingDetailsDynamic */
function getRatingPointsForEmp(emp, minCount, maxCount, minEval, maxEval, maxEvalBooking, maxEvalGoogle) {
  const count = emp.count || 0;
  const evalBooking = emp.evalBooking || 0;
  const evalGoogle = emp.evalGoogle || 0;
  const totalEval = (emp.totalEval != null ? emp.totalEval : evalBooking + evalGoogle);
  const has26 = !!emp.hasAttendance26;
  const rangeCount = maxCount - minCount;
  const rangeEval = maxEval - minEval;
  const pctCount = rangeCount <= 0 ? 0.5 : (count - minCount) / rangeCount;
  const pctEval = rangeEval <= 0 ? 0.5 : (totalEval - minEval) / rangeEval;
  const combined = (pctCount + pctEval) / 2;
  const boost = has26 ? 0.15 : 0;
  let score = Math.min(1, combined + boost);
  if (typeof getTotalDiscountForEmployee === 'function' && getTotalDiscountForEmployee(emp.name) > 0) {
    score = Math.max(0, score - 0.10);
  }
  let points = Math.round(score * 100);
  if (!has26 && points > 84) points = 84;
  return Math.max(0, Math.min(100, points));
}

/** إرجاع نقاط كل موظف (بالاسم) من مصفوفة db — لاستخدامها عند إغلاق الفترة في الرصيد التراكمي */
function getEmployeePointsForPeriodDb(db) {
  if (!db || !Array.isArray(db) || db.length === 0) return {};
  const uniqueEmployees = new Map();
  db.forEach(function (emp) {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) uniqueEmployees.set(key, []);
    uniqueEmployees.get(key).push(emp);
  });
  const employeesData = [];
  uniqueEmployees.forEach(function (employees, name) {
    let totalCount = 0, totalEvalBooking = 0, totalEvalGoogle = 0, hasAttendance26 = false;
    employees.forEach(function (emp) {
      totalCount += emp.count || 0;
      totalEvalBooking += emp.evaluationsBooking || 0;
      totalEvalGoogle += emp.evaluationsGoogle || 0;
      if (emp.attendance26Days === true) hasAttendance26 = true;
    });
    employeesData.push({
      name: name,
      count: totalCount,
      evalBooking: totalEvalBooking,
      evalGoogle: totalEvalGoogle,
      totalEval: totalEvalBooking + totalEvalGoogle,
      hasAttendance26: hasAttendance26
    });
  });
  const minCount = employeesData.length ? Math.min.apply(null, employeesData.map(function (e) { return e.count; })) : 0;
  const maxCount = employeesData.length ? Math.max.apply(null, employeesData.map(function (e) { return e.count; })) : 0;
  const minEval = employeesData.length ? Math.min.apply(null, employeesData.map(function (e) { return e.totalEval; })) : 0;
  const maxEval = employeesData.length ? Math.max.apply(null, employeesData.map(function (e) { return e.totalEval; })) : 0;
  const maxEvalBooking = employeesData.length ? Math.max.apply(null, employeesData.map(function (e) { return e.evalBooking || 0; })) : 0;
  const maxEvalGoogle = employeesData.length ? Math.max.apply(null, employeesData.map(function (e) { return e.evalGoogle || 0; })) : 0;
  const out = {};
  employeesData.forEach(function (emp) {
    out[emp.name] = getRatingPointsForEmp(emp, minCount, maxCount, minEval, maxEval, maxEvalBooking, maxEvalGoogle);
  });
  return out;
}

/** إرجاع رصيد النقاط من الفترة (صافي + 15%) لكل موظف بالاسم — لاستخدامها عند إغلاق الفترة في الرصيد التراكمي (مطابق للنص المعروض للمستخدم). */
function getEmployeePointsBalanceForPeriodDb(db) {
  if (!db || !Array.isArray(db) || db.length === 0) return {};
  const uniqueEmployees = new Map();
  db.forEach(function (emp) {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) uniqueEmployees.set(key, []);
    uniqueEmployees.get(key).push(emp);
  });
  const branches = [...new Set(db.map(function (e) { return e.branch; }).filter(Boolean))];
  // Use computeBranchWinnersAndLosers from app.js if available
  var branchWinners = {};
  if (typeof computeBranchWinnersAndLosers === 'function') {
    branchWinners = computeBranchWinnersAndLosers(db, branches).branchWinners || {};
  } else {
    branches.forEach(function (b) {
      branchWinners[b] = { net: { val: -1, ids: [] }, eval: { val: -1, ids: [] }, book: { val: -1, ids: [] }, attendance: { val: -1, ids: [] } };
    });
    db.forEach(function (emp) {
      const gross = typeof computeGrossFromBreakdown === 'function' ? computeGrossFromBreakdown(emp) : ((emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1)) * emp.count + (emp.evaluationsBooking || 0) * 20 + (emp.evaluationsGoogle || 0) * 10);
      const evBooking = emp.evaluationsBooking || 0;
      const fund = gross * getSupportFundRatio();
      const net = gross - fund;
      const bw = branchWinners[emp.branch];
      if (!bw) return;
      if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
      else if (net === bw.net.val) bw.net.ids.push(emp.id);
      if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
      else if (evBooking === bw.eval.val) bw.eval.ids.push(emp.id);
      if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
      else if (emp.count === bw.book.val) bw.book.ids.push(emp.id);
      const empNameCount = db.filter(function (e) { return e.name === emp.name; }).length;
      var empAttendanceDays = emp.attendance26Days === true ? 26 : 0;
      if (empNameCount > 1) empAttendanceDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
      if (empAttendanceDays >= 26) {
        var isHighestDays = true;
        db.filter(function (e) { return e.branch === emp.branch; }).forEach(function (other) {
          if (other.name === emp.name) return;
          const otherNameCount = db.filter(function (e) { return e.name === other.name; }).length;
          var otherDays = other.attendance26Days === true ? 26 : 0;
          if (otherNameCount > 1) otherDays = other.totalAttendanceDays || (other.attendance26Days === true ? 26 : 0);
          if (otherDays > empAttendanceDays) isHighestDays = false;
        });
        if (isHighestDays) {
          if (bw.attendance.val === -1) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
          else if (empAttendanceDays > bw.attendance.val) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
          else if (empAttendanceDays === bw.attendance.val) bw.attendance.ids.push(emp.id);
        }
      }
    });
  }
  const out = {};
  uniqueEmployees.forEach(function (employees, name) {
    var totalNetFromBranches = 0;
    var totalGross = 0;
    var maxBranchNetPb = -1;
    var grossOfBranchWithMaxNetPb = 0;
    var hasExcellence = false;
    var hasCommitment = false;
    var isDuplicatePb = employees.length > 1;
    // challengeRowId for duplicates
    var challengeRowIdPb = null;
    if (isDuplicatePb) {
      var maxChTot = -1;
      employees.forEach(function (e) {
        var eGross = typeof computeGrossFromBreakdown === 'function' ? computeGrossFromBreakdown(e) : ((e.count > 100 ? 3 : (e.count > 50 ? 2 : 1)) * e.count + (e.evaluationsBooking || 0) * 20 + (e.evaluationsGoogle || 0) * 10);
        var eFund = eGross * getSupportFundRatio();
        var eNet = eGross - eFund;
        var eAtt = e.attendance26Days === true;
        var eBonus = eAtt ? eNet * 0.25 : 0;
        eNet = eNet + eBonus;
        if (eAtt && eBonus > 0 && eNet > maxChTot) { maxChTot = eNet; challengeRowIdPb = e.id; }
      });
    }
    employees.forEach(function (emp) {
      const gross = typeof computeGrossFromBreakdown === 'function' ? computeGrossFromBreakdown(emp) : ((emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1)) * emp.count + (emp.evaluationsBooking || 0) * 20 + (emp.evaluationsGoogle || 0) * 10);
      totalGross += gross;
      const fund = gross * getSupportFundRatio();
      var branchNet = gross - fund;
      const attendance26Days = emp.attendance26Days === true;
      var applyChallenge = isDuplicatePb ? (challengeRowIdPb === emp.id && attendance26Days) : attendance26Days;
      branchNet = branchNet + (applyChallenge ? branchNet * 0.25 : 0);
      totalNetFromBranches += branchNet;
      if (branchNet > maxBranchNetPb) {
        maxBranchNetPb = branchNet;
        grossOfBranchWithMaxNetPb = gross;
      }
      const bw = branchWinners[emp.branch];
      if (bw && bw.book.ids.indexOf(emp.id) >= 0 && bw.eval.ids.indexOf(emp.id) >= 0 && bw.book.val > 0 && bw.eval.val > 0) hasExcellence = true;
      if (bw && attendance26Days && bw.attendance.ids.indexOf(emp.id) >= 0 && ((bw.eval.ids.indexOf(emp.id) >= 0 && bw.eval.val > 0) || (bw.book.ids.indexOf(emp.id) >= 0 && bw.book.val > 0))) hasCommitment = true;
    });
    var discountAmount = 0;
    if (typeof getTotalDiscountForEmployee === 'function') {
      discountAmount = getTotalDiscountForEmployee(name) || 0;
    }
    var totalNet = totalNetFromBranches + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
    totalNet = Math.max(0, totalNet - discountAmount);
    var totalFund = isDuplicatePb ? (grossOfBranchWithMaxNetPb * getSupportFundRatio()) : (totalGross * getSupportFundRatio());
    var pointsWithDiscount = Math.max(0, (totalNet + totalFund) - discountAmount);
    out[name] = pointsWithDiscount;
  });
  return out;
}

/** عرض أسباب تجميع رصيد النقاط (إجمالي − 15% = صافي + 15% = نقاط) عند الضغط على الرقم في جدول الإحصائيات */
function showPointsBreakdownPopup(empName, reportEmpId, isDuplicate, displayPoints) {
  var report = isDuplicate && typeof calculateAggregatedEmployeeReport === 'function'
    ? calculateAggregatedEmployeeReport(empName)
    : (typeof calculateEmployeeReport === 'function' ? calculateEmployeeReport(reportEmpId) : null);
  if (!report) return;
  var gross = report.gross != null ? report.gross : 0;
  var fund = report.fund != null ? report.fund : 0;
  var net = report.finalNet != null ? report.finalNet : 0;
  var totalDiscountAmount = report.totalDiscountAmount != null ? report.totalDiscountAmount : (typeof getTotalDiscountForEmployee === 'function' ? (getTotalDiscountForEmployee(empName) || 0) : 0);
  var pointsBeforeDiscount = net + fund;
  var isPointsMode = !!(report.pointsMode || (typeof window !== 'undefined' && window.adoraRewardsPointsMode));
  var pointsFromCaller = (displayPoints !== undefined && displayPoints !== null) ? Number(displayPoints) : NaN;
  var points = !isNaN(pointsFromCaller) ? pointsFromCaller : pointsBeforeDiscount;
  var discountPoints = Math.max(0, pointsBeforeDiscount - points);
  var unit = isPointsMode ? 'نقطة' : 'ريال';
  var pct = (typeof getPricingConfig === 'function') ? ((getPricingConfig().supportFundPercent != null) ? getPricingConfig().supportFundPercent : 15) : 15;
  var html = '<div class="p-4 text-right space-y-2 text-sm">' +
    '<div class="font-bold text-turquoise border-b border-turquoise/30 pb-2 mb-2">أسباب تجميع الرقم — ' + (empName || '').replace(/</g, '&lt;') + '</div>' +
    '<div class="flex justify-between text-gray-300 border-t border-white/10 pt-2"><span>= الصافي المستحق:</span><span class="font-bold text-green-400">' + net.toFixed(2) + ' ' + unit + '</span></div>' +
    '<div class="flex justify-between text-gray-300"><span>+ مساهمة ' + pct + '% (نقاط):</span><span class="font-bold text-turquoise">+' + fund.toFixed(2) + ' نقطة</span></div>';
  if (discountPoints > 0) {
    html += '<div class="flex justify-between text-gray-300"><span>− خصومات مطبقة (تحويل من ريال إلى نقاط):</span><span class="font-bold text-red-400">−' + discountPoints.toFixed(2) + ' نقطة</span></div>';
  }
  html += '<div class="flex justify-between text-turquoise font-bold border-t border-turquoise/30 pt-2 mt-2"><span>= رصيد النقاط من الفترة:</span><span>' + points.toFixed(2) + ' نقطة</span></div>' +
    '</div>';
  var overlay = document.createElement('div');
  overlay.id = 'pointsBreakdownOverlay';
  overlay.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'أسباب تجميع الرقم');
  overlay.innerHTML = '<div class="glass rounded-xl border-2 border-turquoise/40 max-w-md w-full shadow-xl animate-in" role="document">' +
    '<div class="flex justify-between items-center p-3 border-b border-white/10"><span class="text-turquoise font-bold">تفاصيل الرصيد</span><button type="button" class="text-white/70 hover:text-white p-1 rounded" onclick="document.getElementById(\'pointsBreakdownOverlay\') && document.getElementById(\'pointsBreakdownOverlay\').remove()" aria-label="إغلاق">✕</button></div>' +
    html +
    '</div>';
  overlay.onclick = function (e) { if (e.target === overlay) overlay.remove(); };
  document.body.appendChild(overlay);
}

function populateEmployeePerformanceTable() {
  const tbody = document.getElementById('employeePerformanceTableBody');
  if (!tbody) {
    console.error('❌ employeePerformanceTableBody not found');
    return;
  }
  // Get db from multiple sources (window.db, localStorage, or empty array)
  let currentDb = [];
  if (typeof window !== 'undefined' && window.db && Array.isArray(window.db)) {
    currentDb = window.db;
  } else {
    // Try to get from localStorage as fallback
    try {
      const savedDb = localStorage.getItem('adora_rewards_db');
      if (savedDb) {
        currentDb = JSON.parse(savedDb);
        // Update window.db for future use
        if (typeof window !== 'undefined') {
          window.db = currentDb;
        }
      }
    } catch (e) {
      console.error('❌ Error loading db from localStorage:', e);
    }
  }
  console.log('📊 populateEmployeePerformanceTable - db length:', currentDb ? currentDb.length : 0, 'source:', typeof window !== 'undefined' && window.db ? 'window.db' : 'localStorage');
  if (!currentDb || currentDb.length === 0) {
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">لا توجد بيانات</td></tr>';
    return;
  }
  
  // Calculate stats for each employee
  const employeesData = [];
  const nameCounts = {};
  const supportFundPct = (typeof getPricingConfig === 'function') ? ((getPricingConfig().supportFundPercent != null) ? getPricingConfig().supportFundPercent : 15) : 15;
  
  // Count duplicates
  currentDb.forEach(emp => {
    nameCounts[emp.name] = (nameCounts[emp.name] || 0) + 1;
  });
  
  // Get unique employees (aggregate duplicates)
  const uniqueEmployees = new Map();
  currentDb.forEach(emp => {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, []);
    }
    uniqueEmployees.get(key).push(emp);
  });

  // بناء فائزي الفروع — استخدام computeBranchWinnersAndLosers لضمان التطابق مع الجدول الرئيسي
  const branches = [...new Set(currentDb.map(e => e.branch).filter(Boolean))];
  var branchWinners = {};
  if (typeof computeBranchWinnersAndLosers === 'function') {
    branchWinners = computeBranchWinnersAndLosers(currentDb, branches).branchWinners || {};
  } else {
    // Fallback manual
    branches.forEach(b => {
      branchWinners[b] = { net: { val: -1, ids: [] }, eval: { val: -1, ids: [] }, book: { val: -1, ids: [] }, attendance: { val: -1, ids: [] } };
    });
    currentDb.forEach(emp => {
      const gross = typeof computeGrossFromBreakdown === 'function' ? computeGrossFromBreakdown(emp) : ((emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1)) * emp.count + (emp.evaluationsBooking || 0) * 20 + (emp.evaluationsGoogle || 0) * 10);
      const evBooking = emp.evaluationsBooking || 0;
      const fund = gross * getSupportFundRatio();
      const net = gross - fund;
      const bw = branchWinners[emp.branch];
      if (!bw) return;
      if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
      else if (net === bw.net.val) bw.net.ids.push(emp.id);
      if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
      else if (evBooking === bw.eval.val) bw.eval.ids.push(emp.id);
      if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
      else if (emp.count === bw.book.val) bw.book.ids.push(emp.id);
      const empNameCount = currentDb.filter(e => e.name === emp.name).length;
      let empAttendanceDays = emp.attendance26Days === true ? 26 : 0;
      if (empNameCount > 1) empAttendanceDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
      if (empAttendanceDays >= 26) {
        let isHighestDays = true;
        currentDb.filter(e => e.branch === emp.branch).forEach(other => {
          if (other.name === emp.name) return;
          const otherNameCount = currentDb.filter(e => e.name === other.name).length;
          let otherDays = other.attendance26Days === true ? 26 : 0;
          if (otherNameCount > 1) otherDays = other.totalAttendanceDays || (other.attendance26Days === true ? 26 : 0);
          if (otherDays > empAttendanceDays) isHighestDays = false;
        });
        if (isHighestDays) {
          if (bw.attendance.val === -1) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
          else if (empAttendanceDays > bw.attendance.val) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
          else if (empAttendanceDays === bw.attendance.val) bw.attendance.ids.push(emp.id);
        }
      }
    });
  }
  
  // تقييم ديناميكي مع أسباب بأرقام حقيقية (فرق عن الأفضل، بوكينج/جوجل)
  function getRatingDetailsDynamic(emp, minCount, maxCount, minEval, maxEval, maxEvalBooking, maxEvalGoogle) {
    const count = emp.count || 0;
    const evalBooking = emp.evalBooking || 0;
    const evalGoogle = emp.evalGoogle || 0;
    const totalEval = (emp.totalEval != null ? emp.totalEval : evalBooking + evalGoogle);
    const has26 = !!emp.hasAttendance26;
    const rangeCount = maxCount - minCount;
    const rangeEval = maxEval - minEval;
    const pctCount = rangeCount <= 0 ? 0.5 : (count - minCount) / rangeCount;
    const pctEval = rangeEval <= 0 ? 0.5 : (totalEval - minEval) / rangeEval;
    const diffCount = maxCount - count;
    const diffEvalBooking = (maxEvalBooking != null ? maxEvalBooking : 0) - evalBooking;
    const diffEvalGoogle = (maxEvalGoogle != null ? maxEvalGoogle : 0) - evalGoogle;

    let bookingsPart = count + ' حجز';
    if (diffCount === 0) bookingsPart += '، الأفضل';
    else bookingsPart += '، أقل من أفضل موظف بفرق ' + diffCount + ' حجز';

    let evalPart = 'إجمالي التقييمات ' + evalBooking + ' بوكينج و ' + evalGoogle + ' جوجل. ';
    if (diffEvalBooking <= 0 && diffEvalGoogle <= 0) evalPart += 'أفضل تقييمات بوكينج وجوجل.';
    else if (diffEvalBooking <= 0) evalPart += 'أفضل تقييم بوكينج، لكن جوجل أقل من الأفضل بـ ' + diffEvalGoogle + '.';
    else if (diffEvalGoogle <= 0) evalPart += 'أفضل تقييم جوجل، لكن بوكينج أقل من الأفضل بـ ' + diffEvalBooking + '.';
    else evalPart += 'بوكينج أقل من الأفضل بـ ' + diffEvalBooking + '، وجوجل أقل بـ ' + diffEvalGoogle + '.';

    const attLabel = has26 ? 'حضور 26 يوم وأكثر.' : 'حضور أقل من 26 يوم.';
    const attLabelHtml = has26
      ? '<span class="text-green-400 font-medium">حضور 26 يوم وأكثر.</span>'
      : '<span class="text-red-400 font-medium">حضور أقل من 26 يوم.</span>';
    const combined = (pctCount + pctEval) / 2;
    const boost = has26 ? 0.15 : 0;
    let score = Math.min(1, combined + boost);
    const pointsBeforeDiscount = Math.round(score * 100);
    let discountDeduction = 0;
    if (typeof getTotalDiscountForEmployee === 'function' && getTotalDiscountForEmployee(emp.name) > 0) {
      score = Math.max(0, score - 0.10);
      const pointsAfterDiscount = Math.round(score * 100);
      discountDeduction = Math.min(10, Math.max(0, pointsBeforeDiscount - pointsAfterDiscount));
    }
    let points = Math.round(score * 100);
    if (!has26 && points > 84) points = 84;
    let level = 'سيء';
    if (points >= 90) level = 'ممتاز';
    else if (points >= 80) level = 'جيد جداً';
    else if (points >= 60) level = 'جيد';
    else if (points >= 40) level = 'ضعيف';
    let reasons = bookingsPart + ' — ' + evalPart + ' — ' + attLabel;
    if (discountDeduction > 0) {
      reasons += ' — نقص ' + discountDeduction + ' نقطة بسبب الخصم الإداري.';
    }
    reasons += ' → التقييم: ' + level + ' (' + points + '% من 100)';
    let reasonsHtml = bookingsPart + ' — ' + evalPart + ' — ' + attLabelHtml;
    if (discountDeduction > 0) {
      reasonsHtml += ' — <span class="text-red-400 font-medium">نقص ' + discountDeduction + ' نقطة بسبب الخصم الإداري.</span>';
    }
    reasonsHtml += ' → التقييم: ' + level + ' (' + points + '% من 100)';
    const ratingColor = points >= 80 ? 'text-green-400' : points >= 60 ? 'text-yellow-400' : points >= 40 ? 'text-orange-400' : 'text-red-400';
    return { points, level, reasons, reasonsHtml, ratingColor };
  }

  /** تقييم ديناميكي: 70% رصيد النقاط + 30% عدد التقييمات — ليعكس كلاً من الأداء المالي وجودة التقييمات */
  function getRatingDetailsDynamicFromNet(emp, minPoints, maxPoints, rangePoints, minEval, maxEval, rangeEval, maxCount, maxEvalBooking, maxEvalGoogle) {
    const pointsVal = (emp.pointsBalance != null ? emp.pointsBalance : emp.net) || 0;
    const totalEval = (emp.evalBooking || 0) + (emp.evalGoogle || 0);
    const evalBooking = emp.evalBooking || 0;
    const evalGoogle = emp.evalGoogle || 0;
    const has26 = !!emp.hasAttendance26;
    const pctNet = rangePoints <= 0 ? 0.5 : (pointsVal - minPoints) / rangePoints;
    const pctEval = rangeEval <= 0 ? 0.5 : (totalEval - minEval) / rangeEval;
    const diffNet = maxPoints - pointsVal;
    const diffEvalBooking = (maxEvalBooking != null ? maxEvalBooking : 0) - evalBooking;
    const diffEvalGoogle = (maxEvalGoogle != null ? maxEvalGoogle : 0) - evalGoogle;

    let netPart = 'رصيد النقاط ' + pointsVal.toFixed(2) + ' نقطة';
    if (diffNet <= 0) netPart += '، الأفضل';
    else netPart += '، أقل من أفضل موظف بفرق ' + diffNet.toFixed(2) + ' نقطة';

    let evalPart = 'إجمالي التقييمات ' + evalBooking + ' بوكينج و ' + evalGoogle + ' جوجل. ';
    if (diffEvalBooking <= 0 && diffEvalGoogle <= 0) evalPart += 'أفضل تقييمات بوكينج وجوجل.';
    else if (diffEvalBooking <= 0) evalPart += 'أفضل تقييم بوكينج، لكن جوجل أقل من الأفضل بـ ' + diffEvalGoogle + '.';
    else if (diffEvalGoogle <= 0) evalPart += 'أفضل تقييم جوجل، لكن بوكينج أقل من الأفضل بـ ' + diffEvalBooking + '.';
    else evalPart += 'بوكينج أقل من الأفضل بـ ' + diffEvalBooking + '، وجوجل أقل بـ ' + diffEvalGoogle + '.';

    const attLabel = has26 ? 'حضور 26 يوم وأكثر.' : 'حضور أقل من 26 يوم.';
    const attLabelHtml = has26
      ? '<span class="text-green-400 font-medium">حضور 26 يوم وأكثر.</span>'
      : '<span class="text-red-400 font-medium">حضور أقل من 26 يوم.</span>';
    // 70% رصيد النقاط + 30% التقييمات — ليعكس من له تقييمات أعلى
    let score = 0.7 * pctNet + 0.3 * pctEval;
    score = Math.min(1, score);
    const boost = has26 ? 0.15 : 0;
    score = Math.min(1, score + boost);
    const pointsBeforeDiscount = Math.round(score * 100);
    let discountDeduction = 0;
    if (typeof getTotalDiscountForEmployee === 'function' && getTotalDiscountForEmployee(emp.name) > 0) {
      score = Math.max(0, score - 0.10);
      const pointsAfterDiscount = Math.round(score * 100);
      discountDeduction = Math.min(10, Math.max(0, pointsBeforeDiscount - pointsAfterDiscount));
    }
    let points = Math.round(score * 100);
    if (!has26 && points > 84) points = 84;
    let level = 'سيء';
    if (points >= 90) level = 'ممتاز';
    else if (points >= 80) level = 'جيد جداً';
    else if (points >= 60) level = 'جيد';
    else if (points >= 40) level = 'ضعيف';
    let reasons = netPart + ' — ' + evalPart + ' — ' + attLabel;
    if (discountDeduction > 0) {
      reasons += ' — نقص ' + discountDeduction + ' نقطة بسبب الخصم الإداري.';
    }
    reasons += ' → التقييم: ' + level + ' (' + points + '% من 100)';
    let reasonsHtml = netPart + ' — ' + evalPart + ' — ' + attLabelHtml;
    if (discountDeduction > 0) {
      reasonsHtml += ' — <span class="text-red-400 font-medium">نقص ' + discountDeduction + ' نقطة بسبب الخصم الإداري.</span>';
    }
    reasonsHtml += ' → التقييم: ' + level + ' (' + points + '% من 100)';
    const ratingColor = points >= 80 ? 'text-green-400' : points >= 60 ? 'text-yellow-400' : points >= 40 ? 'text-orange-400' : 'text-red-400';
    return { points, level, reasons, reasonsHtml, ratingColor };
  }

  // مصدر واحد: الصافي ورصيد النقاط من التقرير (مرآة للجدول الرئيسي — بدون إعادة حساب)
  uniqueEmployees.forEach((employees, name) => {
    const isDuplicate = nameCounts[name] > 1;
    let totalCount = 0;
    let totalEvalBooking = 0;
    let totalEvalGoogle = 0;
    let hasAttendance26 = false;
    const empBranches = [];
    employees.forEach(emp => {
      totalCount += emp.count || 0;
      totalEvalBooking += emp.evaluationsBooking || 0;
      totalEvalGoogle += emp.evaluationsGoogle || 0;
      if (emp.attendance26Days === true) hasAttendance26 = true;
      if (!empBranches.includes(emp.branch)) empBranches.push(emp.branch);
    });
    const report = isDuplicate
      ? (typeof calculateAggregatedEmployeeReport === 'function' ? calculateAggregatedEmployeeReport(name) : null)
      : (typeof calculateEmployeeReport === 'function' ? calculateEmployeeReport(employees[0].id) : null);
    const totalNet = report && report.finalNet != null ? report.finalNet : 0;
    const totalFund = report && report.fund != null ? report.fund : 0;
    const totalDiscountAmount = report && report.totalDiscountAmount != null ? report.totalDiscountAmount : 0;
    // جدول تقييم الموظفين: النقاط = صافي + صندوق شركاء النجاح − نفس قيمة الخصومات كنقاط
    const pointsBalance = Math.max(0, (totalNet + totalFund) - totalDiscountAmount); // رصيد النقاط من الفترة بعد طرح الخصومات كنقاط
    const totalEval = totalEvalBooking + totalEvalGoogle;
    const performanceScore = totalCount + (totalEvalBooking * 2) + totalEvalGoogle + (totalNet / 100);
    const firstEmpId = employees[0] && employees[0].id ? employees[0].id : '';
    employeesData.push({
      name: name,
      branches: empBranches.join(' - '),
      count: totalCount,
      evalBooking: totalEvalBooking,
      evalGoogle: totalEvalGoogle,
      totalEval: totalEval,
      net: totalNet,
      pointsBalance: pointsBalance,
      performanceScore: performanceScore,
      isDuplicate: isDuplicate,
      hasAttendance26,
      points: 0,
      level: '-',
      reasons: '-',
      ratingColor: 'text-gray-400',
      reportEmpId: firstEmpId
    });
  });
  
  // ربط مستوى الأداء بترتيب النقاط فقط: الأعلى نقاط = ممتاز، الأقل = سيء (بدون معادلات)
  employeesData.sort((a, b) => (b.pointsBalance || 0) - (a.pointsBalance || 0));
  const N = employeesData.length;
  employeesData.forEach((emp, index) => {
    const rank = index + 1; // 1 = الأعلى نقاطاً، N = الأقل
    const percentile = N > 1 ? (rank - 1) / (N - 1) : 0; // 0 = أول، 1 = آخر
    let level = 'سيء';
    if (percentile < 0.2) level = 'ممتاز';
    else if (percentile < 0.4) level = 'جيد جداً';
    else if (percentile < 0.6) level = 'جيد';
    else if (percentile < 0.8) level = 'ضعيف';
    const points = Math.round((1 - percentile) * 100); // للشريط: 100 = أول، 0 = آخر
    const reasons = 'ترتيبه ' + rank + ' من ' + N + ' حسب رصيد النقاط → مستوى الأداء: ' + level;
    const reasonsHtml = 'ترتيبه <strong>' + rank + '</strong> من <strong>' + N + '</strong> حسب رصيد النقاط → مستوى الأداء: <span class="font-semibold">' + level + '</span>';
    const ratingColor = level === 'ممتاز' ? 'text-green-400' : level === 'جيد جداً' ? 'text-green-300' : level === 'جيد' ? 'text-yellow-400' : level === 'ضعيف' ? 'text-orange-400' : 'text-red-400';
    emp.points = points;
    emp.level = level;
    emp.reasons = reasons;
    emp.reasonsHtml = reasonsHtml;
    emp.ratingColor = ratingColor;
    emp.rank = rank;
    emp.totalCount = N;
  });

  // ترتيب من الأعلى رصيد نقاط إلى الأقل (نفس نظام النقاط) — مُرتّب مسبقاً

  // حفظ البيانات للفرز لاحقاً وعرض الأسهم
  if (typeof window !== 'undefined') {
    window.__employeePerformanceTableData = employeesData;
  }
  const table = document.getElementById('employeePerformanceTable');
  if (table) {
    table.setAttribute('data-sort-key', 'points');
    table.setAttribute('data-sort-dir', 'desc');
  }

  // نسخة من أرقام الجدول المعروضة — تُستخدم عند إغلاق الفترة للرصيد التراكمي (بدون إعادة حساب، نفس الـ DOM)
  if (typeof window !== 'undefined') {
    var pointsMap = {};
    employeesData.forEach(function (e) {
      pointsMap[e.name] = (e.pointsBalance != null ? e.pointsBalance : e.net);
    });
    window.__lastDisplayedPeriodPoints = pointsMap;
  }

  // Generate table rows: صف بيانات + صف أسباب التقييم تحت كل موظف
  const rowsHtml = buildEmployeePerformanceTableRows(employeesData, supportFundPct);
  tbody.innerHTML = rowsHtml || '<tr><td colspan="7" class="p-4 text-center text-gray-400">لا توجد بيانات</td></tr>';
  updateEmployeePerformanceTableSortArrows(table || document.getElementById('employeePerformanceTable'), 'points', 'desc');
}

/** بناء صفوف جدول أداء الموظفين (للعرض وللفرز) */
function buildEmployeePerformanceTableRows(employeesData, supportFundPct) {
  if (!employeesData || employeesData.length === 0) return '';
  const pct = supportFundPct != null ? supportFundPct : ((typeof getPricingConfig === 'function') ? (getPricingConfig().supportFundPercent != null ? getPricingConfig().supportFundPercent : 15) : 15);
  function escForOnclick(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  let html = '';
  employeesData.forEach((emp, index) => {
    const barLeftPct = Math.min(100, Math.max(0, emp.points || 0));
    const nameEsc = escForOnclick(emp.name);
    const idEsc = escForOnclick(emp.reportEmpId);
    const onclickReport = `openEmployeeReportFromStats('${nameEsc}','${idEsc}',${!!emp.isDuplicate})`;
    html += `
      <tr class="border-b border-white/10 hover:bg-white/5">
        <td class="p-3 text-center font-bold text-turquoise">${index + 1}</td>
        <td class="p-3 text-right font-bold text-white">
          <span onclick="${onclickReport}" class="cursor-pointer hover:text-turquoise transition-colors" title="اضغط لعرض التقرير">${emp.name}${emp.isDuplicate ? ' <span class="text-xs text-gray-400">(متكرر)</span>' : ''}</span>
          <div class="mt-1.5 w-full rounded-full overflow-hidden relative" style="height: 6px;">
            <div style="position: absolute; inset: 0; background: #4b5563;"></div>
            <div style="position: absolute; left: 0; top: 0; width: ${barLeftPct}%; height: 100%; background: linear-gradient(90deg, #ef4444 0%, #f97316 25%, #eab308 50%, #84cc16 75%, #22c55e 100%);"></div>
            <span style="position: absolute; left: ${barLeftPct}%; top: 0; transform: translateX(-50%); width: 4px; height: 100%; background: #fff; border-radius: 2px; box-shadow: 0 0 2px rgba(0,0,0,0.5);"></span>
          </div>
        </td>
        <td class="p-3 text-center text-gray-300 text-xs">${emp.branches}</td>
        <td class="p-3 text-center font-bold text-white">${emp.count}</td>
        <td class="p-3 text-center text-gray-300">
          <span class="text-blue-400">${emp.evalBooking}</span> / <span class="text-purple-400">${emp.evalGoogle}</span>
          <div class="text-xs text-gray-400">(${emp.totalEval} إجمالي)</div>
        </td>
        <td class="p-3 text-center font-bold text-green-400">${emp.net.toFixed(2)} ريال</td>
        <td class="p-3 text-center">
          <div class="flex flex-col items-center gap-0.5">
            <span class="font-bold text-turquoise tabular-nums cursor-pointer hover:text-turquoise/80 transition-colors" title="رصيد النقاط من الفترة (صافي + مساهمة ${pct}%). اضغط لرؤية أسباب تجميع الرقم." onclick="typeof showPointsBreakdownPopup === 'function' && showPointsBreakdownPopup('${nameEsc}','${idEsc}',${!!emp.isDuplicate},${(emp.pointsBalance != null ? emp.pointsBalance : emp.net).toFixed(2)})">${(emp.pointsBalance != null ? emp.pointsBalance : emp.net).toFixed(2)} نقطة</span>
            <div class="text-xs text-gray-400">مستوى الأداء: ${emp.level}</div>
          </div>
        </td>
      </tr>
      <tr class="border-b border-white/5 reasons-row bg-turquoise/5 border-r-4 border-turquoise/30">
        <td colspan="7" class="text-right text-gray-400" style="font-size: 0.75rem !important; line-height: 1.4; padding: 0.46rem 0.75rem !important;">
          <span class="font-medium text-gray-500">أسباب التقييم:</span> ${emp.reasonsHtml}
        </td>
      </tr>
    `;
  });
  return html;
}

/** تحديث أسهم الفرز في رؤوس أعمدة جدول أداء الموظفين */
function updateEmployeePerformanceTableSortArrows(table, sortKey, dir) {
  if (!table) return;
  const ths = table.querySelectorAll('thead th[data-sort-key]');
  ths.forEach(function (th) {
    const arrow = th.querySelector('.sort-arrow');
    if (!arrow) return;
    const key = th.getAttribute('data-sort-key');
    if (key === sortKey) arrow.textContent = dir === 'asc' ? '▲' : '▼';
    else arrow.textContent = '↕';
  });
}

/** فرز جدول أداء الموظفين حسب العمود المختار (سهم صغير بجانب كل رأس عمود) */
function sortEmployeePerformanceTable(sortKey) {
  const table = document.getElementById('employeePerformanceTable');
  const tbody = document.getElementById('employeePerformanceTableBody');
  if (!table || !tbody) return;
  let data = (typeof window !== 'undefined' && window.__employeePerformanceTableData) ? window.__employeePerformanceTableData : [];
  if (!Array.isArray(data) || data.length === 0) return;
  const currentKey = table.getAttribute('data-sort-key') || 'points';
  const currentDir = table.getAttribute('data-sort-dir') || 'desc';
  let newDir = currentDir;
  if (currentKey === sortKey) newDir = currentDir === 'asc' ? 'desc' : 'asc';
  else newDir = (sortKey === 'name' || sortKey === 'branches') ? 'asc' : 'desc';

  const cmp = function (a, b) {
    let va, vb;
    switch (sortKey) {
      case 'name': va = (a.name || '').trim(); vb = (b.name || '').trim(); return va.localeCompare(vb, 'ar');
      case 'branches': va = (a.branches || '').trim(); vb = (b.branches || '').trim(); return va.localeCompare(vb, 'ar');
      case 'count': va = a.count != null ? a.count : 0; vb = b.count != null ? b.count : 0; return va - vb;
      case 'totalEval': va = (a.totalEval != null ? a.totalEval : ((a.evalBooking || 0) + (a.evalGoogle || 0))); vb = (b.totalEval != null ? b.totalEval : ((b.evalBooking || 0) + (b.evalGoogle || 0))); return va - vb;
      case 'net': va = a.net != null ? a.net : 0; vb = b.net != null ? b.net : 0; return va - vb;
      case 'points':
      default: va = (a.pointsBalance != null ? a.pointsBalance : a.net) || 0; vb = (b.pointsBalance != null ? b.pointsBalance : b.net) || 0; return va - vb;
    }
  };
  data.sort(function (a, b) {
    const r = cmp(a, b);
    return newDir === 'asc' ? r : -r;
  });
  table.setAttribute('data-sort-key', sortKey);
  table.setAttribute('data-sort-dir', newDir);
  updateEmployeePerformanceTableSortArrows(table, sortKey, newDir);
  const rowsHtml = buildEmployeePerformanceTableRows(data);
  tbody.innerHTML = rowsHtml || '<tr><td colspan="7" class="p-4 text-center text-gray-400">لا توجد بيانات</td></tr>';
}

async function loadArchivedStatsPeriodsList() {
  const select = document.getElementById('archivedStatsPeriodSelect');
  const archivedPeriodsContainer = document.getElementById('archivedPeriodsStatsContainer');
  if (!select && !archivedPeriodsContainer) return;

  if (select) select.innerHTML = '<option value="">-- اختر فترة --</option>';
  if (archivedPeriodsContainer) archivedPeriodsContainer.innerHTML = '';

  if (localStorage.getItem('adora_archived_just_cleared') === '1') {
    if (archivedPeriodsContainer) archivedPeriodsContainer.innerHTML = '<p class="text-gray-400 text-center py-4">لا توجد فترات سابقة</p>';
    return;
  }

  try {
    let periods = [];
    
    if (storage && typeof storage.ref === 'function') {
      try {
        const periodsRef = storage.ref('periods/');
        
        if (typeof periodsRef.listAll === 'function') {
          const result = await periodsRef.listAll();
          
          if (result && result.items && result.items.length > 0) {
            for (const itemRef of result.items) {
              try {
                var periodIdFromFile = (itemRef.name && itemRef.name.endsWith('.json'))
                  ? itemRef.name.slice(0, -5)
                  : (itemRef.name || '');
                if (!periodIdFromFile || periodIdFromFile.toLowerCase() === 'live') continue;
                const url = await itemRef.getDownloadURL();
                const response = await fetch(url);
                if (response.ok) {
                  const data = await response.json();
                  // توحيد الصيغة: قد يكون الملف من "إغلاق الفترة" { periodId, periodText, closedAt, data: { db } } أو من المزامنة { db, periodText, ... }
                  var normalized = {
                    id: data.periodId || data.id || periodIdFromFile,
                    periodId: data.periodId || data.id || periodIdFromFile,
                    periodText: data.periodText || data.data?.periodText || ('من ' + (data.data?.startDate || data.reportStartDate || '').substring(0, 10) + ' إلى ' + (data.data?.endDate || '').substring(0, 10)) || ('فترة ' + periodIdFromFile),
                    closedAt: data.closedAt || data.data?.closedAt || data.data?.endDate || null
                  };
                  normalized.data = data.data && Array.isArray(data.data.db)
                    ? data.data
                    : (Array.isArray(data.db) ? { db: data.db } : null);
                  if (normalized.data && normalized.data.db) periods.push(normalized);
                }
              } catch (itemError) {
                console.warn('⚠️ Error fetching period item:', itemError.message);
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ Firebase Storage list error:', error);
        console.log('⚠️ Falling back to localStorage');
      }
    }
    
    if (periods.length === 0) {
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        try {
          periods = JSON.parse(saved);
          // توحيد الحقول للمصادر من localStorage (قد يكون periodId فقط)
          periods = periods.map(function (p) {
            var id = p.periodId || p.id;
            return {
              id: id,
              periodId: id,
              periodText: p.periodText || ('فترة ' + id),
              closedAt: p.closedAt || null,
              data: p.data || (Array.isArray(p.db) ? { db: p.db } : null)
            };
          }).filter(function (p) { return p.data && Array.isArray(p.data.db); });
        } catch (e) {
          periods = [];
        }
      }
    } else {
      // دمج فترات localStorage مع قائمة Firebase حتى تظهر الفترة المغلقة فوراً في إحصائيات الفترات السابقة
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        try {
          var raw = JSON.parse(saved);
          var localList = Array.isArray(raw) ? raw : [];
          var existingIds = new Set(periods.map(function (p) { return (p.id || p.periodId); }));
          localList.forEach(function (p) {
            var id = p.periodId || p.id;
            if (!id || existingIds.has(id)) return;
            var data = p.data || (Array.isArray(p.db) ? { db: p.db } : null);
            if (!data || !Array.isArray(data.db)) return;
            existingIds.add(id);
            periods.push({
              id: id,
              periodId: id,
              periodText: p.periodText || ('فترة ' + id),
              closedAt: p.closedAt || null,
              data: data
            });
          });
        } catch (e) { /* ignore */ }
      }
    }
    
    // إزالة التكرار: نفس periodId أو نفس periodText (عرض واحد فقط)
    const byId = new Map();
    periods.forEach(function (p) {
      var id = p.id || p.periodId;
      if (!byId.has(id)) byId.set(id, p);
    });
    const byText = new Map();
    byId.forEach(function (p) {
      var text = p.periodText || ('فترة ' + (p.id || p.periodId));
      if (!byText.has(text)) byText.set(text, p);
    });
    periods = Array.from(byText.values());
    periods.sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0));

    // Update dropdown if exists
    if (select) {
      periods.forEach(period => {
        const option = document.createElement('option');
        option.value = period.id || period.periodId;
        option.textContent = period.periodText || `فترة ${period.id || period.periodId}`;
        select.appendChild(option);
      });
    }

    // Display each period separately in container
    if (archivedPeriodsContainer) {
      archivedPeriodsContainer.innerHTML = '';
      
      if (periods.length === 0) {
        archivedPeriodsContainer.innerHTML = '<p class="text-gray-400 text-center py-4">لا توجد فترات سابقة</p>';
        return;
      }
      
      // Load stats for each period
      for (const period of periods) {
        const periodId = period.id || period.periodId;
        const periodText = period.periodText || `فترة ${periodId}`;
        const closedAt = period.closedAt ? new Date(period.closedAt).toLocaleDateString('ar-SA') : '-';
        
        // Create period card (عين = فتح/طي المحتوى، طباعة)
        const periodIdEsc = String(periodId).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const periodIdSafe = String(periodId).replace(/[^a-zA-Z0-9\-_.]/g, '_');
        const periodCard = document.createElement('div');
        periodCard.className = 'glass p-6 rounded-xl border border-turquoise/30 mb-6';
        periodCard.innerHTML = `
          <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
            <h4 class="text-lg font-bold text-turquoise">${periodText}</h4>
            <div class="flex items-center gap-2">
              <span class="text-sm text-gray-400">تاريخ الإغلاق: ${closedAt}</span>
              <button type="button" onclick="toggleArchivedPeriodCard('${periodIdSafe}')" class="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-turquoise/20 border border-turquoise/40 text-turquoise hover:bg-turquoise/30 hover:border-turquoise/60 transition-colors" title="فتح/طي محتوى الفترة">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button type="button" onclick="printArchivedPeriodReport('${periodIdSafe}')" class="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-turquoise/20 border border-turquoise/40 text-turquoise hover:bg-turquoise/30 hover:border-turquoise/60 transition-colors" title="طباعة إحصائيات هذه الفترة">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              </button>
            </div>
          </div>
          <div id="archivedPeriodBody_${periodIdSafe}" class="archived-period-body hidden">
            <div id="archivedPeriodStats_${periodIdSafe}" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div class="glass p-4 rounded-xl border border-turquoise/30">
                <div class="text-sm text-gray-400 mb-1">جاري التحميل...</div>
              </div>
            </div>
            <div id="archivedPeriodTable_${periodIdSafe}">
              <!-- Table will be loaded here -->
            </div>
          </div>
        `;
        archivedPeriodsContainer.appendChild(periodCard);
        
        // Load stats for this period (يستخدم periodIdSafe للـ DOM و period للبيانات)
        loadArchivedPeriodStatsForDisplay(periodIdSafe, period);
      }
    }
  } catch (error) {
    console.error('❌ Error loading archived periods:', error);
  }
}

/** فتح فترة أرشفة كعرض فقط في مكان "الفترة الحالية" (جدول التقييم والإحصائيات). */
async function openArchivedPeriodForView(periodId) {
  if (typeof periodId !== 'string') return;
  const id = String(periodId).replace(/&quot;/g, '"');
  const banner = document.getElementById('archivedViewOnlyBanner');
  const periodTextEl = document.getElementById('archivedViewOnlyPeriodText');
  const closedAtEl = document.getElementById('archivedViewOnlyClosedAt');
  if (!banner || !periodTextEl || !closedAtEl) return;

  let periodData = null;
  try {
    if (storage && typeof storage.ref === 'function') {
      try {
        const periodRef = storage.ref(`periods/${id}.json`);
        const url = await periodRef.getDownloadURL();
        const response = await fetch(url);
        if (response.ok) periodData = await response.json();
      } catch (e) { /* fallback */ }
    }
    if (!periodData) {
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        const periods = JSON.parse(saved);
        periodData = periods.find(p => (p.id || p.periodId) === id);
      }
    }
  } catch (e) {
    console.error('❌ Error loading archived period for view:', e);
    return;
  }

  if (!periodData || !periodData.data || !Array.isArray(periodData.data.db)) {
    return;
  }

  window._adoraPreviousDb = (typeof window !== 'undefined' && window.db && Array.isArray(window.db)) ? window.db : null;
  try {
    const fromStorage = localStorage.getItem('adora_rewards_db');
    if (fromStorage) window._adoraPreviousDb = JSON.parse(fromStorage);
  } catch (e) { /* ignore */ }

  window.db = periodData.data.db;
  if (typeof loadCurrentPeriodStats === 'function') loadCurrentPeriodStats();
  if (typeof populateEmployeePerformanceTable === 'function') populateEmployeePerformanceTable();

  const periodText = periodData.periodText || `فترة ${id}`;
  const closedAt = periodData.closedAt ? new Date(periodData.closedAt).toLocaleDateString('ar-SA') : '—';
  periodTextEl.textContent = periodText;
  closedAtEl.textContent = 'تاريخ الإغلاق: ' + closedAt;
  banner.classList.remove('hidden');

  const statisticsContent = document.getElementById('statisticsReportsContent');
  if (statisticsContent) statisticsContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** فتح/طي محتوى بطاقة فترة مؤرشفة (العين). */
function toggleArchivedPeriodCard(periodIdSafe) {
  if (typeof periodIdSafe !== 'string') return;
  const body = document.getElementById('archivedPeriodBody_' + periodIdSafe);
  if (!body) return;
  body.classList.toggle('hidden');
}

/** طباعة إحصائيات فترة مؤرشفة (جدول + أسباب التقييم). */
function printArchivedPeriodReport(periodIdSafe) {
  if (typeof periodIdSafe !== 'string') return;
  const bodyEl = document.getElementById('archivedPeriodBody_' + periodIdSafe);
  if (!bodyEl) return;
  const tableEl = bodyEl.querySelector('table');
  const hasTableRows = tableEl && tableEl.querySelector('tbody tr');
  const stillLoading = bodyEl.textContent.indexOf('جاري التحميل') >= 0;
  if (!hasTableRows || stillLoading) {
    if (typeof showToast === 'function') showToast('البيانات قيد التحميل، انتظر لحظة ثم أعد الطباعة', 'warning');
    return;
  }
  const periodCard = bodyEl.closest('.glass');
  const periodTextEl = periodCard ? periodCard.querySelector('h4') : null;
  const closedAtSpan = periodCard ? periodCard.querySelector('.text-sm.text-gray-400') : null;
  const escapePrint = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const periodText = escapePrint(periodTextEl ? periodTextEl.textContent : ('فترة ' + periodIdSafe));
  const closedAt = escapePrint(closedAtSpan ? closedAtSpan.textContent.replace(/^تاريخ الإغلاق:\s*/, '') : '');
  const html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>' + periodText + '</title><style>body{font-family:system-ui,sans-serif;padding:16px;color:#111;background:#fff;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;text-align:right;border:1px solid #ddd;} th{background:#0d9488;color:#fff;} .reasons-row{background:#ccfbf1;} .reasons-row td{font-size:12px;color:#374151;}</style></head><body><h2>' + periodText + '</h2><p class="text-sm" style="color:#6b7280;">تاريخ الإغلاق: ' + closedAt + '</p>' + bodyEl.innerHTML + '</body></html>';
  const w = window.open('', '_blank');
  if (!w) { if (typeof showToast === 'function') showToast('السماح بالنوافذ المنبثقة لاستخدام الطباعة', 'warning'); return; }
  w.document.write(html);
  w.document.close();
  w.onload = function () { w.focus(); w.print(); w.onafterprint = function () { w.close(); }; };
}

/** طباعة إحصائيات الفترة الحالية فقط (جدول تقييم الموظفين + أسباب التقييم). */
function printCurrentPeriodStats() {
  const block = document.querySelector('#statisticsReportsContent > .mb-8');
  if (!block) return;
  const titleRaw = (document.getElementById('statisticsSectionTitle') && document.getElementById('statisticsSectionTitle').textContent) || 'إحصائيات الفترة الحالية';
  const escapePrint = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  const title = escapePrint(titleRaw);
  const printStyles = '@page{size:A4 portrait;margin:10mm}*{margin:0;padding:0;box-sizing:border-box}body{font-family:"IBM Plex Sans Arabic",Arial,sans-serif;padding:10px 14px;color:#111;background:#fff;direction:rtl;font-size:10px;line-height:1.35}h2{font-size:16px;font-weight:900;color:#111;margin-bottom:10px;border-bottom:2px solid #0d9488;padding-bottom:8px;text-align:center}table{width:100%;border-collapse:collapse;margin:8px 0;font-size:10px}th,td{padding:8px 6px;text-align:right;border:1px solid #e2e8f0}th{background:#0d9488;color:#fff;font-weight:800;font-size:10px}.glass{background:#f8fafc!important;border:1px solid #e2e8f0!important;border-radius:8px;padding:12px!important}.no-print{display:none!important}';
  const html = '<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>' + title + '</title><style>' + printStyles + '</style></head><body><h2>' + title + '</h2>' + block.innerHTML + '</body></html>';
  const w = window.open('', '_blank');
  if (!w) { if (typeof showToast === 'function') showToast('السماح بالنوافذ المنبثقة لاستخدام الطباعة', 'warning'); return; }
  w.document.write(html);
  w.document.close();
  w.onload = function () { w.focus(); w.print(); w.onafterprint = function () { w.close(); }; };
}

/** إغلاق عرض فترة أرشفة والعودة لإظهار الفترة الحالية. */
function closeArchivedPeriodView() {
  const banner = document.getElementById('archivedViewOnlyBanner');
  if (banner) banner.classList.add('hidden');

  if (window._adoraPreviousDb && Array.isArray(window._adoraPreviousDb)) {
    window.db = window._adoraPreviousDb;
  } else {
    try {
      const saved = localStorage.getItem('adora_rewards_db');
      if (saved) window.db = JSON.parse(saved);
      else window.db = [];
    } catch (e) {
      window.db = [];
    }
  }
  window._adoraPreviousDb = undefined;

  if (typeof loadCurrentPeriodStats === 'function') loadCurrentPeriodStats();
  if (typeof populateEmployeePerformanceTable === 'function') populateEmployeePerformanceTable();
}

// Load archived period stats for display (without select dropdown)
async function loadArchivedPeriodStatsForDisplay(periodId, periodData = null) {
  try {
    let periodDataToUse = periodData;
    
    if (!periodDataToUse) {
      // Try Firebase Storage first
      if (storage && typeof storage.ref === 'function') {
        try {
          const periodRef = storage.ref(`periods/${periodId}.json`);
          const url = await periodRef.getDownloadURL();
          const response = await fetch(url);
          if (response.ok) {
            periodDataToUse = await response.json();
          }
        } catch (error) {
          console.warn('⚠️ Firebase Storage error, trying localStorage:', error);
        }
      }
      
      // Fallback to localStorage
      if (!periodDataToUse) {
        const saved = localStorage.getItem('adora_archived_periods');
        if (saved) {
          const periods = JSON.parse(saved);
          periodDataToUse = periods.find(p => (p.id || p.periodId) === periodId);
        }
      }
    }
    
    // دعم صيغتين: إما data.data.db (فترة مغلقة) أو data.db (ملف مزامنة)
    var archivedData = (periodDataToUse.data && periodDataToUse.data.db)
      ? periodDataToUse.data.db
      : (Array.isArray(periodDataToUse.db) ? periodDataToUse.db : null);
    if (!archivedData || archivedData.length === 0) {
      const container = document.getElementById(`archivedPeriodStats_${periodId}`);
      if (container) {
        container.innerHTML = '<div class="col-span-4 text-center text-gray-400">لا توجد بيانات</div>';
      }
      return;
    }
    
    // Display statistics
    const stats = calculatePeriodStats(archivedData);
    
    // Update stats cards
    const container = document.getElementById(`archivedPeriodStats_${periodId}`);
    if (container) {
      container.innerHTML = `
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">عدد الموظفين</div>
          <div class="text-2xl font-black text-turquoise">${stats.employees}</div>
        </div>
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">إجمالي الحجوزات</div>
          <div class="text-2xl font-black text-turquoise">${stats.bookings}</div>
        </div>
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">إجمالي التقييمات</div>
          <div class="text-2xl font-black text-turquoise">${stats.evaluations}</div>
        </div>
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">إجمالي المستحقات</div>
          <div class="text-2xl font-black text-green-400">${stats.total.toFixed(0)} ريال</div>
        </div>
      `;
    }
    
    // Populate employee performance table for this period (مع خصم تقييم الفندق إن وُجد في بيانات الفترة)
    const negativeRatingsCount = (periodDataToUse.data && periodDataToUse.data.negativeRatingsCount && typeof periodDataToUse.data.negativeRatingsCount === 'object')
      ? periodDataToUse.data.negativeRatingsCount
      : null;
    const tableContainer = document.getElementById(`archivedPeriodTable_${periodId}`);
    if (tableContainer) {
      populateArchivedEmployeePerformanceTableForPeriod(archivedData, periodId, negativeRatingsCount);
    }
  } catch (error) {
    console.error(`❌ Error loading archived period stats for ${periodId}:`, error);
    const container = document.getElementById(`archivedPeriodStats_${periodId}`);
    if (container) {
      container.innerHTML = '<div class="col-span-4 text-center text-red-400">خطأ في تحميل البيانات</div>';
    }
  }
}

// خصم تقييم الفندق لفترة أرشفة (نفس منطق getHotelRatingDeductionForEmployee لكن من بيانات الفترة)
function getHotelRatingDeductionForArchived(employeeName, employees, counts) {
  if (!counts || typeof counts !== 'object' || !employees || !employees.length) return 0;
  const allEmpBranches = employees.filter(e => e.name === employeeName);
  if (allEmpBranches.length === 0) return 0;
  if (allEmpBranches.length === 1) {
    const n = parseInt(counts[allEmpBranches[0].branch], 10) || 0;
    return n * 10;
  }
  let maxCount = 0;
  allEmpBranches.forEach(emp => {
    const n = parseInt(counts[emp.branch], 10) || 0;
    if (n > maxCount) maxCount = n;
  });
  return maxCount * 10;
}

// تقييم ديناميكي لأرشيف (مع خصم تقييم الفندق إن وُجد: discountDeduction 0–10)
function getRatingDetailsDynamicArchived(emp, minCount, maxCount, minEval, maxEval, maxEvalBooking, maxEvalGoogle, discountDeduction) {
  const count = emp.count || 0;
  const evalBooking = emp.evalBooking || 0;
  const evalGoogle = emp.evalGoogle || 0;
  const totalEval = (emp.totalEval != null ? emp.totalEval : evalBooking + evalGoogle);
  const has26 = !!emp.hasAttendance26;
  const rangeCount = maxCount - minCount;
  const rangeEval = maxEval - minEval;
  const pctCount = rangeCount <= 0 ? 0.5 : (count - minCount) / rangeCount;
  const pctEval = rangeEval <= 0 ? 0.5 : (totalEval - minEval) / rangeEval;
  const diffCount = maxCount - count;
  const diffEvalBooking = (maxEvalBooking != null ? maxEvalBooking : 0) - evalBooking;
  const diffEvalGoogle = (maxEvalGoogle != null ? maxEvalGoogle : 0) - evalGoogle;

  let bookingsPart = count + ' حجز';
  if (diffCount === 0) bookingsPart += '، الأفضل';
  else bookingsPart += '، أقل من أفضل موظف بفرق ' + diffCount + ' حجز';

  let evalPart = 'إجمالي التقييمات ' + evalBooking + ' بوكينج و ' + evalGoogle + ' جوجل. ';
  if (diffEvalBooking <= 0 && diffEvalGoogle <= 0) evalPart += 'أفضل تقييمات بوكينج وجوجل.';
  else if (diffEvalBooking <= 0) evalPart += 'أفضل تقييم بوكينج، لكن جوجل أقل من الأفضل بـ ' + diffEvalGoogle + '.';
  else if (diffEvalGoogle <= 0) evalPart += 'أفضل تقييم جوجل، لكن بوكينج أقل من الأفضل بـ ' + diffEvalBooking + '.';
  else evalPart += 'بوكينج أقل من الأفضل بـ ' + diffEvalBooking + '، وجوجل أقل بـ ' + diffEvalGoogle + '.';

  const attLabel = has26 ? 'حضور 26 يوم وأكثر.' : 'حضور أقل من 26 يوم.';
  const attLabelHtml = has26
    ? '<span class="text-green-400 font-medium">حضور 26 يوم وأكثر.</span>'
    : '<span class="text-red-400 font-medium">حضور أقل من 26 يوم.</span>';
  const combined = (pctCount + pctEval) / 2;
  const boost = has26 ? 0.15 : 0;
  let score = Math.min(1, combined + boost);
  let points = Math.round(score * 100);
  if (!has26 && points > 84) points = 84;
  const deduction = Math.min(10, Math.max(0, parseInt(discountDeduction, 10) || 0));
  if (deduction > 0) points = Math.max(0, points - deduction);
  let level = 'سيء';
  if (points >= 90) level = 'ممتاز';
  else if (points >= 80) level = 'جيد جداً';
  else if (points >= 60) level = 'جيد';
  else if (points >= 40) level = 'ضعيف';
  let reasons = bookingsPart + ' — ' + evalPart + ' — ' + attLabel;
  let reasonsHtml = bookingsPart + ' — ' + evalPart + ' — ' + attLabelHtml;
  if (deduction > 0) {
    reasons += ' — نقص ' + deduction + ' نقطة بسبب خصم تقييم الفندق.';
    reasonsHtml += ' — <span class="text-red-400 font-medium">نقص ' + deduction + ' نقطة بسبب خصم تقييم الفندق.</span>';
  }
  reasons += ' → التقييم: ' + level + ' (' + points + '% من 100)';
  reasonsHtml += ' → التقييم: ' + level + ' (' + points + '% من 100)';
  const ratingColor = points >= 80 ? 'text-green-400' : points >= 60 ? 'text-yellow-400' : points >= 40 ? 'text-orange-400' : 'text-red-400';
  return { points, level, reasons, reasonsHtml, ratingColor };
}

// Populate archived employee performance table for a specific period (with أسباب التقييم + خصم تقييم الفندق إن وُجد)
function populateArchivedEmployeePerformanceTableForPeriod(employees, periodId, negativeRatingsCount) {
  const tableContainer = document.getElementById(`archivedPeriodTable_${periodId}`);
  if (!tableContainer) return;

  if (!employees || employees.length === 0) {
    tableContainer.innerHTML = '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    return;
  }

  const nameCounts = {};
  employees.forEach(emp => { nameCounts[emp.name] = (nameCounts[emp.name] || 0) + 1; });
  const counts = (negativeRatingsCount && typeof negativeRatingsCount === 'object') ? negativeRatingsCount : {};

  const branches = [...new Set(employees.map(e => e.branch).filter(Boolean))];
  const branchWinners = {};
  branches.forEach(b => {
    branchWinners[b] = { net: { val: -1, ids: [] }, eval: { val: -1, ids: [] }, book: { val: -1, ids: [] }, attendance: { val: -1, ids: [] } };
  });
  employees.forEach(emp => {
    const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
    const evBooking = emp.evaluationsBooking || 0;
    const evGoogle = emp.evaluationsGoogle || 0;
    const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
    const fund = gross * getSupportFundRatio();
    let net = gross - fund;
    const attendance26Days = emp.attendance26Days === true;
    net = net + (attendance26Days ? net * 0.25 : 0);
    const bw = branchWinners[emp.branch];
    if (!bw) return;
    if (net > bw.net.val) { bw.net.val = net; bw.net.ids = [emp.id]; }
    else if (net === bw.net.val) bw.net.ids.push(emp.id);
    if (evBooking > bw.eval.val) { bw.eval.val = evBooking; bw.eval.ids = [emp.id]; }
    else if (evBooking === bw.eval.val) bw.eval.ids.push(emp.id);
    if (emp.count > bw.book.val) { bw.book.val = emp.count; bw.book.ids = [emp.id]; }
    else if (emp.count === bw.book.val) bw.book.ids.push(emp.id);
    let empAttendanceDays = emp.attendance26Days === true ? 26 : 0;
    if (nameCounts[emp.name] > 1) empAttendanceDays = emp.totalAttendanceDays || (emp.attendance26Days === true ? 26 : 0);
    if (empAttendanceDays >= 26) {
      let isHighestDays = true;
      employees.filter(e => e.branch === emp.branch).forEach(other => {
        if (other.name === emp.name) return;
        const otherDays = other.attendance26Days === true ? 26 : (other.totalAttendanceDays || 0);
        if (otherDays > empAttendanceDays) isHighestDays = false;
      });
      if (isHighestDays) {
        if (bw.attendance.val === -1) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
        else if (empAttendanceDays > bw.attendance.val) { bw.attendance.val = empAttendanceDays; bw.attendance.ids = [emp.id]; }
        else if (empAttendanceDays === bw.attendance.val) bw.attendance.ids.push(emp.id);
      }
    }
  });

  const uniqueEmployees = new Map();
  employees.forEach(emp => {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) uniqueEmployees.set(key, []);
    uniqueEmployees.get(key).push(emp);
  });

  const employeesData = [];
  uniqueEmployees.forEach((empList, name) => {
    const isDuplicateArchived = nameCounts[name] > 1;
    let totalCount = 0;
    let totalEvalBooking = 0;
    let totalEvalGoogle = 0;
    let totalNetFromBranches = 0;
    let totalGross = 0;
    let maxBranchNetArchived = -1;
    let grossOfBranchWithMaxNetArchived = 0;
    let hasExcellence = false;
    let hasCommitment = false;
    let hasAttendance26 = false;
    const branchList = [];

    empList.forEach(emp => {
      totalCount += emp.count || 0;
      totalEvalBooking += emp.evaluationsBooking || 0;
      totalEvalGoogle += emp.evaluationsGoogle || 0;
      if (emp.attendance26Days === true) hasAttendance26 = true;
      const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
      const evBooking = emp.evaluationsBooking || 0;
      const evGoogle = emp.evaluationsGoogle || 0;
      const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
      totalGross += gross;
      const fund = gross * getSupportFundRatio();
      let branchNet = gross - fund;
      const attendance26Days = emp.attendance26Days === true;
      branchNet = branchNet + (attendance26Days ? branchNet * 0.25 : 0);
      totalNetFromBranches += branchNet;
      if (branchNet > maxBranchNetArchived) {
        maxBranchNetArchived = branchNet;
        grossOfBranchWithMaxNetArchived = gross;
      }
      const bw = branchWinners[emp.branch];
      if (bw && bw.book.ids.includes(emp.id) && bw.eval.ids.includes(emp.id) && bw.book.val > 0 && bw.eval.val > 0) hasExcellence = true;
      if (bw && attendance26Days && bw.attendance.ids.includes(emp.id) && ((bw.eval.ids.includes(emp.id) && bw.eval.val > 0) || (bw.book.ids.includes(emp.id) && bw.book.val > 0))) hasCommitment = true;
      if (!branchList.includes(emp.branch)) branchList.push(emp.branch);
    });

    let totalNet = totalNetFromBranches + (hasExcellence ? 50 : 0) + (hasCommitment ? 50 : 0);
    const hotelDeductionRiyal = getHotelRatingDeductionForArchived(name, employees, counts);
    totalNet = Math.max(0, totalNet - hotelDeductionRiyal);
    const totalFund = isDuplicateArchived ? (grossOfBranchWithMaxNetArchived * getSupportFundRatio()) : (totalGross * getSupportFundRatio());
    const pointsBalance = totalNet + totalFund;
    const totalEval = totalEvalBooking + totalEvalGoogle;
    employeesData.push({
      name: name,
      branches: branchList.join(' - '),
      count: totalCount,
      evalBooking: totalEvalBooking,
      evalGoogle: totalEvalGoogle,
      totalEval: totalEval,
      net: totalNet,
      pointsBalance: pointsBalance,
      hasAttendance26: hasAttendance26,
      isDuplicate: nameCounts[name] > 1,
      points: 0,
      level: '-',
      reasonsHtml: '-',
      ratingColor: 'text-gray-400',
      discountPoints: hotelDeductionRiyal > 0 ? 10 : 0
    });
  });

  employeesData.sort((a, b) => (b.pointsBalance != null ? b.pointsBalance : 0) - (a.pointsBalance != null ? a.pointsBalance : 0));

  // ربط مستوى الأداء بالترتيب حسب النقاط فقط (نفس منطق الفترة الحالية)
  const N = employeesData.length;
  employeesData.forEach((emp, index) => {
    const rank = index + 1;
    const percentile = N > 1 ? (rank - 1) / (N - 1) : 0;
    let level = 'سيء';
    if (percentile < 0.2) level = 'ممتاز';
    else if (percentile < 0.4) level = 'جيد جداً';
    else if (percentile < 0.6) level = 'جيد';
    else if (percentile < 0.8) level = 'ضعيف';
    emp.points = Math.round((1 - percentile) * 100);
    emp.level = level;
    emp.reasonsHtml = 'ترتيبه <strong>' + rank + '</strong> من <strong>' + N + '</strong> حسب رصيد النقاط → مستوى الأداء: <span class="font-semibold">' + level + '</span>';
    emp.ratingColor = level === 'ممتاز' ? 'text-green-400' : level === 'جيد جداً' ? 'text-green-300' : level === 'جيد' ? 'text-yellow-400' : level === 'ضعيف' ? 'text-orange-400' : 'text-red-400';
  });

  let html = `
    <div class="glass p-4 rounded-xl border border-turquoise/30 mt-4">
      <h5 class="text-base font-bold text-white mb-3">جدول تقييم الموظفين</h5>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-white/10 border-b border-white/20">
              <th class="p-2 text-right font-bold text-turquoise text-xs">الترتيب</th>
              <th class="p-2 text-right font-bold text-turquoise text-xs">اسم الموظف</th>
              <th class="p-2 text-center font-bold text-turquoise text-xs">الفرع</th>
              <th class="p-2 text-center font-bold text-turquoise text-xs">الحجوزات</th>
              <th class="p-2 text-center font-bold text-turquoise text-xs">التقييمات</th>
              <th class="p-2 text-center font-bold text-turquoise text-xs">الصافي</th>
              <th class="p-2 text-center font-bold text-turquoise text-xs">النقاط</th>
            </tr>
          </thead>
          <tbody>
  `;

  function escapeHtmlArchived(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  const maxPointsBalanceArchived = employeesData.length ? Math.max(...employeesData.map(e => e.pointsBalance != null ? e.pointsBalance : 0)) : 0;
  employeesData.forEach((emp, index) => {
    // المؤشر مرتبط بمستوى الأداء (0-100%) وليس برصيد النقاط المالي
    const barLeftPct = Math.min(100, Math.max(0, emp.points || 0));
    const nameSafe = escapeHtmlArchived(emp.name);
    const branchesSafe = escapeHtmlArchived(emp.branches);
    const ptsDisplay = (emp.pointsBalance != null ? emp.pointsBalance : emp.net).toFixed(2);
    html += `
      <tr class="border-b border-white/10 hover:bg-white/5">
        <td class="p-2 text-center font-bold text-turquoise text-xs">${index + 1}</td>
        <td class="p-2 text-right font-bold text-white text-xs">${nameSafe}${emp.isDuplicate ? ' <span class="text-[10px] text-gray-400">(متكرر)</span>' : ''}</td>
        <td class="p-2 text-center text-gray-300 text-[10px]">${branchesSafe}</td>
        <td class="p-2 text-center font-bold text-white text-xs">${emp.count}</td>
        <td class="p-2 text-center text-gray-300 text-xs">
          <span class="text-blue-400">${emp.evalBooking}</span> / <span class="text-purple-400">${emp.evalGoogle}</span>
        </td>
        <td class="p-2 text-center font-bold text-green-400 text-xs">${emp.net.toFixed(2)} ريال</td>
        <td class="p-2 text-center">
          <span class="font-bold text-turquoise text-xs" title="رصيد النقاط من الفترة">${ptsDisplay} نقطة</span>
          <div class="text-[10px] text-gray-400">مستوى الأداء: ${emp.level}</div>
        </td>
      </tr>
      <tr class="border-b border-white/5 reasons-row bg-turquoise/5 border-r-4 border-turquoise/30">
        <td colspan="7" class="text-right text-gray-400" style="font-size: 0.75rem !important; line-height: 1.4; padding: 0.46rem 0.75rem !important;">
          <span class="font-medium text-gray-500">أسباب التقييم:</span> ${emp.reasonsHtml}
        </td>
      </tr>
    `;
  });

  html += `
          </tbody>
        </table>
      </div>
    </div>
  `;

  tableContainer.innerHTML = html;
}

async function loadArchivedPeriodStats(periodId) {
  var archivedStatsContentEl = document.getElementById('archivedPeriodStatsContent');
  if (!periodId) {
    if (archivedStatsContentEl) archivedStatsContentEl.classList.add('hidden');
    return;
  }
  
  try {
    if (typeof showToast === 'function') {
      showToast('⏳ جاري تحميل إحصائيات الفترة...', 'info');
    }
    
    let periodData = null;
    
    // Try Firebase Storage first
    if (storage && typeof storage.ref === 'function') {
      try {
        const periodRef = storage.ref(`periods/${periodId}.json`);
        const url = await periodRef.getDownloadURL();
        const response = await fetch(url);
        if (response.ok) {
          periodData = await response.json();
        }
      } catch (error) {
        console.warn('⚠️ Firebase Storage error, trying localStorage:', error);
      }
    }
    
    // Fallback to localStorage
    if (!periodData) {
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        const periods = JSON.parse(saved);
        periodData = periods.find(p => (p.id || p.periodId) === periodId);
      }
    }
    
    if (!periodData || !periodData.data) {
      if (typeof showToast === 'function') {
        showToast('❌ لم يتم العثور على بيانات الفترة', 'error');
      }
      return;
    }
    
    // Display statistics
    const archivedData = periodData.data.db || [];
    const stats = calculatePeriodStats(archivedData);
    
    // Update stats cards
    const container = document.getElementById('archivedPeriodStatsCards');
    if (container) {
      container.innerHTML = `
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">عدد الموظفين</div>
          <div class="text-2xl font-black text-turquoise">${stats.employees}</div>
        </div>
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">إجمالي الحجوزات</div>
          <div class="text-2xl font-black text-turquoise">${stats.bookings}</div>
        </div>
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">إجمالي التقييمات</div>
          <div class="text-2xl font-black text-turquoise">${stats.evaluations}</div>
        </div>
        <div class="glass p-4 rounded-xl border border-turquoise/30">
          <div class="text-sm text-gray-400 mb-1">إجمالي المستحقات</div>
          <div class="text-2xl font-black text-green-400">${stats.total.toFixed(0)} ريال</div>
        </div>
      `;
    }
    
    // Populate employee performance table for archived period
    populateArchivedEmployeePerformanceTable(archivedData);
    
    // Show content
    if (archivedStatsContentEl) archivedStatsContentEl.classList.remove('hidden');
    
    if (typeof showToast === 'function') {
      showToast('✅ تم تحميل إحصائيات الفترة بنجاح', 'success');
    }
  } catch (error) {
    console.error('❌ Error loading archived period stats:', error);
    if (typeof showToast === 'function') {
      showToast('❌ حدث خطأ أثناء تحميل إحصائيات الفترة', 'error');
    }
  }
}

function calculatePeriodStats(employees) {
  let totalEmployees = 0;
  let totalBookings = 0;
  let totalEvalBooking = 0;
  let totalEvalGoogle = 0;
  let totalNet = 0;
  let totalFund = 0;
  
  const uniqueNames = new Set();
  
  employees.forEach(emp => {
    uniqueNames.add(emp.name);
    totalBookings += emp.count || 0;
    totalEvalBooking += emp.evaluationsBooking || 0;
    totalEvalGoogle += emp.evaluationsGoogle || 0;
    
    // Calculate net (simplified)
    const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
    const gross = (emp.count * rate) + ((emp.evaluationsBooking || 0) * 20) + ((emp.evaluationsGoogle || 0) * 10);
    const fund = gross * getSupportFundRatio();
    let net = gross - fund;
    
    // Add attendance bonus
    if (emp.attendance26Days === true) {
      net = net + (net * 0.25);
    }
    
    totalNet += net;
    totalFund += fund;
  });
  
  totalEmployees = uniqueNames.size;
  const totalEval = totalEvalBooking + totalEvalGoogle;
  const total = totalNet + totalFund;
  
  return {
    employees: totalEmployees,
    bookings: totalBookings,
    evaluations: totalEval,
    total: total
  };
}

function populateArchivedEmployeePerformanceTable(employees) {
  const tbody = document.getElementById('archivedEmployeePerformanceTableBody');
  if (!tbody) return;
  
  if (!employees || employees.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="p-4 text-center text-gray-400">لا توجد بيانات</td></tr>';
    return;
  }
  
  // Similar logic to populateEmployeePerformanceTable but using archived data
  const employeesData = [];
  const nameCounts = {};
  
  employees.forEach(emp => {
    nameCounts[emp.name] = (nameCounts[emp.name] || 0) + 1;
  });
  
  const uniqueEmployees = new Map();
  employees.forEach(emp => {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, []);
    }
    uniqueEmployees.get(key).push(emp);
  });
  
  uniqueEmployees.forEach((empList, name) => {
    let totalCount = 0;
    let totalEvalBooking = 0;
    let totalEvalGoogle = 0;
    let totalNet = 0;
    let branches = [];
    
    empList.forEach(emp => {
      totalCount += emp.count || 0;
      totalEvalBooking += emp.evaluationsBooking || 0;
      totalEvalGoogle += emp.evaluationsGoogle || 0;
      
      const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
      const gross = (emp.count * rate) + ((emp.evaluationsBooking || 0) * 20) + ((emp.evaluationsGoogle || 0) * 10);
      const fund = gross * getSupportFundRatio();
      let net = gross - fund;
      
      if (emp.attendance26Days === true) {
        net = net + (net * 0.25);
      }
      
      totalNet += net;
      if (!branches.includes(emp.branch)) {
        branches.push(emp.branch);
      }
    });
    
    const performanceScore = totalCount + (totalEvalBooking * 2) + totalEvalGoogle + (totalNet / 100);
    
    employeesData.push({
      name: name,
      branches: branches.join(' - '),
      count: totalCount,
      evalBooking: totalEvalBooking,
      evalGoogle: totalEvalGoogle,
      totalEval: totalEvalBooking + totalEvalGoogle,
      net: totalNet,
      performanceScore: performanceScore,
      isDuplicate: nameCounts[name] > 1
    });
  });
  
  employeesData.sort((a, b) => b.performanceScore - a.performanceScore);
  
  let html = '';
  employeesData.forEach((emp, index) => {
    let rating = 'جيد';
    let ratingColor = 'text-green-400';
    if (emp.performanceScore >= 200) {
      rating = 'ممتاز';
      ratingColor = 'text-green-500';
    } else if (emp.performanceScore >= 100) {
      rating = 'جيد جداً';
      ratingColor = 'text-green-400';
    } else if (emp.performanceScore >= 50) {
      rating = 'جيد';
      ratingColor = 'text-yellow-400';
    } else {
      rating = 'يحتاج تحسين';
      ratingColor = 'text-red-400';
    }
    
    html += `
      <tr class="border-b border-white/10 hover:bg-white/5">
        <td class="p-3 text-center font-bold text-turquoise">${index + 1}</td>
        <td class="p-3 text-right font-bold text-white">${emp.name}${emp.isDuplicate ? ' <span class="text-xs text-gray-400">(متكرر)</span>' : ''}</td>
        <td class="p-3 text-center text-gray-300 text-xs">${emp.branches}</td>
        <td class="p-3 text-center font-bold text-white">${emp.count}</td>
        <td class="p-3 text-center text-gray-300">
          <span class="text-blue-400">${emp.evalBooking}</span> / <span class="text-purple-400">${emp.evalGoogle}</span>
          <div class="text-xs text-gray-400">(${emp.totalEval} إجمالي)</div>
        </td>
        <td class="p-3 text-center font-bold text-green-400">${emp.net.toFixed(2)} ريال</td>
        <td class="p-3 text-center">
          <span class="font-bold ${ratingColor}">${rating}</span>
        </td>
      </tr>
    `;
  });
  
  if (html === '') {
    html = '<tr><td colspan="7" class="p-4 text-center text-gray-400">لا توجد بيانات</td></tr>';
  }
  
  tbody.innerHTML = html;
}
