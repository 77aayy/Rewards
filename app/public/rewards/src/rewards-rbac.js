// وحدة RBAC للمكافآت — تحويل المسار إلى query، والتحقق من الأدوار، وإخفاء/إظهار عناصر حسب الدور.
// مصدر التعديلات: app/Rewards/. لا تعدّل النسخة في public/rewards يدوياً — npm run sync:rewards من مجلد app.
// تعتمد على window.getAdminSecretKey (من app.js) و window.lastAppliedAdminSubmitted (من rewards-firebase.js).

// تحويل رابط المسار إلى query: /supervisor/TOKEN/2026_01 → ?role=supervisor&token=TOKEN&period=2026_01
(function () {
  if (typeof window === 'undefined' || !window.location || !window.location.pathname) return;
  var pathname = window.location.pathname;
  var isDevServer = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  var basePath = isDevServer ? '/rewards/' : '/';
  var m = pathname.match(/^\/(supervisor|hr|accounting|manager)\/([^/]+)\/([^/]+)\/?$/);
  if (m) {
    var q = '?role=' + encodeURIComponent(m[1]) + '&token=' + encodeURIComponent(m[2]) + '&period=' + encodeURIComponent(m[3]);
    var newUrl = window.location.origin + basePath + q;
    if (window.location.href !== newUrl) window.location.replace(newUrl);
    return;
  }
  var parts = pathname.split('/').filter(Boolean);
  if (parts.length === 2 && parts[0] === 'e' && parts[1]) {
    window.location.replace(window.location.origin + basePath + '?code=' + encodeURIComponent(parts[1]));
  }
})();

var ADMIN_AUTH_SESSION_KEY = 'adora_admin_auth_session';
var ADMIN_SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24; // 24h

function isEmployeeMode() {
  var urlParams = new URLSearchParams(window.location.search);
  return urlParams.has('code');
}

function isAdminMode() {
  var urlParams = new URLSearchParams(window.location.search);
  var adminKey = urlParams.get('admin');
  var expectedKey = (typeof window !== 'undefined' && typeof window.getAdminSecretKey === 'function') ? window.getAdminSecretKey() : '';
  if (adminKey !== expectedKey) return false;
  try {
    var raw = localStorage.getItem(ADMIN_AUTH_SESSION_KEY);
    if (!raw) return false;
    var parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return false;
    var ts = Number(parsed.ts || 0);
    var email = String(parsed.email || '').trim().toLowerCase();
    if (!email || !ts) return false;
    if ((Date.now() - ts) > ADMIN_SESSION_MAX_AGE_MS) {
      localStorage.removeItem(ADMIN_AUTH_SESSION_KEY);
      return false;
    }
    return true;
  } catch (_) {
    return false;
  }
}

function isAdminLinkSubmitted() {
  try {
    var r = localStorage.getItem('adora_current_role');
    var p = localStorage.getItem('adora_current_period');
    if (!r || !p) return false;
    var lastApplied = (typeof window !== 'undefined' && window.lastAppliedAdminSubmitted) ? window.lastAppliedAdminSubmitted : {};
    if (typeof lastApplied === 'object' && lastApplied !== null && lastApplied[r] != null)
      return true;
    return !!localStorage.getItem('adora_admin_submitted_' + p + '_' + r);
  } catch (e) { return false; }
}

