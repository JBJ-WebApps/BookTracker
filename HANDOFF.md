# BookTracker — session handoff

Pick-up notes for continuing on another machine. The memory notes in `~/.claude/`
do **not** sync across computers, so this file (which travels via OneDrive + GitHub)
is the source of truth for context.

## What this is
React + Vite + Tailwind + Supabase app, Netlify-hosted at **booktracker-jbj.netlify.app**,
for the accounting firm **Johns Benson & Johns**. Tracks monthly bookkeeping completion
per client/account. Admins see everything; employees see clients they're responsible/
assistant for. Months normalized to `period_month = YYYY-MM-01`.

## Repo state
Everything is committed and pushed to `main` — nothing pending. Get oriented with the
recent git log and these files:
`src/pages/DashboardPage.jsx`, `src/pages/ClientDetailPage.jsx`,
`src/components/Sidebar.jsx`, `src/components/MonthGrid.jsx`,
`src/pages/AuditLogPage.jsx`, `supabase/schema.sql`, `supabase/migrations/`.

## Shipped recently (this session)
- Dashboard **JAN–DEC F.S.-printed strip** on each client card (green = printed, red = not).
- **Client emails** field + one-click "Financial Statements" `mailto:` (subject defaults to
  the **prior** month; keeps the year).
- **Two-decimal currency** everywhere.
- **Live multi-user updates** via Supabase Realtime (client detail + dashboard re-fetch on change).
- **Sidebar redesign:** search → My Clients (own, expanded) → Other Employees (named groups) →
  All Clients A–Z. Names need migration `0009` (profiles read-all) — already applied live.
- **Editing locked** to assigned staff (responsible/assistant) + admins; everyone else view-only
  (UI-level enforcement via `canEdit`; DB write RLS intentionally left open).
- **Audit log rewritten** to group edit-bursts and show real detail (account + status + month).

## Key gotcha — DB migrations are manual
No Supabase CLI link / service-role key locally. Migration files in `supabase/migrations/`
are history only; they do **not** auto-apply. Apply SQL by hand in the Supabase dashboard
SQL Editor, and run it **before** pushing code that writes a new column (else all writes to
that table break). RLS is wide open (all authed) per migration `0004`.

## Open thread to continue — client portal via SafeSend Exchange
Carolyn/Kristina want clients to view their own monthly financial statements. **Decision (2026-06-17):
deliver via SafeSend One / SafeSend Exchange**, not CCH Axcess. The firm already uses SafeSend as
its client-facing portal, and its REST API can push a document to a client. (CCH was the earlier
plan but dropped — wife prefers SafeSend.)

### SafeSend API facts (confirmed from the developer portal)
- **Auth = M2M OAuth (Auth0 client-credentials).** `POST https://auth.thomsonreuters.com/oauth/token`
  with `{ client_id, client_secret, audience, grant_type: 'client_credentials' }` → `access_token`
  (valid 24h; **max 40 token requests/hour/client — cache & reuse**). Client ID / Secret / Audience
  come from SafeSend → Developer Section → "APIs Client".
- **Every API call also needs an `x-email` header** = the authorized SafeSend user's email.
- **Delivery = SafeSend Exchange "Send Message":** `POST https://api.safesend.com/sse/v1/message/send/`
  with `Authorization: Bearer <token>`, body `{ recipients: [clientEmail], subject, body,
  attachments: [<base64 PDF>], correlationId }`. Attachments MUST be Base64. Client receives a secure
  Exchange message (access-code protected). Requires the firm's plan to include SafeSend Exchange.
- Full endpoint inventory + the two key spec pages are saved under `api docs/` (gitignored).

### Built (2026-06-13 scaffold, 2026-06-17 real SafeSend adapter) — dark, behind flags
Works end-to-end; nothing visible to users until enabled. Pieces:
- **DB:** `supabase/migrations/0010_statement_publications.sql` — `statement_publications` table +
  private `statements` storage bucket + RLS. **Not yet applied** (manual step).
- **Function:** `netlify/functions/publish-statement.js` — auth-checks caller, loads the publication
  + client emails, calls `provider.publish()`, writes status. `getProvider()` switches `mockProvider`
  ↔ `safeSendProvider` on `SAFESEND_ENABLED`. `safeSendProvider` is fully implemented: cached M2M
  token + Send Message with the Base64 PDF.
- **Frontend:** `src/lib/statements.js` + `src/components/StatementsPanel.jsx` (per-month upload +
  status + Publish), shown on `ClientDetailPage` only when `VITE_STATEMENTS_ENABLED === 'true'`.

**To dry-run the mock now:** apply migration 0010, set `VITE_STATEMENTS_ENABLED=true` in Netlify,
redeploy. Upload a PDF → Publish → status "Published" (simulated, nothing sent). Carolyn unaffected
while the flag is off.

**To go live with SafeSend (go-live checklist):**
1. Confirm the firm's SafeSend plan includes **Exchange**.
2. In SafeSend Developer Section → APIs Client, generate the **Client Secret** (shown once) and note
   Client ID + Audience. Confirm the authorized user's email (for `x-email`).
3. Set in Netlify env: `SAFESEND_ENABLED=true`, `SAFESEND_CLIENT_ID`, `SAFESEND_CLIENT_SECRET`,
   `SAFESEND_AUDIENCE`, `SAFESEND_USER_EMAIL` (+ optional `SAFESEND_SUBSCRIPTION_KEY`,
   `SAFESEND_RETENTION_PERIOD`). See `.env.example`.
4. **Test send** to a known address — verify the `attachments` Base64 format is accepted and the PDF
   arrives intact (the one detail not 100% confirmed from docs: whether a filename must accompany the
   Base64). Adjust `safeSendProvider.publish()` if SafeSend wants a richer attachment object.
5. ⚠️ Rotate the SafeSend subscription keys / client secret that were screenshotted during setup.

No other files should need to change.
