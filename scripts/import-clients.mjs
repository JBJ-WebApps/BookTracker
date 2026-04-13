// Imports clients + accounts from the JBJ Excel workbook into Supabase.
// Usage (from project root):
//   SUPABASE_SERVICE_ROLE_KEY='eyJ...' node scripts/import-clients.mjs --dry-run
//   SUPABASE_SERVICE_ROLE_KEY='eyJ...' node scripts/import-clients.mjs
//
// --dry-run  prints what would be imported without touching the database.
//
// All imported clients are assigned to the first admin found in profiles so
// they show up in the admin's sidebar group immediately. The original Excel
// staff name is saved in notes for reassignment later.

import { readFile } from 'fs/promises';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tjuolnjtfhzfwjwugyct.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');
const EXCEL_FILE = process.argv.find((a) => a.endsWith('.xlsx')) || 'client list.xlsx';
const EXCEL_PATH = new URL(`../../../Book Excel Example/${EXCEL_FILE}`, import.meta.url);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -------------------------------------------------------------------------
// Parsing helpers
// -------------------------------------------------------------------------
const SUMMARY_RX =
  /^(monthly f\.?s\.?s? printed|total wip|total time|total (?:monthly|quarterly|annual) fee|total fee|total billed|bank account)/i;

const GROUP_RX = /^(operating accounts|trust accounts|credit cards)$/i;

function normalizeName(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanStr(v) {
  return String(v ?? '').trim();
}

function guessKind(name) {
  const n = String(name).toLowerCase();
  if (/(credit|cc |card|amex|visa|mastercard|master card)/.test(n)) return 'credit_card';
  if (/loan/.test(n)) return 'loan';
  if (/trust/.test(n)) return 'trust';
  if (/payroll/.test(n)) return 'payroll';
  if (/investment|money market|savings/.test(n)) return 'investment';
  return 'bank';
}

function normalizePlatform(p) {
  const s = String(p || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'qbo') return 'QBO';
  if (s === 'qbd') return 'QBD';
  if (s === 'teamviewer') return 'Teamviewer';
  return 'Other';
}

function normalizeFrequency(s) {
  const f = String(s || '').toLowerCase();
  if (f.includes('quarter')) return 'quarterly';
  if (f.includes('annual')) return 'annually';
  return 'monthly';
}

// Master list from "Bookkeeping - All Clients"
// Header row 2 (index 1):
//   A: Level of Complexity | B: Client Name | C: Employee Name | D: Frequency |
//   E: Agreement | F: Bank Recs | G: Daily BK | H: Payroll | I: Sales Tax |
//   J: Payroll Tax | K: R&A | L: Cash | M: Accrual | N: Column3 (free-text)
const SERVICE_COLS = [
  { col: 5,  id: 'bank_recs' },     // F
  { col: 6,  id: 'daily_bk' },      // G
  { col: 7,  id: 'payroll' },       // H
  { col: 8,  id: 'sales_tax' },     // I
  { col: 9,  id: 'payroll_tax' },   // J
  { col: 10, id: 'r_and_a' },       // K
  { col: 11, id: 'cash' },          // L
  { col: 12, id: 'accrual' },       // M
];

function isCheck(v) {
  const s = cleanStr(v);
  if (!s) return false;
  return /✔|x|y|yes|true|1/i.test(s);
}

function parseMasterList(wb) {
  const ws = wb.Sheets['Bookkeeping - All Clients'];
  if (!ws) throw new Error('Sheet "Bookkeeping - All Clients" not found');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  const out = [];
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const complexityRaw = cleanStr(r[0]);
    const name = cleanStr(r[1]);
    const employee = cleanStr(r[2]);
    const frequency = cleanStr(r[3]);
    const col3 = cleanStr(r[13]); // Column N — free text "Monthly Sales Tax", etc.

    if (!name) continue;
    if (/^(total|ee name|level|bookkeeping clients)/i.test(name)) continue;

    let complexity = 1;
    if (complexityRaw === '1') complexity = 1;
    else if (complexityRaw === '2') complexity = 2;
    else if (complexityRaw === '3') complexity = 3;

    const services = new Set();
    for (const s of SERVICE_COLS) {
      if (isCheck(r[s.col])) services.add(s.id);
    }
    if (/monthly sales tax/i.test(col3)) services.add('monthly_sales_tax');

    out.push({
      name,
      employee: employee || null,
      frequency: normalizeFrequency(frequency),
      complexity,
      complexityRaw,
      services: [...services],
      column3: col3 || null,
    });
  }
  return out;
}

// Detailed sheet: "2026 BK - Clients Detailed"
// Rowwise walk — client header = row with no month values AND something in col 14/15
function parseDetailed(wb) {
  const ws = wb.Sheets['2026 BK - Clients Detailed'];
  if (!ws) throw new Error('Sheet "2026 BK - Clients Detailed" not found');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  const details = new Map();
  let current = null;
  let currentGroup = null;

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const col0 = cleanStr(r[0]);
    if (!col0) continue;
    const monthVals = (r.slice(1, 13) || []).map(cleanStr);
    const hasMonth = monthVals.some((v) => v !== '');
    const dueNote = cleanStr(r[13]);
    const staffCol = cleanStr(r[14]);
    const platformCol = cleanStr(r[15]);

    const isSummary = SUMMARY_RX.test(col0);
    const isGroup = GROUP_RX.test(col0);

    // Client header heuristic: something in staff column OR dueNote AND col0 isn't a summary/group
    if (!isSummary && !isGroup && (staffCol || dueNote) && !hasMonth) {
      current = {
        name: col0,
        staffName: staffCol || null,
        dueNote: dueNote || null,
        platform: normalizePlatform(platformCol),
        accounts: [],
        monthlyFee: null,
        feeType: null,
      };
      currentGroup = null;
      details.set(normalizeName(col0), current);
      continue;
    }

    if (!current) continue;

    if (isGroup) {
      currentGroup = col0;
      continue;
    }

    if (isSummary) {
      // Fee row?
      if (/total .*fee/i.test(col0)) {
        for (const v of monthVals) {
          const num = Number(v);
          if (Number.isFinite(num) && num > 0) {
            current.monthlyFee = num;
            break;
          }
        }
        if (/quarter/i.test(col0)) current.feeType = 'quarterly';
        else if (/annual/i.test(col0)) current.feeType = 'annually';
        else if (/monthly/i.test(col0)) current.feeType = 'monthly';
      }
      continue;
    }

    // Account row
    const isClosed = monthVals.some((v) => v.toUpperCase() === 'CLOSED');
    const isNA = monthVals.every((v) => v.toUpperCase() === 'N/A' || v === '');
    // skip rows that are all-empty and unlikely to be real accounts (they're probably stray notes)
    if (!col0) continue;
    current.accounts.push({
      name: col0,
      isClosed,
      isNA,
      groupLabel: currentGroup,
    });
  }

  return details;
}

