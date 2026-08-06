import { FACTORS, bandForScore, computeComposite, normalizeZip } from "./scoring.js";

const [utilitiesResponse, zipResponse, recommendationsResponse] = await Promise.all([
  fetch("data/utilities.json"),
  fetch("data/zip-to-utility.json"),
  fetch("data/recommendations.json")
]);

const utilities = await utilitiesResponse.json();
const zipToUtility = await zipResponse.json();
const recommendations = await recommendationsResponse.json();
const utilitiesById = new Map(utilities.map((utility) => [utility.utility_id, utility]));

const form = document.querySelector("#lookup-form");
const zipInput = document.querySelector("#zip");
const formError = document.querySelector("#form-error");
const result = document.querySelector("#result");
const notCovered = document.querySelector("#not-covered");
const pilotPreview = document.querySelector("#pilot-preview");

if (pilotPreview) {
  pilotPreview.innerHTML = utilities.map((utility) => `
    <article class="pilot-card">
      <span>${utility.utility_name}</span>
      <strong>${utility.composite_score}</strong>
      <em class="band ${utility.band.toLowerCase()}">${utility.band}</em>
    </article>
  `).join("");
}

const params = new URLSearchParams(location.search);
if (params.has("zip")) {
  zipInput.value = normalizeZip(params.get("zip"));
  handleLookup(zipInput.value);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleLookup(zipInput.value);
});

function handleLookup(rawZip) {
  const zip = normalizeZip(rawZip);
  formError.textContent = "";

  if (!zip) {
    formError.textContent = "Enter a valid five-digit ZIP code.";
    result.hidden = true;
    notCovered.hidden = true;
    return;
  }

  const utilityId = zipToUtility[zip];
  const utility = utilitiesById.get(utilityId);

  if (!utility) {
    showNotCovered(zip);
    return;
  }

  showResult(zip, utility);
  history.replaceState(null, "", `?zip=${zip}`);
}

function showResult(zip, utility) {
  const score = computeComposite(utility);
  const band = bandForScore(score);
  setShareMetadata(utility, zip);

  result.innerHTML = `
    ${renderNarrativeHero(utility, zip, score, band)}
    <p class="disclaimer">This is an indicator built from public data, not a determination of cause. <a class="method-link" href="methodology.html">See methodology.</a></p>
    ${renderUsageEstimator(utility)}
    ${renderRecommendations(utility)}
    ${renderEvidence(utility)}
  `;

  result.hidden = false;
  notCovered.hidden = true;
}

function renderNarrativeHero(utility, zip, score, band) {
  const loadStat = findStatistic(utility, [/data centers?/i, /contracted load/i, /new contracts/i]);
  const billStat = findStatistic(utility, [/bill increase/i, /net bill change/i, /customer benefit/i]);
  const story = loadStat && billStat
    ? `${utility.utility_name} reports <a href="${loadStat.source_url}" target="_blank" rel="noreferrer">${loadStat.value} ${loadStat.label.toLowerCase()}</a>, and the cited <a href="${billStat.source_url}" target="_blank" rel="noreferrer">${billStat.label.toLowerCase()} is ${billStat.value}</a>${billStat.timeframe ? ` <span class="timeframe-tag">${billStat.timeframe}</span>` : ""}.`
    : `${utility.utility_name}'s public-data inputs are summarized below.`;
  return `
    <section class="narrative-hero">
      <div>
        <p class="eyebrow">ZIP ${zip}</p>
        <h2 class="utility-name">${utility.utility_name}</h2>
        <p class="state-line">${utility.state} - ${utility.rto_iso}</p>
        <p class="narrative-copy">${story}</p>
        ${renderWhatsChanged(utility)}
      </div>
      <div class="score-box">
        <span class="score-label">Rate Pressure Score</span>
        <div class="score">${score}</div>
        <span class="band ${band.toLowerCase()}">${band}</span>
        <p class="score-meaning">${scoreMeaning(band)}</p>
        ${renderShareButton(utility)}
      </div>
    </section>
  `;
}

function scoreMeaning(band) {
  return {
    Low: "Current public signals point to limited rate pressure from data-center buildout in this territory.",
    Moderate: "Public signals show some rate pressure to watch, but the picture is not yet elevated.",
    Elevated: "Several public signals point to meaningful rate pressure as the grid expands for large new loads.",
    High: "Public signals show strong rate-pressure risk while the grid prepares for very large new loads."
  }[band];
}

function renderShareButton(utility) {
  const statusId = `share-status-${utility.utility_id}`;
  const shareUrl = new URL(utility.share_card.share_url, location.href).href;
  return `
    <div class="share-control">
      <button class="share-button" type="button" data-share-url="${shareUrl}" aria-describedby="${statusId}">Copy share link</button>
      <span class="share-status" id="${statusId}" role="status" aria-live="polite"></span>
    </div>
  `;
}

