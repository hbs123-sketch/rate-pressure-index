import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import utilities from "../data/utilities.json" with { type: "json" };

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const SITE_URL = "https://rate-pressure-index.vercel.app";

await mkdir("assets/og", { recursive: true });
await mkdir("share", { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });

for (const utility of utilities) {
  const card = utility.share_card;
  if (!card) continue;
  await page.setContent(renderCard(utility), { waitUntil: "networkidle" });
  await page.screenshot({ path: card.image_url, fullPage: true });
  const sharePath = card.share_url;
  await writeFile(sharePath, renderSharePage(utility), "utf8");
  console.log(`generated ${card.image_url} and ${sharePath}`);
}

await browser.close();

function renderCard(utility) {
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          * { box-sizing: border-box; }
          body {
            width: 1200px;
            height: 630px;
            margin: 0;
            display: grid;
            place-items: center;
            background: #f2f5f8;
            color: #17212f;
            font-family: Inter, Arial, sans-serif;
          }
          .card {
            width: 1080px;
            height: 510px;
            border: 1px solid #cfd8e5;
            border-radius: 18px;
            padding: 54px;
            background: #fff;
            box-shadow: 0 26px 80px rgba(23, 33, 47, 0.12);
          }
          .eyebrow {
            color: #075f63;
            font-size: 24px;
            font-weight: 900;
            letter-spacing: 0;
            text-transform: uppercase;
          }
          .body {
            display: grid;
            grid-template-columns: 1fr 300px;
            gap: 44px;
            align-items: end;
            height: 360px;
          }
          h1 {
            margin: 22px 0 18px;
            max-width: 680px;
            font-size: 78px;
            line-height: 0.95;
            letter-spacing: 0;
          }
          p {
            margin: 0;
            color: #536173;
            font-size: 28px;
          }
          .score {
            border-left: 2px solid #d4dce7;
            padding-left: 42px;
            text-align: right;
          }
          .score span {
            display: block;
            color: #536173;
            font-size: 21px;
            font-weight: 900;
            text-transform: uppercase;
          }
          .score strong {
            display: block;
            margin-top: 18px;
            font-size: 154px;
            line-height: 0.85;
          }
          .band {
            display: inline-block;
            margin-top: 24px;
            border-radius: 8px;
            padding: 14px 20px;
            color: white;
            background: ${utility.band === "High" ? "#b42318" : "#a86c07"};
            font-size: 26px;
            font-weight: 900;
          }
        </style>
      </head>
      <body>
        <main class="card">
          <div class="eyebrow">Rate Pressure Index</div>
          <section class="body">
            <div>
              <h1>${escapeHtml(utility.utility_name)}</h1>
              <p>${escapeHtml(utility.state)} - ${escapeHtml(utility.rto_iso)}</p>
            </div>
            <div class="score">
              <span>Score</span>
              <strong>${utility.composite_score}</strong>
              <div class="band">${utility.band}</div>
            </div>
          </section>
        </main>
      </body>
    </html>`;
}

function renderSharePage(utility) {
  const card = utility.share_card;
  const title = `${utility.utility_name}: ${utility.composite_score} ${utility.band} | Rate Pressure Index`;
  const description = `Public-data rate pressure indicator for ${utility.utility_name}: score ${utility.composite_score}, ${utility.band}.`;
  const image = `${SITE_URL}/${card.image_url}`;
  const zip = representativeZip(utility.utility_id);
  const canonical = `${SITE_URL}/index.html?zip=${zip}`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:type" content="website">
    <meta property="og:image" content="${image}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${image}">
    <link rel="canonical" href="${canonical}">
  </head>
  <body>
    <p><a href="${canonical}">View ${escapeHtml(utility.utility_name)} in the Rate Pressure Index</a></p>
  </body>
</html>
`;
}

function representativeZip(utilityId) {
  return {
    "19876": "20147",
    "14006": "43215",
    "7140": "30303"
  }[utilityId] || "";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