// -------------------------------------------------------------------------
// Main
// -------------------------------------------------------------------------
async function main() {
  const buf = await readFile(EXCEL_PATH);
  const wb = XLSX.read(buf, { type: 'buffer' });

  const master = parseMasterList(wb);
  const detailed = parseDetailed(wb);

  console.log(`Master list: ${master.length} clients`);
  console.log(`Detailed sheet: ${detailed.size} client blocks`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'IMPORT'}`);
  console.log('');

  // Get first admin to assign clients to (so they show up in her sidebar)
  const { data: admin, error: adminErr } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'admin')
    .limit(1)
    .maybeSingle();

  if (adminErr) {
    console.error('Could not load admin:', adminErr.message);
    process.exit(1);
  }

  if (!admin) {
    console.warn(
      'No admin profile found — all imported clients will be unassigned (they will still show up in the sidebar for any admin via "All Clients").'
    );
  } else {
    console.log(`Assigning all imports to admin: ${admin.full_name || admin.email}\n`);
  }

  let created = 0;
  let skipped = 0;
  let accountCount = 0;
  const matched = [];
  const unmatched = [];

  for (const m of master) {
    const norm = normalizeName(m.name);
    const detail =
      detailed.get(norm) ||
      // fuzzy: any detailed name that starts with same first word
      [...detailed.values()].find((d) => normalizeName(d.name).startsWith(norm.slice(0, 8))) ||
      null;

    if (detail) matched.push(m.name);
    else unmatched.push(m.name);

    const fee = detail?.monthlyFee ?? 0;
    const platform = detail?.platform ?? null;
    const dueNote = detail?.dueNote ?? null;
    const accounts = detail?.accounts ?? [];

    const noteBits = [];
    if (m.employee) noteBits.push(`Excel staff: ${m.employee}`);
    if (m.column3 && !/^monthly sales tax$/i.test(m.column3)) noteBits.push(`Sales tax note: ${m.column3}`);
    const notes = noteBits.length ? `[Imported — ${noteBits.join(' · ')}]` : '[Imported from Excel]';

    const payload = {
      name: m.name,
      responsible_staff_id: admin?.id ?? null,
      frequency: detail?.feeType || m.frequency,
      complexity: m.complexity,
      monthly_fee: fee,
      platform,
      due_to_tax_manager_note: dueNote,
      notes,
      is_archived: false,
    };

    if (DRY_RUN) {
      console.log(
        `  ${m.name.padEnd(40)} ${String(accounts.length).padStart(2)} acct  ${(m.employee || '?').padEnd(18)} ${(platform || '-').padEnd(10)} fee ${String(fee).padStart(5)}  services: ${m.services.join(', ') || '—'}`
      );
      created++;
      accountCount += accounts.length;
      continue;
    }

    // Skip if already exists by name
    const { data: existing } = await supabase
      .from('clients')
      .select('id')
      .eq('name', m.name)
      .maybeSingle();

    if (existing) {
      console.log(`SKIP (exists): ${m.name}`);
      skipped++;
      continue;
    }

    const { data: inserted, error } = await supabase
      .from('clients')
      .insert(payload)
      .select('id')
      .single();

    if (error) {
      console.error(`ERROR ${m.name}: ${error.message}`);
      continue;
    }

    created++;

    if (accounts.length > 0) {
      const accountRows = accounts.map((a, idx) => ({
        client_id: inserted.id,
        name: a.name,
        kind: guessKind(a.name),
        group_label: a.groupLabel || null,
        sort_order: idx,
        is_active: !a.isClosed,
      }));
      const { error: aerr } = await supabase.from('accounts').insert(accountRows);
      if (aerr) console.error(`  accounts error for ${m.name}: ${aerr.message}`);
      else accountCount += accountRows.length;
    }

    if (m.services.length > 0) {
      const svcRows = m.services.map((service_id) => ({
        client_id: inserted.id,
        service_id,
      }));
      const { error: serr } = await supabase.from('client_services').insert(svcRows);
      if (serr) console.error(`  services error for ${m.name}: ${serr.message}`);
    }

    console.log(`CREATED: ${m.name} (${accounts.length} accounts, ${m.services.length} services)`);
  }

  console.log('');
  console.log('================================================');
  console.log(`Clients: ${created} ${DRY_RUN ? 'would be created' : 'created'}, ${skipped} skipped`);
  console.log(`Accounts: ${accountCount}`);
  console.log(`Matched to detailed sheet: ${matched.length}`);
  console.log(`Unmatched (no accounts imported): ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log('  ' + unmatched.join('\n  '));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
