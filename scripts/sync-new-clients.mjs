// Diffs a fresh "Master Firm Acct List" Excel workbook against the clients
// already in Supabase and imports ONLY the ones that are missing by name.
// Never touches/updates any existing client — additive only.
//
// Also seeds client_months.fs_printed = true for any month the workbook's
// "Monthly F.S.s printed?" row has checked, for newly-created clients only.
//
// Usage (from project root):
//   node scripts/sync-new-clients.mjs <path-to-key-file> "<path-to-xlsx>" --dry-run
//   node scripts/sync-new-clients.mjs <path-to-key-file> "<path-to-xlsx>"
//
// --dry-run  prints the diff/plan without touching the database.

import { readFile } from 'fs/promises';
import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://tjuolnjtfhzfwjwugyct.supabase.co';
const KEY_PATH = process.argv[2];
const EXCEL_PATH = process.argv[3];
const DRY_RUN = process.argv.includes('--dry-run');
const YEAR = 2026;
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Names manually reviewed and confirmed real by Scott (2026-08-13) despite
// tripping the automatic review filters. "The Real Estate Collection" is
// added with no account/FS data (its Excel match was ambiguous with two
// existing similarly-named clients, so we don't guess which one's data is
// actually its). Sharlene is added despite Carolyn's "not sure yet" note.
const FORCE_INCLUDE = new Set(['the real estate collection', "sharlene (gene's cleaning lady)"]);
const FORCE_NO_DETAIL = new Set(['the real estate collection']);

if (!KEY_PATH || !EXCEL_PATH) {
  console.error('usage: node scripts/sync-new-clients.mjs <key-file> <xlsx-file> [--dry-run]');
  process.exit(1);
}

const SERVICE_KEY = (await readFile(KEY_PATH, 'utf8')).trim();
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// -------------------------------------------------------------------------
// Parsing helpers (same conventions as scripts/import-clients.mjs)
// -------------------------------------------------------------------------
const SUMMARY_RX =
  /^(monthly f\.?s\.?s? printed|total wip|total time|total (?:monthly|quarterly|annual) fee|total fee|total billed|bank account)/i;
const FS_PRINTED_RX = /^monthly f\.?s\.?s? printed/i;
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
function isCheck(v) {
  const s = cleanStr(v);
  if (!s) return false;
  return /✔|x|y|yes|true|1/i.test(s);
}

