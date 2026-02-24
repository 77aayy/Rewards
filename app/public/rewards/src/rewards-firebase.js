// وحدة Firebase للمكافآت — قراءة/كتابة الفترة الحية من/إلى Firebase Storage.
// مصدر التعديلات: app/Rewards/. لا تعدّل النسخة في public/rewards يدوياً — npm run sync:rewards من مجلد app.
// تقرأ/تكتب الحالة المشتركة عبر window (window.db، window.storage، إلخ).

var REWARDS_PRICING_STORAGE_KEY = 'adora_rewards_pricing';

// === مزامنة الفترة الحية مع Firebase ===
var LIVE_PERIOD_PATH = 'periods/live.json';
var CONFIG_PATH = 'config/settings.json';
var syncLivePeriodTimer = null;
var lastAppliedLiveModified = 0;
var lastAppliedAdminSubmitted = {};
if (typeof window !== 'undefined') {
  window.lastAppliedLiveModified = 0;
  window.lastAppliedAdminSubmitted = lastAppliedAdminSubmitted;
}

var firebaseInitAttempts = 0;
var MAX_INIT_ATTEMPTS = 5;

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
      if (typeof window !== 'undefined') window.storage = null;
      return;
    }
  }
  if (typeof window !== 'undefined' && window.storage) {
    if (typeof window !== 'undefined') window.storage = window.storage;
    if (typeof window !== 'undefined') window.firebaseApp = firebase.apps && firebase.apps[0] ? firebase.apps[0] : null;
    return;
  }
  if (!config) {
    console.warn('⚠️ firebaseConfig not found (load firebase-config.js)');
    return;
  }
  try {
    var firebaseApp = null;
    if (!firebase.apps || firebase.apps.length === 0) {
      firebaseApp = firebase.initializeApp(config);
      console.log('✅ Firebase app initialized');
    } else {
      firebaseApp = firebase.apps[0];
      console.log('✅ Firebase app already initialized');
    }
    if (firebaseApp && typeof firebase.storage === 'function') {
      var storage = firebase.storage();
      if (typeof window !== 'undefined') window.storage = storage;
      if (typeof window !== 'undefined') window.firebaseApp = firebaseApp;
      console.log('✅ Firebase Storage initialized');
    } else {
      console.error('❌ Firebase Storage function not available');
      if (typeof window !== 'undefined') window.storage = null;
    }
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    if (typeof window !== 'undefined') window.storage = null;
  }
}

function normalizePeriodPayload(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var data = raw;
  if (raw.data && typeof raw.data === 'object' && Array.isArray(raw.data.db)) data = raw.data;
  if (!data || !Array.isArray(data.db)) return null;
  return data;
}

/**
 * جلب إعدادات الأدمن من Firebase (نفس مصدر تطبيق التحليل — config/settings.json).
 * يُستخدم لتطبيق «الحد الأدنى لحجوزات الموظف» في جدول المكافآت.
 */
async function fetchConfigFromFirebase() {
  var st = typeof window !== 'undefined' ? window.storage : null;
  if (!st || typeof st.ref !== 'function') return null;
  try {
    var parsed = await fetchStorageJson(st, CONFIG_PATH);
    if (!parsed || typeof parsed !== 'object') return null;
    var min = parsed.minBookingThreshold;
    if (typeof min !== 'number' || min < 0) return null;
    return { minBookingThreshold: min };
  } catch (e) {
    if (typeof console !== 'undefined' && console.warn) console.warn('fetchConfigFromFirebase:', e && e.message);
    return null;
  }
}

async function fetchStorageJson(st, path) {
  if (!st || typeof st.ref !== 'function') return null;
  var text = null;
  var ref = st.ref(path);
  if (typeof ref.getBlob === 'function') {
    try {
      var blob = await ref.getBlob();
      text = typeof blob.text === 'function' ? await blob.text() : await new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(r.result); };
        r.onerror = rej;
        r.readAsText(blob);
      });
    } catch (e1) {
      if (typeof console !== 'undefined' && console.warn) console.warn('fetchStorageJson فشل لـ', path, '(getBlob):', e1 && (e1.message || e1.code || String(e1)));
    }
  }
  if (!text && typeof window !== 'undefined') {
    var waitStart = Date.now();
    while (typeof window.__firebaseStorageGetBlob !== 'function' && (Date.now() - waitStart) < 4000) {
      await new Promise(function (r) { setTimeout(r, 150); });
    }
    if (!text && typeof window.__firebaseStorageGetBlob !== 'function' && !window.__firebaseStorageModularFailed) {
      try {
        var config = (typeof window !== 'undefined' && window.firebaseConfig) ? window.firebaseConfig : null;
        if (!config || !config.storageBucket) throw new Error('no config');
        var appMod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js');
        var storageMod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js');
        var app = null;
        try { app = (appMod.getApp && appMod.getApp('rewardsStorageBlob')) || (appMod.getApp && appMod.getApp()) || null; } catch (_) {}
        if (!app && appMod.initializeApp) {
          app = appMod.initializeApp(config, 'rewardsStorageBlob');
        }
        if (app && storageMod.getStorage && storageMod.ref && storageMod.getBlob) {
          var storageInstance = storageMod.getStorage(app);
          window.__firebaseStorageGetBlob = async function (p) {
            var r = storageMod.ref(storageInstance, p);
            return await storageMod.getBlob(r);
          };
        }
      } catch (eMod) {
        window.__firebaseStorageModularFailed = true;
      }
    }
    if (typeof window.__firebaseStorageGetBlob === 'function') {
      try {
        var blobMod = await window.__firebaseStorageGetBlob(path);
        if (blobMod) text = typeof blobMod.text === 'function' ? await blobMod.text() : await new Promise(function (res, rej) {
          var r = new FileReader();
          r.onload = function () { res(r.result); };
          r.onerror = rej;
          r.readAsText(blobMod);
        });
      } catch (e2) {
        if (typeof console !== 'undefined' && console.warn) console.warn('fetchStorageJson فشل لـ', path, '(modular getBlob):', e2 && (e2.message || e2.code || String(e2)));
      }
    }
  }
  // لا نستخدم getDownloadURL + fetch — محظور بـ CORS من المتصفح
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (e4) {
    return null;
  }
}

async function fetchLivePeriodFromFirebase() {
  var st = typeof window !== 'undefined' ? window.storage : null;
  var parsed = await fetchStorageJson(st, LIVE_PERIOD_PATH);
  return normalizePeriodPayload(parsed);
}