function initializeRoleBasedUI(role) {
  var isAdminRole = role && ['supervisor', 'hr', 'accounting', 'manager'].indexOf(role) >= 0;
  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = isAdminRole ? 'none' : 'flex';
  }

  var uploadBox = document.getElementById('uploadBox');
  if (uploadBox) {
    uploadBox.classList.add('hidden');
  }

  var dashboard = document.getElementById('dashboard');
  if (dashboard) {
    dashboard.classList.remove('hidden');
  }

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

  if (role === 'supervisor') {
    hideElementsForSupervisor();
  } else if (role === 'hr') {
    hideElementsForHR();
  } else if (role === 'accounting') {
    hideElementsForAccounting();
  } else if (role === 'manager') {
    hideElementsForManager();
    var rp = document.getElementById('reportsPage');
    if (rp) {
      var backBtn = rp.querySelector('button[onclick*="hideReportsPage"]');
      var codesBtn = rp.querySelector('button[onclick*="showEmployeeCodesModal"]');
      if (backBtn) backBtn.style.display = 'none';
      if (codesBtn) codesBtn.style.display = 'none';
    }
  } else {
    if (actionBtns) {
      actionBtns.style.display = 'flex';
      actionBtns.querySelectorAll('button').forEach(function (b) {
        b.style.removeProperty('display');
      });
    }
  }

  if (['supervisor', 'hr', 'accounting', 'manager'].indexOf(role) >= 0) {
    try {
      if (typeof history !== 'undefined' && history.pushState) {
        history.pushState({ adminRestricted: true }, '', window.location.href);
      }
      if (role !== 'manager' && role !== 'accounting') {
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
      }
    } catch (err) {}
  }

  try {
    var params = new URLSearchParams(window.location.search);
    if (params.get('reset_submitted') === '1') {
      var p = (params.get('period') || '').trim();
      if (p && role) localStorage.removeItem('adora_admin_submitted_' + p + '_' + role);
    }
  } catch (_) {}

  showRoleWelcomeMessage(role);

  if (typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted()) {
    setTimeout(function applySubmittedViewOnly() {
      document.querySelectorAll('.eval-input').forEach(function (el) { el.disabled = true; el.style.opacity = '0.7'; });
      document.querySelectorAll('.attendance-toggle').forEach(function (el) { el.disabled = true; el.style.opacity = '0.7'; });
      document.querySelectorAll('.attendance-days-input').forEach(function (el) { el.disabled = true; el.style.opacity = '0.7'; });
    }, 200);
    if (role === 'supervisor' || role === 'hr') {
      if (typeof window !== 'undefined') window.currentFilter = 'الكل';
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
  } else if (role === 'supervisor' && typeof window !== 'undefined' && window.branches && window.branches.size > 0) {
    var firstBranch = Array.from(window.branches).filter(function (b) { return b !== 'الكل'; })[0];
    if (firstBranch) {
      if (typeof window !== 'undefined') window.currentFilter = firstBranch;
      if (typeof updateFilters === 'function') updateFilters();
      if (typeof updateReportTitle === 'function') updateReportTitle();
      if (typeof updatePrintButtonText === 'function') updatePrintButtonText();
      if (typeof renderUI === 'function') renderUI(firstBranch);
    }
  }
}

function hideElementsForSupervisor() {
  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    actionBtns.querySelectorAll('button').forEach(function (b) {
      var onclick = b.getAttribute('onclick') || '';
      b.style.display = (onclick.indexOf('showConditionsModal') >= 0) ? '' : 'none';
    });
  }

  document.querySelectorAll('.attendance-toggle, .attendance-days-input').forEach(function(el) {
    el.style.display = 'none';
  });

  var reportsBtn = document.querySelector('[onclick*="showReportsPage"]');
  if (reportsBtn) reportsBtn.style.display = 'none';

  document.querySelectorAll('[onclick*="smartPrint"], [onclick*="printConditions"]').forEach(function(btn) {
    btn.style.display = 'none';
  });

  var closePeriodBtn = document.querySelector('[onclick*="showClosePeriodModal"]');
  if (closePeriodBtn) closePeriodBtn.style.display = 'none';

  document.querySelectorAll('input[type="text"]:not(.eval-input)').forEach(function(input) {
    input.disabled = true;
    input.style.opacity = '0.5';
  });
}

function hideElementsForHR() {
  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    actionBtns.querySelectorAll('button').forEach(function (b) {
      b.style.display = (b.getAttribute('onclick') || '').indexOf('showConditionsModal') >= 0 ? '' : 'none';
    });
  }

  document.querySelectorAll('.eval-input').forEach(function(el) {
    el.style.display = 'none';
  });

  var discountBtn = document.querySelector('[onclick*="showDiscountsModal"]');
  if (discountBtn) discountBtn.style.display = 'none';

  var reportsBtn = document.querySelector('[onclick*="showReportsPage"]');
  if (reportsBtn) reportsBtn.style.display = 'none';

  document.querySelectorAll('[onclick*="smartPrint"], [onclick*="printConditions"]').forEach(function(btn) {
    btn.style.display = 'none';
  });

  var closePeriodBtn = document.querySelector('[onclick*="showClosePeriodModal"]');
  if (closePeriodBtn) closePeriodBtn.style.display = 'none';

  document.querySelectorAll('input[type="text"]:not(.attendance-days-input)').forEach(function(input) {
    input.disabled = true;
    input.style.opacity = '0.5';
  });
}

