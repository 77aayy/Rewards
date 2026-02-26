/** تحميل xlsx عند الطلب من App.tsx (ديناميكي) لتحسين وقت التحميل الأولي. */
let _xlsxModule: typeof import('xlsx') | null = null;
export function setXLSXModule(m: typeof import('xlsx')) {
  _xlsxModule = m;
}
function getXLSX(): typeof import('xlsx') {
  if (!_xlsxModule) throw new Error('XLSX not loaded; call setXLSXModule after dynamic import');
  return _xlsxModule;
}

/** حد أقصى لحجم ملف Excel (10MB) — تخفيف من ReDoS/استهلاك الموارد. الحزمة: SheetJS من CDN الرسمي (xlsx-0.20.3). تقييد الحجم والنوع في App.tsx قبل القراءة. */
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

function assertFileSize(buffer: ArrayBuffer): void {
  if (buffer.byteLength > MAX_FILE_SIZE_BYTES) {
    throw new Error('الملف أكبر من الحد المسموح (10 ميجابايت)');
  }
}
import type {
  ShiftType,
  BookingSource,
  RoomCategory,
  ExcessReason,
  StaffRecord,
  MatchedRow,
  StaffFileStats,
  LogFileStats,
  ReportFileStats,
  AttendanceDayStatus,
  AttendanceDayResult,
  AttendanceFileResult,
} from './types';
import type { AppConfig, MergedRoomRule } from './config';
import { getMinPriceFromConfig } from './config';

// ===================================================================
// 1. Header-Based Column Discovery
// ===================================================================

/**
 * Aliases: multiple possible header texts → one canonical field name.
 * We scan the first N rows looking for a row that matches these headers.
 */
type HeaderAliases = Record<string, string[]>;

const REPORT_HEADER_ALIASES: HeaderAliases = {
  employeeName: ['المستخدم', 'اسم المستخدم', 'الموظف'],
  creationTime: ['تاريخ/وقت الإنشاء', 'تاريخ الإنشاء', 'تاريخ/وقت الانشاء'],
  bookingSource: ['مصدر الحجز', 'المصدر'],
  totalPrice: ['الاجمالي', 'الإجمالي', 'المبلغ الإجمالي'],
  rentOnly: ['الايجار الكلي', 'الإيجار الكلي', 'صافي الإيجار'],
  nights: ['مدة الحجز', 'عدد الليالي', 'الليالي'],
  checkoutDate: ['تاريخ الخروج'],
  checkInTime: ['تاريخ الدخول'],
  status: ['حالة الحجز'],
  bookingNumber: ['رقم الحجز'],
  roomUnit: ['رقم الوحدة', 'الوحدة', 'الوحدات'],
  guestName: ['إسم العميل', 'اسم العميل', 'العميل', 'إسم النزيل'],
};

const LOG_HEADER_ALIASES: HeaderAliases = {
  employeeName: ['المستخدم', 'اسم المستخدم', 'الموظف'],
  changeText: ['التفاصيل', 'تفاصيل الحركة', 'الوصف'],
  bookingInfo: ['معلومات الحجز', 'الحجز', 'رقم الحجز'],
  dateTime: ['التاريخ', 'تاريخ/وقت', 'التاريخ والوقت'],
};

const STAFF_HEADER_ALIASES: HeaderAliases = {
  bookingCount: ['عدد الحجوزات', 'الحجوزات'],
  employeeName: ['اسم الموظف', 'الموظف', 'المستخدم'],
};

const UNITS_HEADER_ALIASES: HeaderAliases = {
  employeeName: ['المستخدم', 'اسم المستخدم'],
  rent: ['قيمة الإيجار', 'الإيجار', 'صافي الإيجار'],
  nights: ['الليالي المباعة', 'عدد الليالي', 'الليالي'],
  checkoutDate: ['تاريخ الخروج'],
  checkInTime: ['تاريخ الدخول'],
  floor: ['الطابق'],
  roomType: ['نوع الوحدة', 'النوع'],
  roomUnit: ['رقم الوحدة', 'الوحدة'],
};

/** Fallback column indices (matching the current known Excel layout) */
const REPORT_DEFAULTS: Record<string, number> = {
  employeeName: 0, creationTime: 4, bookingSource: 7,
  totalPrice: 19, rentOnly: 27, nights: 31,
  checkoutDate: 34, checkInTime: 37, status: 40,
  bookingNumber: 41, roomUnit: 42, guestName: 48,
};

const LOG_DEFAULTS: Record<string, number> = {
  employeeName: 26, changeText: 3, bookingInfo: 15, dateTime: 32,
};

const STAFF_DEFAULTS: Record<string, number> = {
  bookingCount: 27, employeeName: 28,
};

const UNITS_DEFAULTS: Record<string, number> = {
  employeeName: 1, rent: 6, nights: 8,
  checkoutDate: 15, checkInTime: 17, floor: 21,
  roomType: 26, roomUnit: 30,
};

/**
 * Scan the first N rows for a header row that matches known column names.
 * Returns discovered column positions merged with defaults (discovered values override).
 */
function discoverColumnMap(
  rows: unknown[][],
  aliases: HeaderAliases,
  defaults: Record<string, number>,
  maxScanRows = 25,
): { col: Record<string, number>; headerRow: number } {
  // Build reverse lookup: trimmed header text → canonical name
  const reverse = new Map<string, string>();
  for (const [canonical, alts] of Object.entries(aliases)) {
    for (const alt of alts) {
      reverse.set(alt.trim(), canonical);
    }
  }

  let bestMatch: Record<string, number> = {};
  let bestRow = -1;
  let bestCount = 0;

  for (let r = 0; r < Math.min(maxScanRows, rows.length); r++) {
    const row = rows[r];
    if (!row || row.length < 3) continue;

    const tempMap: Record<string, number> = {};
    let matchCount = 0;

    for (let c = 0; c < row.length; c++) {
      const cellText = String(row[c] ?? '').trim();
      if (!cellText) continue;
      const canonical = reverse.get(cellText);
      if (canonical && !(canonical in tempMap)) {
        tempMap[canonical] = c;
        matchCount++;
      }
    }

    if (matchCount > bestCount) {
      bestMatch = tempMap;
      bestRow = r;
      bestCount = matchCount;
    }
  }

  // If we found at least 3 matching headers, use discovered + defaults for missing
  if (bestCount >= 3) {
    const merged: Record<string, number> = { ...defaults };
    for (const [k, v] of Object.entries(bestMatch)) {
      merged[k] = v;
    }
    return { col: merged, headerRow: bestRow };
  }

  // Fall back entirely to defaults
  return { col: { ...defaults }, headerRow: -1 };
}

/**
 * Find the first data row after the discovered header row.
 * Skips any sub-header or empty rows between the header and actual data.
 */
