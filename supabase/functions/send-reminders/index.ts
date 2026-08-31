// 372 12th board tracker. Reminder emailer, a Supabase Edge Function.
//
// Runs once a day, scheduled by supabase/reminders-cron.sql. It finds
// responsibilities that are overdue or due within REMIND_DAYS_AHEAD days and
// emails a reminder through Resend.
//
// There are two modes:
//
//   Digest mode (set DIGEST_TO)
//     One email listing everything due, grouped by who is responsible, sent
//     to a single address. Use this when you do not own a domain, because
//     Resend's shared onboarding@resend.dev sender can only deliver to the
//     address the Resend account was created with.
//
//   Per person mode (leave DIGEST_TO unset)
//     Each board member gets only their own items. This needs a verified
//     domain in Resend, since the mail goes to many different addresses.
//
// An item is not mentioned again for REMIND_COOLDOWN_DAYS, so a long running
// task does not generate a message every morning.
//
// Secrets, set with `supabase secrets set`:
//   RESEND_API_KEY   required, from https://resend.com
//   FROM_EMAIL       sender. Defaults to the Resend testing sender.
//   DIGEST_TO        optional. Turns on digest mode and names the recipient.
//   FALLBACK_EMAIL   optional, per person mode only. Where unassigned items go.
//   APP_URL          optional. Linked at the bottom of the email.
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

export const REMIND_DAYS_AHEAD = 7;
export const REMIND_COOLDOWN_DAYS = 3;

export type Task = {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  category: string;
  last_reminded_at: string | null;
  assignee: { name: string; email: string | null } | null;
};

export type Message = { to: string; subject: string; html: string; taskIds: string[] };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function dueLabel(t: Task, today: string): string {
  if (t.due_date < today) {
    const days = Math.round(
      (new Date(today).getTime() - new Date(t.due_date).getTime()) / 86400000,
    );
    const years = Math.floor(days / 365);
    const how = years >= 1
      ? `overdue by ${years} ${years === 1 ? "year" : "years"}`
      : `overdue by ${days} ${days === 1 ? "day" : "days"}`;
    return `${how}, was due ${t.due_date}`;
  }
  if (t.due_date === today) return "due today";
  return `due ${t.due_date}`;
}

function itemLine(t: Task, today: string): string {
  const high = t.priority === "high" ? ", high priority" : "";
  return `<li style="margin:8px 0">${escapeHtml(t.title)} (${dueLabel(t, today)}${high})</li>`;
}

function wrap(body: string, appUrl: string | null): string {
  const link = appUrl
    ? `<p style="margin-top:20px"><a href="${appUrl}">Open the board tracker</a> to see the details or mark something done.</p>`
    : "";
  return `<div style="font-family:Helvetica,Arial,sans-serif;font-size:16px;color:#16202b;line-height:1.5">
${body}${link}
<p style="color:#47576a;font-size:14px;margin-top:24px">Sent automatically by the 372 12th board tracker.</p>
</div>`;
}

/**
 * Turn the due tasks into the emails that should go out. Pure function, so
 * it can be tested without touching the network.
 */
export function buildMessages(
  tasks: Task[],
  opts: { today: string; digestTo?: string | null; fallbackEmail?: string | null; appUrl?: string | null },
): Message[] {
  if (!tasks.length) return [];
  const appUrl = opts.appUrl ?? null;

  // Digest mode. One message, grouped by who is responsible.
  if (opts.digestTo) {
    const groups = new Map<string, Task[]>();
    for (const t of tasks) {
      const who = t.assignee?.name ?? "Unassigned";
      groups.set(who, [...(groups.get(who) ?? []), t]);
    }
    // Named people first, alphabetically, with unassigned items last.
    const names = [...groups.keys()].sort((a, b) => {
      if (a === "Unassigned") return 1;
      if (b === "Unassigned") return -1;
      return a.localeCompare(b);
    });
    const sections = names.map((name) => {
      const items = groups.get(name)!.map((t) => itemLine(t, opts.today)).join("");
      return `<h3 style="margin:22px 0 6px;font-size:17px">${escapeHtml(name)}</h3><ul style="margin:0;padding-left:22px">${items}</ul>`;
    }).join("");
    const body = `<p>Here is what the board has coming up or overdue.</p>${sections}`;
    return [{
      to: opts.digestTo,
      subject: `372 12th: ${tasks.length} ${tasks.length === 1 ? "item" : "items"} due soon`,
      html: wrap(body, appUrl),
      taskIds: tasks.map((t) => t.id),
    }];
  }

  // Per person mode. Each member gets only their own items.
  const byEmail = new Map<string, { name: string; tasks: Task[] }>();
  for (const t of tasks) {
    const email = t.assignee?.email || opts.fallbackEmail;
    if (!email) continue;
    const entry = byEmail.get(email) ?? { name: t.assignee?.name ?? "Board", tasks: [] };
    entry.tasks.push(t);
    byEmail.set(email, entry);
  }
  return [...byEmail.entries()].map(([email, { name, tasks: own }]) => ({
    to: email,
    subject: `372 12th: ${own.length} ${own.length === 1 ? "item" : "items"} due soon`,
    html: wrap(
      `<p>Hello ${escapeHtml(name)},</p><p>These board responsibilities are due soon or overdue.</p><ul style="margin:0;padding-left:22px">${own.map((t) => itemLine(t, opts.today)).join("")}</ul>`,
      appUrl,
    ),
    taskIds: own.map((t) => t.id),
  }));
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Only start the server when running as a function, not when imported by a test.
if (import.meta.main) {
  Deno.serve(async () => {
    try {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      if (!resendKey) return json({ error: "RESEND_API_KEY is not set" }, 500);

      const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const fromEmail = Deno.env.get("FROM_EMAIL") ?? "372 12th Board <onboarding@resend.dev>";
      const digestTo = Deno.env.get("DIGEST_TO") ?? null;
      const fallbackEmail = Deno.env.get("FALLBACK_EMAIL") ?? null;
      const appUrl = Deno.env.get("APP_URL") ?? null;

      const today = new Date().toISOString().slice(0, 10);
      const horizon = new Date();
      horizon.setDate(horizon.getDate() + REMIND_DAYS_AHEAD);

      const { data, error } = await supabase
        .from("responsibilities")
        .select("id,title,due_date,priority,category,last_reminded_at,assignee:board_members(name,email)")
        .neq("status", "done")
        .not("due_date", "is", null)
        .lte("due_date", horizon.toISOString().slice(0, 10))
        .order("due_date");
      if (error) throw error;

      const cutoff = Date.now() - REMIND_COOLDOWN_DAYS * 86400000;
      const due = ((data ?? []) as unknown as Task[]).filter(
        (t) => !t.last_reminded_at || new Date(t.last_reminded_at).getTime() < cutoff,
      );

      const messages = buildMessages(due, { today, digestTo, fallbackEmail, appUrl });
      const results: Record<string, unknown>[] = [];
      const reminded: string[] = [];

      for (const m of messages) {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: fromEmail, to: [m.to], subject: m.subject, html: m.html }),
        });
        const body = await resp.json().catch(() => ({}));
        results.push({ to: m.to, items: m.taskIds.length, ok: resp.ok, response: body });
        if (resp.ok) reminded.push(...m.taskIds);
      }

      if (reminded.length) {
        await supabase
          .from("responsibilities")
          .update({ last_reminded_at: new Date().toISOString() })
          .in("id", reminded);
      }

      return json({
        mode: digestTo ? "digest" : "per-person",
        due: due.length,
        sent: results.length,
        results,
      });
    } catch (e) {
      return json({ error: String(e) }, 500);
    }
  });
}
