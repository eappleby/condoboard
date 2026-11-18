// 372 12th board tracker. Checks the Cloudflare Access login on a request.
//
// Access puts a signed token on every request it lets through, in the
// Cf-Access-Jwt-Assertion header. This checks the signature against the
// team's public keys and the audience against the Access application, so a
// request that skipped Access, such as one to a preview address, is refused.
//
// Environment variables, set on the Pages project:
//   ACCESS_TEAM_DOMAIN   for example yourteam.cloudflareaccess.com
//   ACCESS_AUD           the Application Audience (AUD) tag of the
//                        Access application that protects the site

let cache = { team: "", at: 0, keys: [] };

function b64urlBytes(s) {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}
function b64urlJson(s) {
  return JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
}
function cookie(request, name) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + name + "=([^;]+)"));
  return m ? m[1] : "";
}

async function keys(team, fresh) {
  if (!fresh && cache.team === team && Date.now() - cache.at < 10 * 60 * 1000) return cache.keys;
  const resp = await fetch("https://" + team + "/cdn-cgi/access/certs");
  if (!resp.ok) throw new Error("Could not fetch the Access keys");
  const body = await resp.json();
  cache = { team, at: Date.now(), keys: body.keys || [] };
  return cache.keys;
}

/**
 * Checks the request's Access token. Returns { user: { email } } when it
 * passes, or { reason } saying which check failed. The reason names the
 * configured team domain and audience, neither of which is a secret, so a
 * mismatch can be fixed from the error alone.
 */
export async function checkAccess(request, env) {
  const team = String(env.ACCESS_TEAM_DOMAIN || "").trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const aud = String(env.ACCESS_AUD || "").trim();
  if (!team || !aud) return { reason: "ACCESS_TEAM_DOMAIN or ACCESS_AUD is not set on the Pages project." };

  const token = request.headers.get("Cf-Access-Jwt-Assertion") || cookie(request, "CF_Authorization");
  const parts = token.split(".");
  if (parts.length !== 3) return { reason: "The request has no Access token." };

  let header, payload;
  try { header = b64urlJson(parts[0]); payload = b64urlJson(parts[1]); }
  catch { return { reason: "The Access token could not be read." }; }
  if (header.alg !== "RS256" || !header.kid) return { reason: "The Access token is not signed with RS256." };

  const now = Date.now() / 1000;
  if (typeof payload.exp !== "number" || payload.exp < now) return { reason: "The Access token has expired. Reload the page." };
  if (typeof payload.nbf === "number" && payload.nbf > now + 60) return { reason: "The Access token is not valid yet." };
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!auds.includes(aud)) {
    return { reason: "The token is for audience " + auds.join(", ") + ", but ACCESS_AUD is " + aud + "." };
  }
  if (payload.iss !== "https://" + team) {
    return { reason: "The token was issued by " + payload.iss + ", but ACCESS_TEAM_DOMAIN is " + team + "." };
  }

  let jwk;
  try {
    jwk = (await keys(team, false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await keys(team, true)).find((k) => k.kid === header.kid);
  } catch { return { reason: "Could not fetch the Access keys from https://" + team + "/cdn-cgi/access/certs." }; }
  if (!jwk) return { reason: "No Access key matches the token." };

  const key = await crypto.subtle.importKey(
    "jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key,
    b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  return ok ? { user: { email: String(payload.email || "") } } : { reason: "The Access token signature does not match." };
}

/** The signed in person, as { email }, or null when the request did not pass Access. */
export async function accessUser(request, env) {
  return (await checkAccess(request, env)).user || null;
}