function findStatistic(utility, patterns) {
  return utility.by_the_numbers?.find((stat) => patterns.some((pattern) => pattern.test(stat.label)));
}

function renderRecommendations(utility) {
  if (!recommendations.module_enabled) return "";

  const items = Object.entries(recommendations.categories)
    .filter(([, category]) => isEligibleForCategory(utility.state, category))
    .slice(0, 3)
    .map(([categoryId, category]) => {
      const source = sourceForCategory(utility.state, category);
      return `
        <article class="recommendation-item">
          <div class="recommendation-icon" aria-hidden="true">${recommendationIcon(categoryId)}</div>
          <div>
            <h4>${category.title}</h4>
            <p>${category.sentence} <a href="${source.source_url}" target="_blank" rel="noreferrer">${category.source_label || source.source_label}</a></p>
          </div>
          <a class="recommendation-button" data-recommendation-category="${categoryId}" data-recommendation-utility="${utility.utility_name}" href="${outboundUrl(category.outbound_url, categoryId, utility)}" target="_blank" rel="noreferrer">${category.button_label}</a>
        </article>
      `;
    });

  if (!items.length) return "";
  return `
    <section class="recommendations-panel" aria-label="What you can do">
      <div class="recommendations-heading">
        <div>
          <div class="section-kicker">Practical next steps</div>
          <h3>Ways to offset the impact</h3>
        </div>
        <p>${recommendations.disclosure}</p>
      </div>
      <div class="recommendation-list">${items.join("")}</div>
    </section>
  `;
}

function recommendationIcon(categoryId) {
  const icons = {
    supplier_comparison: '<svg viewBox="0 0 24 24" focusable="false"><path d="M12 2v8m0 0 4-4m-4 4-4-4m1 7h6l2 8H7l2-8Z"/><path d="M5 21h14"/></svg>',
    community_solar: '<svg viewBox="0 0 24 24" focusable="false"><circle cx="12" cy="6" r="3"/><path d="m12 1 1 2m-5 1 2 1m6 0 2-1M4 21l2-8h12l2 8H4Zm4-8v8m4-8v8m4-8v8"/></svg>',
    rooftop_solar: '<svg viewBox="0 0 24 24" focusable="false"><path d="m3 13 9-7 9 7"/><path d="M5 13h14l-2 8H7l-2-8Zm4 0 1 8m5-8-1 8M5 17h14"/><path d="M12 1v3m-5-1 2 2m8-2-2 2"/></svg>',
    battery_backup: '<svg viewBox="0 0 24 24" focusable="false"><rect x="5" y="4" width="14" height="16" rx="1"/><path d="M9 1h6m-3 7-2 4h3l-2 4"/></svg>'
  };
  return icons[categoryId] || icons.supplier_comparison;
}

function isEligibleForCategory(state, category) {
  if (!category.eligibility) return true;
  return Boolean(recommendations.eligibility[category.eligibility]?.[state]);
}

function sourceForCategory(state, category) {
  if (category.source_url) return category;
  return recommendations.eligibility[category.eligibility][state];
}

function outboundUrl(rawUrl, category, utility) {
  const url = new URL(rawUrl);
  url.searchParams.set("utm_source", "rate_pressure_index");
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", category);
  url.searchParams.set("utm_content", utility.utility_id);
  return url.href;
}

function renderFactor(utility, key) {
  const noteKey = key.replace("_score", "_note");
  const sourceKey = sourceKeyForFactor(key);
  const sourceUrls = Array.isArray(utility[sourceKey]) ? utility[sourceKey] : [utility[sourceKey]];
  return `
    <article class="factor-card">
      <div class="factor-card-header">
        <h4>${plainFactorLabel(key)}</h4>
        <span class="factor-score">Evidence score ${utility[key]}/100</span>
      </div>
      <p>${utility[noteKey]}</p>
      <div class="source-list">
        ${sourceUrls.map((url, index) => `<a href="${url}" target="_blank" rel="noreferrer">${sourceUrls.length === 1 ? "Source" : `Source ${index + 1}`}</a>`).join("")}
      </div>
    </article>
  `;
}

function plainFactorLabel(key) {
  return {
    grid_constraint_score: "Regional grid strain",
    tariff_protection_score: "Large-load protections",
    buildout_scale_score: "Data-center buildout",
    rate_case_score: "Recent rate action",
    rate_trend_score: "Household bill trend"
  }[key];
}

function sourceKeyForFactor(key) {
  return key === "tariff_protection_score" ? "tariff_source_url" : key.replace("_score", "_source_url");
}

