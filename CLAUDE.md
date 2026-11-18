# CLAUDE.md, working notes for this repo

## What this is

The 372 12th condo board's responsibility tracker. Static site with no build
step and no framework, two Cloudflare Pages Functions, Supabase for the
database and the email function, and CloudMailin to deliver mail. Hosted on
Cloudflare Pages behind Cloudflare Access. Everything sits on free tiers. The
full setup guide is in README.md.

## House style, set by Evan

These are not suggestions. Apply them to UI copy, seeded data, docs, emails,
and replies in chat:

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
* `USE_PROXY` in `config.js` sends every Supabase request through
  `functions/api/sb/[[path]].js` instead of to supabase.co. `apiBase()` in
  `app.js` picks the address, for the store, the email function and the
  storage URL. `upload()` rewrites the returned picture address back to the
  real Supabase address, so saved addresses do not depend on the proxy.
* `app.js` uses a `store` abstraction with two implementations,
  `makeDemoStore` and `makeSupabaseStore`, sharing
  `load / insert / update / upsert / remove(kind, ...)` and
  `upload(bucket, file)` where kind is a key of `TABLE`, such as members,
  roles, vendors, tasks, links, accounts, secrets. The UI holds all state in
  `S` and patches it after each successful store call. **Stores must not
  mutate `S`.** A demo store that also pushed rows caused double inserts
  once.
* `store` is created lazily through `getStore()` so nothing is fetched before
  the password gate is passed. Keep it that way.

## Logins, the proxy and the lockdown

Cloudflare Access is the real login. It alone does not protect the data,
because the Supabase address and anon key would still work from anywhere.
So:

* `functions/api/sb/[[path]].js` checks the Access token through
  `accessUser()` in `functions/_access.js`, which verifies the RS256
  signature against the team's certs, the audience, the issuer and the
  expiry. It then forwards to Supabase with the service key, dropping the
  browser's own `apikey`, `Authorization`, cookies and `cf-` headers. Only
  `/rest/v1/`, `/storage/v1/` and `/functions/v1/send-reminders` pass, and
  any `..` or encoded slash is refused. It refuses everything when its
  environment variables are missing. Never let it fall open.
* `supabase/lockdown.sql` drops every "open access" policy in public and the
  anon storage policies. It is deliberately not a migration: a push applies
  migrations to production at once, and the site breaks if this runs before
  the proxy is in use. README.md, "Logins", has the order.
* New tables still get an "open access" policy in their migration, like the
  rest, so the site keeps working before the lockdown. The lockdown removes
  them. The two exceptions below never get one.
* The password gate is still there, client side, a djb2 hash of the
  lowercased password in `localStorage` or `sessionStorage`, trimmed and case
  insensitive. Once Access is on it is a second login and can be turned off
  by setting `SITE_PASSWORD` to "". There is no lock button, by Evan's
  request. Never describe the gate as securing the data.

## Data model

Tables: `board_members`, `board_roles`, `vendors`, `vendor_contacts`,
`responsibilities`, `links`, `accounts`, `account_secrets`,
`reminder_settings`, `notifications_sent`, `schedules`, `schedule_slots`,
`schedule_slot_ranges`, `schedule_slot_people`, `fixtures`. A link belongs
to exactly one of a responsibility, a vendor, an account, or a fixture, and
carries a `sort_order` so the board can arrange documents by hand. Adding a
new owner type means a column on `links`, a branch in `linksFor()`, and the
new key in the row built by `saveLinks()`.

`board_members` holds everyone. `on_board` false makes a person a resident:
shown in the Residents group on the Board tab, offered on schedule rows, but
never in the role holder select or the Responsibilities person filter.
`boardMembers()` and `onBoard()` are the filters. Turning someone into a
resident vacates their roles.

A responsibility points at a role through `role_id`, and a role points at
whoever holds it through `board_roles.member_id`. Nothing assigns a
responsibility to a person directly, which is the point: when the board
changes, only the role holder is edited. `responsibilities.assignee_id` and
`board_members.position` are dead columns kept for compatibility. Do not
read or write them. `rolesOf()`, `tasksOfMember()` and `memberOfTask()`
resolve a person to their responsibilities, and the email function joins
`role:board_roles(name,member:board_members(id,name,email))`.

