import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const baseUrl = process.env.PERF_BASE_URL || "http://127.0.0.1:4173";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

await page.addInitScript(() => {
  window.__largestContentfulPaint = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__largestContentfulPaint = entry.startTime;
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
});

await page.goto(`${baseUrl}/index.html`, { waitUntil: "networkidle" });
await page.waitForTimeout(300);

const metrics = await page.evaluate(() => {
  const paintEntries = performance.getEntriesByType("paint");
  const firstContentfulPaint = paintEntries.find((entry) => entry.name === "first-contentful-paint")?.startTime ?? null;
  const navigation = performance.getEntriesByType("navigation")[0];
  const resources = performance.getEntriesByType("resource");
  const transferredBytes = [navigation, ...resources]
    .filter(Boolean)
    .reduce((total, entry) => total + (entry.transferSize || 0), 0);

  return {
    firstContentfulPaint,
    largestContentfulPaint: window.__largestContentfulPaint || null,
    transferredBytes,
    resourceCount: resources.length
  };
});

await browser.close();
console.log(JSON.stringify({
  url: `${baseUrl}/index.html`,
  fcpMs: Math.round(metrics.firstContentfulPaint),
  lcpMs: Math.round(metrics.largestContentfulPaint),
  transferredBytes: metrics.transferredBytes,
  transferredKiB: Number((metrics.transferredBytes / 1024).toFixed(1)),
  resourceCount: metrics.resourceCount
}, null, 2));
