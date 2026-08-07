import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import utilities from "../data/utilities.json" with { type: "json" };
import recommendations from "../data/recommendations.json" with { type: "json" };

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const execFile = promisify(execFileCallback);
const python =
  process.env.PYTHON ||
  (process.platform === "win32"
    ? "C:\\Users\\HBS12\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe"
    : "python3");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const htmlCache = new Map();

await verifyHtml("https://services.pjm.com/annualreport2025/markets/", [
  "2026/2027",
  "2027/2028",
  "tightening supply",
  "increasing demand outpacing new supply",
  "$329.17",
  "$333.44",
  "FERC-approved price cap"
]);

await verifyHtml("https://www.dominionenergy.com/virginia/rates-and-tariffs/understanding-rates?sc_lang=en", [
  "average residential bill",
  "$11.24",
  "$2.36",
  "2026",
  "2027"
]);

await verifyHtml("https://www.americanactionforum.org/insight/virginias-new-data-center-electricity-rate-class/", [
  "about 450",
  "serves about 450 data centers",
  "Dominion"
]);

await verifyHtml("https://www.scc.virginia.gov/about-the-scc/scc-facts/", [
  "January 1, 2027"
]);

await verifyHtml("https://www.aepohio.com/company/news/view?releaseID=10753", [
  "February 12, 2026",
  "5,642 megawatts",
  "12,219 MW",
  "17,861 MW",
  "paused new data center development"
]);

await verifyHtml("https://www.aepohio.com/company/about/rates/data-center-tariff/", [
  "25,000 kW",
  "Data Center Tariff",
  "load study fee",
  "Minimum Demand Charges"
]);

await verifyHtml("https://www.aepohio.com/company/news/view?releaseID=10825", [
  "1,000 kilowatt-hours",
  "$7.90",
  "$7.16",
  "$0.52",
  "$0.22"
]);

await verifyHtml("https://www.georgiapower.com/news-hub/press-releases/georgia-power-highlights-new-customer-contracts-continued-economic-growth-updated-forecasts-in-latest-filings-with-georgia-psc.html", [
  "nearly 2 gigawatts",
  "new customer contracts",
  "8,448 megawatts",
  "2030/2031",
  "upfront infrastructure payments",
  "long-term commitments",
  "financial guarantees"
]);

await verifyHtml("https://www.georgiapower.com/news-hub/press-releases/psc-approves-savings-for-customers-and-energy-demands.html", [
  "$556 million",
  "$8.50 per month",
  "typical residential customer using 1,000 kilowatt-hours",
  "excluding storm costs"
]);

await verifyHtml("https://www.georgiapower.com/news-hub/press-releases/georgia-psc-approves-plan-to-freeze-base-rates-through-2028.html", [
  "freeze Georgia Power base rates through at least 2028",
  "storm costs",
  "separate proceeding"
]);

await verifyHtml("https://www.eia.gov/electricity/data/eia861/", [
  "Sales to Ultimate Customers",
  "revenue, sales",
  "1990 to present"
]);

for (const [listName, states] of Object.entries(recommendations.eligibility)) {
  for (const [state, entry] of Object.entries(states)) {
    await verifyHtml(entry.source_url, entry.verification_terms);
    console.log(`verified ${listName} eligibility for ${state}`);
  }
}

for (const [category, entry] of Object.entries(recommendations.categories)) {
  if (entry.source_url) {
    await verifySource(entry.source_url, entry.verification_terms);
    console.log(`verified ${category} recommendation claim`);
  }
}

for (const utility of utilities) {
  assert.equal(utility.composite_score, expectedComposite(utility), `${utility.utility_name} score unchanged`);
  for (const source of utility.usage_scaling.display_context?.sources || []) {
    await verifyHtml(source.url, source.verification_terms);
    console.log(`verified ${utility.utility_name} impact timing`);
  }
}

const historicalVerification = await execFile(python, ["scripts/verify-eia-historical.py"], { maxBuffer: 20 * 1024 * 1024 });
console.log(historicalVerification.stdout.trim());

await browser.close();
console.log("source verification passed");

async function verifyHtml(url, terms) {
  const text = await pageText(url);
  for (const term of terms) {
    assert.ok(text.includes(normalize(term)), `${url} missing ${term}`);
  }
  console.log(`verified ${url}`);
}

async function verifySource(url, terms) {
  if (url.toLowerCase().endsWith(".pdf")) {
    await verifyPdf(url, terms);
    return;
  }
  await verifyHtml(url, terms);
}

async function verifyPdf(url, terms) {
  const response = await fetchWithRetry(url);
  assert.ok(response.ok, `${url} did not load`);
  const directory = await mkdtemp(join(tmpdir(), "rpi-source-"));
  const file = join(directory, "source.pdf");
  try {
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    const code = "from pypdf import PdfReader; import sys; sys.stdout.reconfigure(encoding='utf-8'); print(' '.join(page.extract_text() or '' for page in PdfReader(sys.argv[1]).pages))";
    const { stdout } = await execFile(python, ["-c", code, file], { maxBuffer: 20 * 1024 * 1024 });
    const text = normalize(stdout);
    for (const term of terms) {
      assert.ok(text.includes(normalize(term)), `${url} missing ${term}`);
    }
    console.log(`verified ${url}`);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function fetchWithRetry(url) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await fetch(url, { redirect: "follow" });
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function pageText(url) {
  if (htmlCache.has(url)) return htmlCache.get(url);
  let fetchedText = "";
  try {
    const response = await fetch(url, { redirect: "follow" });
    if (response.ok) fetchedText = normalize(await response.text());
  } catch {
    fetchedText = "";
  }
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(1000);
  const text = `${normalize(await page.locator("body").innerText())} ${fetchedText}`;
  htmlCache.set(url, text);
  return text;
}

function normalize(value) {
  return String(value).replace(/\s+/g, " ").toLowerCase();
}

function expectedComposite(utility) {
  return Math.round(
    utility.grid_constraint_score * 0.25 +
      utility.tariff_protection_score * 0.25 +
      utility.buildout_scale_score * 0.2 +
      utility.rate_case_score * 0.2 +
      utility.rate_trend_score * 0.1
  );
}
