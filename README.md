# 372 12th

A free, self hosted tracker for the 372 12th board. It shows what is
upcoming, what is overdue, who is responsible, what things cost, who the
building's vendors are, and where the city portals and account details live.
Recurring duties roll forward to their next occurrence when you mark them
done. Emails go out for the monthly summary, for responsibilities coming due,
and for whoever is on a schedule such as the trash.

Everything runs on free tiers:

* **Cloudflare Pages** hosts the site. It is static HTML, CSS and JavaScript
  with no build step, plus two small Pages Functions.
* **Cloudflare Access** puts a real login in front of the site.
* **Supabase** provides the Postgres database, plus the Edge Function and
  cron schedule behind the emails.
* **CloudMailin** delivers the emails, from `372 Board <372board@forourschool.org>`.

## What is in this repo

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The whole web app. No build step. |
| `config.js` | Supabase address and key, building name, proxy switch. |
| `logo.svg`, `favicon.svg`, `favicon.png`, `apple-touch-icon.png` | The logo and its browser tab versions. |
| `functions/api/sb/[[path]].js` | Pages Function. The site's way into Supabase once logins are on. It checks the Access login and adds the service key. |
| `functions/mute.js` | Pages Function. The "stop these reminders" page that every notice links to. |
| `mute/logo.png` | Copy of `apple-touch-icon.png` under the public `/mute` path, used as the logo in emails. |
| `functions/_access.js` | Checks the Cloudflare Access login for the proxy. |
| `supabase/config.toml` | Supabase CLI project config. |
| `supabase/migrations/*.sql` | Schema and data, applied with `supabase db push`. |
| `supabase/functions/send-reminders/index.ts` | Edge Function that sends every email. |
| `supabase/reminders-cron.sql` | One time script that schedules the hourly email run. Not a migration, because it contains the project ref and key. |
| `supabase/lockdown.sql` | One time script that closes the database to the anon key once logins are on. Not a migration, so a push cannot run it early. |

Until `config.js` is filled in the app runs in demo mode with obviously fake
sample data and nothing is saved.

## What it does

* **Dashboard.** Overdue, due in the next 30 days, coming up later,
  recently completed, and anything with no date set. Five counters
  across the top, including the expected annual cost: each repeating item
  counted as often as it comes round in a year, plus one time items that are
  overdue or due within the year.
* **Responsibilities.** A searchable list, with status, category and person
  filters behind the Filter button, sortable by any column heading. Each item
  carries a category, priority, due date, the date it was last done, an
  estimated cost, a board role, an optional vendor, an optional account or
  city portal, a repeat interval, attached links, and whether it sends
  reminder emails.
* **Statuses.** Active, Complete or Canceled. The list shows active items
  until the filter says otherwise, and overdue is shown by a red due date.
* **Ongoing duties.** Choose Ongoing under Repeats for work with no due
  date, such as cleaning. It stays active and has its own dashboard section.
* **Recurring duties.** Mark a repeating item done and it stays active. Today
  is recorded as the last time it was done and the due date moves to the
  next cycle. Intervals run from monthly through every five years.
* **Vendors.** A list of contacts with one marked primary, contract cost
  and period, notes, and attached documents. Split into vendors under
  contract and vendors that are only recommended so far.
* **Accounts.** Utility accounts and city portals with account numbers,
  usernames, passwords and links. A password stays hidden until the eye
  button next to it is pressed. Passwords only appear once logins are on
  (see Logins), because until then the database is open to anyone with the
  site address.
* **Board.** Roles, members and residents. A responsibility is assigned to a
  role such as Treasurer, and a role is held by a member, so a change of
  board only means changing who holds each role. Residents are people in the
  building who are not on the board. They cannot hold roles but can be put
  on schedules, so they get those reminders. A person's picture comes from
  Gravatar when their email has one, and is otherwise the first letter of
  their name.
* **Fixtures.** What the building uses and what to buy when something is
  replaced: paint colours with swatches, light fittings, hardware, the
  intercom, appliances. Each one can carry a picture, uploaded or linked,
  and documents.
* **Schedules.** Rotating duties such as the trash and recycling roster.
  Each row is an apartment, an optional description, the people on it, and
  one or more date ranges, such as November 1 to 30 and March 1 to 31. A row
  can repeat every year, in which case the year is ignored. Rows are dragged
  into order, and the site marks whose turn it is right now. Each schedule
  sets the weekdays and hour its reminder emails go out.
* **Notifications.** A switch and a preview for each kind of email.
* **Documents.** Every responsibility, vendor, account and fixture can hold a
  list of documents. Edit a label or address in place, drag rows to reorder
  them, or use the up and down buttons.

