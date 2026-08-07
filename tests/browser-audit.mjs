import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import utilities from "../data/utilities.json" with { type: "json" };
import recommendations from "../data/recommendations.json" with { type: "json" };
import zipToUtility from "../data/zip-to-utility.json" with { type: "json" };
import { FACTORS, bandForScore, computeComposite } from "../src/scoring.js";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const screenshotDir = process.env.AUDIT_SCREENSHOT_DIR || "screenshots/audit";
const screenshotPrefix = process.env.AUDIT_SCREENSHOT_PREFIX || "before";

const cases = [
  { zip: "20147", utilityName: "Dominion Energy Virginia" },
  { zip: "43215", utilityName: "AEP Ohio" },
  { zip: "30303", utilityName: "Georgia Power" }
];

const utilitiesByName = new Map(utilities.map((utility) => [utility.utility_name, utility]));

await mkdir(screenshotDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 1200 } });
await context.route("https://api.zippopotam.us/us/**", async (route) => {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ "post code": "90210", country: "United States", places: [] })
  });
});
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseUrl).origin });
const page = await context.newPage();
const mobileContext = await browser.newContext({ viewport: { width: 390, height: 1200 }, deviceScaleFactor: 1 });
const mobilePage = await mobileContext.newPage();
await page.addInitScript(() => {
  window.__recommendationBeacons = [];
  navigator.sendBeacon = (url) => {
    window.__recommendationBeacons.push(url);
    return true;
  };
});

const manualRows = [];

