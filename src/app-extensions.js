// === Admin Management Functions ===
let adminTokens = {}; // Structure: { periodId: { supervisor: {token, name, createdAt, active}, hr: {...}, accounting: {...}, manager: {...} } }
let currentPeriodId = null;

// Generate unique token
function generateAdminToken() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9) + Math.random().toString(36).substr(2, 9);
}

// Get current period ID (based on header period range أو من الرابط عند الدخول برابط إداري أو startDate بعد استعادة فترة مغلقة)
function getCurrentPeriodId() {
  if (typeof window !== 'undefined' && window.location && window.location.search) {
    const p = new URLSearchParams(window.location.search).get('period');
    if (p) return p;
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
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return periodText.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
}

// Load admin tokens from localStorage
function loadAdminTokens() {
  try {
    const saved = localStorage.getItem('adora_admin_tokens');
    if (saved) {
      adminTokens = JSON.parse(saved);
    }
  } catch (error) {
    console.error('❌ Error loading admin tokens:', error);
    adminTokens = {};
  }
}

// Save admin tokens to localStorage and mirror to Firebase (for links to work on other devices)
function saveAdminTokens() {
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

// التحقق من الرابط عبر Firebase عند فشل localStorage (ليعمل الرابط على جهاز الإداري المستلم)
async function tryValidateAdminAccessFromFirebase(role, token, periodId) {
  const st = (typeof window !== 'undefined' && window.storage);
  if (!st || typeof st.ref !== 'function') return false;
  try {
    const ref = st.ref('admin_tokens/' + periodId + '.json');
    const url = await ref.getDownloadURL();
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    const admin = data && data[role];
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
  } catch (e) {
    return false;
  }
}

// Initialize admin tokens for current period
function initializeAdminTokensForPeriod() {
  const periodId = getCurrentPeriodId();
  currentPeriodId = periodId;
  
  if (!adminTokens[periodId]) {
    adminTokens[periodId] = {
      supervisor: {
        token: generateAdminToken(),
        name: '',
        createdAt: new Date().toISOString(),
        active: true
      },
      hr: {
        token: generateAdminToken(),
        name: '',
        createdAt: new Date().toISOString(),
        active: true
      },
      accounting: {
        token: generateAdminToken(),
        name: '',
        createdAt: new Date().toISOString(),
        active: true
      },
      manager: {
        token: generateAdminToken(),
        name: '',
        createdAt: new Date().toISOString(),
        active: true
      }
    };
    saveAdminTokens();
  }
}

// Show admin management modal
function showAdminManagementModal() {
  const modal = document.getElementById('adminManagementModal');
  if (!modal) return;
  
  initializeAdminTokensForPeriod();
  saveAdminTokens(); // يرفع الـ tokens إلى Firebase ليعمل الرابط على جهاز الإداري المستلم
  populateAdminManagementModal();
  
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
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

// Populate admin management modal
function populateAdminManagementModal() {
  const container = document.getElementById('adminManagementContent');
  if (!container) return;
  
  const periodId = getCurrentPeriodId();
  const tokens = adminTokens[periodId] || {};
  
  const roles = [
    { key: 'supervisor', label: 'المشرف', icon: '👨‍💼', description: 'إدخال تقييمات بوكينج وجوجل' },
    { key: 'hr', label: 'HR', icon: '👔', description: 'تفعيل 26 يوم وإدخال أيام الحضور' },
    { key: 'accounting', label: 'الحسابات', icon: '💰', description: 'عرض التقارير والطباعة' },
    { key: 'manager', label: 'المدير العام', icon: '👑', description: 'عرض الإحصائيات فقط' }
  ];
  
  let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
  
  roles.forEach(role => {
    const admin = tokens[role.key] || { token: generateAdminToken(), name: '', createdAt: new Date().toISOString(), active: true };
    const baseUrl = window.location.origin + window.location.pathname;
    const nameParam = (admin.name || '').trim() ? '&name=' + encodeURIComponent((admin.name || '').trim()) : '';
    const link = `${baseUrl}?role=${role.key}&token=${admin.token}&period=${periodId}${nameParam}`;
    
    html += `
      <div class="glass p-4 rounded-xl border border-purple-400/30">
        <div class="flex items-center gap-2 mb-3">
          <span class="text-2xl">${role.icon}</span>
          <div>
            <h3 class="text-lg font-bold text-purple-400">${role.label}</h3>
            <p class="text-xs text-gray-400">${role.description}</p>
          </div>
        </div>
        <div class="mb-3">
          <label class="block text-sm font-bold text-gray-300 mb-1">اسم الإداري (اختياري):</label>
          <input type="text" id="adminName_${role.key}" value="${admin.name || ''}" 
            placeholder="أدخل اسم الإداري..." 
            class="w-full px-3 py-2 rounded-lg text-sm text-white bg-white/10 border border-white/20 focus:outline-none focus:border-purple-400"
            onchange="updateAdminName('${role.key}', this.value)">
        </div>
        <div class="mb-3">
          <label class="block text-sm font-bold text-gray-300 mb-1">الرابط:</label>
          <div class="flex gap-2">
            <input type="text" id="adminLink_${role.key}" value="${link}" readonly
              class="flex-1 px-3 py-2 rounded-lg text-xs text-gray-300 bg-white/5 border border-white/10">
            <button onclick="copyAdminLink('${role.key}')" 
              class="px-3 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-bold">
              📋 نسخ
            </button>
          </div>
        </div>
        <div class="flex gap-2">
          <button onclick="regenerateAdminToken('${role.key}')" 
            class="flex-1 px-3 py-2 bg-yellow-500/20 text-yellow-400 rounded-lg hover:bg-yellow-500/30 transition-colors text-sm font-bold">
            🔄 إعادة توليد
          </button>
          <button onclick="testAdminLink('${role.key}')" 
            class="flex-1 px-3 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors text-sm font-bold">
            🔗 اختبار
          </button>
        </div>
      </div>
    `;
  });
  
  html += '</div>';
  container.innerHTML = html;
}

// Update admin name
function updateAdminName(role, name) {
  const periodId = getCurrentPeriodId();
  if (!adminTokens[periodId]) {
    initializeAdminTokensForPeriod();
  }
  if (!adminTokens[periodId][role]) {
    adminTokens[periodId][role] = { token: generateAdminToken(), name: '', createdAt: new Date().toISOString(), active: true };
  }
  adminTokens[periodId][role].name = name;
  saveAdminTokens();
  var inp = document.getElementById('adminLink_' + role);
  if (inp) {
    var base = window.location.origin + window.location.pathname;
    var t = adminTokens[periodId][role].token;
    var n = (name || '').trim();
    inp.value = base + '?role=' + encodeURIComponent(role) + '&token=' + encodeURIComponent(t) + '&period=' + encodeURIComponent(periodId) + (n ? '&name=' + encodeURIComponent(n) : '');
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

// Copy admin link
function copyAdminLink(role) {
  const input = document.getElementById(`adminLink_${role}`);
  if (input) {
    input.select();
    document.execCommand('copy');
    showToast('✅ تم نسخ الرابط', 'success');
  }
}

// Regenerate admin token
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
  if (!admin) return;
  
  const baseUrl = window.location.origin + window.location.pathname;
  const link = `${baseUrl}?role=${role}&token=${admin.token}&period=${periodId}`;
  window.open(link, '_blank');
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
      logs = JSON.parse(saved);
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
        discounts: discounts || [], // Include discounts in archived period
        discountTypes: discountTypes || [] // Include discount types in archived period
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
        console.log('✅ Period saved to localStorage (Firebase fallback)');
      }
    } else {
      // Fallback: Save to localStorage
      console.warn('⚠️ Firebase Storage not available, using localStorage only');
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
      console.log('✅ Period saved to localStorage (Firebase not available)');
    }
    
    showToast('✅ تم إغلاق الفترة بنجاح', 'success');
    returnToUpload();
    closeClosePeriodModal();
    
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
      const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
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
            const url = `${window.location.origin}${window.location.pathname}?code=${code}`;
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
  
  // Populate admin links
  if (adminLinksList && typeof getCurrentPeriodId === 'function') {
    const periodId = getCurrentPeriodId();
    const tokens = adminTokens[periodId] || {};
    
    const roles = [
      { key: 'supervisor', label: 'المشرف', icon: '👨‍💼' },
      { key: 'hr', label: 'HR', icon: '👔' },
      { key: 'accounting', label: 'الحسابات', icon: '💰' },
      { key: 'manager', label: 'المدير العام', icon: '👑' }
    ];
    
    let html = '<div class="grid grid-cols-1 md:grid-cols-2 gap-4">';
    roles.forEach(role => {
      const admin = tokens[role.key];
      if (admin) {
        const baseUrl = window.location.origin + window.location.pathname;
        const link = `${baseUrl}?role=${role.key}&token=${admin.token}&period=${periodId}`;
        html += `
          <div class="glass p-4 rounded-xl border border-purple-400/30">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-2xl">${role.icon}</span>
              <h4 class="text-lg font-bold text-purple-400">${role.label}</h4>
              ${admin.name ? `<span class="text-xs text-gray-400">(${admin.name})</span>` : ''}
            </div>
            <div class="mb-3">
              <div class="flex gap-2">
                <input type="text" value="${link}" readonly
                  class="flex-1 px-3 py-2 rounded-lg text-xs text-gray-300 bg-white/5 border border-white/10">
                <button onclick="copyAdminLinkFromCodes('${role.key}')" 
                  class="px-3 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-bold">
                  📋
                </button>
              </div>
            </div>
            <a href="${link}" target="_blank" class="block text-center px-3 py-2 bg-purple-500/20 text-purple-400 rounded-lg hover:bg-purple-500/30 transition-colors text-sm font-bold">
              🔗 فتح الرابط
            </a>
          </div>
        `;
      }
    });
    html += '</div>';
    adminLinksList.innerHTML = html;
  }
  
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
}

function copyAdminLinkFromCodes(role) {
  const periodId = getCurrentPeriodId();
  const admin = adminTokens[periodId]?.[role];
  if (!admin) return;
  
  const baseUrl = window.location.origin + window.location.pathname;
  const link = `${baseUrl}?role=${role}&token=${admin.token}&period=${periodId}`;
  
  navigator.clipboard.writeText(link).then(() => {
    showToast('✅ تم نسخ الرابط', 'success');
  }).catch(() => {
    // Fallback
    const input = document.createElement('input');
    input.value = link;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('✅ تم نسخ الرابط', 'success');
  });
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
                const url = await itemRef.getDownloadURL();
                const response = await fetch(url);
                if (response.ok) {
                  const data = await response.json();
                  periods.push(data);
                } else {
                  console.warn(`⚠️ Failed to fetch period: ${response.status}`);
                }
              } catch (itemError) {
                console.warn('⚠️ Error fetching period item:', itemError.message);
                // Continue with other items
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
        periods = JSON.parse(saved);
      }
    }
    
    periods.sort((a, b) => new Date(b.closedAt) - new Date(a.closedAt));
    
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
      try {
        const storageRef = storage.ref(`periods/${periodId}.json`);
        
        // Check if getDownloadURL() method exists
        if (typeof storageRef.getDownloadURL === 'function') {
          const url = await storageRef.getDownloadURL();
          const response = await fetch(url);
          
          if (response.ok) {
            periodData = await response.json();
            console.log('✅ Period loaded from Firebase Storage');
          } else {
            console.warn(`⚠️ Failed to fetch period: ${response.status}`);
            throw new Error(`HTTP ${response.status}`);
          }
        } else {
          console.warn('⚠️ getDownloadURL() method not available');
          throw new Error('getDownloadURL method not available');
        }
      } catch (error) {
        console.error('❌ Firebase Storage load error:', error);
        console.error('Error details:', {
          code: error.code,
          message: error.message
        });
        console.log('⚠️ Falling back to localStorage');
      }
    } else {
      console.log('⚠️ Firebase Storage not available, using localStorage');
    }
    
    if (!periodData) {
      const saved = localStorage.getItem('adora_archived_periods');
      if (saved) {
        const periods = JSON.parse(saved);
        periodData = periods.find(p => p.periodId === periodId);
      }
    }
    
    if (!periodData) {
      showToast('❌ الفترة غير موجودة', 'error');
      return;
    }
    
    document.getElementById('archivedPeriodText').textContent = periodData.periodText || periodId;
    document.getElementById('archivedClosedAt').textContent = new Date(periodData.closedAt).toLocaleDateString('ar-SA');
    document.getElementById('archivedPeriodInfo').classList.remove('hidden');
    
    db = periodData.data.db || [];
    branches = new Set(periodData.data.branches || []);
    currentEvalRate = periodData.data.evalRate || 20;
    reportStartDate = periodData.data.startDate || null;
    employeeCodesMap = periodData.data.employeeCodes || {};
    // Restore discounts and discount types from archived period
    if (periodData.data.discounts) {
      discounts = periodData.data.discounts;
      saveDiscounts();
    }
    if (periodData.data.discountTypes) {
      discountTypes = periodData.data.discountTypes;
      saveDiscountTypes();
    }
    
    populateArchivedReportsGrid();
    
    showToast('✅ تم تحميل الفترة بنجاح', 'success');
    
  } catch (error) {
    console.error('❌ Error loading archived period:', error);
    showToast('❌ خطأ في تحميل الفترة: ' + error.message, 'error');
  }
}

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
        showBranchSelectionForReport(name, employees);
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
          // Restore data temporarily
          const originalDb = db;
          const originalEmployeeCodes = employeeCodesMap;
          
          db = latestPeriod.data.db || [];
          employeeCodesMap = latestPeriod.data.employeeCodes || {};
          
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
              return;
            } else {
              // Single branch - show report directly
              showEmployeeReport(employee.id);
              document.getElementById('dashboard')?.classList.add('hidden');
              document.getElementById('uploadBox')?.classList.add('hidden');
              document.getElementById('actionBtns').style.display = 'none';
              const header = document.querySelector('header');
              if (header) header.style.display = 'none';
              showToast('✅ تم تحميل التقرير', 'success');
              
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

// Register Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then(reg => console.log('✅ Service Worker registered'))
      .catch(err => console.error('❌ Service Worker registration failed:', err));
  });
}

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
    } else if (adminKey === 'ayman5255') {
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
function loadDiscountTypes() {
  try {
    const defaultTypes = (typeof window !== 'undefined' && window.DEFAULT_DISCOUNT_CLAUSES_55) ? window.DEFAULT_DISCOUNT_CLAUSES_55 : [];
    
    const saved = localStorage.getItem('adora_rewards_discountTypes');
    if (saved) {
      const savedTypes = JSON.parse(saved);
      discountTypes = [...defaultTypes];
      savedTypes.forEach(function (type) {
        if (type && !defaultTypes.includes(type) && !discountTypes.includes(type)) {
          discountTypes.push(type);
        }
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

// Get total discount amount for employee (sum of discounts from all branches)
// This is used in "الكل" view to show total discount
function getTotalDiscountForEmployee(employeeName, netBeforeDiscounts = null) {
  // Ensure discounts is loaded
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  const currentDiscounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  if (!currentDiscounts || currentDiscounts.length === 0) return 0;
  
  // Get all discounts for this employee
  const employeeDiscounts = currentDiscounts.filter(d => d.employeeName === employeeName);
  if (employeeDiscounts.length === 0) return 0;
  
  // Get all branches where this employee exists
  const allEmpBranches = db.filter(e => e.name === employeeName);
  if (allEmpBranches.length === 0) return 0;
  
  // Calculate discount for each branch separately, then sum them
  let totalDiscount = 0;
  allEmpBranches.forEach(emp => {
    // Calculate net for this branch (before discounts)
    const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
    const evBooking = emp.evaluationsBooking || 0;
    const evGoogle = emp.evaluationsGoogle || 0;
    const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
    const fund = gross * 0.15;
    let branchNet = gross - fund;
    
    // Add attendance bonus if applicable
    const attendance26Days = emp.attendance26Days === true;
    const attendanceBonus = attendance26Days ? branchNet * 0.25 : 0;
    branchNet = branchNet + attendanceBonus;
    
    // Calculate excellence and commitment bonuses for this branch
    // (simplified - we'll use the bonuses from calcStats if available)
    // For now, just use branchNet as base
    
    // Apply discount to this branch's net
    const branchDiscount = employeeDiscounts.reduce((sum, discount) => {
      return sum + (branchNet * (discount.discountPercentage / 100));
    }, 0);
    
    totalDiscount += branchDiscount;
  });
  
  return totalDiscount;
}

// Get discount details for employee (for display)
function getDiscountDetailsForEmployee(employeeName) {
  // Ensure discounts is loaded
  if (typeof window === 'undefined' || !window.discounts) {
    loadDiscounts();
  }
  const currentDiscounts = (typeof window !== 'undefined' && window.discounts) ? window.discounts : [];
  if (!currentDiscounts || currentDiscounts.length === 0) return [];
  
  return currentDiscounts.filter(d => d.employeeName === employeeName);
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
      return '<div class="p-3 rounded-lg border border-white/10 bg-white/5">' +
        '<div class="font-bold text-red-400">سبب الخصم: ' + reason + '</div>' +
        '<div class="text-gray-300 mt-1">التاريخ: ' + eventDate + '</div>' +
        '<div class="text-gray-300">النسبة: ' + (isNaN(pct) ? '—' : pct + '%') + '</div>' +
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
  const aggregatedFund = aggregatedGross * 0.15;
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
    const fund = gross * 0.15;
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
  
  // Create discount object
  const discount = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    employeeName: employeeName,
    discountType: discountType,
    discountPercentage: discountPercentage,
    eventDate: eventDate, // تاريخ الحدث
    appliedAt: new Date().toISOString() // تاريخ إضافة الخصم
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
  Object.keys(discountsByEmployee).sort().forEach(employeeName => {
    const employeeDiscounts = discountsByEmployee[employeeName];
    // Calculate total discount from all branches (each branch separately)
    const totalDiscountAmount = typeof getTotalDiscountForEmployee === 'function' 
      ? getTotalDiscountForEmployee(employeeName)
      : 0;
    // Calculate aggregated net for display
    const aggregatedNet = calculateAggregatedNetForEmployee(employeeName);
    
    html += `
      <div class="glass p-4 rounded-xl border border-white/20">
        <div class="flex justify-between items-start mb-2">
          <div>
            <h4 class="text-white font-bold">${employeeName}</h4>
            <p class="text-sm text-gray-400">الصافي المجمع: ${aggregatedNet.toFixed(2)} ريال</p>
          </div>
          <span class="text-red-400 font-bold">-${totalDiscountAmount.toFixed(2)} ريال</span>
        </div>
        <div class="space-y-2 mt-3">
          ${employeeDiscounts.map(discount => {
            const eventDate = discount.eventDate ? new Date(discount.eventDate + 'T00:00:00').toLocaleDateString('ar-SA') : '-';
            return `
            <div class="flex justify-between items-center bg-white/5 p-2 rounded">
              <div>
                <span class="text-sm text-gray-300">${discount.discountType}</span>
                <span class="text-xs text-gray-500 mr-2">(${discount.discountPercentage}%)</span>
                ${discount.eventDate ? `<span class="text-xs text-gray-400 block mt-1">📅 ${eventDate}</span>` : ''}
              </div>
              <button onclick="deleteDiscount('${discount.id}')" class="text-red-400 hover:text-red-300 text-sm font-bold px-2 py-1 rounded hover:bg-red-500/20 transition-colors">
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
  
  console.log('✅ loadStatisticsPage completed');
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
  
  // Get unique employees (aggregate duplicates like "الكل" view)
  const uniqueEmployees = new Map();
  currentDb.forEach(emp => {
    const key = emp.name;
    if (!uniqueEmployees.has(key)) {
      uniqueEmployees.set(key, []);
    }
    uniqueEmployees.get(key).push(emp);
  });
  
  // Per-employee aggregates for "أوائل" cards
  const employeeAggregates = [];
  uniqueEmployees.forEach((employees, name) => {
    let totalCount = 0;
    let totalEvalBooking = 0;
    let totalEvalGoogle = 0;
    let totalNet = 0;
    let hasAttendance26 = false;
    
    employees.forEach(emp => {
      totalCount += emp.count || 0;
      totalEvalBooking += emp.evaluationsBooking || 0;
      totalEvalGoogle += emp.evaluationsGoogle || 0;
      if (emp.attendance26Days === true) hasAttendance26 = true;
      
      const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
      const evBooking = emp.evaluationsBooking || 0;
      const evGoogle = emp.evaluationsGoogle || 0;
      const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
      const fund = gross * 0.15;
      let net = gross - fund;
      const attendance26Days = emp.attendance26Days === true;
      const attendanceBonus = attendance26Days ? net * 0.25 : 0;
      net = net + attendanceBonus;
      if (typeof getDiscountForEmployeeInBranch === 'function') {
        const discount = getDiscountForEmployeeInBranch(emp.name, net);
        net = Math.max(0, net - discount);
      }
      totalNet += net;
    });
    
    employeeAggregates.push({
      name,
      totalCount,
      totalEvalBooking,
      totalEvalGoogle,
      totalNet,
      hasAttendance26
    });
  });
  
  // أوائل: أكثر حجوزات، أكثر تقييم بوكينج، أكثر خرائط، أكثر التزاماً 26 يوم، أكثر صافي
  const topBookings = employeeAggregates.length ? employeeAggregates.reduce((a, b) => (b.totalCount > a.totalCount ? b : a)) : null;
  const topEvalBooking = employeeAggregates.length ? employeeAggregates.reduce((a, b) => (b.totalEvalBooking > a.totalEvalBooking ? b : a)) : null;
  const topEvalGoogle = employeeAggregates.length ? employeeAggregates.reduce((a, b) => (b.totalEvalGoogle > a.totalEvalGoogle ? b : a)) : null;
  const with26 = employeeAggregates.filter(e => e.hasAttendance26);
  const topAttendance26 = with26.length ? with26.reduce((a, b) => (b.totalNet > a.totalNet ? b : a)) : null;
  const topNet = employeeAggregates.length ? employeeAggregates.reduce((a, b) => (b.totalNet > a.totalNet ? b : a)) : null;
  
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
  
  container.innerHTML = `
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثر الموظفين حجوزات</div>
      <div class="text-lg font-black text-turquoise">${topBookings ? topBookings.name : '—'}</div>
      <div class="text-sm text-gray-300">${topBookings ? fmt(topBookings.totalCount) + ' حجز' : ''}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم تقييمات بوكينج</div>
      <div class="text-lg font-black text-turquoise">${topEvalBooking ? topEvalBooking.name : '—'}</div>
      <div class="text-sm text-gray-300">${topEvalBooking ? fmt(topEvalBooking.totalEvalBooking) + ' تقييم' : ''}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم تقييمات خرائط</div>
      <div class="text-lg font-black text-turquoise">${topEvalGoogle ? topEvalGoogle.name : '—'}</div>
      <div class="text-sm text-gray-300">${topEvalGoogle ? fmt(topEvalGoogle.totalEvalGoogle) + ' تقييم' : ''}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم التزاماً في الحضور (26 يوم+)</div>
      <div class="text-lg font-black text-turquoise">${topAttendance26 ? topAttendance26.name : '—'}</div>
    </div>
    <div class="glass p-4 rounded-xl border border-turquoise/30">
      <div class="text-sm text-gray-400 mb-1">أكثرهم حصولاً على صافي</div>
      <div class="text-lg font-black text-turquoise">${topNet ? topNet.name : '—'}</div>
      <div class="text-sm text-green-400">${topNet ? fmt(topNet.totalNet) + ' ريال' : ''}</div>
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

/** عند الضغط على اسم موظف من صفحة الإحصائيات: فتح التقرير (أو اختيار الفرع إن كان متكرراً) */
function openEmployeeReportFromStats(empName, empId, isDuplicate) {
  if (typeof window.handleEmployeeNameClick === 'function') {
    window.handleEmployeeNameClick(empName, empId || '', !!isDuplicate);
  } else if (typeof window.showEmployeeReport === 'function' && empId) {
    window.showEmployeeReport(empId);
  }
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
  
  // حساب مستوى الحجوزات، التقييمات، الحضور واستخراج أسباب التقييم وعدد النجوم (1–5)
  function getRatingDetails(emp) {
    const count = emp.count || 0;
    const totalEval = (emp.evalBooking || 0) + (emp.evalGoogle || 0);
    const has26 = !!emp.hasAttendance26;
    let bookingsLabel = 'عدد حجوزاته قليل';
    if (count >= 100) bookingsLabel = 'عدد حجوزاته عالي';
    else if (count >= 50) bookingsLabel = 'عدد حجوزاته جيد';
    else if (count >= 20) bookingsLabel = 'عدد حجوزاته متوسط';
    let evalLabel = 'تقييماته قليلة';
    if (totalEval >= 10) evalLabel = 'تقييماته جيدة';
    else if (totalEval >= 3) evalLabel = 'تقييماته متوسطة';
    const attLabel = has26 ? 'ملتزم في الحضور (26 يوم وأكثر)' : 'حضوره أقل من 26 يوم';
    let stars = 1;
    let level = 'سيئ';
    if (count >= 50 && totalEval >= 5 && has26) {
      stars = count >= 100 && totalEval >= 10 ? 5 : 4;
      level = stars === 5 ? 'ممتاز' : 'جيد جداً';
    } else if (count >= 20 || totalEval >= 3 || has26) {
      stars = 3;
      level = 'جيد';
    } else if (count >= 10 || totalEval >= 1) {
      stars = 2;
      level = 'متوسط';
    }
    const reasons = `${bookingsLabel}، ${evalLabel}، ${attLabel} → ${level}`;
    return { stars, level, reasons, ratingColor: stars >= 4 ? 'text-green-400' : stars >= 3 ? 'text-yellow-400' : 'text-red-400' };
  }

  // Calculate aggregated stats for each employee
  uniqueEmployees.forEach((employees, name) => {
    const isDuplicate = nameCounts[name] > 1;
    
    let totalCount = 0;
    let totalEvalBooking = 0;
    let totalEvalGoogle = 0;
    let totalNet = 0;
    let hasAttendance26 = false;
    let branches = [];
    
    employees.forEach(emp => {
      totalCount += emp.count || 0;
      totalEvalBooking += emp.evaluationsBooking || 0;
      totalEvalGoogle += emp.evaluationsGoogle || 0;
      if (emp.attendance26Days === true) hasAttendance26 = true;
      
      const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
      const evBooking = emp.evaluationsBooking || 0;
      const evGoogle = emp.evaluationsGoogle || 0;
      const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
      const fund = gross * 0.15;
      let net = gross - fund;
      const attendance26Days = emp.attendance26Days === true;
      const attendanceBonus = attendance26Days ? net * 0.25 : 0;
      net = net + attendanceBonus;
      if (typeof getDiscountForEmployeeInBranch === 'function') {
        const discount = getDiscountForEmployeeInBranch(emp.name, net);
        net = Math.max(0, net - discount);
      }
      totalNet += net;
      if (!branches.includes(emp.branch)) {
        branches.push(emp.branch);
      }
    });
    
    const totalEval = totalEvalBooking + totalEvalGoogle;
    const performanceScore = totalCount + (totalEvalBooking * 2) + totalEvalGoogle + (totalNet / 100);
    const { stars, level, reasons, ratingColor } = getRatingDetails({
      count: totalCount,
      evalBooking: totalEvalBooking,
      evalGoogle: totalEvalGoogle,
      hasAttendance26
    });
    
    const firstEmpId = employees[0] && employees[0].id ? employees[0].id : '';
    employeesData.push({
      name: name,
      branches: branches.join(' - '),
      count: totalCount,
      evalBooking: totalEvalBooking,
      evalGoogle: totalEvalGoogle,
      totalEval: totalEval,
      net: totalNet,
      performanceScore: performanceScore,
      isDuplicate: isDuplicate,
      hasAttendance26,
      stars,
      level,
      reasons,
      ratingColor,
      reportEmpId: firstEmpId
    });
  });
  
  // Sort by performance score (descending)
  employeesData.sort((a, b) => b.performanceScore - a.performanceScore);
  
  // Generate table rows: صف بيانات + صف أسباب التقييم تحت كل موظف
  let html = '';
  const starChar = '⭐';
  function escForOnclick(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }
  employeesData.forEach((emp, index) => {
    const starsHtml = starChar.repeat(emp.stars);
    const nameEsc = escForOnclick(emp.name);
    const idEsc = escForOnclick(emp.reportEmpId);
    const onclickReport = `openEmployeeReportFromStats('${nameEsc}','${idEsc}',${!!emp.isDuplicate})`;
    html += `
      <tr class="border-b border-white/10 hover:bg-white/5">
        <td class="p-3 text-center font-bold text-turquoise">${index + 1}</td>
        <td class="p-3 text-right font-bold text-white"><span onclick="${onclickReport}" class="cursor-pointer hover:text-turquoise transition-colors" title="اضغط لعرض التقرير">${emp.name}${emp.isDuplicate ? ' <span class="text-xs text-gray-400">(متكرر)</span>' : ''}</span></td>
        <td class="p-3 text-center text-gray-300 text-xs">${emp.branches}</td>
        <td class="p-3 text-center font-bold text-white">${emp.count}</td>
        <td class="p-3 text-center text-gray-300">
          <span class="text-blue-400">${emp.evalBooking}</span> / <span class="text-purple-400">${emp.evalGoogle}</span>
          <div class="text-xs text-gray-400">(${emp.totalEval} إجمالي)</div>
        </td>
        <td class="p-3 text-center font-bold text-green-400">${emp.net.toFixed(2)} ريال</td>
        <td class="p-3 text-center">
          <span class="font-bold ${emp.ratingColor}" title="${emp.level}">${starsHtml}</span>
          <div class="text-xs text-gray-400">${emp.level}</div>
        </td>
      </tr>
      <tr class="border-b border-white/5 bg-white/5">
        <td colspan="7" class="p-3 text-right text-sm text-gray-400">
          <span class="text-turquoise font-medium">أسباب التقييم:</span> ${emp.reasons}
        </td>
      </tr>
    `;
  });
  
  if (html === '') {
    html = '<tr><td colspan="7" class="p-4 text-center text-gray-400">لا توجد بيانات</td></tr>';
  }
  
  tbody.innerHTML = html;
}

async function loadArchivedStatsPeriodsList() {
  const select = document.getElementById('archivedStatsPeriodSelect');
  const archivedPeriodsContainer = document.getElementById('archivedPeriodsStatsContainer');
  if (!select && !archivedPeriodsContainer) return;
  
  if (select) {
    select.innerHTML = '<option value="">-- اختر فترة --</option>';
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
                const url = await itemRef.getDownloadURL();
                const response = await fetch(url);
                if (response.ok) {
                  const data = await response.json();
                  periods.push(data);
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
        periods = JSON.parse(saved);
      }
    }
    
    periods.sort((a, b) => new Date(b.closedAt || b.closedAt) - new Date(a.closedAt || a.closedAt));
    
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
        
        // Create period card
        const periodCard = document.createElement('div');
        periodCard.className = 'glass p-6 rounded-xl border border-turquoise/30 mb-6';
        periodCard.innerHTML = `
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-lg font-bold text-turquoise">${periodText}</h4>
            <span class="text-sm text-gray-400">تاريخ الإغلاق: ${closedAt}</span>
          </div>
          <div id="archivedPeriodStats_${periodId}" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div class="glass p-4 rounded-xl border border-turquoise/30">
              <div class="text-sm text-gray-400 mb-1">جاري التحميل...</div>
            </div>
          </div>
          <div id="archivedPeriodTable_${periodId}">
            <!-- Table will be loaded here -->
          </div>
        `;
        archivedPeriodsContainer.appendChild(periodCard);
        
        // Load stats for this period
        loadArchivedPeriodStatsForDisplay(periodId, period);
      }
    }
  } catch (error) {
    console.error('❌ Error loading archived periods:', error);
  }
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
    
    if (!periodDataToUse || !periodDataToUse.data) {
      const container = document.getElementById(`archivedPeriodStats_${periodId}`);
      if (container) {
        container.innerHTML = '<div class="col-span-4 text-center text-gray-400">لا توجد بيانات</div>';
      }
      return;
    }
    
    // Display statistics
    const archivedData = periodDataToUse.data.db || [];
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
    
    // Populate employee performance table for this period
    const tableContainer = document.getElementById(`archivedPeriodTable_${periodId}`);
    if (tableContainer) {
      populateArchivedEmployeePerformanceTableForPeriod(archivedData, periodId);
    }
  } catch (error) {
    console.error(`❌ Error loading archived period stats for ${periodId}:`, error);
    const container = document.getElementById(`archivedPeriodStats_${periodId}`);
    if (container) {
      container.innerHTML = '<div class="col-span-4 text-center text-red-400">خطأ في تحميل البيانات</div>';
    }
  }
}

// Populate archived employee performance table for a specific period
function populateArchivedEmployeePerformanceTableForPeriod(employees, periodId) {
  const tableContainer = document.getElementById(`archivedPeriodTable_${periodId}`);
  if (!tableContainer) return;
  
  if (!employees || employees.length === 0) {
    tableContainer.innerHTML = '<p class="text-gray-400 text-center py-4">لا توجد بيانات</p>';
    return;
  }
  
  // Similar logic to populateArchivedEmployeePerformanceTable but for specific period
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
      const fund = gross * 0.15;
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
              <th class="p-2 text-center font-bold text-turquoise text-xs">التقييم</th>
            </tr>
          </thead>
          <tbody>
  `;
  
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
        <td class="p-2 text-center font-bold text-turquoise text-xs">${index + 1}</td>
        <td class="p-2 text-right font-bold text-white text-xs">${emp.name}${emp.isDuplicate ? ' <span class="text-[10px] text-gray-400">(متكرر)</span>' : ''}</td>
        <td class="p-2 text-center text-gray-300 text-[10px]">${emp.branches}</td>
        <td class="p-2 text-center font-bold text-white text-xs">${emp.count}</td>
        <td class="p-2 text-center text-gray-300 text-xs">
          <span class="text-blue-400">${emp.evalBooking}</span> / <span class="text-purple-400">${emp.evalGoogle}</span>
        </td>
        <td class="p-2 text-center font-bold text-green-400 text-xs">${emp.net.toFixed(2)} ريال</td>
        <td class="p-2 text-center">
          <span class="font-bold ${ratingColor} text-xs">${rating}</span>
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
  if (!periodId) {
    document.getElementById('archivedPeriodStatsContent').classList.add('hidden');
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
    document.getElementById('archivedPeriodStatsContent').classList.remove('hidden');
    
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
    const fund = gross * 0.15;
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
      const fund = gross * 0.15;
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
