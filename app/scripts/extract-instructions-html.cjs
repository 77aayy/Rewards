const fs = require('fs');
const path = require('path');
const appPath = path.join(__dirname, '..', 'Rewards', 'src', 'app.js');
const raw = fs.readFileSync(appPath, 'utf8');
const needle = "return '<div class=\"space-y-5\">' +";
const start = raw.indexOf(needle);
if (start < 0) {
  console.error('getInstructionsContent return not found');
  process.exit(1);
}
const end = raw.indexOf('(getCustomInstructionsSectionHtml())', start);
if (end < 0) {
  console.error('getCustomInstructionsSectionHtml not found');
  process.exit(1);
}
let block = raw.slice(start + needle.length, end);
block = block.replace(/' \+?\s*$/gm, '');
block = block.replace(/^'/gm, '').replace(/'$/gm, '');
block = block.trim();
const outPath = path.join(__dirname, '..', 'shared', 'instructionsBody.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, block, 'utf8');
console.log('Wrote', outPath, 'length', block.length);
