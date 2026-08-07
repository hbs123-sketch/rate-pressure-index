import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const isProduction = new URL(baseUrl).hostname !== "127.0.0.1" && new URL(baseUrl).hostname !== "localhost";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });

await context.route("https://api.zippopotam.us/us/**", async (route) => {
  const zip = route.request().url().split("/").pop();
  if (zip === "00000") {
    await route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    return;
  }
  if (zip === "99999") {
    await route.abort("failed");
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ "post code": zip, country: "United States", places: [] })
  });
});

const page = await context.newPage();

async function lookup(zip) {
  await page.goto(`${baseUrl}/index.html?edge=${Date.now()}`, { waitUntil: "networkidle" });
  await page.locator("#zip").fill(zip);
  await page.locator("#lookup-form button").click();
}

await lookup("abcde");
assert.equal(await page.locator("#form-error").innerText(), "Enter a five-digit ZIP code using numbers only.", "letters get a specific validation message");
assert.equal(await page.locator("#result").isHidden(), true, "letters do not calculate a score");

await lookup("1234");
assert.equal(await page.locator("#form-error").innerText(), "Enter exactly five digits for the ZIP code.", "short ZIP gets a specific validation message");
assert.equal(await page.locator("#result").isHidden(), true, "short ZIP does not calculate a score");

await lookup("123456");
assert.equal(await page.locator("#form-error").innerText(), "Enter exactly five digits for the ZIP code.", "long ZIP gets a specific validation message");
assert.equal(await page.locator("#result").isHidden(), true, "long ZIP does not calculate a score");

await lookup("00000");
await page.locator("#not-covered:not([hidden])").waitFor();
assert.ok((await page.locator("#not-covered").innerText()).includes("No such ZIP code"), "nonexistent ZIP is distinguished from uncovered coverage");
assert.equal(await page.locator(".score-box").count(), 0, "nonexistent ZIP never renders a score");

await lookup("90210");
await page.locator("#not-covered:not([hidden])").waitFor();
const uncoveredText = await page.locator("#not-covered").innerText();
assert.ok(uncoveredText.includes("Not covered yet"), "real but uncovered ZIP has the not-covered state");
assert.ok(uncoveredText.includes("This ZIP exists"), "real but uncovered ZIP is clearly described");
assert.equal(await page.locator(".score-box").count(), 0, "uncovered ZIP never renders a score");

await lookup("99999");
await page.locator("#not-covered:not([hidden])").waitFor();
assert.ok((await page.locator("#not-covered").innerText()).includes("We couldn't verify this ZIP code"), "ZIP verification fetch failure has a clear recovery message");
assert.equal(await page.locator(".score-box").count(), 0, "ZIP verification failure never renders a score");

const failedDataContext = await browser.newContext();
await failedDataContext.route("**/data/utilities.json", async (route) => {
  await route.fulfill({ status: 503, contentType: "application/json", body: "{}" });
});
const failedDataPage = await failedDataContext.newPage();
await failedDataPage.goto(`${baseUrl}/index.html?edge-data=${Date.now()}`, { waitUntil: "networkidle" });
await failedDataPage.getByRole("heading", { name: "We couldn't load the Rate Pressure Index data." }).waitFor();
assert.equal(await failedDataPage.locator("#lookup-form button").isDisabled(), true, "core data failure disables lookup rather than leaving an inert form");
assert.ok((await failedDataPage.locator("body").innerText()).includes("No score was calculated."), "core data failure explicitly says no score was calculated");
await failedDataContext.close();

const localNotFound = await page.goto(`${baseUrl}/404.html`, { waitUntil: "networkidle" });
assert.ok(localNotFound, "custom not-found document responds");
assert.equal(await page.locator("h1").innerText(), "That page isn't in the Rate Pressure Index.", "custom 404 document is branded");

if (isProduction) {
  const productionNotFound = await page.goto(`${baseUrl}/not-a-real-rate-pressure-index-page`, { waitUntil: "networkidle" });
  assert.equal(productionNotFound?.status(), 404, "Vercel returns HTTP 404 for an unknown route");
  assert.equal(await page.locator("h1").innerText(), "That page isn't in the Rate Pressure Index.", "Vercel serves the custom 404 page");
}

await browser.close();
console.log(`edge-case audit passed (${isProduction ? "production" : "local"})`);