async function fetchPeriodFromFirebase(periodId) {
  if (!periodId || typeof periodId !== 'string') return null;
  var raw = String(periodId).replace(/-/g, '_').trim();
  if (!raw) return null;
  var normalizedId = (typeof window !== 'undefined' && window.normalizePeriodIdToFirebase) ? window.normalizePeriodIdToFirebase(raw) : raw;
  var st = typeof window !== 'undefined' ? window.storage : null;
  var parsed = await fetchStorageJson(st, 'periods/' + normalizedId + '.json');
  if ((!parsed || !Array.isArray(parsed.db) || parsed.db.length === 0) && normalizedId !== raw) {
    parsed = await fetchStorageJson(st, 'periods/' + raw + '.json');
  }
  var data = normalizePeriodPayload(parsed);
  if (!data || data.db.length === 0) return null;
  return data;
}

function mergeFirebaseInputsIntoCurrentDb(data) {
  var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
  if (!data || !Array.isArray(data.db) || !Array.isArray(db) || db.length === 0) return 0;

  var branchNegativeRatingsCount = (typeof window !== 'undefined' && window.branchNegativeRatingsCount) ? window.branchNegativeRatingsCount : {};
  var discounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  var discountTypes = (typeof window !== 'undefined' && window.discountTypes) ? window.discountTypes : [];

  // لا نستبدل إدخالات إدارية موجودة (تقييمات سلبية، خصومات) بقيم فارغة من ملف فترة جديدة
  var hasExistingNegative = typeof branchNegativeRatingsCount === 'object' && Object.keys(branchNegativeRatingsCount || {}).length > 0;
  var hasExistingDiscounts = Array.isArray(discounts) && discounts.length > 0;
  var hasExistingDiscountTypes = Array.isArray(discountTypes) && discountTypes.length > 0;
  if (data.negativeRatingsCount && typeof data.negativeRatingsCount === 'object' && (Object.keys(data.negativeRatingsCount).length > 0 || !hasExistingNegative)) {
    try {
      branchNegativeRatingsCount = data.negativeRatingsCount;
      if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
      localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(branchNegativeRatingsCount));
    } catch (_) {}
  }
  if (Array.isArray(data.discounts) && (data.discounts.length > 0 || !hasExistingDiscounts)) {
    try {
      localStorage.setItem('adora_rewards_discounts', JSON.stringify(data.discounts));
      discounts = data.discounts;
      if (typeof window !== 'undefined') window.discounts = discounts;
    } catch (_) {}
  }
  if (Array.isArray(data.discountTypes) && (data.discountTypes.length > 0 || !hasExistingDiscountTypes)) {
    try {
      localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(data.discountTypes));
      discountTypes = data.discountTypes;
      if (typeof window !== 'undefined') window.discountTypes = discountTypes;
    } catch (_) {}
  }

  var firebaseMap = new Map();
  data.db.forEach(function(emp) {
    firebaseMap.set(emp.name + '|' + emp.branch, emp);
  });

  var changesFound = 0;
  db.forEach(function(emp) {
    var fbEmp = firebaseMap.get(emp.name + '|' + emp.branch);
    if (!fbEmp) return;
    var fbFields = [
      'evaluations', 'evaluationsBooking', 'evaluationsGoogle',
      'totalAttendanceDays', 'attendance26Days', 'attendanceDaysPerBranch',
      'doneStatus', 'doneCheckmark', 'repeaterDays', 'repeaterNotes'
    ];
    fbFields.forEach(function(f) {
      if (fbEmp[f] === undefined || fbEmp[f] === null) return;
      var incoming = fbEmp[f];
      var current = emp[f];
      // طوال ما الفترة مفتوحة: لا نستبدل إدخال إداري موجود بقيمة فارغة من ملف فترة جديدة
      if (typeof incoming === 'number' && incoming === 0 && current != null && current !== 0) return;
      if (typeof incoming === 'boolean' && incoming === false && current === true) return;
      if (typeof incoming === 'string' && incoming === '' && current != null && current !== '') return;
      if (typeof incoming === 'object' && incoming !== null && !Array.isArray(incoming) && Object.keys(incoming).length === 0 && current != null && typeof current === 'object' && Object.keys(current).length > 0) return;
      var oldVal = JSON.stringify(emp[f]);
      var newVal = JSON.stringify(fbEmp[f]);
      if (oldVal !== newVal) {
        emp[f] = fbEmp[f];
        changesFound++;
      }
    });
  });

  if (typeof window !== 'undefined') window.db = db;
  return changesFound;
}

/** تحقق إن الجدول لا يحتوي أي تقييمات أو حضور (كلها 0 أو فارغة) */
function dbHasNoEvaluations(db) {
  if (!db || !Array.isArray(db) || db.length === 0) return true;
  return db.every(function(emp) {
    var hasEval = (emp.evaluationsBooking != null && emp.evaluationsBooking > 0) || (emp.evaluationsGoogle != null && emp.evaluationsGoogle > 0);
    var hasAtt = (emp.totalAttendanceDays != null && emp.totalAttendanceDays > 0) || (emp.attendanceDaysPerBranch && Object.keys(emp.attendanceDaysPerBranch).length > 0);
    return !hasEval && !hasAtt;
  });
}

/** دمج حقول التقييمات/الحضور من مصدر (مثلاً live) إلى الجدول الحالي حسب اسم|فرع. يُعدّل targetDb في المكان. */
function mergeEvaluationsFromSourceIntoDb(targetDb, sourceDb) {
  if (!targetDb || !sourceDb || !Array.isArray(targetDb) || !Array.isArray(sourceDb)) return 0;
  var sourceMap = new Map();
  sourceDb.forEach(function(emp) { sourceMap.set(emp.name + '|' + emp.branch, emp); });
  var fbFields = ['evaluations', 'evaluationsBooking', 'evaluationsGoogle', 'totalAttendanceDays', 'attendance26Days', 'attendanceDaysPerBranch', 'doneStatus', 'doneCheckmark', 'repeaterDays', 'repeaterNotes'];
  var changes = 0;
  targetDb.forEach(function(emp) {
    var src = sourceMap.get(emp.name + '|' + emp.branch);
    if (!src) return;
    fbFields.forEach(function(f) {
      if (src[f] === undefined || src[f] === null) return;
      // دمج القيم الرقمية بما فيها 0 حتى تظهر تعديلات المشرف/HR (مثلاً تقييم 0 أو أيام 0) في جدول الكل
      var hasValue = src[f] !== undefined && src[f] !== null && (typeof src[f] !== 'number' || src[f] >= 0) && (typeof src[f] !== 'object' || (Array.isArray(src[f]) && src[f].length > 0) || (typeof src[f] === 'object' && src[f] !== null && Object.keys(src[f]).length > 0));
      if (!hasValue) return;
      var oldVal = JSON.stringify(emp[f]);
      var newVal = JSON.stringify(src[f]);
      if (oldVal !== newVal) { emp[f] = src[f]; changes++; }
    });
  });
  return changes;
}

