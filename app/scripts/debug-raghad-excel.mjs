/**
 * تشخيص: وين الـ 111 عقد لرغد؟ نطبع المراجع من staff وعدد الصفوف في كل ملف.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '../..');
const excelDir = path.join(projectRoot, 'excel');

function sheetToRows(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
}

function hasRaghad(row) {
  if (!row || !Array.isArray(row)) return false;
  return row.some(cell => String(cell || '').trim().indexOf('رغد') !== -1);
}

function main() {
  console.log('=== 1) ملف الموظفين UserStatisticsReport_Ar.xlsx (المرجع) ===');
  const staffPath = path.join(excelDir, 'UserStatisticsReport_Ar.xlsx');
  if (!fs.existsSync(staffPath)) {
    console.log('الملف غير موجود');
  } else {
    const wb = XLSX.read(fs.readFileSync(staffPath), { type: 'array' });
    for (const sn of wb.SheetNames) {
      const rows = sheetToRows(wb, sn);
      console.log('ورقة:', sn, '— عدد الصفوف:', rows.length);
      // find header with عدد الحجوزات or الحجوزات or اسم الموظف
      let colCount = -1, colName = -1;
      for (let r = 0; r < Math.min(30, rows.length); r++) {
        const row = rows[r];
        for (let c = 0; c < (row || []).length; c++) {
          const v = String((row || [])[c] ?? '').trim();
          if (v === 'عدد الحجوزات' || v === 'الحجوزات') colCount = c;
          if (v === 'اسم الموظف' || v === 'الموظف' || v === 'المستخدم') colName = c;
        }
        if (colCount >= 0 && colName >= 0) {
          let raghadCount = 0;
          for (let i = r + 1; i < rows.length; i++) {
            const rw = rows[i];
            const name = String((rw || [])[colName] ?? '').trim();
            if (name.indexOf('رغد') !== -1) {
              const cnt = parseInt(String((rw || [])[colCount] ?? 0)) || 0;
              raghadCount += cnt;
              console.log('  رغد — عدد الحجوزات:', cnt, '| الاسم كما في الملف:', name);
            }
          }
          console.log('  مجموع مرجع رغد من هذه الورقة:', raghadCount);
          break;
        }
      }
    }
  }

  console.log('\n=== 2) تقرير الحجوزات GuestsStatistical_Ar*.xlsx — عدد الصفوف اللي فيها "رغد" ===');
  for (const fileName of ['GuestsStatistical_Ar.xlsx', 'GuestsStatistical_Ar (1).xlsx']) {
    const fp = path.join(excelDir, fileName);
    if (!fs.existsSync(fp)) continue;
    const wb = XLSX.read(fs.readFileSync(fp), { type: 'array' });
    for (const sn of wb.SheetNames) {
      const rows = sheetToRows(wb, sn);
      const raghadRows = rows.filter((row, i) => i > 0 && hasRaghad(row));
      console.log(fileName, '— ورقة:', sn, '| إجمالي صفوف:', rows.length, '| صفوف فيها "رغد":', raghadRows.length);
      if (raghadRows.length > 0 && raghadRows.length <= 5) {
        console.log('  عينة صف:', raghadRows[0].slice(0, 8));
      }
    }
  }

  console.log('\n=== 3) وحدات الحجوزات ResesrvationsUnits_ar*.xlsx — عدد الصفوف اللي فيها "رغد" ===');
  for (const fileName of ['ResesrvationsUnits_ar.xlsx', 'ResesrvationsUnits_ar (1).xlsx']) {
    const fp = path.join(excelDir, fileName);
    if (!fs.existsSync(fp)) continue;
    const wb = XLSX.read(fs.readFileSync(fp), { type: 'array' });
    for (const sn of wb.SheetNames) {
      const rows = sheetToRows(wb, sn);
      const raghadRows = rows.filter((row, i) => i > 0 && hasRaghad(row));
      console.log(fileName, '— ورقة:', sn, '| إجمالي صفوف:', rows.length, '| صفوف فيها "رغد":', raghadRows.length);
    }
  }
}

main();
