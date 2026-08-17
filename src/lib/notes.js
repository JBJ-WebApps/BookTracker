import { supabase } from './supabase';

export async function fetchNotesForClient(clientId) {
  const { data, error } = await supabase
    .from('client_notes')
    .select('id, body, created_at, author_id, author:profiles(full_name, email)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function postNote(clientId, authorId, body, mentionedUserIds = []) {
  const { data: note, error } = await supabase
    .from('client_notes')
    .insert({ client_id: clientId, author_id: authorId, body })
    .select()
    .single();
  if (error) throw error;

  const ids = [...new Set(mentionedUserIds)].filter((id) => id && id !== authorId);
  if (ids.length) {
    const rows = ids.map((mentioned_user_id) => ({ note_id: note.id, mentioned_user_id }));
    const { error: mErr } = await supabase.from('note_mentions').insert(rows);
    if (mErr) throw mErr;
  }
  return note;
}

// This user's unread @mentions, grouped by client (for the top-bar dropdown and
// the per-client badge). Small dataset (~150 clients) so grouping happens client-side.
export async function fetchUnreadMentionSummary(userId) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('note_mentions')
    .select('id, client_notes(client_id, body, created_at, clients(name))')
    .eq('mentioned_user_id', userId)
    .is('read_at', null);
  if (error) throw error;

  const byClient = new Map();
  for (const row of data ?? []) {
    const note = row.client_notes;
    if (!note) continue;
    const existing = byClient.get(note.client_id);
    if (existing) {
      existing.count += 1;
      if (new Date(note.created_at) > new Date(existing.latestNote.created_at)) {
        existing.latestNote = note;
      }
    } else {
      byClient.set(note.client_id, {
        clientId: note.client_id,
        clientName: note.clients?.name || '',
        count: 1,
        latestNote: note,
      });
    }
  }
  return [...byClient.values()].sort(
    (a, b) => new Date(b.latestNote.created_at) - new Date(a.latestNote.created_at)
  );
}

export async function markClientMentionsRead(clientId, userId) {
  const { data: notes, error: notesErr } = await supabase
    .from('client_notes')
    .select('id')
    .eq('client_id', clientId);
  if (notesErr) throw notesErr;
  const noteIds = (notes ?? []).map((n) => n.id);
  if (!noteIds.length) return;

  const { error } = await supabase
    .from('note_mentions')
    .update({ read_at: new Date().toISOString() })
    .eq('mentioned_user_id', userId)
    .in('note_id', noteIds)
    .is('read_at', null);
  if (error) throw error;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest names first so "Kristina Smith" matches before "Kristina" would.
function nameAlternation(staff) {
  return (staff || [])
    .map((s) => s.full_name)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
}

export function extractMentionedUserIds(body, staff) {
  const alt = nameAlternation(staff);
  if (!alt) return [];
  const re = new RegExp(`@(${alt})\\b`, 'g');
  const found = new Set();
  let m;
  while ((m = re.exec(body))) {
    const person = (staff || []).find((s) => s.full_name === m[1]);
    if (person) found.add(person.id);
  }
  return [...found];
}

// Splits note text into { text, mention } segments so @Name can render highlighted.
export function mentionSegments(body, staff) {
  const alt = nameAlternation(staff);
  if (!alt) return [{ text: body, mention: false }];
  const re = new RegExp(`(@(?:${alt})\\b)`, 'g');
  return body
    .split(re)
    .filter((s) => s !== '')
    .map((text) => ({ text, mention: text.startsWith('@') && (staff || []).some((s) => `@${s.full_name}` === text) }));
}
