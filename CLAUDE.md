# CLAUDE.md, working notes for this repo

## What this is

The 372 12th condo board's responsibility tracker. Static site with no build
step and no framework, plus Supabase for the database and the reminder
emails. Hosted on Cloudflare Pages. Everything sits on free tiers. The full
setup guide is in README.md.

## House style, set by Evan

These are not suggestions. Apply them to UI copy, seeded data, docs, and
replies in chat:

* **No emojis anywhere.** Not in the interface, not in data, not in the
  favicon. Use words or plain SVG instead.
* **No dashes inside sentences.** Em dashes and en dashes are out, and so is
  a hyphen used as punctuation. Hyphenated words such as "five-year",
  "bed-bug" and "self hosted where hyphenated" are fine. Rewrite into two
  sentences or use a comma instead.
* **Accessibility is a requirement, not a polish pass.** Large touch targets,
  strong contrast, one consistent palette. See the Accessibility section of
  README.md for the specific commitments the CSS makes, and keep them true.

## Architecture

* `index.html`, `style.css`, `app.js` are the entire frontend. Vanilla JS.
  Supabase JS v2 arrives from jsDelivr as a UMD global.
* `config.js` holds deploy time config in `window.CONDOBOARD_CONFIG`. When
  the URL or key is empty the app runs in demo mode with clearly fake sample
  data. Keep demo mode working, since it is how the app is previewed and
  tested without a database. **Never overwrite Evan's `config.js` from the
  container**, because it holds the real Supabase key. Patch it in place on
  the device instead.
* `app.js` uses a `store` abstraction with two implementations,
  `makeDemoStore` and `makeSupabaseStore`, sharing
  `load / insert / update / remove(kind, ...)` where kind is one of members,
  vendors, tasks, links, accounts. The UI holds all state in `S` and patches
  it after each successful store call. **Stores must not mutate `S`.** A demo
  store that also pushed rows caused double inserts once.
* `store` is created lazily through `getStore()` so nothing is fetched before
  the password gate is passed. Keep it that way.

## Data model

Tables: `board_members`, `vendors`, `responsibilities`, `links`, `accounts`.
A link belongs to exactly one of a responsibility, a vendor, or an account.
RLS is on with wide open policies for `anon`, which is deliberate given there
is no per person login.

`accounts` has no password column and must not get one. The database is
readable by anyone with the site address, so credentials live in the board
password manager. The same reasoning excluded the camera stream host, port
and credentials from the seeded data.

## Password gate

Client side only, by Evan's choice. A doorstop against a forwarded link, not
real security, since the password and the anon key are both in the downloaded
source. Do not describe it to him as if it secures the data.

* Unlock token is a djb2 hash of the lowercased password, kept in
  `localStorage` for "remember me" or `sessionStorage` otherwise. All storage
  access is wrapped in try/catch because private mode throws.
* Comparison is trimmed and case insensitive on purpose, since people retype
  it from a text message.
* There is no lock button. Evan asked for it to be removed.
* The real upgrade path is Cloudflare Access, free for 50 users, no app
  changes.

## Migrations

Schema lives in `supabase/migrations/`, applied with `supabase db push` or by
the dashboard GitHub integration with "Deploy to production" enabled.

* **Never edit an applied migration.** Add a new timestamped one. The project
  is linked and pushed, so assume everything already ran.
* Data migrations must be re-runnable. The existing ones use anti joins on a
  natural key, so replays never duplicate rows and never resurrect rows
  deleted in the app.
* `supabase/reminders-cron.sql` is intentionally not a migration, since it
  embeds the project ref and anon key and runs once.
* The first two migrations still contain em dashes in comments and in starter
  rows that a later migration deletes. They are applied, so they are left
  alone rather than edited.

Pricing, checked 2026-08-31: deploying from GitHub to production is free on
any plan. Preview branches are Pro only at $0.01344 per branch per hour. Do
not enable branching without flagging the cost.

## Reminder emails

`buildMessages()` in the Edge Function is a pure function on purpose, so the
email content can be tested with Deno without touching the network. Run
`deno run --allow-read --allow-net --allow-env` against a small script that
imports it. The `Deno.serve` call is guarded by `import.meta.main` so
importing the module in a test does not start a server.

Two modes, chosen by whether the `DIGEST_TO` secret is set. Digest mode sends
one grouped email to a single address, which is the only free option because
Resend's `onboarding@resend.dev` sender only delivers to the Resend account
owner's own address. Per person mode needs a verified domain, roughly $12 a
year. Evan is on digest mode to 37212th@gmail.com, which forwards to the
whole board.

## Mobile navigation

Below 860px the top bar tabs and the Add button are hidden and a hamburger
opens a left sidebar. The tabs exist twice in the markup, once in the top bar
and once in the sidebar, and `showView()` keeps both copies in sync by
`data-tab`. Escape closes a dialog first and only falls through to the
sidebar when no dialog is open. The sidebar is unhidden before the `open`
class is added on the next frame, otherwise the slide in animation does not
run.

## Conventions and gotchas

* Recurrence roll forward is client side. Completing a repeating task, either
  by the Mark done button or through the modal, inserts a fresh row with the
  next due date. `advanceDate()` clamps to month end. Keep both paths in
  sync.
* Recurrence values are none, monthly, quarterly, semiannual, annual,
  biennial, three_year, five_year. Adding one means updating the check
  constraint, `RECUR_LABEL`, `RECUR_MONTHS`, and the select in `index.html`.
* `[hidden] { display: none !important }` in style.css is what makes hiding
  work, since several classes set `display: flex`. Do not remove it.
* All user text passes through `esc()` before reaching innerHTML, and all
  outbound URLs pass through `safeUrl()`.
* Dates are `YYYY-MM-DD` strings compared lexically. Done items show their
  completion date and never overdue styling.
* Items with no due date are a real and expected state, since several seeded
  rows are waiting on Evan to confirm a date. They get their own dashboard
  bucket.

## Testing

Serve locally with `python3 -m http.server` and drive demo mode with
Playwright. Automated tests must pass the gate first.

Worth repeating after changes: the gate, add, edit and delete for all four
record types, Mark done on a recurring item (row count grows by exactly one
and the next date is right), links add and remove, filters, Escape closing a
dialog, and the mobile viewport.

Migrations can be verified without Docker. Run `initdb` on a scratch cluster,
`create role anon; create role authenticated;`, then psql the migration files
in order and re-run them to confirm they are idempotent. Verified this way on
Postgres 16 on 2026-08-31.

## Keep documentation current

After code changes, update README.md and this file, and prune notes that no
longer apply.
