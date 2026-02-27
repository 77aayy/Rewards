/**
 * تقرير مختصر: أيام حضور الموظف من E:\Rewards\EXCEL\TeamAttendanceReport.xls
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelDir = path.resolve(__dirname, '../../EXCEL');
const args = process.argv.slice(2);
const fileName = args[0] || 'TeamAttendanceReport.xls';
const verbose = args.includes('verbose') || args.includes('v');
const runAll = fileName === 'all' || fileName === '*';
// --include-unknown: أي بصمة دخول تُحسب (المنطق القديم).
// بدونها: --smart-unknown = ذكاء لغير معروف/ناقصة، وإلا حاضر فقط.
const includeUnknown = args.includes('--include-unknown');
const smartUnknown = args.includes('--smart-unknown');
const strictOnlyPresent = !includeUnknown && !smartUnknown;

if (!runAll && !fs.existsSync(path.join(excelDir, fileName))) {
  console.log('الملف غير موجود:', path.join(excelDir, fileName));
  process.exit(1);
}

function processFile(targetPath, baseName, opts = {}) {
  const wb = XLSX.read(fs.readFileSync(targetPath), { type: 'array', cellDates: true });
  return processWorkbook(wb, baseName, opts);
}

function processWorkbook(wb, baseName) {

  const opts = arguments[2] || {};
  let name = 'موظف';
  let period = '';
  const sheet1Rows = wb.Sheets['Sheet1'] ? XLSX.utils.sheet_to_json(wb.Sheets['Sheet1'], { header: 1, defval: '' }) : [];
  for (let r = 0; r < sheet1Rows.length; r++) {
    const row = sheet1Rows[r] || [];
    for (let i = 0; i < row.length; i++) {
      const v = String(row[i] || '').trim();
      if (v.indexOf('اسم الموظف') !== -1 && row[i + 1]) name = String(row[i + 1]).replace(/^\s*\d+\s*-\s*\(?/, '').replace(/\)?\s*-\s*\d+\s*$/, '').trim();
      if (v.indexOf('تقرير عن') !== -1 && row[i + 1]) period = String(row[i + 1] || '').trim();
    }
  }

  const rows3 = XLSX.utils.sheet_to_json(wb.Sheets['Sheet3'], { header: 1, defval: '' });
  const header = rows3[0] || [];
  const colStatus = header.findIndex(c => String(c || '').trim().indexOf('الحالة') !== -1);
  const colStamp = header.findIndex(c => String(c || '').trim().indexOf('الطابع الزمني') !== -1);
  const statusCol = colStatus >= 0 ? colStatus : header.length - 1;
  const stampCol = colStamp >= 0 ? colStamp : 5;

  const strict = opts.strictOnlyPresent === true;
  const smart = opts.smartUnknown === true;
  let daysPresent = 0, countPresent = 0, countAbsent = 0, countByStamp = 0, countExcluded = 0;
  for (let i = 1; i < rows3.length; i++) {
    const row = rows3[i] || [];
    const status = String(row[statusCol] ?? '').trim();
    const stamp = row[stampCol];
    const prevStatus = (rows3[i - 1] || [])[statusCol];
    const nextStatus = (rows3[i + 1] || [])[statusCol];
    if (status === 'الغياب المسموح') { countAbsent++; continue; }
    if (status === 'حاضر') { daysPresent++; countPresent++; continue; }
    if (strict) {
      if (hasTime(String(stamp ?? '')) || status) countExcluded++;
      continue;
    }
    if (smart) {
      if (smartCountUnknown(status, stamp, prevStatus, nextStatus)) { daysPresent++; countByStamp++; }
      else if (hasTime(String(stamp ?? '')) || status) countExcluded++;
      continue;
    }
    if (isShiftStart(stamp)) { daysPresent++; countByStamp++; }
    else if (hasTime(String(stamp ?? ''))) countExcluded++;
  }

  const out = { name, daysPresent };
  if (opts.verbose) out.verbose = { period, totalRows: rows3.length - 1, countPresent, countAbsent, countByStamp, countExcluded };
  return out;
}

const timeRe = /\d{1,2}:\d{2}(:\d{2})?/;
const hasTime = (s) => timeRe.test(String(s ?? ''));

function getHour(val) {
  if (val == null) return -1;
  if (typeof val === 'object' && typeof val.getHours === 'function') return val.getHours();
  const m = String(val).match(/(\d{1,2}):\d{2}/);
  return m ? parseInt(m[1], 10) % 24 : -1;
}

function isNightShiftExitHour(hour) {
  return hour >= 5 && hour <= 10;
}

function isShiftStart(stamp) {
  const s = String(stamp ?? '');
  if (!hasTime(s)) return false;
  const sep = ' -- ';
  const i = s.indexOf(sep);
  const left = i >= 0 ? s.slice(0, i).trim() : s.trim();
  const right = i >= 0 ? s.slice(i + sep.length).trim() : '';

  const hasLeft = hasTime(left);
  const hasRight = hasTime(right);
  const hourR = getHour(right.match(timeRe)?.[0] || null);

  if (hasLeft && hasRight) return true;
  if (hasLeft && !hasRight) return true;
  if (!hasLeft && hasRight) {
    if (hourR >= 0 && isNightShiftExitHour(hourR)) return false;
    return false;
  }
  const singleHour = getHour(left) >= 0 ? getHour(left) : getHour(stamp);
  if (singleHour >= 0 && isNightShiftExitHour(singleHour)) return false;
  return true;
}

/**
 * ذكاء لغير معروف/ناقصة: نحسب حضور فقط عندما نستنتج أن الموظف حضر (ونسي بصمة أو النظام لم يسجّل).
 * - طابع كامل (دخول + خروج) → حضر، النظام ما صنّف.
 * - دخول فقط → حضر، نسي خروج.
 * - خروج فقط: إن 5–10 ص = خروج شفت ليلي → لا. غير ذلك (نسي دخول) → نحسب.
 * - بدون طابع: إن اليوم السابق والتالي "حاضر" → احتمال نسى البصمتين → نحسب.
 */