function hideElementsForAccounting() {
  document.querySelectorAll('.eval-input').forEach(function(el) {
    el.style.display = 'none';
  });

  document.querySelectorAll('.attendance-toggle, .attendance-days-input').forEach(function(el) {
    el.style.display = 'none';
  });

  var discountBtn = document.querySelector('[onclick*="showDiscountsModal"]');
  if (discountBtn) discountBtn.style.display = 'none';

  var closePeriodBtn = document.querySelector('[onclick*="showClosePeriodModal"]');
  if (closePeriodBtn) closePeriodBtn.style.display = 'none';

  var adminBtn = document.querySelector('[onclick*="showAdminManagementModal"]');
  if (adminBtn) adminBtn.style.display = 'none';

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

  document.querySelectorAll('input[type="text"], input[type="checkbox"]').forEach(function(input) {
    input.disabled = true;
    input.style.opacity = '0.5';
  });

  setTimeout(function() {
    document.querySelectorAll('.col-name span[onclick]').forEach(function(span) {
      span.style.cursor = 'pointer';
      span.classList.add('hover:text-turquoise', 'transition-colors');
    });
  }, 200);
}

function hideElementsForManager() {
  var dash = document.getElementById('dashboard');
  if (dash) dash.classList.add('hidden');
  var uploadBox = document.getElementById('uploadBox');
  if (uploadBox) uploadBox.classList.add('hidden');

  var statsGrid = document.querySelector('.stats-grid-container');
  if (statsGrid) statsGrid.style.display = 'none';
  var branchFilters = document.getElementById('branchFilters');
  if (branchFilters) branchFilters.style.display = 'none';
  var clearArchivedBtn = document.getElementById('clearArchivedPeriodsBtn');
  if (clearArchivedBtn) clearArchivedBtn.style.display = 'none';
  var clearCumulativeBtn = document.getElementById('clearCumulativePointsBtn');
  if (clearCumulativeBtn) clearCumulativeBtn.style.display = 'none';

  var actionBtns = document.getElementById('actionBtns');
  if (actionBtns) {
    actionBtns.style.display = 'flex';
    actionBtns.style.removeProperty && actionBtns.style.removeProperty('display');
    actionBtns.querySelectorAll('button').forEach(function (b) {
      b.style.display = (b.getAttribute('onclick') || '').indexOf('showConditionsModal') >= 0 ? '' : 'none';
    });
  }

  var reportsPage = document.getElementById('reportsPage');
  if (reportsPage) {
    reportsPage.classList.remove('hidden');
    var rp = document.getElementById('reportsPage');
    if (rp) {
      var backBtn = rp.querySelector('button[onclick*="hideReportsPage"]');
      var codesBtn = rp.querySelector('button[onclick*="showEmployeeCodesModal"]');
      if (backBtn) backBtn.style.display = 'none';
      if (codesBtn) codesBtn.style.display = 'none';
    }
    setTimeout(function() {
      if (typeof switchReportsTab === 'function') switchReportsTab('statistics');
    }, 100);
    setTimeout(function() {
      if (typeof loadStatisticsPage === 'function') loadStatisticsPage();
    }, 350);
    setTimeout(function() {
      var tabsBar = document.getElementById('reportsTabsBar');
      if (tabsBar) tabsBar.style.display = 'none';
      var headerBlock = document.getElementById('currentPeriodStatsHeaderBlock');
      var cumulativeSection = document.getElementById('cumulativePointsSection');
      var archivedStatsSection = document.getElementById('archivedPeriodsSection');
      var statsContent = document.getElementById('statisticsReportsContent');
      var statsBlock = document.getElementById('currentPeriodStatsBlock');
      var clearCumulativeBtn = document.getElementById('clearCumulativePointsBtn');
      if (headerBlock) headerBlock.style.display = 'none';
      if (cumulativeSection) {
        cumulativeSection.style.display = '';
        if (clearCumulativeBtn) clearCumulativeBtn.style.display = 'none';
        var body = document.getElementById('cumulativePointsBody');
        if (body) body.style.display = '';
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
    }, 400);
  }
}

function showRoleWelcomeMessage(role) {
  if (role === 'admin') return;
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