`responsibilities.send_reminders` turns due notices on for one item, and is
off by default because many items need nothing done. It is disabled in the
dialog for ongoing items. `mute_token` is the secret in the notice's mute
link.

A vendor's people live in `vendor_contacts`: name, an optional label such
as Billing, email, optional phone, `is_primary` and `position`.
`vendors.contact_name`, `vendors.email` and `vendors.phone` are dead columns
kept for compatibility. `contactEditor` in the vendor modal keeps exactly
one primary while any contact exists, drops rows with no name, and
`saveContacts()` writes them. Only the name is enforced. `contactsFor()`
lists the primary first. The email shows a vendor's primary contact through
`primaryContact()`, falling back to the old columns.

A responsibility can also point at the account or city portal it is done
through, with `responsibilities.account_id`, chosen in its dialog next to
Status. On the Responsibilities table, `refLinks()` names the vendor and
account under the title as `#vendor/<id>` and `#account/<id>` links, which
`route()` turns into that record's dialog. Deleting an account clears it.

**Passwords live in `account_secrets`, never in `accounts`.** It has row
level security on, no policy and no grants for anon or authenticated, from
the migration that created it, so the anon key could never read it even
before the lockdown. Never add a policy for anon there. The site only
reaches it through the proxy, so `secretsAvailable` (demo mode or
`USE_PROXY`) decides whether the password field shows at all. The field is
`type=password` until the eye button is pressed, and resets to hidden each
time the dialog opens. `saveSecret()` upserts only when the value changed.
The camera stream host, port and credentials are still kept out of seeded
data.

`notifications_sent` is read and written only by the email function, so it
also has no policy.

## Migrations

Schema lives in `supabase/migrations/`, applied with `supabase db push` or by
the dashboard GitHub integration with "Deploy to production" enabled.

* **Never edit an applied migration.** Add a new timestamped one. The project
  is linked and pushed, so assume everything already ran.
* Data migrations must be re-runnable. The existing ones use anti joins on a
  natural key, or only touch rows that have nothing yet, so replays never
  duplicate rows and never resurrect rows deleted in the app.
* `supabase/reminders-cron.sql` and `supabase/lockdown.sql` are
  intentionally not migrations. The cron file embeds the project ref and
  anon key, and the lockdown must wait for the proxy.
* The first two migrations still contain em dashes in comments and in starter
  rows that a later migration deletes. They are applied, so they are left
  alone rather than edited.

Pricing, checked 2026-08-31: deploying from GitHub to production is free on
any plan. Preview branches are Pro only at $0.01344 per branch per hour. Do
not enable branching without flagging the cost.

## The emails

One Edge Function, `supabase/functions/send-reminders/index.ts`, sends all
of them through CloudMailin's API,
`https://api.cloudmailin.com/api/v0.1/<username>/messages` with the API key
as a Bearer token. The sender defaults to
`372 Board <372board@forourschool.org>`. Secrets: `CLOUDMAILIN_USERNAME`,
`CLOUDMAILIN_API_KEY`, `FROM_EMAIL`, `APP_URL`. Resend is gone.

The cron in `reminders-cron.sql` runs hourly. `localParts()` turns the
moment into the New York date, hour and weekday, and the builders receive
that date at midnight UTC, so their UTC getters read the New York date.
That is what keeps 7AM at 7AM through daylight saving time. Do not go back
to a daily cron at a fixed UTC hour.

* **Monthly summary.** At `SUMMARY_HOUR` (9) on `send_day_of_month` when
  `reminders_enabled`. `last_sent_at`, compared on the New York date, stops
  a second send.
* **Due notices.** At `NOTICE_HOUR` (9) when `due_notices_enabled`.
  `noticeKind()` gives 7 days before, the due date, and every 7 days after.
  `buildDueNotices()` groups by the holder's email, so one email can list
  several items, each with its own mute link.
