const ALLOWED_CATEGORIES = new Set(["supplier_comparison", "community_solar", "rooftop_solar", "battery_backup"]);
const ALLOWED_UTILITIES = new Set(["Dominion Energy Virginia", "AEP Ohio", "Georgia Power"]);

export default function handler(request, response) {
  if (request.method !== "POST") {
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

  // Intentionally omit ZIP codes, identifiers, and other visitor data.
  console.log(JSON.stringify({ event: "recommendation_click", category, utility }));
  response.status(204).end();
}

function parseBody(body) {
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}