function smartCountUnknown(status, stamp, prevStatus, nextStatus) {
  const s = String(stamp ?? '');
  const sep = ' -- ';
  const i = s.indexOf(sep);
  const left = i >= 0 ? s.slice(0, i).trim() : s.trim();
  const right = i >= 0 ? s.slice(i + sep.length).trim() : '';
  const hasLeft = hasTime(left);
  const hasRight = hasTime(right);
  const hourR = getHour(right.match(timeRe)?.[0] || null);

  if (hasLeft && hasRight) return true;   // طابع كامل → حضر
  if (hasLeft && !hasRight) return true;  // دخول فقط → حضر (نسي خروج)
  if (!hasLeft && hasRight) {
    if (hourR >= 0 && isNightShiftExitHour(hourR)) return false; // خروج ليلي
    return true; // خروج عصر/مساء = غالباً نسي دخول
  }
  // بدون طابع (ناقصة): فقط لو الجارين حاضر
  if (!hasTime(s)) {
    const prevOk = (prevStatus || '').trim() === 'حاضر';
    const nextOk = (nextStatus || '').trim() === 'حاضر';
    return prevOk && nextOk;
  }
  const singleHour = getHour(left) >= 0 ? getHour(left) : getHour(stamp);
  if (singleHour >= 0 && isNightShiftExitHour(singleHour)) return false;
  return true; // وقت واحد غير صباحي = دخول
}

if (runAll) {
  const files = fs.readdirSync(excelDir).filter(f => /\.xls$/i.test(f)).sort();
  const rows = [];
  for (const f of files) {
    try {
      const r = processFile(path.join(excelDir, f), f, { strictOnlyPresent, smartUnknown });
      rows.push({ file: f, name: r.name, days: r.daysPresent });
    } catch (e) {
      rows.push({ file: f, name: '—', days: '—' });
    }
  }
  const mode = smartUnknown ? 'ذكاء غير معروف' : strictOnlyPresent ? 'حاضر فقط' : 'بصمة دخول';
  console.log('--- جدول الحضور (' + mode + ') ---');
  console.log('| الملف | الموظف | أيام الحضور |');
  console.log('|-------|--------|-------------|');
  rows.forEach(r => console.log('| ' + r.file + ' | ' + r.name + ' | ' + r.days + (typeof r.days === 'number' ? ' يوم' : '') + ' |'));
  console.log('--- انتهى ---');
} else {
  const wb = XLSX.read(fs.readFileSync(path.join(excelDir, fileName)), { type: 'array', cellDates: true });
  const r = processWorkbook(wb, fileName, { verbose, strictOnlyPresent, smartUnknown });
  console.log('--- تقرير الحضور (' + fileName + ') ---');
  console.log(r.name + ':', r.daysPresent, 'يوم');
  if (r.verbose) {
    const v = r.verbose;
    console.log('');
    console.log('التفصيل:', strictOnlyPresent ? '(وضع صارم: حاضر فقط)' : smartUnknown ? '(ذكاء غير معروف/ناقصة)' : '');
    console.log('  فترة التقرير:', v.period || '—');
    console.log('  إجمالي أيام في التقرير:', v.totalRows);
    console.log('  أيام الحالة "حاضر":', v.countPresent);
    console.log('  أيام غياب مسموح (لا تُحسب):', v.countAbsent);
    if (smartUnknown) console.log('  أيام غير معروف/ناقصة أُحسبت بالذكاء (طابع كامل/دخول فقط/جيران):', v.countByStamp);
    else if (!strictOnlyPresent) console.log('  أيام أُضيفت لوجود بصمة دخول (غير معروف):', v.countByStamp);
    else console.log('  أيام غير معروف أو ناقصة (لا تُحسب):', v.countExcluded);
    if (!strictOnlyPresent && !smartUnknown) console.log('  أيام استُبعدت (خروج فقط):', v.countExcluded);
    else if (smartUnknown) console.log('  أيام غير معروف استُبعدت (خروج ليلي أو لا دليل):', v.countExcluded);
    console.log('  → المجموع:', r.daysPresent, 'يوم');
  }
  console.log('--- انتهى ---');
}
