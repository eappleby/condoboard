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
* **Do not be wordy.** This is a standing rule for the interface. Include a
  sentence only when the information is not obvious from the screen and not
  readily attainable. No section descriptions restating the tab name, no
  hints explaining a visible control, no notes justifying a design choice.
  Evan removed a batch of these on 2026-08-31. Do not reintroduce them, and
  do not add new ones when building a feature.
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

Tables: `board_members`, `vendors`, `responsibilities`, `links`, `accounts`,
`reminder_settings`, `schedules`, `schedule_slots`, `fixtures`. A link belongs
to exactly one of a responsibility, a vendor, an account, or a fixture, and
carries a `sort_order` so the board can arrange documents by hand. Adding a
new owner type means a column on `links`, a branch in `linksFor()`, and the
new key in the row built by `saveLinks()`.
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

## The monthly summary email

`buildDigest()` and `buildMessages()` are pure on purpose, so the email
content can be tested with Deno without touching the network. Run
`deno run --allow-read --allow-net --allow-env` against a script that imports
them. The `Deno.serve` call is guarded by `import.meta.main`, so importing
the module in a test does not start a server.

Structure: overdue in full, the month ahead in full, the month after as a
slim list. `coveredMonths()` decides which months those are. On or before
the 20th the detailed month is the current one, from the 21st it rolls to the
next. It handles the year boundary. If that rule changes, change the wording
on the Settings tab and in README.md too, since both explain it.

`days_ahead` and `cooldown_days` are dead columns. The email is month based
now, and a monthly summary should repeat an open item rather than suppress
it. The columns stay for compatibility but nothing reads them, and the
Settings tab no longer offers them.

Behaviour is driven by the `reminder_settings` row, edited on the Settings
tab. The function does nothing while `reminders_enabled` is false, which is
the default, so the cron job is safe to schedule early. The cron fires daily
and `isSendDay()` turns that into weekly or monthly. Monthly is the default.

`?dry=1` returns the built email including its HTML, without sending or
recording. The site renders that HTML in a sandboxed iframe via `srcdoc`, so
the preview is the real email rather than a summary of it. `?force=1` ignores
both the schedule and the enabled flag, behind a confirm dialog that names
the recipient. CORS headers are required because the site calls
the function directly from the browser.

Only the Resend key and sender stay as secrets, since the settings table is
readable by anyone who can reach the site. Digest mode sends one grouped
email and is the only free option, because Resend's `onboarding@resend.dev`
sender only delivers to the Resend account owner's own address. Per person
mode needs a verified domain, roughly $12 a year. Evan is on digest mode to
37212th@gmail.com, which forwards to the whole board.

The Settings tab is deliberately tiny: a Monthly or Never radio, the day of
the month when Monthly is chosen, one line naming the recipient, and three
buttons. Monthly maps to `reminders_enabled = true`, Never to false.
`delivery_mode` and `digest_email` are no longer editable on the site and are
set by migration. Evan asked for the recipient control to come back later.

**A preview must never be gated by the send checks.** The enabled flag, the
send day and the already-sent-today guard decide whether to SEND, so `dry`
skips all three. Getting this wrong on 2026-08-31 made Preview useless
exactly when it was needed, before turning delivery on, and the symptom
looked like a stale deployment. /tmp/test-gating.ts in that session pins the
rule.

A browser fetch to the function that fails outright is almost always CORS,
which in practice means the deployed build predates the CORS headers. That
happened on 2026-08-31 and the error text now says exactly that. When
changing the function, remember it must be redeployed before the site can
use the new behaviour.

## Mobile navigation

Below 1160px the top bar tabs and the Add button are hidden and a hamburger
opens a left sidebar. The breakpoint is set by how many tabs there are, not
by a device size. Eight tabs stop fitting at about 1160px, so adding another
tab means testing widths again and probably raising it. `.tabs` is
`nowrap` so a too-small breakpoint shows as horizontal overflow rather than a
second row. The tabs exist twice in the markup, once in the top bar
and once in the sidebar, and `showView()` keeps both copies in sync by
`data-tab`. Escape closes a dialog first and only falls through to the
sidebar when no dialog is open. The sidebar is unhidden before the `open`
class is added on the next frame, otherwise the slide in animation does not
run.

## Fixtures

The building's specification: paint colours, fittings, hardware, appliances.
Cards are grouped by category, and `color_hex` draws a swatch when present.

Paint swatches were read from Benjamin Moore's own colour pages, from the
`meta-bmc_color_hex` value, not guessed. Where the page did not confirm the
colour, PM-2 in this case, the swatch is left empty on purpose. A wrong
swatch is worse than none, so do not fill one in by eye. Benjamin Moore has
renamed 2063-10 from "Old Navy" to "Winding Waterway"; the number is what
identifies the paint.

## Documents and schedules

`makeLinkEditor()` builds the document rows used by the responsibility,
vendor and account modals. Rows are edited in place, reordered by dragging
the handle or with the up and down buttons, and saved by index into
`sort_order`. The buttons are not decoration: dragging is unusable with a
keyboard or a screen reader, so both paths must keep working. There is no
document type dropdown any more, and new rows are saved with kind
`document`. Rows with an empty address are dropped on save.

The schedule slot editor in the Schedules tab repeats the same pattern.
Slots carry optional `month_start` and `month_end`, and `isCurrentSlot()`
marks whoever is up this month. It handles ranges that wrap past December.

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

Worth repeating after changes: the gate, add, edit and delete for every
record type, Mark done on a recurring item (row count grows by exactly one
and the next date is right), links add and remove, filters, Escape closing a
dialog, the settings form including the live summary and the guard on an empty
digest address, document reorder and rename round trips, schedule editing,
and the mobile viewport.

The container blocks jsDelivr, so `window.supabase` is undefined here and any
test that leaves demo mode must stub the network with `page.route`. See
/tmp/test-preview.js in the session that built this for the pattern: stub
config.js, `**/rest/v1/**`, and `**/functions/v1/send-reminders**`.

Playwright note: `.info-card` matches cards in hidden views too, so scope
selectors to the visible section, for example `#view-accounts .info-card`.
Clicking a card's centre can land on a link chip, which opens the link
instead of the modal, so click the heading.

Migrations can be verified without Docker. Run `initdb` on a scratch cluster,
`create role anon; create role authenticated;`, then psql the migration files
in order and re-run them to confirm they are idempotent. Verified this way on
Postgres 16 on 2026-08-31.

## Keep documentation current

After code changes, update README.md and this file, and prune notes that no
longer apply.
