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
        employeeCodes: employeeCodesMap
      }
    };
    
    // Upload to Firebase Storage using CDN
    if (storage) {
      try {
        const storageRef = storage.ref(`periods/${periodId}.json`);
        const blob = new Blob([JSON.stringify(periodData)], { type: 'application/json' });
        await storageRef.put(blob);
        console.log('✅ Period uploaded to Firebase Storage');
      } catch (error) {
        console.error('❌ Firebase upload error:', error);
        // Fallback to localStorage
        const archivedPeriods = JSON.parse(localStorage.getItem('adora_archived_periods') || '[]');
        archivedPeriods.push(periodData);
        if (archivedPeriods.length > 24) {
          archivedPeriods.shift();
        }
        localStorage.setItem('adora_archived_periods', JSON.stringify(archivedPeriods));
        console.log('✅ Period saved to localStorage (Firebase fallback)');
      }
    } else {
      // Fallback: Save to localStorage
      const archivedPeriods = JSON.parse(localStorage.getItem('adora_archived_periods') || '[]');
      archivedPeriods.push(periodData);
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
  const content = document.getElementById('employeeCodesContent');
  if (!modal || !content) return;
  
  const uniqueEmployees = new Map();
  db.forEach(emp => {
    if (!uniqueEmployees.has(emp.name)) {
      uniqueEmployees.set(emp.name, emp);
    }
  });
  
  const sortedEmployees = Array.from(uniqueEmployees.values()).sort((a, b) => a.name.localeCompare(b.name));
  
  // Get period text for WhatsApp message
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
  
  content.innerHTML = html;
  
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
  
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
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
  const currentContent = document.getElementById('currentReportsContent');
  const archivedContent = document.getElementById('archivedReportsContent');
  
  if (tab === 'current') {
    currentTab.classList.add('text-turquoise', 'border-turquoise');
    currentTab.classList.remove('text-gray-400', 'border-transparent');
    archivedTab.classList.remove('text-turquoise', 'border-turquoise');
    archivedTab.classList.add('text-gray-400', 'border-transparent');
    currentContent.classList.remove('hidden');
    archivedContent.classList.add('hidden');
    populateReportsPage();
  } else {
    archivedTab.classList.add('text-turquoise', 'border-turquoise');
    archivedTab.classList.remove('text-gray-400', 'border-transparent');
    currentTab.classList.remove('text-turquoise', 'border-turquoise');
    currentTab.classList.add('text-gray-400', 'border-transparent');
    archivedContent.classList.remove('hidden');
    currentContent.classList.add('hidden');
    loadArchivedPeriodsList();
  }
}

// === Archived Periods Functions ===
async function loadArchivedPeriodsList() {
  const select = document.getElementById('archivedPeriodSelect');
  if (!select) return;
  
  select.innerHTML = '<option value="">-- اختر فترة --</option>';
  
  try {
    let periods = [];
    
    if (storage) {
      try {
        const periodsRef = storage.ref('periods/');
        const result = await periodsRef.listAll();
        
        for (const itemRef of result.items) {
          const url = await itemRef.getDownloadURL();
          const response = await fetch(url);
          const data = await response.json();
          periods.push(data);
        }
      } catch (error) {
        console.log('⚠️ Firebase Storage not available, using localStorage');
      }
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
    
    if (storage) {
      try {
        const storageRef = storage.ref(`periods/${periodId}.json`);
        const url = await storageRef.getDownloadURL();
        const response = await fetch(url);
        periodData = await response.json();
      } catch (error) {
        console.log('⚠️ Firebase Storage not available, using localStorage');
      }
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
    
    populateArchivedReportsGrid();
    
    showToast('✅ تم تحميل الفترة بنجاح', 'success');
    
  } catch (error) {
    console.error('❌ Error loading archived period:', error);
    showToast('❌ خطأ في تحميل الفترة: ' + error.message, 'error');
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
  if (!employee && storage) {
    try {
      showToast('⏳ جاري تحميل البيانات...', 'info');
      
      // Get list of all periods
      const periodsRef = storage.ref('periods/');
      const result = await periodsRef.listAll();
      
      if (result.items.length > 0) {
        // Get the most recent period (last one)
        const periods = [];
        for (const itemRef of result.items) {
          const url = await itemRef.getDownloadURL();
          const response = await fetch(url);
          const data = await response.json();
          periods.push(data);
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
      }
    } catch (error) {
      console.error('❌ Error loading from Firebase:', error);
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
    
    // Show error message
    const body = document.body;
    body.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%); color: white; font-family: 'IBM Plex Sans Arabic', sans-serif; text-align: center; padding: 2rem;">
        <div style="background: rgba(255, 255, 255, 0.1); padding: 3rem; border-radius: 20px; border: 2px solid rgba(239, 68, 68, 0.5); max-width: 500px;">
          <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
          <h1 style="font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; color: #ef4444;">الكود غير صحيح</h1>
          <p style="color: #94a3b8; margin-bottom: 2rem;">يرجى استخدام الرابط الصحيح أو QR Code الخاص بك</p>
          <p style="color: #64748b; font-size: 0.875rem;">إذا كنت تواجه مشكلة، يرجى التواصل مع الإدارة</p>
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