function applyLivePeriod(data) {
  if (!data || !Array.isArray(data.db)) return;
  var branchNegativeRatingsCount = (typeof window !== 'undefined' && window.branchNegativeRatingsCount) ? window.branchNegativeRatingsCount : {};
  try {
    localStorage.setItem('adora_rewards_db', JSON.stringify(data.db));
    var br = data.branches;
    localStorage.setItem('adora_rewards_branches', JSON.stringify(Array.isArray(br) ? br : (br && typeof br.forEach === 'function' ? [...br] : [])));
    if (data.reportStartDate != null) localStorage.setItem('adora_rewards_startDate', String(data.reportStartDate));
    if (data.periodText != null) localStorage.setItem('adora_rewards_periodText', String(data.periodText));
    if (data.evalRate != null) localStorage.setItem('adora_rewards_evalRate', String(data.evalRate));
    if (Array.isArray(data.discounts)) localStorage.setItem('adora_rewards_discounts', JSON.stringify(data.discounts));
    if (Array.isArray(data.discountTypes)) localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(data.discountTypes));
    if (data.employeeCodes && typeof data.employeeCodes === 'object') localStorage.setItem('adora_rewards_employeeCodes', JSON.stringify(data.employeeCodes));
    if (data.negativeRatingsCount && typeof data.negativeRatingsCount === 'object') {
      try {
        branchNegativeRatingsCount = data.negativeRatingsCount;
        localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(branchNegativeRatingsCount));
        if (typeof window !== 'undefined') window.branchNegativeRatingsCount = branchNegativeRatingsCount;
      } catch (_) {}
    }
    if (data.rewardPricing && typeof data.rewardPricing === 'object') {
      try {
        localStorage.setItem(REWARDS_PRICING_STORAGE_KEY, JSON.stringify(data.rewardPricing));
        if (typeof window !== 'undefined') {
          if (!window.adoraConfig) window.adoraConfig = {};
          window.adoraConfig.rewardPricing = data.rewardPricing;
        }
      } catch (_) {}
    }
    if (data.lastModified != null) {
      var remoteTs = Number(data.lastModified) || 0;
      lastAppliedLiveModified = remoteTs;
      if (typeof window !== 'undefined') window.lastAppliedLiveModified = lastAppliedLiveModified;
      if (typeof clearLocalRewardsDirty === 'function') clearLocalRewardsDirty(remoteTs);
    }
    if (data.adminSubmitted && typeof data.adminSubmitted === 'object') {
      lastAppliedAdminSubmitted = data.adminSubmitted;
      if (typeof window !== 'undefined') window.lastAppliedAdminSubmitted = lastAppliedAdminSubmitted;
      var periodId = (data.reportStartDate && /^\d{4}-\d{2}/.test(String(data.reportStartDate))) ? String(data.reportStartDate).substring(0, 7).replace('-', '_') : '';
      if (periodId) {
        Object.keys(data.adminSubmitted).forEach(function (role) {
          try { localStorage.setItem('adora_admin_submitted_' + periodId + '_' + role, String(data.adminSubmitted[role])); } catch (_) {}
        });
      }
    } else {
      lastAppliedAdminSubmitted = {};
      if (typeof window !== 'undefined') window.lastAppliedAdminSubmitted = lastAppliedAdminSubmitted;
    }
  } catch (e) {
    console.warn('⚠️ applyLivePeriod:', e);
  }
}

function doSyncLivePeriodToFirebase() {
  return new Promise(function (resolve) {
    (async function () {
      try {
        var st = typeof window !== 'undefined' ? window.storage : null;
        if (!st || typeof st.ref !== 'function') {
          if (typeof initializeFirebase === 'function') initializeFirebase();
          var waitStart = Date.now();
          while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < 5000) {
            await new Promise(function (r) { setTimeout(r, 150); });
          }
          st = typeof window !== 'undefined' ? window.storage : null;
        }
        if (!st || typeof st.ref !== 'function') { resolve(); return; }
        var savedDb = localStorage.getItem('adora_rewards_db');
        if (!savedDb || !Array.isArray(JSON.parse(savedDb)) || JSON.parse(savedDb).length === 0) { resolve(); return; }
        var parsed = JSON.parse(savedDb);
        var negativeFromStorage = (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_negativeRatingsCount') || '{}'); } catch (_) { return {}; } })();
        var existingSubmitted = {};
        try {
          var liveData = typeof fetchLivePeriodFromFirebase === 'function' ? await fetchLivePeriodFromFirebase() : null;
          if (liveData && liveData.adminSubmitted && typeof liveData.adminSubmitted === 'object')
            existingSubmitted = liveData.adminSubmitted;
        } catch (_) {}
        var payload = {
          db: parsed,
          branches: JSON.parse(localStorage.getItem('adora_rewards_branches') || '[]'),
          reportStartDate: localStorage.getItem('adora_rewards_startDate') || null,
          periodText: localStorage.getItem('adora_rewards_periodText') || null,
          evalRate: parseInt(localStorage.getItem('adora_rewards_evalRate'), 10) || 20,
          discounts: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_discounts') || '[]'); } catch (_) { return []; } })(),
          discountTypes: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_discountTypes') || '[]'); } catch (_) { return []; } })(),
          employeeCodes: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_employeeCodes') || '{}'); } catch (_) { return {}; } })(),
          negativeRatingsCount: negativeFromStorage,
          rewardPricing: (function () { try { var rp = localStorage.getItem(REWARDS_PRICING_STORAGE_KEY); return rp ? JSON.parse(rp) : null; } catch (_) { return null; } })(),
          lastModified: Date.now()
        };
        if (Object.keys(existingSubmitted).length > 0) payload.adminSubmitted = existingSubmitted;
        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        await st.ref(LIVE_PERIOD_PATH).put(blob);
        var startDate = payload.reportStartDate || localStorage.getItem('adora_rewards_startDate');
        var periodIdForWrite = (startDate && /^\d{4}-\d{2}-\d{2}/.test(String(startDate))) ? String(startDate).substring(0, 7).replace('-', '_') : (typeof window.getCurrentPeriodId === 'function' ? window.getCurrentPeriodId() : (new Date().getFullYear() + '_' + String(new Date().getMonth() + 1).padStart(2, '0')));
        if (periodIdForWrite) { try { await st.ref('periods/' + periodIdForWrite + '.json').put(blob); } catch (_) {} }
      } catch (_) {}
      resolve();
    })();
  });
}