for (const testCase of cases) {
  const utility = utilitiesByName.get(testCase.utilityName);
  assert.ok(utility, `${testCase.utilityName} utility row exists`);

  const manual =
    utility.grid_constraint_score * 0.25 +
    utility.tariff_protection_score * 0.25 +
    utility.buildout_scale_score * 0.2 +
    utility.rate_case_score * 0.2 +
    utility.rate_trend_score * 0.1;
  const rounded = Math.round(manual);
  const codeScore = computeComposite(utility);

  assert.equal(rounded, utility.composite_score, `${utility.utility_name} stored composite`);
  assert.equal(codeScore, utility.composite_score, `${utility.utility_name} scoring.js composite`);
  assert.equal(bandForScore(utility.composite_score), utility.band, `${utility.utility_name} band`);

  await page.goto(`${baseUrl}/index.html?zip=${testCase.zip}&audit=${Date.now()}`, { waitUntil: "networkidle" });
  let body = await page.locator("body").innerText();

  assert.ok(body.includes(utility.utility_name), `${utility.utility_name} renders utility name`);
  assert.equal(await page.locator("#infrastructure-flow").isHidden(), true, `${utility.utility_name} hides the landing infrastructure flow`);
  assert.ok(body.includes(String(utility.composite_score)), `${utility.utility_name} renders score`);
  assert.ok(body.includes(utility.band), `${utility.utility_name} renders band`);
  assert.equal(await page.locator(".score-meaning").count(), 0, `${utility.utility_name} removes redundant score explanation`);
  assert.equal(body.includes("indicator built from public data, not a determination of cause"), false, `${utility.utility_name} keeps causal framing off the result page`);
  assert.ok(body.toLowerCase().includes("bill impact estimate"), `${utility.utility_name} renders bill impact estimate`);
  assert.ok(body.includes("Based on this utility's published rate information"), `${utility.utility_name} explains its usage scaling`);
  assert.ok(body.includes(utility.usage_scaling.display_context.text), `${utility.utility_name} renders plain-language impact timing`);
  if (utility.usage_scaling.display_context.score_context) {
    assert.ok(body.includes(utility.usage_scaling.display_context.score_context), `${utility.utility_name} resolves the relationship between its bill figure and Evidence Index`);
  }
  assert.equal(await page.locator(".hero-impact strong").count(), 1, `${utility.utility_name} promotes the published household impact`);
  assert.equal(await page.locator(".score-box .score").count(), 1, `${utility.utility_name} keeps the score visible as secondary context`);
  assert.equal(await page.locator(".evidence-panel[open]").count(), 0, `${utility.utility_name} evidence starts collapsed`);
  assert.ok(body.includes("See the evidence behind this score"), `${utility.utility_name} renders evidence expander`);
  assert.ok(body.includes(utility.whats_changed.text), `${utility.utility_name} renders whats_changed text`);
  assert.equal(await page.locator(".updated-footer").count(), 1, `${utility.utility_name} renders a low-emphasis updated footer`);
  assert.equal(body.toLowerCase().includes("cited"), false, `${utility.utility_name} removes cited from visitor-facing copy`);
  assert.equal(await page.locator(".metadata-footer").count(), 0, `${utility.utility_name} no longer renders a metadata footer`);
  const shareButton = page.locator(".share-button");
  const expectedShareUrl = new URL(utility.share_card.share_url, page.url()).href;
  assert.equal(await shareButton.count(), 1, `${utility.utility_name} renders one share button`);
  assert.equal(await shareButton.getAttribute("data-share-url"), expectedShareUrl, `${utility.utility_name} uses its OG share URL`);
  await shareButton.click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), expectedShareUrl, `${utility.utility_name} copies its OG share URL`);
  assert.equal(await page.locator(".share-status").innerText(), "Share link copied.", `${utility.utility_name} confirms share-link copy`);
  await page.waitForTimeout(1850);
  const expectedRecommendations = recommendationItemsForState(utility.state);
  assert.ok(expectedRecommendations.length <= 3, `${utility.utility_name} has at most three recommendations`);
  assert.equal(await page.locator(".recommendation-item").count(), expectedRecommendations.length, `${utility.utility_name} renders eligible recommendations`);
  assert.ok(body.includes(recommendations.disclosure), `${utility.utility_name} renders persistent recommendation disclosure`);
  for (const [categoryId, category] of expectedRecommendations) {
    assert.ok(body.includes(category.title), `${utility.utility_name} renders ${categoryId}`);
    const button = page.locator(`[data-recommendation-category="${categoryId}"]`);
    const href = await button.getAttribute("href");
    assert.ok(href.includes("account_id=YOUR_"), `${utility.utility_name} ${categoryId} keeps account placeholder`);
    for (const [key, value] of [["utm_source", "rate_pressure_index"], ["utm_medium", "referral"], ["utm_campaign", categoryId]]) {
      assert.equal(new URL(href).searchParams.get(key), value, `${utility.utility_name} ${categoryId} ${key}`);
    }
  }
  const firstRecommendation = page.locator(".recommendation-button").first();
  await firstRecommendation.evaluate((link) => {
    link.removeAttribute("href");
    link.click();
  });
  assert.deepEqual(await page.evaluate(() => window.__recommendationBeacons), ["api/recommendation-click"], `${utility.utility_name} sends privacy-safe recommendation beacon`);
  await page.locator(".usage-controls input[value=\"high\"]").evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const highImpact = await page.locator("[data-usage-output]").innerText();
  assert.ok(highImpact.includes(formatMonthlyImpact(utility.usage_scaling.base_monthly_dollars * 1.3)), `${utility.utility_name} high usage estimate`);
  await page.locator(".usage-controls input[value=\"low\"]").evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const lowImpact = await page.locator("[data-usage-output]").innerText();
  assert.ok(lowImpact.includes(formatMonthlyImpact(utility.usage_scaling.base_monthly_dollars * 0.7)), `${utility.utility_name} low usage estimate`);
  await page.locator(".usage-controls input[value=\"average\"]").evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const reportForm = page.locator("[data-personal-report-form]");
  assert.equal(await reportForm.count(), 1, `${utility.utility_name} renders personalized report intake`);
  assert.equal(await reportForm.locator(".rate-class-field").count(), utility.utility_id === "14006" ? 1 : 0, `${utility.utility_name} asks a rate-class question only when relevant`);
  assert.equal(await reportForm.locator(".guided-usage-fields").isHidden(), true, `${utility.utility_name} starts report intake with exact usage`);
  await reportForm.locator("input[name=\"exact-usage\"]").fill("1400");
  if (utility.utility_id === "14006") await reportForm.locator("select[name=\"rate-class\"]").selectOption("sso");
  await reportForm.locator("button[type=\"submit\"]").click();
  await page.waitForURL(new RegExp(`report(?:\\.html)?\\?utility=${utility.utility_id}`));
  const reportBody = await page.locator("body").innerText();
  assert.ok(reportBody.toLowerCase().includes("personalized deep dive"), `${utility.utility_name} opens report view`);
  assert.ok(reportBody.includes("1,400 kWh"), `${utility.utility_name} report includes exact usage`);
  assert.ok(reportBody.includes("What is driving this report"), `${utility.utility_name} report explains drivers`);
  assert.ok(reportBody.includes(utility.grid_constraint_note), `${utility.utility_name} report retains sourced factor notes`);
  const expectedPersonalImpact = `$${Math.abs(utility.usage_scaling.base_usage_kwh
    ? utility.usage_scaling.base_monthly_dollars * 1.4
    : utility.usage_scaling.base_monthly_dollars).toFixed(2)}/mo`;
  assert.ok(reportBody.includes(expectedPersonalImpact), `${utility.utility_name} report renders personalized impact`);
  if (utility.usage_scaling.base_usage_kwh) {
    assert.ok(
      reportBody.includes("This is a proportional estimate from one published usage case, not a rate published for your specific usage level."),
      `${utility.utility_name} report discloses its single-case scaling limitation`
    );
    assert.ok(
      reportBody.includes("Actual bills may not scale perfectly linearly with usage because of tiered rates, fixed charges, and other factors."),
      `${utility.utility_name} report discloses non-linear bill factors`
    );
  }
  await page.screenshot({ path: `${screenshotDir}/${screenshotPrefix}-report-${testCase.zip}.png`, fullPage: true });
  await page.goBack({ waitUntil: "networkidle" });

  await reportForm.locator("input[value=\"guided\"]").check();
  assert.equal(await reportForm.locator(".guided-usage-fields").isHidden(), false, `${utility.utility_name} opens guided usage intake`);
  await reportForm.locator("input[value=\"exact\"]").check();

  await page.locator(".evidence-panel summary").click();
  await page.screenshot({ path: `${screenshotDir}/${screenshotPrefix}-${testCase.zip}-evidence.png`, fullPage: true });
  body = await page.locator("body").innerText();
  assert.ok(body.toLowerCase().includes("by the numbers"), `${utility.utility_name} renders by-the-numbers panel`);
  assert.ok(body.includes(utility.rate_trend_comparison.utility_value), `${utility.utility_name} renders utility baseline comparison`);
  assert.ok(body.includes(utility.rate_trend_comparison.national_value), `${utility.utility_name} renders national baseline comparison`);
  assert.ok(body.includes("Regulatory status"), `${utility.utility_name} renders regulatory status in evidence`);
  assert.ok(body.includes(utility.last_updated), `${utility.utility_name} renders last_updated in its footer`);
  assert.ok(body.includes(formatStatus(utility.tariff_status)), `${utility.utility_name} renders tariff status in evidence`);
  assert.ok(body.includes(utility.historical_rate_series.title), `${utility.utility_name} renders EIA historical chart`);
  for (const point of utility.historical_rate_series.values) {
    assert.ok(body.includes(point.value.toFixed(2)), `${utility.utility_name} renders EIA point for ${point.year}`);
  }

  for (const [scoreKey] of FACTORS) {
    const noteKey = scoreKey.replace("_score", "_note");
    assert.ok(body.includes(utility[noteKey]), `${utility.utility_name} renders ${noteKey}`);
    assert.ok(body.includes(`Evidence score ${utility[scoreKey]}/100`), `${utility.utility_name} renders secondary ${scoreKey}`);
  }

  const expectedUrls = allSourceUrls(utility).sort();
  const renderedUrls = await page.locator(".result-panel a[href^=\"http\"]:not([data-recommendation-category])").evaluateAll((links) =>
    [...new Set(links.map((link) => link.href))].sort()
  );
  assert.deepEqual(renderedUrls, expectedUrls, `${utility.utility_name} rendered source URLs`);

  await page.locator(".evidence-panel summary").click();
  await page.screenshot({ path: `${screenshotDir}/${screenshotPrefix}-${testCase.zip}.png`, fullPage: true });
  manualRows.push(`${utility.utility_name}: raw=${manual.toFixed(2)}, rounded=${rounded}, code=${codeScore}, rendered=${utility.composite_score}, band=${utility.band}`);
}

