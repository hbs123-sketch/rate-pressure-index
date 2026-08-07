const ALLOWED_CATEGORIES = new Set(["supplier_comparison", "community_solar", "rooftop_solar", "battery_backup"]);
const ALLOWED_UTILITIES = new Set(["Dominion Energy Virginia", "AEP Ohio", "Georgia Power"]);
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 10;
const clientWindows = new Map();

export default function handler(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    response.status(405).json({ error: "Method not allowed" });
    return;
  }

  const payload = typeof request.body === "string" ? parseBody(request.body) : request.body || {};
  const category = String(payload.category || "");
  const utility = String(payload.utility || "");

  if (!ALLOWED_CATEGORIES.has(category) || !ALLOWED_UTILITIES.has(utility)) {
    response.status(400).json({ error: "Invalid recommendation event" });
    return;
  }

  const retryAfterSeconds = rateLimitRetryAfter(request, Date.now());
  if (retryAfterSeconds !== null) {
    response.setHeader("Retry-After", String(retryAfterSeconds));
    response.status(429).json({ error: "Too many recommendation events" });
    return;
  }

  // Intentionally omit ZIP codes, identifiers, and other visitor data.
  console.log(JSON.stringify({ event: "recommendation_click", category, utility }));
  response.setHeader("Cache-Control", "no-store");
  response.status(204).end();
}

function rateLimitRetryAfter(request, now) {
  const client = clientKey(request);
  for (const [key, window] of clientWindows) {
    if (now - window.startedAt >= RATE_LIMIT_WINDOW_MS) clientWindows.delete(key);
  }

  const window = clientWindows.get(client);
  if (!window) {
    clientWindows.set(client, { startedAt: now, count: 1 });
    return null;
  }
  if (window.count >= RATE_LIMIT_MAX_EVENTS) {
    return Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - window.startedAt)) / 1000));
  }
  window.count += 1;
  return null;
}

function clientKey(request) {
  const realIp = headerValue(request.headers, "x-real-ip");
  const forwardedFor = headerValue(request.headers, "x-forwarded-for").split(",")[0].trim();
  return realIp || forwardedFor || "unknown-client";
}

function headerValue(headers, name) {
  if (!headers) return "";
  const value = headers[name] || headers[name.toLowerCase()];
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function parseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

export function resetRateLimitsForTest() {
  clientWindows.clear();
}