function syncLivePeriodToFirebase() {
  clearTimeout(syncLivePeriodTimer);
  syncLivePeriodTimer = setTimeout(function () { doSyncLivePeriodToFirebase(); }, 150);
}

/**
 * مسح حالة «تم الإرسال» لدور معيّن (المشرف أو HR) حتى يمكن إرسال الرابط مرة أخرى للإدخال من جديد.
 * يُستدعى من زر «مسح الإرسال وإعادة الإدخال» في إدارة الإداريين.
 * الرابط يبقى كما هو — لا يتم تغيير التوكن.
 */
function clearAdminSubmittedForRole(role) {
  return new Promise(function (resolve, reject) {
    (async function () {
      try {
        var st = typeof window !== 'undefined' ? window.storage : null;
        if (!st || typeof st.ref !== 'function') {
          if (typeof initializeFirebase === 'function') initializeFirebase();
          var waitStart = Date.now();
          while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < 5000) {
            await new Promise(function (r) { setTimeout(r, 150); });
          }
          st = typeof window !== 'undefined' ? window.storage : null;
        }
        if (!st || typeof st.ref !== 'function') { reject(new Error('Firebase غير جاهز')); return; }
        var liveData = typeof fetchLivePeriodFromFirebase === 'function' ? await fetchLivePeriodFromFirebase() : null;
        if (!liveData || !Array.isArray(liveData.db) || liveData.db.length === 0) { reject(new Error('لا توجد بيانات فترة حية')); return; }
        var existingSubmitted = (liveData.adminSubmitted && typeof liveData.adminSubmitted === 'object') ? Object.assign({}, liveData.adminSubmitted) : {};
        delete existingSubmitted[role];
        var payload = Object.assign({}, liveData);
        payload.lastModified = Date.now();
        if (Object.keys(existingSubmitted).length > 0) payload.adminSubmitted = existingSubmitted;
        else delete payload.adminSubmitted;
        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        await st.ref(LIVE_PERIOD_PATH).put(blob);
        var startDate = payload.reportStartDate || liveData.reportStartDate || '';
        var periodId = (startDate && /^\d{4}-\d{2}/.test(String(startDate))) ? String(startDate).substring(0, 7).replace('-', '_') : '';
        if (periodId) { try { await st.ref('periods/' + periodId + '.json').put(blob); } catch (_) {} }
        if (typeof window !== 'undefined' && window.lastAppliedAdminSubmitted) {
          delete window.lastAppliedAdminSubmitted[role];
        }
        if (lastAppliedAdminSubmitted && typeof lastAppliedAdminSubmitted === 'object') {
          delete lastAppliedAdminSubmitted[role];
        }
        if (periodId && typeof localStorage !== 'undefined') localStorage.removeItem('adora_admin_submitted_' + periodId + '_' + role);
        resolve();
      } catch (e) {
        reject(e);
      }
    })();
  });
}

/** تجميع إدخالات المشرف/HR من DOM وكتابتها إلى window.db ثم localStorage.
 *  مسار الظهور في جدول «الكل»: بعد الإرسال يُستدعى doSyncLivePeriodNow فيرفع من localStorage إلى periods/live.json؛
 *  صفحة الأدمن عند التحميل أو الاستطلاع الدوري تجلب live وتطبّق applyLivePeriod ثم تعيد رسم الجدول من window.db.
 *  نطبّق دائماً من DOM إلى db مباشرة حتى لا تُرفض التعديلات بفحوصات الدور/الفلتر في updateAttendanceDaysForBranch و updateEvalBooking/updateEvalGoogle. */
function flushAdminInputsToStorage() {
  try {
    var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
    if (typeof db === 'undefined' || !db.length) return;
    // تطبيق قيم DOM مباشرة على window.db (بدون استدعاء دوال التحديث التي تمنع المشرف من الحضور أو التعديل عند فلتر «الكل»)
    document.querySelectorAll('.attendance-days-input').forEach(function (el) {
      var name = el.getAttribute('data-emp-name');
      var branch = el.getAttribute('data-emp-branch');
      if (!name || !branch) return;
      var days = Math.max(0, parseInt(el.value, 10) || 0);
      var employeesWithSameName = db.filter(function (emp) { return emp.name === name; });
      var sharedMap = {};
      employeesWithSameName.forEach(function (emp) {
        if (emp.attendanceDaysPerBranch && typeof emp.attendanceDaysPerBranch === 'object') {
          Object.keys(emp.attendanceDaysPerBranch).forEach(function (b) { sharedMap[b] = emp.attendanceDaysPerBranch[b]; });
        }
      });
      sharedMap[branch] = days;
      var totalDays = Object.keys(sharedMap).reduce(function (sum, b) { return sum + (parseInt(sharedMap[b], 10) || 0); }, 0);
      employeesWithSameName.forEach(function (emp) {
        emp.attendanceDaysPerBranch = sharedMap;
        emp.totalAttendanceDays = totalDays;
        emp.attendance26Days = totalDays >= 26;
      });
    });
    document.querySelectorAll('.eval-input').forEach(function (el) {
      var id = el.getAttribute('data-emp-id');
      var type = el.getAttribute('data-eval-type');
      if (!id || !type) return;
      var val = parseInt(el.value, 10) || 0;
      var item = db.find(function (i) { return i.id === id; });
      if (!item) return;
      var empName = item.name;
      if (type === 'booking') {
        db.filter(function (i) { return i.name === empName; }).forEach(function (row) { row.evaluationsBooking = val; });
      } else if (type === 'google') {
        db.filter(function (i) { return i.name === empName; }).forEach(function (row) { row.evaluationsGoogle = val; });
      }
    });
    if (typeof window !== 'undefined' && window.db && window.db.length > 0) {
      localStorage.setItem('adora_rewards_db', JSON.stringify(window.db));
    }
  } catch (e) {}
}

