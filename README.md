# Condo Board

A free, self-hosted tracker for a condo board's responsibilities: what's
upcoming, what's overdue, who's responsible, vendor contacts, and links to
contracts and documents. Recurring items (inspections, budget season, monthly
meetings) automatically roll forward to their next occurrence when you mark
them done, and a daily job emails reminders to whoever is assigned.

**Stack (everything on free tiers):**

- **Cloudflare Pages** — hosts the site (static HTML/CSS/JS, no build step)
- **Supabase** — Postgres database, plus the Edge Function + cron that send
  reminder emails
- **Resend** — actually delivers the reminder emails

There are no individual accounts — the site is protected by one shared
password that the whole board uses (`essex` by default; change it in
`config.js`). Read **Security** below for what that password does and doesn't
protect.

---

## What's in this repo

| File | Purpose |
| --- | --- |
| `index.html` / `style.css` / `app.js` | The whole web app. No build step. |
| `config.js` | Your Supabase URL + anon key, building name, and site password. |
| `supabase/config.toml` | Supabase CLI project config. |
| `supabase/migrations/*.sql` | Schema and starter data, applied with `supabase db push`. |
| `supabase/functions/send-reminders/index.ts` | Edge Function that emails due/overdue reminders. |
| `supabase/reminders-cron.sql` | One-time script to schedule the daily reminders. Not a migration — it contains your project ref and key. |

Until `config.js` is filled in, the app runs in **demo mode** with sample
data — open `index.html` in a browser to try it before setting anything up.

## Features

- **Dashboard** — overdue / due in 30 days / coming up later / in progress /
  recently completed, plus at-a-glance counts.
- **Responsibilities** — searchable, filterable list. Each item has a
  category, priority, due date, assignee, optional vendor, recurrence, and
  attached links (contracts, documents, websites).
- **Recurring items** — mark a monthly/quarterly/semiannual/annual item done
  and the next occurrence is created automatically.
- **Vendors** — contact info, notes, and contract/document links per vendor.
- **Board** — members with position, email, and phone; assignments and
  reminder emails use this list.
- **Reminder emails** — a daily job emails each member their items that are
  due within 7 days or overdue (re-nagging at most every 3 days per item).
- **Shared password** — one password screen before the app loads. Members
  tick "Remember me" and won't be asked again on that browser; the 🔒 button
  in the header locks it again (handy on a shared computer).

---

## Setup guide (once, ~20 minutes)

### 1. Create the Supabase project and apply the migrations (free)

