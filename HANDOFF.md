# BookTracker — session handoff

## ✅ DONE 2026-08-17 — Per-client User Notes (@mention alerts); admin roles updated; 8 pending logins reset
- **Per-client User Notes**, live in commit `c72fbe5`, migration `0011_client_notes.sql` applied to
  Supabase. A "Notes" button + red unread badge sits next to "Due day" on each client's detail page;
  clicking opens a thread modal (`src/components/NotesModal.jsx`) where any user can post and
  `@Full Name`-tag a coworker. Tagging creates a `note_mentions` row; a red badge lights up live
  (Supabase Realtime) both on that client's page and globally in the top bar next to the tagged
  user's name (`src/components/NotesAlertsBell.jsx`), and clears when they open the modal. Shared
  unread state lives in `src/context/MentionAlertsContext.jsx`, mounted once in `Layout.jsx`. This
  is **separate from** the pre-existing free-text `clients.notes` field in the Edit Client modal —
  that one is untouched.
  - Self-mentions are intentionally suppressed (no mention row/badge if you tag yourself) —
    expected behavior, came up during testing, not a bug.
  - Added a shared "✕" close button to `src/components/Modal.jsx` (every modal in the app, not
    just Notes), alongside the existing Esc-to-close.
- **Admin roles changed** (Carolyn, via the Users page): Karen A Roberts and Kim Evans moved
  Admin → Employee. Current admins: Arielle M Kingston, Carolyn Wells, Kristina M Petuch, Scott
  Kingston.
- **8 pending staff given fresh temp passwords** (Amethyst Cannon, Arielle M Kingston, Heather L
  Krieger, Joyce Marion, Karen A Roberts, Kim Evans, Laura Dutcher, Tammy A Fisk) — temp passwords
  are **never stored anywhere** (shown once in the UI at creation/reset, then gone by design), so
  there was no way to recover the originals. Generated new ones via a throwaway script using the
  same `manage-users.js` reset-password path, wrote them to a scratchpad file to email Carolyn,
  then deleted the script. If this comes up again: either click "Reset password" per-user in the
  Users page, or re-run the same pattern (query `profiles` where `must_change_password = true`,
  call `admin.auth.admin.updateUserById`) — don't try to look up an old password, it doesn't exist.
- Sent Carolyn a plain-language admin-vs-employee explainer (email only, no file): admins see/edit
  every client, can add clients, and see Reports/Audit Log/Users; employees see every client but
  can only edit ones they're Responsible/Assistant on, can't add clients, and don't see those 3
  admin-only pages.