function doSyncLivePeriodNow() {
  return new Promise(function (resolve, reject) {
    (async function () {
      var st = typeof window !== 'undefined' ? window.storage : null;
      if (!st || typeof st.ref !== 'function') {
        if (typeof initializeFirebase === 'function') initializeFirebase();
        var waitStart = Date.now();
        var maxWaitMs = 10000;
        while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < maxWaitMs) {
          await new Promise(function (r) { setTimeout(r, 200); });
        }
        st = typeof window !== 'undefined' ? window.storage : null;
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
        var startDate = localStorage.getItem('adora_rewards_startDate') || null;
        var periodIdForMerge = (startDate && /^\d{4}-\d{2}-\d{2}/.test(String(startDate))) ? String(startDate).substring(0, 7).replace('-', '_') : (typeof window.getCurrentPeriodId === 'function' ? window.getCurrentPeriodId() : '');
        var currentRole = (typeof localStorage !== 'undefined' && localStorage.getItem('adora_current_role')) || '';
        var adminSubmitted = {};
        if (periodIdForMerge && currentRole) {
          try {
            var existing = typeof fetchPeriodFromFirebase === 'function' ? await fetchPeriodFromFirebase(periodIdForMerge) : null;
            if (existing && existing.adminSubmitted && typeof existing.adminSubmitted === 'object')
              adminSubmitted = Object.assign({}, existing.adminSubmitted);
            adminSubmitted[currentRole] = Date.now();
          } catch (_) { adminSubmitted[currentRole] = Date.now(); }
        }
        var payload = {
          db: parsed,
          branches: JSON.parse(localStorage.getItem('adora_rewards_branches') || '[]'),
          reportStartDate: startDate,
          periodText: localStorage.getItem('adora_rewards_periodText') || null,
          evalRate: parseInt(localStorage.getItem('adora_rewards_evalRate'), 10) || 20,
          discounts: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_discounts') || '[]'); } catch (_) { return []; } })(),
          discountTypes: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_discountTypes') || '[]'); } catch (_) { return []; } })(),
          employeeCodes: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_employeeCodes') || '{}'); } catch (_) { return {}; } })(),
          negativeRatingsCount: (function () { try { return JSON.parse(localStorage.getItem('adora_rewards_negativeRatingsCount') || '{}'); } catch (_) { return {}; } })(),
          rewardPricing: (function () { try { var rp = localStorage.getItem(REWARDS_PRICING_STORAGE_KEY); return rp ? JSON.parse(rp) : null; } catch (_) { return null; } })(),
          lastModified: Date.now()
        };
        if (Object.keys(adminSubmitted).length > 0) payload.adminSubmitted = adminSubmitted;
        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        await st.ref(LIVE_PERIOD_PATH).put(blob);
        if (payload.lastModified) {
          lastAppliedLiveModified = payload.lastModified;
          if (typeof window !== 'undefined') window.lastAppliedLiveModified = lastAppliedLiveModified;
        }
        if (payload.lastModified && typeof clearLocalRewardsDirty === 'function') clearLocalRewardsDirty(payload.lastModified);
        if (currentRole && adminSubmitted[currentRole]) {
          lastAppliedAdminSubmitted[currentRole] = adminSubmitted[currentRole];
          if (typeof window !== 'undefined') window.lastAppliedAdminSubmitted = lastAppliedAdminSubmitted;
          var periodKey = periodIdForMerge || (startDate && /^\d{4}-\d{2}/.test(String(startDate)) ? String(startDate).substring(0, 7).replace('-', '_') : '');
          if (periodKey && typeof localStorage !== 'undefined') {
            try { localStorage.setItem('adora_admin_submitted_' + periodKey + '_' + currentRole, String(adminSubmitted[currentRole])); } catch (_) {}
          }
        }
        var periodIdForWrite = (startDate && /^\d{4}-\d{2}-\d{2}/.test(String(startDate))) ? String(startDate).substring(0, 7).replace('-', '_') : (typeof window.getCurrentPeriodId === 'function' ? window.getCurrentPeriodId() : (new Date().getFullYear() + '_' + String(new Date().getMonth() + 1).padStart(2, '0')));
        if (periodIdForWrite) {
          try { await st.ref('periods/' + periodIdForWrite + '.json').put(blob); } catch (ePeriod) {
            if (typeof console !== 'undefined' && console.warn) console.warn('⚠️ فشل رفع periods/' + periodIdForWrite + '.json:', ePeriod && ePeriod.message);
          }
        }
        // التحقق يعمل فقط عندما ref.getBlob متوفر — وإلا getDownloadURL+fetch تُحظر بـ CORS
        var canVerify = typeof st.ref(LIVE_PERIOD_PATH).getBlob === 'function';
        if (canVerify) {
          await new Promise(function (r) { setTimeout(r, 1500); });
          var verified = await fetchStorageJson(st, LIVE_PERIOD_PATH);
          var verifiedPayload = normalizePeriodPayload(verified);
          if (!verifiedPayload || !Array.isArray(verifiedPayload.db) || verifiedPayload.db.length === 0) {
            if (typeof console !== 'undefined' && console.warn) console.warn('التحقق فشل: جلب periods/live.json من Firebase لم ينجح.');
            reject(new Error('تم الرفع لكن التحقق فشل — جرّب فتح «إدارة الإداريين» مرة أخرى بعد ثوانٍ أو تحقق من الاتصال.'));
            return;
          }
        }
        resolve();
      } catch (e) {
        reject(e);
      }
    })();
  });
}

