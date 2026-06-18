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

## Client portal via SafeSend Exchange — ✅ LIVE & TESTED (first real send worked 2026-06-17 night)
Clients receive their monthly financial statements via **SafeSend One / SafeSend Exchange** (not CCH —
that plan was dropped). **End-to-end pipeline is proven:** in BookTracker, on a client's page, upload
the FS PDF → click Publish → a Netlify function sends it through SafeSend → the client gets a secure
"Download Your Documents" email with the firm logo + a Download button. First real send delivered to
Scott's own company test client (**Parra Steel LLC**, his email) and arrived correctly.

### How it works (the employee workflow)
QuickBooks → save FS as PDF → in BookTracker open the client → **Upload PDF** for the month →
**Publish** → SafeSend delivers it to the client's email. (BookTracker does NOT pull from QuickBooks;
the PDF upload is manual — see Phase 2 below for eliminating that.)

### SafeSend API facts (CONFIRMED by working in production — corrects earlier guesses)
- **Auth = M2M OAuth (Auth0 client-credentials).** `POST https://auth.thomsonreuters.com/oauth/token`
  with `{ client_id, client_secret, audience, grant_type: 'client_credentials' }` → `access_token`
  (valid 24h; max 40 token req/hour/client — we cache & reuse).
- **Every call needs an `x-email` header** = the SafeSend user the message is sent *as*. This user's
  display name is what the client sees in *"[Name] has sent you…"*. Currently set to Scott → email
  reads "Scott Kingston has sent you" (needs changing — see TODOs).
- **Delivery = "Send Message":** `POST https://api.safesend.com/sse/v1/message/send/`, body
  `{ recipients:[clientEmail], subject, body, attachments:[url], correlationId, retentionPeriod }`.
  TWO gotchas the docs got wrong, now fixed in code:
  - **`retentionPeriod` must be the INTEGER enum (0-9), NOT the name.** We send 7 (OneYear) by default.
  - **`attachments` must be a fetchable URL, NOT base64.** (Bare base64 AND data URIs both rejected with
    "attachment url is not in correct format".) We pass a **Supabase signed URL** (1h expiry) to the PDF;
    SafeSend downloads it at send time. Works.
- Requires the firm's plan to include SafeSend Exchange (it does). Endpoint inventory + spec pages saved
  under `api docs/` (gitignored).

### Built & deployed (commits through `fbb5323`)
- **DB:** `supabase/migrations/0010_statement_publications.sql` — APPLIED to Supabase. `statement_publications`
  table + private `statements` storage bucket + RLS.
- **Function:** `netlify/functions/publish-statement.js` — fully implemented `safeSendProvider`
  (cached M2M token + Send Message with signed-URL attachment). `getProvider()` switches mock ↔ safesend
  on `SAFESEND_ENABLED`. Also note: it auth-checks the caller via the Supabase service key.
- **Frontend:** `src/lib/statements.js` + `src/components/StatementsPanel.jsx`, shown on `ClientDetailPage`
  only when `VITE_STATEMENTS_ENABLED === 'true'`.
- **Live Netlify env (all set):** `VITE_STATEMENTS_ENABLED=true`, `SAFESEND_ENABLED=true`,
  `SAFESEND_CLIENT_ID/SECRET/AUDIENCE`, `SAFESEND_USER_EMAIL` (= Scott's, for the test).

### Gotcha fixed during setup: the Supabase service-role key was wrong
`SUPABASE_SERVICE_ROLE_KEY` in Netlify was invalid ("Invalid API key" from GoTrue) — re-pasted the
correct `service_role` key from Supabase → Project Settings → API. This had ALSO been silently breaking
the **Users screen** functions (Add/Reset/Delete via `manage-users.js`) — they should work now too.

### TODOs to finish (pick up here on desktop)
1. **Sender branding (Scott asked):** email body says *"Scott Kingston has sent you"* — he wants the firm
   /a bookkeeper, not him. Fix = set `SAFESEND_USER_EMAIL` to Carolyn's (or a dedicated firm/bookkeeping)
   SafeSend account **that has the API Developer permission**; that account's display name is what shows.
   To read the firm name instead of a person, set that SafeSend user's display name to the firm or find a
   SafeSend "send as firm" setting. (No BookTracker code change — it's SafeSend account config + 1 env var.)
2. **Panel wording cleanup:** `StatementsPanel.jsx` still says "Publish is simulated (nothing is sent)" —
   it IS sending now. Update that line.
3. **Diagnostic left in:** `publish-statement.js` returns a verbose auth error ("Session check failed: …
   url tail …") — fine to keep or trim back.
4. **Signed-URL expiry** is 1h (`createSignedUrl(..., 3600)`); fine since SafeSend downloads at send time.
   Bump it only if a client ever reports a broken download link.
5. ⚠️ **Rotate secrets before real clients:** the SafeSend Client Secret + subscription keys were
   screenshotted during setup; regenerate them and update Netlify.
6. **Quick UX win Scott wants:** a per-client OneDrive **folder link** field shown by the Upload button
   ("📂 Open FS folder") so Carolyn doesn't dig through folders. (Note: browsers can't pre-aim the file
   picker — this is just a clickable shortcut to the folder.)

### Phase 2 (later) — eliminate the manual upload
Goal: Carolyn saves the FS PDF to OneDrive in a standard path and BookTracker fetches it automatically.
**Blocker:** reading the firm's OneDrive needs Microsoft Graph access to their M365 tenant, which Scott
does NOT have (same wall as DNS/email — it's the wife's company). Best route that sidesteps this: a
firm-built **Power Automate** flow that POSTs new FS PDFs to a BookTracker endpoint (the flow holds the
OneDrive access, not us). Open questions for Carolyn: is the firm on M365/OneDrive, do they have Power
Automate, and what's the folder convention (e.g. `Client/FS/2026/Jan`)?
