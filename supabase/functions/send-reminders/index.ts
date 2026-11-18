// 372 12th board tracker. The reminder emails, a Supabase Edge Function.
//
// The cron job in supabase/reminders-cron.sql calls this every hour. Each run
// works out the hour in New York and sends whatever is due at that hour:
//
//   Monthly summary   9AM on the chosen day of the month, to the board
//                     address on the Notifications tab
//   Due notices       9AM, to whoever holds the role a responsibility points
//                     at, 7 days before the due date, on it, and every 7 days
//                     while it is overdue. Only for responsibilities with
//                     send_reminders on.
//   Schedule          each schedule's own hour and weekdays, such as the
//   reminders         trash at 7AM on Tuesday and Friday, to every person on
//                     the row that covers today and has not muted it
//
// Each kind has its own switch in reminder_settings, all off by default, so
// the cron can be scheduled before the board is ready. Notices and schedule
// reminders are recorded in notifications_sent, so a retried hour never
// sends the same email twice. The summary uses last_sent_at for the same.
//
// Every notice and schedule reminder has a link to /mute on the site, which
// turns that item off for good. The link carries the row's mute_token. The
// logo is served from /mute/logo.png, since /mute is the one path outside
// Cloudflare Access and mail clients have no login.
//
// Query parameters, used by the Notifications tab:
//   ?dry=1&kind=summary|due|schedule   Build the email and return it without
//                                      sending or recording anything. When
//                                      nothing of that kind goes out today,
//                                      the next one is shown.
//   ?force=1                           Send the monthly summary now.
// Both need the service key once supabase/lockdown.sql has run. The site's
// proxy supplies it after checking the Cloudflare Access login.
//
// Secrets:
//   CLOUDMAILIN_USERNAME   required, from the CloudMailin outbound account
//   CLOUDMAILIN_API_KEY    required
//   FROM_EMAIL             sender. Defaults to 372 Board <372board@forourschool.org>
//   APP_URL                optional. The site address. It serves the logo,
//                          every name in an email links into it, and the
//                          mute links point at it.
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided
// automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

export type Member = { id?: string; name: string; email: string | null };

export type Task = {
  id: string;
  title: string;
  due_date: string;
  send_reminders?: boolean | null;
  mute_token?: string | null;
  role: { name: string; member: Member | null } | null;
};

export type SlotRange = { start_date: string; end_date: string; position?: number | null };
export type SlotPerson = {
  id: string;
  muted: boolean;
  mute_token: string;
  position?: number | null;
  member: Member | null;
};
export type Slot = {
  id?: string;
  label: string;
  responsible: string | null;
  description?: string | null;
  repeats_yearly?: boolean | null;
  position?: number | null;
  schedule_slot_ranges?: SlotRange[] | null;
  schedule_slot_people?: SlotPerson[] | null;
};

/** A rotation from the Schedules tab, such as trash and recycling. */
export type Schedule = {
  id?: string;
  name: string;
  description?: string | null;
  position?: number | null;
  remind_days?: number[] | null;
  remind_hour?: number | null;
  schedule_slots: Slot[] | null;
};

type DigestOpts = { now: Date; appUrl?: string | null; schedules?: Schedule[] | null };

export type Settings = {
  reminders_enabled: boolean;
  due_notices_enabled?: boolean;
  schedule_reminders_enabled?: boolean;
  frequency: "daily" | "weekdays" | "weekly" | "monthly";
  send_weekday: number;
  send_day_of_month: number;
  delivery_mode: "digest" | "per_person";
  digest_email: string | null;
  last_sent_at: string | null;
};

export type LogKey = { kind: "due" | "schedule"; ref_id: string };
export type Message = {
  to: string;
  subject: string;
  html: string;
  headers?: Record<string, string>;
  log?: LogKey[];
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

// Where the logo is fetched from when APP_URL is not set.
const DEFAULT_APP_URL = "https://37212th.pages.dev";
const DEFAULT_FROM = "372 Board <372board@forourschool.org>";

/** The hour, New York time, for the summary and for due notices. */
export const SUMMARY_HOUR = 9;
export const NOTICE_HOUR = 9;
export const ZONE = "America/New_York";

const MONTHS = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ---------------------------------------------------------------------------
// Dates. Everything is decided on the New York calendar. Dates are
// YYYY-MM-DD strings, and a Date passed to the builders is that day at
// midnight UTC, so the UTC getters read the New York date.
// ---------------------------------------------------------------------------

/** The date, hour and weekday in New York at a given moment. */
export function localParts(now: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: ZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hour12: false, weekday: "short",
  });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(now)) p[x.type] = x.value;
  return {
    ymd: `${p.year}-${p.month}-${p.day}`,
    day: Number(p.day),
    hour: Number(p.hour) % 24,
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday),
  };
}