var LIVE_POLL_INTERVAL_MS = 30000;
var ADMIN_POLL_INTERVAL_MS = 12000;
var livePollTimerId = null;

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
        var data = await (typeof fetchLivePeriodFromFirebase === 'function' ? fetchLivePeriodFromFirebase() : null);
        if (!data || !Array.isArray(data.db) || data.db.length === 0) return;
        var remoteModified = Number(data.lastModified) || 0;
        var isAdmin = typeof isAdminMode === 'function' && isAdminMode();
        if (remoteModified <= lastAppliedLiveModified) {
          if (isAdmin) {
            var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
            var currentStr = db && db.length ? JSON.stringify(db.map(function (e) { return { id: e.id, evaluationsBooking: e.evaluationsBooking, evaluationsGoogle: e.evaluationsGoogle, attendance26Days: e.attendance26Days, attendanceDaysPerBranch: e.attendanceDaysPerBranch, totalAttendanceDays: e.totalAttendanceDays }; })) : '';
            var remoteStr = data.db && data.db.length ? JSON.stringify(data.db.map(function (e) { return { id: e.id, evaluationsBooking: e.evaluationsBooking, evaluationsGoogle: e.evaluationsGoogle, attendance26Days: e.attendance26Days, attendanceDaysPerBranch: e.attendanceDaysPerBranch, totalAttendanceDays: e.totalAttendanceDays }; })) : '';
            if (currentStr === remoteStr) return;
          } else return;
        }
        if (typeof applyLivePeriod === 'function') applyLivePeriod(data);
        lastAppliedLiveModified = remoteModified;
        if (typeof window !== 'undefined') window.lastAppliedLiveModified = lastAppliedLiveModified;
        if (typeof window !== 'undefined') window.db = data.db;
        if (typeof window !== 'undefined') window.branches = new Set(Array.isArray(data.branches) ? data.branches : []);
        if (data.reportStartDate != null && typeof window !== 'undefined') window.reportStartDate = data.reportStartDate;
        if (data.evalRate != null && typeof window !== 'undefined') window.currentEvalRate = parseInt(data.evalRate, 10) || 20;
        if (Array.isArray(data.discounts) && typeof window !== 'undefined') { try { window.discounts = data.discounts; } catch (_) {} }
        if (Array.isArray(data.discountTypes) && typeof window !== 'undefined') { try { window.discountTypes = data.discountTypes; } catch (_) {} }
        if (data.employeeCodes && typeof data.employeeCodes === 'object' && typeof window !== 'undefined') { try { window.employeeCodesMap = data.employeeCodes; } catch (_) {} }
        if (data.negativeRatingsCount && typeof data.negativeRatingsCount === 'object' && typeof window !== 'undefined') { try { window.branchNegativeRatingsCount = data.negativeRatingsCount; localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(data.negativeRatingsCount)); } catch (_) {} }
        if (data.rewardPricing && typeof data.rewardPricing === 'object') { try { localStorage.setItem(REWARDS_PRICING_STORAGE_KEY, JSON.stringify(data.rewardPricing)); if (typeof window !== 'undefined' && window.adoraConfig) window.adoraConfig.rewardPricing = data.rewardPricing; } catch (_) {} }
        if (data.periodText != null) {
          try {
            localStorage.setItem('adora_rewards_periodText', String(data.periodText));
            var periodRangeEl = document.getElementById('periodRange');
            var headerPeriodRangeEl = document.getElementById('headerPeriodRange');
            if (periodRangeEl) periodRangeEl.innerText = data.periodText;
            if (headerPeriodRangeEl) headerPeriodRangeEl.innerText = data.periodText;
          } catch (_) {}
        }
        if (typeof renderUI === 'function' && typeof window !== 'undefined' && window.currentFilter !== undefined) {
          requestAnimationFrame(function () { renderUI(window.currentFilter); });
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
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        stopLivePeriodPolling();
      } else {
        startLivePeriodPolling();
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

function refreshLivePeriodFromFirebase() {
  if (typeof isAdminMode !== 'function' || !isAdminMode()) return;
  var btn = document.getElementById('refreshLiveBtn');
  (async function () {
    try {
      if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
      var data = typeof fetchLivePeriodFromFirebase === 'function' ? await fetchLivePeriodFromFirebase() : null;
      if (!data) {
        var msg = (typeof window !== 'undefined' && !window.storage)
          ? 'Firebase غير متصل — تحقق من الاتصال أو إعدادات المشروع.'
          : 'فشل التحميل من Firebase — قد لا توجد فترة حية بعد أو تحقق من الاتصال.';
        if (typeof showToast === 'function') showToast(msg, 'info');
        return;
      }
      var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
      var branchNegativeRatingsCount = (typeof window !== 'undefined' && window.branchNegativeRatingsCount) ? window.branchNegativeRatingsCount : {};
      var discounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
      var discountTypes = (typeof window !== 'undefined' && window.discountTypes) ? window.discountTypes : [];

      if (Array.isArray(db) && db.length > 0) {
        var merged = 0;
        if (Array.isArray(data.db) && data.db.length > 0 && typeof mergeFirebaseInputsIntoCurrentDb === 'function') {
          merged = mergeFirebaseInputsIntoCurrentDb(data);
        }
        if (data.negativeRatingsCount && typeof data.negativeRatingsCount === 'object') {
          try { if (typeof window !== 'undefined') window.branchNegativeRatingsCount = data.negativeRatingsCount; localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(data.negativeRatingsCount)); } catch (_) {}
        }
        if (Array.isArray(data.discounts)) { try { if (typeof window !== 'undefined') window.discounts = data.discounts; localStorage.setItem('adora_rewards_discounts', JSON.stringify(data.discounts)); } catch (_) {} }
        if (Array.isArray(data.discountTypes)) { try { if (typeof window !== 'undefined') window.discountTypes = data.discountTypes; localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(data.discountTypes)); } catch (_) {} }
        try { localStorage.setItem('adora_rewards_db', JSON.stringify(window.db)); } catch (_) {}
        if (data.periodText != null) {
          var periodRangeEl = document.getElementById('periodRange');
          var headerPeriodRangeEl = document.getElementById('headerPeriodRange');
          if (periodRangeEl) periodRangeEl.innerText = data.periodText;
          if (headerPeriodRangeEl) headerPeriodRangeEl.innerText = data.periodText;
        }
        if (Number(data.lastModified) > 0) {
          lastAppliedLiveModified = Number(data.lastModified);
          if (typeof window !== 'undefined') window.lastAppliedLiveModified = lastAppliedLiveModified;
        }
        if (typeof normalizeDuplicateAttendance === 'function' && Array.isArray(window.db)) normalizeDuplicateAttendance(window.db);
        if (typeof window !== 'undefined') window.db = window.db;
        if (typeof renderUI === 'function' && typeof window !== 'undefined' && window.currentFilter !== undefined) requestAnimationFrame(function () { renderUI(window.currentFilter); });
        if (typeof populateEmployeePerformanceTable === 'function') requestAnimationFrame(function () { populateEmployeePerformanceTable(); });
        if (typeof updateFilters === 'function') updateFilters();
        if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
        if (typeof showToast === 'function') showToast(merged > 0 ? 'تم تحميل التحديثات من المشرف/HR' : 'تم التحديث — لا توجد تغييرات جديدة', 'success');
      } else {
        if (!Array.isArray(data.db) || data.db.length === 0) {
          if (typeof showToast === 'function') showToast('لا توجد بيانات. انقل النتائج من نظام التحليل أولاً.', 'info');
          return;
        }
        if (typeof applyLivePeriod === 'function') applyLivePeriod(data);
        lastAppliedLiveModified = Number(data.lastModified) || 0;
        if (typeof window !== 'undefined') window.lastAppliedLiveModified = lastAppliedLiveModified;
        if (typeof window !== 'undefined') window.db = data.db;
        if (typeof window !== 'undefined') window.branches = new Set(Array.isArray(data.branches) ? data.branches : []);
        if (data.reportStartDate != null && typeof window !== 'undefined') window.reportStartDate = data.reportStartDate;
        if (data.evalRate != null && typeof window !== 'undefined') window.currentEvalRate = parseInt(data.evalRate, 10) || 20;
        if (Array.isArray(data.discounts) && typeof window !== 'undefined') { try { window.discounts = data.discounts; } catch (_) {} }
        if (Array.isArray(data.discountTypes) && typeof window !== 'undefined') { try { window.discountTypes = data.discountTypes; } catch (_) {} }
        if (data.negativeRatingsCount && typeof data.negativeRatingsCount === 'object') { try { if (typeof window !== 'undefined') window.branchNegativeRatingsCount = data.negativeRatingsCount; localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(data.negativeRatingsCount)); } catch (_) {} }
        if (data.periodText != null) {
          var periodRangeEl = document.getElementById('periodRange');
          var headerPeriodRangeEl = document.getElementById('headerPeriodRange');
          if (periodRangeEl) periodRangeEl.innerText = data.periodText;
          if (headerPeriodRangeEl) headerPeriodRangeEl.innerText = data.periodText;
        }
        if (typeof renderUI === 'function' && typeof window !== 'undefined' && window.currentFilter !== undefined) requestAnimationFrame(function () { renderUI(window.currentFilter); });
        if (typeof populateEmployeePerformanceTable === 'function') requestAnimationFrame(function () { populateEmployeePerformanceTable(); });
        if (typeof updateFilters === 'function') updateFilters();
        if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
        if (typeof showToast === 'function') showToast('تم تحميل التحديثات من المشرف/HR', 'success');
      }
    } catch (e) {
      if (typeof showToast === 'function') showToast('فشل تحميل التحديثات', 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); }
    }
  })();
}

