/**
 * من ملفات الإكسيل (تقرير الحجوزات): كم عقد ليل لـ رغد؟
 * يشغّل: node scripts/count-night-raghad.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const excelDir = process.env.EXCEL_DIR || path.join(projectRoot, 'excel');

const REPORT_HEADERS = {
  employeeName: ['المستخدم', 'اسم المستخدم', 'الموظف'],
  creationTime: ['تاريخ/وقت الإنشاء', 'تاريخ الإنشاء', 'تاريخ/وقت الانشاء'],
  bookingNumber: ['رقم الحجز'],
};

function discoverCols(rows, maxScan = 25) {
  const reverse = new Map();
  for (const [canonical, alts] of Object.entries(REPORT_HEADERS)) {
    for (const alt of alts) reverse.set(alt.trim(), canonical);
  }
  let best = {}, bestRow = -1, bestCount = 0;
  for (let r = 0; r < Math.min(maxScan, rows.length); r++) {
    const row = rows[r];
    if (!row || row.length < 3) continue;
    const map = {};
    let count = 0;
    for (let c = 0; c < row.length; c++) {
      const text = String(row[c] ?? '').trim();
      const canon = reverse.get(text);
      if (canon && !(canon in map)) { map[canon] = c; count++; }
    }
    if (count > bestCount) { best = map; bestRow = r; bestCount = count; }
  }
  return { col: best, headerRow: bestRow };
}

function parseDateTime(str) {
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})[,\s]+(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!m) return null;
  let hour = parseInt(m[4], 10);
  if (m[6].toUpperCase() === 'PM' && hour !== 12) hour += 12;
  if (m[6].toUpperCase() === 'AM' && hour === 12) hour = 0;
  return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]), hour, parseInt(m[5]));
}

function getShift(date) {
  const totalMins = date.getHours() * 60 + date.getMinutes();
  if (totalMins >= 360 && totalMins < 960) return 'صباح';
  if (totalMins >= 960) return 'مساء';
  return 'ليل';
}

function countNightRaghadInBuffer(buffer, branchLabel) {
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheetName = wb.SheetNames[0] || '';
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
  const { col, headerRow } = discoverCols(rows);
  if (headerRow < 0 || col.employeeName === undefined || col.creationTime === undefined) {
    return { count: 0, branch: branchLabel, error: 'لم يتم العثور على أعمدة المستخدم وتاريخ الإنشاء' };
  }
  const dataStart = headerRow + 1;
  let count = 0, countMorning = 0, countEvening = 0;
  const details = [];
  for (let i = dataStart; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const name = String(row[col.employeeName] ?? '').trim();
    if (!name || name.indexOf('رغد') === -1) continue;
    const bookingNumber = String(row[col.bookingNumber] ?? '').trim();
    if (!bookingNumber || bookingNumber.length < 3) continue;
    const creationTime = String(row[col.creationTime] ?? '').trim();
    const date = parseDateTime(creationTime);
    const shift = date ? getShift(date) : 'صباح';
    if (shift === 'ليل') {
      count++;
      details.push({ name, bookingNumber, creationTime });
    }
    if (shift === 'صباح') countMorning++;
    if (shift === 'مساء') countEvening++;
  }
  return { count, countMorning, countEvening, branch: branchLabel, details };
}

function main() {
  const reportFiles = [
    path.join(excelDir, 'GuestsStatistical_Ar.xlsx'),
    path.join(excelDir, 'GuestsStatistical_Ar (1).xlsx'),
  ].filter(p => fs.existsSync(p));

  if (reportFiles.length === 0) {
    console.log('لم يتم العثور على ملفات تقرير الحجوزات (GuestsStatistical_Ar*.xlsx) في:', excelDir);
    process.exit(1);
  }

  let total = 0, totalMorning = 0, totalEvening = 0;
  for (const file of reportFiles) {
    const buf = fs.readFileSync(file);
    const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    const result = countNightRaghadInBuffer(buffer, path.basename(file));
    if (result.error) {
      console.log(result.branch, ':', result.error);
    } else {
      console.log(result.branch, ':', 'صباح', result.countMorning, '| مساء', result.countEvening, '| ليل', result.count);
      if (result.details && result.details.length > 0 && result.details.length <= 20) {
        result.details.forEach(d => console.log('  -', d.bookingNumber, d.creationTime));
      } else if (result.details && result.details.length > 20) {
        console.log('  (أول 5 ليل):', result.details.slice(0, 5).map(d => d.bookingNumber).join(', '), '...');
      }
      total += result.count;
      totalMorning += result.countMorning;
      totalEvening += result.countEvening;
    }
  }
  console.log('---');
  console.log('رغد من الإكسيل — صباح:', totalMorning, '| مساء:', totalEvening, '| ليل:', total);
}

main();
