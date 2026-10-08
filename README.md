# 372 12th

A free, self hosted tracker for the 372 12th board. It shows what is
upcoming, what is overdue, who is responsible, what things cost, who the
building's vendors are, and where the city portals and account numbers live.
Recurring duties roll forward to their next occurrence when you mark them
done, and a monthly email summarises where things stand.

Everything runs on free tiers:

* **Cloudflare Pages** hosts the site. It is static HTML, CSS and JavaScript
  with no build step.
* **Supabase** provides the Postgres database, plus the Edge Function and
  cron schedule behind the reminder emails.
* **Resend** delivers the reminder emails.

There are no individual accounts. The site is protected by one shared
password that the whole board uses. It is `essex` by default and you can
change it in `config.js`. Please read the Security section below, because
that password does less than it appears to.

## What is in this repo

| File | Purpose |
| --- | --- |
| `index.html`, `style.css`, `app.js` | The whole web app. No build step. |
| `config.js` | Supabase address and key, building name, site password. |
| `logo.svg`, `favicon.svg`, `favicon.png`, `apple-touch-icon.png` | The logo and its browser tab versions. |
| `supabase/config.toml` | Supabase CLI project config. |
| `supabase/migrations/*.sql` | Schema and data, applied with `supabase db push`. |
| `supabase/functions/send-reminders/index.ts` | Edge Function that emails reminders. |
| `supabase/reminders-cron.sql` | One time script that schedules the daily reminders. Deliberately not a migration, because it contains the project ref and key. |

Until `config.js` is filled in the app runs in demo mode with obviously fake
sample data and nothing is saved.

## What it does

* **Dashboard.** Overdue, due in the next 30 days, coming up later,
  recently completed, and anything with no date set. Five counters
  across the top, including the estimated cost of all active work.
* **Responsibilities.** A searchable list, with status, category and person
  filters behind the Filter button, sortable by any column heading. Each item carries a category, priority,
  due date, the date it was last done, an estimated cost, a board role, an
  optional vendor, a repeat interval, and attached links.
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
  usernames, and links. There is no password field, on purpose.
* **Board.** Roles and members. A responsibility is assigned to a role such
  as Treasurer, and a role is held by a member, so a change of board only
  means changing who holds each role. A member's picture comes from Gravatar
  when their email has one, and is otherwise the first letter of their name. Member tiles show each
  person's email and phone and open their details.
* **Fixtures.** What the building uses and what to buy when something is
  replaced: paint colours with swatches, light fittings, hardware, the
  intercom, appliances. Each one can carry a picture, uploaded or linked,
  and documents.
* **Schedules.** Rotating duties such as the trash and recycling roster.
  Each row is an apartment and its months, dragged into order, and the site
  marks whose turn it is right now.
* **Settings.** Monthly or Never, the day it goes out, and a preview.
* **Monthly summary email.** Off until you switch it on. It opens with the
  logo and three counters, then who is up for each schedule such as the
  apartment on trash, then a table of everything overdue, due in the
  month ahead and due in the month after. Below that, overdue items and the
  month ahead appear in full with who is responsible, vendor contacts,
  documents and costs. Every responsibility, person, vendor and schedule in
  the email links to its page on the site.
* **Documents.** Every responsibility, vendor, account and fixture can hold a
  list of documents. Edit a label or address in place, drag rows to reorder them, or
  use the up and down buttons.

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
  Escape closes any dialog.
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

3. Open Project Settings, then API, and copy the Project URL and the anon
   public key.

### 1b. Optional: let Supabase apply migrations on push

Under Project Settings, then Integrations, then GitHub, connect this repo and
enable "Deploy to production". Migrations merged to `main` are then applied
automatically, and the `send-reminders` function declared in
`supabase/config.toml` deploys along with them.

This works on the free plan. What is not free is preview branches, a
throwaway database per pull request, billed at $0.01344 per branch per hour.
Leave preview branches off and the integration costs nothing.

Either way the workflow is the same. Write a migration, commit, push:

```sh
supabase migration new add_something
supabase db push
```

### 2. Configure the app

Edit `config.js`:

```js
window.CONDOBOARD_CONFIG = {
  SUPABASE_URL: "https://YOUR_PROJECT_REF.supabase.co",
  SUPABASE_ANON_KEY: "the long anon public key",
  BUILDING_NAME: "372 12th",
  SITE_PASSWORD: "essex",
};
```

Open `index.html` locally. The demo banner should be gone and the building's
real records should appear.

### 3. Deploy to Cloudflare Pages