await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
assert.equal(await page.locator(".coverage-line").count(), 1, "landing page renders the pilot-coverage statement");
assert.equal(await page.locator("#infrastructure-flow .flow-step").count(), 4, "landing page renders four infrastructure-flow steps");
assert.ok((await page.locator("h1").innerText()).length < 40, "landing page uses a concise headline");
assert.equal((await page.locator("body").innerText()).includes("Pilot lookup"), false, "landing page removes pilot lookup label");
assert.equal((await page.locator("body").innerText()).includes("Every number sourced and linked. Not affiliated with any utility."), false, "landing page removes trust statement from hero");
assert.equal(await page.locator(".logo-mark").count(), 1, "landing page renders the index logo mark");
assert.equal(await page.locator(".network-motif span").count(), 5, "landing page renders network visual");

for (const [score, expected] of [
  [30, "Low"],
  [31, "Moderate"],
  [55, "Moderate"],
  [56, "Elevated"],
  [75, "Elevated"],
  [76, "High"]
]) {
  assert.equal(bandForScore(score), expected, `band boundary ${score}`);
}

await page.goto(`${baseUrl}/index.html?zip=90210&audit=${Date.now()}`, { waitUntil: "networkidle" });
const notCoveredBody = await page.locator("body").innerText();
assert.ok(notCoveredBody.includes("Not covered yet"), "90210 renders not-covered state");
assert.equal(await page.locator(".score-box").count(), 0, "90210 does not render score box");
assert.equal(await page.locator(".factor-card").count(), 0, "90210 does not render factor cards");
assert.equal(await page.locator(".recommendations-panel").count(), 0, "90210 does not render recommendations");
assert.equal(zipToUtility["90210"], undefined, "90210 has no lookup entry");
await page.screenshot({ path: `${screenshotDir}/${screenshotPrefix}-90210.png`, fullPage: true });

