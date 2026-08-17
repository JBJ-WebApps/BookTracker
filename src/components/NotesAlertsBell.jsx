import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMentionAlerts } from '../context/MentionAlertsContext';
import { fmtDateTime } from '../lib/format';

export default function NotesAlertsBell() {
  const { unreadByClient, totalUnread } = useMentionAlerts();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-md hover:bg-navy-700 transition"
        title="Notes you're tagged in"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path d="M2.5 4A1.5 1.5 0 001 5.5v9A1.5 1.5 0 002.5 16h15a1.5 1.5 0 001.5-1.5v-9A1.5 1.5 0 0017.5 4h-15zM3 6.3l6.3 4.2a1.2 1.2 0 001.4 0L17 6.3V14H3V6.3zm.6-.8h12.8L10 9.6 3.6 5.5z" />
        </svg>
        {totalUnread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 rounded-lg bg-white text-navy-700 shadow-2xl border border-navy-100 z-30 max-h-96 overflow-y-auto">
          <div className="px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-navy-400 border-b border-navy-50">
            Notes you're tagged in
          </div>
          {unreadByClient.length === 0 ? (
            <div className="px-4 py-4 text-sm text-navy-400">You're all caught up.</div>
          ) : (
            unreadByClient.map((c) => (
              <button
                key={c.clientId}
                onClick={() => {
                  setOpen(false);
                  navigate(`/clients/${c.clientId}?notes=1`);
                }}
                className="block w-full text-left px-4 py-3 border-b border-navy-50 last:border-0 hover:bg-navy-50"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{c.clientName}</span>
                  <span className="shrink-0 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {c.count}
                  </span>
                </div>
                <div className="text-xs text-navy-400 truncate mt-0.5">{c.latestNote?.body}</div>
                <div className="text-[10px] text-navy-300 mt-0.5">{fmtDateTime(c.latestNote?.created_at)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
