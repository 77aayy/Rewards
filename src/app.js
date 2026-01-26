// === Firebase Configuration ===
const firebaseConfig = {
  apiKey: "AIzaSyAKpUAnc_EJXxGrhPPfTAgnFB13Qvs_ogk",
  authDomain: "rewards-63e43.firebaseapp.com",
  projectId: "rewards-63e43",
  storageBucket: "rewards-63e43.firebasestorage.app",
  messagingSenderId: "453256410249",
  appId: "1:453256410249:web:b7edd6afe3922c3e738258"
};

// Initialize Firebase (will be initialized after Firebase SDK loads)
let storage = null;
let firebaseApp = null;

// === Global State ===
let db = [];
let branches = new Set();
let currentFilter = 'الكل';
let currentEvalRate = 20;
let reportStartDate = null; // Store the start date for report month name
let employeeCodesMap = {}; // Map employee names to codes

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
const ADMIN_SECRET_KEY = 'ayman5255'; // Change this to your preferred secret key

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

// Load data from localStorage on page load
function loadDataFromStorage() {
try {
// Security: If employee mode, don't load admin data
if (isEmployeeMode()) {
  // Employee mode - data will be loaded by checkMobileEmployeeCode
  return;
}

// Security: If not admin mode, block access
if (!isAdminMode()) {
  // Not admin and not employee - block access
  document.body.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; background: linear-gradient(135deg, #0a0e1a 0%, #1a1f35 100%); color: white; font-family: 'IBM Plex Sans Arabic', sans-serif; text-align: center; padding: 2rem;">
      <div style="background: rgba(255, 255, 255, 0.1); padding: 3rem; border-radius: 20px; border: 2px solid rgba(239, 68, 68, 0.5); max-width: 500px;">
        <div style="font-size: 4rem; margin-bottom: 1rem;">🔒</div>
        <h1 style="font-size: 1.5rem; font-weight: 900; margin-bottom: 1rem; color: #ef4444;">غير مصرح بالدخول</h1>
        <p style="color: #94a3b8; margin-bottom: 2rem;">يرجى استخدام الرابط الصحيح للوصول إلى النظام</p>
        <p style="color: #64748b; font-size: 0.875rem;">إذا كنت موظفاً، يرجى استخدام QR Code الخاص بك</p>
      </div>
    </div>
  `;
  return;
}

loadEmployeeCodesMap(); // Load employee codes first
const savedDb = localStorage.getItem('adora_rewards_db');
const savedBranches = localStorage.getItem('adora_rewards_branches');
const savedEvalRate = localStorage.getItem('adora_rewards_evalRate');
const savedStartDate = localStorage.getItem('adora_rewards_startDate');
const savedPeriodText = localStorage.getItem('adora_rewards_periodText');
if (savedDb && savedBranches) {
db = JSON.parse(savedDb);
branches = new Set(JSON.parse(savedBranches));
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
}
}
// Function to return to upload page
function returnToUpload() {
// Clear ALL localStorage data (only this function clears storage - refresh keeps data)
try {
localStorage.removeItem('adora_rewards_db');
localStorage.removeItem('adora_rewards_branches');
localStorage.removeItem('adora_rewards_evalRate');
localStorage.removeItem('adora_rewards_startDate');
localStorage.removeItem('adora_rewards_periodText');
} catch (error) {
console.error('❌ Error clearing localStorage:', error);
}
// Reset data
db = [];
branches = new Set();
currentFilter = 'الكل';
currentEvalRate = 20;
reportStartDate = null;
// Show upload box and hide dashboard
document.getElementById('uploadBox').classList.remove('hidden');
document.getElementById('dashboard').classList.add('hidden');
document.getElementById('actionBtns').style.display = 'none';
// Clear file input
const fileInput = document.getElementById('fileInput');
if (fileInput) {
fileInput.value = '';
}
}
let currentSort = { key: 'name', order: 'asc' }; // Always sort by name (employee) ascending
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
createParticles();
// Load data from localStorage on page load
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', loadDataFromStorage);
} else {
// DOM already loaded
loadDataFromStorage();
}
// === File Upload Handler ===
document.getElementById('fileInput').addEventListener('change', (e) => {
const file = e.target.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = (evt) => {
try {
const wb = XLSX.read(new Uint8Array(evt.target.result), { type: 'array' });
const sheet = wb.Sheets[wb.SheetNames[0]];
// 1. Parse with formatting for robust Date Extraction
const rowsFormatted = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'yyyy-mm-dd' });
// --- Robust Date Extraction ---
// Matches YYYY-MM-DD (from Excel format) or DD/MM/YYYY (from text cells)
// Also matches dates with time: YYYY-MM-DD HH:MM:SS or DD/MM/YYYY HH:MM:SS
const datePattern = /(\d{4}-\d{2}-\d{2}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)|(\d{1,2}\/\d{1,2}\/\d{4}(?:\s+\d{2}:\d{2}(?::\d{2})?)?)/g;
let minDate = null;
let maxDate = null;
// Store minDate globally for report month name
reportStartDate = null;
// Search for "التاريخ من" and "التاريخ الي" in ALL rows (not just first 20)
// التاريخ ممكن يتغير من صف إلى صف آخر
// First pass: Look for exact labels "التاريخ من" and "التاريخ الي" in ALL rows
console.log('🔍 Starting date extraction from Excel...');
rowsFormatted.forEach((row, rowIndex) => {
row.forEach((cell, cellIndex) => {
if (!cell) return;
const str = String(cell).trim();
const lowerStr = str.toLowerCase();
// Check for exact date labels
const isDateFrom = lowerStr.includes('التاريخ من') || lowerStr.includes('date from');
const isDateTo = lowerStr.includes('التاريخ الي') || lowerStr.includes('التاريخ إلى') || lowerStr.includes('date to');
if (isDateFrom || isDateTo) {
console.log(`📍 Found date label at row ${rowIndex}, cell ${cellIndex}:`, str);
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
console.log(`  Checking cell ${i} (distance: ${distance}, ${isBefore ? 'BEFORE' : isAfter ? 'AFTER' : 'SAME'}):`, cellStr.substring(0, 50));
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
console.log(`  📅 Parsed Excel serial ${serial} to date:`, iso);
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
console.log(`  ✅ Found ${isDateFrom ? 'minDate' : 'maxDate'} candidate in cell ${i} (distance: ${distance}, ${isBefore ? 'BEFORE' : isAfter ? 'AFTER' : 'SAME'}):`, iso);
}
}
}
});
// Use the closest date found
if (closestDate) {
console.log(`  ✅ Using closest ${isDateFrom ? 'minDate' : 'maxDate'}:`, closestDate, `(distance: ${closestDistance})`);
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
console.log(`  Checking next row, column ${checkCol}:`, nextRowStr.substring(0, 50));
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
console.log(`  📅 Parsed Excel serial ${serial} to date:`, iso);
}
}
}
}
if (iso) {
// Verify date is in 2026 to avoid wrong dates
const dateYear = iso.split('-')[0];
if (dateYear !== '2026') {
console.log('  ⚠️ Skipping date not in 2026:', iso);
continue; // Skip dates not in 2026
}
console.log(`  ✅ Found ${isDateFrom ? 'minDate' : 'maxDate'} in next row:`, iso);
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
console.log(`  Checking previous row (row ${rowIndex - 1}) around column ${cellIndex}...`);
// Expanded range: check ±10 columns around the label position
for (let colOffset = -10; colOffset <= 10; colOffset++) {
const checkCol = cellIndex + colOffset;
if (checkCol >= 0 && checkCol < prevRow.length && prevRow[checkCol]) {
const prevRowStr = String(prevRow[checkCol]).trim();
console.log(`  Checking previous row, column ${checkCol}:`, prevRowStr.substring(0, 50));
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
console.log(`  📅 Parsed Excel serial ${serial} to date:`, iso);
}
}
}
}
if (iso) {
const dateYear = iso.split('-')[0];
if (dateYear === '2026') {
console.log(`  ✅ Found ${isDateFrom ? 'minDate' : 'maxDate'} in previous row:`, iso);
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
console.log(`  ❌ No date found near "${str}" at row ${rowIndex}, cell ${cellIndex}`);
}
}
});
});
// Second pass: If still not found, search for "من" and "إلى" ONLY in header rows (first 30 rows)
// This prevents extracting dates from data rows
if (!minDate || !maxDate) {
console.log('⚠️ First pass did not find dates, trying second pass...');
const headerRows = rowsFormatted.slice(0, 30); // Only search in first 30 rows (header area)
headerRows.forEach((row, rowIndex) => {
const rowStr = row.join(' ').toLowerCase();
const hasFrom = rowStr.includes('من') && !rowStr.includes('التاريخ من');
const hasTo = (rowStr.includes('إلى') || rowStr.includes('الى')) && !rowStr.includes('التاريخ الي') && !rowStr.includes('التاريخ إلى');
if (hasFrom || hasTo) {
console.log(`📍 Found "من" or "إلى" in row ${rowIndex}:`, rowStr.substring(0, 100));
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
console.log('⚠️ Skipping date not in 2026:', iso);
return; // Skip dates not in 2026
}
// Check if this date is near "من" or "إلى" in the row
const cellLower = str.toLowerCase();
const isNearFrom = hasFrom && (cellLower.includes('من') || (cellIndex > 0 && String(row[cellIndex - 1] || '').toLowerCase().includes('من')));
const isNearTo = hasTo && (cellLower.includes('إلى') || cellLower.includes('الى') || (cellIndex > 0 && String(row[cellIndex - 1] || '').toLowerCase().includes('إلى')));
if (isNearFrom && !minDate) {
minDate = iso;
console.log(`✅ Found minDate in second pass:`, iso);
}
if (isNearTo && !maxDate) {
maxDate = iso;
console.log(`✅ Found maxDate in second pass:`, iso);
}
}
});
}
});
}
console.log('📊 Final dates - minDate:', minDate, 'maxDate:', maxDate);
// Update Print Report Directly
let periodText = ""; // Empty by default - will show nothing if no dates found
// Debug: Check if dates are found but not properly set
if (!minDate && !maxDate) {
console.log('❌ Both minDate and maxDate are null');
} else if (!minDate) {
console.log('⚠️ minDate is null, but maxDate is:', maxDate);
} else if (!maxDate) {
console.log('⚠️ maxDate is null, but minDate is:', minDate);
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
console.log('✅ Dates found - Period:', periodText, 'minDate:', minDate, 'maxDate:', maxDate);
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
console.log('⚠️ Only minDate found - Period:', periodText, 'minDate:', minDate);
} else {
// If no dates found, leave empty - DO NOT extract dates randomly from data
reportStartDate = null;
console.log('❌ No dates found near "التاريخ من" or "التاريخ الي" labels');
}
const periodRangeEl = document.getElementById('periodRange');
if (periodRangeEl) {
periodRangeEl.innerText = periodText;
console.log('✅ Updated periodRange element:', periodRangeEl.innerText);
} else {
console.error('❌ periodRange element not found!');
}
// Update header period range
const headerPeriodRangeEl = document.getElementById('headerPeriodRange');
if (headerPeriodRangeEl) {
headerPeriodRangeEl.innerText = periodText;
console.log('✅ Updated headerPeriodRange element:', headerPeriodRangeEl.innerText);
} else {
console.error('❌ headerPeriodRange element not found!');
}
// Save period text to localStorage
if (periodText) {
localStorage.setItem('adora_rewards_periodText', periodText);
}
// -----------------------------
// 2. Parse as RAW for reliable Data Processing (numbers as numbers)
const rowsRaw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });
processData(rowsRaw);
showToast('✅ تم تحميل البيانات بنجاح');
} catch (error) {
console.error(error);
showToast('❌ خطأ في قراءة الملف: ' + error.message, 'error');
}
};
reader.readAsArrayBuffer(file);
});
// === Data Processing ===
function processData(rows) {
db = [];
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
db.push({ name, count, branch: currentBranch });
branches.add(currentBranch);
}
});
if (db.length > 0) {
// Add unique ID, employee code, and evaluations init
db = db.map(item => {
  // Get or create employee code for this employee name
  const employeeCode = getOrCreateEmployeeCode(item.name);
  return {
    ...item,
    id: item.id || crypto.randomUUID(),
    employeeCode: employeeCode, // Add employee code
    evaluations: item.evaluations || 0, // Keep for backward compatibility
    evaluationsBooking: item.evaluationsBooking || 0,
    evaluationsGoogle: item.evaluationsGoogle || 0,
// Calculate totalAttendanceDays if attendanceDaysPerBranch exists
totalAttendanceDays: (() => {
if (item.attendanceDaysPerBranch && typeof item.attendanceDaysPerBranch === 'object') {
return Object.values(item.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
}
return item.totalAttendanceDays || 0;
})(),
// Auto-update attendance26Days based on totalAttendanceDays (26 or more = true, less = false)
attendance26Days: (() => {
const totalDays = (() => {
if (item.attendanceDaysPerBranch && typeof item.attendanceDaysPerBranch === 'object') {
return Object.values(item.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
}
return item.totalAttendanceDays || 0;
})();
return totalDays >= 26;
})()
  };
});
// Save to localStorage
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
localStorage.setItem('adora_rewards_branches', JSON.stringify([...branches]));
localStorage.setItem('adora_rewards_evalRate', currentEvalRate.toString());
if (reportStartDate) {
localStorage.setItem('adora_rewards_startDate', reportStartDate);
}
console.log('✅ Data saved to localStorage');
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
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
document.getElementById('reportDate').innerText = `${toArabicNum(year)}/${toArabicNum(month)}/${toArabicNum(day)}`;
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
function updateFooterTotals() {
let filtered = [...db];
if (currentFilter !== 'الكل') {
filtered = filtered.filter(d => d.branch === currentFilter);
}
// CRITICAL: Recalculate branchWinners to check for excellence bonus (must include attendance bonus/discount)
const branchWinners = {}; 
[...branches].forEach(b => {
branchWinners[b] = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, evalBooking: {val: -1, ids: []}, evalGoogle: {val: -1, ids: []}, book: {val: -1, ids: []}, attendance: {val: -1, ids: []} };
});
// Calculate branch winners (including attendance bonus/discount)
db.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const totalEval = evBooking + evGoogle; // For financial calculations only
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
});
let totalFund = 0, totalNet = 0, totalEval = 0;
let totalNetNoEval = 0;
filtered.forEach(emp => {
const rate = emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1);
const evBooking = emp.evaluationsBooking || 0;
const evGoogle = emp.evaluationsGoogle || 0;
const empTotalEval = evBooking + evGoogle; // Local variable for this employee's total evaluations
const gross = (emp.count * rate) + (evBooking * 20) + (evGoogle * 10);
const fund = gross * 0.15;
let net = gross - fund;
// Apply 25% bonus if employee completed 26 days, or 25% discount if not
const attendance26Days = emp.attendance26Days === true; // Only true if user manually activated
const attendanceBonus = attendance26Days ? net * 0.25 : 0; // 25% bonus only if user activated "تم"
net = net + attendanceBonus; // No discount - only bonus if activated
// Check if employee has excellence bonus (most bookings + most evaluations in branch)
const hasExcellenceBonus = branchWinners[emp.branch]?.book.ids.includes(emp.id) && 
branchWinners[emp.branch]?.eval.ids.includes(emp.id) &&
branchWinners[emp.branch].book.val > 0 && 
branchWinners[emp.branch].eval.val > 0;
const excellenceBonus = hasExcellenceBonus ? 50 : 0;
const grossNoEval = emp.count * rate;
totalNetNoEval += (grossNoEval * 0.85);
totalFund += fund;
// CRITICAL: Include excellence bonus and commitment bonus to match renderUI logic
// Check if employee has commitment bonus
const isMostCommitted = branchWinners[emp.branch]?.attendance.ids.includes(emp.id);
const isMostEval = branchWinners[emp.branch]?.eval.ids.includes(emp.id) && branchWinners[emp.branch].eval.val > 0;
const isMostBook = branchWinners[emp.branch]?.book.ids.includes(emp.id) && branchWinners[emp.branch].book.val > 0;
const hasCommitmentBonus = attendance26Days && isMostCommitted && (isMostEval || isMostBook);
const commitmentBonus = hasCommitmentBonus ? 50 : 0;
totalNet += net + excellenceBonus + commitmentBonus; // Net after attendance bonus/discount + excellence bonus + commitment bonus
totalEval += empTotalEval; // Add this employee's total evaluations to the global total
});
document.getElementById('footEvalCount').innerText = totalEval;
// footEvalValue removed from display (still calculated but not shown)
// Calculate total evaluation value: Booking (20) + Google Maps (10)
const totalEvalBooking = filtered.reduce((sum, emp) => sum + (emp.evaluationsBooking || 0), 0);
const totalEvalGoogle = filtered.reduce((sum, emp) => sum + (emp.evaluationsGoogle || 0), 0);
const footEvalValue = (totalEvalBooking * 20) + (totalEvalGoogle * 10);
document.getElementById('footBookingCount').innerText = document.getElementById('statBookings').innerText; // Sync with main stat
// إجمالي (عمال + موظفين) = مجموع كل الصافي لكل الموظفين + مجموع كل الصافي للعمال (منفصلين في خانتين)
// الخانة الأولى: نسب العمال (fund) - الخانة الثانية: الصافي للموظفين (net)
document.getElementById('footFund').innerText = totalFund.toFixed(1); // نسب العمال (بدون علامة -)
document.getElementById('footNet').innerText = totalNet.toFixed(2); // الصافي للموظفين
document.getElementById('footNetNoEval').innerText = totalNetNoEval.toFixed(2);
// إجمالي النهائي لكل فريق العمل = مجموع كل الصافي لكل الموظفين + مجموع كل الصافي للعمال (في خانة واحدة فقط)
// الرقم النهائي المجمع = totalNet + totalFund
const finalTotal = totalNet + totalFund; // المجموع النهائي
document.getElementById('footTotalFund').innerText = ''; // إخفاء خانة العمال
document.getElementById('footTotalNet').innerText = finalTotal.toFixed(2); // الرقم النهائي المجمع
document.getElementById('statTotal').innerText = totalNet.toFixed(0);
// Update commitment bonus row
updateCommitmentBonusRow();
}
function updateEvalBooking(id, val, inputEl, shouldRender = false) {
const item = db.find(i => i.id === id);
if (!item) return;
// Ensure valid number
const newVal = parseInt(val) || 0;
item.evaluationsBooking = newVal;
// Save to localStorage
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
}
// Update badges immediately (always, even during typing)
updateBadges();
// Only re-render if shouldRender is true (on blur, not on input)
if (shouldRender) {
// Update badges again after full render to ensure they're visible
setTimeout(() => {
updateBadges();
}, 100);
renderUI(currentFilter);
}
}
function updateEvalGoogle(id, val, inputEl, shouldRender = false) {
const item = db.find(i => i.id === id);
if (!item) return;
// Ensure valid number
const newVal = parseInt(val) || 0;
item.evaluationsGoogle = newVal;
// Save to localStorage immediately (always save, even during typing)
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
}
// Update badges immediately (always, even during typing)
updateBadges();
// Only re-render if shouldRender is true (on blur, not on input)
if (shouldRender) {
// Update badges again after full render to ensure they're visible
setTimeout(() => {
updateBadges();
}, 100);
renderUI(currentFilter);
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
// Ensure days is a valid positive number (accepts any number: odd, even, single-digit, multi-digit)
days = Math.max(0, parseInt(days) || 0);
// No restriction on odd/even numbers - accept 8, 22, 30, 15, etc.
// Get all employees with this name
const employeesWithSameName = db.filter(emp => emp.name === empName);
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
// Save to localStorage
try {
localStorage.setItem('adora_rewards_db', JSON.stringify(db));
} catch (error) {
console.error('❌ Error saving to localStorage:', error);
}
// Re-render UI only if shouldRender is true (to avoid losing focus during typing)
if (shouldRender) {
renderUI(currentFilter);
}
}
function handleEvalKey(e, currentInput) {
if (e.key === 'Tab' || e.key === 'Enter') {
e.preventDefault();
const row = currentInput.closest('tr');
if (!row) return;
// Find all eval inputs in the same row
const sameRowInputs = Array.from(row.querySelectorAll('.eval-input'));
if (sameRowInputs.length >= 2) {
// Check if current input is Booking (first) or Google Maps (second)
const currentIndex = sameRowInputs.indexOf(currentInput);
if (currentIndex === 0) {
// Currently on Booking → move to Google Maps in same row
if (sameRowInputs[1]) {
sameRowInputs[1].focus();
sameRowInputs[1].select();
return;
}
} else if (currentIndex === 1) {
// Currently on Google Maps → move to Booking in next row
const nextRow = row.nextElementSibling;
if (nextRow) {
const nextRowInputs = Array.from(nextRow.querySelectorAll('.eval-input'));
if (nextRowInputs.length > 0) {
// Move to Booking (first input) in next row
nextRowInputs[0].focus();
nextRowInputs[0].select();
return;
}
}
}
}
// Fallback: move to next input in order (if navigation above didn't work)
const allInputs = [...document.querySelectorAll('.eval-input')];
const index = allInputs.indexOf(currentInput);
if (index > -1 && index < allInputs.length - 1) {
allInputs[index + 1].focus();
allInputs[index + 1].select();
}
}
}
function updateAttendance(id, checked, toggleEl) {
const item = db.find(i => i.id === id);
if (!item) return;
item.attendance26Days = checked;
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
if (attendanceBonus > 0) {
// Show final net after bonus in green (like excellence bonus)
display = `<span class="text-white print:text-black font-black">${finalNet.toFixed(2)}</span> <span class="text-green-400 print:text-green-600 text-sm" style="font-size: 0.75em;">+ ${attendanceBonus.toFixed(2)}</span> <span class="text-green-400 print:text-green-600" style="font-size: 0.65em; margin-right: 2px;">+ 25%</span>`;
netCell.className = 'col-net p-2 text-left font-black text-white bg-green-500/[0.08] px-4 print:text-black text-xl number-display';
} else {
display = `<span class="text-white print:text-black font-black">${finalNet.toFixed(2)}</span>`;
netCell.className = hasCommitmentBonus ? 'col-net p-2 text-left font-black text-white bg-purple-500/[0.08] px-4 print:text-black text-xl number-display' : (hasExcellenceBonus ? 'col-net p-2 text-left font-black text-white bg-turquoise/[0.08] px-4 print:text-black text-xl number-display' : 'col-net p-2 text-left font-black text-white bg-turquoise/[0.08] px-4 print:text-black text-xl number-display');
}
if (hasExcellenceBonus) {
display += ` <span class="text-yellow-400 print:text-yellow-600 text-sm" style="font-size: 0.75em;">+ 50.00</span> <span class="text-yellow-400 print:text-yellow-600" style="font-size: 0.65em; margin-right: 2px;">حافز تفوق</span>`;
}
if (hasCommitmentBonus) {
display += ` <span class="text-purple-400 print:text-purple-600 text-sm" style="font-size: 0.75em;">+ 50.00</span> <span class="text-purple-400 print:text-purple-600" style="font-size: 0.65em; margin-right: 2px;">حافز التزام</span>`;
}
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
const printBtn = document.getElementById('printAllBtn');
if (printBtn) {
if (currentFilter === 'الكل') {
printBtn.innerText = 'طباعة الكل 🖨️';
} else {
printBtn.innerText = `طباعة ${currentFilter} 🖨️`;
}
}
}
// === Checkbox Management ===
function toggleAll(master) {
document.querySelectorAll('.emp-checkbox').forEach(box => {
box.checked = master.checked;
});
updateSelectedUI();
}
function updateSelectedUI() {
const selectedCount = document.querySelectorAll('.emp-checkbox:checked').length;
const btn = document.getElementById('printSelectedBtn');
if (selectedCount > 0) {
btn.classList.remove('hidden');
btn.innerHTML = `طباعة المحدد (${selectedCount}) 🎯`;
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
// 3. Calculate View Winners & Totals (with attendance bonus/discount)
let filtered = [...db];
if (currentFilter !== 'الكل') {
filtered = filtered.filter(d => d.branch === currentFilter);
}
let viewWinners = { net: {val: -1, ids: []}, eval: {val: -1, ids: []}, book: {val: -1, ids: []} };
let totalNet = 0, totalBookings = 0;
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
totalBookings += s.count;
if (s.net > viewWinners.net.val) { viewWinners.net.val = s.net; viewWinners.net.ids = [s.id]; }
else if (s.net === viewWinners.net.val) { viewWinners.net.ids.push(s.id); }
if (s.ev > viewWinners.eval.val) { viewWinners.eval.val = s.ev; viewWinners.eval.ids = [s.id]; }
else if (s.ev === viewWinners.eval.val) { viewWinners.eval.ids.push(s.id); }
if (s.count > viewWinners.book.val) { viewWinners.book.val = s.count; viewWinners.book.ids = [s.id]; }
else if (s.count === viewWinners.book.val) { viewWinners.book.ids.push(s.id); }
});
document.getElementById('statEmployees').innerText = filtered.length;
document.getElementById('statBookings').innerText = totalBookings;
document.getElementById('statTotal').innerText = totalNet.toFixed(0);
// Update Cards
const getWinnerName = (wObj) => {
if (wObj.val <= 0) return '-';
const winner = db.find(d => d.id === wObj.ids[0]);
return winner ? (winner.name + (currentFilter === 'الكل' ? ` (${winner.branch})` : '')) : '-';
};
document.getElementById('topEarnerName').innerText = getWinnerName(viewWinners.net);
document.getElementById('topEarnerValue').innerText = viewWinners.net.val > 0 ? viewWinners.net.val.toFixed(0) + ' ريال' : '-';
document.getElementById('topRatedName').innerText = getWinnerName(viewWinners.eval);
document.getElementById('topRatedValue').innerText = viewWinners.eval.val > 0 ? viewWinners.eval.val + ' تقييم' : '-';
document.getElementById('topBookerName').innerText = getWinnerName(viewWinners.book);
document.getElementById('topBookerValue').innerText = viewWinners.book.val > 0 ? viewWinners.book.val + ' حجز' : '-';
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
// Update commitment bonus row
const commitmentRow = document.getElementById('commitmentBonusRow');
const commitmentText = document.getElementById('commitmentBonusText');
const commitmentValue = document.getElementById('commitmentBonusValue');
// CRITICAL: Filter commitmentEmployees by currentFilter before displaying
let displayCommitmentEmployees = commitmentEmployees;
let displayCommitmentBonus = totalCommitmentBonus;
if (currentFilter !== 'الكل') {
displayCommitmentEmployees = commitmentEmployees.filter(e => e.branch === currentFilter);
displayCommitmentBonus = displayCommitmentEmployees.length * 50;
}
if (displayCommitmentEmployees.length > 0) {
if (commitmentRow) commitmentRow.style.display = 'table-row';
if (commitmentText) {
const employeesHtml = displayCommitmentEmployees.map(e => 
`<span class="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-turquoise/10 border border-turquoise/30 text-turquoise whitespace-nowrap inline-block" style="min-width: fit-content;">
<span class="font-bold text-xs sm:text-sm">${e.name} (${e.branch})</span> <span class="text-turquoise/80 text-[10px] sm:text-xs">- ${e.reason}</span>
</span>`
).join(' ');
commitmentText.innerHTML = `<span class="text-turquoise font-bold mr-2 inline-block text-sm sm:text-base whitespace-nowrap">حافز التزام:</span><span class="inline-flex flex-wrap items-center gap-2" style="direction: rtl;">${employeesHtml}</span>`;
}
if (commitmentValue) {
commitmentValue.innerText = `+${displayCommitmentBonus.toFixed(2)}`;
}
} else {
if (commitmentRow) commitmentRow.style.display = 'none';
}
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
// Update commitment bonus row
updateCommitmentBonusRow();
// Update excellence bonus row
const excellenceRow = document.getElementById('excellenceBonusRow');
const excellenceText = document.getElementById('excellenceBonusText');
const excellenceValue = document.getElementById('excellenceBonusValue');
// CRITICAL: Filter excellenceEmployees by currentFilter before displaying
let displayExcellenceEmployees = excellenceEmployees;
let displayExcellenceBonus = totalExcellenceBonus;
if (currentFilter !== 'الكل') {
displayExcellenceEmployees = excellenceEmployees.filter(e => e.branch === currentFilter);
displayExcellenceBonus = displayExcellenceEmployees.length * 50;
}
if (displayExcellenceEmployees.length > 0) {
if (excellenceRow) excellenceRow.style.display = 'table-row';
if (excellenceText) {
const employeesHtml = displayExcellenceEmployees.map(e => 
`<span class="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg bg-turquoise/10 border border-turquoise/30 text-turquoise whitespace-nowrap inline-block" style="min-width: fit-content;">
<span class="font-bold text-xs sm:text-sm">${e.name} (${e.branch})</span>
</span>`
).join(' ');
excellenceText.innerHTML = `<span class="text-turquoise font-bold mr-2 inline-block text-sm sm:text-base whitespace-nowrap">حافز تفوق:</span><span class="inline-flex flex-wrap items-center gap-2" style="direction: rtl;">${employeesHtml}</span>`;
}
if (excellenceValue) {
excellenceValue.innerText = `+${displayExcellenceBonus.toFixed(2)}`;
}
} else {
if (excellenceRow) excellenceRow.style.display = 'none';
}
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
// Check if any employee has evaluations > 0 (to show/hide evaluation badges) - check ALL branches, not just filtered
const hasAnyEvaluations = db.some(emp => ((emp.evaluationsBooking || 0) + (emp.evaluationsGoogle || 0)) > 0);
// Update Cards
const getWinnerName = (wObj) => {
if (wObj.val <= 0) return '-';
const winner = db.find(d => d.id === wObj.ids[0]);
return winner ? (winner.name + (filter === 'الكل' ? ` (${winner.branch})` : '')) : '-';
};
document.getElementById('topEarnerName').innerText = getWinnerName(viewWinners.net);
document.getElementById('topEarnerValue').innerText = viewWinners.net.val > 0 ? viewWinners.net.val.toFixed(0) + ' ريال' : '-';
document.getElementById('topRatedName').innerText = getWinnerName(viewWinners.eval);
document.getElementById('topRatedValue').innerText = viewWinners.eval.val > 0 ? viewWinners.eval.val + ' تقييم' : '-';
document.getElementById('topBookerName').innerText = getWinnerName(viewWinners.book);
document.getElementById('topBookerValue').innerText = viewWinners.book.val > 0 ? viewWinners.book.val + ' حجز' : '-';
// Apply Sort
filtered.sort((a, b) => {
let valA, valB;
if (currentSort.key === 'net') {
valA = calcStats(a).net;
valB = calcStats(b).net;
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
return currentSort.order === 'asc' ? valA - valB : valB - valA;
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
totalFund += s.fund;
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
// For challenge bonus: if not applied in this branch, remove attendanceBonus from net
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
totalNet += s.net + finalExcellenceBonus + finalCommitmentBonus + finalAttendanceBonus;
} else {
// For non-duplicate: apply bonus normally
totalNet += s.net + s.excellenceBonus + s.commitmentBonus;
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
tbody.innerHTML += `
<tr data-fund="${s.fund}" 
data-net="${s.net}" 
data-eval="${s.ev}"
data-name="${emp.name}"
data-branch="${emp.branch}"
data-id="${emp.id}"
class="${isDuplicate ? 'bg-orange-400/8 is-dup-row group border-l-4 border-orange-300/40' : 'hover:bg-white/5'}"
style="animation: fadeInUp 0.4s ease-out ${displayIndex * 0.03}s both;">
<td class="p-2 text-center checkbox-col no-print">
<input type="checkbox" 
class="emp-checkbox cursor-pointer accent-turquoise" 
onclick="updateSelectedUI()">
</td>
<td class="col-m p-2 text-center text-gray-400 text-sm font-semibold">
${displayIndex + 1}
</td>
<td class="col-name p-2 text-right">
${(isDuplicate && filter === 'الكل') ? `
<div style="text-align: right; direction: rtl;">
<div class="font-bold text-base text-orange-100 print:text-black" style="text-align: right; direction: rtl;">
<span>${emp.name}</span>
<span class="badges-wrapper" style="display: inline-block; margin-right: 4px;">
${(() => {
let badgesHtml = '';
// Get all branches for this employee name
const allEmpBranches = db.filter(d => d.name === emp.name);
if (filter === 'الكل') {
// When showing "الكل": accumulate badges from all branches (only "best" badges, not "worst")
const branchBadges = { eval: [], book: [] };
allEmpBranches.forEach(empBranch => {
const isBranchMaxEval = branchWinners[empBranch.branch]?.eval.ids.includes(empBranch.id) && branchWinners[empBranch.branch].eval.val > 0;
const isBranchMaxBook = branchWinners[empBranch.branch]?.book.ids.includes(empBranch.id) && branchWinners[empBranch.branch].book.val > 0;
// Only show evaluation badges if at least one employee has evaluations > 0
if (isBranchMaxEval && hasAnyEvaluations && !branchBadges.eval.includes(empBranch.branch)) {
branchBadges.eval.push(empBranch.branch);
}
if (isBranchMaxBook && !branchBadges.book.includes(empBranch.branch)) {
branchBadges.book.push(empBranch.branch);
}
});
// Add badges with branch names
if (branchBadges.eval.length > 0) {
const branchText = branchBadges.eval.length === 1 
? `بال${branchBadges.eval[0]}` 
: branchBadges.eval.length === 2 
? 'في الفرعين' 
: `في ${branchBadges.eval.length} فروع`;
badgesHtml += `<span class="text-yellow-400 text-xs print:text-yellow-600" title="الأعلى تقييماً">⭐ الأفضل تقييماً ${branchText}</span>`;
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
// Only show "worst in الكل" badge (not from individual branches to avoid clutter)
// Only show evaluation badges if at least one employee has evaluations > 0
if (viewLosers.eval.ids.includes(emp.id) && viewLosers.eval.val < Infinity && viewLosers.eval.val === 0 && ((emp.evaluationsBooking || 0) + (emp.evaluationsGoogle || 0)) === 0 && hasAnyEvaluations) {
const worstBranches = allEmpBranches.filter(eb => viewLosers.eval.ids.includes(eb.id));
const uniqueBranches = [...new Set(worstBranches.map(eb => eb.branch))];
const branchText = uniqueBranches.length === 1 
? `بال${uniqueBranches[0]}` 
: uniqueBranches.length === 2 
? 'في الفرعين' 
: `في ${uniqueBranches.length} فروع`;
badgesHtml += `<span class="text-red-500 text-xs print:text-red-700 font-bold" title="الأقل تقييماً في الكل"><span class="text-red-500 text-[8px] leading-none inline-block">↓</span> الأقل تقييماً ${branchText}</span>`;
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
${emp.branch}
</div>
</div>
` : `
<div class="font-bold text-base text-white print:text-black" style="text-align: right; direction: rtl;">
<span>${emp.name}</span>
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
<td class="col-attendance p-2 text-center">
<div class="flex flex-col items-center gap-1">
<label class="relative inline-flex items-center" style="flex-direction: row-reverse; justify-content: center; gap: 6px; ${(() => {
// In "الكل" view: always read-only (cursor: default)
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
// In "الكل" view: always disabled (read-only for all)
if (filter === 'الكل') {
return 'disabled';
}
// In branch views: disable only for duplicates (they're linked to input fields)
const allEmpBranches = db.filter(e => e.name === emp.name);
const isEmpDuplicate = allEmpBranches.length > 1;
return isEmpDuplicate ? 'disabled' : '';
})()}
${(() => {
// In "الكل" view: no onchange (read-only)
if (filter === 'الكل') {
return '';
}
// In branch views: add onchange only for non-duplicates
const allEmpBranches = db.filter(e => e.name === emp.name);
const isEmpDuplicate = allEmpBranches.length > 1;
if (isEmpDuplicate) {
return '';
} else {
return 'onchange="updateAttendance(\'' + emp.id + '\', this.checked, this)"';
}
})()}
title="${(() => {
// In "الكل" view: always read-only message
if (filter === 'الكل') {
return 'للقراءة فقط - التعديل في صفحة الفرع';
}
// In branch views: check if employee is duplicate
const allEmpBranches = db.filter(e => e.name === emp.name);
const isEmpDuplicate = allEmpBranches.length > 1;
return isEmpDuplicate ? 'يتم التفعيل تلقائياً بناءً على عدد الأيام (26 أو أكثر)' : 'تفعيل/إلغاء تفعيل إتمام 26 يوم دوام';
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
${(function() {
// Check if employee is duplicate (exists in multiple branches)
const allEmpBranches = db.filter(function(e) { return e.name === emp.name; });
const isDuplicate = allEmpBranches.length > 1;
if (!isDuplicate) return '';
let inputsHtml = '';
if (filter === 'الكل') {
// In "الكل" view: show all branches as readonly
allEmpBranches.forEach(function(empBranch) {
const branchDays = empBranch.attendanceDaysPerBranch && empBranch.attendanceDaysPerBranch[empBranch.branch] 
? empBranch.attendanceDaysPerBranch[empBranch.branch] 
: '';
const branchName = empBranch.branch;
const empName = emp.name;
inputsHtml += '<div class="flex items-center gap-1 mb-0.5">' +
'<span class="text-[9px] text-gray-400">' + branchName + ':</span>' +
'<input type="text" ' +
'class="attendance-days-input w-12 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-center text-xs text-yellow-400 font-sans" ' +
'data-emp-name="' + empName + '" ' +
'data-emp-branch="' + branchName + '" ' +
'value="' + branchDays + '" ' +
'readonly ' +
'title="أيام الحضور في ' + branchName + ' (مقفول - التعديل في صفحة الفرع)">' +
'</div>';
});
// Show total
const totalDays = allEmpBranches.reduce(function(sum, eb) {
const days = eb.attendanceDaysPerBranch && eb.attendanceDaysPerBranch[eb.branch] 
? parseInt(eb.attendanceDaysPerBranch[eb.branch]) || 0 
: 0;
return sum + days;
}, 0);
inputsHtml += '<div class="text-[9px] text-green-400 font-bold mt-0.5">المجموع: ' + totalDays + '</div>';
} else {
// In branch view: show only current branch input (editable)
const branchDays = emp.attendanceDaysPerBranch && emp.attendanceDaysPerBranch[emp.branch] 
? emp.attendanceDaysPerBranch[emp.branch] 
: '';
const branchNameForInput = emp.branch;
const empNameForInput = emp.name;
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
return inputsHtml;
})()}
</div>
</td>
<td class="col-rate p-2 text-center text-xs text-gray-300 print:text-black font-medium">
${(emp.count > 100 ? 3 : (emp.count > 50 ? 2 : 1))} ريال
</td>
<td class="p-2 text-center">
${filter === 'الكل' ? 
`<span class="text-blue-400 font-bold text-base number-display">${isDuplicate ? (s.aggregatedEvalBooking || emp.evaluationsBooking || 0) : (emp.evaluationsBooking || 0)}</span>` :
`<input type="text" inputmode="numeric" pattern="[0-9]*" lang="en" dir="ltr"
value="${emp.evaluationsBooking || ''}" placeholder="0"
oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateEvalBooking('${emp.id}', this.value, this, false)"
onblur="updateEvalBooking('${emp.id}', this.value, this, true)"
onkeydown="handleEvalKey(event, this)"
class="eval-input text-blue-400 w-16 bg-white/5 border border-blue-400/50 rounded px-2 py-1 text-center focus:outline-none focus:border-blue-400 transition-colors number-display font-sans">`
}
</td>
<td class="p-2 text-center">
${filter === 'الكل' ? 
`<span class="text-green-400 font-bold text-base number-display">${isDuplicate ? (s.aggregatedEvalGoogle || emp.evaluationsGoogle || 0) : (emp.evaluationsGoogle || 0)}</span>` :
`<input type="text" inputmode="numeric" pattern="[0-9]*" lang="en" dir="ltr"
value="${emp.evaluationsGoogle || ''}" placeholder="0"
oninput="this.value = this.value.replace(/[^0-9]/g, ''); updateEvalGoogle('${emp.id}', this.value, this, false)"
onblur="updateEvalGoogle('${emp.id}', this.value, this, true)"
onkeydown="handleEvalKey(event, this)"
class="eval-input text-green-400 w-16 bg-white/5 border border-green-400/50 rounded px-2 py-1 text-center focus:outline-none focus:border-green-400 transition-colors number-display font-sans">`
}
</td>
<td class="col-net p-2 text-left font-black px-4 print:text-black text-xl number-display ${s.attendanceBonus > 0 ? 'text-white bg-green-500/[0.08]' : (s.hasCommitmentBonus ? 'text-white bg-purple-500/[0.08]' : (s.hasExcellenceBonus ? 'text-white bg-turquoise/[0.08]' : 'text-white bg-turquoise/[0.08]'))}">
${(() => {
let display = '';
// For duplicates in "الكل" view: calculate aggregated net
let baseNet, finalNet, aggAttendanceBonus = 0;
if (filter === 'الكل' && isDuplicate) {
const aggCount = s.aggregatedCount || emp.count;
const aggEvalBooking = s.aggregatedEvalBooking || emp.evaluationsBooking || 0;
const aggEvalGoogle = s.aggregatedEvalGoogle || emp.evaluationsGoogle || 0;
const aggRate = aggCount > 100 ? 3 : (aggCount > 50 ? 2 : 1);
const aggGross = (aggCount * aggRate) + (aggEvalBooking * 20) + (aggEvalGoogle * 10);
const aggFund = aggGross * 0.15;
baseNet = aggGross - aggFund;
// Calculate attendance bonus based on aggregated days
const allEmpBranches = db.filter(e => e.name === emp.name);
const firstEmp = allEmpBranches[0];
let totalDays = 0;
if (firstEmp && firstEmp.attendanceDaysPerBranch) {
totalDays = Object.values(firstEmp.attendanceDaysPerBranch).reduce((sum, d) => sum + (parseInt(d) || 0), 0);
} else {
totalDays = firstEmp?.totalAttendanceDays || 0;
}
const aggAttendanceBonus = totalDays >= 26 ? baseNet * 0.25 : 0;
baseNet = baseNet + aggAttendanceBonus;
finalNet = baseNet + s.excellenceBonus + s.commitmentBonus;
} else {
// baseNet هو الصافي بعد attendance bonus/discount (بدون الحوافز)
baseNet = s.net; // s.net يتضمن attendance bonus/discount فقط
// Calculate final net including all bonuses (excellence + commitment)
finalNet = baseNet + s.excellenceBonus + s.commitmentBonus;
}
// الصافي الأبيض يجب أن يتضمن الحوافز مباشرة
// Show final net (white) - الرقم الأبيض يتضمن الحوافز مباشرة
const attendanceBonusToShow = (filter === 'الكل' && isDuplicate) ? aggAttendanceBonus : s.attendanceBonus;
if (attendanceBonusToShow > 0) {
// Show final net after bonus (white) with bonus details (green)
display = `<span class="text-white print:text-black font-black">${finalNet.toFixed(2)}</span> <span class="text-green-400 print:text-green-600 text-sm" style="font-size: 0.75em;">+ ${(attendanceBonusToShow).toFixed(2)}</span> <span class="text-green-400 print:text-green-600" style="font-size: 0.65em; margin-right: 2px;">+ 25%</span>`;
} else {
display = `<span class="text-white print:text-black font-black">${finalNet.toFixed(2)}</span>`;
}
// Add excellence bonus label (بيان فقط - ليس جزء من الحساب)
if (s.hasExcellenceBonus) {
display += ` <span class="text-yellow-400 print:text-yellow-600 text-sm" style="font-size: 0.75em;">+ 50.00</span> <span class="text-yellow-400 print:text-yellow-600" style="font-size: 0.65em; margin-right: 2px;">حافز تفوق</span>`;
}
// Add commitment bonus label (بيان فقط - ليس جزء من الحساب)
if (s.hasCommitmentBonus) {
display += ` <span class="text-purple-400 print:text-purple-600 text-sm" style="font-size: 0.75em;">+ 50.00</span> <span class="text-purple-400 print:text-purple-600" style="font-size: 0.65em; margin-right: 2px;">حافز التزام</span>`;
}
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
// Only show badges row if there are badges
if (badgesHtml) {
return `
<tr class="badges-row" data-emp-id="${emp.id}" data-branch="${emp.branch}" style="background-color: rgba(255, 255, 255, 0.02);">
<td class="col-name p-2" colspan="8" style="padding-right: 16px; padding-top: 4px; padding-bottom: 4px;">
<div class="badges-wrapper flex flex-wrap gap-2 items-center" style="direction: rtl; text-align: right;">
${badgesHtml}
</div>
</td>
</tr>
`;
}
return '';
})()}
`;
});
// Update Excellence Bonus Row
const excellenceRow = document.getElementById('excellenceBonusRow');
const excellenceText = document.getElementById('excellenceBonusText');
const excellenceValue = document.getElementById('excellenceBonusValue');
if (excellenceEmployees.length > 0) {
if (excellenceRow) excellenceRow.style.display = 'table-row';
if (excellenceText) {
const names = excellenceEmployees.map(e => `${e.name} (${e.branch})`).join(' - ');
excellenceText.innerHTML = `حافز تفوق: ${names}`;
}
if (excellenceValue) {
excellenceValue.innerText = `+${totalExcellenceBonus.toFixed(2)}`;
}
} else {
if (excellenceRow) excellenceRow.style.display = 'none';
}
// Update footer
document.getElementById('footEvalCount').innerText = totalEval;
// footEvalValue removed from display (still calculated but not shown)
// Calculate total evaluation value: Booking (20) + Google Maps (10)
const totalEvalBooking = filtered.reduce((sum, emp) => sum + (emp.evaluationsBooking || 0), 0);
const totalEvalGoogle = filtered.reduce((sum, emp) => sum + (emp.evaluationsGoogle || 0), 0);
const footEvalValue = (totalEvalBooking * 20) + (totalEvalGoogle * 10);
document.getElementById('footBookingCount').innerText = totalBookings;
// إجمالي (عمال + موظفين) = مجموع كل الصافي لكل الموظفين + مجموع كل الصافي للعمال (منفصلين في خانتين)
// الخانة الأولى: نسب العمال (fund) - الخانة الثانية: الصافي للموظفين (net)
document.getElementById('footFund').innerText = totalFund.toFixed(1); // نسب العمال (بدون علامة -)
document.getElementById('footNet').innerText = totalNet.toFixed(2); // الصافي للموظفين
document.getElementById('footNetNoEval').innerText = totalNetNoEval.toFixed(2);
// إجمالي النهائي لكل فريق العمل = مجموع كل الصافي لكل الموظفين + مجموع كل الصافي للعمال (في خانة واحدة فقط)
// الرقم النهائي المجمع = totalNet + totalFund
const finalTotal = totalNet + totalFund; // المجموع النهائي
document.getElementById('footTotalFund').innerText = ''; // إخفاء خانة العمال
document.getElementById('footTotalNet').innerText = finalTotal.toFixed(2); // الرقم النهائي المجمع
// Update statistics
document.getElementById('statEmployees').innerText = filtered.length;
document.getElementById('statBookings').innerText = totalBookings;
document.getElementById('statTotal').innerText = totalNet.toFixed(0);
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
// Update New Cards
document.getElementById('topEarnerName').innerText = maxNet.val > 0 ? (maxNet.name + (filter === 'الكل' ? ` (${maxNet.branch})` : '')) : '-';
document.getElementById('topEarnerValue').innerText = maxNet.val > 0 ? maxNet.val.toFixed(0) + ' ريال' : '-';
document.getElementById('topRatedName').innerText = maxEval.val > 0 ? (maxEval.name + (filter === 'الكل' ? ` (${maxEval.branch})` : '')) : '-';
document.getElementById('topRatedValue').innerText = maxEval.val > 0 ? maxEval.val + ' تقييم' : '-';
document.getElementById('topBookerName').innerText = maxBook.val > 0 ? (maxBook.name + (filter === 'الكل' ? ` (${maxBook.branch})` : '')) : '-';
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
const finalNet = s.net + finalExcellenceBonus + finalCommitmentBonus;
// Badges
const badges = [];
if (finalExcellenceBonus > 0) badges.push('حافز التفوق');
if (finalCommitmentBonus > 0) badges.push('حافز الالتزام');
if (finalAttendance26Days) badges.push('بطل تحدي الظروف');
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

// Generate HTML
const printWindow = window.open('', '_blank');
const reportTitle = filter === 'الكل' ? 'جميع الفروع' : filter;
const printContent = generatePrintHTML(reportTitle, periodText, reportDate, printRows, {
totalFund, totalNet, totalEval, totalBookings, totalNetNoEval,
totalExcellenceBonus, totalCommitmentBonus
});
printWindow.document.write(printContent);
printWindow.document.close();
setTimeout(() => {
printWindow.print();
}, 250);
}
function generatePrintHTML(reportTitle, periodText, reportDate, rows, totals) {
return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>تقرير المكافآت - ${reportTitle}</title>
<style>
@page {
size: A4 portrait;
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
.approval-stamp {
position: fixed;
bottom: 25mm;
left: 50%;
transform: translateX(-50%);
width: 100px;
height: 100px;
border: 3px solid #8b0000;
border-radius: 50%;
background: rgba(255, 255, 255, 0.95);
display: flex;
flex-direction: column;
justify-content: center;
align-items: center;
box-shadow: 0 2px 8px rgba(0,0,0,0.2);
z-index: 1000;
}
.approval-stamp .checkmark {
color: #006400;
font-size: 24px;
font-weight: 900;
margin-bottom: 3px;
}
.approval-stamp .department {
color: #8b0000;
font-size: 10px;
font-weight: 700;
margin-bottom: 2px;
}
.approval-stamp .approved {
color: #8b0000;
font-size: 11px;
font-weight: 800;
}
@media print {
body {
margin: 0;
padding: 0;
}
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
<div class="explanations-section" style="margin-top: 25px; padding-top: 15px; border-top: 2px solid #ddd;">
<h3 style="font-size: 13px; font-weight: 800; color: #000; margin-bottom: 12px; text-align: right;">شرح المبالغ المستحقة:</h3>
<div style="font-size: 9px; line-height: 2; color: #555; font-weight: 300;">
${rows.map((row, index) => {
const baseText = `<strong style="font-weight: 600; color: #000;">${row.name}</strong> (${row.branch}): الصافي الأساسي: ${row.net.toFixed(2)} ريال`;
if (row.explanation) {
return `<div style="margin-bottom: 6px; padding-right: 10px; border-right: 2px solid #e0e0e0; text-align: right;">
${baseText} | ${row.explanation} <strong style="font-weight: 700; color: #006400;">= الإجمالي: ${row.finalNet.toFixed(2)} ريال</strong>
</div>`;
} else {
return `<div style="margin-bottom: 6px; padding-right: 10px; border-right: 2px solid #e0e0e0; text-align: right;">
${baseText} <strong style="font-weight: 700; color: #006400;">= الإجمالي: ${row.finalNet.toFixed(2)} ريال</strong>
</div>`;
}
}).join('')}
</div>
</div>
<div class="footer">
<p>تم إنشاء هذا التقرير تلقائياً بواسطة نظام إدارة المكافآت</p>
<p>تاريخ الطباعة: ${reportDate}</p>
</div>
<div class="approval-stamp">
<div class="checkmark">✓</div>
<div class="department">إدارة التشغيل</div>
<div class="approved">معتمد</div>
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
const toast = document.createElement('div');
toast.className = 'toast';
toast.innerText = message;
if (type === 'error') {
toast.style.background = 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)';
}
document.body.appendChild(toast);
setTimeout(() => {
toast.style.animation = 'slideInRight 0.5s ease-out reverse';
setTimeout(() => toast.remove(), 500);
}, 3000);
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
// === Reports Page Functions ===
let currentReportsBranchFilter = 'الكل';
function showReportsPage() {
const reportsPage = document.getElementById('reportsPage');
const dashboard = document.getElementById('dashboard');
if (!reportsPage || !dashboard) return;
// Hide dashboard and show reports page
dashboard.classList.add('hidden');
reportsPage.classList.remove('hidden');
// Populate reports page
populateReportsPage();
}
function hideReportsPage() {
const reportsPage = document.getElementById('reportsPage');
const dashboard = document.getElementById('dashboard');
if (!reportsPage || !dashboard) return;
// Hide reports page and show dashboard
reportsPage.classList.add('hidden');
dashboard.classList.remove('hidden');
}
function populateReportsPage() {
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
populateReportsPage();
}
function filterReportsEmployees(searchTerm) {
const grid = document.getElementById('reportsEmployeesGrid');
if (!grid) return;
const cards = grid.querySelectorAll('div');
const term = searchTerm.toLowerCase();
cards.forEach(card => {
const text = card.textContent.toLowerCase();
card.style.display = text.includes(term) ? 'block' : 'none';
});
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
const attendance26Days = emp.attendance26Days === true;
// For duplicate employees: check if this branch should get challenge bonus (25%)
const empNameCount = db.filter(e => e.name === emp.name).length;
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
const finalNet = net + excellenceBonus + commitmentBonus;
return {
emp,
rate,
evBooking,
evGoogle,
gross,
fund,
net,
attendanceBonus,
excellenceBonus,
commitmentBonus,
finalNet,
hasExcellenceBonus,
hasCommitmentBonus,
attendance26Days: finalAttendance26Days,
isMostCommitted,
isMostEval,
isMostBook
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
const { emp, rate, evBooking, evGoogle, gross, fund, net, attendanceBonus, excellenceBonus, commitmentBonus, finalNet, hasExcellenceBonus, hasCommitmentBonus, attendance26Days } = report;
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
</div>
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
<span>إجمالي مكافآت الحجوزات:</span>
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
<span>إجمالي مكافآت Booking:</span>
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
<span>إجمالي مكافآت Google Maps:</span>
<span class="font-bold text-yellow-400">${(evGoogle * 10).toFixed(2)} ريال</span>
</div>
<div class="flex justify-between items-center pt-3 border-t-2 border-yellow-500/30 mt-3">
<span class="font-bold text-white">إجمالي مكافآت التقييمات:</span>
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
<span class="font-bold text-white">إجمالي مساهمة شركاء النجاح:</span>
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
<p class="text-xs text-gray-400 mt-1">تم إتمام 26 يوماً وأكثر من العطاء</p>
</div>
` : ''}
${hasExcellenceBonus ? `
<div class="bg-turquoise/20 p-3 rounded-lg border border-turquoise/50">
<div class="flex justify-between items-center mb-1">
<span class="text-gray-300">✨ حافز التفوق:</span>
<span class="font-bold text-turquoise">+${excellenceBonus.toFixed(2)} ريال</span>
</div>
<p class="text-xs text-gray-400 mt-1">الأعلى تقييماً والأكثر حجوزات في ${emp.branch}</p>
</div>
` : ''}
${hasCommitmentBonus ? `
<div class="bg-purple-500/20 p-3 rounded-lg border border-purple-500/50">
<div class="flex justify-between items-center mb-1">
<span class="text-gray-300">✓ حافز التزام:</span>
<span class="font-bold text-purple-400">+${commitmentBonus.toFixed(2)} ريال</span>
</div>
<p class="text-xs text-gray-400 mt-1">الأكثر التزاماً + (الأعلى تقييماً أو الأكثر حجوزات) في ${emp.branch}</p>
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
<div class="flex justify-between items-center pt-3 border-t-2 border-turquoise/50 mt-2">
<span class="text-lg font-bold text-white">المبلغ الصافي المستحق:</span>
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
function printEmployeeReport() {
const modal = document.getElementById('employeeReportModal');
if (!modal) return;
const empId = modal.dataset.empId;
if (!empId) return;
const report = calculateEmployeeReport(empId);
if (!report) return;
const { emp, rate, evBooking, evGoogle, gross, fund, net, attendanceBonus, excellenceBonus, commitmentBonus, finalNet, hasExcellenceBonus, hasCommitmentBonus, attendance26Days, isMostCommitted, isMostEval, isMostBook } = report;
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
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">إتمام 26 يوماً وأكثر من العطاء</span>
</div>
<span><strong style="color: #10b981;">+${attendanceBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
${hasExcellenceBonus ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>✨ حافز التفوق:</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">الأعلى تقييماً (${evBooking} تقييم Booking) والأكثر حجوزات (${emp.count} حجز) في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #14b8a6;">+${excellenceBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
${hasCommitmentBonus ? `
<div class="row" style="border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; margin-bottom: 5px;">
<div style="flex: 1;">
<span>✓ حافز التزام:</span>
<span style="display: block; font-size: 9px; color: #666; margin-top: 2px; margin-right: 15px;">الأكثر التزاماً (26+ يوم)${isMostEval && isMostBook ? ' + الأعلى تقييماً والأكثر حجوزات' : isMostEval ? ' + الأعلى تقييماً' : isMostBook ? ' + الأكثر حجوزات' : ''} في فرع ${emp.branch}</span>
</div>
<span><strong style="color: #a855f7;">+${commitmentBonus.toFixed(2)} ريال</strong></span>
</div>
` : ''}
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
margin: 20mm 15mm;
}
* {
margin: 0;
padding: 0;
box-sizing: border-box;
}
body {
font-family: 'Arial', 'Segoe UI', 'Tahoma', sans-serif;
padding: 25px 20px;
background: #fff;
color: #000;
line-height: 1.6;
direction: rtl;
}
h1 {
font-size: 24px;
font-weight: 900;
color: #000;
margin-bottom: 30px;
text-align: center;
border-bottom: 3px solid #40E0D0;
padding-bottom: 15px;
letter-spacing: 0.5px;
}
.section {
margin-bottom: 25px;
padding: 18px 20px;
border-radius: 10px;
border: 2px solid #ddd;
page-break-inside: avoid;
box-shadow: 0 2px 4px rgba(0,0,0,0.1);
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
h2 {
font-size: 16px;
font-weight: 800;
color: #000;
margin: 0 0 15px 0;
display: flex;
align-items: center;
gap: 8px;
padding-bottom: 8px;
border-bottom: 1px solid rgba(0,0,0,0.1);
}
ul {
list-style: none;
padding: 0;
margin: 0;
}
li {
font-size: 13px;
font-weight: 600;
color: #000;
margin: 12px 0;
padding-right: 25px;
padding-left: 10px;
position: relative;
line-height: 1.8;
text-align: right;
}
li::before {
content: '•';
position: absolute;
right: 0;
top: 0;
font-weight: 900;
color: #000;
font-size: 16px;
}
.highlight-red {
color: #dc2626;
font-weight: 700;
background-color: rgba(220, 38, 38, 0.05);
padding: 10px 15px;
border-radius: 6px;
border-right: 3px solid #dc2626;
}
.highlight-green {
color: #10b981;
font-weight: 700;
background-color: rgba(16, 185, 129, 0.05);
padding: 10px 15px;
border-radius: 6px;
border-right: 3px solid #10b981;
}
@media print {
body {
padding: 15mm 10mm;
}
.section {
page-break-inside: avoid;
margin-bottom: 20px;
}
h1 {
font-size: 22px;
margin-bottom: 25px;
}
h2 {
font-size: 15px;
}
li {
font-size: 12px;
line-height: 1.7;
}
}
</style>
</head>
<body>
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
function initializeFirebase() {
  if (typeof firebase !== 'undefined') {
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebaseApp = firebase.initializeApp(firebaseConfig);
      } else {
        firebaseApp = firebase.apps[0];
      }
      storage = firebase.storage();
      console.log('✅ Firebase initialized');
    } catch (error) {
      console.error('❌ Firebase initialization error:', error);
    }
  }
}

// Wait for Firebase SDK to load
window.addEventListener('load', () => {
  setTimeout(initializeFirebase, 500);
});