function _adoraBackgroundFirebaseSync(payload, options) {
  var shouldUploadAfterMerge = !!(options && options.uploadAfterMerge === true);
  var syncBadge = document.createElement('div');
  syncBadge.id = 'adoraFirebaseSyncBadge';
  syncBadge.innerHTML = '<div style="display:flex;align-items:center;gap:6px;padding:4px 14px;border-radius:20px;background:rgba(20,184,166,0.15);border:1px solid rgba(20,184,166,0.3);backdrop-filter:blur(8px);font-size:12px;color:#5eead4;animation:adoraPulseSync 1.5s ease-in-out infinite;">'
    + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:adoraSpin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>'
    + '<span>جاري المزامنة مع Firebase...</span>'
    + '</div>';
  syncBadge.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;transition:opacity 0.5s;';

  if (!document.getElementById('adoraSyncAnimStyle')) {
    var styleEl = document.createElement('style');
    styleEl.id = 'adoraSyncAnimStyle';
    styleEl.textContent = '@keyframes adoraSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}@keyframes adoraPulseSync{0%,100%{opacity:1}50%{opacity:0.6}}';
    document.head.appendChild(styleEl);
  }
  document.body.appendChild(syncBadge);

  (async function() {
    var syncSuccess = false;
    try {
      var reportStartDate = (typeof window !== 'undefined' && window.reportStartDate) ? window.reportStartDate : null;
      var startDate = (typeof reportStartDate === 'string' && reportStartDate && /^\d{4}-\d{2}-\d{2}/.test(reportStartDate))
        ? reportStartDate
        : (localStorage.getItem('adora_rewards_startDate') || '').trim();
      // تطبيع تاريخ بصيغة DD/MM/YYYY أو DD-MM-YYYY إلى YYYY-MM-DD لضمان جلب الفترة من Firebase
      if (startDate && !/^\d{4}-\d{2}-\d{2}/.test(startDate)) {
        var parts = startDate.split(/[\/\-]/);
        if (parts.length === 3 && parts[0].length <= 4 && parts[2].length <= 4) {
          var d = parseInt(parts[0], 10), m = parseInt(parts[1], 10), y = parseInt(parts[2], 10);
          if (parts[0].length === 4) { y = parseInt(parts[0], 10); m = parseInt(parts[1], 10); d = parseInt(parts[2], 10); }
          if (!isNaN(y) && !isNaN(m) && !isNaN(d) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
            startDate = y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0');
            if (typeof window !== 'undefined') window.reportStartDate = startDate;
            try { localStorage.setItem('adora_rewards_startDate', startDate); } catch (_) {}
          }
        }
      }
      if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) {
        syncSuccess = true;
      } else {
        if (typeof window !== 'undefined') window.reportStartDate = startDate;

        if (typeof initializeFirebase === 'function') initializeFirebase();
        var waitStart = Date.now();
        while (!(typeof window !== 'undefined' && window.storage) && (Date.now() - waitStart) < 8000) {
          await new Promise(function(r) { setTimeout(r, 200); });
        }

        var periodId = startDate.substring(0, 7).replace('-', '_');
        var data = null;

        if (typeof fetchPeriodFromFirebase === 'function') data = await fetchPeriodFromFirebase(periodId);
        if (!data || !Array.isArray(data.db) || data.db.length === 0) {
          if (typeof fetchLivePeriodFromFirebase === 'function') data = await fetchLivePeriodFromFirebase();
        }

        if (data && Array.isArray(data.db) && data.db.length > 0) {
          var remoteModified = Number(data.lastModified) || 0;
          var localEditTs = typeof getLocalRewardsEditTs === 'function' ? getLocalRewardsEditTs() : 0;
          var localDirty = typeof isLocalRewardsDirty === 'function' ? isLocalRewardsDirty() : false;
          if (!shouldUploadAfterMerge && localDirty && (remoteModified === 0 || remoteModified <= localEditTs)) {
            if (typeof logVerbose === 'function') logVerbose('⏭️ Skip Firebase merge: local edits are newer/unsynced');
            syncSuccess = true;
          } else {
            var changesFound = mergeFirebaseInputsIntoCurrentDb(data);
            var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
            // إذا الجدول بعد الدمج لا يزال بلا تقييمات/حضور (كلها 0)، نجلب آخر بيانات محفوظة من live.json
            if (db.length > 0 && typeof dbHasNoEvaluations === 'function' && dbHasNoEvaluations(db) && typeof fetchLivePeriodFromFirebase === 'function') {
              try {
                var liveData = await fetchLivePeriodFromFirebase();
                if (liveData && Array.isArray(liveData.db) && liveData.db.length > 0 && typeof dbHasNoEvaluations === 'function' && !dbHasNoEvaluations(liveData.db)) {
                  var extra = typeof mergeEvaluationsFromSourceIntoDb === 'function' ? mergeEvaluationsFromSourceIntoDb(db, liveData.db) : 0;
                  if (extra > 0) {
                    if (typeof logVerbose === 'function') logVerbose('✅ تم استكمال التقييمات/الحضور من live.json (آخر محفوظ):', extra, 'حقل');
                    try { localStorage.setItem('adora_rewards_db', JSON.stringify(window.db)); } catch (_) {}
                    changesFound += extra;
                  }
                  if (liveData.negativeRatingsCount && typeof liveData.negativeRatingsCount === 'object') {
                    try {
                      if (typeof window !== 'undefined') window.branchNegativeRatingsCount = liveData.negativeRatingsCount;
                      localStorage.setItem('adora_rewards_negativeRatingsCount', JSON.stringify(liveData.negativeRatingsCount));
                    } catch (_) {}
                    if (typeof updateNegativeRatingsHeader === 'function') updateNegativeRatingsHeader();
                  }
                  if (Array.isArray(liveData.discounts)) {
                    try { localStorage.setItem('adora_rewards_discounts', JSON.stringify(liveData.discounts)); if (typeof window !== 'undefined') window.discounts = liveData.discounts; } catch (_) {}
                  }
                  if (Array.isArray(liveData.discountTypes)) {
                    try { localStorage.setItem('adora_rewards_discountTypes', JSON.stringify(liveData.discountTypes)); if (typeof window !== 'undefined') window.discountTypes = liveData.discountTypes; } catch (_) {}
                  }
                }
              } catch (eLive) {
                if (typeof console !== 'undefined' && console.warn) console.warn('⚠️ enrich from live:', eLive && eLive.message);
              }
            }
            if (changesFound > 0) {
              if (typeof logVerbose === 'function') logVerbose('✅ Firebase background merge: updated', changesFound, 'fields from Firebase');
              try {
                localStorage.setItem('adora_rewards_db', JSON.stringify(window.db));
              } catch (_) {}
            } else {
              if (typeof logVerbose === 'function') logVerbose('✅ Firebase background check: no new evaluations/attendance to merge');
            }
            // إعادة الرسم دائماً بعد الدمج لضبط الصافي والحضور والتقييمات (حتى لو changesFound === 0)
            var currentTab = (typeof window !== 'undefined' && window.currentBranch) ? window.currentBranch : (typeof window !== 'undefined' && window.currentFilter) ? window.currentFilter : 'الكل';
            if (typeof renderUI === 'function') renderUI(currentTab);
            if (remoteModified > 0 && typeof clearLocalRewardsDirty === 'function') clearLocalRewardsDirty(remoteModified);
            syncSuccess = true;
          }
        } else {
          if (typeof logVerbose === 'function') logVerbose('ℹ️ No existing period in Firebase — first transfer for this period');
          syncSuccess = true;
        }

        if (shouldUploadAfterMerge && typeof syncLivePeriodToFirebase === 'function') {
          if (typeof logVerbose === 'function') logVerbose('📤 Syncing updated data to Firebase...');
          syncLivePeriodToFirebase();
        }
      }
    } catch (e) {
      if (e.message && e.message.indexOf('reportStartDate') === -1) {
        console.warn('⚠️ Background Firebase sync failed:', e.message || e);
      }
    }

    // إعادة رسم الجدول بعد انتهاء المزامنة لضبط الصافي والحضور والتقييمات (حتى عند عدم وجود بيانات من Firebase)
    var currentFilter = (typeof window !== 'undefined' && window.currentBranch) ? window.currentBranch : (typeof window !== 'undefined' && window.currentFilter) ? window.currentFilter : 'الكل';
    if (typeof fetchConfigFromFirebase === 'function') {
      try {
        var cfg = await fetchConfigFromFirebase();
        if (cfg && typeof cfg.minBookingThreshold === 'number') window.minBookingThreshold = cfg.minBookingThreshold;
      } catch (_) {}
    }
    if (typeof renderUI === 'function' && typeof window !== 'undefined' && window.db && window.db.length > 0) renderUI(currentFilter);

    var badge = document.getElementById('adoraFirebaseSyncBadge');
    if (badge) {
      var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
      var hasData = db && db.length > 0;
      if (syncSuccess) {
        badge.innerHTML = '<div style="display:flex;align-items:center;gap:6px;padding:4px 14px;border-radius:20px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);backdrop-filter:blur(8px);font-size:12px;color:#6ee7b7;">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          + '<span>تمت المزامنة ✓</span>'
          + '</div>';
      } else if (hasData) {
        badge.innerHTML = '<div style="display:flex;align-items:center;gap:6px;padding:4px 14px;border-radius:20px;background:rgba(16,185,129,0.15);border:1px solid rgba(16,185,129,0.3);backdrop-filter:blur(8px);font-size:12px;color:#6ee7b7;">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
          + '<span>البيانات جاهزة ✓</span>'
          + '</div>';
      } else {
        badge.innerHTML = '<div style="display:flex;align-items:center;gap:6px;padding:4px 14px;border-radius:20px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);backdrop-filter:blur(8px);font-size:12px;color:#fca5a5;">'
          + '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
          + '<span>فشلت المزامنة — البيانات محلية</span>'
          + '</div>';
      }
      setTimeout(function() {
        if (badge && badge.parentNode) {
          badge.style.opacity = '0';
          setTimeout(function() { if (badge.parentNode) badge.parentNode.removeChild(badge); }, 500);
        }
      }, 3000);
    }
  })();
}