## The emails

A cron job calls the `send-reminders` function every hour. The function
works out the hour in New York and sends whatever is due then. Running hourly
is what keeps 7AM at 7AM through daylight saving time. Each kind has its own
switch on the Notifications tab, and all three start off.

* **Monthly summary.** 9AM on the chosen day, to 37212th@gmail.com, which
  forwards to the board. It opens with the logo and three counters, then who
  is on each schedule in the month ahead and the month after, then a table
  of everything overdue, due in the month ahead and due in the month after,
  then what is coming up in the six months after that. Sent on or before the
  20th, the detailed month is the current one. From the 21st it rolls to the
  next month. Every item links to its page on the site.
* **Due notices.** 9AM, to whoever holds the role a responsibility is
  assigned to: 7 days before the due date, on the due date, and every 7 days
  while it is overdue. Only responsibilities with **Send reminder emails**
  ticked get them, and that box starts unticked, since many items need
  nothing done. Someone with several items that day gets one email listing
  them all.
* **Schedule reminders.** On each schedule's chosen weekdays and hour, to
  everyone on the row that covers that day. The trash starts at Tuesday and
  Friday, 7AM.

Every notice and schedule reminder has a link to `/mute` on the site. For a
due notice it turns that responsibility's reminders off. For a schedule
reminder it stops that one person's reminders on that row. Either can be
turned back on from the same page, or on the site: the checkbox in the
responsibility, or the Emails box next to the person on the schedule row.
Mail apps that offer a one click unsubscribe use the same page.

**Preview** never sends, and works whatever the switches say. When nothing
of that kind goes out today, it shows the next one and says when. **Send it
now** sends the monthly summary immediately.

The summary's recipient is set by migration rather than on the site. To
change it, run `update reminder_settings set digest_email = '...' where id = 1;`.

## Accessibility

The interface is built to be easy to read and easy to hit:

* Base text is 16px and no interface text falls below 14px.
* Every text and background pairing meets WCAG AA contrast, including the
  colored status labels.
* Buttons, inputs and links are at least 44px tall, apart from the small
  Done button in the responsibilities table.
* Status is always written in words, never signalled by color alone. The
  section colors on each tab are decoration on top of labels that already
  say the same thing.
* There is a skip link, visible focus rings, labels on every field, and
  Escape closes any dialog. The password eye button says whether the
  password is shown.
* The layout honors the operating system settings for increased contrast
  and reduced motion.

## Setup

### 1. Supabase project and migrations

1. Create a project at [supabase.com](https://supabase.com). The free plan is
   fine.
2. Apply the schema from your machine:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```

3. Open Project Settings, then API Keys, and copy the Project URL and the
   anon public key. Under Legacy API keys, note where the service_role key
   is. It is needed for the Pages Functions in step 4 and must never go in
   `config.js`.

### 1b. Optional: let Supabase apply migrations on push

Under Project Settings, then Integrations, then GitHub, connect this repo and
enable "Deploy to production". Migrations merged to `main` are then applied
automatically, and the `send-reminders` function declared in
`supabase/config.toml` deploys along with them.

This works on the free plan. What is not free is preview branches, a
throwaway database per pull request, billed at $0.01344 per branch per hour.
Leave preview branches off and the integration costs nothing.

### 2. Configure the app

Edit `config.js`:

```js
window.CONDOBOARD_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "the long anon public key",
  BUILDING_NAME: "372 12th",
  USE_PROXY: false,
};
```

Open `index.html` locally. The demo banner should be gone and the building's
real records should appear.

### 3. Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. At [dash.cloudflare.com](https://dash.cloudflare.com) go to Workers and
   Pages, then Create, then Pages, then Connect to Git, and pick this repo.
3. Build settings: framework preset None, build command empty, output
   directory `/`. The `functions` folder is picked up on its own.
4. The site goes live at `https://<project>.pages.dev` and every push
   redeploys it.

### 4. Logins

Cloudflare Access puts a login in front of the site. Each person signs in
with a one time code sent to their email. On its own that is not enough,
because the Supabase address and anon key would still open the database from
anywhere. So the site talks to Supabase through `/api/sb`, a Pages Function
that checks the Access login and then uses the service key, and
`lockdown.sql` closes the database to the anon key. Do these in order, since
running the lockdown first would break the live site.

A `pages.dev` address is not a domain in the account, so the Access
application form cannot pick it. The applications are made from the Pages
project instead, which is Cloudflare's documented route.