function renderByTheNumbers(utility) {
  if (!utility.by_the_numbers?.length) return "";
  return `
    <section class="numbers-panel" aria-label="By the numbers">
      <div class="section-kicker">By the numbers</div>
      <div class="numbers-grid">
        ${utility.by_the_numbers.map((stat) => `
          <article class="number-card">
            <span>${stat.label}</span>
            <strong>${stat.value}</strong>
            ${stat.timeframe ? `<em class="timeframe-tag">${stat.timeframe}</em>` : ""}
            <p>${stat.detail}</p>
            <a href="${stat.source_url}" target="_blank" rel="noreferrer">Source</a>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderRateTrendComparison(utility) {
  const comparison = utility.rate_trend_comparison;
  if (!comparison) return "";
  return `
    <section class="comparison-panel" aria-label="National baseline comparison">
      <div>
        <span>${comparison.utility_label}</span>
        <strong>${comparison.utility_value}</strong>
        ${comparison.timeframe ? `<em class="timeframe-tag">${comparison.timeframe}</em>` : ""}
        <p>${comparison.utility_detail}</p>
        <a href="${comparison.utility_source_url}" target="_blank" rel="noreferrer">Utility source</a>
      </div>
      <div>
        <span>${comparison.national_label}</span>
        <strong>${comparison.national_value}</strong>
        <p>${comparison.national_detail}</p>
        <a href="${comparison.national_source_url}" target="_blank" rel="noreferrer">EIA source</a>
      </div>
    </section>
  `;
}

function renderUsageEstimator(utility) {
  const scaling = utility.usage_scaling;
  if (!scaling) return "";
  const options = [
    ["low", 0.7, "Low"],
    ["average", 1, "Average"],
    ["high", 1.3, "High"]
  ];
  return `
    <section class="usage-panel" aria-label="Bill impact estimate">
      <div>
        <div class="section-kicker">Bill impact estimate</div>
        <h3>Choose the usage level that is closest to your household.</h3>
        <p>This rough estimate scales the cited rate action or customer benefit for the selected usage tier; it is not a precise bill forecast or cause determination.</p>
      </div>
      <div class="usage-controls" role="group" aria-label="Usage level">
        ${options.map(([value, multiplier, label], index) => `
          <label>
            <input type="radio" name="usage-${utility.utility_id}" value="${value}" data-impact="${scaling.base_monthly_dollars * multiplier}" ${index === 1 ? "checked" : ""}>
            <span>${label}</span>
          </label>
        `).join("")}
      </div>
      <div class="usage-result">
        <div class="usage-output" data-usage-output>
          ${formatMonthlyImpact(scaling.base_monthly_dollars)}
        </div>
        <span class="timeframe-tag">${scaling.timeframe}</span>
      </div>
      <a href="${scaling.source_url}" target="_blank" rel="noreferrer">Source</a>
    </section>
  `;
}

function renderWhatsChanged(utility) {
  if (!utility.whats_changed) return "";
  return `
    <p class="change-line">
      <strong>What's changed (${utility.whats_changed.date}):</strong>
      ${utility.whats_changed.text}
      <a href="${utility.whats_changed.source_url}" target="_blank" rel="noreferrer">Source</a>
    </p>
  `;
}

function renderEvidence(utility) {
  return `
    <details class="evidence-panel">
      <summary>See the evidence behind this score</summary>
      <div class="evidence-content">
        ${renderByTheNumbers(utility)}
        ${renderRateTrendComparison(utility)}
        ${renderHistoricalTrend(utility)}
        <div class="factor-heading">
          <h3>Why this score</h3>
          <p>Each score is shown with the source used for the public-data input.</p>
        </div>
        <div class="factor-grid">
          ${FACTORS.map(([key]) => renderFactor(utility, key)).join("")}
        </div>
        ${renderRegulatoryStatus(utility)}
      </div>
    </details>
  `;
}

function renderHistoricalTrend(utility) {
  const series = utility.historical_rate_series;
  if (!series?.values?.length) return "";
  const width = 640;
  const height = 210;
  const left = 40;
  const right = 18;
  const top = 20;
  const bottom = 36;
  const values = series.values.map((point) => point.value);
  const min = Math.floor((Math.min(...values) - 0.5) * 2) / 2;
  const max = Math.ceil((Math.max(...values) + 0.5) * 2) / 2;
  const x = (index) => left + index * ((width - left - right) / Math.max(series.values.length - 1, 1));
  const y = (value) => top + (max - value) / Math.max(max - min, 1) * (height - top - bottom);
  const points = series.values.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  return `
    <section class="history-panel" aria-label="${series.title}">
      <div class="history-heading">
        <div>
          <div class="section-kicker">Historical trend</div>
          <h3>${series.title}</h3>
        </div>
        <span>${series.unit}</span>
      </div>
      <svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="${series.title}, ${series.values.map((point) => `${point.year}: ${point.value} ${series.unit}`).join(", ")}">
        <line x1="${left}" y1="${top}" x2="${left}" y2="${height - bottom}" />
        <line x1="${left}" y1="${height - bottom}" x2="${width - right}" y2="${height - bottom}" />
        <line class="chart-guide" x1="${left}" y1="${y(max)}" x2="${width - right}" y2="${y(max)}" />
        <line class="chart-guide" x1="${left}" y1="${y(min)}" x2="${width - right}" y2="${y(min)}" />
        <text x="2" y="${y(max) + 4}">${max.toFixed(1)}</text>
        <text x="2" y="${y(min) + 4}">${min.toFixed(1)}</text>
        <polyline points="${points}" />
        ${series.values.map((point, index) => `<circle cx="${x(index)}" cy="${y(point.value)}" r="4" /><text class="chart-value" x="${x(index)}" y="${y(point.value) - 10}">${point.value.toFixed(2)}</text><text class="chart-year" x="${x(index)}" y="${height - 14}">${point.year}</text>`).join("")}
      </svg>
      <p>${series.source_detail} <a href="${series.source_url}" target="_blank" rel="noreferrer">${series.source_label}</a></p>
    </section>
  `;
}

function renderRegulatoryStatus(utility) {
  const tariffSource = Array.isArray(utility.tariff_source_url) ? utility.tariff_source_url[0] : utility.tariff_source_url;
  return `
    <section class="regulatory-status" aria-label="Regulatory status">
      <h3>Regulatory status</h3>
      <div><span>Tariff status</span><strong>${formatStatus(utility.tariff_status)}</strong></div>
      <div><span>Tariff effective date</span><strong>${utility.tariff_effective_date || "Not applicable"}</strong></div>
      <div><span>Last updated</span><strong>${utility.last_updated}</strong></div>
      <a href="${tariffSource}" target="_blank" rel="noreferrer">Tariff source</a>
      <a href="${utility.share_card.share_url}">Share card preview</a>
    </section>
  `;
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

result.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || !target.matches("[data-impact]")) return;
  const output = target.closest(".usage-panel")?.querySelector("[data-usage-output]");
  if (output) output.textContent = formatMonthlyImpact(target.dataset.impact);
});