* **Schedule reminders.** When `schedule_reminders_enabled`, for every
  schedule whose `remind_days` include today's weekday and whose
  `remind_hour` is this hour. `scheduleItems()` finds the people on rows
  covering today, leaving out muted people and people with no email.
  `buildScheduleReminder()` sends one email per person.

Notices and schedule reminders are recorded in `notifications_sent` keyed by
kind, row id, recipient and date, and checked before sending, so a retried
or repeated hour never sends twice.

Mute links go to `APP_URL/mute?t=<token>`. `functions/mute.js` looks the
token up in `responsibilities.mute_token` and then
`schedule_slot_people.mute_token`, shows the current state and one button,
and flips `send_reminders` or `muted`. A GET never changes anything, because
mail scanners open links. A POST with `List-Unsubscribe=One-Click` mutes
directly, and single item emails carry `List-Unsubscribe` headers for it.
`/mute` is the one path behind an Access Bypass application, since residents
have no login. The email logo is `/mute/logo.png`, a copy of
`apple-touch-icon.png`, so that one bypass covers it too: Access applies a
path's rule to the paths under it. `pages.dev` is not a zone in the
account, so Access applications for it are made from the Pages project's
Enable access policy, then edited to drop the `*` subdomain. README.md,
"Logins", has the steps.

`?dry=1&kind=summary|due|schedule` returns the built email, HTML included,
and never sends or records. When nothing of that kind goes out today it
builds the next one, through `nextNoticeDate()` or `nextScheduleDay()`, and
says so in `note`. `?force=1` sends the summary now. Both need the service
key once the lockdown has run: `mayPreview()` accepts the service key or a
service role JWT, and otherwise only allows them while the anon key can
still read `reminder_settings`. The proxy supplies the service key. **A
preview must never be gated by the send checks.** The switches, the hour and
the already sent guards decide whether to SEND, and `dry` skips them all.

The summary's structure: a header with the logo, the name and three
counters, then a Schedules table naming the rows that touch the month ahead
and the month after, through `slotsInMonth()`, as apartment and people with
the period under it, then one table listing everything overdue, due in the
month ahead and due in the month after, then "Coming up later", the
`LATER_MONTHS` (six) months after that. There are no detail cards, Evan
found them a repeat of the table. Empty sections are left out, and there is
no footer, by Evan's choice. On or before the 20th the detailed month is the
current one, from the 21st it rolls to the next, through `coveredMonths()`.
If that rule changes, change README.md too.

Everything in an email that names something on the site links to it,
through `a(path, inner)` and `href(path)`, which build `APP_URL/#path`:
the logo to the home page, counters to `#dashboard` or `#tasks`, each
responsibility to `#task/<id>`, each person to `#member/<id>`, each schedule
to `#schedule/<id>`. `setSite()` sets the address at the top of each
builder.

The look copies the site: the same red, amber, blue and green, pills, cards
with a coloured left edge. `TONE` holds the colours. Layout is tables with
inline styles because mail clients ignore stylesheets. `toPlain()` builds the
plain text part, keeping only mute link addresses.

`days_ahead`, `cooldown_days` and the per person `delivery_mode` of the
summary are leftovers. The summary goes to `digest_email`, set by migration.
Due notices are the per person email now.

The Notifications tab has one block per kind: the summary's Monthly or Never
radio, day and recipient line with Preview and Send it now, then On or Off
with a Preview for due notices and for schedule reminders, and one Save.
Evan asked for the recipient control to come back later.

The builders are pure on purpose. There is no Deno in the container. To
test, copy `index.ts` without the `npm:` import line and import it from a
script run with `node --experimental-strip-types`.

## Mobile navigation

