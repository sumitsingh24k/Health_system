function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value, digits = 1) {
  if (!Number.isFinite(value)) return 0;
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function average(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = average(values);
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function movingAverage(values, windowSize = 3) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const start = Math.max(0, values.length - Math.max(1, windowSize));
  return average(values.slice(start));
}

function resolveTrendDirection(dailyCases) {
  if (!Array.isArray(dailyCases) || dailyCases.length < 4) {
    return {
      label: "Stable",
      growthPercent: 0,
    };
  }

  const midpoint = Math.floor(dailyCases.length / 2);
  const previousAvg = average(dailyCases.slice(0, midpoint));
  const recentAvg = average(dailyCases.slice(midpoint));
  const growthPercent =
    previousAvg > 0
      ? ((recentAvg - previousAvg) / previousAvg) * 100
      : recentAvg > 0
        ? 100
        : 0;

  if (growthPercent >= 12) {
    return { label: "Increasing", growthPercent: roundTo(growthPercent, 1) };
  }
  if (growthPercent <= -10) {
    return { label: "Decreasing", growthPercent: roundTo(growthPercent, 1) };
  }
  return { label: "Stable", growthPercent: roundTo(growthPercent, 1) };
}

function detectSpike(dailyCases) {
  if (!Array.isArray(dailyCases) || dailyCases.length < 5) return false;
  const lastValue = Number(dailyCases[dailyCases.length - 1]) || 0;
  const baseline = dailyCases.slice(0, -1).map((value) => Number(value) || 0);
  const mean = average(baseline);
  const spread = stdDev(baseline);
  const threshold = mean + Math.max(3, spread * 1.4);
  return lastValue > threshold;
}

function toRiskDecision(score) {
  if (score >= 70) return "High Risk Area";
  if (score >= 40) return "Risk Under Watch";
  return "Low Risk Area";
}

function toDemandDecision(expectedUnits, growthPercent) {
  if (expectedUnits >= 180 || growthPercent >= 15) return "Demand Increasing";
  if (expectedUnits >= 70 || growthPercent >= 6) return "Demand Watch";
  return "Demand Stable";
}

function toSupplyDecision(expectedUnits, highRisk) {
  if (expectedUnits >= 160 || highRisk) return "Stock Required";
  if (expectedUnits >= 70) return "Stock Check";
  return "Stock Sufficient";
}

function toPriceDecision({ anomaly, priceComparison }) {
  if (anomaly) return "Overpriced Medicine";
  if (priceComparison && Number(priceComparison.savings) > 0) return "Cheapest Option Found";
  return "Price Normal";
}

function normalizeTopDemand(medicineDemand = []) {
  if (!Array.isArray(medicineDemand) || medicineDemand.length === 0) {
    return {
      medicine: "Paracetamol",
      expectedUnitsNext3Days: 0,
    };
  }

  const sorted = [...medicineDemand].sort(
    (a, b) => (Number(b?.expectedUnitsNext3Days) || 0) - (Number(a?.expectedUnitsNext3Days) || 0)
  );
  const top = sorted[0];
  return {
    medicine: top?.medicine || "Paracetamol",
    expectedUnitsNext3Days: Number(top?.expectedUnitsNext3Days) || 0,
    district: top?.district || null,
    village: top?.village || null,
  };
}

export function buildDecisionCenter({
  summary = {},
  riskZones = [],
  dailyTrend = [],
  medicineDemand = [],
  priceAnomalies = [],
  priceComparison = null,
}) {
  const highestZone = riskZones[0] || summary?.highestRiskArea || null;
  const highestScore = Number(highestZone?.riskScore) || 0;
  const highRisk = highestScore >= 70 || highestZone?.riskLevel === "HIGH_RISK";
  const dailyCases = Array.isArray(dailyTrend) ? dailyTrend.map((item) => Number(item?.newCases) || 0) : [];
  const trend = resolveTrendDirection(dailyCases);
  const spikeDetected = detectSpike(dailyCases);
  const topDemand = normalizeTopDemand(medicineDemand);
  const expectedUnits = Number(topDemand.expectedUnitsNext3Days) || 0;
  const fallbackExpectedUnits = Math.max(
    0,
    Math.round((Number(summary?.expectedPatientsNext2Days) || 0) * 1.6 + (highRisk ? 45 : 18))
  );
  const effectiveExpectedUnits = expectedUnits > 0 ? expectedUnits : fallbackExpectedUnits;
  const anomaly = Array.isArray(priceAnomalies) && priceAnomalies.length > 0 ? priceAnomalies[0] : null;

  const riskDecision = toRiskDecision(highestScore);
  const demandDecision = toDemandDecision(effectiveExpectedUnits, trend.growthPercent);
  const supplyDecision = toSupplyDecision(effectiveExpectedUnits, highRisk);
  const priceDecision = toPriceDecision({ anomaly, priceComparison });

  const savingsAmount = anomaly
    ? Math.max(
        0,
        roundTo(
          (Number(anomaly?.privatePrice) - Number(anomaly?.janaushadhiReference || anomaly?.averageAreaPrice || 0)) *
            Math.max(1, effectiveExpectedUnits || 1),
          0
        )
      )
    : Number(priceComparison?.savings) > 0
      ? roundTo(Number(priceComparison.savings) * Math.max(1, effectiveExpectedUnits || 1), 0)
      : 0;

  const probability = clamp(
    Number(summary?.outbreakProbabilityNext3Days ?? highestZone?.outbreakProbabilityNext3Days ?? 0),
    0,
    0.99
  );

  const decisions = [
    {
      key: "risk",
      label: "Risk",
      value: riskDecision,
      priority: highRisk ? "HIGH" : highestScore >= 40 ? "MEDIUM" : "LOW",
    },
    {
      key: "demand",
      label: "Demand",
      value: demandDecision,
      priority: effectiveExpectedUnits >= 160 ? "HIGH" : effectiveExpectedUnits >= 70 ? "MEDIUM" : "LOW",
    },
    {
      key: "supply",
      label: "Supply",
      value: supplyDecision,
      priority: supplyDecision === "Stock Required" ? "HIGH" : "MEDIUM",
    },
    {
      key: "price",
      label: "Price",
      value: priceDecision,
      priority: priceDecision === "Overpriced Medicine" ? "HIGH" : "LOW",
    },
  ];

  const actionLines = [
    `${riskDecision} in ${highestZone?.village || "selected area"}, ${highestZone?.district || "district"}.`,
    `This area will need ${effectiveExpectedUnits} units of ${topDemand.medicine} in next 48 hours.`,
  ];

  if (priceDecision === "Overpriced Medicine" && anomaly) {
    actionLines.push(
      `${anomaly.medicine || topDemand.medicine} is overpriced by ${
        Number(anomaly?.overByPercent) || 0
      }%.`
    );
  } else if (savingsAmount > 0) {
    actionLines.push(`You save Rs ${savingsAmount} using Janaushadhi.`);
  }

  if (spikeDetected) {
    actionLines.push("Spike detected in daily case trend. Trigger rapid field verification.");
  }

  return {
    statusPills: {
      risk: riskDecision,
      demand: demandDecision,
      supply: supplyDecision,
      price: priceDecision,
    },
    decisions,
    recommendedActions: actionLines.slice(0, 4),
    supplyPlan: {
      medicine: topDemand.medicine,
      requiredUnitsNext48Hours: Math.max(0, Math.round(effectiveExpectedUnits * 0.72)),
      requiredUnitsNext72Hours: effectiveExpectedUnits,
      decision: supplyDecision,
      area: {
        district: topDemand.district || highestZone?.district || null,
        village: topDemand.village || highestZone?.village || null,
      },
    },
    priceSignal: {
      decision: priceDecision,
      savingsEstimate: savingsAmount,
      medicine: anomaly?.medicine || priceComparison?.medicine || topDemand.medicine,
      privatePrice: Number(anomaly?.privatePrice ?? priceComparison?.privatePrice) || 0,
      benchmarkPrice:
        Number(anomaly?.janaushadhiReference ?? anomaly?.averageAreaPrice ?? priceComparison?.janaushadhiPrice) || 0,
    },
    trendSignal: {
      trend: trend.label,
      growthPercent: trend.growthPercent,
      spikeDetected,
      movingAverage3d: roundTo(movingAverage(dailyCases, 3), 1),
      movingAverage7d: roundTo(movingAverage(dailyCases, 7), 1),
      outbreakProbabilityNext3Days: roundTo(probability, 2),
    },
    notifications: {
      publicSmsRecommended: highRisk || probability >= 0.62 || spikeDetected,
      medicalEmailRecommended:
        highRisk || effectiveExpectedUnits >= 120 || priceDecision === "Overpriced Medicine",
    },
    focusArea: {
      district: highestZone?.district || null,
      village: highestZone?.village || null,
      riskLevel: highestZone?.riskLevel || (highRisk ? "HIGH_RISK" : "SAFE"),
      riskScore: highestScore,
    },
  };
}

export function buildRoleDecisionPack({ role, decisionCenter }) {
  const pills = decisionCenter?.statusPills || {};
  const supplyPlan = decisionCenter?.supplyPlan || {};
  const priceSignal = decisionCenter?.priceSignal || {};
  const focusArea = decisionCenter?.focusArea || {};

  const defaultTasks = [
    `Focus ${focusArea.village || "priority area"}, ${focusArea.district || "district"}.`,
    `Plan ${supplyPlan.requiredUnitsNext48Hours || 0} units of ${supplyPlan.medicine || "Paracetamol"} in next 48 hours.`,
  ];

  if (role === "ASHA") {
    return {
      role,
      primaryDecision: pills.risk || "Risk Under Watch",
      secondaryDecision: "Tasks Only",
      tasks: [
        `${pills.risk || "Risk Under Watch"}: perform household fever checks today.`,
        "Submit GPS-tagged case updates through app or WhatsApp.",
        "Escalate critical cases to nearest hospital immediately.",
      ],
    };
  }

  if (role === "MEDICAL") {
    return {
      role,
      primaryDecision: pills.demand || "Demand Watch",
      secondaryDecision: pills.price || "Price Normal",
      tasks: [
        `You should stock ${supplyPlan.requiredUnitsNext48Hours || 0} units of ${
          supplyPlan.medicine || "Paracetamol"
        }.`,
        priceSignal.decision === "Overpriced Medicine"
          ? "You are overpriced. Align price with benchmark."
          : "Maintain fair pricing against Janaushadhi benchmark.",
        "Report medicine sales daily for better demand prediction.",
      ],
    };
  }

  if (role === "HOSPITAL") {
    return {
      role,
      primaryDecision: pills.risk || "Risk Under Watch",
      secondaryDecision: pills.supply || "Stock Check",
      tasks: [
        `${pills.risk || "Risk Under Watch"}: keep triage and fever beds ready.`,
        `Prepare for medicine flow: ${supplyPlan.requiredUnitsNext48Hours || 0} units in 48h.`,
        "Coordinate with medical stores for shortage prevention.",
      ],
    };
  }

  return {
    role,
    primaryDecision: pills.risk || "Risk Under Watch",
    secondaryDecision: pills.supply || "Stock Check",
    tasks: [...defaultTasks, ...(decisionCenter?.recommendedActions || [])].slice(0, 5),
  };
}
