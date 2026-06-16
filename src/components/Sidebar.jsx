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

// Split alphabetized clients into chunks of ~targetSize, but never break a
// letter across groups — so all "A" clients stay together. Label each group
// with its letter range ("A–C" or just "A" if only one letter fits).
function makeAlphaGroups(clients, targetSize = 20) {
  if (clients.length === 0) return [];
  const sorted = [...clients].sort((a, b) => a.name.localeCompare(b.name));
  const firstLetter = (s) => (s[0] || '#').toUpperCase();

  const groups = [];
  let bucket = [];
  let bucketFirst = null;
  let bucketLast = null;

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const letter = firstLetter(c.name);
    if (bucketFirst === null) bucketFirst = letter;
    bucketLast = letter;
    bucket.push(c);

    const nextLetter = i + 1 < sorted.length ? firstLetter(sorted[i + 1].name) : null;
    const atLetterBoundary = nextLetter === null || nextLetter !== letter;

    if (bucket.length >= targetSize && atLetterBoundary) {
      groups.push({
        label: bucketFirst === bucketLast ? bucketFirst : `${bucketFirst}–${bucketLast}`,
        list: bucket,
      });
      bucket = [];
      bucketFirst = null;
      bucketLast = null;
    }
  }

  if (bucket.length > 0) {
    groups.push({
      label: bucketFirst === bucketLast ? bucketFirst : `${bucketFirst}–${bucketLast}`,
      list: bucket,
    });
  }

  return groups;
}

function TreeGroup({ label, count, defaultOpen = false, forceOpen, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const effectiveOpen = forceOpen !== undefined ? forceOpen : open;
  return (
    <div className="mb-1">
      <button
        onClick={() => {
          if (forceOpen === undefined) setOpen((v) => !v);
        }}
        className="w-full flex items-center gap-2 px-3 py-2 text-left rounded-md text-navy-700 hover:bg-navy-50 transition"
      >
        <Chevron open={effectiveOpen} />
        <span className="text-[11px] font-bold uppercase tracking-wider flex-1">{label}</span>
        <span className="text-[11px] text-navy-400 tabular-nums">{count}</span>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ${effectiveOpen ? 'max-h-[10000px]' : 'max-h-0'}`}
      >
        <div className="pl-4 pr-1 py-1 space-y-0.5">{children}</div>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { clients, refresh } = useClients();
  const staff = useStaff();
  const { isAdmin, profile } = useAuth();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const month = searchParams.get('month') || '';
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;

  const filteredClients = useMemo(() => {
    if (!searching) return clients;
    const q = query.trim().toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query, searching]);

  const activeClientId = useMemo(() => {
    const m = location.pathname.match(/^\/clients\/([^/]+)/);
    return m ? m[1] : null;
  }, [location]);

  const suffix = month ? `?month=${month}` : '';

  const alphaGroups = useMemo(() => {
    return makeAlphaGroups(filteredClients, 20);
  }, [filteredClients]);

  const byStaff = useMemo(() => {
    const staffMap = new Map(staff.map((s) => [s.id, s]));
    const groups = new Map();
    for (const c of filteredClients) {
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
  }, [filteredClients, staff]);

  // The logged-in user's own clients (responsible OR assistant) — shown expanded up top.
  const myClients = useMemo(() => {
    if (!profile?.id) return [];
    return filteredClients
      .filter((c) => c.responsible_staff_id === profile.id || c.assistant_staff_id === profile.id)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredClients, profile]);

  // Everyone else's groups (drop the current user's own group — it's "My Clients" above).
  const otherStaffGroups = useMemo(
    () => byStaff.filter((g) => g.sid !== profile?.id),
    [byStaff, profile]
  );

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
        <div className="flex items-baseline justify-between mb-2">
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
        <div className="relative">
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-300"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a.75.75 0 11-1.06 1.06l-3.08-3.08A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className="w-full pl-8 pr-8 py-1.5 text-sm rounded-md border border-navy-200 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:border-teal-400 text-navy-700 placeholder-navy-300"
          />
          {searching && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 flex items-center justify-center rounded-full text-navy-400 hover:text-navy-700 hover:bg-navy-100"
              title="Clear"
            >
              ×
            </button>
          )}
        </div>
        {searching && (
          <div className="text-[11px] text-navy-400 mt-1.5 px-1">
            {filteredClients.length} match{filteredClients.length === 1 ? '' : 'es'}
          </div>
        )}
      </div>

      <div className="px-2 pb-6">
        {/* The logged-in user's own clients, always expanded — no click needed. */}
        {!searching && myClients.length > 0 && (
          <div className="mb-3">
            <div className="px-3 py-2 flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700 flex-1">
                My Clients
              </span>
              <span className="text-[11px] text-navy-400 tabular-nums">{myClients.length}</span>
            </div>
            <div className="pl-4 pr-1 py-1 space-y-0.5">
              {myClients.map((c) => (
                <ClientLink key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}

        {/* Other employees — view their clients (editing is locked elsewhere). */}
        {!searching && otherStaffGroups.length > 0 && (
          <>
            <div className="mt-2 mb-1 px-3 text-[10px] font-bold uppercase tracking-wider text-navy-300">
              Other Employees
            </div>
            {otherStaffGroups.map((g) => (
              <TreeGroup key={g.sid} label={g.label} count={g.list.length}>
                {g.list.map((c) => (
                  <ClientLink key={c.id} c={c} />
                ))}
              </TreeGroup>
            ))}
          </>
        )}

        {/* All clients, alphabetized — a browse-everything section at the bottom. */}
        <div className="mt-2">
          <TreeGroup
            label="All Clients"
            count={filteredClients.length}
            forceOpen={searching ? true : undefined}
          >
            {alphaGroups.map((g) => (
              <TreeGroup
                key={g.label}
                label={g.label}
                count={g.list.length}
                forceOpen={searching ? true : undefined}
              >
                {g.list.map((c) => (
                  <ClientLink key={c.id} c={c} />
                ))}
              </TreeGroup>
            ))}
          </TreeGroup>
        </div>

        {searching && filteredClients.length === 0 && (
          <div className="px-4 py-6 text-center text-xs text-navy-400 italic">
            No clients match "{query}"
          </div>
        )}
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
