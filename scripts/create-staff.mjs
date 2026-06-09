// Creates the JBJ bookkeeping staff in Supabase Auth, then re-maps every
// imported client's responsible_staff_id (and assistant_staff_id) based on the
// "Employee Name" column in the Excel master list.
//
// Usage:
//   SUPABASE_SERVICE_ROLE_KEY='eyJ...' node scripts/create-staff.mjs
//
// Side effects:
//   - Creates 9 auth users (skips if email already exists).
//   - Each gets a strong random password.
//   - Writes seed/staff-credentials.txt with the temporary credentials.
//   - Updates clients.responsible_staff_id / assistant_staff_id by name match.
//   - Adds a profile row for each (auto via handle_new_user trigger).

import { createClient } from '@supabase/supabase-js';
import { readFile, mkdir, writeFile } from 'fs/promises';
import XLSX from 'xlsx';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_URL = 'https://tjuolnjtfhzfwjwugyct.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY env var.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// First name (case-insensitive match against Excel "Employee Name") → staff record
const STAFF = [
  { firstName: 'Laura',    fullName: 'Laura Dutcher',     email: 'ldutcher@jbjcpas.com' },
  { firstName: 'Carolyn',  fullName: 'Carolyn Wells',     email: 'cwells@jbjcpas.com'   },
  { firstName: 'Tammy',    fullName: 'Tammy A Fisk',      email: 'tfisk@jbjcpas.com'    },
  { firstName: 'Kristina', fullName: 'Kristina M Petuch', email: 'kpetuch@jbjcpas.com'  },
  { firstName: 'Karen',    fullName: 'Karen A Roberts',   email: 'kroberts@jbjcpas.com' },
  { firstName: 'Moriah',   fullName: 'Moriah F Tamilin',  email: 'mtamilin@jbjcpas.com' },
  { firstName: 'Sylvia',   fullName: 'Sylvia Newsome',    email: 'snewsome@jbjcpas.com' },
  { firstName: 'Arielle',  fullName: 'Arielle M Kingston', email: 'akingston@jbjcpas.com' },
  { firstName: 'Heather',  fullName: 'Heather L Krieger', email: 'hkrieger@jbjcpas.com' },
];

function genPassword() {
  const chars = 'ABCDEFGHIJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const symbols = '!@#$%^&*';
  let pw = '';
  for (let i = 0; i < 14; i++) pw += chars[crypto.randomInt(chars.length)];
  pw += symbols[crypto.randomInt(symbols.length)];
  pw += crypto.randomInt(10);
  return pw;
}

async function findExistingByEmail(email) {
  // The admin API doesn't have a getByEmail, so we list and filter.
  // For ~9 users this is fine.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase()) || null;
}

async function ensureProfile(userId, fullName, email, mustChangePassword = false) {
  // The handle_new_user trigger creates a profile row, but full_name may be
  // empty if user_metadata wasn't set at create time. Force-update here.
  // Only stamp must_change_password for freshly created users so we don't
  // re-flag someone who has already set their own password.
  const patch = { full_name: fullName, email };
  if (mustChangePassword) patch.must_change_password = true;
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId);
  if (error) console.warn(`  profile update warning for ${email}: ${error.message}`);
}

async function createStaff() {
  const credentials = [];
  const created = [];

  for (const s of STAFF) {
    const existing = await findExistingByEmail(s.email);
    if (existing) {
      console.log(`SKIP (exists): ${s.email}`);
      created.push({ ...s, id: existing.id });
      await ensureProfile(existing.id, s.fullName, s.email);
      continue;
    }

    const password = genPassword();
    const { data, error } = await supabase.auth.admin.createUser({
      email: s.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: s.fullName },
    });

    if (error) {
      console.error(`ERROR creating ${s.email}: ${error.message}`);
      continue;
    }

    const userId = data.user.id;
    await ensureProfile(userId, s.fullName, s.email, true);

    console.log(`CREATED: ${s.email}`);
    credentials.push({ ...s, password });
    created.push({ ...s, id: userId });
  }

  if (credentials.length > 0) {
    const seedDir = path.join(__dirname, '..', 'seed');
    await mkdir(seedDir, { recursive: true });
    const file = path.join(seedDir, 'staff-credentials.txt');
    const content = [
      'JBJ BookTracker — temporary staff credentials',
      `Generated: ${new Date().toISOString()}`,
      '',
      'IMPORTANT:',
      ' - These passwords were auto-generated. Hand them to each employee privately.',
      ' - They log in with this temp password, then are required to set their own',
      '   password before the app lets them in (first-login prompt).',
      ' - This file is gitignored and lives only on this machine.',
      '',
      ...credentials.map((c) => `${c.fullName.padEnd(28)}  ${c.email.padEnd(26)}  ${c.password}`),
      '',
    ].join('\n');
    await writeFile(file, content, 'utf8');
    console.log(`\nWrote ${credentials.length} credentials to ${file}`);
  }

  return created;
}

// -------------------------------------------------------------------------
// Re-map clients to their real responsible staff based on the Excel
// -------------------------------------------------------------------------
async function remapClients(staffById) {
  const buf = await readFile(new URL('../../../Book Excel Example/client list.xlsx', import.meta.url));
  const wb = XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets['Bookkeeping - All Clients'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: '' });

  // first-name (lowercase) → staff id
  const firstNameToId = new Map(
    STAFF.map((s) => [s.firstName.toLowerCase(), staffById.find((c) => c.email === s.email)?.id]).filter(
      ([, id]) => id
    )
  );

  // client name → { responsibleId, assistantId }
  const map = new Map();
  for (let i = 2; i < rows.length; i++) {
    const r = rows[i];
    const name = String(r[1] || '').trim();
    const employee = String(r[2] || '').trim();
    if (!name || !employee) continue;
    if (/^(total|ee name|level|bookkeeping clients)/i.test(name)) continue;

    const parts = employee.split('/').map((p) => p.trim().toLowerCase()).filter(Boolean);
    const responsibleId = parts.length > 0 ? firstNameToId.get(parts[0]) || null : null;
    const assistantId = parts.length > 1 ? firstNameToId.get(parts[1]) || null : null;

    map.set(name, { responsibleId, assistantId, raw: employee });
  }

  // Pull all clients
  const { data: clients, error } = await supabase
    .from('clients')
    .select('id, name, responsible_staff_id, assistant_staff_id');
  if (error) throw error;

  let updated = 0;
  let unmatched = 0;

  for (const c of clients) {
    const m = map.get(c.name);
    if (!m) {
      unmatched++;
      continue;
    }
    if (!m.responsibleId && !m.assistantId) continue;

    const patch = {};
    if (m.responsibleId && c.responsible_staff_id !== m.responsibleId) {
      patch.responsible_staff_id = m.responsibleId;
    }
    if (m.assistantId && c.assistant_staff_id !== m.assistantId) {
      patch.assistant_staff_id = m.assistantId;
    }
    if (Object.keys(patch).length === 0) continue;

    const { error: uerr } = await supabase.from('clients').update(patch).eq('id', c.id);
    if (uerr) {
      console.error(`  update error ${c.name}: ${uerr.message}`);
      continue;
    }
    updated++;
    console.log(`MAPPED: ${c.name}  →  ${m.raw}`);
  }

  console.log(`\nClients re-mapped: ${updated}, unmatched: ${unmatched}`);
}

async function main() {
  console.log('--- Creating staff ---');
  const created = await createStaff();
  console.log(`\n--- Re-mapping clients ---`);
  await remapClients(created);
  console.log('\nDone.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