function findDataStartRow(
  rows: unknown[][],
  headerRow: number,
  col: Record<string, number>,
  defaultStart: number,
): number {
  if (headerRow < 0) return defaultStart;
  const primaryCol = Object.values(col)[0] ?? 0;

  for (let r = headerRow + 1; r < Math.min(headerRow + 10, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    const val = String(row[primaryCol] ?? '').trim();
    if (val && val.length > 0) return r;
  }

  return headerRow + 1;
}

// ===================================================================
// 2. Dynamic Branch Detection
// ===================================================================

/**
 * Extract a branch name from a cell value.
 * Handles both English names (Corniche, Andalous) and Arabic names.
 * For unknown patterns, tries "Adora- XXX" format.
 */
function detectBranchFromCell(cell: string): string {
  const lower = cell.toLowerCase().trim();
  if (!lower || lower.length < 3) return '';

  // Known patterns → normalized Arabic names
  if (lower.includes('corniche') || lower.includes('كورنيش')) return 'الكورنيش';
  if (lower.includes('andalous') || lower.includes('أندلس') || lower.includes('اندلس')) return 'الأندلس';
  if (lower.includes('batin') || lower.includes('باطن') || lower.includes('حفر')) return 'حفر الباطن';

  // Try "Adora- XXX" or "Hotel XXX" pattern
  const adoraMatch = cell.match(/(?:adora|فندق)\s*[-–:]\s*(.+)/i);
  if (adoraMatch) {
    const branchPart = adoraMatch[1].trim();
    if (branchPart.length >= 2) return branchPart;
  }

  return '';
}

/**
 * Scan the first rows of a file to detect the branch name.
 */
function detectBranchFromContent(rows: unknown[][]): string {
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < Math.min(5, row.length); c++) {
      const cell = String(row[c] ?? '').trim();
      const branch = detectBranchFromCell(cell);
      if (branch) return branch;
    }
  }
  return '';
}

/**
 * Get all branch names from a Staff file.
 */
export function getStaffBranches(buffer: ArrayBuffer): string[] {
  const rows = readSheet(buffer);
  const branches: string[] = [];
  for (let r = 0; r < rows.length; r++) {
    const cell0 = String(rows[r]?.[0] ?? '').trim();
    const branch = detectBranchFromCell(cell0);
    if (branch && !branches.includes(branch)) branches.push(branch);
  }
  return branches;
}

// ===================================================================
// 3. File Type Detection (Content-Based)
// ===================================================================

export interface FileDetectionResult {
  slotKey: string;   // e.g. 'report-الكورنيش', 'staff'
  baseType: 'staff' | 'log' | 'report' | 'units' | 'actualDates' | 'unknown';
  branch: string;    // Arabic branch name, '' for staff/unknown
}

export function getFileTypeLabel(baseType: string, branch: string): string {
  const typeLabels: Record<string, string> = {
    staff: 'تقرير إحصائيات الموظفين',
    log: 'سجل حركات النظام',
    report: 'تقرير حجوزات العملاء',
    units: 'تقرير وحدات الحجوزات',
    actualDates: 'تقرير التواريخ الفعلية للحجوزات',
    unknown: 'ملف غير معروف',
  };
  const base = typeLabels[baseType] || 'ملف';
  return branch ? `${base} — ${branch}` : base;
}

export function getFileTypeIcon(baseType: string): { color: string; bg: string } {
  const icons: Record<string, { color: string; bg: string }> = {
    staff: { color: 'text-cyan-400', bg: 'bg-cyan-500/20' },
    log: { color: 'text-teal-400', bg: 'bg-teal-500/20' },
    report: { color: 'text-sky-400', bg: 'bg-sky-500/20' },
    units: { color: 'text-amber-400', bg: 'bg-amber-500/20' },
    actualDates: { color: 'text-violet-400', bg: 'bg-violet-500/20' },
    unknown: { color: 'text-[var(--adora-error)]', bg: 'bg-adora-error-subtle' },
  };
  return icons[baseType] || icons.unknown;
}

export function detectFileType(buffer: ArrayBuffer): FileDetectionResult {
  assertFileSize(buffer);
  const XLSX = getXLSX();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0] || '';
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
    header: 1, defval: '',
  }) as unknown[][];

  const sn = sheetName.toLowerCase();
  let baseType: 'staff' | 'log' | 'report' | 'units' | 'actualDates' | 'unknown' = 'unknown';

  if (sn.includes('userstatisticsreport')) baseType = 'staff';
  else if (sn.includes('activitylog')) baseType = 'log';
  else if (sn.includes('resesrvationsunits') || sn.includes('reservationsunits')) baseType = 'units';
  else if (sn.includes('guestsstatistical')) baseType = 'report';
  else if (sn.includes('actualdates') || sn.includes('resesrvationactual') || sn.includes('resesrvatinactual')) baseType = 'actualDates';
  else {
    for (let r = 0; r < Math.min(20, rows.length); r++) {
      const row = rows[r];
      if (!row) continue;
      const rowText = row.map((c) => String(c ?? '')).join(' ');
      if (rowText.includes('عدد الحجوزات') || rowText.includes('تقرير إحصائيات المستخدمين')) { baseType = 'staff'; break; }
      if (rowText.includes('تقرير سجل الحركات') || rowText.includes('إنشاء حجز جديد')) { baseType = 'log'; break; }
      if (rowText.includes('تقرير وحدات الحجوزات')) { baseType = 'units'; break; }
      if (rowText.includes('تقرير حجوزات العملاء') || rowText.includes('مصدر الحجز')) { baseType = 'report'; break; }
      if (rowText.includes('الدخول والخروج الفعلي للحجوزات') || rowText.includes('تقرير تسجيل الدخول والخروج الفعلي')) { baseType = 'actualDates'; break; }
    }
  }

  if (baseType === 'staff') return { slotKey: 'staff', baseType, branch: '' };
  if (baseType === 'unknown') return { slotKey: 'unknown', baseType, branch: '' };

  // Detect branch from content
  const branch = detectBranchFromContent(rows);
  const slotKey = branch ? `${baseType}-${branch}` : `${baseType}-unknown`;
  return { slotKey, baseType, branch };
}

// ===================================================================
// 4. Helper Functions
// ===================================================================

function getShiftFromTime(date: Date): ShiftType {
  const totalMins = date.getHours() * 60 + date.getMinutes();
  if (totalMins >= 360 && totalMins < 960) return 'صباح';
  if (totalMins >= 960) return 'مساء';
  return 'ليل';
}

function parseDateTime(str: string): Date | null {
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hour = parseInt(m[4], 10);
  if (m[6].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (m[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), hour, parseInt(m[5]));
}

function parseDateOnly(str: string): Date | null {
  let m = str.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
  m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]));
  return null;
}

function normalizeBookingSource(raw: string): BookingSource {
  if (raw.includes('استقبال')) return 'استقبال';
  if (raw.includes('بوكينج') || raw.toLowerCase().includes('booking')) return 'بوكينج';
  return 'غير محدد';
}

function classifyRoom(roomUnit: string): RoomCategory {
  if (!roomUnit) return 'عادي';
  const lower = roomUnit.toLowerCase();
  if (lower.includes('vip')) return 'VIP';
  if (lower.includes('جناح') || lower.includes('سويت') || lower.includes('suite') ||
      lower.includes('بنتهاوس') || lower.includes('رويال') || lower.includes('royal')) return 'VIP';
  return 'عادي';
}

export function extractRoomNumber(roomUnit: string): string {
  const m = roomUnit.match(/^(\d{3})/);
  return m ? m[1] : '';
}

