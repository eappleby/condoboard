// Condo Board — reminder emailer (Supabase Edge Function).
//
// Runs daily (scheduled by supabase/reminders-cron.sql). Finds responsibilities
// that are overdue or due within REMIND_DAYS_AHEAD days, groups them by the
// assigned board member, and emails each person their list via Resend.
// Unassigned items are sent to FALLBACK_EMAIL, if set.
//
// To avoid daily nagging, an item is only re-included after
// REMIND_COOLDOWN_DAYS have passed since its last reminder.
//
// Required secrets (Edge Functions -> send-reminders -> Secrets, or
// `supabase secrets set`):
//   RESEND_API_KEY   — from https://resend.com (free tier)
//   FROM_EMAIL       — verified sender, e.g. "Condo Board <board@yourdomain.com>"
//                      (or "onboarding@resend.dev" while testing)
//   FALLBACK_EMAIL   — optional; where unassigned-item reminders go
//   APP_URL          — optional; the site URL to link in the email
//
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided automatically.

import { createClient } from "npm:@supabase/supabase-js@2";

const REMIND_DAYS_AHEAD = 7;
const REMIND_COOLDOWN_DAYS = 3;

type Task = {
  id: string;
  title: string;
  due_date: string;
  priority: string;
  category: string;
  last_reminded_at: string | null;
  assignee: { name: string; email: string | null } | null;
};

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      return json({ error: "RESEND_API_KEY is not set" }, 500);
    }
    const fromEmail = Deno.env.get("FROM_EMAIL") ?? "Condo Board <onboarding@resend.dev>";
    const fallbackEmail = Deno.env.get("FALLBACK_EMAIL") ?? null;
    const appUrl = Deno.env.get("APP_URL") ?? null;

    const horizon = new Date();
    horizon.setDate(horizon.getDate() + REMIND_DAYS_AHEAD);
    const horizonStr = horizon.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from("responsibilities")
      .select("id,title,due_date,priority,category,last_reminded_at,assignee:board_members(name,email)")
      .neq("status", "done")
      .not("due_date", "is", null)
      .lte("due_date", horizonStr)
      .order("due_date");
    if (error) throw error;

    const cooldownCutoff = Date.now() - REMIND_COOLDOWN_DAYS * 86400_000;
    const due = ((data ?? []) as unknown as Task[]).filter(
      (t) => !t.last_reminded_at || new Date(t.last_reminded_at).getTime() < cooldownCutoff,
    );

    // Group by recipient email.
    const byEmail = new Map<string, { name: string; tasks: Task[] }>();
    for (const t of due) {
      const email = t.assignee?.email || fallbackEmail;
      if (!email) continue; // no one to notify
      const entry = byEmail.get(email) ?? { name: t.assignee?.name ?? "Board", tasks: [] };
      entry.tasks.push(t);
      byEmail.set(email, entry);
    }

    const results: Record<string, unknown>[] = [];
    const remindedIds: string[] = [];

    for (const [email, { name, tasks }] of byEmail) {
      const today = new Date().toISOString().slice(0, 10);
      const line = (t: Task) => {
        const overdue = t.due_date < today;
        const when = overdue ? `OVERDUE (was due ${t.due_date})` : `due ${t.due_date}`;
        return `<li style="margin:6px 0"><strong>${escapeHtml(t.title)}</strong> — ${when}${
          t.priority === "high" ? " · high priority" : ""}</li>`;
      };
      const html = `
        <div style="font-family:sans-serif;font-size:15px;color:#1c2733;line-height:1.5">
          <p>Hi ${escapeHtml(name)},</p>
          <p>These board responsibilities are due soon or overdue:</p>
          <ul>${tasks.map(line).join("")}</ul>
          ${appUrl ? `<p><a href="${appUrl}">Open the board tracker</a> to see details or mark items done.</p>` : ""}
          <p style="color:#8a97a5;font-size:13px">— Condo Board reminders (sent automatically)</p>
        </div>`;

      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [email],
          subject: `Condo board: ${tasks.length} item${tasks.length === 1 ? "" : "s"} due soon`,
          html,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      results.push({ email, count: tasks.length, ok: resp.ok, body });
      if (resp.ok) remindedIds.push(...tasks.map((t) => t.id));
    }

    if (remindedIds.length) {
      await supabase
        .from("responsibilities")
        .update({ last_reminded_at: new Date().toISOString() })
        .in("id", remindedIds);
    }

    return json({ checked: due.length, emails: results });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
