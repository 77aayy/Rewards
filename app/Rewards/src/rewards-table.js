// وحدة الجدول للمكافآت — تحديث الصفوف/التذييلات والإحصائيات (لا تعتمد على Firebase مباشرة).
// مصدر التعديلات: app/Rewards/. لا تعدّل النسخة في public/rewards يدوياً — npm run sync:rewards من مجلد app.
// تقرأ/تكتب من window.db، window.currentFilter، إلخ.

function updateFooterSummaryColspans() {
  var mainRow = document.querySelector('.main-header-row');
  if (!mainRow) return;
  var visibleCols = 0;
  mainRow.querySelectorAll('th').forEach(function(th) {
    if (th.offsetParent !== null && window.getComputedStyle(th).display !== 'none') visibleCols++;
  });
  var labelColspan = Math.max(1, visibleCols - 2);
  var totalLabel = document.getElementById('footerTotalLabel');
  var finalLabel = document.getElementById('footerFinalLabel');
  if (totalLabel) totalLabel.setAttribute('colspan', String(labelColspan));
  if (finalLabel) finalLabel.setAttribute('colspan', String(labelColspan));
  // جعل صف الشارات (badges-row) يمتد لآخر الجدول بنفس عدد الأعمدة
  var badgesRows = document.querySelectorAll('#mainTable tr.badges-row');
  badgesRows.forEach(function(tr) {
    var td = tr.querySelector('td');
    if (td && visibleCols > 0) td.setAttribute('colspan', String(visibleCols));
  });
}

function updateFooterTotals() {
  if (typeof getFooterTotals !== 'function') return;
  var t = getFooterTotals();
  var footEvalCountEl = document.getElementById('footEvalCount');
  var footBookingCountEl = document.getElementById('footBookingCount');
  var footFundEl = document.getElementById('footFund');
  var footNetEl = document.getElementById('footNet');
  var footNetNoEvalEl = document.getElementById('footNetNoEval');
  var footTotalNetEl = document.getElementById('footTotalNet');
  var statEmployeesEl = document.getElementById('statEmployees');
  var statBookingsEl = document.getElementById('statBookings');
  var statTotalEl = document.getElementById('statTotal');
  if (footEvalCountEl) footEvalCountEl.innerText = t.totalEval;
  if (footBookingCountEl) footBookingCountEl.innerText = t.statBookings;
  if (footFundEl) footFundEl.innerText = t.totalFund.toFixed(1);
  if (footNetEl) footNetEl.innerText = t.totalNet.toFixed(2);
  if (footNetNoEvalEl) footNetNoEvalEl.innerText = t.totalNetNoEval.toFixed(2);
  var footTotalFundEl = document.getElementById('footTotalFund');
  if (footTotalFundEl) footTotalFundEl.innerText = '';
  if (footTotalNetEl) footTotalNetEl.innerText = t.finalTotal.toFixed(2);
  if (statEmployeesEl) statEmployeesEl.innerText = t.statEmployees;
  if (statBookingsEl) statBookingsEl.innerText = t.statBookings;
  if (statTotalEl) statTotalEl.innerText = isNaN(t.finalTotal) || !isFinite(t.finalTotal) ? '0' : t.finalTotal.toFixed(0);
  if (typeof updateCommitmentBonusRow === 'function') updateCommitmentBonusRow();
  if (typeof loadCurrentPeriodStats === 'function') {
    var reportsPage = document.getElementById('reportsPage');
    var statisticsContent = document.getElementById('statisticsReportsContent');
    if (reportsPage && !reportsPage.classList.contains('hidden') && statisticsContent && !statisticsContent.classList.contains('hidden')) {
      loadCurrentPeriodStats();
      if (typeof populateEmployeePerformanceTable === 'function') populateEmployeePerformanceTable();
    }
  }
  if (window.adoraTransferMode) {
    updateBreakdownFooterTotals();
  }
  setTimeout(updateFooterSummaryColspans, 50);
}

