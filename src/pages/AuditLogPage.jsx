import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStaff, useClients } from '../hooks/useClients';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime } from '../lib/format';
import { MONTHS } from '../lib/months';

const ACTION_OPTIONS = [
  { value: '',                  label: 'All actions' },
  { value: 'auth.login',        label: 'Logins' },
  { value: 'auth.logout',       label: 'Logouts' },
  { value: 'clients',           label: 'Clients (any change)' },
  { value: 'accounts',          label: 'Accounts (any change)' },
  { value: 'account_months',    label: 'Account status (any change)' },
  { value: 'client_months',     label: 'Monthly totals (any change)' },
];

// Collapse a run of writes by the same person, on the same client + same table,
// within this many ms into one summary row. Status grids get checked in bursts;
// one line per click is noise.
const GROUP_GAP_MS = 5 * 60 * 1000;

const ENTITY_LABEL = {
  account_months: 'Account status',
  client_months: 'Monthly totals',
  accounts: 'Account',
  clients: 'Client',
  auth: 'Auth',
};

const STATUS_LABEL = {
  done: 'Done',
  missing: 'Missing stmt',
  closed: 'Closed',
  not_applicable: 'N/A',
};

const FIELD_LABEL = {
  fs_printed: 'F.S. printed', total_wip: 'WIP', total_time_hours: 'Time', monthly_fee: 'Fee',
  name: 'Name', is_active: 'Active', group_label: 'Group', sort_order: 'Order',
  is_archived: 'Archived', notes: 'Notes', emails: 'Emails', platform: 'Platform',
  frequency: 'Frequency', complexity: 'Complexity', hourly_rate: 'Hourly rate',
  due_to_tax_manager_day: 'Due day', due_to_tax_manager_note: 'Due note',
  responsible_staff_id: 'Responsible', assistant_staff_id: 'Assistant',
};

function monthLabel(period) {
  const m = String(period || '').match(/^(\d{4})-(\d{2})/);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : '';
}

function statusLabel(s) {
  return STATUS_LABEL[s] || (s ? s : 'cleared');
}

function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '∅';
  if (v === true) return 'Yes';
  if (v === false) return 'No';
  const s = String(v);
  return s.length > 24 ? s.slice(0, 24) + '…' : s;
}

// Generic field-diff for clients / accounts / client_months updates.
function fieldDiffs(ov = {}, nv = {}) {
  const out = [];
  for (const k of Object.keys(nv)) {
    if (['updated_at', 'created_at', 'id', 'account_id', 'client_id', 'period_month', 'completed_by', 'completed_at'].includes(k)) continue;
    if (JSON.stringify(ov[k]) !== JSON.stringify(nv[k])) {
      const label = FIELD_LABEL[k] || k;
      out.push(`${label}: ${fmtVal(ov[k])} → ${fmtVal(nv[k])}`);
    }
  }
  return out.slice(0, 4).join(' · ');
}

// A human sentence for one audit row.
function describe(r, accountMap) {
  if (r.action === 'auth.login' || r.action === 'auth.logout') {
    const m = r.metadata || {};
    return [m.userAgent, m.tz].filter(Boolean).join(' · ').slice(0, 90);
  }
  const nv = r.new_value || {};
  const ov = r.old_value || {};
  const et = r.entity_type;

  if (et === 'account_months') {
    const acct = accountMap.get(nv.account_id || ov.account_id) || 'account';
    const month = monthLabel(nv.period_month || ov.period_month);
    if (r.action.endsWith('.delete')) return `${acct} — cleared · ${month}`;
    return `${acct} — ${statusLabel(nv.status)} · ${month}`;
  }
  if (et === 'client_months') {
    const month = monthLabel(nv.period_month || ov.period_month);
    const diffs = r.action.endsWith('.insert') ? '' : fieldDiffs(ov, nv);
    if (r.action.endsWith('.insert')) {
      const bits = [];
      if (nv.fs_printed) bits.push('F.S. printed');
      if (nv.total_wip) bits.push(`WIP ${nv.total_wip}`);
      if (nv.total_time_hours) bits.push(`Time ${nv.total_time_hours}h`);
      return `${bits.join(' · ') || 'monthly totals'} · ${month}`;
    }
    return `${diffs || 'monthly totals'} · ${month}`;
  }
  if (et === 'accounts') {
    const name = nv.name || ov.name || 'account';
    if (r.action.endsWith('.insert')) return `added account: ${name}`;
    if (r.action.endsWith('.delete')) return `removed account: ${name}`;
    return `${name} — ${fieldDiffs(ov, nv) || 'edited'}`;
  }
  if (et === 'clients') {
    if (r.action.endsWith('.insert')) return 'created client';
    if (r.action.endsWith('.delete')) return 'deleted client';
    return fieldDiffs(ov, nv) || 'updated client';
  }
  return r.action;
}

