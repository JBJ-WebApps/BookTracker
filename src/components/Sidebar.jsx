import { useMemo, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useClients, useStaff } from '../hooks/useClients';
import { useAuth } from '../context/AuthContext';
import ClientFormModal from './ClientFormModal';

function Chevron({ open }) {
  return (
    <svg
      className={`h-4 w-4 shrink-0 text-navy-400 transition-transform duration-200 ${open ? 'rotate-0' : '-rotate-90'}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.08l3.71-3.85a.75.75 0 111.08 1.04l-4.24 4.4a.75.75 0 01-1.08 0l-4.24-4.4a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

function TreeGroup({ label, count, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-md text-navy-700 hover:bg-navy-50 transition"
      >
        <Chevron open={open} />
        <span className="text-[11px] font-bold uppercase tracking-wider flex-1">{label}</span>
        <span className="text-[11px] text-navy-400 tabular-nums">{count}</span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${open ? 'max-h-[10000px]' : 'max-h-0'}`}
      >
        <div className="pl-4 pr-1 py-1 space-y-0.5">{children}</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { clients, refresh } = useClients();
  const staff = useStaff();
  const { isAdmin } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const month = searchParams.get('month') || '';
  const [newClientOpen, setNewClientOpen] = useState(false);

  const activeClientId = useMemo(() => {
    const m = location.pathname.match(/^\/clients\/([^/]+)/);
    return m ? m[1] : null;
  }, [location]);

  const suffix = month ? `?month=${month}` : '';

  const byStaff = useMemo(() => {
    const staffMap = new Map(staff.map((s) => [s.id, s]));
    const groups = new Map();
    for (const c of clients) {
      const sid = c.responsible_staff_id || '__unassigned__';
      if (!groups.has(sid)) groups.set(sid, []);
      groups.get(sid).push(c);
    }
    const out = [];
    for (const [sid, list] of groups.entries()) {
      const staffRow = staffMap.get(sid);
      const label =
        sid === '__unassigned__'
          ? 'UNASSIGNED'
          : (staffRow?.full_name || staffRow?.email || 'UNKNOWN').toUpperCase();
      out.push({ sid, label, list: list.sort((a, b) => a.name.localeCompare(b.name)) });
    }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }, [clients, staff]);

  const ClientLink = ({ c }) => (
    <Link
      to={`/clients/${c.id}${suffix}`}
      className={`block truncate px-3 py-1.5 text-sm rounded-md transition ${
        activeClientId === c.id
          ? 'bg-teal-500 text-white font-medium'
          : 'text-navy-600 hover:bg-navy-50'
      }`}
      title={c.name}
    >
      {c.name}
    </Link>
  );

  return (
    <aside className="w-72 shrink-0 bg-white border-r border-navy-100 overflow-y-auto">
      <div className="px-4 pt-5 pb-3">
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400">Clients</div>
          {isAdmin && (
            <button
              onClick={() => setNewClientOpen(true)}
              className="text-xs font-semibold text-teal-600 hover:text-teal-700"
            >
              + New
            </button>
          )}
        </div>
      </div>

      <div className="px-2 pb-6">
        <TreeGroup label="All Clients" count={clients.length} defaultOpen>
          {clients.map((c) => (
            <ClientLink key={c.id} c={c} />
          ))}
        </TreeGroup>

        <div className="mt-3 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-navy-300">
          By Employee
        </div>

        {byStaff.map((g) => (
          <TreeGroup key={g.sid} label={g.label} count={g.list.length}>
            {g.list.map((c) => (
              <ClientLink key={c.id} c={c} />
            ))}
          </TreeGroup>
        ))}
      </div>

      <ClientFormModal
        open={newClientOpen}
        onClose={() => setNewClientOpen(false)}
        onSaved={() => {
          setNewClientOpen(false);
          refresh();
        }}
      />
    </aside>
  );
}
