import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useClients, useStaff } from '../hooks/useClients';
import { useAuth } from '../context/AuthContext';
import { periodMonthString, MONTHS, MONTHS_LONG } from '../lib/months';

const UNASSIGNED = '__unassigned__';

export default function ReportsPage() {
  const { isAdmin } = useAuth();
  const { clients } = useClients();
  const staff = useStaff();
  const [searchParams, setSearchParams] = useSearchParams();

  const selectedStaffId = searchParams.get('employee') || '';
  const year = Number(searchParams.get('year')) || new Date().getFullYear();

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // Employees who actually have clients assigned, plus Unassigned if it applies — alphabetized.
  const employeeOptions = useMemo(() => {
    const ids = new Set(clients.map((c) => c.responsible_staff_id || UNASSIGNED));
    const out = [...ids].map((sid) => ({
      sid,
      name: sid === UNASSIGNED ? 'Unassigned' : staffMap.get(sid)?.full_name || staffMap.get(sid)?.email || 'Unknown',
    }));
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [clients, staffMap]);

  const employeeClients = useMemo(() => {
    if (!selectedStaffId) return [];
    return clients
      .filter((c) => (c.responsible_staff_id || UNASSIGNED) === selectedStaffId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [clients, selectedStaffId]);

  const [fsByClient, setFsByClient] = useState({}); // client_id -> boolean[12]
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin || employeeClients.length === 0) {
      setFsByClient({});
      return;
    }
    (async () => {
      setLoading(true);
      const ids = employeeClients.map((c) => c.id);
      const { data, error } = await supabase
        .from('client_months')
        .select('client_id, period_month, fs_printed')
        .in('client_id', ids)
        .gte('period_month', periodMonthString(year, 1))
        .lte('period_month', periodMonthString(year, 12));
      if (error) {
        console.error(error);
        setFsByClient({});
        setLoading(false);
        return;
      }
      const map = {};
      for (const r of data ?? []) {
        const m = Number(String(r.period_month).slice(5, 7));
        if (m < 1 || m > 12) continue;
        (map[r.client_id] ||= Array(12).fill(false))[m - 1] = !!r.fs_printed;
      }
      setFsByClient(map);
      setLoading(false);
    })();
  }, [employeeClients, year, isAdmin]);

  const selectedName = selectedStaffId
    ? employeeOptions.find((o) => o.sid === selectedStaffId)?.name
    : '';

  const totals = useMemo(() => {
    let done = 0;
    let total = 0;
    for (const c of employeeClients) {
      const months = fsByClient[c.id] || Array(12).fill(false);
      total += 12;
      done += months.filter(Boolean).length;
    }
    return { done, total };
  }, [employeeClients, fsByClient]);

  const yearChoices = useMemo(() => {
    const now = new Date().getFullYear();
    return [now + 1, now, now - 1, now - 2];
  }, []);

  const setParam = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  if (!isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-white border border-navy-100 rounded-xl p-10 text-center max-w-md mx-auto">
          <h1 className="text-xl font-bold text-navy-700 mb-2">Admin only</h1>
          <p className="text-sm text-navy-500">Reports are restricted to administrators.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 print:p-6">
      <div className="flex items-end justify-between mb-6 print:mb-4 flex-wrap gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-navy-400">Reports</div>
          <h1 className="text-3xl font-bold text-navy-700">
            F.S. Status by Employee{selectedName ? ` — ${selectedName}` : ''}
          </h1>
          <p className="text-navy-500 mt-1 text-sm">
            Pick an employee to see which months each of their clients still needs a financial
            statement for.
          </p>
        </div>
        <div className="flex items-center gap-3 print:hidden">
          <select
            value={year}
            onChange={(e) => setParam('year', e.target.value)}
            className="rounded-md border border-navy-200 px-3 py-2 text-sm text-navy-800 bg-white focus:outline-none focus:ring-2 focus:ring-teal-400"
          >
            {yearChoices.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          {selectedStaffId && (
            <button
              onClick={() => window.print()}
              className="text-sm font-medium px-4 py-2 rounded-md bg-navy-600 text-white hover:bg-navy-700 transition"
            >
              Export to PDF
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-card border border-navy-100 p-5 mb-6 break-inside-avoid print:hidden">
        <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400 mb-2">
          Employee
        </div>
        <div className="flex flex-wrap gap-2">
          {employeeOptions.map((o) => (
            <button
              key={o.sid}
              onClick={() => setParam('employee', o.sid)}
              className={`text-sm px-3 py-1.5 rounded-md border transition font-medium ${
                selectedStaffId === o.sid
                  ? 'bg-teal-500 text-white border-teal-500'
                  : 'bg-white text-navy-600 border-navy-200 hover:border-teal-300 hover:text-teal-700'
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      </div>

      {!selectedStaffId ? (
        <div className="bg-white border border-navy-100 rounded-xl p-10 text-center text-navy-500">
          Select an employee above to view their report.
        </div>
      ) : loading ? (
        <div className="text-navy-400 text-sm">Loading&hellip;</div>
      ) : employeeClients.length === 0 ? (
        <div className="bg-white border border-navy-100 rounded-xl p-10 text-center text-navy-500">
          No clients assigned to {selectedName}.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-card border border-navy-100 overflow-hidden break-inside-avoid">
          <div className="px-5 py-3 border-b border-navy-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-navy-700">
              {selectedName} &middot; {year}
            </div>
            <div className="text-sm text-navy-500 tabular-nums">
              {totals.done} of {totals.total} months done across {employeeClients.length} client
              {employeeClients.length === 1 ? '' : 's'}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-50 text-navy-500 text-xs uppercase tracking-wider">
                  <th className="text-left font-semibold px-4 py-3 sticky left-0 bg-navy-50 z-10">
                    Client
                  </th>
                  {MONTHS.map((m) => (
                    <th key={m} className="font-semibold px-1 py-3 w-12">
                      {m}
                    </th>
                  ))}
                  <th className="font-semibold px-3 py-3 w-16">Total</th>
                </tr>
              </thead>
              <tbody>
                {employeeClients.map((c) => {
                  const months = fsByClient[c.id] || Array(12).fill(false);
                  const doneCount = months.filter(Boolean).length;
                  return (
                    <tr key={c.id} className="border-t border-navy-50">
                      <td className="px-4 py-2 sticky left-0 bg-white z-10 text-navy-700 font-medium whitespace-nowrap">
                        {c.name}
                      </td>
                      {months.map((done, i) => (
                        <td key={i} className="px-1 py-2 text-center">
                          <MonthCell done={done} label={`${MONTHS_LONG[i]} ${year}`} />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center text-xs font-semibold text-navy-600 tabular-nums">
                        {doneCount}/12
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function MonthCell({ done, label }) {
  return (
    <span
      title={`${label} — ${done ? 'FS done' : 'FS not done'}`}
      className={`inline-flex h-6 w-9 items-center justify-center rounded-md text-xs font-bold text-white ${
        done ? 'bg-green-500' : 'bg-red-500'
      }`}
    >
      {done ? '✓' : '✕'}
    </span>
  );
}
