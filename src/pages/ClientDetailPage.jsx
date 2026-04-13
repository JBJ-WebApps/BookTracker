import { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useClientDetail } from '../hooks/useClientDetail';
import { useStaff } from '../hooks/useClients';
import { useServiceTypes, useClientServices } from '../hooks/useServices';
import { useAuth } from '../context/AuthContext';
import { parseMonthParam, todayMonthParam } from '../lib/months';
import { fmtCurrency } from '../lib/format';
import MonthGrid from '../components/MonthGrid';
import ClientFormModal from '../components/ClientFormModal';

export default function ClientDetailPage() {
  const { id } = useParams();
  const { isAdmin, profile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month') || todayMonthParam();
  const { year } = parseMonthParam(monthParam) || parseMonthParam(todayMonthParam());

  const { client, accounts, accountMonths, clientMonths, loading, refresh } = useClientDetail(id, year);
  const staff = useStaff();
  const serviceTypes = useServiceTypes();
  const { ids: serviceIds } = useClientServices(client?.id);
  const [editOpen, setEditOpen] = useState(false);

  if (loading && !client) {
    return <div className="p-8 text-navy-500">Loading…</div>;
  }
  if (!client) {
    return (
      <div className="p-8">
        <Link to="/" className="text-sm text-teal-600 hover:text-teal-700">
          ← Back to Dashboard
        </Link>
        <div className="mt-4 text-navy-500">Client not found or not visible to you.</div>
      </div>
    );
  }

  const canEdit =
    isAdmin ||
    client.responsible_staff_id === profile?.id ||
    client.assistant_staff_id === profile?.id;

  const resp = staff.find((s) => s.id === client.responsible_staff_id);
  const asst = staff.find((s) => s.id === client.assistant_staff_id);

  const changeYear = (delta) => {
    const next = new URLSearchParams(searchParams);
    next.set('month', `${year + delta}-01`);
    setSearchParams(next);
  };

  return (
    <div className="p-8 space-y-6">
      <div>
        <Link to={`/?month=${monthParam}`} className="text-sm text-teal-600 hover:text-teal-700">
          ← Back to Dashboard
        </Link>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-bold text-navy-700">{client.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-navy-500">
            <Pill>
              {client.frequency === 'quarterly'
                ? 'Quarterly'
                : client.frequency === 'annually'
                ? 'Annually'
                : 'Monthly'}
            </Pill>
            <Pill>Complexity {client.complexity}</Pill>
            {client.platform && <Pill>{client.platform}</Pill>}
            {resp && <span>Responsible: <strong className="text-navy-700">{resp.full_name || resp.email}</strong></span>}
            {asst && <span>Assistant: <strong className="text-navy-700">{asst.full_name || asst.email}</strong></span>}
            {client.due_to_tax_manager_day && (
              <span>Due day: <strong className="text-navy-700">{client.due_to_tax_manager_day}</strong></span>
            )}
          </div>
          {client.due_to_tax_manager_note && (
            <div className="mt-1 text-xs text-navy-400 italic">{client.due_to_tax_manager_note}</div>
          )}
        </div>

        <div className="shrink-0 bg-white rounded-xl border border-navy-100 shadow-card px-5 py-3 text-right">
          <div className="text-[10px] font-bold uppercase tracking-wider text-navy-400">
            Monthly Fee
          </div>
          <div className="text-2xl font-bold text-navy-700 tabular-nums">
            {fmtCurrency(client.monthly_fee)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-md border border-navy-200 bg-white">
            <button
              onClick={() => changeYear(-1)}
              className="px-3 py-1.5 text-sm text-navy-500 hover:text-navy-700"
              title="Previous year"
            >
              ‹
            </button>
            <div className="px-3 py-1.5 text-sm font-semibold text-navy-700 tabular-nums border-l border-r border-navy-100">
              {year}
            </div>
            <button
              onClick={() => changeYear(1)}
              className="px-3 py-1.5 text-sm text-navy-500 hover:text-navy-700"
              title="Next year"
            >
              ›
            </button>
          </div>
          {canEdit && (
            <button
              onClick={() => setEditOpen(true)}
              className="px-4 py-2 text-sm rounded-md bg-navy-600 hover:bg-navy-700 text-white font-medium"
            >
              Edit client
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-navy-100 shadow-card px-5 py-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400 mb-2">
          Services
        </div>
        {serviceTypes.length === 0 ? (
          <div className="text-sm text-navy-400 italic">Loading…</div>
        ) : serviceIds.size === 0 ? (
          <div className="text-sm text-navy-400 italic">
            No services selected. Click "Edit client" to choose.
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {serviceTypes
              .filter((s) => serviceIds.has(s.id))
              .map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1 text-xs font-semibold"
                >
                  <svg className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
                  </svg>
                  {s.label}
                </span>
              ))}
          </div>
        )}
      </div>

      {client.notes && (
        <div className="bg-gold-50 border border-gold-200 rounded-lg px-4 py-3 text-sm text-navy-700">
          <div className="text-[11px] uppercase tracking-wider text-gold-700 font-bold mb-1">Notes</div>
          {client.notes}
        </div>
      )}

      <MonthGrid
        client={client}
        year={year}
        accounts={accounts}
        accountMonths={accountMonths}
        clientMonths={clientMonths}
        staff={staff}
        canEdit={canEdit}
        onChange={refresh}
      />

      <ClientFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          refresh();
        }}
        existing={client}
      />
    </div>
  );
}

function Pill({ children }) {
  return (
    <span className="inline-flex items-center rounded-full bg-teal-50 text-teal-700 border border-teal-100 px-2.5 py-0.5 text-xs font-medium">
      {children}
    </span>
  );
}