function readSheet(buffer: ArrayBuffer) {
  assertFileSize(buffer);
  const XLSX = getXLSX();
  const wb = XLSX.read(buffer, { type: 'array' });
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], {
    header: 1, defval: '',
  }) as unknown[][];
}

function formatYMD(raw: string): string {
  const d = raw.split(' ')[0] || '';
  if (d.includes('-')) { const [y, m, day] = d.split('-'); return `${day}/${m}/${y}`; }
  return d;
}

// ===================================================================
// 5. Quick Stats (on upload — no config needed)
// ===================================================================

export function getStaffFileStats(buffer: ArrayBuffer): StaffFileStats {
  const rows = readSheet(buffer);
  const { col } = discoverColumnMap(rows, STAFF_HEADER_ALIASES, STAFF_DEFAULTS);

  // Date range: try known positions first, then scan
  let dateFrom = formatYMD(String(rows[10]?.[26] ?? ''));
  let dateTo = formatYMD(String(rows[10]?.[11] ?? ''));
  if (!parseDateOnly(dateFrom) || !parseDateOnly(dateTo)) {
    const dates: { str: string; d: Date }[] = [];
    for (let r = 0; r < Math.min(15, rows.length); r++) {
      const row = rows[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        const val = String(row[c] ?? '').trim();
        const d = parseDateOnly(val);
        if (d) dates.push({ str: val, d });
      }
    }
    if (dates.length >= 2) {
      dates.sort((a, b) => a.d.getTime() - b.d.getTime());
      dateFrom = formatYMD(dates[0].str);
      dateTo = formatYMD(dates[dates.length - 1].str);
    }
  }

  let activeEmployees = 0;
  let inSection = false;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const bookCountVal = String(row[col.bookingCount] ?? '').trim();
    if (bookCountVal === 'عدد الحجوزات') { inSection = true; continue; }
    const name = String(row[col.employeeName] ?? '').trim();
    if (name === 'المجموع') { inSection = false; continue; }
    if (!inSection || !name) continue;
    if ((parseInt(bookCountVal, 10) || 0) > 0) activeEmployees++;
  }

  return { activeEmployees, dateFrom, dateTo };
}

export function getStaffDateRange(buffer: ArrayBuffer): { from: Date; to: Date } | null {
  const rows = readSheet(buffer);

  // Try known positions first
  const fromKnown = parseDateOnly(String(rows[10]?.[26] ?? ''));
  const toKnown = parseDateOnly(String(rows[10]?.[11] ?? ''));
  if (fromKnown && toKnown) return { from: fromKnown, to: toKnown };

  // Dynamic: scan first 15 rows for all date-like values
  const dates: Date[] = [];
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] ?? '').trim();
      const d = parseDateOnly(val);
      if (d) dates.push(d);
    }
  }
  if (dates.length >= 2) {
    dates.sort((a, b) => a.getTime() - b.getTime());
    return { from: dates[0], to: dates[dates.length - 1] };
  }

  return null;
}

export function getLogFileStats(buffer: ArrayBuffer): LogFileStats {
  const rows = readSheet(buffer);
  const { col, headerRow } = discoverColumnMap(rows, LOG_HEADER_ALIASES, LOG_DEFAULTS);
  const dataStart = findDataStartRow(rows, headerRow, col, 16);

  let newBookings = 0;
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    if (String(row[col.employeeName] ?? '').trim() &&
        String(row[col.changeText] ?? '').trim().length >= 30) {
      newBookings++;
    }
  }
  return { newBookings };
}

export function getReportFileStats(buffer: ArrayBuffer): ReportFileStats {
  const rows = readSheet(buffer);
  const { col, headerRow } = discoverColumnMap(rows, REPORT_HEADER_ALIASES, REPORT_DEFAULTS);
  const dataStart = findDataStartRow(rows, headerRow, col, 11);

  let bookings = 0;
  for (let i = dataStart; i < rows.length; i++) {
    const num = String(rows[i]?.[col.bookingNumber] ?? '').trim();
    if (num && num.length >= 3) bookings++;
  }
  return { bookings };
}

export function getUnitsFileStats(buffer: ArrayBuffer): { bookings: number; units: number } {
  const rows = readSheet(buffer);
  let bookings = 0;
  let units = 0;

  const { col, headerRow } = discoverColumnMap(rows, UNITS_HEADER_ALIASES, UNITS_DEFAULTS);
  const dataStart = findDataStartRow(rows, headerRow, col, 14);

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    // Booking header: any cell containing "رقم الحجز"
    if (findBookingHeaderInRow(row)) { bookings++; continue; }
    const empName = String(row[col.employeeName] ?? '').trim();
    const rentVal = String(row[col.rent] ?? '').trim();
    if (empName && rentVal && empName !== 'المستخدم' && empName !== 'المجموع') units++;
  }
  return { bookings, units };
}

/** تقرير التواريخ الفعلية — عدد صفوف البيانات (الهيدر في الصف 15، البيانات من 16) */
export function getActualDatesFileStats(buffer: ArrayBuffer): { rows: number } {
  const rows = readSheet(buffer);
  const headerRow = 15;
  let count = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const user = String(row[1] ?? '').trim();
    if (user && user !== 'المستخدم') count++;
  }
  return { rows: count };
}

// ===================================================================
// 6. Full Parsers (with column discovery)
// ===================================================================

// --- Staff Parser ---

export function parseStaffFile(buffer: ArrayBuffer, config: AppConfig): StaffRecord[] {
  const rows = readSheet(buffer);
  const { col } = discoverColumnMap(rows, STAFF_HEADER_ALIASES, STAFF_DEFAULTS);

  const skip = new Set(['المجموع', 'اسم الموظف', '']);
  const raw: StaffRecord[] = [];
  let currentBranch = '';
  let inSection = false;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    // Dynamic branch detection from cell[0]
    const cell0 = String(row[0] ?? '').trim();
    const detectedBranch = detectBranchFromCell(cell0);
    if (detectedBranch) currentBranch = detectedBranch;

    const bookCountVal = String(row[col.bookingCount] ?? '').trim();
    if (bookCountVal === 'عدد الحجوزات') { inSection = true; continue; }
    const name = String(row[col.employeeName] ?? '').trim();
    if (name === 'المجموع') { inSection = false; continue; }
    if (!inSection || !name || skip.has(name)) continue;

    // Check if branch is excluded via config
    if (config.branches[currentBranch]?.excluded) continue;

    raw.push({ name, bookingCount: parseInt(bookCountVal, 10) || 0, branch: currentBranch });
  }

  // Apply minimum booking threshold from config
  const combined: Record<string, number> = {};
  for (const r of raw) combined[r.name] = (combined[r.name] || 0) + r.bookingCount;
  return raw.filter((r) => (combined[r.name] || 0) >= config.minBookingThreshold);
}

// --- Change Log Parser ---

export interface LogBooking {
  employeeName: string;
  bookingNumber: string;
  creationDateTime: string;
  checkinDateStr: string;
  checkinDate: Date | null;
  checkoutDateStr: string;
  checkoutDate: Date | null;
  nights: number;
  guestName: string;
  roomUnit: string;
  roomCategory: RoomCategory;
  priceSAR: number;
  shift: ShiftType;
  branch: string;
  /** حركة إنشاء حجز جديد (من تفاصيل الحركة في السجل) */
  isCreation: boolean;
}

