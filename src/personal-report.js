const RATE_CLASS_INTAKE = {
  "14006": {
    label: "Electric supply arrangement",
    help: "AEP Ohio's published bill-change example applies to a 1,000 kWh Standard Service Offer customer.",
    options: [
      ["sso", "Standard Service Offer"],
      ["supplier", "Competitive supplier"],
      ["unknown", "Not sure"]
    ]
  }
};

const USAGE_ESTIMATES = {
  small: 650,
  medium: 1000,
  large: 1400
};

const OCCUPANT_ADJUSTMENTS = {
  "1": 0,
  "2-3": 100,
  "4plus": 250
};

export function renderPersonalReportIntake(utility) {
  const rateClass = RATE_CLASS_INTAKE[utility.utility_id];
  return `
    <section class="personal-report-panel" aria-labelledby="personal-report-title">
      <div>
        <div class="section-kicker">Personalized deep dive</div>
        <h3 id="personal-report-title">See the impact at your usage</h3>
        <p>Get a report scaled to your specific usage, not the utility-wide average. Use your monthly kWh or answer two quick questions.</p>
      </div>
      <form class="personal-report-form" data-personal-report-form data-utility-id="${utility.utility_id}">
        <fieldset>
          <legend>How would you like to provide monthly electricity use?</legend>
          <label class="report-choice"><input type="radio" name="usage-method" value="exact" checked> <span>I know my kWh</span></label>
          <label class="report-choice"><input type="radio" name="usage-method" value="guided"> <span>Help me estimate</span></label>
        </fieldset>
        <label class="report-input exact-usage-field">Monthly electricity use (kWh)
          <input name="exact-usage" type="number" min="50" max="5000" step="1" inputmode="numeric" placeholder="1000">
        </label>
        <div class="guided-usage-fields" hidden>
          <label class="report-input">Home size
            <select name="home-size">
              <option value="small">Under 1,000 sq ft</option>
              <option value="medium" selected>1,000-1,999 sq ft</option>
              <option value="large">2,000 sq ft or more</option>
            </select>
          </label>
          <label class="report-input">People in the household
            <select name="occupants">
              <option value="1">1</option>
              <option value="2-3" selected>2-3</option>
              <option value="4plus">4 or more</option>
            </select>
          </label>
        </div>
        ${rateClass ? renderRateClass(rateClass) : ""}
        <div class="report-form-actions">
          <button type="submit">Generate personal report</button>
          <p class="report-form-error" role="alert" aria-live="polite"></p>
        </div>
      </form>
    </section>
  `;
}

export function intakeFromForm(form) {
  const formData = new FormData(form);
  const method = formData.get("usage-method");
  if (method === "exact") {
    const usageKwh = Number(formData.get("exact-usage"));
    if (!Number.isFinite(usageKwh) || usageKwh < 50 || usageKwh > 5000) {
      throw new Error("Enter a monthly usage value between 50 and 5,000 kWh.");
    }
    return { usageKwh: Math.round(usageKwh), usageMethod: "exact", rateClass: formData.get("rate-class") || null };
  }

  const homeSize = formData.get("home-size");
  const occupants = formData.get("occupants");
  return {
    usageKwh: USAGE_ESTIMATES[homeSize] + OCCUPANT_ADJUSTMENTS[occupants],
    usageMethod: "guided",
    homeSize,
    occupants,
    rateClass: formData.get("rate-class") || null
  };
}

export function buildPersonalReport(utility, intake) {
  const scaling = utility.usage_scaling;
  const referenceUsageKwh = scaling.base_usage_kwh || null;
  const canScale = Number.isFinite(referenceUsageKwh);
  const monthlyImpact = canScale
    ? scaling.base_monthly_dollars * intake.usageKwh / referenceUsageKwh
    : scaling.base_monthly_dollars;
  const selectedSupplyNote = intake.rateClass === "supplier"
    ? "You selected a competitive supplier. The published AEP example is for Standard Service Offer supply, so use this as a benchmark rather than a bill forecast."
    : intake.rateClass === "unknown"
      ? "The published AEP example is for Standard Service Offer supply. Check your bill before treating this as a bill forecast."
      : "";

  return {
    utilityId: utility.utility_id,
    utilityName: utility.utility_name,
    utilityState: utility.state,
    generatedAt: new Date().toISOString(),
    intake,
    monthlyImpact,
    impactLabel: monthlyImpact < 0 ? "Estimated monthly benefit" : "Estimated monthly impact",
    timeframe: scaling.timeframe,
    sourceUrl: scaling.source_url,
    sourceLabel: scaling.base_label,
    calculationNote: canScale
      ? `Scaled from the published ${scaling.base_label} reference of ${referenceUsageKwh.toLocaleString()} kWh using your ${intake.usageKwh.toLocaleString()} kWh monthly usage. This is a proportional estimate from one published usage case, not a rate published for your specific usage level. Actual bills may not scale perfectly linearly with usage because of tiered rates, fixed charges, and other factors.`
      : `The published input is an average residential bill change, not a per-kWh rate. This report keeps the sourced average instead of inventing a usage-specific rate. Your stated usage is ${intake.usageKwh.toLocaleString()} kWh per month.`,
    selectedSupplyNote,
    drivers: [
      factorDriver(utility, "grid_constraint_score"),
      factorDriver(utility, "buildout_scale_score"),
      factorDriver(utility, "rate_case_score"),
      factorDriver(utility, "tariff_protection_score"),
      factorDriver(utility, "rate_trend_score")
    ]
  };
}

function renderRateClass(rateClass) {
  return `
    <label class="report-input rate-class-field">${rateClass.label}
      <select name="rate-class">
        ${rateClass.options.map(([value, label]) => `<option value="${value}">${label}</option>`).join("")}
      </select>
    </label>
    <p class="rate-class-help">${rateClass.help}</p>
  `;
}

function factorDriver(utility, scoreKey) {
  const noteKey = scoreKey.replace("_score", "_note");
  const sourceKey = scoreKey === "tariff_protection_score" ? "tariff_source_url" : scoreKey.replace("_score", "_source_url");
  const sources = Array.isArray(utility[sourceKey]) ? utility[sourceKey] : [utility[sourceKey]];
  return {
    title: {
      grid_constraint_score: "Regional grid strain",
      buildout_scale_score: "Data-center buildout",
      rate_case_score: "Recent rate action",
      tariff_protection_score: "Large-load protections",
      rate_trend_score: "Household bill trend"
    }[scoreKey],
    score: utility[scoreKey],
    note: utility[noteKey],
    sources
  };
}

export function formatPersonalImpact(value) {
  const amount = Math.abs(Number(value));
  return `$${amount.toFixed(2)}/mo`;
}