- *(Housekeeping: the admin **Reports page**, `src/pages/ReportsPage.jsx`, shipped earlier the same
  day in commit `e7fd6c5` but hadn't been logged here yet — noting it now.)*

## ✅ DONE 2026-08-14/15 — GitHub ownership moved to Gmail; ~56 new clients imported
- **Git/GitHub ownership migrated off parra-steel.** `github.com/JBJ-WebApps/BookTracker` is an
  org-owned repo. Added Scott's Gmail-linked GitHub login (`fsk1290`) as a full org owner; this
  repo's `.git/config` is now pinned (repo-local `user.email` + `credential.https://github.com.username`)
  so it **always** commits/pushes as the Gmail identity no matter which `gh` account is active on the
  machine. Old parra-steel account (`IronKingBids`) still has org access too — left alone on purpose,
  not removed. Global git config on this machine is untouched (still parra-steel default for other repos).
- **`keys/keys.txt` untracked from git** (was holding real SafeSend secret values in the working copy,
  tracked-but-empty in history — no leak occurred, but it was one `git add -A` away from one). Added
  `keys/` to `.gitignore`. File still exists locally with its contents, git just no longer watches it.
- **New clients imported from Carolyn's Excel exports**, additive-only (existing clients never touched):
  - 7 new clients from the regular "Bookkeeping - All Clients" sheet (`scripts/sync-new-clients.mjs`).
  - 49 new clients from `2026 BK - FPT` — the book of business from a firm Scott's wife acquired
    (`scripts/import-fpt-clients.mjs`). No account/staff/fee data yet for these; services (Sales Tax /
    Payroll) tagged where the sheet gave a clean signal, "Write Up" work noted in `notes` since there's
    no matching `service_types` row for it.
  - Both scripts are additive-only, `--dry-run` capable, and refuse to guess on ambiguous fuzzy name
    matches (a real near-miss was caught pre-write: naive prefix-matching would have mis-attributed an
    *existing* client's data to a similarly-named new one — see script comments).
  - Full duplicate scan run across all 144 clients afterward: no exact-name dupes; a handful of
    near-duplicate-looking pairs (Custom Glass / Custom Glass Creations, WR Bar / WR Bar Enterprise,
    C. Jean Starkey / ...PA, the 3 Mexico's Grill locations, The Real Estate Collection variants) were
    each confirmed with Scott as genuinely separate entities. One pre-existing pair not created by this
    session (`Fleck Holdings` / `Fleck Holdings 3`) was flagged but not touched.
- Reusable scripts live in `scripts/sync-new-clients.mjs` and `scripts/import-fpt-clients.mjs` for the
  next time Carolyn sends an updated workbook. Both need the Supabase `service_role` key pasted by hand
  (Project Settings → API) — it can't be pulled via `netlify env:get`, that value is masked there.


Pick-up notes for continuing on another machine. The memory notes in `~/.claude/`
do **not** sync across computers, so this file (which travels via OneDrive + GitHub)
is the source of truth for context.

## What this is
React + Vite + Tailwind + Supabase app, Netlify-hosted at **booktracker-jbj.netlify.app**,
for the accounting firm **Johns Benson & Johns**. Tracks monthly bookkeeping completion
per client/account. Admins see everything; employees see clients they're responsible/
assistant for. Months normalized to `period_month = YYYY-MM-01`.

## ⚙️ Repo location (moved 2026-08-13)
Codebase was moved OFF OneDrive (it kept causing sync problems) to **`C:\dev\jbj`**. The move is a
straight folder copy incl. `.git`, `.env`, and `keys/` — git works fine at the new path. NOTE: the
auto-memory in `~/.claude/projects/<hash>/…` is keyed to the OLD path and will NOT follow the move —
**this HANDOFF.md (in the repo) is the continuity doc.** At the new location just tell Claude
"read HANDOFF.md". Run `git status` (should be clean) and `npm install` if `node_modules` wasn't copied.

## ✅ SafeSend statement delivery — FULLY TESTED & GOOD (2026-08-13)
End-to-end verified: upload PDF → review modal → Send → firm-branded secure email (From "Johns Benson &
Johns CPAs, P.A. <noreply@safesendreturns.com>", Scott's email nowhere) → "FS sent" stamp → inline View.
Sender wired to admin@jbjcpas.com; the missing "&" in the body name was fixed. Ready for Carolyn to test.

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

### DONE 2026-07-05 (pushed)
- **Review-before-send ("walk"):** clicking Publish now opens a review modal (To / Subject / Message /
  Attachment + Preview PDF) and only "Send securely via SafeSend" actually sends — nothing goes out
  until confirmed. Chosen over an Outlook draft (which CAN'T carry SafeSend's secure links/branding).
- **"FS sent {timestamp}"** shown per month once delivered (from `published_at`) + badge relabeled Sent.
- **Panel wording fixed** (removed the false "Publish is simulated / nothing is sent").
- **Diagnostic trimmed** in `publish-statement.js` (no longer leaks the Supabase URL tail; clean
  "session expired" message; detail still server-logged). Email body now names Johns Benson & Johns.

### Sender-name model — DECIDED: firm-wide (Option A)
`SAFESEND_USER_EMAIL` is a SINGLE global Netlify env var (read once at `publish-statement.js:123` as the
`x-email` header). It is NOT per-client — every email sends as that one SafeSend user regardless of the
client's assigned staff. Scott chose **one firm-wide sender**: set that SafeSend user's **display name to
"Johns Benson & Johns"** so all clients see the firm, never a person. From address is SafeSend's fixed
`noreply@safesendreturns.com`; reply-to/branding/templates are SafeSend dashboard settings and will match
the firm's existing SafeSend sends (verify by inspecting a current SafeSend email's headers).
**UPDATE 2026-07-05 — send as firm mailbox, not Scott's account.** SafeSend has NO "display name" field;
the "[Name] has sent you" label is built from the user's **First + Last name** (that's why it showed
"Scott Kingston"). And the sending account's *email* can surface in Reply-To — Scott's hard rule is his
email (scott@parra-steel.com) must appear NOWHERE. So: send as the firm's existing shared mailbox
**admin@jbjcpas.com**, not Scott's personal account. Scott IS a SafeSend admin. From is always SafeSend's
fixed `noreply@safesendreturns.com`; Reply-To is a SafeSend/account setting (verify by inspecting headers).

### Storage decision (2026-07-05): KEEP the Supabase copy for now
How it works today: uploaded PDF is stored in the private Supabase `statements` bucket AND SafeSend
downloads its own copy via a 1h signed URL → **two copies**. Client viewing IS secure (SafeSend portal).
Scott chose to **keep the Supabase copy for now** because bookkeepers need to view the PDF **inline in the
tool later** (e.g., a client calls to discuss the report; the "View" button reads from Supabase).
**DEFERRED — revisit:** auto-purge the Supabase copy after a set window (e.g. 90 days) so the lasting copy
is SafeSend-only while keeping a short inline-view window. **OPEN QUESTION for SafeSend support:** can the
Exchange API RETRIEVE/download a previously-sent message's document? If YES → delete-from-Supabase-after-send
+ fetch on-demand for inline view (best of both). If NO → timed auto-purge is the fallback.

### ✅ DONE 2026-08-13 — admin@ sender wired up & tested
Switched Netlify `SAFESEND_USER_EMAIL=admin@jbjcpas.com` + redeployed. Test to Scott's inbox confirmed:
From = "Johns Benson & Johns CPAs, P.A. <noreply@safesendreturns.com>", body/signature = firm + admin@,
**scott@parra-steel.com appears NOWHERE.** No wife/mailbox step needed — admin@ was already an active
SafeSend user. Reply-to worry was moot: SafeSend sends from a no-reply address by default.
Cosmetic leftovers (optional): (a) body/signature reads "Johns Benson Johns" (no "&") — comes from the
admin@ user's First/Last name fields; add "&" there if wanted. (b) Email showed a 7-day download window
("download before …") — a SafeSend *expiration* setting (separate from our retentionPeriod); lengthen in
Exchange Settings before rollout if clients need longer.

### TODOs still open
2. **Confirm with SafeSend:** (a) same From/branding/templates for API sends vs the Outlook plug-in; (b)
   whether a sent Exchange message's document can be retrieved via API (drives the auto-purge design).
3. **Auto-purge Supabase copies after N days** (deferred — see Storage decision above).
4. **Quick UX win Scott wants:** a per-client OneDrive **folder link** field by the Upload button
   ("📂 Open FS folder"). (Browsers can't pre-aim the file picker — just a clickable folder shortcut.)

### Declined / dropped
- **Rotate SafeSend secrets:** Scott decided NOT to (2026-07-05), despite the client secret + subscription
  keys being screenshotted during setup and present in git history. Left as-is per his call.

### Phase 2 (later) — eliminate the manual upload
Goal: Carolyn saves the FS PDF to OneDrive in a standard path and BookTracker fetches it automatically.
**Blocker:** reading the firm's OneDrive needs Microsoft Graph access to their M365 tenant, which Scott
does NOT have (same wall as DNS/email — it's the wife's company). Best route that sidesteps this: a
firm-built **Power Automate** flow that POSTs new FS PDFs to a BookTracker endpoint (the flow holds the
OneDrive access, not us). Open questions for Carolyn: is the firm on M365/OneDrive, do they have Power
Automate, and what's the folder convention (e.g. `Client/FS/2026/Jan`)?
