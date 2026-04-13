import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useStaff, useClients } from '../hooks/useClients';
import { useAuth } from '../context/AuthContext';
import { fmtDateTime } from '../lib/format';

const ACTION_OPTIONS = [
  { value: '',                  label: 'All actions' },
  { value: 'auth.login',        label: 'Logins' },
  { value: 'auth.logout',       label: 'Logouts' },
  { value: 'clients',           label: 'Clients (any change)' },
  { value: 'accounts',          label: 'Accounts (any change)' },
  { value: 'account_months',    label: 'Account months (any change)' },
  { value: 'client_months',     label: 'Client months (any change)' },
];

export default function AuditLogPage() {
  const { isAdmin, profile } = useAuth();
  const staff = useStaff();
  const { clients } = useClients({ includeArchived: true });

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-white border border-navy-100 rounded-xl p-10 text-center max-w-md mx-auto">
          <h1 className="text-xl font-bold text-navy-700 mb-2">Admin only</h1>
          <p className="text-sm text-navy-500">
            The audit log is restricted to administrators.
          </p>
        </div>
      </div>
    );
  }

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filterActor, setFilterActor] = useState('');
  const [filterClient, setFilterClient] = useState('');
  const [filterAction, setFilterAction] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      let q = supabase
        .from('audit_log')
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(500);

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
  }, [filterActor, filterClient, filterAction, filterFrom, filterTo]);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  return (
    <div className="p-8">
      <div className="mb-6">
        <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">Activity</div>
        <h1 className="text-3xl font-bold text-navy-700">Audit Log</h1>
        <p className="text-navy-500 mt-1 text-sm">
          {isAdmin
            ? 'You can see every action taken in the system. Records are append-only — they can never be edited or deleted.'
            : 'Showing only your own activity.'}
        </p>
      </div>

      <div className="bg-white border border-navy-100 rounded-xl p-4 mb-4 grid grid-cols-2 lg:grid-cols-5 gap-3">
        {isAdmin && (
          <FilterSelect label="Employee" value={filterActor} onChange={setFilterActor}>
            <option value="">All employees</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name || s.email}</option>
            ))}
          </FilterSelect>
        )}
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
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-navy-400">
                  No activity matches these filters.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const actor = r.actor_id ? staffMap.get(r.actor_id) : null;
                const client = r.client_id ? clientMap.get(r.client_id) : null;
                return (
                  <tr key={r.id} className="border-t border-navy-50 hover:bg-navy-50/40">
                    <td className="px-4 py-2 text-navy-600 whitespace-nowrap">
                      {fmtDateTime(r.occurred_at)}
                    </td>
                    <td className="px-4 py-2 text-navy-700">
                      {actor?.full_name || actor?.email || r.actor_email || '—'}
                    </td>
                    <td className="px-4 py-2">
                      <span className="inline-flex items-center rounded-full bg-navy-50 text-navy-700 px-2 py-0.5 text-xs font-medium">
                        {r.action}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-navy-600">{client?.name || '—'}</td>
                    <td className="px-4 py-2 text-navy-500 text-xs">
                      {summarize(r)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function summarize(r) {
  if (r.action === 'auth.login' || r.action === 'auth.logout') {
    const m = r.metadata || {};
    return [m.userAgent, m.tz].filter(Boolean).join(' · ').slice(0, 90);
  }
  if (r.action.endsWith('.insert')) return 'created';
  if (r.action.endsWith('.delete')) return 'deleted';
  if (r.action.endsWith('.update')) {
    const oldV = r.old_value || {};
    const newV = r.new_value || {};
    const changes = [];
    for (const k of Object.keys(newV)) {
      if (k === 'updated_at') continue;
      if (JSON.stringify(oldV[k]) !== JSON.stringify(newV[k])) {
        const ov = oldV[k];
        const nv = newV[k];
        changes.push(`${k}: ${fmt(ov)} → ${fmt(nv)}`);
      }
    }
    return changes.slice(0, 3).join(' · ') || 'updated';
  }
  return '';
}

function fmt(v) {
  if (v === null || v === undefined) return '∅';
  if (typeof v === 'string') return v.length > 20 ? v.slice(0, 20) + '…' : v;
  return String(v);
}

function FilterSelect({ label, value, onChange, children }) {
  return (
    <label className="block">
      <div className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">
        {label}
      </div>
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
      <div className="text-[11px] font-semibold text-navy-500 uppercase tracking-wider mb-1">
        {label}
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-800 focus:outline-none focus:ring-2 focus:ring-teal-400"
      />
    </label>
  );
}
