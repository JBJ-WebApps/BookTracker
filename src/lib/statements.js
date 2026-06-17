import { supabase } from './supabase';
import { periodMonthString } from './months';

// Build-time flag — keeps the whole feature dark until you opt in.
export const STATEMENTS_ENABLED =
  String(import.meta.env.VITE_STATEMENTS_ENABLED).toLowerCase() === 'true';

const BUCKET = 'statements';

function storagePath(clientId, year, month1) {
  return `${clientId}/${year}-${String(month1).padStart(2, '0')}.pdf`;
}

export async function fetchPublications(clientId, year) {
  const from = periodMonthString(year, 1);
  const to = periodMonthString(year, 12);
  const { data, error } = await supabase
    .from('statement_publications')
    .select('*')
    .eq('client_id', clientId)
    .gte('period_month', from)
    .lte('period_month', to);
  if (error) throw error;
  return data ?? [];
}

// Uploads the PDF to private storage and upserts a 'ready' publication row.
export async function uploadStatement({ clientId, year, month1, file, userId }) {
  const path = storagePath(clientId, year, month1);
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type || 'application/pdf' });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from('statement_publications')
    .upsert(
      {
        client_id: clientId,
        period_month: periodMonthString(year, month1),
        status: 'ready',
        file_path: path,
        file_name: file.name,
        created_by: userId,
        error: null,
      },
      { onConflict: 'client_id,period_month' }
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Calls the serverless publish function (mock until CCH is wired up).
export async function triggerPublish(publicationId) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch('/.netlify/functions/publish-statement', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ publicationId }),
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Publish failed (${res.status}).`);
  return out;
}

// Short-lived signed URL to view/download a stored statement.
export async function statementSignedUrl(path) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error) throw error;
  return data.signedUrl;
}