1. Sign up at [supabase.com](https://supabase.com) and create a new project
   (any name, e.g. `condoboard`; pick a region near you; the free plan is fine).
2. Apply the schema from your machine with the CLI:

   ```sh
   supabase login
   supabase link --project-ref YOUR_PROJECT_REF   # the part before .supabase.co
   supabase db push
   ```

   That runs the two files in `supabase/migrations/`: the schema, then ~14
   common condo-board responsibilities as starter data (edit or delete them
   in the app later — the starter migration only fires when the table is
   empty, so replaying migrations never duplicates or resurrects rows).
3. Open **Project Settings → API** and copy:
   - the **Project URL** (like `https://abcdefgh.supabase.co`)
   - the **anon / public** key

### 1b. Optional: let Supabase apply migrations on push

In the dashboard under **Project Settings → Integrations → GitHub**, connect
this repo and enable **Deploy to production**. Migrations merged to `main` are
then applied automatically, and the `send-reminders` function (declared in
`supabase/config.toml`) deploys with them — so `supabase db push` and
`supabase functions deploy` become optional.

This part works on the **free** plan. What is *not* free is **preview
branches** (a throwaway database per pull request), billed at $0.01344 per
branch per hour. Leave that off and the integration costs nothing.

Either way the workflow is the same: write a migration, commit, push.

```sh
supabase migration new add_something     # creates a timestamped file
# …edit the file…
supabase db push                         # or just push to main, with 1b enabled
```

### 2. Configure the app

Edit `config.js` and paste in the two values, set your building's name, and
pick the shared password:

```js
window.CONDOBOARD_CONFIG = {
  SUPABASE_URL: "https://abcdefgh.supabase.co",
  SUPABASE_ANON_KEY: "eyJ…",
  BUILDING_NAME: "123 Main St Condo Board",
  SITE_PASSWORD: "essex",   // "" turns the password screen off
};
```

Open `index.html` locally — the demo banner should be gone and you should see
the starter responsibilities from the database.

### 3. Deploy to Cloudflare Pages (free)

1. Push this repo to GitHub (`git push origin main`).
2. Sign up at [dash.cloudflare.com](https://dash.cloudflare.com) →
   **Workers & Pages → Create → Pages → Connect to Git** and pick this repo.
3. Build settings: framework preset **None**, build command **(leave empty)**,
   output directory **/** (the repo root). Deploy.
4. Your site is live at `https://<project>.pages.dev`. Every `git push`
   redeploys automatically.

Share that URL and the password with the board.

### 4. Reminder emails (optional but recommended)

Reminders are sent by a Supabase Edge Function called daily by Supabase's
built-in cron, through [Resend](https://resend.com) (free: 100 emails/day).

1. **Resend**: sign up, create an API key.
   - Quick start: you can send from `onboarding@resend.dev`, but Resend only
     delivers that to *your own* account email — fine for testing.
   - Real use: verify a domain you own in Resend (Domains → Add), then send
     from e.g. `board@yourdomain.com` so every member can receive mail.
2. **Deploy the function** (skip the deploy line if you enabled the GitHub
   integration in step 1b — it deploys the function for you; you still need
   the secrets):

   ```sh
   supabase functions deploy send-reminders
   supabase secrets set RESEND_API_KEY=re_xxx \
     FROM_EMAIL="Condo Board <board@yourdomain.com>" \
     FALLBACK_EMAIL=you@example.com \
     APP_URL=https://your-site.pages.dev
   ```

   `FALLBACK_EMAIL` receives reminders for unassigned items; `APP_URL` is
   linked in the emails. Both optional.
3. **Schedule it**: edit `supabase/reminders-cron.sql`, replace the two
   placeholders (project ref and anon key), and run it in the SQL Editor.
   The default schedule is 13:00 UTC ≈ 9 AM Eastern, daily. This is
   deliberately *not* a migration — it would put your project ref and key
   into git, and it only ever needs to run once.
4. **Test it** without waiting for the cron: in the dashboard under
   **Edge Functions → send-reminders**, use "Invoke" (or `curl` the function
   URL with the anon key as a Bearer token) and check the JSON response.

How reminders behave: each member gets one email listing their items that are
overdue or due within 7 days; an item won't be re-mentioned until 3 days have
passed (tunable at the top of `index.ts`).

---

## Day-to-day use

- **Add a responsibility** with the blue button (any tab). Set a due date and
  a "Repeats" value for recurring duties.
- **Mark things done** with the ✓ button in the Responsibilities list; a
  recurring item schedules its next occurrence automatically.
- **Attach links** (contract PDFs in Google Drive/Dropbox, city inspection
  portals, invoices) inside the responsibility or vendor editor.
- **Add every board member** with their email on the Board tab — that's where
  reminder emails go.
- **Share the password** (`essex`) along with the URL. On a shared or public
  computer, click 🔒 in the header when finished.

## Changing the schema later

Never edit an already-applied migration — add a new one:

```sh
supabase migration new add_meeting_notes
# edit supabase/migrations/<timestamp>_add_meeting_notes.sql
supabase db push          # or push to main if the GitHub integration is on
```

To check what the remote has applied: `supabase migration list`. To rebuild a
local copy from scratch (needs Docker): `supabase start && supabase db reset`.

If you change a table the app reads, update the matching code in `app.js` —
the column names appear in the store functions and the modal save handlers.

## Security

Be clear-eyed about what the password screen is: **a doorstop, not a lock.**

It runs in the browser, and the password sits in `config.js`, which every
visitor downloads. Anyone who views the page source can read it. The same
page also contains the Supabase anon key, and the database policies allow
anyone to read and write — so a technical person could skip the site
entirely and talk to the database directly.

What it *does* buy you, which is the realistic threat here: if the link is
forwarded, posted in a building-wide email, or found in someone's browser
history, whoever lands on it sees a password box instead of the board's
vendor contacts and notes. For a condo board with no sensitive personal data
in it, that's usually the right trade for zero cost and zero account
management.

Two things follow from that:

- **Don't store anything genuinely sensitive** — owner payment details,
  personnel matters, legal strategy, anything you'd be unhappy to see
  forwarded.
- **Changing the password** means editing `config.js` and pushing; everyone
  gets the new screen on their next visit (previously-remembered browsers
  stay unlocked, since they remember the old password — click 🔒 to force
  a re-entry).

### Stronger options, both still free

1. **Cloudflare Access** (Zero Trust, free up to 50 users) — puts a real
   login in front of the whole site before any of it is served. Each member
   gets a one-time code by email. This is the biggest security upgrade for
   the least work, and it also hides the Supabase key from the public
   internet. Worth doing if the board ever puts anything real in here.
2. **Supabase Auth magic links** — proper per-person accounts, so the app
   knows who's who. More work: enable it in the Supabase dashboard, add a
   login screen, and change the policies in `schema.sql` from `to anon,
   authenticated` to `to authenticated`.

Ask Claude to set up either one.

## Costs & limits

Cloudflare Pages free tier (500 builds/month, unlimited requests), Supabase
free tier (500 MB database, 500K Edge Function calls/month), and Resend free
tier (100 emails/day, 1 domain) are all far beyond what a condo board needs. The only
caveat: Supabase pauses free projects after ~1 week with **no activity**; the
daily reminder cron keeps it active, and visiting the site works too.
