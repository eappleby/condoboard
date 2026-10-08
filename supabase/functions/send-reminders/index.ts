// 372 12th board tracker. Monthly summary emailer, a Supabase Edge Function.
//
// The cron job in supabase/reminders-cron.sql calls this once a day. What it
// actually does is decided by the reminder_settings row, which the board
// edits on the Settings tab of the site. Nothing is ever sent while
// reminders_enabled is false, so the cron can be scheduled well before the
// board is ready to receive anything.
//
// The email has four parts:
//   Header           logo, name, and three counters like the dashboard's
//   Schedules        who is up for each rotation, such as the apartment on
//                    trash, in the month ahead and the month after
//   Table            everything overdue, due in the month ahead, and due in
//                    the month after, one row each
//   Overdue          full detail, however far past it is
//   The month ahead  full detail, with contacts, documents and costs
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
//   APP_URL          optional. The site address. It serves the logo, and
//                    every name in the email links into it.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

export type Vendor = {
  id?: string;
  name: string;
  website: string | null;
  // Retired single contact columns, read only when a vendor has no contacts.
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  vendor_contacts?: {
    name: string;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
    position?: number | null;
  }[] | null;
};

/** The vendor's primary contact, or the first one when none is marked. */
function primaryContact(v: Vendor): { name: string | null; email: string | null; phone: string | null } {
  const list = (v.vendor_contacts || []).slice().sort((a, b) =>
    Number(b.is_primary) - Number(a.is_primary) || (a.position || 0) - (b.position || 0));
  return list[0] || { name: v.contact_name, email: v.email, phone: v.phone };
}

export type Task = {
  id: string;
  title: string;
  description: string | null;
  due_date: string;
  priority: string;
  category: string;
  estimated_cost: number | null;
  last_completed_on: string | null;
  role: { name: string; member: { id?: string; name: string; email: string | null } | null } | null;
  vendor: Vendor | null;
  links: { title: string | null; url: string; sort_order: number | null }[] | null;
};

/** A rotation from the Schedules tab, such as trash and recycling. */
export type Schedule = {
  id?: string;
  name: string;
  position?: number | null;
  schedule_slots: {
    label: string;
    responsible: string | null;
    month_start: number | null;
    month_end: number | null;
    position?: number | null;
  }[] | null;
};

type DigestOpts = { now: Date; appUrl?: string | null; schedules?: Schedule[] | null };

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

// Where the logo is fetched from when APP_URL is not set.
const DEFAULT_APP_URL = "https://37212th.pages.dev";

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

