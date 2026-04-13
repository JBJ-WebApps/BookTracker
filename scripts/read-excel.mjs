import { readFile } from 'fs/promises';
import XLSX from 'xlsx';

const path = process.argv[2];
if (!path) {
  console.error('usage: node read-excel.mjs <file.xlsx>');
  process.exit(1);
}

const buf = await readFile(path);
const wb = XLSX.read(buf, { type: 'buffer' });
console.log('SHEETS:', wb.SheetNames);

const targetName = process.argv[3];
const targetMax  = parseInt(process.argv[4] || '80', 10);

for (const name of wb.SheetNames) {
  if (targetName && name !== targetName) continue;
  console.log('\n================ SHEET: ' + name + ' ================');
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });
  // Trim trailing empty columns based on widest non-empty row in first 200 rows
  let lastCol = 0;
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    for (let j = rows[i].length - 1; j >= 0; j--) {
      if (rows[i][j] !== '' && rows[i][j] !== null) { if (j > lastCol) lastCol = j; break; }
    }
  }
  console.log('ROWS:', rows.length, 'COLS:', lastCol + 1);
  const max = Math.min(rows.length, targetMax);
  for (let i = 0; i < max; i++) {
    const r = rows[i].slice(0, lastCol + 1).map((c) => (c === '' ? '·' : String(c).slice(0, 30)));
    console.log(String(i + 1).padStart(3), '|', r.join(' | '));
  }
  if (rows.length > max) console.log(`... ${rows.length - max} more rows`);
}
