import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const axeSource = await readFile(require.resolve("axe-core/axe.min.js"), "utf8");
const baseUrl = process.env.AUDIT_BASE_URL || "http://127.0.0.1:4173";
const reportOnly = process.env.A11Y_REPORT_ONLY === "1";

const pages = [
  ["landing", "/index.html"],
  ["Dominion result", "/index.html?zip=20147"],
  ["AEP Ohio result", "/index.html?zip=43215"],
  ["Georgia Power result", "/index.html?zip=30303"],
  ["methodology", "/methodology.html"],
  ["Dominion share", "/share/dominion-energy-virginia.html"],
  ["AEP Ohio share", "/share/aep-ohio.html"],
  ["Georgia Power share", "/share/georgia-power.html"]
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 1000 } });
const allViolations = [];

for (const [label, path] of pages) {
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "networkidle" });
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(async () => axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] }
  }));
  for (const violation of results.violations) {
    allViolations.push({ label, id: violation.id, impact: violation.impact, nodes: violation.nodes.map((node) => node.target.join(" ")) });
  }
  const headingCount = await page.locator("h1").count();
  if (headingCount !== 1) {
    allViolations.push({ label, id: "page-has-single-h1", impact: "serious", nodes: ["document"] });
  }
  const unlabeledGraphics = await page.evaluate(() => [...document.querySelectorAll("img, svg")]
    .filter((element) => {
      if (element.closest('[aria-hidden="true"]')) return false;
      if (element.tagName === "IMG") return !element.getAttribute("alt");
      return element.getAttribute("role") !== "img" || !element.getAttribute("aria-label");
    })
    .map((element) => element.tagName.toLowerCase()));
  if (unlabeledGraphics.length) {
    allViolations.push({ label, id: "graphics-have-text-alternative", impact: "serious", nodes: unlabeledGraphics });
  }
}

for (const [, path] of pages.filter(([label]) => label.endsWith("result"))) {
  await page.goto(new URL(path, baseUrl).href, { waitUntil: "networkidle" });
  const evidence = page.locator(".evidence-panel");
  const summary = evidence.locator("summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  assert.equal(await evidence.getAttribute("open"), "", `${path} opens evidence with Enter`);
  await page.keyboard.press("Space");
  assert.equal(await evidence.getAttribute("open"), null, `${path} closes evidence with Space`);

  const usageInputs = page.locator(".usage-controls input");
  await usageInputs.nth(0).focus();
  await page.keyboard.press("ArrowRight");
  assert.equal(await usageInputs.nth(1).isChecked(), true, `${path} selects Average with ArrowRight`);
  await page.keyboard.press("ArrowRight");
  assert.equal(await usageInputs.nth(2).isChecked(), true, `${path} selects High with ArrowRight`);
}

await browser.close();

if (allViolations.length) {
  for (const violation of allViolations) {
    console.log(`${violation.label}: ${violation.id} (${violation.impact || "unknown"}) - ${violation.nodes.join(", ")}`);
  }
}
console.log(`accessibility audit: ${allViolations.length} WCAG 2.1 A/AA violation(s)`);
if (!reportOnly) assert.equal(allViolations.length, 0, "WCAG 2.1 A/AA violations");