function iso(d: Date): string { return d.toISOString().slice(0, 10); }
function asDate(ymd: string): Date { return new Date(ymd + "T00:00:00Z"); }
export function addDays(ymd: string, n: number): string {
  const d = asDate(ymd);
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
/** b minus a, in days. */
export function dayDiff(a: string, b: string): number {
  return Math.round((asDate(b).getTime() - asDate(a).getTime()) / 864e5);
}

function shortDate(s: string): string {
  const d = asDate(s);
  return `${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function prettyDate(s: string): string {
  const d = asDate(s);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}
function weekdayDate(s: string): string {
  const d = asDate(s);
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
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

export function alreadySentToday(s: Settings, today: string): boolean {
  if (!s.last_sent_at) return false;
  return localParts(new Date(s.last_sent_at)).ymd === today;
}

/** How many months past the month after the "Coming up later" list reaches. */
const LATER_MONTHS = 6;

/**
 * The two months the summary covers. Sent on or before the 20th, the
 * detailed month is the current one. From the 21st it rolls to the next.
 */
export function coveredMonths(now: Date): { aheadStart: Date; aheadEnd: Date; afterEnd: Date; laterEnd: Date; aheadName: string; afterName: string } {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const roll = now.getUTCDate() >= 21 ? 1 : 0;
  const aheadStart = new Date(Date.UTC(y, m + roll, 1));
  const aheadEnd = new Date(Date.UTC(y, m + roll + 1, 0));      // last day of that month
  const afterEnd = new Date(Date.UTC(y, m + roll + 2, 0));      // last day of the month after
  const laterEnd = new Date(Date.UTC(y, m + roll + 2 + LATER_MONTHS, 0)); // end of "coming up later"
  const nameOf = (d: Date) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return {
    aheadStart, aheadEnd, afterEnd, laterEnd,
    aheadName: nameOf(aheadStart),
    afterName: nameOf(new Date(Date.UTC(aheadEnd.getUTCFullYear(), aheadEnd.getUTCMonth() + 1, 1))),
  };
}

// ---------------------------------------------------------------------------
// Schedule rows. Same rules as the site, in app.js. Keep the two in step.
// ---------------------------------------------------------------------------

function lastDay(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate(); }
function ymdParts(s: string) { return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) }; }

/**
 * Whether a range covers a day. A yearly range ignores the year, may wrap
 * past December, and covers February 29 when it ends on the 28th.
 */
export function rangeCovers(r: SlotRange, yearly: boolean, day: string): boolean {
  if (!r.start_date || !r.end_date) return false;
  if (!yearly) return day >= r.start_date && day <= r.end_date;
  if (dayDiff(r.start_date, r.end_date) >= 365) return true;
  const s = r.start_date.slice(5);
  const e = r.end_date.slice(5) === "02-28" ? "02-29" : r.end_date.slice(5);
  const t = day.slice(5);
  return s <= e ? t >= s && t <= e : t >= s || t <= e;
}

function rangesOf(slot: Slot): SlotRange[] {
  return (slot.schedule_slot_ranges || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
}

export function coveringRange(slot: Slot, day: string): SlotRange | null {
  return rangesOf(slot).find((r) => rangeCovers(r, slot.repeats_yearly !== false, day)) || null;
}

/** Whether a row covers any day of a month. */
export function slotTouchesMonth(slot: Slot, year: number, month: number): boolean {
  const n = lastDay(year, month);
  for (let d = 1; d <= n; d++) {
    const day = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (coveringRange(slot, day)) return true;
  }
  return false;
}

/** "November", "January/February", "March 3 to 20", with the year when it does not repeat. */
export function rangeLabel(r: SlotRange, yearly: boolean): string {
  const a = ymdParts(r.start_date), b = ymdParts(r.end_date);
  const yr = (p: { y: number }) => yearly ? "" : " " + p.y;
  const wholeEnd = b.d === lastDay(b.y, b.m) || (yearly && b.m === 2 && b.d === 28);
  if (a.d === 1 && wholeEnd) {
    if (a.m === b.m && a.y === b.y) return MONTHS[a.m - 1] + yr(a);
    const span = (b.y - a.y) * 12 + b.m - a.m;
    const join = span === 1 || (yearly && span === -11) ? "/" : " to ";
    if (yearly || a.y === b.y) return MONTHS[a.m - 1] + join + MONTHS[b.m - 1] + yr(b);
    return MONTHS[a.m - 1] + yr(a) + join + MONTHS[b.m - 1] + yr(b);
  }
  if (r.start_date === r.end_date) return MONTHS[a.m - 1] + " " + a.d + (yearly ? "" : ", " + a.y);
  const end = a.m === b.m && a.y === b.y ? String(b.d) : MONTHS[b.m - 1] + " " + b.d;
  if (yearly) return `${MONTHS[a.m - 1]} ${a.d} to ${end}`;
  if (a.y === b.y) return `${MONTHS[a.m - 1]} ${a.d} to ${end}, ${b.y}`;
  return `${MONTHS[a.m - 1]} ${a.d}, ${a.y} to ${MONTHS[b.m - 1]} ${b.d}, ${b.y}`;
}

export function slotPeriod(slot: Slot): string {
  const ranges = rangesOf(slot);
  if (!ranges.length) return slot.label || "";
  return ranges.map((r) => rangeLabel(r, slot.repeats_yearly !== false)).join(", ");
}

function peopleOf(slot: Slot): SlotPerson[] {
  return (slot.schedule_slot_people || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
}
function namesOf(slot: Slot): string[] {
  return peopleOf(slot).map((p) => p.member?.name).filter((n): n is string => !!n);
}
function firstName(name: string): string { return String(name || "").trim().split(/\s+/)[0] || ""; }
function sortedSlots(sc: Schedule): Slot[] {
  return (sc.schedule_slots || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0));
}

/** The site stores a bare apartment number. The email spells it out as "Apt 5". */
function aptLabel(v: string | null): string {
  const t = String(v || "").trim();
  if (!t) return "";
  return /^\d+[a-z]?$/i.test(t) ? "Apt " + t : t;
}

/** "Apt 5, Evan Appleby and Jane Appleby" */
function whoLabel(slot: Slot): string {
  const names = namesOf(slot);
  const people = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0] || "";
  return [aptLabel(slot.responsible), people].filter(Boolean).join(", ") || "Not set";
}

// ---------------------------------------------------------------------------
// Shared look. Colours match the site: red for overdue, amber for the month
// ahead, blue for the month after, green for schedules.
// ---------------------------------------------------------------------------

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
  p: 'style="margin:0 0 12px;color:#16202b;font-size:16px;line-height:1.5"',
  card: 'style="border-collapse:separate;margin:0 0 12px"',
};

// Everything in an email that names something on the site links to it.
// The site reads the part after # and opens that tab or record.
let SITE = DEFAULT_APP_URL;
function setSite(appUrl?: string | null) { SITE = (appUrl || DEFAULT_APP_URL).replace(/\/$/, ""); }
function href(path: string): string {
  return escapeHtml(SITE + "/" + (path ? "#" + path : ""));
}
export function muteUrl(token: string): string { return SITE + "/mute?t=" + encodeURIComponent(token); }
/** A link that keeps the surrounding text's look. */
function a(path: string, inner: string, style = ""): string {
  return `<a href="${href(path)}" style="color:inherit;text-decoration:none;${style}">${inner}</a>`;
}
function muteLink(token: string, text: string): string {
  return `<a href="${escapeHtml(muteUrl(token))}" style="color:#47576a;text-decoration:underline">${escapeHtml(text)}</a>`;
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

/** Logo and name on the left, a link on the right. */
function headerHtml(rightTop: string, rightBold: string, path: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>` +
    `<td width="56" valign="middle">${a("", `<img src="${escapeHtml(SITE)}/mute/logo.png" width="48" height="48" alt="372 12th" style="display:block;border:0;border-radius:11px">`)}</td>` +
    `<td valign="middle" style="font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1;color:#16202b">${a("", `372 <span style="color:#4a2f8f">12<span style="font-size:15px;vertical-align:top;letter-spacing:.03em">TH</span></span>`)}</td>` +
    `<td valign="middle" align="right" style="font-size:14px;color:#47576a;line-height:1.4">${a(path, `${escapeHtml(rightTop)}<br><strong style="color:#16202b;font-size:16px">${escapeHtml(rightBold)}</strong>`)}</td>` +
    `</tr></table>`;
}

function wrap(parts: string[]): string {
  return `<div style="background:#f4f6f9;padding:24px 12px;font-family:${FONT};font-size:16px;color:#16202b;line-height:1.5">
<div style="max-width:640px;margin:0 auto">
${parts.join("\n")}
</div>
</div>`;
}

/** A card with a coloured left edge, like the site's. */
function card(edge: string, inner: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" ${L.card}><tr>` +
    `<td style="background:#ffffff;border:1px solid #cfd8e3;border-left:6px solid ${edge};border-radius:10px;padding:14px 16px">` +
    inner + `</td></tr></table>`;
}

/** A plain text part, for mail clients that do not show HTML. */
export function toPlain(html: string): string {
  return html
    .replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g, (_m, url, text) => {
      const t = text.replace(/<br\s*\/?>/g, " ").replace(/<[^>]+>/g, "").trim();
      return url.includes("/mute?") ? `${t}: ${url}` : t;
    })
    .replace(/<br\s*\/?>/g, "\n")
    .replace(/<\/(p|div|tr|h2|table)>/g, "\n")
    .replace(/<\/td>/g, "  ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&")
    .split("\n").map((l) => l.replace(/[ \t]+/g, " ").trim()).filter(Boolean).join("\n");
}

