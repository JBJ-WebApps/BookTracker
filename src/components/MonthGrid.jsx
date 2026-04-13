import { Fragment, useMemo, useState } from 'react';
import { MONTHS, periodMonthString } from '../lib/months';
import { fmtCurrency, fmtHours } from '../lib/format';
import { supabase } from '../lib/supabase';
import StatusCell from './StatusCell';
import AccountFormModal from './AccountFormModal';

export default function MonthGrid({
  client,
  year,
  accounts,
  accountMonths,
  clientMonths,
  staff,
  onChange,
  canEdit,
}) {
  const [editAccount, setEditAccount] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const staffMap = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // Group accounts by group_label (preserving null group first)
  const grouped = useMemo(() => {
    const out = [];
    const seen = new Map();
    for (const a of accounts) {
      const key = a.group_label || '';
      if (!seen.has(key)) {
        const bucket = { label: a.group_label || null, list: [] };
        seen.set(key, bucket);
        out.push(bucket);
      }
      seen.get(key).list.push(a);
    }
    return out;
  }, [accounts]);

  // Lookup maps
  const amByKey = useMemo(() => {
    const m = new Map();
    for (const r of accountMonths) {
      m.set(`${r.account_id}|${r.period_month}`, r);
    }
    return m;
  }, [accountMonths]);

  const cmByMonth = useMemo(() => {
    const m = new Map();
    for (const r of clientMonths) m.set(r.period_month, r);
    return m;
  }, [clientMonths]);

  // WIP / Time / Fee / FS editable cells
  const updateClientMonth = async (month1, patch) => {
    const period = periodMonthString(year, month1);
    const existing = cmByMonth.get(period);
    if (existing) {
      await supabase.from('client_months').update(patch).eq('id', existing.id);
    } else {
      await supabase.from('client_months').insert({
        client_id: client.id,
        period_month: period,
        ...patch,
      });
    }
    onChange?.();
  };

  const hourlyRate = Number(client.hourly_rate) || 80;
  const monthlyBudget = Number(client.monthly_fee) || 0;

  return (
    <div className="bg-white rounded-xl shadow-card border border-navy-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy-50 text-navy-500 text-xs uppercase tracking-wider">
              <th className="text-left font-semibold px-4 py-3 sticky left-0 bg-navy-50 z-10 w-64">
                Account
              </th>
              {MONTHS.map((m) => (
                <th key={m} className="font-semibold px-2 py-3 w-14">{m}</th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {grouped.map((g, gi) => (
              <Fragment key={gi}>
                {g.label && (
                  <tr className="bg-navy-50/60">
                    <td
                      colSpan={14}
                      className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-navy-500 sticky left-0"
                    >
                      {g.label}
                    </td>
                  </tr>
                )}
                {g.list.map((a) => (
                  <tr
                    key={a.id}
                    className={`border-t border-navy-50 ${a.is_active ? '' : 'opacity-50'}`}
                  >
                    <td className="px-4 py-1.5 sticky left-0 bg-white z-10 w-64">
                      <button
                        onClick={() => canEdit && setEditAccount(a)}
                        className="text-left text-navy-700 hover:text-teal-600 truncate max-w-[220px] block"
                        title={a.name}
                      >
                        {a.name}
                      </button>
                    </td>
                    {MONTHS.map((_, i) => {
                      const period = periodMonthString(year, i + 1);
                      const row = amByKey.get(`${a.id}|${period}`);
                      const displayName = row?.completed_by
                        ? staffMap.get(row.completed_by)?.full_name ||
                          staffMap.get(row.completed_by)?.email ||
                          'someone'
                        : '';
                      return (
                        <td key={i} className="px-1 py-1 text-center">
                          <StatusCell
                            accountId={a.id}
                            periodMonth={period}
                            existing={row}
                            displayName={displayName}
                            onChange={onChange}
                          />
                        </td>
                      );
                    })}
                    <td className="w-8" />
                  </tr>
                ))}
              </Fragment>
            ))}

            {accounts.length === 0 && (
              <tr>
                <td colSpan={14} className="px-4 py-6 text-center text-navy-400 italic">
                  No accounts yet — click "+ Add account" below.
                </td>
              </tr>
            )}

            {/* Summary rows */}
            <tr className="border-t-2 border-navy-100 bg-navy-50/40">
              <td className="px-4 py-2 sticky left-0 bg-navy-50/80 z-10 font-semibold text-navy-700">
                Monthly F.S.s printed?
              </td>
              {MONTHS.map((_, i) => {
                const period = periodMonthString(year, i + 1);
                const cm = cmByMonth.get(period);
                const on = !!cm?.fs_printed;
                return (
                  <td key={i} className="px-1 py-1 text-center">
                    <button
                      onClick={() => updateClientMonth(i + 1, { fs_printed: !on })}
                      className={`h-7 w-7 rounded-md border-2 transition font-bold ${
                        on
                          ? 'bg-teal-500 text-white border-teal-500'
                          : 'bg-white border-navy-300 hover:border-teal-400 hover:bg-teal-50/40'
                      }`}
                      title={on ? 'Printed' : 'Not printed'}
                    >
                      {on ? '✓' : ''}
                    </button>
                  </td>
                );
              })}
              <td />
            </tr>

            <EditableSummaryRow
              label="Total WIP"
              year={year}
              cmByMonth={cmByMonth}
              field="total_wip"
              format={fmtCurrency}
              parse={(v) => Number(v) || 0}
              updateClientMonth={updateClientMonth}
            />

            <EditableSummaryRow
              label="Total Time"
              year={year}
              cmByMonth={cmByMonth}
              field="total_time_hours"
              format={fmtHours}
              parse={(v) => Number(v) || 0}
              updateClientMonth={updateClientMonth}
            />

            <JobCostRow
              year={year}
              cmByMonth={cmByMonth}
              hourlyRate={hourlyRate}
              monthlyBudget={monthlyBudget}
            />
          </tbody>
        </table>
      </div>

      {canEdit && (
        <div className="px-4 py-3 border-t border-navy-100 bg-white flex justify-end">
          <button
            onClick={() => setAddOpen(true)}
            className="text-sm font-medium text-teal-600 hover:text-teal-700"
          >
            + Add account
          </button>
        </div>
      )}

      <AccountFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onSaved={() => {
          setAddOpen(false);
          onChange?.();
        }}
        clientId={client.id}
      />
      <AccountFormModal
        open={!!editAccount}
        onClose={() => setEditAccount(null)}
        onSaved={() => {
          setEditAccount(null);
          onChange?.();
        }}
        clientId={client.id}
        existing={editAccount}
      />
    </div>
  );
}

function EditableSummaryRow({ label, year, cmByMonth, field, format, parse, updateClientMonth }) {
  const [editing, setEditing] = useState(null); // { month1, value }

  const startEdit = (month1, current) => setEditing({ month1, value: current ?? '' });

  const commit = async () => {
    if (!editing) return;
    const parsed = parse(editing.value);
    await updateClientMonth(editing.month1, { [field]: parsed });
    setEditing(null);
  };

  return (
    <tr className="border-t border-navy-50 bg-navy-50/30">
      <td className="px-4 py-1.5 sticky left-0 bg-navy-50/60 z-10 text-navy-600 font-medium">
        {label}
      </td>
      {MONTHS.map((_, i) => {
        const month1 = i + 1;
        const period = periodMonthString(year, month1);
        const cm = cmByMonth.get(period);
        const value = cm?.[field];
        const isEditing = editing?.month1 === month1;
        return (
          <td key={i} className="px-1 py-1 text-center">
            {isEditing ? (
              <input
                autoFocus
                type="number"
                step="0.01"
                value={editing.value}
                onChange={(e) => setEditing({ ...editing, value: e.target.value })}
                onBlur={commit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commit();
                  if (e.key === 'Escape') setEditing(null);
                }}
                className="w-14 text-xs text-center border border-teal-400 rounded px-1 py-0.5 focus:outline-none"
              />
            ) : (
              <button
                onClick={() => startEdit(month1, value)}
                className="text-xs font-semibold text-navy-700 hover:text-teal-600 hover:bg-white rounded px-1 py-1 w-full tabular-nums"
              >
                {value != null && value !== 0 ? (
                  format(value)
                ) : (
                  <span className="text-navy-400 font-bold text-base leading-none">—</span>
                )}
              </button>
            )}
          </td>
        );
      })}
      <td />
    </tr>
  );
}

function JobCostRow({ year, cmByMonth, hourlyRate, monthlyBudget }) {
  return (
    <tr className="border-t border-navy-50 bg-navy-50/30">
      <td className="px-4 py-1.5 sticky left-0 bg-navy-50/60 z-10 text-navy-600 font-medium">
        Job Cost
      </td>
      {MONTHS.map((_, i) => {
        const month1 = i + 1;
        const period = periodMonthString(year, month1);
        const cm = cmByMonth.get(period);
        const hours = Number(cm?.total_time_hours) || 0;
        const cost = hours * hourlyRate;
        let cls = 'text-navy-400';
        if (hours > 0 && monthlyBudget > 0) {
          cls = cost > monthlyBudget ? 'text-red-600' : 'text-emerald-600';
        }
        return (
          <td key={i} className="px-1 py-1 text-center">
            {hours > 0 ? (
              <span className={`text-xs font-bold tabular-nums ${cls}`}>
                {fmtCurrency(cost)}
              </span>
            ) : (
              <span className="text-navy-400 font-bold text-base leading-none">—</span>
            )}
          </td>
        );
      })}
      <td />
    </tr>
  );
}
