export function resolveZipCoverage(zipMap, utilitiesById, zip) {
  const rawCoverage = zipMap[zip];
  const utilityIds = Array.isArray(rawCoverage) ? rawCoverage : rawCoverage ? [rawCoverage] : [];
  const utilities = utilityIds.map((id) => utilitiesById.get(id)).filter(Boolean);

  if (!utilities.length) return { type: "uncovered", utilities: [] };
  if (utilities.length === 1) return { type: "single", utility: utilities[0], utilities };
  return { type: "ambiguous", utilities };
}
