import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.PERF_BASE_URL || "http://127.0.0.1:4173";
const zip = process.env.PERF_ZIP || "43215";
const runs = Number(process.env.PERF_RUNS || 1);
const samples = [];

for (let run = 0; run < runs; run += 1) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  await page.goto(`${baseUrl}/index.html?zip=${zip}&perf=${Date.now()}-${run}`, { waitUntil: "networkidle" });
  samples.push(await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const paints = Object.fromEntries(performance.getEntriesByType("paint").map((entry) => [entry.name, Math.round(entry.startTime)]));
    const resources = performance.getEntriesByType("resource");
    return {
      domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
      loadMs: Math.round(nav.loadEventEnd),
      firstContentfulPaintMs: paints["first-contentful-paint"] || null,
      resourceCount: resources.length,
      transferredBytes: resources.reduce((sum, entry) => sum + (entry.transferSize || 0), 0),
      renderedTextLength: document.body.innerText.length
    };
  }));
  await browser.close();
}

const average = Object.fromEntries(Object.keys(samples[0]).map((key) => [
  key,
  Math.round(samples.reduce((sum, sample) => sum + Number(sample[key] || 0), 0) / samples.length)
]));
console.log(JSON.stringify({ runs: samples, average }, null, 2));
