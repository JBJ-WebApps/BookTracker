// Imports the client list from the "2026 BK - FPT" sheet — the newly
// acquired FPT book of business — into Supabase. That sheet only lists
// client names grouped by service (Sales Tax / Payroll monthly / Payroll
// quarterly / Write Up), no accounts, staff, or fee data, so clients are
// created as bare shells with services tagged; accounts/staff get filled
// in later as work starts.
//
// Same client name can appear in multiple service sections — those are
// merged into one client with multiple services, not duplicated.
//
// Usage:
//   node scripts/import-fpt-clients.mjs <key-file> <xlsx-file> --dry-run
//   node scripts/import-fpt-clients.mjs <key-file> <xlsx-file>

import { readFile } from 'fs/promises';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function cleanStr(v) { return String(v ?? '').trim(); }

const KEY_PATH = process.argv[2];
const EXCEL_PATH = process.argv[3];
const DRY_RUN = process.argv.includes('--dry-run');

if (!KEY_PATH || !EXCEL_PATH) {
  console.error('usage: node scripts/import-fpt-clients.mjs <key-file> <xlsx-file> [--dry-run]');
  process.exit(1);
}

// Manually reviewed with Scott (2026-08-14): only "Chef Rebecca (7.5%)" and
// "Chef Rebecca" are the same client (the "(7.5%)" is a sales-tax-rate note).
// Everything else that looked similar (Custom Glass / Custom Glass Creations,
// WR Bar / WR Bar Enterprise, C. Jean Starkey / C. Jean Starkey PA, the three
// Mexico's Grill locations) was confirmed as genuinely separate clients.
const NAME_ALIASES = new Map([
  ["chef rebecca (7.5%)", 'Chef Rebecca'],
]);

const SERVICE_MAP = { 'SALES TAX': 'sales_tax', 'PAYROLL': 'payroll' }; // WRITE UP has no matching service_type

const buf = await readFile(EXCEL_PATH);
const wb = XLSX.read(buf, { type: 'buffer' });
const ws = wb.Sheets['2026 BK - FPT'];
if (!ws) { console.error('Sheet "2026 BK - FPT" not found'); process.exit(1); }
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

const SECTION_LABELS = new Set(['SALES TAX', 'PAYROLL']);
let section = null;
let freq = 'monthly';
const clients = new Map(); // normalized canonical name -> { name, sections:Set, freqs:Set }

for (const r of rows) {
  const col0 = cleanStr(r[0]);
  const col1 = cleanStr(r[1]);
  if (!col0) continue;

  if (SECTION_LABELS.has(col0.toUpperCase()) && !col1) { section = col0.toUpperCase(); continue; }
  if (col1 === 'Jan') {
    if (/write up/i.test(col0)) section = 'WRITE UP';
    freq = /quarter/i.test(col0) ? 'quarterly' : 'monthly';
    continue;
  }
  if (col0 === '2026') continue;
  if (!section) continue;

  const canonical = NAME_ALIASES.get(col0.toLowerCase()) || col0;
  const n = norm(canonical);
  if (!clients.has(n)) clients.set(n, { name: canonical, sections: new Set(), freqs: new Set() });
  clients.get(n).sections.add(section);
  clients.get(n).freqs.add(freq);
}

const KEY = (await readFile(KEY_PATH, 'utf8')).trim();
const supabase = createClient('https://tjuolnjtfhzfwjwugyct.supabase.co', KEY, { auth: { persistSession: false } });

const { data: existing, error: exErr } = await supabase.from('clients').select('id, name');
if (exErr) { console.error(exErr); process.exit(1); }
const existingNames = new Set(existing.map((c) => norm(c.name)));

console.log(`FPT unique clients (after merge): ${clients.size}`);
console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE IMPORT'}`);
console.log('');

let created = 0;
for (const c of [...clients.values()].sort((a, b) => a.name.localeCompare(b.name))) {
  const n = norm(c.name);
  if (existingNames.has(n)) { console.log(`SKIP (already exists): ${c.name}`); continue; }

  // frequency: monthly unless the client's ONLY section presence is quarterly payroll
  const onlyQuarterly = c.freqs.size === 1 && c.freqs.has('quarterly');
  const frequency = onlyQuarterly ? 'quarterly' : 'monthly';

  const serviceIds = [...c.sections].map((s) => SERVICE_MAP[s]).filter(Boolean);
  const hasWriteUp = c.sections.has('WRITE UP');

  const notes = `[Imported ${new Date().toISOString().slice(0,10)} from FPT acquisition sheet — services: ${[...c.sections].join(', ')}${hasWriteUp ? ' (Write Up has no matching service tag)' : ''} — staff not yet assigned]`;

  if (DRY_RUN) {
    console.log(`+ ${c.name.padEnd(30)} freq=${frequency.padEnd(9)} services=${serviceIds.join(',') || '—'}${hasWriteUp ? '+writeup' : ''}`);
    created++;
    continue;
  }

  const { data: inserted, error } = await supabase.from('clients').insert({
    name: c.name,
    responsible_staff_id: null,
    frequency,
    complexity: 1,
    monthly_fee: 0,
    platform: null,
    notes,
    is_archived: false,
  }).select('id').single();

  if (error) { console.error(`ERROR creating ${c.name}: ${error.message}`); continue; }
  created++;

  if (serviceIds.length) {
    const svcRows = serviceIds.map((service_id) => ({ client_id: inserted.id, service_id }));
    const { error: serr } = await supabase.from('client_services').insert(svcRows);
    if (serr) console.error(`  services error for ${c.name}: ${serr.message}`);
  }

  console.log(`CREATED: ${c.name}  services: ${serviceIds.join(',') || '—'}${hasWriteUp ? '+writeup(note only)' : ''}`);
}

console.log('');
console.log(`Clients: ${created} ${DRY_RUN ? 'would be created' : 'created'}`);