function parseChangeText(text: string): {
  guest: string; unit: string; price: number;
  checkinDateStr: string; checkoutDateStr: string;
} {
  const guestMatch = text.match(/العميل\s*\(قديم\)\s*\(جديد\)\s*(.*?)\s*نوع/);
  const guest = guestMatch ? guestMatch[1].trim() : '';
  const unitMatch = text.match(/الوحدات\s*\(قديم\)\s*\(جديد\)\s*(.*?)\s*الأسعار/);
  const unit = unitMatch ? unitMatch[1].trim() : '';
  // Sum ALL SAR prices in the text (merged bookings have one per room)
  const allPrices = text.matchAll(/\(\s*([\d,.]+)\s*SAR\s*\)/g);
  let price = 0;
  for (const m of allPrices) {
    price += parseFloat(m[1].replace(',', '')) || 0;
  }
  const checkinMatch = text.match(/تاريخ الدخول\s*\(قديم\)\s*\(جديد\)\s*(\d{2}\/\d{2}\/\d{4})/);
  const checkinDateStr = checkinMatch ? checkinMatch[1] : '';
  const checkoutMatch = text.match(/تاريخ الخروج\s*\(قديم\)\s*\(جديد\)\s*(\d{2}\/\d{2}\/\d{4})/);
  const checkoutDateStr = checkoutMatch ? checkoutMatch[1] : '';
  return { guest, unit, price, checkinDateStr, checkoutDateStr };
}

export function parseChangeLog(buffer: ArrayBuffer, branchName: string): LogBooking[] {
  const rows = readSheet(buffer);
  const { col, headerRow } = discoverColumnMap(rows, LOG_HEADER_ALIASES, LOG_DEFAULTS);
  const dataStart = findDataStartRow(rows, headerRow, col, 16);

  const bookings: LogBooking[] = [];

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const employeeName = String(row[col.employeeName] ?? '').trim();
    const changeText = String(row[col.changeText] ?? '').trim();
    const bookingInfo = String(row[col.bookingInfo] ?? '').trim();
    const dateTimeStr = String(row[col.dateTime] ?? '').trim();
    if (!employeeName || !changeText || changeText.length < 30) continue;

    const numMatch = bookingInfo.match(/رقم الحجز[:\s]*(\d+)/);
    const bookingNumber = numMatch ? numMatch[1] : '';
    const isCreation = /إنشاء\s*حجز|حجز\s*جديد|إضافة\s*حجز|تم\s*إنشاء/i.test(changeText);
    const parsed = parseChangeText(changeText);
    const creationDate = parseDateTime(dateTimeStr);
    const shift: ShiftType = creationDate ? getShiftFromTime(creationDate) : 'صباح';
    const checkinDate = parsed.checkinDateStr ? parseDateOnly(parsed.checkinDateStr) : null;
    const checkoutDate = parsed.checkoutDateStr ? parseDateOnly(parsed.checkoutDateStr) : null;

    let nights = 1;
    if (checkinDate && checkoutDate && checkoutDate > checkinDate) {
      nights = Math.round((checkoutDate.getTime() - checkinDate.getTime()) / 86400000);
    }

    bookings.push({
      employeeName,
      bookingNumber,
      creationDateTime: dateTimeStr,
      checkinDateStr: parsed.checkinDateStr,
      checkinDate,
      checkoutDateStr: parsed.checkoutDateStr,
      checkoutDate,
      nights,
      guestName: parsed.guest,
      roomUnit: parsed.unit,
      roomCategory: classifyRoom(parsed.unit),
      priceSAR: parsed.price,
      shift,
      branch: branchName,
      isCreation,
    });
  }
  return bookings;
}

// --- Report Parser (PRIMARY data source) ---

export interface ReportBooking {
  employeeName: string;
  bookingNumber: string;
  bookingSource: BookingSource;
  guestName: string;
  roomUnit: string;
  priceSAR: number;
  nights: number;
  checkInTime: string;
  checkoutDateStr: string;
  creationTime: string;
  shift: ShiftType;
  branch: string;
}

export function parseReportFile(buffer: ArrayBuffer, branchName: string): ReportBooking[] {
  const rows = readSheet(buffer);
  const { col, headerRow } = discoverColumnMap(rows, REPORT_HEADER_ALIASES, REPORT_DEFAULTS);
  const dataStart = findDataStartRow(rows, headerRow, col, 16);

  const bookings: ReportBooking[] = [];

  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const bookingNumber = String(row[col.bookingNumber] ?? '').trim();
    if (!bookingNumber || bookingNumber.length < 3) continue;

    const employeeName = String(row[col.employeeName] ?? '').trim();
    if (!employeeName) continue;

    const rawSource = String(row[col.bookingSource] ?? '').trim();
    const bookingSource = normalizeBookingSource(rawSource);
    const guestName = String(row[col.guestName] ?? '').trim();
    const roomUnit = String(row[col.roomUnit] ?? '').replace(/\s+/g, ' ').trim();

    // Price: rentOnly (clean rent) preferred, fallback totalPrice
    const rentOnly = parseFloat(String(row[col.rentOnly] ?? 0)) || 0;
    const totalPrice = parseFloat(String(row[col.totalPrice] ?? 0)) || 0;
    const priceSAR = rentOnly > 0 ? rentOnly : totalPrice;

    const nights = parseInt(String(row[col.nights] ?? 0)) || 1;
    const checkInTime = String(row[col.checkInTime] ?? '').trim();
    const checkoutDateStr = String(row[col.checkoutDate] ?? '').trim();
    const creationTime = String(row[col.creationTime] ?? '').trim();

    const creationDate = parseDateTime(creationTime);
    const shift: ShiftType = creationDate ? getShiftFromTime(creationDate) : 'صباح';

    bookings.push({
      employeeName,
      bookingNumber,
      bookingSource,
      guestName,
      roomUnit,
      priceSAR,
      nights,
      checkInTime,
      checkoutDateStr,
      creationTime,
      shift,
      branch: branchName,
    });
  }
  return bookings;
}

// --- Units Report Parser ---

export interface UnitRecord {
  bookingNumber: string;
  guestName: string;
  employeeName: string;
  roomUnit: string;
  roomType: string;
  floor: string;
  priceSAR: number;
  nights: number;
  checkInTime: string;
  checkoutDateStr: string;
  branch: string;
}

/**
 * Find a booking header row ("رقم الحجز. XXXXX - ...") in any cell.
 */
function findBookingHeaderInRow(row: unknown[]): string | null {
  for (let c = 0; c < row.length; c++) {
    const val = String(row[c] ?? '').trim();
    if (val.includes('رقم الحجز')) return val;
  }
  return null;
}

