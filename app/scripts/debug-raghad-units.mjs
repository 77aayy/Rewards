/**
 * من ResesrvationsUnits: كم حجز (رقم حجز مميز) لرغد؟
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const excelDir = path.join(__dirname, '../../excel');

const fp = path.join(excelDir, 'ResesrvationsUnits_ar (1).xlsx');
const wb = XLSX.read(fs.readFileSync(fp), { type: 'array' });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });

let currentBooking = '';
const bookingsByRaghad = new Set();
let colEmployee = -1;

for (let r = 0; r < rows.length; r++) {
  const row = rows[r];
  if (!row) continue;
  for (let c = 0; c < row.length; c++) {
    const v = String(row[c] ?? '').trim();
    if (v.includes('رقم الحجز.') || (v.startsWith('رقم الحجز') && /\d+/.test(v))) {
      const num = v.match(/\d+/);
      if (num) currentBooking = num[0];
      break;
    }
    if (v === 'المستخدم' || v === 'اسم المستخدم') colEmployee = c;
  }
  if (colEmployee >= 0 && currentBooking) {
    const name = String(row[colEmployee] ?? '').trim();
    if (name && name.indexOf('رغد') !== -1) bookingsByRaghad.add(currentBooking);
  }
}

console.log('ResesrvationsUnits_ar (1).xlsx — عدد حجوزات (رقم حجز مميز) لرغد:', bookingsByRaghad.size);
if (bookingsByRaghad.size <= 30) console.log(Array.from(bookingsByRaghad).join(', '));