const SERVICE_COLS = [
  { col: 5,  id: 'bank_recs' },
  { col: 6,  id: 'daily_bk' },
  { col: 7,  id: 'payroll' },
  { col: 8,  id: 'sales_tax' },
  { col: 9,  id: 'payroll_tax' },
  { col: 10, id: 'r_and_a' },
  { col: 11, id: 'cash' },
  { col: 12, id: 'accrual' },
];

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
    const col3 = cleanStr(r[13]);

    if (!name) continue;
    if (/^(total|ee name|level|bookkeeping clients)/i.test(name)) continue;
    if (/^no longer client$/i.test(name)) continue;      // section divider row
    if (/^no longer client$/i.test(employee)) continue;  // former client, filed under that section

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
      services: [...services],
      column3: col3 || null,
    });
  }
  return out;
}

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

    if (!isSummary && !isGroup && (staffCol || dueNote) && !hasMonth) {
      current = {
        name: col0,
        staffName: staffCol || null,
        dueNote: dueNote || null,
        platform: normalizePlatform(platformCol),
        accounts: [],
        monthlyFee: null,
        feeType: null,
        fsPrintedMonths: [],
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

    if (FS_PRINTED_RX.test(col0)) {
      current.fsPrintedMonths = monthVals.map((v) => isCheck(v));
      continue;
    }

    if (isSummary) {
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

    if (/^\[.*\]$/.test(col0)) continue; // placeholder text like "[Enter Bank Info here]"

    const isClosed = monthVals.some((v) => v.toUpperCase() === 'CLOSED');
    const isNA = monthVals.every((v) => v.toUpperCase() === 'N/A' || v === '');
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

  const { data: existingClients, error: cErr } = await supabase.from('clients').select('id, name');
  if (cErr) { console.error('Failed to load existing clients:', cErr.message); process.exit(1); }
  const existingNames = new Set(existingClients.map((c) => normalizeName(c.name)));

  const { data: profiles, error: pErr } = await supabase.from('profiles').select('id, full_name, email');
  if (pErr) { console.error('Failed to load profiles:', pErr.message); process.exit(1); }

  function matchStaff(nameHint) {
    if (!nameHint) return null;
    const first = String(nameHint).trim().toLowerCase().split(/\s+/)[0];
    if (!first) return null;
    return profiles.find((p) => p.full_name.toLowerCase().split(/\s+/)[0] === first) || null;
  }

  const toCreate = [];
  const needsReview = [];
  for (const m of master) {
    const norm = normalizeName(m.name);
    if (existingNames.has(norm)) continue; // already in DB — never touch

    const forced = FORCE_INCLUDE.has(m.name.toLowerCase());

    let detail = detailed.get(norm) || null;
    let ambiguous = false;
    if (!detail && !FORCE_NO_DETAIL.has(m.name.toLowerCase())) {
      const prefix = norm.slice(0, 8);
      const candidates = [...detailed.values()].filter((d) => normalizeName(d.name).startsWith(prefix));
      if (candidates.length === 1) detail = candidates[0];
      else if (candidates.length > 1) ambiguous = true;
    }

    if (ambiguous && !forced) {
      needsReview.push(`${m.name} (ambiguous account-block match)`);
      continue; // do not guess — surface for a human decision instead
    }

    if (/not sure|maybe|tbd|pending/i.test(m.column3 || '') && !forced) {
      needsReview.push(`${m.name} (Excel note: "${m.column3}")`);
      continue; // uncertain whether this is actually a confirmed new client
    }

    const staffHint = detail?.staffName || m.employee;
    const staff = matchStaff(staffHint);

    toCreate.push({ master: m, detail, staffHint, staff });
  }

  if (needsReview.length) {
    console.log('SKIPPED (ambiguous name match — needs manual review, not imported):');
    console.log('  ' + needsReview.join('\n  '));
    console.log('');
  }

  console.log(`Existing clients in DB: ${existingClients.length}`);
  console.log(`Clients in workbook master list: ${master.length}`);
  console.log(`NEW clients to create: ${toCreate.length}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE IMPORT'}`);
  console.log('');

  let created = 0;
  let accountCount = 0;
  let fsMonthCount = 0;
  const unresolvedStaff = [];

  for (const { master: m, detail, staffHint, staff } of toCreate) {
    const fee = detail?.monthlyFee ?? 0;
    const platform = detail?.platform ?? null;
    const dueNote = detail?.dueNote ?? null;
    const accounts = detail?.accounts ?? [];
    const fsMonths = detail?.fsPrintedMonths ?? [];
    const fsCheckedMonths = MONTH_NAMES.filter((_, idx) => fsMonths[idx]);

    if (!staff && staffHint) unresolvedStaff.push(`${m.name} (Excel staff: "${staffHint}")`);

    const noteBits = [];
    if (staffHint && !staff) noteBits.push(`Excel staff (unmatched): ${staffHint}`);
    if (m.column3) noteBits.push(`Excel note: ${m.column3}`);
    const notes = noteBits.length ? `[Imported ${new Date().toISOString().slice(0,10)} — ${noteBits.join(' · ')}]` : `[Imported ${new Date().toISOString().slice(0,10)} from Excel]`;

    if (DRY_RUN) {
      console.log(
        `+ ${m.name.padEnd(38)} staff=${(staff?.full_name || staffHint || '?').padEnd(20)} ` +
        `${(accounts.length + ' acct').padEnd(7)} fee=${String(fee).padStart(5)}  ` +
        `FS printed: ${fsCheckedMonths.join(',') || '—'}`
      );
      created++;
      accountCount += accounts.length;
      fsMonthCount += fsCheckedMonths.length;
      continue;
    }

    const payload = {
      name: m.name,
      responsible_staff_id: staff?.id ?? null,
      frequency: detail?.feeType || m.frequency,
      complexity: m.complexity,
      monthly_fee: fee,
      platform,
      due_to_tax_manager_note: dueNote,
      notes,
      is_archived: false,
    };

    const { data: inserted, error } = await supabase.from('clients').insert(payload).select('id').single();
    if (error) { console.error(`ERROR creating ${m.name}: ${error.message}`); continue; }
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
      const svcRows = m.services.map((service_id) => ({ client_id: inserted.id, service_id }));
      const { error: serr } = await supabase.from('client_services').insert(svcRows);
      if (serr) console.error(`  services error for ${m.name}: ${serr.message}`);
    }

    if (fsCheckedMonths.length > 0) {
      const cmRows = fsCheckedMonths.map((mon) => {
        const mIdx = MONTH_NAMES.indexOf(mon) + 1;
        const period = `${YEAR}-${String(mIdx).padStart(2, '0')}-01`;
        return { client_id: inserted.id, period_month: period, fs_printed: true, monthly_fee: fee };
      });
      const { error: cmErr } = await supabase.from('client_months').insert(cmRows);
      if (cmErr) console.error(`  client_months error for ${m.name}: ${cmErr.message}`);
      else fsMonthCount += cmRows.length;
    }

    console.log(`CREATED: ${m.name}  staff=${staff?.full_name || '(unassigned)'}  ${accounts.length} accounts  FS months: ${fsCheckedMonths.join(',') || '—'}`);
  }

  console.log('');
  console.log('================================================');
  console.log(`Clients: ${created} ${DRY_RUN ? 'would be created' : 'created'}`);
  console.log(`Accounts: ${accountCount}`);
  console.log(`FS-printed month rows: ${fsMonthCount}`);
  if (unresolvedStaff.length) {
    console.log(`Staff NOT matched to a profile (left unassigned):`);
    console.log('  ' + unresolvedStaff.join('\n  '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
