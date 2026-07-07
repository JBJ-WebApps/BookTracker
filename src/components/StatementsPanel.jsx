import { useCallback, useEffect, useState } from 'react';
import { MONTHS_LONG, periodMonthString } from '../lib/months';
import { fmtDateTime } from '../lib/format';
import Modal from './Modal';
import {
  fetchPublications,
  uploadStatement,
  triggerPublish,
  statementSignedUrl,
} from '../lib/statements';

const STATUS = {
  ready:     { label: 'Ready to send', cls: 'bg-amber-50 text-amber-700' },
  pending:   { label: 'Sending…',      cls: 'bg-blue-50 text-blue-700' },
  published: { label: 'Sent',          cls: 'bg-teal-50 text-teal-700' },
  failed:    { label: 'Failed',        cls: 'bg-red-50 text-red-700' },
};

// The message body SafeSend delivers (kept in sync with publish-statement.js).
const SEND_BODY =
  'Your financial statements from Johns Benson & Johns are attached, delivered securely via SafeSend Exchange.';

function subjectFor(clientName, year, month1) {
  const who = clientName ? `${clientName} — ` : '';
  return `${who}${MONTHS_LONG[month1 - 1]} ${year} Financial Statements`;
}

export default function StatementsPanel({ clientId, clientName, clientEmails, year, canEdit, userId }) {
  const [pubs, setPubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busyMonth, setBusyMonth] = useState(null);
  const [review, setReview] = useState(null); // { pub, month1 }
  const [sending, setSending] = useState(false);

  const recipients = String(clientEmails || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

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

  // Send happens only after the user reviews and confirms in the modal.
  const confirmSend = async () => {
    if (!review) return;
    setErr('');
    setSending(true);
    try {
      await triggerPublish(review.pub.id);
      setReview(null);
      await load();
    } catch (e) {
      setErr(e.message || 'Send failed.');
    } finally {
      setSending(false);
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
        Upload each month's financial-statement PDF, then click <strong>Publish</strong> to review and
        securely deliver it to the client through SafeSend Exchange. You'll see a preview and confirm
        before anything is sent.
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

                <div className="w-44 text-right">
                  {status && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${status.cls}`}>
                      {status.label}
                    </span>
                  )}
                  {pub?.status === 'published' && pub.published_at && (
                    <div className="text-[10px] text-navy-400 mt-0.5">
                      FS sent {fmtDateTime(pub.published_at)}
                    </div>
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
                      onClick={() => setReview({ pub, month1 })}
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

      <Modal
        open={!!review}
        onClose={() => (sending ? null : setReview(null))}
        title="Review before sending"
        size="lg"
        footer={
          <>
            <button
              onClick={() => setReview(null)}
              disabled={sending}
              className="px-4 py-2 text-sm rounded-md text-navy-600 hover:bg-navy-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={confirmSend}
              disabled={sending || recipients.length === 0}
              className="px-4 py-2 text-sm rounded-md bg-teal-500 hover:bg-teal-600 text-white font-medium disabled:opacity-40"
            >
              {sending ? 'Sending…' : 'Send securely via SafeSend'}
            </button>
          </>
        }
      >
        {review && (
          <div className="space-y-3 text-sm">
            <p className="text-navy-500">
              This will securely deliver the statement to the client through SafeSend Exchange. Nothing
              is sent until you click <strong>Send</strong>.
            </p>
            <Field label="To">
              {recipients.length ? (
                <span className="text-navy-800">{recipients.join(', ')}</span>
              ) : (
                <span className="text-red-600">
                  No email on file for this client — add one on the client's Edit screen before sending.
                </span>
              )}
            </Field>
            <Field label="Subject">
              <span className="text-navy-800">{subjectFor(clientName, year, review.month1)}</span>
            </Field>
            <Field label="Message">
              <span className="text-navy-700">{SEND_BODY}</span>
            </Field>
            <Field label="Attachment">
              <span className="text-navy-800">{review.pub?.file_name || '—'}</span>
              {review.pub?.file_path && (
                <button
                  onClick={() => onView(review.pub)}
                  className="ml-2 text-teal-700 hover:underline text-xs"
                >
                  Preview PDF
                </button>
              )}
            </Field>
            {review.pub?.status === 'published' && review.pub.published_at && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                Already sent {fmtDateTime(review.pub.published_at)}. Sending again will deliver a new copy.
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="grid grid-cols-[90px_1fr] gap-2 items-start">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-navy-400 pt-0.5">
        {label}
      </div>
      <div className="min-w-0 break-words">{children}</div>
    </div>
  );
}