export function parseUnitsReport(buffer: ArrayBuffer, branchName: string): UnitRecord[] {
  const rows = readSheet(buffer);
  const { col, headerRow } = discoverColumnMap(rows, UNITS_HEADER_ALIASES, UNITS_DEFAULTS);
  const dataStart = findDataStartRow(rows, headerRow, col, 14);

  const units: UnitRecord[] = [];
  let currentBookingNumber = '';
  let currentGuestName = '';

  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;

    // Booking header: any cell containing "رقم الحجز. XXXXX"
    const headerText = findBookingHeaderInRow(row);
    if (headerText) {
      const numMatch = headerText.match(/رقم الحجز\.\s*(\d+)/);
      currentBookingNumber = numMatch ? numMatch[1] : '';
      const parts = headerText.split(' - ');
      currentGuestName = parts.length > 0 ? parts[parts.length - 1].trim() : '';
      continue;
    }

    // Data row: has employee name and rent value
    const employeeName = String(row[col.employeeName] ?? '').trim();
    const rentStr = String(row[col.rent] ?? '').trim();
    if (!employeeName || employeeName === 'المستخدم' || employeeName === 'المجموع') continue;
    if (!rentStr) continue;

    const priceSAR = parseFloat(rentStr) || 0;
    const nights = parseInt(String(row[col.nights] ?? 0)) || 1;
    const checkoutDateStr = String(row[col.checkoutDate] ?? '').trim();
    const checkInTime = String(row[col.checkInTime] ?? '').trim();
    const floor = String(row[col.floor] ?? '').trim();
    const roomType = String(row[col.roomType] ?? '').trim();
    const roomUnit = String(row[col.roomUnit] ?? '').trim();

    if (currentBookingNumber) {
      units.push({
        bookingNumber: currentBookingNumber,
        guestName: currentGuestName,
        employeeName,
        roomUnit,
        roomType,
        floor,
        priceSAR,
        nights,
        checkInTime,
        checkoutDateStr,
        branch: branchName,
      });
    }
  }
  return units;
}

// ===================================================================
// 7. Lookup Builders
// ===================================================================

export function buildLogLookup(logBookings: LogBooking[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const b of logBookings) {
    if (b.bookingNumber && b.roomUnit) {
      map.set(`${b.bookingNumber}|${b.branch}`, b.roomUnit);
    }
  }
  return map;
}

/**
 * توزيع الشفتات من سجل النشاط — حركات "إنشاء حجز" فقط، مع فلتر الفترة.
 * يُستخدم للمطابقة مع المرجع عندما السجل يعطي عددًا كافيًا (لا توزيع عشوائي).
 */
export function getLogCreationShiftCounts(
  logBookings: LogBooking[],
  dateRange: { from: Date; to: Date } | null,
): Record<string, { صباح: number; مساء: number; ليل: number; total: number }> {
  const out: Record<string, { صباح: number; مساء: number; ليل: number; total: number }> = {};
  for (const b of logBookings) {
    if (!b.isCreation) continue;
    if (dateRange) {
      const d = parseDateOnly(b.creationDateTime);
      if (!d || d < dateRange.from || d > dateRange.to) continue;
    }
    const key = `${b.branch}|${b.employeeName}`;
    if (!out[key]) out[key] = { صباح: 0, مساء: 0, ليل: 0, total: 0 };
    out[key].total++;
    if (b.shift === 'صباح') out[key].صباح++;
    else if (b.shift === 'مساء') out[key].مساء++;
    else out[key].ليل++;
  }
  return out;
}

