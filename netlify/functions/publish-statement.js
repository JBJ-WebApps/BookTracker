// Publish a client's monthly financial statement to their SafeSend Exchange portal.
//
// Pipeline (upload PDF → record → trigger → status) works against a MOCK provider
// until SafeSend is configured. Flip SAFESEND_ENABLED=true (with the SAFESEND_*
// vars set) to deliver for real. Nothing else in the app changes.
//
// Required env (already set for manage-users): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// SafeSend (set in Netlify when going live):
//   SAFESEND_ENABLED=true
//   SAFESEND_CLIENT_ID, SAFESEND_CLIENT_SECRET, SAFESEND_AUDIENCE   (Developer section → APIs Client)
//   SAFESEND_USER_EMAIL        (authorized user; sent as the required x-email header)
//   SAFESEND_TOKEN_URL         (optional, default https://auth.thomsonreuters.com/oauth/token)
//   SAFESEND_API_BASE          (optional, default https://api.safesend.com)
//   SAFESEND_SUBSCRIPTION_KEY  (optional; added as Ocp-Apim-Subscription-Key if set)
//   SAFESEND_RETENTION_PERIOD  (optional; e.g. OneYear, ThreeYears, SevenYears)
//
// POST body: { publicationId }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STATEMENTS_BUCKET = 'statements';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// SafeSend wants RetentionPeriod as the numeric enum (0-9), not the text name.
const RETENTION_MAP = {
  OneDay: 0, SevenDays: 1, FourteenDays: 2, TwentyOneDays: 3, ThirtyDays: 4,
  NinetyDays: 5, OneEightyDays: 6, OneYear: 7, ThreeYears: 8, SevenYears: 9,
};
function retentionValue() {
  const raw = process.env.SAFESEND_RETENTION_PERIOD;
  if (raw == null || raw === '') return 7; // default: OneYear
  if (raw in RETENTION_MAP) return RETENTION_MAP[raw];
  const n = Number(raw);
  return Number.isInteger(n) ? n : 7;
}

function defaultSubject(publication, client) {
  const [y, m] = String(publication.period_month).split('-');
  const month = MONTHS[Number(m) - 1] || '';
  const who = client?.name ? `${client.name} — ` : '';
  return `${who}${month} ${y} Financial Statements`.trim();
}

// ---------------------------------------------------------------------------
// Provider seam — mock (default) vs SafeSend (SAFESEND_ENABLED=true).
// ---------------------------------------------------------------------------
const mockProvider = {
  name: 'mock',
  async publish({ admin, publication }) {
    if (publication.file_path) {
      const { error } = await admin.storage.from(STATEMENTS_BUCKET).download(publication.file_path);
      if (error) throw new Error(`Could not read the uploaded file: ${error.message}`);
    }
    return { externalId: `mock-${publication.id}` };
  },
};

// M2M token cache. SafeSend allows only 40 token requests/hour per client and the
// token lasts 24h, so we cache and reuse. (Netlify reuses warm instances, so this
// cache survives across many invocations; worst case we mint a fresh one.)
let _tokenCache = null; // { value, expiresAt }
async function getSafeSendToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60_000) return _tokenCache.value;

  const url = process.env.SAFESEND_TOKEN_URL || 'https://auth.thomsonreuters.com/oauth/token';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.SAFESEND_CLIENT_ID,
      client_secret: process.env.SAFESEND_CLIENT_SECRET,
      audience: process.env.SAFESEND_AUDIENCE,
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`SafeSend token request failed (${res.status}). ${detail}`.trim());
  }
  const data = await res.json();
  const ttlMs = (Number(data.expires_in) || 3600) * 1000;
  _tokenCache = { value: data.access_token, expiresAt: Date.now() + ttlMs };
  return _tokenCache.value;
}

const safeSendProvider = {
  name: 'safesend',
  async publish({ admin, publication, client }) {
    const recipients = String(client?.emails || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!recipients.length) {
      throw new Error('This client has no email address on file, so there is no one to deliver to.');
    }

    // SafeSend expects each attachment as a fetchable URL (not base64). Hand it a
    // short-lived signed URL to the PDF in our private bucket; SafeSend downloads it.
    const { data: signed, error: urlErr } = await admin.storage
      .from(STATEMENTS_BUCKET)
      .createSignedUrl(publication.file_path, 3600);
    if (urlErr || !signed?.signedUrl) {
      throw new Error(`Could not create a download link: ${urlErr?.message || 'no url returned'}`);
    }

    const token = await getSafeSendToken();
    const base = process.env.SAFESEND_API_BASE || 'https://api.safesend.com';

    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      // Required on every SafeSend API call: the authorized user's email.
      'x-email': process.env.SAFESEND_USER_EMAIL || '',
    };
    if (process.env.SAFESEND_SUBSCRIPTION_KEY) {
      headers['Ocp-Apim-Subscription-Key'] = process.env.SAFESEND_SUBSCRIPTION_KEY;
    }

    const payload = {
      recipients,
      subject: defaultSubject(publication, client),
      body: 'Your financial statements from Johns Benson & Johns are attached, delivered securely via SafeSend Exchange.',
      attachments: [signed.signedUrl],
      correlationId: publication.id,
      retentionPeriod: retentionValue(),
    };

    const res = await fetch(`${base}/sse/v1/message/send/`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`SafeSend send failed (${res.status}). ${detail}`.trim());
    }
    const out = await res.json().catch(() => ({}));
    return { externalId: out?.data || publication.id };
  },
};

function getProvider() {
  if (String(process.env.SAFESEND_ENABLED).toLowerCase() === 'true') return safeSendProvider;
  return mockProvider;
}

// ---------------------------------------------------------------------------
export const handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed.' });
  if (!SUPABASE_URL || !SERVICE_KEY) {
    return json(500, { error: 'Server not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Authenticate the caller (any signed-in user; editing is gated in the UI).
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json(401, { error: 'Not signed in.' });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) {
    console.error('publish-statement auth check failed:', userErr?.message);
    return json(401, { error: 'Your session has expired. Please refresh the page and sign in again.' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Malformed request body.' });
  }
  const publicationId = String(payload.publicationId || '');
  if (!publicationId) return json(400, { error: 'Missing publicationId.' });

  const { data: publication, error: pErr } = await admin
    .from('statement_publications')
    .select('*')
    .eq('id', publicationId)
    .maybeSingle();
  if (pErr) return json(500, { error: pErr.message });
  if (!publication) return json(404, { error: 'Publication not found.' });
  if (!publication.file_path) return json(400, { error: 'Upload a statement PDF before publishing.' });

  // Load the client (for recipient emails + subject).
  const { data: client } = await admin
    .from('clients')
    .select('id, name, emails')
    .eq('id', publication.client_id)
    .maybeSingle();

  const provider = getProvider();

  await admin
    .from('statement_publications')
    .update({ status: 'pending', provider: provider.name, error: null })
    .eq('id', publicationId);

  try {
    const { externalId } = await provider.publish({ admin, publication, client });
    const { data: updated, error: uErr } = await admin
      .from('statement_publications')
      .update({
        status: 'published',
        provider: provider.name,
        external_doc_id: externalId ?? null,
        published_at: new Date().toISOString(),
        error: null,
      })
      .eq('id', publicationId)
      .select()
      .single();
    if (uErr) return json(500, { error: uErr.message });
    return json(200, { ok: true, publication: updated });
  } catch (e) {
    await admin
      .from('statement_publications')
      .update({ status: 'failed', provider: provider.name, error: String(e.message || e) })
      .eq('id', publicationId);
    return json(502, { error: `Publish failed: ${e.message || e}` });
  }
};