Below 1160px the top bar tabs are hidden and a hamburger opens a left
sidebar. The top bar holds only the logo, the name and the tabs. Add
responsibility lives on the Responsibilities toolbar, by Evan's choice. The
breakpoint is set by how many tabs there are, not by a device size. Eight
tabs and the logo stop fitting at about 1160px, so adding another tab means
testing widths again and probably raising it. `.tabs` is `nowrap` so a too
small breakpoint shows as horizontal overflow rather than a second row. The
tabs exist twice in the markup, once in the top bar and once in the sidebar,
and `showView()` keeps both copies in sync by `data-tab`. `showView()` also
writes the tab to the address as `#name`, and `route()` reads it on load and
on `hashchange`: `#tasks` opens a tab, and `#task/<id>` (also vendor,
account, member, role, fixture, schedule) opens the tab with that record's
dialog on top. `ROUTES` maps each kind. The emails' links depend on this, so
keep the names stable. The logo and name in both places are a `.brand-home`
link back to the dashboard. Escape closes a dialog first and only falls
through to the sidebar when no dialog is open. The sidebar is unhidden
before the `open` class is added on the next frame, otherwise the slide in
animation does not run.

## Responsibilities toolbar and Board tab

The toolbar row is search, the Filter button, then Add responsibility pushed
to the right. The three filter selects sit in `#filter-panel`, hidden until
Filter is pressed. Hiding the panel does not clear the filters, so the
button reads "Filter (2)" while any are set.

Statuses are Active, Complete and Canceled. They are stored as `open`,
`done` and `canceled`, with the old words kept in the database so a site or
function from before the change still reads them correctly. Use
`isActive()` and `STATUS_LABEL`, and never show the stored word. There is no
in progress status and no overdue status. Overdue is only ever the red due
date. A repeating item is always active, since completing it rolls it
forward, though it can be canceled.

The status filter defaults to Active, so the table opens on active items
only, and only another choice counts toward "Filter (2)". The status badge
shows only under All statuses. In the Active view the last column holds just
the done button under a visually hidden heading, and in the Complete and
Canceled views that column is hidden through `data-view` on the table. The
dashboard, the role and member counts and the emails all count active items
only.

The table is kept sparse on purpose. Columns are responsibility, assigned
to, due, last done, cost and status. There is no category column, though
the category filter remains. Assigned to is the holder's first name only,
with no role, surname or picture. Dates go through `shortDate()`: the day in
the current year, otherwise just the year. An overdue date is red and bold,
with a visually hidden "Overdue" in front and the full wording in `title`.
The done button sits under the status badge, a green outlined check with
the word Done and the accessible name "Mark done". Evan asked for a check
mark there. It is an inline SVG, in keeping with the no emoji rule. Evan
also asked for it to be small, so at 30px tall it is the one control below
the 44px target. Do not grow it back.

Headings sort the table. `taskSort` holds the key and direction, `SORT_VALUE`
maps a key to a row value, empty values always sort last, and `aria-sort` on
the `th` drives the arrow. With no key the default order applies: open items
by due date, then done ones.

Cards are kept short, by Evan's choice, with the rest in the dialog a card
opens. A vendor card is company, service, website and the primary contact's
email. An account card is name, category and website, never the password. A
fixture card is the swatch, name, brand and number. Do not add lines back.
Since document chips are no longer on cards, each saved row in the document
editor has an Open link.

The Board tab has a Roles grid, a Members grid and, when there are any, a
Residents grid. Add resident and Add member open the same dialog with the
"On the board" box unticked or ticked, and the title follows the box. A role
card is the role and its holder, and opens the role modal. A person tile is
the picture, name, apartment, email and phone, with no role and no count.
It is a `div`, not a button, because the email and phone are links: the
name is a button whose hit area is stretched over the whole tile and opens
the person, and the links sit above it. The Responsibilities person filter
goes by member through `memberOfTask()`, not by role, and Unassigned covers
vacant roles too.

## Colour

