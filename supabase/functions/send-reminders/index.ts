// 372 12th board tracker. Monthly summary emailer, a Supabase Edge Function.
//
// The cron job in supabase/reminders-cron.sql calls this once a day. What it
// actually does is decided by the reminder_settings row, which the board
// edits on the Settings tab of the site. Nothing is ever sent while
// reminders_enabled is false, so the cron can be scheduled well before the
// board is ready to receive anything.
//
// The email has three parts:
//   Overdue          full detail, however far past it is
//   The month ahead  full detail, with contacts, documents and costs
//   The month after  names and who is responsible, nothing more
//
// Which month counts as "ahead" depends on when it is sent. On or before the
// 20th it is the current month, since most of it is still to come. From the
// 21st it is the next month, which is what a board sending late in the month
// is preparing for. The email always names the months it covers.
//
// Query parameters:
//   ?dry=1     Build the email and return it, including the HTML, without
//              sending anything or recording anything.
//   ?force=1   Ignore the schedule and the on and off switch, and send now.
//
// Secrets:
//   RESEND_API_KEY   required, from https://resend.com
//   FROM_EMAIL       sender. Defaults to the Resend testing sender.
//   APP_URL          optional. Linked at the bottom of the email.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

export type Vendor = {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
};

export type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: string;
  category: string;
  estimated_cost: number | null;
  last_completed_on: string | null;
  assignee: { name: string; email: string | null } | null;
  vendor: Vendor | null;
  links: { title: string | null; url: string; sort_order: number | null }[] | null;
};

export type Settings = {
  reminders_enabled: boolean;
  frequency: "daily" | "weekdays" | "weekly" | "monthly";
  send_weekday: number;
  send_day_of_month: number;
  delivery_mode: "digest" | "per_person";
  digest_email: string | null;
  last_sent_at: string | null;
};

export type Message = { to: string; subject: string; html: string; taskIds: string[] };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function safeUrl(u: string): string {
  const s = String(u || "").trim();
  return /^https?:\/\//i.test(s) ? s : "https://" + s;
}

export function isSendDay(s: Settings, now: Date): boolean {
  const weekday = now.getUTCDay();
  switch (s.frequency) {
    case "daily": return true;
    case "weekdays": return weekday >= 1 && weekday <= 5;
    case "weekly": return weekday === s.send_weekday;
    case "monthly": return now.getUTCDate() === s.send_day_of_month;
    default: return false;
  }
}

export function alreadySentToday(s: Settings, now: Date): boolean {
  if (!s.last_sent_at) return false;
  return s.last_sent_at.slice(0, 10) === now.toISOString().slice(0, 10);
}

export function describeSchedule(s: Settings): string {
  if (!s.reminders_enabled) return "Reminder emails are turned off.";
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const when = s.frequency === "daily" ? "every day"
    : s.frequency === "weekdays" ? "every weekday"
    : s.frequency === "weekly" ? `every ${days[s.send_weekday]}`
    : `on day ${s.send_day_of_month} of each month`;
  const who = s.delivery_mode === "digest"
    ? `one email to ${s.digest_email || "the address you set"}`
    : "each board member their own items";
  return `Sending ${who}, ${when}.`;
}

/**
 * The two months the email covers. Sent on or before the 20th, the detailed
 * month is the current one. From the 21st it rolls to the next month.
 */
export function coveredMonths(now: Date): { aheadStart: Date; aheadEnd: Date; afterEnd: Date; aheadName: string; afterName: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const roll = now.getUTCDate() >= 21 ? 1 : 0;
  const aheadStart = new Date(Date.UTC(y, m + roll, 1));
  const aheadEnd = new Date(Date.UTC(y, m + roll + 1, 0));      // last day of that month
  const afterEnd = new Date(Date.UTC(y, m + roll + 2, 0));      // last day of the month after
  const nameOf = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return {
    aheadStart, aheadEnd, afterEnd,
    aheadName: nameOf(aheadStart),
    afterName: nameOf(new Date(Date.UTC(aheadEnd.getUTCFullYear(), aheadEnd.getUTCMonth() + 1, 1))),
  };
}

function iso(d: Date): string { return d.toISOString().slice(0, 10); }

