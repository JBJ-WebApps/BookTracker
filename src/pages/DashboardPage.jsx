import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients, useStaff } from '../hooks/useClients';
import { useAuth } from '../context/AuthContext';
import { parseMonthParam, todayMonthParam, periodMonthString, MONTHS, MONTHS_LONG } from '../lib/months';
import { fmtCurrency, fmtHours } from '../lib/format';

export default function DashboardPage() {
  const { profile, isAdmin } = useAuth();
  const { clients } = useClients();
  const staff = useStaff();
  const [searchParams] = useSearchParams();
  const monthParam = searchParams.get('month') || todayMonthParam();
  const parsed = parseMonthParam(monthParam) || parseMonthParam(todayMonthParam());
  const period = periodMonthString(parsed.year, parsed.month1);

  const [accountsByClient, setAccountsByClient] = useState({});
  const [amByAccount, setAmByAccount] = useState({});
  const [cmByClient, setCmByClient] = useState({});
  const [fsByClient, setFsByClient] = useState({}); // client_id -> boolean[12] of fs_printed per month of the displayed year
  const [filter, setFilter] = useState('mine'); // 'mine' | 'all'

  useEffect(() => {
    if (clients.length === 0) {
      setAccountsByClient({});
      setAmByAccount({});
      setCmByClient({});
      setFsByClient({});
      return;
    }
    (async () => {
      const ids = clients.map((c) => c.id);
      // Load the whole displayed year so the card can show a Jan–Dec F.S.-printed strip
      const yearPeriods = Array.from({ length: 12 }, (_, i) => periodMonthString(parsed.year, i + 1));
      const [{ data: accts }, { data: cms }] = await Promise.all([
        supabase.from('accounts').select('id, client_id, is_active').in('client_id', ids),
        supabase.from('client_months').select('*').in('client_id', ids).in('period_month', yearPeriods),
      ]);
      const byClient = {};
      for (const a of accts ?? []) {
        (byClient[a.client_id] ||= []).push(a);
      }
      setAccountsByClient(byClient);
      const cmMap = {}; // selected-month row, used for WIP / Time / Fee
      const fsMap = {}; // client_id -> boolean[12]
      for (const r of cms ?? []) {
        if (r.period_month === period) cmMap[r.client_id] = r;
        const m = Number(String(r.period_month).slice(5, 7)); // 1-12
        if (m >= 1 && m <= 12) {
          (fsMap[r.client_id] ||= Array(12).fill(false))[m - 1] = !!r.fs_printed;
        }
      }
      setCmByClient(cmMap);
      setFsByClient(fsMap);

      const acctIds = (accts ?? []).map((a) => a.id);
      if (acctIds.length) {
        const { data: ams } = await supabase
          .from('account_months')
          .select('account_id, status')
          .in('account_id', acctIds)
          .eq('period_month', period);
        const amMap = {};
        for (const r of ams ?? []) amMap[r.account_id] = r;
        setAmByAccount(amMap);
      } else {
        setAmByAccount({});
      }
    })();
  }, [clients, period]);

  const visibleClients = useMemo(() => {
    if (filter === 'mine' && profile?.id) {
      return clients.filter(
        (c) => c.responsible_staff_id === profile.id || c.assistant_staff_id === profile.id
      );
    }
    return clients;
  }, [clients, filter, profile]);

  const totals = useMemo(() => {
    let total = 0;
    let done = 0;
    for (const c of visibleClients) {
      const accts = (accountsByClient[c.id] || []).filter((a) => a.is_active);
      total += accts.length;
      for (const a of accts) {
        if (amByAccount[a.id]?.status === 'done') done++;
      }
    }
    return { total, done };
  }, [visibleClients, accountsByClient, amByAccount]);

  return (
    <div className="p-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">
            Dashboard
          </div>
          <h1 className="text-3xl font-bold text-navy-700">
            {MONTHS_LONG[parsed.month1 - 1]} {parsed.year}
          </h1>
          <p className="text-navy-500 mt-1">
            {totals.done} of {totals.total} accounts done across{' '}
            {visibleClients.length} {visibleClients.length === 1 ? 'client' : 'clients'}
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-navy-200 bg-white p-1">
          <button
            onClick={() => setFilter('mine')}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${
              filter === 'mine' ? 'bg-navy-600 text-white' : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            My clients
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition ${
              filter === 'all' ? 'bg-navy-600 text-white' : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            All clients
          </button>
        </div>
      </div>

      {visibleClients.length === 0 ? (
        <div className="bg-white border border-navy-100 rounded-xl p-10 text-center">
          <p className="text-navy-500">No clients to show.</p>
          <p className="text-xs text-navy-400 mt-2">
            {isAdmin
              ? 'Use "+ New" in the sidebar to create your first client.'
              : 'No clients are assigned to you yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {visibleClients.map((c) => (
            <ClientCard
              key={c.id}
              client={c}
              accounts={accountsByClient[c.id] || []}
              amByAccount={amByAccount}
              cm={cmByClient[c.id]}
              fsMonths={fsByClient[c.id]}
              year={parsed.year}
              monthParam={monthParam}
              staff={staff}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ClientCard({ client, accounts, amByAccount, cm, fsMonths, year, monthParam, staff }) {
  const active = accounts.filter((a) => a.is_active);
  const total = active.length;
  const done = active.filter((a) => amByAccount[a.id]?.status === 'done').length;
  const missing = active.filter((a) => amByAccount[a.id]?.status === 'missing').length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const allDone = total > 0 && done === total;

  const resp = staff.find((s) => s.id === client.responsible_staff_id);

  return (
    <Link
      to={`/clients/${client.id}?month=${monthParam}`}
      className="group bg-white rounded-xl shadow-card border border-navy-100 hover:border-teal-300 hover:shadow-lg transition p-5 block"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold text-navy-700 leading-tight group-hover:text-teal-600 transition truncate">
          {client.name}
        </h3>
        {allDone && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">
            Done
          </span>
        )}
      </div>
      <div className="text-xs text-navy-400 mt-1 truncate">
        {resp?.full_name || resp?.email || 'Unassigned'} ·{' '}
        {client.frequency === 'quarterly'
          ? 'Quarterly'
          : client.frequency === 'annually'
          ? 'Annually'
          : 'Monthly'}
        {client.platform ? ` · ${client.platform}` : ''}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <div className="flex-1 h-2 bg-navy-50 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="text-xs tabular-nums text-navy-500">
          {done}/{total || 0}
        </div>
      </div>
      {missing > 0 && (
        <div className="text-[11px] text-orange-600 mt-1.5 font-medium">
          {missing} waiting on statement{missing === 1 ? '' : 's'}
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Stat label="WIP" value={fmtCurrency(cm?.total_wip)} />
        <Stat label="Time" value={fmtHours(cm?.total_time_hours)} />
        <Stat label="Fee" value={fmtCurrency(cm?.monthly_fee ?? client.monthly_fee)} />
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[10px] text-navy-400 mb-1">
          <span className="font-semibold uppercase tracking-wider">F.S. printed · {year}</span>
          {client.due_to_tax_manager_day ? (
            <span>Due: {client.due_to_tax_manager_day}th</span>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-[10px] font-bold uppercase tracking-wide tabular-nums">
          {MONTHS.map((m, i) => (
            <span
              key={i}
              className={fsMonths?.[i] ? 'text-green-600' : 'text-red-500'}
              title={`${MONTHS_LONG[i]} ${year} — ${fsMonths?.[i] ? 'printed' : 'not printed'}`}
            >
              {m}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-navy-50/60 rounded-md px-2 py-1.5">
      <div className="text-[10px] text-navy-400 uppercase tracking-wider">{label}</div>
      <div className="text-navy-700 font-semibold tabular-nums truncate">{value}</div>
    </div>
  );
}
