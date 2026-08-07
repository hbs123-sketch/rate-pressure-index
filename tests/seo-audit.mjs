import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await assertMetadata("/index.html", {
  title: "Rate Pressure Index | Data-Center Growth and Electric Bills",
  description: "Explore sourced public filings and bill changes shaping data-center-related rate pressure for pilot electric utilities."
});
await assertMetadata("/methodology.html", {
  title: "Methodology | Rate Pressure Index",
  description: "Read the Rate Pressure Index methodology, five-factor formula, score bands, national baseline context, and limitations."
});

for (const [path, title] of [
  ["/share/dominion-energy-virginia.html", "Dominion Energy Virginia: 73 Elevated | Rate Pressure Index"],
  ["/share/aep-ohio.html", "AEP Ohio: 77 High | Rate Pressure Index"],
  ["/share/georgia-power.html", "Georgia Power: 61 Elevated | Rate Pressure Index"]
]) {
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "networkidle" });
  assert.equal(await page.title(), title, `${path} title`);
  assert.ok(await page.locator('meta[name="description"]').getAttribute("content"), `${path} description`);
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1, `${path} structured data`);
}

for (const [zip, utility, score, band] of [
  ["20147", "Dominion Energy Virginia", 73, "Elevated"],
  ["43215", "AEP Ohio", 77, "High"],
  ["30303", "Georgia Power", 61, "Elevated"]
]) {
  await page.goto(new URL(`/?zip=${zip}`, baseUrl).href, { waitUntil: "networkidle" });
  assert.equal(await page.title(), `${utility}: ${score} ${band} | Rate Pressure Index`, `${utility} result title`);
  assert.ok((await page.locator('meta[name="description"]').getAttribute("content")).includes("five sourced public-data factors"), `${utility} result description`);
  assert.equal(await page.locator('link[rel="canonical"]').getAttribute("href"), new URL(`?zip=${zip}`, baseUrl).href, `${utility} canonical URL`);
  const schema = JSON.parse(await page.locator("#rate-pressure-index-result").textContent());
  assert.equal(schema["@type"], "Dataset", `${utility} Dataset schema`);
  assert.equal(schema.name, `${utility} Rate Pressure Index`, `${utility} schema name`);
  assert.equal(schema.variableMeasured.length, 5, `${utility} five source factors`);
}

const robots = await (await fetch(new URL("/robots.txt", baseUrl))).text();
assert.ok(robots.includes("Sitemap:"), "robots references sitemap");
const sitemap = await (await fetch(new URL("/sitemap.xml", baseUrl))).text();
for (const url of ["/", "/methodology", "?zip=20147", "?zip=43215", "?zip=30303"]) {
  assert.ok(sitemap.includes(url), `sitemap includes ${url}`);
}

await browser.close();
console.log("SEO audit passed");

async function assertMetadata(path, expected) {
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "networkidle" });
  assert.equal(await page.title(), expected.title, `${path} title`);
  assert.equal(await page.locator('meta[name="description"]').getAttribute("content"), expected.description, `${path} description`);
  assert.equal(await page.locator('script[type="application/ld+json"]').count(), 1, `${path} structured data`);
}