result.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;

  const shareButton = event.target.closest("[data-share-url]");
  if (shareButton) {
    copyShareUrl(shareButton.dataset.shareUrl, shareButton);
    return;
  }

  const link = event.target.closest("[data-recommendation-category]");
  if (!link) return;
  const body = JSON.stringify({
    category: link.dataset.recommendationCategory,
    utility: link.dataset.recommendationUtility
  });
  navigator.sendBeacon("api/recommendation-click", new Blob([body], { type: "application/json" }));
});

async function copyShareUrl(shareUrl, button) {
  const status = document.getElementById(button.getAttribute("aria-describedby"));
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl);
    } else {
      const helper = document.createElement("textarea");
      helper.value = shareUrl;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.opacity = "0";
      document.body.append(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    button.textContent = "Copied";
    status.textContent = "Share link copied.";
    window.setTimeout(() => {
      button.textContent = "Copy share link";
    }, 1800);
  } catch {
    status.textContent = "Could not copy the share link.";
  }
}

function setShareMetadata(utility, zip) {
  const title = `${utility.utility_name}: ${utility.composite_score} ${utility.band} | Rate Pressure Index`;
  const description = `Public-data rate pressure indicator for ZIP ${zip}: ${utility.utility_name} scores ${utility.composite_score}, ${utility.band}.`;
  document.title = title;
  upsertMeta("description", description);
  upsertMeta("og:title", title, "property");
  upsertMeta("og:description", description, "property");
  upsertMeta("og:image", new URL(utility.share_card.image_url, location.href).href, "property");
  upsertMeta("twitter:card", "summary_large_image", "name");
}

function upsertMeta(key, content, attr = "name") {
  let meta = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attr, key);
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", content);
}


function showNotCovered(zip) {
  notCovered.innerHTML = `
    <p class="eyebrow">ZIP ${zip}</p>
    <h2>Not covered yet</h2>
    <p>This v1 pilot covers selected ZIP codes for Dominion Energy Virginia, AEP Ohio, and Georgia Power. Leave an email if you want a note when this utility is added.</p>
    <form class="waitlist-form" id="waitlist-form">
      <input name="email" type="email" placeholder="you@example.com" required>
      <button type="submit">Notify me</button>
    </form>
    <p id="waitlist-status" class="updated"></p>
  `;

  result.hidden = true;
  notCovered.hidden = false;

  notCovered.querySelector("#waitlist-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    const signups = JSON.parse(localStorage.getItem("rpi_waitlist") || "[]");
    signups.push({ zip, email, created_at: new Date().toISOString() });
    localStorage.setItem("rpi_waitlist", JSON.stringify(signups));
    notCovered.querySelector("#waitlist-status").textContent = "Saved locally for this v1 prototype.";
    event.currentTarget.reset();
  });
}