Every tab uses the dashboard's palette. A `tone-amber`, `tone-blue`,
`tone-purple`, `tone-green` or `tone-slate` class sets `--tone`,
`--tone-soft` and `--tone-line`, and `.group-heading`, `.info-card`,
`.schedule-card` and `.settings-block` inside it pick them up for the label,
the left edge and the subtitle. There is no red tone, because red means
overdue. Vendors are green when contracted and blue when recommended, roles
purple, members blue, residents slate. On the Notifications tab the summary
is blue, due notices amber and schedule reminders green. Accounts and
fixtures take a tone from their category through `ACCOUNT_TONE` and
`FIXTURE_TONE`, falling back to blue. Category badges on responsibilities
stay neutral so they do not compete with the status colours. New tones must
meet AA on white and on their own tint.

## People's pictures

`avatar(m)` draws a person's Gravatar over the first letter of their first
name. The hash is a SHA-256 of the trimmed, lowercased email, worked out by
`hashEmails()` before the first render and after a person is saved, since
hashing is async and rendering is not. The request uses `d=404`, and a
capture phase `error` listener removes the image and remembers the hash in
`noGravatar`, so the letter shows and the request is not repeated. This
sends a hash of each person's email to gravatar.com. A vacant role shows
the first letter of the role, and an unassigned item shows NA.

## Logo

`logo.svg` is the monster face from the building's Halloween balcony
display. `favicon.svg` is a simpler cut that survives 16px. `favicon.png`
and `apple-touch-icon.png` are renders of those two, so regenerate them if
the SVGs change. `mute/logo.png` is a copy of `apple-touch-icon.png` for the
emails, so copy it again when that changes.

## Fixtures

The building's specification: paint colours, fittings, hardware, appliances.
Cards are grouped by category, and `color_hex` draws a swatch when present.

A fixture can carry one picture, shown on its card. It is either uploaded or
linked, and both end up as an address in `fixtures.image_url`. An upload is
shrunk in the browser to 1200px by `shrinkImage()` and put in the public
Storage bucket `fixture-images` through `store.upload()`, which the demo
store answers with a page only blob address. The bucket is public, images
only, 5 MB a file. Before the lockdown anon may add to it, afterwards only
the proxy can. Replacing or removing a picture leaves the old file in the
bucket. Nothing deletes it, which is fine at this size.

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

A schedule row is an apartment, an optional description, one or more date
ranges in `schedule_slot_ranges`, a "Repeats every year" box
(`repeats_yearly`), and the people on it in `schedule_slot_people`, each
with an Emails box that is the inverse of `muted`. The schedule itself has
`remind_days`, weekdays 0 for Sunday to 6, and `remind_hour`, New York
time, edited as day chips and a Time select in its dialog. The trash
started at Tuesday and Friday, 7AM.

`slotEditor` keeps the rows as drafts with their ranges and people and the
ids removed from each, and the schedule form saves slots, then ranges, then
people. Rows reorder by dragging only, with no up and down buttons, and are
removed with the x on the right, by Evan's choice. Events are delegated on
`#cf-slots`, and focus is put back after each re-render. Saving is refused
when a range has only one date, or when a range that does not repeat ends
before it starts. A yearly range may end before it starts, which means it
wraps past December.

`rangeCovers()`, `rangeLabel()` and `isCurrentSlot()` in `app.js` match
`rangeCovers()`, `rangeLabel()` and `coveringRange()` in the email function.
Keep them in step. A yearly range ignores the year, wraps when the end is
before the start, covers every day when it spans a year, and covers
February 29 when it ends on the 28th. Labels name whole months
("November", "January/February") and otherwise days ("March 3 to 20"), with
the year only when the row does not repeat. The label is also saved to
`schedule_slots.label`. The migration turned the old month pairs into 2024
ranges, a leap year, and put each board member on the row for their
apartment. `month_start` and `month_end` are dead columns now.

The apartment is stored as a bare number, since "Apt" is implied, and
`apartment()` strips the prefix from any older value. The emails write
"Apt 5" through `aptLabel()`.

## Conventions and gotchas

* Recurrence roll forward is client side and in place. Completing a
  repeating task, by the Mark done button or through the modal, never leaves
  it done and never inserts a row. `rollForward()` keeps it active,
  records today in `last_completed_on`, and moves `due_date` with
  `nextDue()`, which steps from the old due date past any missed cycles, or
  from today when there was no date. Both paths call `rollForward()`.
