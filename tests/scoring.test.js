import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { bandForScore, computeComposite, normalizeZip, zipInputError } from "../src/scoring.js";
import { resolveZipCoverage } from "../src/zip-lookup.js";

const utilities = JSON.parse(await readFile(new URL("../data/utilities.json", import.meta.url), "utf8"));
const zipToUtility = JSON.parse(await readFile(new URL("../data/zip-to-utility.json", import.meta.url), "utf8"));

for (const utility of utilities) {
  assert.equal(computeComposite(utility), utility.composite_score, `${utility.utility_name} composite`);
  assert.equal(bandForScore(utility.composite_score), utility.band, `${utility.utility_name} band`);
  for (const [key] of [
    ["grid_constraint_score"],
    ["tariff_protection_score"],
    ["buildout_scale_score"],
    ["rate_case_score"],
    ["rate_trend_score"]
  ]) {
    const sourceKey = key === "tariff_protection_score" ? "tariff_source_url" : key.replace("_score", "_source_url");
    const urls = Array.isArray(utility[sourceKey]) ? utility[sourceKey] : [utility[sourceKey]];
    assert.ok(urls.every((url) => /^https:\/\//.test(url)), `${utility.utility_name} ${sourceKey}`);
  }
}

assert.equal(zipToUtility["20147"], "19876");
assert.equal(zipToUtility["43215"], "14006");
assert.equal(zipToUtility["30303"], "7140");
assert.equal(zipToUtility["90210"], undefined);

assert.equal(normalizeZip("ZIP 20147"), "");
assert.equal(normalizeZip("20147"), "20147");
assert.equal(normalizeZip("abc"), "");
assert.equal(zipInputError("abcd"), "Enter a five-digit ZIP code using numbers only.");
assert.equal(zipInputError("2014"), "Enter exactly five digits for the ZIP code.");
assert.equal(zipInputError("201470"), "Enter exactly five digits for the ZIP code.");

const testUtilities = new Map([["one", { utility_name: "One" }], ["two", { utility_name: "Two" }]]);
assert.equal(resolveZipCoverage({ "11111": "one" }, testUtilities, "11111").type, "single");
const ambiguousCoverage = resolveZipCoverage({ "22222": ["one", "two"] }, testUtilities, "22222");
assert.equal(ambiguousCoverage.type, "ambiguous");
assert.deepEqual(ambiguousCoverage.utilities.map((utility) => utility.utility_name), ["One", "Two"]);

console.log("scoring and lookup tests passed");
