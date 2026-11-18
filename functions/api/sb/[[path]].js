// 372 12th board tracker. The site's way into Supabase once logins are on.
//
// The site sends its Supabase requests here instead of to supabase.co. This
// checks the Cloudflare Access login, then forwards the request with the
// service key, which only this function knows. That lets supabase/lockdown.sql
// close the database to the anon key without breaking the site.
//
// Only the database, storage and the email function are reachable.
//
// Environment variables, set on the Pages project:
//   SUPABASE_URL                for example https://abcdefgh.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY   the service_role key. Keep it secret.
//   ACCESS_TEAM_DOMAIN, ACCESS_AUD   see _access.js

import { checkAccess } from "../../_access.js";

const ALLOWED = [/^\/rest\/v1\//, /^\/storage\/v1\//, /^\/functions\/v1\/send-reminders$/];

// Never forwarded: the browser's own credentials and Cloudflare's headers.
const DROP = new Set(["host", "cookie", "authorization", "apikey", "content-length",
  "x-forwarded-for", "x-forwarded-proto", "x-real-ip"]);

function text(status, body) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function onRequest({ request, env, params }) {
  const base = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) return text(503, "The proxy is not set up. See README.md, Logins.");

  const access = await checkAccess(request, env);
  if (!access.user) return text(403, "Sign in through Cloudflare Access. " + access.reason);

  const path = [].concat(params.path || []).join("/");
  if (/(^|\/)\.\.?(\/|$)|\\|%2e|%2f|%5c/i.test(path)) return text(404, "Not found.");
  const target = new URL(base + "/" + path + new URL(request.url).search);
  if (target.origin !== new URL(base).origin || !ALLOWED.some((r) => r.test(target.pathname))) {
    return text(404, "Not found.");
  }

  const headers = new Headers();
  for (const [k, v] of request.headers) {
    const name = k.toLowerCase();
    if (!DROP.has(name) && !name.startsWith("cf-")) headers.set(k, v);
  }
  headers.set("apikey", key);
  headers.set("Authorization", "Bearer " + key);

  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();

  const resp = await fetch(target.toString(), init);
  const out = new Headers(resp.headers);
  out.delete("set-cookie");
  out.set("Cache-Control", "no-store");
  return new Response(resp.body, { status: resp.status, headers: out });
}
