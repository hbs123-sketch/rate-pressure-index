import { checkPaymentStatus } from "./payment-gate.js";
import { formatPersonalImpact } from "./personal-report.js";

const reportElement = document.querySelector("#personal-report");
const params = new URLSearchParams(location.search);
const report = readStoredReport();

if (!report || params.get("utility") !== report.utilityId) {
  reportElement.innerHTML = `
    <div class="report-empty">
      <p class="eyebrow">Personalized deep dive</p>
      <h1>Your report will appear here</h1>
      <p>Complete the guided intake from a utility result to generate a household report.</p>
      <a class="report-link-button" href="index.html">Return to ZIP lookup</a>
    </div>
  `;
} else if (!(await checkPaymentStatus())) {
  reportElement.innerHTML = "<p>Your report is awaiting payment confirmation.</p>";
} else {
  renderReport(report);
}

function readStoredReport() {
  try {
    return JSON.parse(sessionStorage.getItem("rpi-personal-report"));
  } catch {
    return null;
  }
}

function renderReport(report) {
  const method = report.intake.usageMethod === "exact" ? "Exact usage provided" : "Guided usage estimate";
  reportElement.innerHTML = `
    <p class="eyebrow">Personalized deep dive</p>
    <h1>${report.utilityName}</h1>
    <p class="report-subtitle">A household-level reading of the existing public-data inputs. It is an estimate, not a bill forecast or causal finding.</p>
    <section class="personal-impact-card" aria-label="Personalized monthly impact estimate">
      <span>${report.impactLabel}</span>
      <strong>${formatPersonalImpact(report.monthlyImpact)}</strong>
      <em class="timeframe-tag">${report.timeframe}</em>
      <p>${report.calculationNote}</p>
      <a href="${report.sourceUrl}" target="_blank" rel="noreferrer">Source for cited bill input</a>
    </section>
    <section class="report-intake-summary" aria-label="Your inputs">
      <h2>Your inputs</h2>
      <dl>
        <div><dt>Monthly usage</dt><dd>${report.intake.usageKwh.toLocaleString()} kWh</dd></div>
        <div><dt>Usage method</dt><dd>${method}</dd></div>
        ${report.intake.rateClass ? `<div><dt>Supply arrangement</dt><dd>${supplyLabel(report.intake.rateClass)}</dd></div>` : ""}
      </dl>
      ${report.selectedSupplyNote ? `<p>${report.selectedSupplyNote}</p>` : ""}
    </section>
    <section class="report-drivers" aria-label="What is driving this report">
      <div class="factor-heading"><div><h2>What is driving this report</h2><p>These are the same cited inputs used in the free score.</p></div></div>
      <div class="report-driver-list">
        ${report.drivers.map((driver) => `
          <article>
            <div><h3>${driver.title}</h3><span>Evidence score ${driver.score}/100</span></div>
            <p>${driver.note}</p>
            <div class="source-list">${driver.sources.map((source, index) => `<a href="${source}" target="_blank" rel="noreferrer">${driver.sources.length === 1 ? "Source" : `Source ${index + 1}`}</a>`).join("")}</div>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function supplyLabel(value) {
  return { sso: "Standard Service Offer", supplier: "Competitive supplier", unknown: "Not sure" }[value] || value;
}