* The dashboard's Expected annual cost counter annualizes repeating items
  (cost times 12 over the cycle in months) and adds one time items that are
  overdue or due within a year. Ongoing items and undated one time items
  are left out, since nothing says how often they cost.
* The dashboard's Recently completed list also shows open repeating items
  by `last_completed_on`.
* Recurrence values are none, ongoing, monthly, quarterly, semiannual,
  annual, biennial, three_year, four_year, five_year. Ongoing is not a
  cycle: `isOngoing()` items have no due date, show "Ongoing" in the Due
  column, have no done button and no reminders, get their own dashboard
  section, and end only by being set to Complete or Canceled.
  `isRecurring()` is false for them. Adding a value means updating the
  check constraint, `RECUR_LABEL`, `RECUR_MONTHS`, and the select in
  `index.html`.
* The tab that edits `reminder_settings` is labeled Notifications, with
  `data-tab="notifications"` and `#notifications`. Its functions keep the
  old Settings names, such as `renderSettings()`.
* `[hidden] { display: none !important }` in style.css is what makes hiding
  work, since several classes set `display: flex`. Do not remove it.
* Fieldsets default to `min-width: min-content`, which pushed the schedule
  rows off screen on phones. `.links-fieldset` sets `min-width: 0`.
* All user text passes through `esc()` before reaching innerHTML, and all
  outbound URLs pass through `safeUrl()`.
* Dates are `YYYY-MM-DD` strings compared lexically, built in local time by
  `ymd()`. Do not use `toISOString()` for a date, since it is UTC and rolls
  to tomorrow in the evening in New York. Done items show their
  completion date and never overdue styling.
* Items with no due date are a real and expected state, since several seeded
  rows are waiting on Evan to confirm a date. They get their own dashboard
  bucket, separate from ongoing items.

## Testing

Serve locally with `python3 -m http.server` and drive demo mode with
Playwright. Automated tests must pass the gate first. In demo mode a reload
resets the data, so move between tabs by clicking them.

Worth repeating after changes: the gate, add, edit and delete for every
record type including roles and residents, Mark done on a recurring item
(row count unchanged, still active, and the next date is right), each status
filter view including which of the badge and done button show, reassigning
a role and checking the member's list follows, moving a member to resident
vacating their roles, the reminder box on a responsibility, the password
field and its eye button, links add and remove, the Filter button and its
filters, sorting by each heading in both directions, Escape closing a
dialog, the Notifications tab, document reorder and rename round trips,
schedule editing including ranges, people, the Emails box, the day chips,
the validation messages, drag reorder and the x, and the mobile viewport.

The container blocks jsDelivr, so `window.supabase` is undefined here. To
test proxy mode, install `@supabase/supabase-js@2` with npm, serve its
`dist/umd/supabase.js` for the jsDelivr URL with `page.route`, stub
`config.js` with `USE_PROXY: true`, and stub `**/api/sb/**`. Every request
should go to `/api/sb/`, none to supabase.co.

The Pages Functions run under Node 22 with a `package.json` of
`{"type":"module"}` next to a copy, a stubbed global `fetch`, and RSA keys
made with `crypto.subtle` to sign test Access tokens. Check a good token, a
wrong audience, issuer, key and signature, an expired one, path escapes, the
missing configuration case, and the mute page's GET, POST and one click.

Playwright note: `.info-card` matches cards in hidden views too, so scope
selectors to the visible section, for example `#view-accounts .info-card`.
Clicking a card's centre can land on a link chip, which opens the link
instead of the modal, so click the heading.

Migrations can be verified without Docker. Run `initdb` on a scratch cluster,
`create role anon; create role authenticated; create role service_role;`,
then psql the migration files in order and re-run them to confirm they are
idempotent, then run `lockdown.sql` twice and check no public policy is
left. Last verified this way on Postgres 16 on 2026-11-17.

## Keep documentation current

After code changes, update README.md and this file, and prune notes that no
longer apply.