1. In Workers and Pages, open the project, then Settings, and enable the
   access policy. Choose Manage, open the new application, and choose
   Configure. Under Public hostname, delete the `*` in Subdomain, name it
   `372 12th`, and save. Replace its policy with an Allow policy that
   includes the board's email addresses. Copy its Application Audience
   (AUD) tag.
2. Enable the access policy again. Configure the new application the same
   way, but set Path to `mute`, name it `372 12th public`, and give it a
   Bypass policy that includes Everyone. Residents have no login, so the
   mute page must stay open, and mail clients load the logo in every email
   from `/mute/logo.png` under the same path.
3. Enable the access policy a third time and leave that application as it
   is. It covers preview deployments. Note the team domain under Zero Trust,
   Settings, such as `yourteam.cloudflareaccess.com`.
4. In the Pages project, under Settings, then Variables and Secrets, add
   these for Production, as secrets:

   | Name | Value |
   | --- | --- |
   | `SUPABASE_URL` | `https://YOUR_PROJECT_REF.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | the legacy service_role key |
   | `ACCESS_TEAM_DOMAIN` | the team domain from step 3, or just the team name |
   | `ACCESS_AUD` | the AUD tag from step 1 |

5. Set `USE_PROXY: true` in `config.js` and push. Sign in, check that
   everything loads, and open an account. The password field should be
   there.
6. Run `supabase/lockdown.sql` in the Supabase SQL Editor. The anon key now
   opens nothing. The end of that file shows how to undo it.

**Sign out**, at the right of the top bar or the bottom of the menu, ends
the Access session.

If the site cannot load and the error starts "Sign in through Cloudflare
Access", the rest of the message names the check that failed. A wrong
audience means `ACCESS_AUD` is not the tag of the `372 12th` application. A
wrong issuer means `ACCESS_TEAM_DOMAIN` is not the team domain of the
account that hosts the site. Fix the value with `wrangler pages secret put`
and redeploy.

The proxy refuses any request without a valid Access login, including
requests to preview deployments, so a preview address shows no data.

### 5. Emails

1. In CloudMailin, add `forourschool.org` as an outbound sending domain and
   add the DNS records it lists wherever that domain's DNS is managed.
2. From the CloudMailin outbound account, copy the username and API key.
3. Set the function's secrets and deploy it. Skip the deploy line if the
   GitHub integration from step 1b deploys it.

   ```sh
   supabase secrets set \
     CLOUDMAILIN_USERNAME=xxx \
     CLOUDMAILIN_API_KEY=xxx \
     FROM_EMAIL="372 Board <372board@forourschool.org>" \
     APP_URL=https://37212th.pages.dev
   supabase secrets unset RESEND_API_KEY
   supabase functions deploy send-reminders
   ```

4. Run `supabase/reminders-cron.sql` in the SQL Editor. It replaces the old
   daily job with the hourly one. Running it again is harmless.
5. On the Notifications tab, press each **Preview**. When they look right,
   turn on the kinds you want and save. Then tick **Send reminder emails**
   on the responsibilities that should send them, and check the people on
   each schedule row.

Previews and **Send it now** need the service key once `lockdown.sql` has
run, so they work through the proxy and not from a copy of the site opened
locally.

Changing the function means redeploying it. Before the proxy is on, the site
calls the function directly from the browser, so a build without the CORS
headers fails with "Failed to fetch" even though the function is live.

## Changing the schema later

Never edit a migration that has already been applied. Add a new one:

```sh
supabase migration new add_meeting_notes
supabase db push
```

`supabase migration list` shows what the remote has applied. If you change a
table the app reads, update the matching field names in `app.js`.

## Security

With Access, the proxy and the lockdown in place, only people on the Access
list can read or change anything, and only the Pages Functions and the email
function hold the service key. The mute page is the one public page, and it
can only switch off the one reminder its link names.

Before that is done, the database is open to anyone who has the site
address, because the anon key is in `config.js`. That is why passwords live
in `account_secrets`, a table the anon key has never been able to read, and
why the password field only appears with the proxy on.

Keep anything genuinely sensitive, such as owner payment details, personnel
matters or legal strategy, out of the tracker either way.

## Costs and limits

Cloudflare Pages allows 500 builds a month with unlimited static requests,
and 100,000 Function requests a day. Cloudflare Access is free for up to 50
users. Supabase gives 500 MB of database, 1 GB of file storage for fixture
pictures, and 500,000 Edge Function calls a month, of which the hourly run
uses about 720. CloudMailin's free plan covers 10,000 emails a month. All
are far beyond what this building needs. Supabase pauses free projects after
about a week with no activity, and the hourly cron keeps it awake.