// One-line summary for a collapsed group of rows.
function groupSummary(g) {
  if (g.entityType === 'account_months') {
    const tally = {};
    for (const r of g.rows) {
      const key = r.action.endsWith('.delete') ? 'cleared' : statusLabel((r.new_value || {}).status);
      tally[key] = (tally[key] || 0) + 1;
    }
    return Object.entries(tally).map(([k, v]) => `${v} ${k}`).join(' · ');
  }
  return `${g.rows.length} changes`;
}

function actionLabel(g) {
  const base = ENTITY_LABEL[g.entityType] || g.entityType;
  if (g.rows.length === 1) {
    const a = g.rows[0].action;
    if (a === 'auth.login') return 'Login';
    if (a === 'auth.logout') return 'Logout';
    return base;
  }
  return `${base} · ${g.rows.length} changes`;
}

// Group consecutive rows (already sorted newest-first).
function buildGroups(rows) {
  const groups = [];
  let cur = null;
  for (const r of rows) {
    const t = new Date(r.occurred_at).getTime();
    const mergeable =
      cur &&
      r.entity_type !== 'auth' &&
      cur.entityType === r.entity_type &&
      cur.actorId === r.actor_id &&
      cur.clientId === r.client_id &&
      Math.abs(cur.lastT - t) <= GROUP_GAP_MS;
    if (mergeable) {
      cur.rows.push(r);
      cur.lastT = t;
    } else {
      cur = {
        key: r.id,
        entityType: r.entity_type,
        actorId: r.actor_id,
        clientId: r.client_id,
        rows: [r],
        firstT: t,
        lastT: t,
      };
      groups.push(cur);
    }
  }
  return groups;
}