1. Push this repo to GitHub.
2. At [dash.cloudflare.com](https://dash.cloudflare.com) go to Workers and
   Pages, then Create, then Pages, then Connect to Git, and pick this repo.
3. Build settings: framework preset None, build command empty, output
   directory `/`.
4. The site goes live at `https://<project>.pages.dev` and every push
   redeploys it.

Share that address and the password with the board.

### 4. The monthly summary email

The email is off until you turn it on, so this can all be set up safely
before the board is ready. A Supabase cron job calls the function once a day,
and the function reads the Settings tab to decide what to do. If reminders
are off, it sends nothing and says so. That is why the cron stays daily even
though the email is monthly. The daily run is only a heartbeat, and the
Settings row decides whether it acts.

Delivery is through [Resend](https://resend.com), free for 100 emails a day.
There is a Resend rule worth knowing: the shared sender
`onboarding@resend.dev` only delivers to the address the Resend account was
created with. Emailing each board member separately therefore needs a domain
you own and have verified in Resend, roughly $12 a year. One grouped email to
the building address is the free path.

1. Sign up at Resend and create an API key.
2. Deploy the function and set its secrets. Skip the deploy line if you
   enabled the GitHub integration in step 1b, since it deploys the function
   for you, but you still need the secrets.

   ```sh
   supabase functions deploy send-reminders
   supabase secrets set \
     RESEND_API_KEY=re_xxx \
     FROM_EMAIL="372 12th Board <onboarding@resend.dev>" \
     APP_URL=https://37212th.pages.dev
   ```

   Once you own a domain, verify it in Resend and change `FROM_EMAIL` to an
   address on it. Only then will per person delivery work.
3. Edit `supabase/reminders-cron.sql`, replace the project ref and anon key
   placeholders, and run it in the SQL Editor. The job fires daily at 13:00
   UTC, which is 9 AM Eastern.
4. Open the Settings tab and press **Preview the email**. It builds the real
   email from live data and shows it exactly as it will arrive, without
   sending anything. When it looks right, choose Monthly, set the day, and
   save.

The recipient is set by migration rather than on the site. To change it, run
`update reminder_settings set digest_email = '...' where id = 1;`.

**Preview the email** never sends, and works whether delivery is Monthly or
Never. **Send it now** does send, immediately, ignoring the schedule. It is the only control that delivers real mail while
delivery is set to Never.

Changing the function means redeploying it. The site calls the function
directly from the browser, so a build without the CORS headers will fail with
"Failed to fetch" even though the function is live.

### Which months the email covers

Sent on or before the 20th, the detailed month is the current one, since most
of it is still ahead. From the 21st it rolls to the next month, which suits a
board sending near the end of the month to prepare for the next. The email
always names the months it covers, so there is no guessing. Overdue items
appear in full every time, however far past they are.

Everything else lives on the Settings tab. The only pieces that stay as
Supabase secrets are the Resend key and the sender address, because those do
not belong in a database that anyone with the site address can read.

## Changing the schema later

Never edit a migration that has already been applied. Add a new one:

```sh
supabase migration new add_meeting_notes
supabase db push
```

`supabase migration list` shows what the remote has applied. If you change a
table the app reads, update the matching field names in `app.js`.

## Security

Be clear eyed about what the password screen is. It is a doorstop, not a
lock.

It runs in the browser, and the password sits in `config.js`, which every
visitor downloads. Anyone who views the page source can read it. That same
page contains the Supabase anon key, and the database policies allow anyone
to read and write, so a technical person could skip the site entirely and
query the database directly.

What it does buy you is the realistic case. If the address is forwarded,
posted in a building wide email, or found in someone's browser history,
whoever lands on it sees a password box rather than the board's vendor
contacts and account numbers.

Two things follow from that:

* **Passwords are never stored in this app.** The Accounts tab holds account
  numbers, usernames and portal links, but no passwords, and there is no
  field for them. Keep passwords in a shared password manager such as
  Bitwarden or 1Password, both of which have free family or team tiers.
  Camera stream credentials are excluded for the same reason.
* **Do not add anything genuinely sensitive**, such as owner payment
  details, personnel matters, or legal strategy.

Changing the site password means editing `config.js` and pushing. Browsers
that already remembered the old password stay unlocked, since they remember
what they were told.

### A stronger option, still free

**Cloudflare Access**, part of Zero Trust, is free for up to 50 users and
puts a real login in front of the whole site before any of it is served.
Each board member signs in with a one time code sent to their email. It is
the biggest security upgrade for the least work, it needs no changes to the
app, and it also hides the Supabase key from the public internet. Given that
this tracker now holds account numbers and city portal usernames, it is
worth doing.

The alternative is Supabase Auth magic links, which give proper per person
accounts so the app knows who is who. That is more work: enable it in the
Supabase dashboard, add a login screen, and narrow the policies in the first
migration from `anon, authenticated` to `authenticated`.

## Costs and limits

Cloudflare Pages allows 500 builds a month with unlimited requests. Supabase
gives 500 MB of database, 1 GB of file storage for fixture pictures, and 500,000 Edge Function calls a month. Resend
allows 100 emails a day on one domain. All are far beyond what this building
needs. The one thing to know is that Supabase pauses free projects after
about a week with no activity, and the daily reminder cron is enough to keep
it awake.