function updateBreakdownFooterTotals() {
  if (!window.adoraTransferMode) return;
  var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
  if (!db || db.length === 0) return;

  var currentFilter = (typeof window !== 'undefined' && window.currentFilter !== undefined) ? window.currentFilter : 'الكل';
  var filtered = db;
  if (currentFilter !== 'الكل') {
    filtered = db.filter(function(e) { return e.branch === currentFilter; });
  }

  var processedNames = {};
  var totals = { staffCount: 0, counted: 0, reception: 0, booking: 0, morning: 0, evening: 0, night: 0, alertCount: 0, alertTotal: 0, vipRooms: {} };

  filtered.forEach(function(emp) {
    if (currentFilter === 'الكل') {
      if (processedNames[emp.name]) return;
      processedNames[emp.name] = true;
      var allBranches = db.filter(function(e) { return e.name === emp.name; });
      allBranches.forEach(function(e) {
        totals.staffCount += e._staffCount || 0;
        totals.counted += e._counted || 0;
        totals.reception += e._reception || 0;
        totals.booking += e._booking || 0;
        totals.morning += e._morning || 0;
        totals.evening += e._evening || 0;
        totals.night += e._night || 0;
        totals.alertCount += e._alertCount || 0;
        totals.alertTotal += e._alertTotal || 0;
        if (e._vipRooms) {
          Object.keys(e._vipRooms).forEach(function(k) {
            totals.vipRooms[k] = (totals.vipRooms[k] || 0) + (e._vipRooms[k] || 0);
          });
        }
      });
    } else {
      totals.staffCount += emp._staffCount || 0;
      totals.counted += emp._counted || 0;
      totals.reception += emp._reception || 0;
      totals.booking += emp._booking || 0;
      totals.morning += emp._morning || 0;
      totals.evening += emp._evening || 0;
      totals.night += emp._night || 0;
      totals.alertCount += emp._alertCount || 0;
      totals.alertTotal += emp._alertTotal || 0;
      if (emp._vipRooms) {
        Object.keys(emp._vipRooms).forEach(function(k) {
          totals.vipRooms[k] = (totals.vipRooms[k] || 0) + (emp._vipRooms[k] || 0);
        });
      }
    }
  });

  var el;
  el = document.getElementById('footStaffCount'); if (el) el.innerText = totals.staffCount;
  el = document.getElementById('footReception'); if (el) el.innerText = totals.reception;
  el = document.getElementById('footBooking'); if (el) el.innerText = totals.booking;
  el = document.getElementById('footMorning'); if (el) el.innerText = totals.morning;
  el = document.getElementById('footEvening'); if (el) el.innerText = totals.evening;
  el = document.getElementById('footNight'); if (el) el.innerText = totals.night;
  el = document.getElementById('footAlertCount'); if (el) el.innerText = totals.alertCount;
  el = document.getElementById('footAlertTotal'); if (el) el.innerText = totals.alertTotal > 0 ? Math.round(totals.alertTotal).toLocaleString('en-SA') : '—';

  var vipTotal = 0;
  Object.values(totals.vipRooms).forEach(function(v) { vipTotal += v; });
  el = document.getElementById('footVipRooms'); if (el) el.innerText = vipTotal || '—';

  document.querySelectorAll('#footStaffCount, #footReception, #footBooking, #footMorning, #footEvening, #footNight, #footAlertCount, #footAlertTotal').forEach(function(el) {
    el.style.display = '';
  });
  var footVip = document.getElementById('footVipRooms');
  if (footVip) {
    var hasVipCols = window.adoraTransferMode && window.adoraActiveVipRooms && window.adoraActiveVipRooms.length > 0;
    footVip.style.display = hasVipCols ? '' : 'none';
    if (hasVipCols) footVip.setAttribute('colspan', String(window.adoraActiveVipRooms.length));
  }
  var singleFoot = document.getElementById('footBookingCount');
  if (singleFoot) singleFoot.style.display = window.adoraTransferMode ? 'none' : '';
}