await page.goto(`${baseUrl}/methodology.html`, { waitUntil: "networkidle" });
assert.ok((await page.locator("body").innerText()).includes("Limitations"), "methodology renders limitations");
assert.equal(await page.locator(".recommendations-panel").count(), 0, "methodology does not render recommendations");
await page.screenshot({ path: `${screenshotDir}/${screenshotPrefix}-methodology.png`, fullPage: true });

for (const utility of utilities) {
  await page.goto(`${baseUrl}/${utility.share_card.share_url}`, { waitUntil: "networkidle" });
  assert.equal(await page.locator(".recommendations-panel").count(), 0, `${utility.utility_name} share page does not render recommendations`);
}

for (const testCase of cases) {
  await mobilePage.goto(`${baseUrl}/index.html?zip=${testCase.zip}&audit=${Date.now()}`, { waitUntil: "networkidle" });
  assert.ok(await mobilePage.locator(".recommendation-item").count() > 0, `${testCase.utilityName} mobile renders recommendations`);
  assert.ok(await mobilePage.locator(".recommendation-icon").count() > 0, `${testCase.utilityName} mobile renders recommendation illustrations`);
  const mobileButtonBox = await mobilePage.locator(".recommendation-button").first().boundingBox();
  assert.ok(mobileButtonBox.width >= 250, `${testCase.utilityName} mobile recommendation button has a usable full-row width`);
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${testCase.utilityName} mobile recommendation module does not overflow horizontally`);
  assert.equal(await mobilePage.locator(".evidence-panel[open] .trend-chart").count(), 0, `${testCase.utilityName} historical chart stays inside collapsed evidence on mobile`);
  const mobileEvidenceSummary = mobilePage.locator(".evidence-panel summary");
  await mobileEvidenceSummary.scrollIntoViewIfNeeded();
  await mobileEvidenceSummary.click();
  assert.equal(await mobilePage.locator(".evidence-panel[open] .trend-chart").count(), 1, `${testCase.utilityName} opens the historical chart on mobile`);
  assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${testCase.utilityName} historical chart does not overflow on mobile`);
  await mobileEvidenceSummary.click();
  await mobilePage.screenshot({ path: `${screenshotDir}/${screenshotPrefix}-mobile-${testCase.zip}.png`, fullPage: true });
}

await mobilePage.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
assert.equal(await mobilePage.locator("#infrastructure-flow .flow-step").count(), 4, "mobile landing renders four infrastructure-flow steps");
const mobileFlowColumns = await mobilePage.locator(".flow-steps").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
assert.equal(mobileFlowColumns.split(" ").length, 1, "mobile infrastructure flow stacks into one column");
assert.equal(await mobilePage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "mobile infrastructure flow does not overflow horizontally");

await browser.close();

console.log(manualRows.join("\n"));
console.log("browser audit passed");

function allSourceUrls(utility) {
  const urls = [];
  for (const [scoreKey] of FACTORS) {
    const sourceKey = scoreKey === "tariff_protection_score" ? "tariff_source_url" : scoreKey.replace("_score", "_source_url");
    const value = utility[sourceKey];
    urls.push(...(Array.isArray(value) ? value : [value]));
  }
  urls.push(...utility.by_the_numbers.map((stat) => stat.source_url));
  urls.push(utility.rate_trend_comparison.utility_source_url, utility.rate_trend_comparison.national_source_url);
  urls.push(utility.usage_scaling.source_url, utility.whats_changed.source_url);
  urls.push(...(utility.usage_scaling.display_context?.sources || []).map((source) => source.url));
  urls.push(utility.historical_rate_series.source_url);
  for (const [, category] of recommendationItemsForState(utility.state)) {
    urls.push(category.source_url || recommendations.eligibility[category.eligibility][utility.state].source_url);
  }
  return [...new Set(urls)];
}

function recommendationItemsForState(state) {
  return Object.entries(recommendations.categories)
    .filter(([, category]) => !category.eligibility || recommendations.eligibility[category.eligibility]?.[state])
    .slice(0, 3);
}

function formatStatus(status) {
  return String(status || "none").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMonthlyImpact(value) {
  const amount = Math.abs(Number(value));
  const formatted = `$${amount.toFixed(2)}/mo`;
  if (Number(value) < 0) return `Estimated benefit: ${formatted}`;
  return `Estimated impact: ${formatted}`;
}