function money(n: number | null): string {
  if (n == null) return "";
  return "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function prettyDate(s: string): string {
  const d = new Date(s + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function overdueLabel(due: string, today: string): string {
  const days = Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000);
  const years = Math.floor(days / 365);
  return years >= 1
    ? `overdue by ${years} ${years === 1 ? "year" : "years"}`
    : `overdue by ${days} ${days === 1 ? "day" : "days"}`;
}

const L = {
  card: 'style="border:1px solid #cfd8e3;border-radius:8px;padding:14px 16px;margin:0 0 12px"',
  title: 'style="font-size:17px;font-weight:bold;margin:0 0 6px"',
  row: 'style="margin:4px 0;color:#47576a;font-size:15px"',
  lbl: 'style="color:#16202b;font-weight:bold"',
  h2: 'style="font-size:18px;margin:26px 0 12px;padding-bottom:6px;border-bottom:2px solid #cfd8e3"',
  slim: 'style="margin:6px 0;font-size:15px"',
  link: 'style="color:#1d4ed8"',
};

/** One responsibility, in full, with everything needed to act on it. */
function detailedItem(t: Task, today: string): string {
  const rows: string[] = [];
  const when = t.due_date < today
    ? `${prettyDate(t.due_date)}, ${overdueLabel(t.due_date, today)}`
    : prettyDate(t.due_date);
  rows.push(`<p ${L.row}><span ${L.lbl}>Due:</span> ${escapeHtml(when)}</p>`);
  rows.push(`<p ${L.row}><span ${L.lbl}>Responsible:</span> ${escapeHtml(t.assignee?.name || "Nobody assigned yet")}` +
    (t.assignee?.email ? ` (${escapeHtml(t.assignee.email)})` : "") + "</p>");
  if (t.estimated_cost != null) {
    rows.push(`<p ${L.row}><span ${L.lbl}>Estimated cost:</span> ${escapeHtml(money(t.estimated_cost))}</p>`);
  }
  if (t.last_completed_on) {
    rows.push(`<p ${L.row}><span ${L.lbl}>Last done:</span> ${escapeHtml(prettyDate(t.last_completed_on))}</p>`);
  }
  if (t.vendor) {
    const v = t.vendor;
    const bits = [escapeHtml(v.name)];
    if (v.contact_name) bits.push(escapeHtml(v.contact_name));
    if (v.phone) bits.push(escapeHtml(v.phone));
    if (v.email) bits.push(`<a href="mailto:${escapeHtml(v.email)}" ${L.link}>${escapeHtml(v.email)}</a>`);
    if (v.website) bits.push(`<a href="${escapeHtml(safeUrl(v.website))}" ${L.link}>${escapeHtml(v.website.replace(/^https?:\/\//, ""))}</a>`);
    rows.push(`<p ${L.row}><span ${L.lbl}>Vendor:</span> ${bits.join(", ")}</p>`);
  }
  const links = (t.links || []).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  if (links.length) {
    const list = links.map((l) =>
      `<a href="${escapeHtml(safeUrl(l.url))}" ${L.link}>${escapeHtml(l.title || l.url)}</a>`).join(", ");
    rows.push(`<p ${L.row}><span ${L.lbl}>Documents:</span> ${list}</p>`);
  }
  if (t.description) {
    rows.push(`<p ${L.row}>${escapeHtml(t.description)}</p>`);
  }
  const flag = t.priority === "high" ? ' <span style="color:#b3261e">(high priority)</span>' : "";
  return `<div ${L.card}><p ${L.title}>${escapeHtml(t.title)}${flag}</p>` +
    `<p ${L.row}><span ${L.lbl}>Category:</span> ${escapeHtml(t.category || "Other")}</p>` +
    rows.join("") + "</div>";
}

/** One responsibility, stripped back to the name and who has it. */
function slimItem(t: Task): string {
  return `<p ${L.slim}><strong>${escapeHtml(t.title)}</strong>, ` +
    `${escapeHtml(t.assignee?.name || "nobody assigned yet")}` +
    `<span style="color:#47576a"> (${escapeHtml(prettyDate(t.due_date))})</span></p>`;
}

/**
 * Build the monthly summary. Pure, so the content can be tested without
 * touching the network or sending anything.
 */
export function buildDigest(
  tasks: Task[],
  opts: { now: Date; appUrl?: string | null },
): { html: string; subject: string; taskIds: string[]; counts: { overdue: number; ahead: number; after: number } } {
  const today = iso(opts.now);
  const { aheadStart, aheadEnd, afterEnd, aheadName, afterName } = coveredMonths(opts.now);

  const overdue = tasks.filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const ahead = tasks.filter((t) => t.due_date >= today && t.due_date >= iso(aheadStart) && t.due_date <= iso(aheadEnd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const afterStart = new Date(Date.UTC(aheadEnd.getUTCFullYear(), aheadEnd.getUTCMonth() + 1, 1));
  const after = tasks.filter((t) => t.due_date >= iso(afterStart) && t.due_date <= iso(afterEnd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  const parts: string[] = [];
  parts.push(`<p style="font-size:16px;margin:0 0 4px">Here is where the building stands for <strong>${escapeHtml(aheadName)}</strong>.</p>`);

  if (overdue.length) {
    parts.push(`<h2 ${L.h2}>Overdue (${overdue.length})</h2>`);
    parts.push(overdue.map((t) => detailedItem(t, today)).join(""));
  }

  parts.push(`<h2 ${L.h2}>${escapeHtml(aheadName)} (${ahead.length})</h2>`);
  parts.push(ahead.length
    ? ahead.map((t) => detailedItem(t, today)).join("")
    : `<p ${L.row}>Nothing is due this month.</p>`);

  parts.push(`<h2 ${L.h2}>Coming in ${escapeHtml(afterName)} (${after.length})</h2>`);
  parts.push(after.length
    ? after.map(slimItem).join("")
    : `<p ${L.row}>Nothing is due that month.</p>`);

  const link = opts.appUrl
    ? `<p style="margin-top:26px"><a href="${escapeHtml(opts.appUrl)}" ${L.link}>Open the board tracker</a> to mark something done or change a date.</p>`
    : "";

  const html = `<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#16202b;line-height:1.5;max-width:680px">
<h1 style="font-size:22px;margin:0 0 2px">372 12th</h1>
${parts.join("\n")}
${link}
<p style="color:#47576a;font-size:14px;margin-top:24px;border-top:1px solid #cfd8e3;padding-top:12px">Sent automatically by the 372 12th board tracker. Change how often these arrive, or turn them off, on the Settings tab.</p>
</div>`;

  const headline = overdue.length
    ? `${overdue.length} overdue, ${ahead.length} due in ${aheadName.split(" ")[0]}`
    : `${ahead.length} due in ${aheadName.split(" ")[0]}`;

  return {
    html,
    subject: `372 12th board summary: ${headline}`,
    taskIds: [...overdue, ...ahead, ...after].map((t) => t.id),
    counts: { overdue: overdue.length, ahead: ahead.length, after: after.length },
  };
}

/** Who the digest goes to. */
export function buildMessages(tasks: Task[], s: Settings, opts: { now: Date; appUrl?: string | null }): Message[] {
  const digest = buildDigest(tasks, opts);
  if (s.delivery_mode === "per_person") {
    const byEmail = new Map<string, Task[]>();
    for (const t of tasks) {
      const email = t.assignee?.email || s.digest_email;
      if (!email) continue;
      byEmail.set(email, [...(byEmail.get(email) ?? []), t]);
    }
    return [...byEmail.entries()].map(([email, own]) => {
      const d = buildDigest(own, opts);
      return { to: email, subject: d.subject, html: d.html, taskIds: d.taskIds };
    });
  }
  if (!s.digest_email) return [];
  return [{ to: s.digest_email, subject: digest.subject, html: digest.html, taskIds: digest.taskIds }];
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    try {
      const url = new URL(req.url);
      const dry = url.searchParams.get("dry") === "1";
      const force = url.searchParams.get("force") === "1";

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: row, error: sErr } = await supabase
        .from("reminder_settings").select("*").eq("id", 1).single();
      if (sErr) throw sErr;
      const settings = row as Settings;

      const now = new Date();
      if (!force) {
        if (!settings.reminders_enabled) {
          return json({ sent: 0, skipped: "Reminders are turned off on the Settings tab.", schedule: describeSchedule(settings) });
        }
        if (!isSendDay(settings, now)) {
          return json({ sent: 0, skipped: "Not a sending day for the chosen frequency.", schedule: describeSchedule(settings) });
        }
        if (!dry && alreadySentToday(settings, now)) {
          return json({ sent: 0, skipped: "Already sent today." });
        }
      }

      const { afterEnd } = coveredMonths(now);
      const { data, error } = await supabase
        .from("responsibilities")
        .select("id,title,description,due_date,priority,category,estimated_cost,last_completed_on," +
                "assignee:board_members(name,email)," +
                "vendor:vendors(name,contact_name,email,phone,website)," +
                "links(title,url,sort_order)")
        .neq("status", "done")
        .not("due_date", "is", null)
        .lte("due_date", iso(afterEnd))
        .order("due_date");
      if (error) throw error;
      const tasks = (data ?? []) as unknown as Task[];

      const appUrl = Deno.env.get("APP_URL") ?? null;
      const messages = buildMessages(tasks, settings, { now, appUrl });

      if (dry) {
        const digest = buildDigest(tasks, { now, appUrl });
        return json({
          preview: true,
          schedule: describeSchedule(settings),
          months: coveredMonths(now).aheadName + " and " + coveredMonths(now).afterName,
          counts: digest.counts,
          wouldSend: messages.length,
          recipients: messages.map((m) => ({ to: m.to, subject: m.subject })),
          subject: messages[0]?.subject ?? digest.subject,
          html: messages[0]?.html ?? digest.html,
        });
      }

      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) return json({ error: "RESEND_API_KEY is not set" }, 500);
      if (!messages.length) {
        return json({ sent: 0, skipped: "No recipient is set on the Settings tab." });
      }

      const fromEmail = Deno.env.get("FROM_EMAIL") ?? "372 12th Board <onboarding@resend.dev>";
      const results: Record<string, unknown>[] = [];
      let ok = 0;
      for (const m of messages) {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromEmail, to: [m.to], subject: m.subject, html: m.html }),
        });
        const body = await resp.json().catch(() => ({}));
        results.push({ to: m.to, ok: resp.ok, response: body });
        if (resp.ok) ok++;
      }
      if (ok) {
        await supabase.from("reminder_settings")
          .update({ last_sent_at: now.toISOString() }).eq("id", 1);
      }
      return json({ mode: settings.delivery_mode, test: force, sent: ok, results });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  });
}