function updateEvalBooking(id, val, inputEl, shouldRender) {
  if (shouldRender === undefined) shouldRender = false;
  var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
  var item = db.find(function(i) { return i.id === id; });
  if (!item) return;
  var currentRole = localStorage.getItem('adora_current_role');
  if (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin') {
    if (typeof showToast === 'function') showToast('❌ غير مصرح لك بتعديل التقييمات', 'error');
    if (inputEl) inputEl.value = item.evaluationsBooking || 0;
    return;
  }
  var currentFilter = (typeof window !== 'undefined' && window.currentFilter !== undefined) ? window.currentFilter : 'الكل';
  if (currentFilter === 'الكل') {
    if (typeof showToast === 'function') showToast('❌ التعديل في الفروع فقط — الكل للعرض والتجميع', 'error');
    if (inputEl) inputEl.value = item.evaluationsBooking || 0;
    return;
  }
  var newVal = parseInt(val, 10) || 0;
  var oldVal = item.evaluationsBooking || 0;
  var empName = item.name;
  db.filter(function(i) { return i.name === empName; }).forEach(function(row) { row.evaluationsBooking = newVal; });
  if (typeof markLocalRewardsDirty === 'function') markLocalRewardsDirty();
  if (typeof logAdminAction === 'function' && currentRole) {
    logAdminAction(currentRole, 'update_eval_booking', { employeeName: item.name, employeeId: id, branch: item.branch, oldValue: oldVal, newValue: newVal });
  }
  try {
    localStorage.setItem('adora_rewards_db', JSON.stringify(db));
    if (typeof window !== 'undefined') window.db = db;
    var shouldSync = (currentRole !== 'supervisor' && currentRole !== 'hr') || (typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted());
    if (shouldSync && typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
  } catch (error) {
    console.error('❌ Error saving to localStorage:', error);
  }
  if (!shouldRender && typeof _scheduleLiveEvalIndicatorsRefresh === 'function') {
    _scheduleLiveEvalIndicatorsRefresh();
  }
  if (shouldRender) {
    if (window._evalNavActive) {
      window._evalNavActive = false;
      if (typeof _scheduleDeferredEvalRefresh === 'function') _scheduleDeferredEvalRefresh();
    } else if (typeof _tableEditSessionActive !== 'undefined' && _tableEditSessionActive) {
      if (typeof _markPendingTableRefreshAfterEdit === 'function') _markPendingTableRefreshAfterEdit();
    } else {
      if (typeof updateBadges === 'function') updateBadges();
      if (typeof _scheduleDeferredEvalRefresh === 'function') {
        _scheduleDeferredEvalRefresh();
      } else if (typeof renderUI === 'function' && typeof window !== 'undefined' && window.currentFilter !== undefined) {
        renderUI(window.currentFilter);
      }
    }
  }
}

function updateEvalGoogle(id, val, inputEl, shouldRender) {
  if (shouldRender === undefined) shouldRender = false;
  var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
  var item = db.find(function(i) { return i.id === id; });
  if (!item) return;
  var currentRole = localStorage.getItem('adora_current_role');
  if (currentRole && currentRole !== 'supervisor' && currentRole !== 'admin') {
    if (typeof showToast === 'function') showToast('❌ غير مصرح لك بتعديل التقييمات', 'error');
    if (inputEl) inputEl.value = item.evaluationsGoogle || 0;
    return;
  }
  var currentFilter = (typeof window !== 'undefined' && window.currentFilter !== undefined) ? window.currentFilter : 'الكل';
  if (currentFilter === 'الكل') {
    if (typeof showToast === 'function') showToast('❌ التعديل في الفروع فقط — الكل للعرض والتجميع', 'error');
    if (inputEl) inputEl.value = item.evaluationsGoogle || 0;
    return;
  }
  var newVal = parseInt(val, 10) || 0;
  var oldVal = item.evaluationsGoogle || 0;
  var empName = item.name;
  db.filter(function(i) { return i.name === empName; }).forEach(function(row) { row.evaluationsGoogle = newVal; });
  if (typeof markLocalRewardsDirty === 'function') markLocalRewardsDirty();
  if (typeof logAdminAction === 'function' && currentRole) {
    logAdminAction(currentRole, 'update_eval_google', { employeeName: item.name, employeeId: id, branch: item.branch, oldValue: oldVal, newValue: newVal });
  }
  try {
    localStorage.setItem('adora_rewards_db', JSON.stringify(db));
    if (typeof window !== 'undefined') window.db = db;
    var shouldSync = (currentRole !== 'supervisor' && currentRole !== 'hr') || (typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted());
    if (shouldSync && typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
  } catch (error) {
    console.error('❌ Error saving to localStorage:', error);
  }
  if (!shouldRender && typeof _scheduleLiveEvalIndicatorsRefresh === 'function') {
    _scheduleLiveEvalIndicatorsRefresh();
  }
  if (shouldRender) {
    if (window._evalNavActive) {
      window._evalNavActive = false;
      if (typeof _scheduleDeferredEvalRefresh === 'function') _scheduleDeferredEvalRefresh();
    } else if (typeof _tableEditSessionActive !== 'undefined' && _tableEditSessionActive) {
      if (typeof _markPendingTableRefreshAfterEdit === 'function') _markPendingTableRefreshAfterEdit();
    } else {
      if (typeof updateBadges === 'function') updateBadges();
      if (typeof _scheduleDeferredEvalRefresh === 'function') {
        _scheduleDeferredEvalRefresh();
      } else if (typeof renderUI === 'function' && typeof window !== 'undefined' && window.currentFilter !== undefined) {
        renderUI(window.currentFilter);
      }
    }
  }
}

function updateAttendanceDaysForBranch(empName, branchName, days, shouldRender) {
  if (shouldRender === undefined) shouldRender = true;
  var db = (typeof window !== 'undefined' && window.db) ? window.db : [];
  var currentFilter = (typeof window !== 'undefined' && window.currentFilter !== undefined) ? window.currentFilter : 'الكل';
  var currentRole = localStorage.getItem('adora_current_role');
  if (currentRole && currentRole !== 'hr' && currentRole !== 'admin') {
    if (shouldRender && typeof showToast === 'function') showToast('❌ غير مصرح لك بتعديل أيام الحضور', 'error');
    return;
  }
  if (currentFilter === 'الكل') {
    if (shouldRender && typeof showToast === 'function') showToast('❌ التعديل في الفروع فقط — الكل للعرض والتجميع', 'error');
    return;
  }
  days = Math.max(0, parseInt(days, 10) || 0);
  var employeesWithSameName = db.filter(function(emp) { return emp.name === empName; });
  var sharedMap = {};
  employeesWithSameName.forEach(function(emp) {
    if (emp.attendanceDaysPerBranch && typeof emp.attendanceDaysPerBranch === 'object') {
      Object.keys(emp.attendanceDaysPerBranch).forEach(function(b) {
        sharedMap[b] = emp.attendanceDaysPerBranch[b];
      });
    }
  });
  var oldValue = sharedMap[branchName] !== undefined ? (parseInt(sharedMap[branchName], 10) || 0) : 0;
  sharedMap[branchName] = days;
  var totalDays = Object.values(sharedMap).reduce(function(sum, d) { return sum + (parseInt(d, 10) || 0); }, 0);
  employeesWithSameName.forEach(function(emp) {
    emp.attendanceDaysPerBranch = sharedMap;
    emp.totalAttendanceDays = totalDays;
    emp.attendance26Days = totalDays >= 26;
  });
  if (typeof logAdminAction === 'function' && currentRole && shouldRender) {
    logAdminAction(currentRole, 'update_attendance_days', { employeeName: empName, branch: branchName, oldValue: oldValue, newValue: days });
  }
  try {
    localStorage.setItem('adora_rewards_db', JSON.stringify(db));
    if (typeof window !== 'undefined') window.db = db;
    var shouldSync = (currentRole !== 'hr' && currentRole !== 'supervisor') || (typeof isAdminLinkSubmitted === 'function' && isAdminLinkSubmitted());
    if (shouldSync && typeof syncLivePeriodToFirebase === 'function') syncLivePeriodToFirebase();
  } catch (error) {
    console.error('❌ Error saving to localStorage:', error);
  }
  if (shouldRender && typeof renderUI === 'function' && typeof window !== 'undefined' && window.currentFilter !== undefined) {
    renderUI(window.currentFilter);
  }
}
