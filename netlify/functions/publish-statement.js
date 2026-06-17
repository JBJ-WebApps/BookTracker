// Publish a client's monthly financial statement to their portal.
//
// This is the SEAM for the CCH Axcess integration. The whole pipeline
// (upload PDF → record → trigger → status) works today against a MOCK provider.
// When CCH API access is granted, implement cchProvider.publish() + getCchToken()
// below, set the CCH_* env vars in Netlify, and set CCH_ENABLED=true. Nothing
// else in the app needs to change.
//
// Required env (already set for manage-users): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Later, for CCH: CCH_ENABLED, CCH_OAUTH_URL, CCH_CLIENT_ID, CCH_CLIENT_SECRET,
//                 CCH_API_BASE, CCH_SCOPE
//
// POST body: { publicationId }

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STATEMENTS_BUCKET = 'statements';

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

// ---------------------------------------------------------------------------
// Provider seam — swap implementations via CCH_ENABLED.
// ---------------------------------------------------------------------------
const mockProvider = {
  name: 'mock',
  // Pretends to publish. Confirms the file exists, then returns a fake doc id.
  async publish({ admin, publication }) {
    if (publication.file_path) {
      const { error } = await admin.storage.from(STATEMENTS_BUCKET).download(publication.file_path);
      if (error) throw new Error(`Could not read the uploaded file: ${error.message}`);
    }
    return { externalId: `mock-${publication.id}` };
  },
};

const cchProvider = {
  name: 'cch',
  async publish({ admin, publication }) {
    // TODO(CCH): implement once API access is granted. Sketch of the steps:
    //   const token = await getCchToken();
    //   const { data: file } = await admin.storage
    //     .from(STATEMENTS_BUCKET).download(publication.file_path);
    //   // 1. POST the PDF to the CCH Document API (multipart) -> documentId
    //   // 2. Publish/link documentId to the client's CCH portal via the Portal API
    //   //    (needs a mapping from our client -> CCH client/entity id; store it on
    //   //     clients, e.g. a cch_portal_id column, when we know the shape)
    //   // 3. (optional) trigger the "documents ready" client email via API
    //   // 4. return { externalId: documentId }
    throw new Error(
      'CCH provider is not implemented yet. Set CCH_ENABLED + credentials and finish cchProvider.publish().'
    );
  },
};

// OAuth2 client-credentials token fetch + cache (filled in with CCH).
let _tokenCache = null; // { token, expiresAt }
async function getCchToken() {
  // TODO(CCH): confirm the exact token URL, params, and scope, then implement:
  //   const res = await fetch(process.env.CCH_OAUTH_URL, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  //     body: new URLSearchParams({
  //       grant_type: 'client_credentials',
  //       client_id: process.env.CCH_CLIENT_ID,
  //       client_secret: process.env.CCH_CLIENT_SECRET,
  //       scope: process.env.CCH_SCOPE || '',
  //     }),
  //   });
  //   if (!res.ok) throw new Error(`CCH token request failed: ${res.status}`);
  //   const data = await res.json();
  //   _tokenCache = { token: data.access_token, expiresAt: <stamp from data.expires_in> };
  //   return _tokenCache.token;
  void _tokenCache;
  throw new Error('getCchToken not implemented.');
}

function getProvider() {
  if (String(process.env.CCH_ENABLED).toLowerCase() === 'true') return cchProvider;
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
  if (userErr || !userData?.user) return json(401, { error: 'Your session is invalid or expired.' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Malformed request body.' });
  }
  const publicationId = String(payload.publicationId || '');
  if (!publicationId) return json(400, { error: 'Missing publicationId.' });

  // Load the publication row.
  const { data: publication, error: pErr } = await admin
    .from('statement_publications')
    .select('*')
    .eq('id', publicationId)
    .maybeSingle();
  if (pErr) return json(500, { error: pErr.message });
  if (!publication) return json(404, { error: 'Publication not found.' });
  if (!publication.file_path) return json(400, { error: 'Upload a statement PDF before publishing.' });

  const provider = getProvider();

  // Mark in-progress.
  await admin
    .from('statement_publications')
    .update({ status: 'pending', provider: provider.name, error: null })
    .eq('id', publicationId);

  try {
    const { externalId } = await provider.publish({ admin, publication });
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
