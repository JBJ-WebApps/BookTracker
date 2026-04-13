import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmtDateTime } from '../lib/format';

const STATUS_OPTIONS = [
  { value: 'done',           label: 'Done',         color: 'bg-teal-500 text-white' },
  { value: 'missing',        label: 'Missing stmt', color: 'bg-orange-500 text-white' },
  { value: 'closed',         label: 'Closed',       color: 'bg-navy-300 text-white' },
  { value: 'not_applicable', label: 'N/A',          color: 'bg-navy-200 text-navy-700' },
];

function glyphFor(status) {
  switch (status) {
    case 'done':
      return (
        <svg className="h-5 w-5 text-teal-600" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M16.7 5.3a1 1 0 010 1.4l-8 8a1 1 0 01-1.4 0l-4-4a1 1 0 111.4-1.4L8 12.6l7.3-7.3a1 1 0 011.4 0z" clipRule="evenodd" />
        </svg>
      );
    case 'missing':
      return <span className="inline-block h-3 w-3 rounded-full bg-orange-500" title="Missing statement" />;
    case 'closed':
      return <span className="text-navy-500 font-bold text-base leading-none">—</span>;
    case 'not_applicable':
      return <span className="text-navy-400 font-bold text-xs">N/A</span>;
    default:
      return null;
  }
}

export default function StatusCell({ accountId, periodMonth, existing, displayName, onChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const status = existing?.status ?? 'not_started';

  const setStatus = async (next) => {
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const row = {
      account_id: accountId,
      period_month: periodMonth,
      status: next,
      completed_by: next === 'done' ? user?.id ?? null : null,
      completed_at: next === 'done' ? new Date().toISOString() : null,
    };
    const { error } = await supabase
      .from('account_months')
      .upsert(row, { onConflict: 'account_id,period_month' });
    setBusy(false);
    setOpen(false);
    if (error) {
      alert('Failed to save: ' + error.message);
      return;
    }
    onChange?.();
  };

  const clear = async () => {
    if (!existing) {
      setOpen(false);
      return;
    }
    setBusy(true);
    await supabase.from('account_months').delete().eq('id', existing.id);
    setBusy(false);
    setOpen(false);
    onChange?.();
  };

  const tooltip =
    status === 'done' && existing?.completed_at
      ? `Done by ${displayName || 'someone'} on ${fmtDateTime(existing.completed_at)}`
      : status === 'missing'
      ? 'Waiting on statement'
      : status === 'closed'
      ? 'Account closed'
      : status === 'not_applicable'
      ? 'Not applicable'
      : 'Not started — click to set';

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        title={tooltip}
        className={`h-7 w-7 rounded-md flex items-center justify-center border-2 transition ${
          status === 'done'
            ? 'bg-teal-50 border-teal-400'
            : status === 'missing'
            ? 'bg-orange-50 border-orange-300'
            : status === 'closed'
            ? 'bg-navy-100 border-navy-300'
            : status === 'not_applicable'
            ? 'bg-navy-50 border-navy-200'
            : 'bg-white border-navy-300 hover:border-teal-400 hover:bg-teal-50/40'
        }`}
      >
        {glyphFor(status)}
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 z-30 bg-white rounded-lg shadow-xl border border-navy-100 py-1 w-40">
          {STATUS_OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => setStatus(o.value)}
              className={`w-full text-left px-3 py-2 text-sm text-navy-700 hover:bg-navy-50 flex items-center gap-2 ${
                status === o.value ? 'font-semibold' : ''
              }`}
            >
              <span className={`inline-block h-2 w-2 rounded-full ${o.color.split(' ')[0]}`} />
              {o.label}
            </button>
          ))}
          {existing && (
            <>
              <div className="border-t border-navy-50 my-1" />
              <button
                onClick={clear}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