// ---------------------------------------------------------------------------
// Monthly summary
// ---------------------------------------------------------------------------

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

/** The rows of a schedule that cover any day of a month. */
export function slotsInMonth(sc: Schedule, year: number, month: number): Slot[] {
  return sortedSlots(sc).filter((s) => slotTouchesMonth(s, year, month));
}

type Ym = { y: number; m: number; name: string };

/** Who is scheduled for each rotation in the two months the summary covers. */
function scheduleTable(schedules: Schedule[], ahead: Ym, after: Ym): string {
  const rows = schedules.slice().sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((sc) => ({ sc, a: slotsInMonth(sc, ahead.y, ahead.m), b: slotsInMonth(sc, after.y, after.m) }))
    .filter((x) => x.a.length || x.b.length);
  if (!rows.length) return "";
  const g = TONE.done;
  const th = `style="text-align:left;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:${g.fg};` +
    `padding:12px 10px;border-bottom:2px solid ${g.line};background:${g.bg}"`;
  const who = (slots: Slot[]) => slots.length
    ? slots.map((s) =>
      `<div style="font-weight:bold;color:#16202b">${escapeHtml(whoLabel(s))}</div>` +
      `<div style="color:#47576a;font-size:14px;margin:2px 0 6px">${escapeHtml(slotPeriod(s))}</div>`).join("")
    : `<span style="color:#47576a">Not set</span>`;
  return `<h2 style="font-size:18px;margin:28px 0 12px;color:#16202b">${a("schedules", "Schedules")}</h2>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid #cfd8e3;border-radius:10px;overflow:hidden">` +
    `<tr><th ${th}>Schedule</th><th ${th}>${escapeHtml(ahead.name)}</th><th ${th}>${escapeHtml(after.name)}</th></tr>` +
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

/** One row of the "Coming up later" list: name, who, and when. */
function laterRow(t: Task, last: boolean): string {
  const edge = last ? "" : "border-bottom:1px solid #cfd8e3;";
  const cell = `padding:10px;vertical-align:top;font-size:15px;line-height:1.4;${edge}`;
  return `<tr><td style="${cell}border-left:6px solid #9fb0c4">` +
    `<div style="font-weight:bold;color:#16202b">${a("task/" + t.id, escapeHtml(t.title))}</div>` +
    `<div style="color:#47576a;font-size:14px;margin-top:2px">${responsibleHtml(t, "Unassigned")}</div></td>` +
    `<td align="right" style="${cell}color:#16202b;white-space:nowrap">${escapeHtml(prettyDate(t.due_date))}</td></tr>`;
}

/**
 * Build the monthly summary. Pure, so the content can be tested without
 * touching the network or sending anything.
 */
export function buildDigest(
  tasks: Task[],
  opts: DigestOpts,
): { html: string; subject: string; taskIds: string[]; counts: { overdue: number; ahead: number; after: number; later: number } } {
  const today = iso(opts.now);
  const { aheadStart, aheadEnd, afterEnd, laterEnd, aheadName, afterName } = coveredMonths(opts.now);
  const aheadMonth = aheadName.split(" ")[0];
  const afterMonth = afterName.split(" ")[0];

  const overdue = tasks.filter((t) => t.due_date < today)
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const ahead = tasks.filter((t) => t.due_date >= today && t.due_date >= iso(aheadStart) && t.due_date <= iso(aheadEnd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const afterStart = new Date(Date.UTC(aheadEnd.getUTCFullYear(), aheadEnd.getUTCMonth() + 1, 1));
  const after = tasks.filter((t) => t.due_date >= iso(afterStart) && t.due_date <= iso(afterEnd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const later = tasks.filter((t) => t.due_date > iso(afterEnd) && t.due_date <= iso(laterEnd))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  setSite(opts.appUrl);
  const header = headerHtml("Board summary", aheadName, "dashboard");

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
  parts.push(scheduleTable(opts.schedules || [],
    { y: aheadStart.getUTCFullYear(), m: aheadStart.getUTCMonth() + 1, name: aheadMonth },
    { y: afterStart.getUTCFullYear(), m: afterStart.getUTCMonth() + 1, name: afterMonth }));
  parts.push(`<h2 style="font-size:18px;margin:28px 0 12px;color:#16202b">${a("tasks", "Upcoming responsibilities")}</h2>`);
  parts.push(table);
  if (later.length) {
    parts.push(`<h2 style="font-size:18px;margin:28px 0 12px;color:#16202b">${a("tasks", "Coming up later")}</h2>`);
    parts.push(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#ffffff;border:1px solid #cfd8e3;border-radius:10px;overflow:hidden">` +
      later.map((t, i) => laterRow(t, i === later.length - 1)).join("") + `</table>`);
  }

  const headline = overdue.length
    ? `${overdue.length} overdue, ${ahead.length} due in ${aheadMonth}`
    : `${ahead.length} due in ${aheadMonth}`;

  return {
    html: wrap(parts),
    subject: `372 12th board summary: ${headline}`,
    taskIds: [...overdue, ...ahead, ...after, ...later].map((t) => t.id),
    counts: { overdue: overdue.length, ahead: ahead.length, after: after.length, later: later.length },
  };
}

/** Who the summary goes to. */
export function buildMessages(tasks: Task[], s: Settings, opts: DigestOpts): Message[] {
  if (s.delivery_mode === "per_person") {
    const byEmail = new Map<string, Task[]>();
    for (const t of tasks) {
      const email = t.role?.member?.email || s.digest_email;
      if (!email) continue;
      byEmail.set(email, [...(byEmail.get(email) ?? []), t]);
    }
    return [...byEmail.entries()].map(([email, own]) => {
      const d = buildDigest(own, opts);
      return { to: email, subject: d.subject, html: d.html };
    });
  }
  if (!s.digest_email) return [];
  const digest = buildDigest(tasks, opts);
  return [{ to: s.digest_email, subject: digest.subject, html: digest.html }];
}

// ---------------------------------------------------------------------------
// Due notices
// ---------------------------------------------------------------------------

export type NoticeKind = "soon" | "today" | "overdue";

/** Which notice a due date earns on a given day, if any. */
export function noticeKind(due: string, today: string): NoticeKind | null {
  const d = dayDiff(due, today);
  if (d === -7) return "soon";
  if (d === 0) return "today";
  if (d > 0 && d % 7 === 0) return "overdue";
  return null;
}

/** The first day on or after today that a due date earns a notice. */
export function nextNoticeDate(due: string, today: string): string {
  for (const c of [addDays(due, -7), due]) if (c >= today) return c;
  return addDays(due, 7 * Math.ceil(dayDiff(due, today) / 7));
}

function holderEmail(t: Task): string | null {
  const e = (t.role?.member?.email || "").trim();
  return e || null;
}

const NOTICE_SUBJECT: Record<NoticeKind, string> = { soon: "Due in 7 days", today: "Due today", overdue: "Overdue" };

function noticeCard(t: Task, kind: NoticeKind): string {
  const tone: ToneName = kind === "overdue" ? "overdue" : kind === "today" ? "ahead" : "after";
  const when = kind === "today" ? "Due today"
    : kind === "soon" ? "Due " + weekdayDate(t.due_date)
    : "Overdue since " + prettyDate(t.due_date);
  return card(TONE[tone].fg,
    `<div style="font-weight:bold;font-size:17px;color:#16202b">${a("task/" + t.id, escapeHtml(t.title))}</div>` +
    `<div style="margin-top:8px">${pill(when, tone)}</div>` +
    (t.role ? `<div style="color:#47576a;font-size:14px;margin-top:8px">${escapeHtml(t.role.name)}</div>` : "") +
    (t.mute_token ? `<div style="font-size:14px;margin-top:10px">${muteLink(t.mute_token, "Stop reminders for this")}</div>` : ""));
}

/**
 * The notices that go out on a day, one email per person holding the role.
 * skip(taskId, email) drops items already sent. Pure.
 */
export function buildDueNotices(
  tasks: Task[],
  today: string,
  opts: { appUrl?: string | null; skip?: (taskId: string, email: string) => boolean },
): Message[] {
  setSite(opts.appUrl);
  const byEmail = new Map<string, { name: string; items: { t: Task; kind: NoticeKind }[] }>();
  for (const t of tasks) {
    if (!t.send_reminders || !t.due_date) continue;
    const email = holderEmail(t);
    const kind = noticeKind(t.due_date, today);
    if (!email || !kind) continue;
    if (opts.skip && opts.skip(t.id, email)) continue;
    const key = email.toLowerCase();
    if (!byEmail.has(key)) byEmail.set(key, { name: t.role?.member?.name || "", items: [] });
    byEmail.get(key)!.items.push({ t, kind });
  }
  const order: Record<NoticeKind, number> = { overdue: 0, today: 1, soon: 2 };
  return [...byEmail.entries()].map(([email, g]) => {
    const items = g.items.sort((x, y) => order[x.kind] - order[y.kind] || x.t.due_date.localeCompare(y.t.due_date));
    const subject = items.length === 1
      ? `${NOTICE_SUBJECT[items[0].kind]}: ${items[0].t.title}`
      : `${items.length} board responsibilities need attention`;
    const html = wrap([
      headerHtml("Reminder", weekdayDate(today), "tasks"),
      `<div style="height:20px"></div>`,
      g.name ? `<p ${L.p}>Hi ${escapeHtml(firstName(g.name))},</p>` : "",
      ...items.map((x) => noticeCard(x.t, x.kind)),
    ]);
    const msg: Message = {
      to: email, subject, html,
      log: items.map((x) => ({ kind: "due" as const, ref_id: x.t.id })),
    };
    const only = items.length === 1 ? items[0].t.mute_token : null;
    if (only) msg.headers = unsubscribeHeaders(only);
    return msg;
  });
}

function unsubscribeHeaders(token: string): Record<string, string> {
  return { "List-Unsubscribe": `<${muteUrl(token)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" };
}

// ---------------------------------------------------------------------------
// Schedule reminders
// ---------------------------------------------------------------------------

export type ScheduleItem = { sc: Schedule; slot: Slot; person: SlotPerson };

/**
 * Who gets a schedule reminder on a day. With an hour, only schedules set to
 * that hour count. Muted people and people with no email are left out. Pure.
 */
export function scheduleItems(schedules: Schedule[], today: string, weekday: number, hour: number | null): ScheduleItem[] {
  const out: ScheduleItem[] = [];
  for (const sc of schedules) {
    if (!(sc.remind_days || []).includes(weekday)) continue;
    if (hour !== null && (sc.remind_hour ?? 7) !== hour) continue;
    for (const slot of sortedSlots(sc)) {
      if (!coveringRange(slot, today)) continue;
      for (const person of peopleOf(slot)) {
        if (person.muted || !(person.member?.email || "").trim()) continue;
        out.push({ sc, slot, person });
      }
    }
  }
  return out;
}

/** The last day of the stretch a row covers, as seen from today. */
function untilLabel(slot: Slot, today: string): string {
  const r = coveringRange(slot, today);
  if (!r) return "";
  const yearly = slot.repeats_yearly !== false;
  if (yearly && dayDiff(r.start_date, r.end_date) >= 365) return "";
  if (!yearly) return prettyDate(r.end_date);
  const e = ymdParts(r.end_date);
  return `${MONTHS[e.m - 1]} ${e.d}`;
}

export function buildScheduleReminder(item: ScheduleItem, today: string, opts: { appUrl?: string | null }): Message {
  setSite(opts.appUrl);
  const { sc, slot, person } = item;
  const name = person.member?.name || "";
  const others = peopleOf(slot).filter((p) => p.id !== person.id).map((p) => p.member?.name).filter(Boolean) as string[];
  const until = untilLabel(slot, today);
  const path = sc.id ? "schedule/" + sc.id : "schedules";
  const html = wrap([
    headerHtml("Reminder", weekdayDate(today), path),
    `<div style="height:20px"></div>`,
    name ? `<p ${L.p}>Hi ${escapeHtml(firstName(name))},</p>` : "",
    card(TONE.done.fg,
      `<div style="font-weight:bold;font-size:17px;color:#16202b">${a(path, escapeHtml(sc.name))} is yours today.</div>` +
      (until ? `<div style="color:#47576a;font-size:15px;margin-top:6px">Your turn runs through ${escapeHtml(until)}.</div>` : "") +
      (others.length ? `<div style="color:#47576a;font-size:15px;margin-top:6px">With ${escapeHtml(others.join(" and "))}.</div>` : "") +
      (slot.description ? `<div style="color:#16202b;font-size:15px;margin-top:10px">${escapeHtml(slot.description)}</div>` : "") +
      (sc.description ? `<div style="color:#16202b;font-size:15px;margin-top:10px">${escapeHtml(sc.description)}</div>` : "") +
      `<div style="font-size:14px;margin-top:12px">${muteLink(person.mute_token, "Stop these reminders")}</div>`),
  ]);
  return {
    to: (person.member?.email || "").trim(),
    subject: `${sc.name} today`,
    html,
    headers: unsubscribeHeaders(person.mute_token),
    log: [{ kind: "schedule", ref_id: person.id }],
  };
}

/** The next day, within two weeks, that someone gets a schedule reminder. */
export function nextScheduleDay(schedules: Schedule[], today: string): { day: string; items: ScheduleItem[] } | null {
  for (let i = 0; i <= 14; i++) {
    const day = addDays(today, i);
    const items = scheduleItems(schedules, day, asDate(day).getUTCDay(), null);
    if (items.length) return { day, items };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

type MailConfig = { user: string; key: string; from: string };

async function sendMail(m: Message, cfg: MailConfig): Promise<{ ok: boolean; response: unknown }> {
  const resp = await fetch(`https://api.cloudmailin.com/api/v0.1/${encodeURIComponent(cfg.user)}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: cfg.from, to: m.to, subject: m.subject,
      html: m.html, plain: toPlain(m.html), headers: m.headers,
    }),
  });
  const response = await resp.json().catch(() => ({}));
  return { ok: resp.ok, response };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

/** The role claim of a JWT. The gateway has already checked its signature. */
function jwtRole(token: string): string | null {
  try {
    const part = token.split(".")[1];
    const pad = part.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((part.length + 3) % 4);
    return JSON.parse(atob(pad)).role ?? null;
  } catch { return null; }
}

/**
 * Previews and Send now show board data, so they need the service key, which
 * only the Access protected proxy has. Until lockdown.sql has run, the anon
 * key reads everything anyway, so a preview gives nothing away.
 */
async function mayPreview(req: Request): Promise<boolean> {
  const bearer = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (bearer && (bearer === service || jwtRole(bearer) === "service_role")) return true;
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!anon) return false;
  try {
    const r = await fetch(Deno.env.get("SUPABASE_URL") + "/rest/v1/reminder_settings?select=id&limit=1",
      { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
    const rows = r.ok ? await r.json() : [];
    return Array.isArray(rows) && rows.length > 0;
  } catch { return false; }
}

const TASK_SELECT = "id,title,due_date,send_reminders,mute_token,role:board_roles(name,member:board_members(id,name,email))";
const SCHEDULE_SELECT = "id,name,description,position,remind_days,remind_hour," +
  "schedule_slots(id,label,responsible,description,repeats_yearly,position," +
  "schedule_slot_ranges(start_date,end_date,position)," +
  "schedule_slot_people(id,muted,mute_token,position,member:board_members(id,name,email)))";

if (import.meta.main) {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
    try {
      const url = new URL(req.url);
      const dry = url.searchParams.get("dry") === "1";
      const force = url.searchParams.get("force") === "1";
      const kind = url.searchParams.get("kind") || "summary";

      if ((dry || force) && !(await mayPreview(req))) {
        return json({ error: "Previews need the board login. Open the site at its Cloudflare Access address." }, 403);
      }

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );

      const { data: row, error: sErr } = await supabase
        .from("reminder_settings").select("*").eq("id", 1).single();
      if (sErr) throw sErr;
      const settings = row as Settings;

      const local = localParts(new Date());
      const today = local.ymd;
      const now = asDate(today);
      const appUrl = Deno.env.get("APP_URL") ?? null;

      const { data: tdata, error: tErr } = await supabase
        .from("responsibilities")
        .select(TASK_SELECT)
        // in_progress is a retired value that still counts as active.
        .in("status", ["open", "in_progress"])
        .not("due_date", "is", null)
        .order("due_date");
      if (tErr) throw tErr;
      const tasks = (tdata ?? []) as unknown as Task[];

      // Not fatal. The summary still goes out without the rotation table.
      const { data: sched } = await supabase.from("schedules").select(SCHEDULE_SELECT);
      const schedules = (sched ?? []) as unknown as Schedule[];

      const { laterEnd } = coveredMonths(now);
      const summaryTasks = tasks.filter((t) => t.due_date <= iso(laterEnd));
      const digestOpts = { now, appUrl, schedules };

      // ---------- previews ----------
      if (dry) {
        let messages: Message[] = [];
        let note = "";
        if (kind === "due") {
          messages = buildDueNotices(tasks, today, { appUrl });
          if (!messages.length) {
            const next = tasks.filter((t) => t.send_reminders && holderEmail(t))
              .map((t) => nextNoticeDate(t.due_date, today)).sort()[0];
            if (next) {
              messages = buildDueNotices(tasks, next, { appUrl });
              note = `Nothing goes out today. The next notice goes out ${prettyDate(next)}.`;
            } else {
              note = "No active responsibility sends reminders and has a role holder with an email.";
            }
          }
        } else if (kind === "schedule") {
          const items = scheduleItems(schedules, today, local.weekday, null);
          let day = today;
          let found = items;
          if (!items.length) {
            const next = nextScheduleDay(schedules, today);
            if (next) { day = next.day; found = next.items; note = `Nothing goes out today. The next reminder goes out ${prettyDate(day)}.`; }
            else note = "No schedule reminder goes out in the next two weeks.";
          }
          messages = found.map((it) => buildScheduleReminder(it, day, { appUrl }));
        } else {
          messages = buildMessages(summaryTasks, settings, digestOpts);
          if (!messages.length) {
            const d = buildDigest(summaryTasks, digestOpts);
            messages = [{ to: "no address set", subject: d.subject, html: d.html }];
          }
        }
        return json({
          preview: true,
          kind,
          note,
          wouldSend: messages.length,
          recipients: messages.map((m) => ({ to: m.to, subject: m.subject })),
          subject: messages[0]?.subject ?? "",
          html: messages[0]?.html ?? "",
        });
      }

      const user = Deno.env.get("CLOUDMAILIN_USERNAME");
      const key = Deno.env.get("CLOUDMAILIN_API_KEY");
      if (!user || !key) return json({ error: "CLOUDMAILIN_USERNAME and CLOUDMAILIN_API_KEY must both be set" }, 500);
      const cfg = { user, key, from: Deno.env.get("FROM_EMAIL") ?? DEFAULT_FROM };

      const results: Record<string, unknown>[] = [];
      let ok = 0;
      async function deliver(m: Message) {
        const r = await sendMail(m, cfg);
        results.push({ to: m.to, subject: m.subject, ok: r.ok, response: r.response });
        if (!r.ok) return false;
        ok++;
        if (m.log?.length) {
          await supabase.from("notifications_sent").upsert(
            m.log.map((l) => ({ ...l, recipient: m.to.toLowerCase(), sent_on: today })),
            { onConflict: "kind,ref_id,recipient,sent_on", ignoreDuplicates: true },
          );
        }
        return true;
      }

      // ---------- monthly summary ----------
      const summaryDue = force || (settings.reminders_enabled && local.hour === SUMMARY_HOUR &&
        isSendDay(settings, now) && !alreadySentToday(settings, today));
      if (summaryDue) {
        const messages = buildMessages(summaryTasks, settings, digestOpts);
        let any = false;
        for (const m of messages) any = (await deliver(m)) || any;
        if (any) {
          await supabase.from("reminder_settings")
            .update({ last_sent_at: new Date().toISOString() }).eq("id", 1);
        }
        if (force) {
          return json({ test: true, sent: ok, results, skipped: messages.length ? undefined : "No recipient is set on the Notifications tab." });
        }
      }

      // Notices and schedule reminders already sent today.
      const { data: logged } = await supabase.from("notifications_sent")
        .select("kind,ref_id,recipient").eq("sent_on", today);
      const sent = new Set((logged ?? []).map((l: { kind: string; ref_id: string; recipient: string }) =>
        `${l.kind}:${l.ref_id}:${l.recipient}`));

      // ---------- due notices ----------
      if (settings.due_notices_enabled && local.hour === NOTICE_HOUR) {
        const messages = buildDueNotices(tasks, today, {
          appUrl,
          skip: (id, email) => sent.has(`due:${id}:${email.toLowerCase()}`),
        });
        for (const m of messages) await deliver(m);
      }

      // ---------- schedule reminders ----------
      if (settings.schedule_reminders_enabled) {
        const items = scheduleItems(schedules, today, local.weekday, local.hour)
          .filter((it) => !sent.has(`schedule:${it.person.id}:${(it.person.member?.email || "").trim().toLowerCase()}`));
        for (const it of items) await deliver(buildScheduleReminder(it, today, { appUrl }));
      }

      return json({ hour: local.hour, day: today, sent: ok, results });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  });
}