if (typeof window !== 'undefined') {
  window.REWARDS_PRICING_STORAGE_KEY = REWARDS_PRICING_STORAGE_KEY;
  window.initializeFirebase = initializeFirebase;
  window.syncLivePeriodToFirebase = syncLivePeriodToFirebase;
  window.doSyncLivePeriodNow = doSyncLivePeriodNow;
  window.fetchLivePeriodFromFirebase = fetchLivePeriodFromFirebase;
  window.fetchPeriodFromFirebase = fetchPeriodFromFirebase;
  window.applyLivePeriod = applyLivePeriod;
  window.mergeFirebaseInputsIntoCurrentDb = mergeFirebaseInputsIntoCurrentDb;
  window.dbHasNoEvaluations = dbHasNoEvaluations;
  window.mergeEvaluationsFromSourceIntoDb = mergeEvaluationsFromSourceIntoDb;
  window._adoraBackgroundFirebaseSync = _adoraBackgroundFirebaseSync;
  window.startLivePeriodPolling = startLivePeriodPolling;
  window.stopLivePeriodPolling = stopLivePeriodPolling;
  window.refreshLivePeriodFromFirebase = refreshLivePeriodFromFirebase;
  window.flushAdminInputsToStorage = flushAdminInputsToStorage;
  window.clearAdminSubmittedForRole = clearAdminSubmittedForRole;
  window.fetchConfigFromFirebase = fetchConfigFromFirebase;
}

window.addEventListener('load', function () {
  initializeFirebase();
  setTimeout(function () {
    if (typeof window !== 'undefined' && !window.storage) {
      console.log('⏳ Retrying Firebase initialization...');
      initializeFirebase();
    }
  }, 1000);
});
