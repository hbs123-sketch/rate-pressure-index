export const FACTORS = [
  ["grid_constraint_score", "Grid constraint"],
  ["tariff_protection_score", "Tariff protection"],
  ["buildout_scale_score", "Buildout scale"],
  ["rate_case_score", "Rate case"],
  ["rate_trend_score", "Rate trend"]
];

export const WEIGHTS = {
  grid_constraint_score: 0.25,
  tariff_protection_score: 0.25,
  buildout_scale_score: 0.2,
  rate_case_score: 0.2,
  rate_trend_score: 0.1
};

export function computeComposite(utility) {
  const raw = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + Number(utility[key]) * weight;
  }, 0);
  return Math.round(raw);
}

export function bandForScore(score) {
  if (score <= 30) return "Low";
  if (score <= 55) return "Moderate";
  if (score <= 75) return "Elevated";
  return "High";
}

export function normalizeZip(value) {
  const zip = String(value || "").trim();
  return /^\d{5}$/.test(zip) ? zip : "";
}

export function zipInputError(value) {
  const zip = String(value || "").trim();
  if (!zip) return "Enter a five-digit ZIP code.";
  if (!/^\d+$/.test(zip)) return "Enter a five-digit ZIP code using numbers only.";
  if (zip.length !== 5) return "Enter exactly five digits for the ZIP code.";
  return "";
}
