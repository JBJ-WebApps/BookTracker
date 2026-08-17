import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { fmtDateTime } from '../lib/format';
import Modal from './Modal';
import { useMentionAlerts } from '../context/MentionAlertsContext';
import { fetchNotesForClient, postNote, extractMentionedUserIds, mentionSegments } from '../lib/notes';

export default function NotesModal({ open, onClose, clientId, userId, staff }) {
  const { markRead } = useMentionAlerts();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [mentionQuery, setMentionQuery] = useState(null);
  const textareaRef = useRef(null);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    setErr('');
    try {
      setNotes(await fetchNotesForClient(clientId));
    } catch (e) {
      setErr(e.message || 'Could not load notes.');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    if (!open) return;
    load();
    markRead(clientId);
  }, [open, clientId, load, markRead]);

  // Live thread updates while the modal is open.
  useEffect(() => {
    if (!open || !clientId) return;
    let t;
    const ping = () => {
      clearTimeout(t);
      t = setTimeout(load, 250);
    };
    const channel = supabase
      .channel(`client-notes-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'client_notes', filter: `client_id=eq.${clientId}` },
        ping
      )
      .subscribe();
    return () => {
      clearTimeout(t);
      supabase.removeChannel(channel);
    };
  }, [open, clientId, load]);

  useEffect(() => {
    if (open && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [open, notes]);

  useEffect(() => {
    if (!open) {
      setBody('');
      setMentionQuery(null);
      setErr('');
    }
  }, [open]);

  const onBodyChange = (e) => {
    const val = e.target.value;
    setBody(val);
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const m = before.match(/@([A-Za-z]*)$/);
    setMentionQuery(m ? m[1] : null);
  };

  const suggestions =
    mentionQuery == null
      ? []
      : staff
          .filter((s) => s.full_name && s.full_name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
          .slice(0, 6);

  const pickMention = (person) => {
    const el = textareaRef.current;
    const cursor = el ? el.selectionStart : body.length;
    const before = body.slice(0, cursor).replace(/@([A-Za-z]*)$/, `@${person.full_name} `);
    const after = body.slice(cursor);
    const next = before + after;
    setBody(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  const onPost = async () => {
    const text = body.trim();
    if (!text) return;
    setPosting(true);
    setErr('');
    try {
      const mentionedUserIds = extractMentionedUserIds(text, staff);
      await postNote(clientId, userId, text, mentionedUserIds);
      setBody('');
      setMentionQuery(null);
      await load();
    } catch (e) {
      setErr(e.message || 'Could not post note.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Notes" size="lg">
      <div className="flex flex-col h-[60vh]">
        {err && (
          <div className="mb-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {err}
          </div>
        )}

        <div ref={listRef} className="flex-1 overflow-y-auto space-y-3 pr-1">
          {loading ? (
            <div className="text-sm text-navy-400">Loading…</div>
          ) : notes.length === 0 ? (
            <div className="text-sm text-navy-400 italic">No notes yet. Start the conversation below.</div>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="text-sm">
                <div className="flex items-baseline gap-2">
                  <span className="font-semibold text-navy-700">
                    {n.author?.full_name || n.author?.email || 'Unknown'}
                  </span>
                  <span className="text-[11px] text-navy-300">{fmtDateTime(n.created_at)}</span>
                </div>
                <div className="text-navy-600 whitespace-pre-wrap break-words">
                  {mentionSegments(n.body, staff).map((seg, i) =>
                    seg.mention ? (
                      <span
                        key={i}
                        className="inline-block rounded-full bg-teal-50 text-teal-700 px-1.5 font-medium"
                      >
                        {seg.text}
                      </span>
                    ) : (
                      <span key={i}>{seg.text}</span>
                    )
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="relative mt-3 pt-3 border-t border-navy-50">
          {suggestions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-1 w-64 rounded-md bg-white border border-navy-100 shadow-lg z-10">
              {suggestions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => pickMention(s)}
                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-navy-50"
                >
                  {s.full_name}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={body}
            onChange={onBodyChange}
            placeholder="Type a note… use @Name to tag someone"
            rows={3}
            className="w-full rounded-md border border-navy-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-teal-300"
          />
          <div className="mt-2 flex justify-end">
            <button
              onClick={onPost}
              disabled={posting || !body.trim()}
              className="px-4 py-2 text-sm rounded-md bg-teal-500 hover:bg-teal-600 text-white font-medium disabled:opacity-40"
            >
              {posting ? 'Posting…' : 'Post note'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
