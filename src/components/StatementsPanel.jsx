import { useCallback, useEffect, useState } from 'react';
import { MONTHS_LONG, periodMonthString } from '../lib/months';
import {
  fetchPublications,
  uploadStatement,
  triggerPublish,
  statementSignedUrl,
} from '../lib/statements';

const STATUS = {
  ready:     { label: 'Ready to publish', cls: 'bg-amber-50 text-amber-700' },
  pending:   { label: 'Publishing…',      cls: 'bg-blue-50 text-blue-700' },
  published: { label: 'Published',        cls: 'bg-teal-50 text-teal-700' },
  failed:    { label: 'Failed',           cls: 'bg-red-50 text-red-700' },
};

export default function StatementsPanel({ clientId, year, canEdit, userId }) {
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyMonth, setBusyMonth] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setPubs(await fetchPublications(clientId, year));
    } catch (e) {
      setErr(e.message || 'Could not load statements.');
    } finally {
      setLoading(false);
    }
  }, [clientId, year]);

  useEffect(() => {
    load();
  }, [load]);

  const byMonth = new Map(pubs.map((p) => [p.period_month, p]));

  const onUpload = async (month1, file) => {
    if (!file) return;
    setErr('');
    setBusyMonth(month1);
    try {
      await uploadStatement({ clientId, year, month1, file, userId });
      await load();
    } catch (e) {
      setErr(e.message || 'Upload failed.');
    } finally {
      setBusyMonth(null);
    }
  };

  const onPublish = async (pub, month1) => {
    setErr('');
    setBusyMonth(month1);
    try {
      await triggerPublish(pub.id);
      await load();
    } catch (e) {
      setErr(e.message || 'Publish failed.');
    } finally {
      setBusyMonth(null);
    }
  };

  const onView = async (pub) => {
    try {
      const url = await statementSignedUrl(pub.file_path);
      window.open(url, '_blank', 'noopener');
    } catch (e) {
      setErr(e.message || 'Could not open file.');
    }
  };

  return (
    <div className="bg-white rounded-xl border border-navy-100 shadow-card px-5 py-4">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-bold uppercase tracking-wider text-navy-400">
          Client portal statements · {year}
        </div>
      </div>
      <div className="text-xs text-navy-400 mb-3">
        Upload each month's financial-statement PDF, then publish it to deliver it to the client's
        SafeSend Exchange portal. Until SafeSend is connected, “Publish” is simulated (nothing is sent).
      </div>

      {err && (
        <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-navy-400 py-4">Loading…</div>
      ) : (
        <div className="divide-y divide-navy-50">
          {MONTHS_LONG.map((name, i) => {
            const month1 = i + 1;
            const pub = byMonth.get(periodMonthString(year, month1));
            const status = pub ? STATUS[pub.status] : null;
            const busy = busyMonth === month1;
            return (
              <div key={month1} className="flex items-center gap-3 py-2 text-sm">
                <div className="w-24 font-medium text-navy-700">{name}</div>

                <div className="flex-1 min-w-0">
                  {pub?.file_name ? (
                    <button
                      onClick={() => onView(pub)}
                      className="text-teal-700 hover:underline truncate max-w-full text-left"
                      title="Open the uploaded PDF"
                    >
                      {pub.file_name}
                    </button>
                  ) : (
                    <span className="text-navy-300">No statement uploaded</span>
                  )}
                  {pub?.status === 'failed' && pub.error && (
                    <div className="text-[11px] text-red-500 truncate">{pub.error}</div>
                  )}
                </div>

                <div className="w-36 text-right">
                  {status && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                      {status.label}
                    </span>
                  )}
                </div>

                {canEdit && (
                  <div className="flex items-center gap-2 w-52 justify-end">
                    <label
                      className={`text-xs px-2.5 py-1.5 rounded-md cursor-pointer ${
                        busy ? 'text-navy-300' : 'text-navy-600 hover:bg-navy-100'
                      }`}
                    >
                      {pub?.file_name ? 'Replace' : 'Upload PDF'}
                      <input
                        type="file"
                        accept="application/pdf"
                        className="hidden"
                        disabled={busy}
                        onChange={(e) => {
                          onUpload(month1, e.target.files?.[0]);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <button
                      onClick={() => onPublish(pub, month1)}
                      disabled={busy || !pub?.file_path || pub?.status === 'pending'}
                      className="text-xs px-2.5 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 text-white font-medium disabled:opacity-40"
                    >
                      {pub?.status === 'published' ? 'Re-publish' : 'Publish'}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