export default function AuditLogPage() {
  const { isAdmin } = useAuth();
  const staff = useStaff();
  const { clients } = useClients({ includeArchived: true });

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accountMap, setAccountMap] = useState(new Map());

  const [filterActor, setFilterActor] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    if (!isAdmin) return;
    supabase
      .from('accounts')
      .select('id, name')
      .then(({ data }) => setAccountMap(new Map((data ?? []).map((a) => [a.id, a.name]))));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      setLoading(true);
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(1000);

      if (filterActor) q = q.eq('actor_id', filterActor);
      if (filterClient) q = q.eq('client_id', filterClient);
      if (filterAction) {
        if (filterAction.includes('.')) q = q.eq('action', filterAction);
        else q = q.like('action', filterAction + '.%');
      }
      if (filterFrom) q = q.gte('occurred_at', new Date(filterFrom).toISOString());
      if (filterTo) {
        const end = new Date(filterTo);
        end.setHours(23, 59, 59, 999);
        q = q.lte('occurred_at', end.toISOString());
      }

      const { data, error } = await q;
      if (error) console.error(error);
      setRows(data ?? []);
      setLoading(false);
    })();
  }, [isAdmin, filterActor, filterClient, filterAction, filterFrom, filterTo]);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);
  const groups = useMemo(() => buildGroups(rows), [rows]);

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-white border border-navy-100 rounded-xl p-10 text-center max-w-md mx-auto">
          <h1 className="text-xl font-bold text-navy-700 mb-2">Admin only</h1>
          <p className="text-sm text-navy-500">The audit log is restricted to administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">Activity</div>
        <h1 className="text-3xl font-bold text-navy-700">Audit Log</h1>
        <p className="text-navy-500 mt-1 text-sm">
          Every change in the system, newest first. Bursts of edits to the same client are grouped —
          click a grouped row to expand. Records are append-only.
        </p>
      </div>

      <div className="bg-white border border-navy-100 rounded-xl p-4 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <FilterSelect label="Employee" value={filterActor} onChange={setFilterActor}>
          <option value="">All employees</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Client" value={filterClient} onChange={setFilterClient}>
          <option value="">All clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="Action" value={filterAction} onChange={setFilterAction}>
          {ACTION_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </FilterSelect>
        <FilterDate label="From" value={filterFrom} onChange={setFilterFrom} />
        <FilterDate label="To" value={filterTo} onChange={setFilterTo} />
      </div>

      <div className="bg-white border border-navy-100 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-navy-50 text-navy-500 text-xs uppercase tracking-wider">
            <tr>
              <th className="text-left font-semibold px-4 py-3">When</th>
              <th className="text-left font-semibold px-4 py-3">Who</th>
              <th className="text-left font-semibold px-4 py-3">Action</th>
              <th className="text-left font-semibold px-4 py-3">Client</th>
              <th className="text-left font-semibold px-4 py-3">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-navy-400">Loading…</td></tr>
            ) : groups.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-navy-400">No activity matches these filters.</td></tr>
            ) : (
              groups.map((g) => (
                <GroupRow
                  key={g.key}
                  group={g}
                  staffMap={staffMap}
                  clientMap={clientMap}
                  accountMap={accountMap}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupRow({ group, staffMap, clientMap, accountMap }) {
  const [open, setOpen] = useState(false);
  const grouped = group.rows.length > 1;
  const head = group.rows[0];
  const actor = head.actor_id ? staffMap.get(head.actor_id) : null;
  const client = head.client_id ? clientMap.get(head.client_id) : null;
  const who = actor?.full_name || actor?.email || head.actor_email || '—';

  return (
    <>
      <tr
        className={`border-t border-navy-50 ${grouped ? 'cursor-pointer hover:bg-navy-50/60' : 'hover:bg-navy-50/40'}`}
        onClick={grouped ? () => setOpen((v) => !v) : undefined}
      >
        <td className="px-4 py-2 text-navy-600 whitespace-nowrap">{fmtDateTime(head.occurred_at)}</td>
        <td className="px-4 py-2 text-navy-700">{who}</td>
        <td className="px-4 py-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-navy-50 text-navy-700 px-2 py-0.5 text-xs font-medium">
            {grouped && <span className="text-navy-400">{open ? '▾' : '▸'}</span>}
            {actionLabel(group)}
          </span>
        </td>
        <td className="px-4 py-2 text-navy-600">{client?.name || '—'}</td>
        <td className="px-4 py-2 text-navy-500 text-xs">
          {grouped ? groupSummary(group) : describe(head, accountMap)}
        </td>
      </tr>
      {grouped && open &&
        group.rows.map((r) => (
          <tr key={r.id} className="bg-navy-50/30 border-t border-navy-50/60">
            <td className="px-4 py-1.5 pl-8 text-navy-400 text-xs whitespace-nowrap">
              {fmtDateTime(r.occurred_at)}
            </td>
            <td />
            <td />
            <td />
            <td className="px-4 py-1.5 text-navy-600 text-xs">{describe(r, accountMap)}</td>
          </tr>
        ))}
    </>
  );
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
      >
        {children}
      </select>
    </label>
  );
}

function FilterDate({ label, value, onChange }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">{label}</div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
      />
    </label>
  );
}
