// 372 12th board tracker. The "stop these reminders" page.
//
// Every due notice and schedule reminder links here with a mute token. The
// page is outside Cloudflare Access, since residents have no login, so the
// token is what allows the change. It turns one thing off:
//   a responsibility's send_reminders, or
//   one person's reminders on one schedule row.
// Opening the link only shows a button, because mail scanners open links on
// their own. Mail apps that offer one click unsubscribe POST straight here.
//
// Environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, the same
// as the proxy. /mute/logo.png, a copy of apple-touch-icon.png, sits under the
// same Access bypass and is also the logo in every email.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function db(env) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "") + "/rest/v1/";
  const headers = {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY,
    "Content-Type": "application/json",
  };
  return {
    async get(path) {
      const r = await fetch(base + path, { headers });
      if (!r.ok) throw new Error("Lookup failed");
      return r.json();
    },
    async patch(path, body) {
      const r = await fetch(base + path, { method: "PATCH", headers, body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Update failed");
    },
  };
}

/** What a token switches off, with its current state. */
async function find(env, token) {
  const d = db(env);
  const t = encodeURIComponent(token);
  const tasks = await d.get("responsibilities?select=id,title,send_reminders&mute_token=eq." + t);
  if (tasks.length) {
    const x = tasks[0];
    return {
      title: x.title,
      off: !x.send_reminders,
      offText: "Reminder emails for this responsibility are off.",
      onText: "Reminder emails for this responsibility are on.",
      set: (off) => d.patch("responsibilities?id=eq." + x.id, { send_reminders: !off }),
    };
  }
  const people = await d.get("schedule_slot_people?select=id,muted,member:board_members(name)," +
    "slot:schedule_slots(schedule:schedules(name))&mute_token=eq." + t);
  if (people.length) {
    const x = people[0];
    const who = (x.member && x.member.name) || "This person";
    return {
      title: (x.slot && x.slot.schedule && x.slot.schedule.name) || "Schedule reminders",
      off: !!x.muted,
      offText: who + " no longer gets these reminders.",
      onText: who + " gets these reminders.",
      set: (off) => d.patch("schedule_slot_people?id=eq." + x.id, { muted: off }),
    };
  }
  return null;
}

function page(status, title, body) {
  return new Response(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<style>
body { margin: 0; background: #f4f6f9; color: #16202b; font: 17px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
main { max-width: 520px; margin: 48px auto; padding: 0 16px; }
.card { background: #fff; border: 1px solid #cfd8e3; border-left: 6px solid #4a2f8f; border-radius: 10px; padding: 20px 22px; }
img { display: block; border-radius: 11px; margin-bottom: 16px; }
h1 { font-size: 22px; margin: 0 0 8px; }
p { margin: 0 0 16px; color: #47576a; }
button { min-height: 44px; padding: 10px 18px; font: inherit; font-weight: 600; color: #fff; background: #4a2f8f; border: 0; border-radius: 8px; cursor: pointer; }
button:focus-visible { outline: 3px solid #16389f; outline-offset: 2px; }
</style>
</head>
<body><main><img src="/mute/logo.png" width="48" height="48" alt="372 12th"><div class="card">${body}</div></main></body>
</html>`, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

function notFound() {
  return page(404, "Link not found", "<h1>Link not found</h1><p>This link does not match anything. It may be from an item that was deleted.</p>");
}

function configured(env) { return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY; }

export async function onRequestGet({ request, env }) {
  if (!configured(env)) return page(503, "Not available", "<h1>Not available</h1><p>This page is not set up yet.</p>");
  const token = new URL(request.url).searchParams.get("t") || "";
  if (!UUID.test(token)) return notFound();
  const item = await find(env, token);
  if (!item) return notFound();
  return page(200, item.title,
    `<h1>${esc(item.title)}</h1><p>${esc(item.off ? item.offText : item.onText)}</p>` +
    `<form method="post"><input type="hidden" name="action" value="${item.off ? "on" : "off"}">` +
    `<button type="submit">${item.off ? "Turn them back on" : "Stop these emails"}</button></form>`);
}

export async function onRequestPost({ request, env }) {
  if (!configured(env)) return page(503, "Not available", "<h1>Not available</h1><p>This page is not set up yet.</p>");
  const url = new URL(request.url);
  const token = url.searchParams.get("t") || "";
  if (!UUID.test(token)) return notFound();
  const item = await find(env, token);
  if (!item) return notFound();
  const form = await request.formData().catch(() => null);
  const oneClick = form && form.get("List-Unsubscribe") === "One-Click";
  const off = oneClick || !form || form.get("action") !== "on";
  await item.set(off);
  if (oneClick) return new Response("Unsubscribed.", { status: 200 });
  return Response.redirect(url.toString(), 303);
}