export function buildUnitsLookup(
  units: UnitRecord[]
): Map<string, { totalRent: number; unitCount: number; perUnitPrices: { room: string; type: string; price: number; nights: number }[] }> {
  const map = new Map<string, { totalRent: number; unitCount: number; perUnitPrices: { room: string; type: string; price: number; nights: number }[] }>();
  for (const u of units) {
    const key = `${u.bookingNumber}|${u.branch}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { totalRent: 0, unitCount: 0, perUnitPrices: [] };
      map.set(key, entry);
    }
    entry.totalRent += u.priceSAR;
    entry.unitCount++;
    entry.perUnitPrices.push({
      room: u.roomUnit,
      type: u.roomType,
      price: u.priceSAR,
      nights: u.nights,
    });
  }
  return map;
}

// ===================================================================
// 8. Inline Merge Detection (config-based)
// ===================================================================

/**
 * Check if two room numbers form a merged pair using branch rules from config.
 */
function getMergedTypeFromRules(rules: MergedRoomRule[], roomNum1: string, roomNum2: string): string | null {
  const n1 = parseInt(roomNum1, 10);
  const n2 = parseInt(roomNum2, 10);
  if (isNaN(n1) || isNaN(n2)) return null;
  // Skip VIP floor (6xx)
  if (Math.floor(n1 / 100) === 6 || Math.floor(n2 / 100) === 6) return null;
  // Must be same floor
  if (Math.floor(n1 / 100) !== Math.floor(n2 / 100)) return null;
  const sorted = [n1 % 10, n2 % 10].sort((a, b) => a - b);

  for (const rule of rules) {
    const [d1, d2] = rule.digitPairs;
    if (sorted[0] === d1 && sorted[1] === d2) return rule.label;
  }
  return null;
}

/**
 * Detect inline merge from a single unit text containing multiple rooms.
 * e.g. "101 (ستوديو كينج ),102 (جناح مع اطلالة)"
 * Now uses config to check if the branch has merged room rules.
 */
function detectInlineMerge(
  roomUnit: string,
  branch: string,
  config: AppConfig,
): { mergeType: string; roomCount: number } | null {
  const bc = config.branches[branch];
  if (!bc || bc.mergedRules.length === 0) return null;

  const roomNums = roomUnit.match(/\d{3}/g);
  if (!roomNums || roomNums.length < 2) return null;

  // Try all pairs to find a valid merge
  for (let i = 0; i < roomNums.length; i++) {
    for (let j = i + 1; j < roomNums.length; j++) {
      const mt = getMergedTypeFromRules(bc.mergedRules, roomNums[i], roomNums[j]);
      if (mt) return { mergeType: mt, roomCount: roomNums.length };
    }
  }
  return null;
}

// ===================================================================
// 9. Aggregation: Report = PRIMARY + Staff = CAP + Config-Based Pricing
// ===================================================================

export function aggregateData(
  staff: StaffRecord[],
  reportBookings: ReportBooking[],
  logLookup: Map<string, string>,
  unitsLookup: Map<string, { totalRent: number; unitCount: number; perUnitPrices: { room: string; type: string; price: number; nights: number }[] }>,
  dateRange: { from: Date; to: Date } | null,
  config: AppConfig,
): MatchedRow[] {
  // 1. Staff reference — the definitive count
  const staffMap: Record<string, number> = {};
  const staffCombined: Record<string, number> = {};
  for (const s of staff) {
    const key = `${s.branch}|${s.name}`;
    staffMap[key] = (staffMap[key] || 0) + s.bookingCount;
    staffCombined[s.name] = (staffCombined[s.name] || 0) + s.bookingCount;
  }

  // Filter: BOTH creation date AND check-in date must fall within the ALL STAFF period.
  // Also track bookings that pass date filter but checkout AFTER period end (still in-house guests).
  const periodEnd = dateRange ? dateRange.to : null;
  const filteredBookings: ReportBooking[] = [];
  const stillInHouseKeys = new Set<string>(); // bookingNumber|branch keys for guests not yet checked out

  for (const b of reportBookings) {
    if (dateRange) {
      const creationDate = parseDateOnly(b.creationTime);
      const checkinDate = parseDateOnly(b.checkInTime);
      const creationOk = !creationDate || (creationDate >= dateRange.from && creationDate <= dateRange.to);
      const checkinOk = !checkinDate || (checkinDate >= dateRange.from && checkinDate <= dateRange.to);
      if (!creationOk || !checkinOk) continue;
    }
    filteredBookings.push(b);

    // Check if checkout is after the period end — guest still in-house at report time
    if (periodEnd) {
      const checkoutDate = parseDateOnly(b.checkoutDateStr);
      if (checkoutDate && checkoutDate > periodEnd) {
        stillInHouseKeys.add(`${b.bookingNumber}|${b.branch}`);
      }
    }
  }

  // Exclude employees with combined bookings below threshold
  const excludedEmployees = new Set<string>();
  for (const [name, count] of Object.entries(staffCombined)) {
    if (count < config.minBookingThreshold) excludedEmployees.add(name);
  }
  for (const b of filteredBookings) {
    if (!(b.employeeName in staffCombined)) excludedEmployees.add(b.employeeName);
  }

  // 2. Detect inline-merged rooms (config-based)
  const inlineMergeInfo = new Map<string, { mergeType: string; roomCount: number }>();
  for (const b of filteredBookings) {
    const inline = detectInlineMerge(b.roomUnit, b.branch, config);
    if (inline && b.bookingNumber) {
      inlineMergeInfo.set(`${b.bookingNumber}|${b.branch}`, inline);
    }
  }

  // 3. Group by employee-branch
  const groups: Record<string, ReportBooking[]> = {};
  for (const b of filteredBookings) {
    if (excludedEmployees.has(b.employeeName)) continue;
    const key = `${b.branch}|${b.employeeName}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(b);
  }

  // 4. Cap at staff count and compute pricing
  const result: MatchedRow[] = [];

  for (const [key, entries] of Object.entries(groups)) {
    const staffCount = staffMap[key] || 0;
    const reportTotal = entries.length;

    // Sort priority:
    //   0 = VIP / Night shift (protected — always counted first)
    //   1 = Regular bookings (counted next)
    //   2 = Still-in-house guests (checkout after period — most likely cause of mismatch, counted last)
    entries.sort((a, b) => {
      const aStillIn = stillInHouseKeys.has(`${a.bookingNumber}|${a.branch}`);
      const bStillIn = stillInHouseKeys.has(`${b.bookingNumber}|${b.branch}`);
      const aIsVip = classifyRoom(a.roomUnit) === 'VIP';
      const bIsVip = classifyRoom(b.roomUnit) === 'VIP';
      const aIsNight = a.shift === 'ليل';
      const bIsNight = b.shift === 'ليل';
      const aPriority = aStillIn ? 2 : (aIsVip || aIsNight) ? 0 : 1;
      const bPriority = bStillIn ? 2 : (bIsVip || bIsNight) ? 0 : 1;
      return aPriority - bPriority;
    });

    entries.forEach((b, idx) => {
      const isExcess = idx >= staffCount;
      const roomUnit = b.roomUnit;
      const nights = b.nights || 1;
      const isMonthly = nights >= config.monthlyNightsThreshold;

      // Room transfer detection using log lookup
      const logRoom = logLookup.get(`${b.bookingNumber}|${b.branch}`) || '';
      const repRoomNum = roomUnit ? (roomUnit.match(/\d{3}/)?.[0] || '') : '';
      const logRoomNum = logRoom ? (logRoom.match(/\d{3}/)?.[0] || '') : '';
      const isRoomTransfer = !!(logRoomNum && repRoomNum && logRoomNum !== repRoomNum);

      // Inline merge detection (config-based)
      const inlineMerge = inlineMergeInfo.get(`${b.bookingNumber}|${b.branch}`);
      const isMerged = !!inlineMerge;

      // Units report data
      const unitsData = unitsLookup.get(`${b.bookingNumber}|${b.branch}`);
      const effectivePrice = (unitsData && unitsData.totalRent > 0) ? unitsData.totalRent : b.priceSAR;

      // ========== معادلات التنبيهات ونقص SAR (مراجعة) ==========
      // • المتوقع = حد الأدنى لليلة (من الإعدادات) × عدد الليالي
      // • النقص = المتوقع − الإيجار الفعلي  (فقط إذا النقص > 0)
      // • الإعفاءات: حجوزات بوكينج (مصدر الحجز = بوكينج) + نقل نزيل بين غرف (isRoomTransfer) → لا يُحتسب تنبيه
      // • حد الأدنى: من config (priceRules أو mergedRules) حسب نوع الوحدة وعدد الليالي (شهري ≥ 28 ليلة)
      // • تنبيه (عمود) = عدد حجوزات فيها priceShortfall > 0  |  نقص SAR = مجموع priceShortfall لتلك الحجوزات
      // ============================================================
      // Pricing (config-based)
      let minPrice = 0;
      let roomTypeLabel = '';
      let priceShortfall = 0;

      if (isMerged && inlineMerge) {
        // Merged booking: use merged room rules from config
        const bc = config.branches[b.branch];
        const mergedRule = bc?.mergedRules.find((mr) => mr.label === inlineMerge.mergeType);
        if (mergedRule) {
          roomTypeLabel = inlineMerge.mergeType + (isMonthly ? ' (شهري)' : '');
          minPrice = isMonthly ? mergedRule.monthlyMin : mergedRule.dailyMin;
        } else {
          roomTypeLabel = inlineMerge.mergeType;
          minPrice = 0;
        }

        const isExemptFromMinPrice = b.bookingSource === 'بوكينج' || isRoomTransfer;
        if (!isExemptFromMinPrice && minPrice > 0) {
          const expectedMin = minPrice * nights;
          priceShortfall = effectivePrice < expectedMin ? expectedMin - effectivePrice : 0;
        }
      } else {
        // Standard booking: use config-based pricing
        const roomNum = extractRoomNumber(roomUnit);
        const pricing = getMinPriceFromConfig(config, b.branch, roomUnit, roomNum, nights);
        roomTypeLabel = pricing.label;
        minPrice = pricing.minPrice;

        const isExemptFromMinPrice = b.bookingSource === 'بوكينج' || isRoomTransfer;
        if (!isExemptFromMinPrice && minPrice > 0) {
          const expectedMin = minPrice * nights;
          priceShortfall = effectivePrice < expectedMin ? expectedMin - effectivePrice : 0;
        }
      }

      // Calculate nightly rate
      const nightlyRate = nights > 0 ? effectivePrice / nights : 0;

      let excessReason: ExcessReason = '';
      if (isExcess) {
        if (staffCount === 0) {
          excessReason = 'بدون صلاحية';
        } else if (stillInHouseKeys.has(`${b.bookingNumber}|${b.branch}`)) {
          excessReason = 'لم يخرج';
        } else {
          excessReason = 'تجاوز العدد';
        }
      }

      const checkInDate = b.checkInTime.split(' ')[0] || b.checkInTime;

      result.push({
        employeeName: b.employeeName,
        branch: b.branch,
        roomUnit,
        roomCategory: classifyRoom(roomUnit),
        shift: b.shift,
        bookingSource: b.bookingSource,
        priceSAR: effectivePrice,
        checkInTime: checkInDate,
        checkoutDateStr: b.checkoutDateStr.split(' ')[0] || b.checkoutDateStr,
        creationTime: b.creationTime,
        bookingNumber: b.bookingNumber,
        guestName: b.guestName,
        staffBookingCount: staffCount,
        reportBookingCount: reportTotal,
        difference: reportTotal - staffCount,
        isExcess,
        excessReason,
        nights,
        nightlyRate: Math.round(nightlyRate * 100) / 100,
        minPrice,
        roomTypeLabel,
        priceShortfall: Math.round(priceShortfall * 100) / 100,
        isMonthly,
        isMerged,
        mergedWithBooking: '',
        isRoomTransfer,
      });
    });
  }

  return result;
}