function shortDate(s: string): string {
  const d = new Date(s + "T00:00:00Z");
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
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

// Colours match the site, so the email reads as part of the same tracker:
// red for overdue, amber for the month ahead, blue for the month after.
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const TONE = {
  overdue: { fg: "#b3261e", bg: "#fdeceb", line: "#e8b4b0" },
  ahead:   { fg: "#8a4b08", bg: "#fdf1e1", line: "#e0bd8c" },
  after:   { fg: "#16389f", bg: "#e8eefc", line: "#b7c9f2" },
  done:    { fg: "#15662f", bg: "#e6f4ea", line: "#a9d5b7" },
};
type ToneName = keyof typeof TONE;

const L = {
  row: 'style="margin:4px 0;color:#47576a;font-size:15px;line-height:1.5"',
  lbl: 'style="color:#16202b;font-weight:bold"',
  link: 'style="color:#16389f"',
};

// Everything in the email that names something on the site links to it.
// The site reads the part after # and opens that tab or record.
let SITE = DEFAULT_APP_URL;
function href(path: string): string {
  return escapeHtml(SITE + "/" + (path ? "#" + path : ""));
}
/** A link that keeps the surrounding text's look. */
function a(path: string, inner: string, style = ""): string {
  return `<a href="${href(path)}" style="color:inherit;text-decoration:none;${style}">${inner}</a>`;
}
/** "Treasurer, Mitch Herrera", with the person linking to their page. */
function responsibleHtml(t: Task, fallback: string): string {
  if (!t.role) return escapeHtml(fallback);
  const m = t.role.member;
  const who = m ? (m.id ? a("member/" + m.id, escapeHtml(m.name), "text-decoration:underline") : escapeHtml(m.name)) : "vacant";
  return escapeHtml(t.role.name) + ", " + who;
}

function pill(text: string, tone: ToneName): string {
  const c = TONE[tone];
  return `<span style="display:inline-block;background:${c.bg};color:${c.fg};border:1px solid ${c.line};` +
    `border-radius:6px;padding:3px 10px;font-size:13px;font-weight:bold;white-space:nowrap">${escapeHtml(text)}</span>`;
}

/** A counter like the ones across the top of the dashboard. */
function statTile(n: number, label: string, tone: ToneName, path: string): string {
  const c = TONE[tone];
  return `<td width="32%" valign="top"><a href="${href(path)}" style="display:block;color:inherit;text-decoration:none">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate"><tr>` +
    `<td style="background:#ffffff;border:1px solid #cfd8e3;border-left:6px solid ${c.fg};border-radius:10px;padding:12px 14px">` +
    `<div style="font-size:28px;font-weight:bold;line-height:1.15;color:${c.fg}">${n}</div>` +
    `<div style="font-size:14px;color:#47576a;margin-top:2px">${escapeHtml(label)}</div>` +
    `</td></tr></table></a></td>`;
}

/** A section heading in the style of the dashboard's status labels. */
function sectionHead(text: string, tone: ToneName, path: string): string {
  const c = TONE[tone];
  return `<p style="margin:28px 0 12px"><a href="${href(path)}" style="display:inline-block;background:${c.bg};color:${c.fg};` +
    `border:1px solid ${c.line};border-radius:6px;padding:5px 12px;font-size:14px;font-weight:bold;text-decoration:none;` +
    `text-transform:uppercase;letter-spacing:.05em">${escapeHtml(text)}</a></p>`;
}

/** Whoever is up for a schedule in a given month, 1 to 12. Same rule as the site. */
function slotFor(sc: Schedule, month: number) {
  const slots = (sc.schedule_slots || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
  return slots.find((s) => {
    if (!s.month_start || !s.month_end) return false;
    return s.month_start <= s.month_end
      ? month >= s.month_start && month <= s.month_end
      : month >= s.month_start || month <= s.month_end;
  }) || null;
}

/** Who is scheduled for each rotation in the two months the email covers. */
function scheduleTable(schedules: Schedule[], aheadMonth: string, aheadNum: number, afterMonth: string, afterNum: number): string {
  const rows = schedules.slice().sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((sc) => ({ sc, a: slotFor(sc, aheadNum), b: slotFor(sc, afterNum) }))
    .filter((x) => x.a || x.b);
  if (!rows.length) return "";
  const g = TONE.done;
  const th = `style="text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:${g.fg};` +
    `padding:12px 10px;border-bottom:2px solid ${g.line};background:${g.bg}"`;
  const who = (s: ReturnType<typeof slotFor>) => s
    ? `<div style="font-weight:bold;color:#16202b">${escapeHtml(s.responsible || "Not set")}</div>` +
      `<div style="color:#47576a;font-size:14px;margin-top:2px">${escapeHtml(s.label)}</div>`
    : `<span style="color:#47576a">Not set</span>`;
  return `<h2 style="font-size:18px;margin:28px 0 12px;color:#16202b">${a("schedules", "Schedules")}</h2>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid #cfd8e3;border-radius:10px;overflow:hidden">` +
    `<tr><th ${th}>Schedule</th><th ${th}>${escapeHtml(aheadMonth)}</th><th ${th}>${escapeHtml(afterMonth)}</th></tr>` +
    rows.map((x, i) => {
      const cell = `padding:12px 10px;vertical-align:top;font-size:15px;line-height:1.4;overflow-wrap:anywhere;` +
        (i === rows.length - 1 ? "" : "border-bottom:1px solid #cfd8e3;");
      return `<tr><td style="${cell}border-left:6px solid ${g.fg};font-weight:bold;color:#16202b">${a(x.sc.id ? "schedule/" + x.sc.id : "schedules", escapeHtml(x.sc.name))}</td>` +
        `<td style="${cell}">${who(x.a)}</td><td style="${cell}">${who(x.b)}</td></tr>`;
    }).join("") + `</table>`;
}

/** One row of the summary table. */
function tableRow(t: Task, tone: ToneName, label: string, last: boolean): string {
  const c = TONE[tone];
  const edge = last ? "" : "border-bottom:1px solid #cfd8e3;";
  const cell = `padding:12px 10px;vertical-align:top;font-size:15px;line-height:1.4;${edge}`;
  return `<tr>` +
    `<td style="${cell}border-left:6px solid ${c.fg}">` +
      `<div style="font-weight:bold;color:#16202b">${a("task/" + t.id, escapeHtml(t.title))}</div>` +
      `<div style="color:#47576a;font-size:14px;margin-top:2px">${responsibleHtml(t, "Unassigned")}</div></td>` +
    `<td style="${cell}color:${tone === "overdue" ? c.fg : "#16202b"};white-space:nowrap">${escapeHtml(shortDate(t.due_date))}</td>` +
    `<td align="right" style="${cell}">${pill(label, tone)}</td></tr>`;
}

/** One responsibility, in full, with everything needed to act on it. */
function detailedItem(t: Task, today: string, tone: ToneName): string {
  const rows: string[] = [];
  const when = t.due_date < today
    ? `${prettyDate(t.due_date)}, ${overdueLabel(t.due_date, today)}`
    : prettyDate(t.due_date);
  rows.push(`<p ${L.row}><span ${L.lbl}>Due:</span> <span style="color:${TONE[tone].fg};font-weight:bold">${escapeHtml(when)}</span></p>`);
  rows.push(`<p ${L.row}><span ${L.lbl}>Responsible:</span> ${responsibleHtml(t, "Nobody assigned yet")}` +
    (t.role?.member?.email ? ` (${escapeHtml(t.role.member.email)})` : "") + "</p>");
  if (t.estimated_cost != null) {
    rows.push(`<p ${L.row}><span ${L.lbl}>Estimated cost:</span> ${escapeHtml(money(t.estimated_cost))}</p>`);
  }
  if (t.last_completed_on) {
    rows.push(`<p ${L.row}><span ${L.lbl}>Last done:</span> ${escapeHtml(prettyDate(t.last_completed_on))}</p>`);
  }
  if (t.vendor) {
    const v = t.vendor;
    const bits = [v.id ? a("vendor/" + v.id, escapeHtml(v.name), "text-decoration:underline") : escapeHtml(v.name)];
    const c = primaryContact(v);
    if (c.name) bits.push(escapeHtml(c.name));
    if (c.phone) bits.push(escapeHtml(c.phone));
    if (c.email) bits.push(`<a href="mailto:${escapeHtml(c.email)}" ${L.link}>${escapeHtml(c.email)}</a>`);
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
    rows.push(`<p style="margin:10px 0 0;padding-top:10px;border-top:1px solid #cfd8e3;color:#47576a;font-size:14px;line-height:1.5">${escapeHtml(t.description)}</p>`);
  }
  const badges = `<span style="display:inline-block;background:#eceff3;color:#3f5060;border:1px solid #cfd8e3;` +
    `border-radius:6px;padding:3px 10px;font-size:13px;font-weight:bold">${escapeHtml(t.category || "Other")}</span>` +
    (t.priority === "high" ? " " + pill("High priority", "overdue") : "");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;margin:0 0 12px"><tr>` +
    `<td style="background:#ffffff;border:1px solid #cfd8e3;border-left:6px solid ${TONE[tone].fg};border-radius:10px;padding:14px 16px">` +
    `<p style="font-size:17px;font-weight:bold;margin:0 0 8px;color:#16202b">${a("task/" + t.id, escapeHtml(t.title))}</p>` +
    `<p style="margin:0 0 8px">${badges}</p>` + rows.join("") + `</td></tr></table>`;
}

/**
 * Build the monthly summary. Pure, so the content can be tested without
 * touching the network or sending anything.
 */
export function buildDigest(
  tasks: Task[],
  opts: DigestOpts,
): { html: string; subject: string; taskIds: string[]; counts: { overdue: number; ahead: number; after: number } } {
  const today = iso(opts.now);
  const { aheadStart, aheadEnd, afterEnd, aheadName, afterName } = coveredMonths(opts.now);
  const aheadMonth = aheadName.split(" ")[0];
  const afterMonth = afterName.split(" ")[0];

  const overdue = tasks.filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const ahead = tasks.filter((t) => t.due_date >= today && t.due_date >= iso(aheadStart) && t.due_date <= iso(aheadEnd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const afterStart = new Date(Date.UTC(aheadEnd.getUTCFullYear(), aheadEnd.getUTCMonth() + 1, 1));
  const after = tasks.filter((t) => t.due_date >= iso(afterStart) && t.due_date <= iso(afterEnd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  // The logo is served by the site, since mail clients do not show SVG or
  // inline images reliably.
  const site = (opts.appUrl || DEFAULT_APP_URL).replace(/\/$/, "");
  SITE = site;
  const header =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td width="56" valign="middle">${a("", `<img src="${escapeHtml(site)}/apple-touch-icon.png" width="48" height="48" alt="372 12th" style="display:block;border:0;border-radius:11px">`)}</td>` +
    `<td valign="middle" style="font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1;color:#16202b">${a("", `372 <span style="color:#4a2f8f">12<span style="font-size:15px;vertical-align:top;letter-spacing:.03em">TH</span></span>`)}</td>` +
    `<td valign="middle" align="right" style="font-size:14px;color:#47576a;line-height:1.4">${a("dashboard", `Board summary<br><strong style="color:#16202b;font-size:16px">${escapeHtml(aheadName)}</strong>`)}</td>` +
    `</tr></table>`;

  const stats =
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0 0"><tr>` +
    statTile(overdue.length, "Overdue", "overdue", "dashboard") + `<td width="2%"></td>` +
    statTile(ahead.length, "Due in " + aheadMonth, "ahead", "tasks") + `<td width="2%"></td>` +
    statTile(after.length, "Due in " + afterMonth, "after", "tasks") +
    `</tr></table>`;

  const listed: { t: Task; tone: ToneName; label: string }[] = [
    ...overdue.map((t) => ({ t, tone: "overdue" as ToneName, label: "Overdue" })),
    ...ahead.map((t) => ({ t, tone: "ahead" as ToneName, label: aheadMonth })),
    ...after.map((t) => ({ t, tone: "after" as ToneName, label: afterMonth })),
  ];
  const th = 'style="text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:#47576a;' +
    'padding:12px 14px;border-bottom:2px solid #cfd8e3;background:#f8fafc"';
  const table = listed.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid #cfd8e3;border-radius:10px;overflow:hidden">` +
      `<tr><th ${th}>Responsibility</th><th ${th}>Due</th><th ${th}></th></tr>` +
      listed.map((x, i) => tableRow(x.t, x.tone, x.label, i === listed.length - 1)).join("") + `</table>`
    : `<p ${L.row}>Nothing is overdue, and nothing is due through ${escapeHtml(afterName)}.</p>`;

  const parts: string[] = [header, stats];
  const afterNum = (aheadStart.getUTCMonth() + 1) % 12 + 1;
  parts.push(scheduleTable(opts.schedules || [], aheadMonth, aheadStart.getUTCMonth() + 1, afterMonth, afterNum));
  parts.push(`<h2 style="font-size:18px;margin:28px 0 12px;color:#16202b">${a("tasks", "Upcoming responsibilities")}</h2>`);
  parts.push(table);
  if (overdue.length) {
    parts.push(sectionHead("Overdue", "overdue", "dashboard"));
    parts.push(overdue.map((t) => detailedItem(t, today, "overdue")).join(""));
  }
  if (ahead.length) {
    parts.push(sectionHead("Due in " + aheadName, "ahead", "tasks"));
    parts.push(ahead.map((t) => detailedItem(t, today, "ahead")).join(""));
  }

  const html = `<div style="background:#f4f6f9;padding:24px 12px;font-family:${FONT};font-size:16px;color:#16202b;line-height:1.5">
<div style="max-width:640px;margin:0 auto">
${parts.join("\n")}
</div>
</div>`;

  const headline = overdue.length
    ? `${overdue.length} overdue, ${ahead.length} due in ${aheadMonth}`
    : `${ahead.length} due in ${aheadMonth}`;

  return {
    html,
    subject: `372 12th board summary: ${headline}`,
    taskIds: [...overdue, ...ahead, ...after].map((t) => t.id),
    counts: { overdue: overdue.length, ahead: ahead.length, after: after.length },
  };
}

/** Who the digest goes to. */
export function buildMessages(tasks: Task[], s: Settings, opts: DigestOpts): Message[] {
  const digest = buildDigest(tasks, opts);
  if (s.delivery_mode === "per_person") {
    const byEmail = new Map<string, Task[]>();
    for (const t of tasks) {
      const email = t.role?.member?.email || s.digest_email;
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

      // These checks decide whether to SEND. A preview must build the email
      // whatever they say, otherwise the board cannot see what an email would
      // look like before switching delivery on.
      if (!force && !dry) {
        if (!settings.reminders_enabled) {
          return json({ sent: 0, skipped: "Delivery is set to Never on the Settings tab.", schedule: describeSchedule(settings) });
        }
        if (!isSendDay(settings, now)) {
          return json({ sent: 0, skipped: "Not a sending day for the chosen frequency.", schedule: describeSchedule(settings) });
        }
        if (alreadySentToday(settings, now)) {
          return json({ sent: 0, skipped: "Already sent today." });
        }
      }

      const { afterEnd } = coveredMonths(now);
      const { data, error } = await supabase
        .from("responsibilities")
        .select("id,title,description,due_date,priority,category,estimated_cost,last_completed_on," +
                "role:board_roles(name,member:board_members(id,name,email))," +
                "vendor:vendors(id,name,contact_name,email,phone,website," +
                "vendor_contacts(name,email,phone,is_primary,position))," +
                "links(title,url,sort_order)")
        // Active only. in_progress is a retired value that still counts as
        // active until the status migration has run.
        .in("status", ["open", "in_progress"])
        .not("due_date", "is", null)
        .lte("due_date", iso(afterEnd))
        .order("due_date");
      if (error) throw error;
      const tasks = (data ?? []) as unknown as Task[];

      // Not fatal. The email still goes out without the rotation table.
      const { data: sched } = await supabase
        .from("schedules")
        .select("id,name,position,schedule_slots(label,responsible,month_start,month_end,position)");
      const schedules = (sched ?? []) as unknown as Schedule[];

      const appUrl = Deno.env.get("APP_URL") ?? null;
      const opts = { now, appUrl, schedules };
      const messages = buildMessages(tasks, settings, opts);

      if (dry) {
        const digest = buildDigest(tasks, opts);
        return json({
          preview: true,
          enabled: settings.reminders_enabled,
          schedule: describeSchedule(settings),
          months: coveredMonths(now).aheadName + " and " + coveredMonths(now).afterName,
          counts: digest.counts,
          wouldSend: messages.length,
          recipients: messages.length
            ? messages.map((m) => ({ to: m.to, subject: m.subject }))
            : [{ to: settings.digest_email ?? "no address set", subject: digest.subject }],
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
