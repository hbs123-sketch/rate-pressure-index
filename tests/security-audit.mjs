import assert from "node:assert/strict";
import handler, { resetRateLimitsForTest } from "../api/recommendation-click.js";

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const isProduction = new URL(baseUrl).hostname !== "127.0.0.1" && new URL(baseUrl).hostname !== "localhost";

resetRateLimitsForTest();
for (let attempt = 0; attempt < 10; attempt += 1) {
  const result = await invokeHandler({
    headers: { "x-real-ip": "198.51.100.20" },
    body: { category: "battery_backup", utility: "AEP Ohio" }
  });
  assert.equal(result.statusCode, 204, `event ${attempt + 1} stays within the per-minute limit`);
  assert.equal(result.headers["cache-control"], "no-store", "tracking response is not cached");
}
const limited = await invokeHandler({
  headers: { "x-real-ip": "198.51.100.20" },
  body: { category: "battery_backup", utility: "AEP Ohio" }
});
assert.equal(limited.statusCode, 429, "eleventh event is rate limited");
assert.ok(Number(limited.headers["retry-after"]) > 0, "rate limit supplies a retry interval");

resetRateLimitsForTest();
const invalid = await invokeHandler({ body: { category: "unknown", utility: "AEP Ohio" } });
assert.equal(invalid.statusCode, 400, "tracking endpoint rejects unexpected analytics values");
assert.equal(invalid.body, JSON.stringify({ error: "Invalid recommendation event" }), "invalid tracking response exposes no internal details");
const method = await invokeHandler({ method: "GET" });
assert.equal(method.statusCode, 405, "tracking endpoint accepts POST only");
assert.equal(method.headers.allow, "POST", "tracking endpoint advertises its allowed method");

if (isProduction) {
  const root = await fetch(baseUrl, { redirect: "manual" });
  assert.equal(root.status, 200, "production landing page responds");
  const headers = root.headers;
  assert.ok(headers.get("content-security-policy")?.includes("default-src 'self'"), "CSP is present");
  assert.equal(headers.get("x-content-type-options"), "nosniff", "nosniff header is present");
  assert.equal(headers.get("x-frame-options"), "DENY", "frame protection header is present");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin", "referrer policy is present");
  assert.equal(headers.get("cross-origin-opener-policy"), "same-origin", "cross-origin opener policy is present");
  assert.ok(headers.get("strict-transport-security")?.includes("max-age="), "HSTS is present");

  for (const path of ["/debug.log", "/data/.verify/aep-tariff.html", "/data/.cache/eia861.html", "/tests/scoring.test.js", "/scripts/verify-eia-baseline.py"]) {
    const response = await fetch(new URL(path, baseUrl), { redirect: "follow" });
    assert.equal(response.status, 404, `${path} is not publicly served`);
  }

  const invalidResponse = await fetch(new URL("/api/recommendation-click", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ category: "unknown", utility: "AEP Ohio" })
  });
  const invalidBody = await invalidResponse.text();
  assert.equal(invalidResponse.status, 400, "production endpoint rejects invalid events");
  assert.equal(invalidBody, JSON.stringify({ error: "Invalid recommendation event" }), "production endpoint does not reveal debug information");
}

console.log(`security audit passed (${isProduction ? "production" : "local"})`);

function invokeHandler({ method = "POST", headers = {}, body = {} }) {
  return new Promise((resolve) => {
    const result = { statusCode: 200, headers: {}, body: "" };
    const response = {
      setHeader(key, value) {
        result.headers[key.toLowerCase()] = value;
      },
      status(code) {
        result.statusCode = code;
        return this;
      },
      json(value) {
        result.body = JSON.stringify(value);
        resolve(result);
      },
      end() {
        resolve(result);
      }
    };
    handler({ method, headers, body }, response);
  });
}
