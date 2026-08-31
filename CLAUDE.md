# CLAUDE.md — working notes for this repo

## What this is

A condo-board responsibility tracker. Static site (no build step, no
framework) + Supabase (Postgres, Edge Function for reminder emails).
Hosted on Cloudflare Pages, everything on free tiers. Full setup guide is in
README.md.

## Architecture

- `index.html` + `style.css` + `app.js` — the entire frontend. Vanilla JS,
  Supabase JS v2 loaded from jsDelivr as a UMD global (`window.supabase`).
- `config.js` — deploy-time config (`window.CONDOBOARD_CONFIG`). When
  `SUPABASE_URL`/`SUPABASE_ANON_KEY` are empty the app runs in **demo mode**:
  in-memory sample data, banner shown, nothing persisted. Keep demo mode
  working — it's how the app is previewed and tested without a database.
  `SITE_PASSWORD` (currently `essex`) drives the password gate; `""` disables it.
- `app.js` structure: a `store` abstraction with two implementations
  (`makeDemoStore`, `makeSupabaseStore`) sharing the interface
  `load / insert / update / remove(kind, …)`, where kind ∈ members, vendors,
  tasks, links (mapped to table names in `TABLE`). The UI keeps all state in
  `S` and patches it after each successful store call — **stores must not
  mutate `S` themselves** (a demo store that also pushed rows caused
  double-inserts once; don't reintroduce that).
- `supabase/migrations/` — the schema, managed with the Supabase CLI (Evan
  uses this workflow in his other projects). Tables: `board_members`,
  `vendors`, `responsibilities`, `links` (a link belongs to either a
  responsibility or a vendor). RLS is enabled with wide-open policies for
  `anon` — deliberate: no per-person login, just the shared password.
- `supabase/functions/send-reminders/index.ts` — Deno Edge Function; emails
  via Resend; uses `last_reminded_at` for a 3-day cooldown; 7-day lookahead.
- `supabase/reminders-cron.sql` — pg_cron + pg_net daily schedule (has
  placeholders the user must fill in).

## Password gate

Client-side only, by Evan's choice: a doorstop against a forwarded link, not
real security (password and anon key are both in the downloaded source, and
RLS is open). Don't describe it to him as if it secures the data.

- `boot()` decides gate vs. `start()`. `store` is built lazily via
  `getStore()` so **no Supabase client is created and no data is fetched
  before unlock** — keep it that way if you add startup work.
- Unlock token is a djb2 hash of the lowercased password in
  `localStorage` ("remember me") or `sessionStorage`. All storage access goes
  through try/catch — private mode throws.
- Comparison is trimmed and case-insensitive, deliberately (people retype it
  from a text message).
- The 🔒 button re-gates **in place** — it clears `S`, re-renders, and shows
  the gate. It used to `location.reload()`, which didn't reliably re-gate in
  testing; don't reintroduce that.
- Upgrade path if he wants real protection: Cloudflare Access (free ≤50
  users, one Zero Trust app in front of the Pages site) — bigger win than
  Supabase Auth and no app changes needed.

## Migrations

Schema lives in `supabase/migrations/`, applied with `supabase db push`
(and/or the dashboard's GitHub integration with "Deploy to production" on,
which also deploys functions declared in `config.toml`).

- **Never edit an applied migration** — add a new timestamped one
  (`supabase migration new <name>`).
- The starter-data migration is guarded by `if exists (select 1 from
  responsibilities) then return; end if;` so replays and `db reset` don't
  duplicate rows or resurrect ones Evan deleted. Keep any future data
  migration equally re-runnable.
- `supabase/reminders-cron.sql` is intentionally **not** a migration: it
  embeds the project ref and anon key, and runs once.
- Verified 2026-08-31 against real Postgres 16: applies in order, replays
  cleanly, policies land on `anon`+`authenticated`, FK `on delete set null` /
  `cascade` behave. Worth repeating after schema edits — no Docker needed,
  just `initdb` a scratch cluster, `create role anon; create role
  authenticated;`, then psql the migration files in order.

Pricing note (checked 2026-08-31): deploying from GitHub to production is
free on any plan; **preview branches** are Pro-only at $0.01344/branch/hour.
Don't enable branching without flagging the cost.

## Conventions & gotchas

- Recurrence roll-forward is **client-side**: completing a recurring task
  (quick ✓ or via the modal) inserts a fresh row with the next due date.
  `advanceDate()` clamps to month-end. If you touch completion logic, keep
  both paths (quick-done and modal-save) in sync.
- `[hidden] { display:none !important }` in style.css is what makes modal
  hiding work (their classes set `display:flex`). Don't remove it.
- All user text goes through `esc()` before being placed in innerHTML.
- Dates are `YYYY-MM-DD` strings compared lexically; "done" items render
  their completion date, never overdue styling.
- No package.json, no build, no framework — keep it that way unless Evan
  asks; the whole point is zero-maintenance free hosting.

## Testing

Serve locally (`python3 -m http.server`) and exercise demo mode in a browser
or with Playwright. Checks worth repeating after changes: the gate (wrong
password rejected, right one accepted, remembered across reload, new browser
context still gated, 🔒 re-gates), then add/edit/delete a responsibility,
quick-✓ a recurring one (row count grows by exactly 1, next occurrence dated
correctly), links add/remove in both modals, filters, vendor + member CRUD,
mobile viewport.

Automated tests must unlock the gate first before touching the app.

## Keep documentation current

After code changes, update README.md and this file, and prune stale notes.