// ===================================================================
// Attendance (TeamAttendanceReport) — Logic Engine
// ===================================================================
//
// 1. Group By Day: كل البصمات بين (6 صباحاً اليوم) و (5:59 فجر اليوم التالي) → حزمة يوم عمل واحد.
//    تطبيق: toWorkDate(rowDate, hour) — لو hour < 6 نرجع تاريخ اليوم السابق، وإلا نفس اليوم.
// 2. Pairing: داخل الحزمة نأخذ (أول بصمة دخول) و (آخر بصمة خروج) = min(entryMins), max(exitMins).
//

const TIME_RE = /\d{1,2}:\d{2}(:\d{2})?/;
const STAMP_SEP = ' -- ';
const MAX_SHIFT_HOURS = 12;
/** البصمة غير المكتملة (دخول فقط أو خروج فقط): 8 ساعات ثابتة، لا نطبق min(., 12) */
const INCOMPLETE_PRESENCE_DEFAULT_HOURS = 8;
const MIN_VALID_DURATION_HOURS = 4;
const DOUBLE_PUNCH_MIN_MINUTES = 5;

function hasTime(s: string): boolean {
  return TIME_RE.test(s);
}

/** Group By Day: بصمة قبل 6 ص → يوم العمل = اليوم السابق؛ من 6 ص فما بعد → يوم العمل = نفس اليوم. */
function toWorkDate(date: Date, timeHour: number): string {
  const d = new Date(date);
  if (timeHour < 6) d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Parse stamp "07:04:00 -- 23:03:00" or "23:00 -- " into entry/exit minutes-from-midnight; double-punch filter < 5 min. */
function parseStamp(stamp: unknown): { entryMins: number | null; exitMins: number | null } {
  const s = String(stamp ?? '');
  if (!hasTime(s)) return { entryMins: null, exitMins: null };
  const i = s.indexOf(STAMP_SEP);
  const left = i >= 0 ? s.slice(0, i).trim() : s.trim();
  const right = i >= 0 ? s.slice(i + STAMP_SEP.length).trim() : '';
  const toMins = (str: string): number | null => {
    const m = str.match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  };
  const leftM = left && hasTime(left) ? toMins(left.match(TIME_RE)?.[0] ?? left) : null;
  const rightM = right && hasTime(right) ? toMins(right.match(TIME_RE)?.[0] ?? right) : null;
  if (leftM != null && rightM != null && Math.abs(rightM - leftM) < DOUBLE_PUNCH_MIN_MINUTES) {
    return { entryMins: leftM, exitMins: null };
  }
  return { entryMins: leftM ?? null, exitMins: rightM ?? null };
}

/** صافي الساعات: يُطبّق فقط عند وجود بصمتين (دخول + خروج). min(المدة، 12) لمنع ساعات وهمية. */
function netHoursCapped(entryMins: number, exitMins: number): number {
  let diff = (exitMins - entryMins) / 60;
  if (diff < 0) diff += 24;
  return Math.min(diff, MAX_SHIFT_HOURS);
}

/** استخراج بداية ونهاية الفترة من نص مثل "01-01-2026 -- 31-01-2026" (DD-MM-YYYY) أو YYYY-MM-DD. يرجع [start, end] بصيغة YYYY-MM-DD أو null لو فشل. */
function parsePeriodRange(period: string): [string, string] | null {
  const s = period.trim();
  if (!s) return null;
  const parts = s.split(/\s*--\s*|\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const toYmd = (str: string): string | null => {
    const dash = str.includes('-');
    const sep = dash ? '-' : '/';
    const m = str.match(new RegExp(`(\\d{1,4})${sep}(\\d{1,2})${sep}(\\d{1,4})`));
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    const c = parseInt(m[3], 10);
    if (a >= 1000 && a <= 9999) return `${a}-${String(b).padStart(2, '0')}-${String(c).padStart(2, '0')}`;
    if (c >= 1000 && c <= 9999) return `${c}-${String(b).padStart(2, '0')}-${String(a).padStart(2, '0')}`;
    return null;
  };
  const start = toYmd(parts[0]);
  const end = toYmd(parts[parts.length - 1]);
  if (!start || !end) return null;
  return [start, end];
}

export function parseAttendanceReport(buffer: ArrayBuffer, fileName: string): AttendanceFileResult {
  assertFileSize(buffer);
  const XLSX = getXLSX();
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  let employeeName = 'موظف';
  let period = '';
  const sheet1 = wb.Sheets['Sheet1'];
  if (sheet1) {
    const rows1 = XLSX.utils.sheet_to_json<unknown[]>(sheet1, { header: 1, defval: '' }) as unknown[][];
    for (const row of rows1) {
      const r = (row || []) as unknown[];
      for (let i = 0; i < r.length; i++) {
        const v = String(r[i] ?? '').trim();
        if (v.indexOf('اسم الموظف') !== -1 && r[i + 1]) employeeName = String(r[i + 1]).replace(/^\s*\d+\s*-\s*\(?/, '').replace(/\)?\s*-\s*\d+\s*$/, '').trim();
        if (v.indexOf('تقرير عن') !== -1 && r[i + 1]) period = String(r[i + 1] ?? '').trim();
      }
    }
  }

  const sheet3 = wb.Sheets['Sheet3'];
  if (!sheet3) return { fileName, employeeName, period, totalDaysInPeriod: 0, totalWorkDays: 0, validDays: 0, incompleteDays: 0, absentDays: 0, permittedAbsence: 0, reviewRequiredDays: 0, totalNetHours: 0, fingerprintAccuracy: 0, days: [] };

  const rows3 = XLSX.utils.sheet_to_json<unknown[]>(sheet3, { header: 1, defval: '' }) as unknown[][];
  const header = (rows3[0] || []) as unknown[];
  const colDate = header.findIndex((c) => String(c ?? '').trim().indexOf('التاريخ') !== -1);
  const colStamp = header.findIndex((c) => String(c ?? '').trim().indexOf('الطابع الزمني') !== -1);
  const colStatus = header.findIndex((c) => String(c ?? '').trim().indexOf('الحالة') !== -1);
  const dateCol = colDate >= 0 ? colDate : 1;
  const stampCol = colStamp >= 0 ? colStamp : 5;
  const statusCol = colStatus >= 0 ? colStatus : header.length - 1;

  type Punch = { workDateStr: string; entryMins: number | null; exitMins: number | null; isOrphan: boolean };
  const punchesByWorkDate = new Map<string, Punch[]>();

  for (let i = 1; i < rows3.length; i++) {
    const row = (rows3[i] || []) as unknown[];
    const status = String(row[statusCol] ?? '').trim();
    if (status === 'الغياب المسموح') continue;

    const rawDate = row[dateCol];
    const dateObj = rawDate instanceof Date ? rawDate : typeof rawDate === 'string' ? new Date(rawDate) : null;
    const rowDate = dateObj && !isNaN(dateObj.getTime()) ? dateObj : null;
    if (!rowDate) continue;

    const stamp = row[stampCol];
    const { entryMins, exitMins } = parseStamp(stamp);

    if (entryMins == null && exitMins == null) {
      const workDateStr = rowDate.toISOString().slice(0, 10);
      if (!punchesByWorkDate.has(workDateStr)) punchesByWorkDate.set(workDateStr, []);
      continue;
    }

    const primaryHour = entryMins != null ? Math.floor(entryMins / 60) : exitMins != null ? Math.floor(exitMins! / 60) : -1;
    const workDateStr = toWorkDate(rowDate, primaryHour >= 0 ? primaryHour : 0); // Group By Day: 6 ص اليوم → 5:59 فجر الغد
    const isOrphan = (entryMins != null && exitMins == null) || (entryMins == null && exitMins != null);
    if (!punchesByWorkDate.has(workDateStr)) punchesByWorkDate.set(workDateStr, []);
    punchesByWorkDate.get(workDateStr)!.push({ workDateStr, entryMins, exitMins, isOrphan });
  }

  const sortedDates = Array.from(punchesByWorkDate.keys()).sort();
  const days: AttendanceDayResult[] = [];
  let validDays = 0, incompleteDays = 0, absentDays = 0, permittedAbsence = 0, reviewRequiredDays = 0;

  const rowDatesSet = new Set<string>();
  for (let i = 1; i < rows3.length; i++) {
    const row = (rows3[i] || []) as unknown[];
    const rawDate = row[dateCol];
    const dateObj = rawDate instanceof Date ? rawDate : typeof rawDate === 'string' ? new Date(rawDate) : null;
    if (dateObj && !isNaN(dateObj.getTime())) rowDatesSet.add(dateObj.toISOString().slice(0, 10));
  }

  for (const workDateStr of sortedDates) {
    const punches = punchesByWorkDate.get(workDateStr)!;
    const entryPunches = punches.filter((p) => p.entryMins != null);
    const exitPunches = punches.filter((p) => p.exitMins != null);
    const n = punches.length;
    const hasEntry = entryPunches.length > 0;
    const hasExit = exitPunches.length > 0;

    let status: AttendanceDayStatus = 'absent';
    let netHours = 0;
    let isOrphan = false;

    // زوج كامل: إما عدة بصمات (أول دخول + آخر خروج) أو بصمة واحدة فيها دخول وخروج (صف واحد "07:00 -- 17:00")
    const hasPair = hasEntry && hasExit && (n >= 2 || (n === 1 && punches[0].entryMins != null && punches[0].exitMins != null));
    if (hasPair) {
      const entryMins = Math.min(...entryPunches.map((p) => p.entryMins!));
      const exitMins = Math.max(...exitPunches.map((p) => p.exitMins!));
      netHours = netHoursCapped(entryMins, exitMins);
      status = netHours >= MIN_VALID_DURATION_HOURS ? 'valid' : 'incomplete';
      if (status === 'valid') validDays++; else incompleteDays++;
      days.push({ workDateStr, status, netHours, isOrphan });
      continue;
    }

    if (n === 1) {
      const p = punches[0];
      const hour = p.entryMins != null ? Math.floor(p.entryMins / 60) : p.exitMins != null ? Math.floor(p.exitMins! / 60) : -1;
      let orphanNightExit = false;
      if (p.entryMins != null && p.exitMins == null) {
        status = 'incomplete';
        isOrphan = true;
        incompleteDays++;
        netHours = INCOMPLETE_PRESENCE_DEFAULT_HOURS; // بصمة دخول فقط
      } else if (p.entryMins == null && p.exitMins != null) {
        if (hour >= 5 && hour <= 10) continue; // خروج شفت ليلي، لا يُحسب يوم جديد
        if (hour >= 21 || hour <= 1) {
          status = 'incomplete';
          isOrphan = true;
          orphanNightExit = true;
          incompleteDays++;
          netHours = INCOMPLETE_PRESENCE_DEFAULT_HOURS;
        } else {
          status = 'review_required';
          isOrphan = true;
          reviewRequiredDays++;
        }
      }
      days.push({ workDateStr, status, netHours, isOrphan, orphanNightExit });
      continue;
    }

    // n === 0: صف موجود للتاريخ لكن بدون أي بصمة → غياب
    if (n === 0) absentDays++;
    days.push({ workDateStr, status, netHours, isOrphan });
  }

  for (const d of rowDatesSet) {
    if (punchesByWorkDate.has(d)) continue;
    const idx = rows3.findIndex((r, i) => i > 0 && String((r as unknown[])?.[statusCol] ?? '').trim() === 'الغياب المسموح' && new Date((r as unknown[])?.[dateCol] as string).toISOString().slice(0, 10) === d);
    if (idx > 0) permittedAbsence++;
    else absentDays++;
    days.push({ workDateStr: d, status: idx > 0 ? 'permitted_absence' : 'absent', netHours: 0, isOrphan: false });
  }

  days.sort((a, b) => a.workDateStr.localeCompare(b.workDateStr));

  // تصفية الأيام بفترة التقرير فقط (مثلاً يناير = 31 يوم) لتفادي احتساب يوم من شهر آخر (مثل 31 ديسمبر من بصمة فجر 1 يناير)
  let daysInScope = days;
  const range = parsePeriodRange(period);
  if (range) {
    const [periodStart, periodEnd] = range;
    daysInScope = days.filter((d) => d.workDateStr >= periodStart && d.workDateStr <= periodEnd);
    // إعادة احتساب الأعداد من الأيام داخل الفترة فقط
    validDays = daysInScope.filter((d) => d.status === 'valid').length;
    incompleteDays = daysInScope.filter((d) => d.status === 'incomplete').length;
    absentDays = daysInScope.filter((d) => d.status === 'absent').length;
    permittedAbsence = daysInScope.filter((d) => d.status === 'permitted_absence').length;
    reviewRequiredDays = daysInScope.filter((d) => d.status === 'review_required').length;
  }

  const totalWorkDays = validDays + incompleteDays;
  const totalDaysInPeriod = validDays + incompleteDays + absentDays + permittedAbsence + reviewRequiredDays;
  const totalNetHours = daysInScope.reduce((s, d) => s + d.netHours, 0);
  const fingerprintAccuracy = totalWorkDays > 0 ? Math.round((validDays / totalWorkDays) * 100) : 0;

  return {
    fileName,
    employeeName,
    period,
    totalDaysInPeriod,
    totalWorkDays,
    validDays,
    incompleteDays,
    absentDays,
    permittedAbsence,
    reviewRequiredDays,
    totalNetHours,
    fingerprintAccuracy,
    days: daysInScope,
  };
}
