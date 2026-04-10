import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import HealthData from "@/app/lib/schema/healthDataSchema";
import User from "@/app/lib/schema/userschema";
import { hasCoordinates } from "@/app/lib/location-utils";
import { parseJsonBody } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 300;
const DAILY_TREND_DAYS = 14;
const WEEKLY_TREND_WEEKS = 8;
const VERIFICATION_WINDOW_HOURS = 24;
const ALLOWED_GET_ROLES = ["ADMIN", "ASHA", "HOSPITAL", "MEDICAL"];
const ALLOWED_REPORTER_ROLES = ["ASHA", "MEDICAL"];
const ALLOWED_SEVERITIES = new Set(["HIGH", "MEDIUM", "LOW"]);

function hasLocation(location) {
  return Boolean(location?.district && location?.village);
}

function locationFilter(location) {
  return {
    "location.district": location.district,
    "location.village": location.village,
  };
}

function normalizeCount(value, fallback = 0) {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 0) {
    return null;
  }
  return number;
}

function roundTo(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizePrice(value) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    return null;
  }

  return roundTo(number, 2);
}

function normalizeMedicineSales(rawSales) {
  if (!Array.isArray(rawSales)) return [];

  return rawSales
    .map((entry) => {
      const medicine = typeof entry?.medicine === "string" ? entry.medicine.trim() : "";
      const unitsSold = normalizeCount(entry?.unitsSold, 0);
      const unitPrice = normalizePrice(entry?.unitPrice);
      const benchmarkPrice = normalizePrice(entry?.benchmarkPrice);

      if (!medicine || unitsSold === null || unitPrice === null) return null;

      return {
        medicine,
        unitsSold,
        unitPrice,
        benchmarkPrice,
      };
    })
    .filter(Boolean)
    .slice(0, 20);
}

function serializeReport(report) {
  return {
    id: report._id.toString(),
    reportedBy: report.reportedBy?.toString ? report.reportedBy.toString() : report.reportedBy,
    workerId: report.workerId,
    reporterRole: report.reporterRole || "ASHA",
    location: report.location,
    disease: report.disease,
    reportDate: report.reportDate,
    householdsVisited: report.householdsVisited,
    newCases: report.newCases,
    criticalCases: report.criticalCases,
    notes: report.notes,
    medicineSales: Array.isArray(report.medicineSales) ? report.medicineSales : [],
    verification: report.verification || {
      status: "NO_COUNTERPART",
      mismatchScore: 0.5,
      reasons: [],
      counterpartReportId: null,
    },
    trustScore: Number.isFinite(report.trustScore) ? report.trustScore : 0.5,
    createdAt: report.createdAt,
    updatedAt: report.updatedAt,
  };
}

function parseCoordinate(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseDateParam(value, { endOfDay = false } = {}) {
  if (!value) return { value: null, error: null };
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return { value: null, error: "Invalid date range filter" };
  }

  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }

  return { value: date, error: null };
}

function parseSeverityFilter(value) {
  if (!value) return { values: null, error: null };

  const tokens = String(value)
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);

  if (!tokens.length) {
    return { values: null, error: null };
  }

  const unique = new Set(tokens);
  for (const token of unique) {
    if (!ALLOWED_SEVERITIES.has(token)) {
      return {
        values: null,
        error: "severity must be LOW, MEDIUM, HIGH or a comma-separated combination",
      };
    }
  }

  return { values: unique, error: null };
}

function resolveReportSeverity(report) {
  const criticalCases = Number(report?.criticalCases) || 0;
  const newCases = Number(report?.newCases) || 0;

  if (criticalCases > 0 || newCases >= 15) {
    return "HIGH";
  }

  if (newCases >= 6) {
    return "MEDIUM";
  }

  return "LOW";
}

function reportMatchesSeverity(report, severitySet) {
  if (!severitySet || severitySet.size === 0) return true;
  return severitySet.has(resolveReportSeverity(report));
}

function toUtcDayKey(inputDate) {
  const date = new Date(inputDate);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function getMondayUtc(dateInput) {
  const date = new Date(dateInput);
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function calculateMean(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  return values.reduce((acc, current) => acc + current, 0) / values.length;
}

function calculateStdDev(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  const mean = calculateMean(values);
  const variance = values.reduce((acc, current) => acc + (current - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function buildDailyTrend(reports, days = DAILY_TREND_DAYS) {
  const buckets = new Map();
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setUTCDate(today.getUTCDate() - index);
    const key = toUtcDayKey(date);
    buckets.set(key, {
      date: key,
      reports: 0,
      newCases: 0,
      criticalCases: 0,
    });
  }

  for (const report of reports) {
    const key = toUtcDayKey(report.reportDate || report.createdAt);
    const bucket = key ? buckets.get(key) : null;
    if (!bucket) continue;

    bucket.reports += 1;
    bucket.newCases += report.newCases || 0;
    bucket.criticalCases += report.criticalCases || 0;
  }

  return [...buckets.values()];
}

function buildWeeklyTrend(reports, weeks = WEEKLY_TREND_WEEKS) {
  const buckets = new Map();
  const thisWeekStart = getMondayUtc(new Date());

  for (let index = weeks - 1; index >= 0; index -= 1) {
    const start = new Date(thisWeekStart);
    start.setUTCDate(thisWeekStart.getUTCDate() - index * 7);
    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    const key = toUtcDayKey(start);
    buckets.set(key, {
      weekStart: key,
      weekEnd: toUtcDayKey(end),
      reports: 0,
      newCases: 0,
      criticalCases: 0,
    });
  }

  for (const report of reports) {
    const reportDate = new Date(report.reportDate || report.createdAt);
    if (Number.isNaN(reportDate.getTime())) continue;
    const weekStartKey = toUtcDayKey(getMondayUtc(reportDate));
    const bucket = buckets.get(weekStartKey);
    if (!bucket) continue;

    bucket.reports += 1;
    bucket.newCases += report.newCases || 0;
    bucket.criticalCases += report.criticalCases || 0;
  }

  return [...buckets.values()];
}

function buildDiseaseDistribution(reports) {
  const diseaseMap = new Map();

  for (const report of reports) {
    const disease = report?.disease || "UNKNOWN";
    const bucket = diseaseMap.get(disease) || {
      disease,
      reports: 0,
      newCases: 0,
      criticalCases: 0,
    };
    bucket.reports += 1;
    bucket.newCases += report.newCases || 0;
    bucket.criticalCases += report.criticalCases || 0;
    diseaseMap.set(disease, bucket);
  }

  const totalCases = reports.reduce((acc, report) => acc + (report.newCases || 0), 0);

  return [...diseaseMap.values()]
    .sort((a, b) => b.newCases - a.newCases)
    .slice(0, 8)
    .map((entry) => ({
      ...entry,
      percentage: totalCases > 0 ? Number(((entry.newCases / totalCases) * 100).toFixed(1)) : 0,
    }));
}

function toRiskLevel(score) {
  if (score >= 70) {
    return "HIGH_RISK";
  }
  if (score >= 40) {
    return "MEDIUM_RISK";
  }
  return "SAFE";
}

function buildRiskZones(reports) {
  const zones = new Map();

  for (const report of reports) {
    const district = report?.location?.district || "Unknown District";
    const village = report?.location?.village || "Unknown Village";
    const key = `${district}::${village}`;
    const zone = zones.get(key) || {
      key,
      district,
      village,
      reports: 0,
      newCases: 0,
      criticalCases: 0,
      trustWeightedCases: 0,
      mismatchScoreSum: 0,
      mismatchCount: 0,
      dailyCases: [],
      latitudeSum: 0,
      longitudeSum: 0,
      coordinateCount: 0,
      lastReportedAt: null,
    };

    const trust = Number.isFinite(report?.trustScore) ? report.trustScore : 0.5;
    const mismatch = Number.isFinite(report?.verification?.mismatchScore)
      ? report.verification.mismatchScore
      : 0.4;

    zone.reports += 1;
    zone.newCases += report.newCases || 0;
    zone.criticalCases += report.criticalCases || 0;
    zone.trustWeightedCases += (report.newCases || 0) * clamp(trust, 0.2, 1);
    zone.mismatchScoreSum += mismatch;
    zone.mismatchCount += 1;
    zone.dailyCases.push(report.newCases || 0);

    const latitude = report?.location?.latitude;
    const longitude = report?.location?.longitude;

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      zone.latitudeSum += latitude;
      zone.longitudeSum += longitude;
      zone.coordinateCount += 1;
    }

    const reportDate = new Date(report.reportDate || report.createdAt);
    if (!Number.isNaN(reportDate.getTime())) {
      zone.lastReportedAt =
        !zone.lastReportedAt || reportDate > zone.lastReportedAt ? reportDate : zone.lastReportedAt;
    }

    zones.set(key, zone);
  }

  return [...zones.values()]
    .map((zone) => {
      const meanCases = calculateMean(zone.dailyCases);
      const stdCases = calculateStdDev(zone.dailyCases);
      const recentAvg = calculateMean(zone.dailyCases.slice(-3));
      const previousAvg = calculateMean(zone.dailyCases.slice(-6, -3));
      const growthPercent =
        previousAvg > 0 ? ((recentAvg - previousAvg) / previousAvg) * 100 : recentAvg > 0 ? 100 : 0;
      const anomalyZ = stdCases > 0 ? (recentAvg - meanCases) / stdCases : 0;
      const mismatchAverage = zone.mismatchCount > 0 ? zone.mismatchScoreSum / zone.mismatchCount : 0.4;

      const scoreRaw =
        zone.trustWeightedCases * 0.85 +
        zone.criticalCases * 4 +
        zone.reports * 0.8 +
        Math.max(0, growthPercent) * 0.35 +
        Math.max(0, anomalyZ) * 10 -
        mismatchAverage * 18;
      const riskScore = roundTo(clamp(scoreRaw, 0, 100), 1);
      const level = toRiskLevel(riskScore);
      const probabilityNext3Days = roundTo(
        clamp(0.06 + riskScore / 120 + Math.max(0, growthPercent) / 280, 0.03, 0.98),
        2
      );
      const predictedAdditionalCases3d = Math.max(
        0,
        Math.round((recentAvg * 1.6 + zone.criticalCases * 0.5) * (0.45 + probabilityNext3Days))
      );

      const riskColor =
        level === "HIGH_RISK" ? "#dc2626" : level === "MEDIUM_RISK" ? "#f59e0b" : "#22c55e";
      const radiusMeters = Math.max(
        4200,
        Math.min(32000, 3500 + riskScore * 220 + predictedAdditionalCases3d * 120)
      );

      return {
        id: zone.key,
        district: zone.district,
        village: zone.village,
        reports: zone.reports,
        newCases: zone.newCases,
        criticalCases: zone.criticalCases,
        riskScore,
        riskLevel: level,
        riskColor,
        growthPercent: roundTo(growthPercent, 1),
        anomalyZ: roundTo(anomalyZ, 2),
        mismatchAverage: roundTo(mismatchAverage, 2),
        outbreakProbabilityNext3Days: probabilityNext3Days,
        predictedAdditionalCases3d,
        radiusMeters,
        latitude:
          zone.coordinateCount > 0 ? Number((zone.latitudeSum / zone.coordinateCount).toFixed(6)) : null,
        longitude:
          zone.coordinateCount > 0 ? Number((zone.longitudeSum / zone.coordinateCount).toFixed(6)) : null,
        lastReportedAt: zone.lastReportedAt,
      };
    })
    .sort((a, b) => b.riskScore - a.riskScore);
}

function calculateGrowthPercent(dailyTrend) {
  if (!Array.isArray(dailyTrend) || dailyTrend.length < 14) {
    return 0;
  }

  const midpoint = Math.floor(dailyTrend.length / 2);
  const previous = dailyTrend.slice(0, midpoint).reduce((acc, day) => acc + (day.newCases || 0), 0);
  const current = dailyTrend.slice(midpoint).reduce((acc, day) => acc + (day.newCases || 0), 0);

  if (previous === 0) {
    return current > 0 ? 100 : 0;
  }

  return Number((((current - previous) / previous) * 100).toFixed(1));
}

function serializeEntity(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    workerId: user.workerId || null,
    location: user.location || null,
    status: user.status,
  };
}

function buildSummary({ reports, riskZones, dailyTrend, entities }) {
  const totalReports = reports.length;
  const totalNewCases = reports.reduce((acc, report) => acc + (report.newCases || 0), 0);
  const totalCriticalCases = reports.reduce((acc, report) => acc + (report.criticalCases || 0), 0);
  const trustWeightedCases = reports.reduce(
    (acc, report) =>
      acc + (report.newCases || 0) * clamp(Number.isFinite(report?.trustScore) ? report.trustScore : 0.5, 0.2, 1),
    0
  );
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  const activeCases = reports.reduce((acc, report) => {
    const reportDate = new Date(report.reportDate || report.createdAt);
    if (Number.isNaN(reportDate.getTime()) || reportDate < sevenDaysAgo) {
      return acc;
    }
    return acc + (report.newCases || 0);
  }, 0);

  const highRiskCount = riskZones.filter((zone) => zone.riskLevel === "HIGH_RISK").length;
  const growthPercent = calculateGrowthPercent(dailyTrend);
  const weightedOutbreakProbability =
    riskZones.length > 0
      ? riskZones.reduce(
          (acc, zone) => acc + zone.outbreakProbabilityNext3Days * Math.max(0.1, zone.riskScore / 100),
          0
        ) / riskZones.reduce((acc, zone) => acc + Math.max(0.1, zone.riskScore / 100), 0)
      : 0;
  const hospitalsCount = entities?.hospitals?.length || 0;
  const medicalCount = entities?.medicalTeams?.length || 0;
  const careUnits = Math.max(1, hospitalsCount + medicalCount);
  const expectedPatientsNext2Days = Math.max(
    0,
    Math.round(activeCases * (0.2 + weightedOutbreakProbability * 0.55) + totalCriticalCases * 0.9)
  );
  const loadPercent = Math.min(
    100,
    Math.round(((expectedPatientsNext2Days + totalCriticalCases * 1.8) / (careUnits * 35)) * 100)
  );
  const predictiveIncreasePercent = Math.max(
    -40,
    Math.min(
      180,
      Math.round(growthPercent * 0.7 + highRiskCount * 6 + totalCriticalCases * 0.2 + weightedOutbreakProbability * 35)
    )
  );

  return {
    totalReports,
    totalPatients: totalNewCases,
    totalNewCases,
    totalCriticalCases,
    trustWeightedCases: roundTo(trustWeightedCases, 1),
    activeCases,
    criticalAlerts: highRiskCount,
    growthPercent,
    predictiveIncreasePercent,
    outbreakProbabilityNext3Days: roundTo(weightedOutbreakProbability, 2),
    expectedPatientsNext2Days,
    hospitalLoadPercent: loadPercent,
    highestRiskArea: riskZones[0] || null,
  };
}

function buildMedicineAnalytics(reports, riskZones) {
  const riskByArea = new Map(riskZones.map((zone) => [zone.id, zone]));
  const areaMedicine = new Map();
  const medicineTotals = new Map();
  const priceBuckets = new Map();

  for (const report of reports) {
    if (report.reporterRole !== "MEDICAL") continue;

    const district = report?.location?.district || "Unknown District";
    const village = report?.location?.village || "Unknown Village";
    const areaKey = `${district}::${village}`;
    const sales = Array.isArray(report?.medicineSales) ? report.medicineSales : [];

    for (const sale of sales) {
      const medicine = typeof sale?.medicine === "string" ? sale.medicine.trim() : "";
      const unitsSold = Number.isFinite(sale?.unitsSold) ? sale.unitsSold : 0;
      const unitPrice = Number.isFinite(sale?.unitPrice) ? sale.unitPrice : 0;
      const benchmarkPrice = Number.isFinite(sale?.benchmarkPrice) ? sale.benchmarkPrice : null;
      if (!medicine || unitsSold <= 0) continue;

      const medicineAreaKey = `${areaKey}::${medicine.toLowerCase()}`;
      const areaEntry = areaMedicine.get(medicineAreaKey) || {
        areaKey,
        district,
        village,
        medicine,
        totalUnits: 0,
        totalRevenue: 0,
        reports: 0,
      };
      areaEntry.totalUnits += unitsSold;
      areaEntry.totalRevenue += unitsSold * Math.max(unitPrice, 0);
      areaEntry.reports += 1;
      areaMedicine.set(medicineAreaKey, areaEntry);

      const totalEntry = medicineTotals.get(medicine.toLowerCase()) || {
        medicine,
        totalUnits: 0,
        totalRevenue: 0,
      };
      totalEntry.totalUnits += unitsSold;
      totalEntry.totalRevenue += unitsSold * Math.max(unitPrice, 0);
      medicineTotals.set(medicine.toLowerCase(), totalEntry);

      const prices = priceBuckets.get(medicineAreaKey) || [];
      prices.push({
        reportId: report._id?.toString ? report._id.toString() : String(report._id || ""),
        workerId: report.workerId || "UNKNOWN",
        district,
        village,
        medicine,
        unitPrice,
        benchmarkPrice,
      });
      priceBuckets.set(medicineAreaKey, prices);
    }
  }

  const demandByArea = [...areaMedicine.values()]
    .map((entry) => {
      const risk = riskByArea.get(entry.areaKey);
      const probabilityBoost = risk ? risk.outbreakProbabilityNext3Days : 0.2;
      const growthBoost = risk ? Math.max(0, risk.growthPercent) / 100 : 0;
      const baseDaily = entry.totalUnits / Math.max(1, entry.reports);
      const expectedUnitsNext3Days = Math.max(
        0,
        Math.round(baseDaily * 3 * (1 + probabilityBoost * 0.8 + growthBoost * 0.7))
      );

      return {
        district: entry.district,
        village: entry.village,
        medicine: entry.medicine,
        expectedUnitsNext3Days,
        riskLevel: risk?.riskLevel || "SAFE",
      };
    })
    .sort((a, b) => b.expectedUnitsNext3Days - a.expectedUnitsNext3Days)
    .slice(0, 12);

  const priceAnomalies = [];
  for (const entries of priceBuckets.values()) {
    const averagePrice = calculateMean(entries.map((entry) => entry.unitPrice).filter((value) => value > 0));
    if (!(averagePrice > 0)) continue;

    for (const entry of entries) {
      const overArea = entry.unitPrice > averagePrice * 1.35;
      const overBenchmark =
        Number.isFinite(entry.benchmarkPrice) && entry.benchmarkPrice > 0
          ? entry.unitPrice > entry.benchmarkPrice * 1.4
          : false;
      if (!overArea && !overBenchmark) continue;

      const reference = overBenchmark ? entry.benchmarkPrice : averagePrice;
      const overByPercent = reference > 0 ? ((entry.unitPrice - reference) / reference) * 100 : 0;
      priceAnomalies.push({
        reportId: entry.reportId,
        workerId: entry.workerId,
        district: entry.district,
        village: entry.village,
        medicine: entry.medicine,
        privatePrice: roundTo(entry.unitPrice, 2),
        janaushadhiReference: Number.isFinite(entry.benchmarkPrice) ? roundTo(entry.benchmarkPrice, 2) : null,
        averageAreaPrice: roundTo(averagePrice, 2),
        overByPercent: roundTo(overByPercent, 1),
        flag: "OVERPRICED",
      });
    }
  }

  const topMedicines = [...medicineTotals.values()]
    .sort((a, b) => b.totalUnits - a.totalUnits)
    .slice(0, 8)
    .map((entry) => ({
      medicine: entry.medicine,
      totalUnits: entry.totalUnits,
      averageUnitPrice: entry.totalUnits > 0 ? roundTo(entry.totalRevenue / entry.totalUnits, 2) : 0,
    }));

  return {
    demandByArea,
    topMedicines,
    priceAnomalies: priceAnomalies.sort((a, b) => b.overByPercent - a.overByPercent).slice(0, 12),
  };
}

function buildAiInsights(reports, riskZones, medicineAnalytics) {
  const trustByReporter = new Map();
  for (const report of reports) {
    const key = `${report.workerId || report.reportedBy || "unknown"}::${report.reporterRole || "ASHA"}`;
    const bucket = trustByReporter.get(key) || {
      workerId: report.workerId || "UNKNOWN",
      reporterRole: report.reporterRole || "ASHA",
      district: report?.location?.district || "Unknown District",
      village: report?.location?.village || "Unknown Village",
      reports: 0,
      trustScoreSum: 0,
      mismatchSum: 0,
    };

    const trustScore = Number.isFinite(report?.trustScore) ? report.trustScore : 0.5;
    const mismatch = Number.isFinite(report?.verification?.mismatchScore)
      ? report.verification.mismatchScore
      : 0.4;
    bucket.reports += 1;
    bucket.trustScoreSum += trustScore;
    bucket.mismatchSum += mismatch;
    trustByReporter.set(key, bucket);
  }

  const trustWatchlist = [...trustByReporter.values()]
    .map((entry) => ({
      workerId: entry.workerId,
      reporterRole: entry.reporterRole,
      district: entry.district,
      village: entry.village,
      reports: entry.reports,
      avgTrustScore: roundTo(entry.trustScoreSum / Math.max(entry.reports, 1), 2),
      avgMismatchScore: roundTo(entry.mismatchSum / Math.max(entry.reports, 1), 2),
    }))
    .filter((entry) => entry.avgTrustScore < 0.5 || entry.avgMismatchScore > 0.55)
    .sort((a, b) => a.avgTrustScore - b.avgTrustScore)
    .slice(0, 10);

  const mismatchReports = reports
    .filter((report) => (report?.verification?.status || "") === "HIGH_MISMATCH")
    .slice(0, 10)
    .map((report) => ({
      id: report._id?.toString ? report._id.toString() : String(report._id || ""),
      workerId: report.workerId || "UNKNOWN",
      reporterRole: report.reporterRole || "ASHA",
      district: report?.location?.district || "Unknown District",
      village: report?.location?.village || "Unknown Village",
      mismatchScore: roundTo(report?.verification?.mismatchScore || 0.5, 2),
      reasons: Array.isArray(report?.verification?.reasons) ? report.verification.reasons : [],
    }));

  return {
    topHighRiskZones: riskZones.slice(0, 6).map((zone) => ({
      id: zone.id,
      district: zone.district,
      village: zone.village,
      riskLevel: zone.riskLevel,
      riskScore: zone.riskScore,
      outbreakProbabilityNext3Days: zone.outbreakProbabilityNext3Days,
      predictedAdditionalCases3d: zone.predictedAdditionalCases3d,
    })),
    emergingHotspots: riskZones
      .filter((zone) => zone.growthPercent >= 12 && zone.riskScore >= 35)
      .slice(0, 6),
    trustWatchlist,
    mismatchReports,
    medicineDemand: medicineAnalytics.demandByArea,
    topMedicinesSold: medicineAnalytics.topMedicines,
    priceAnomalies: medicineAnalytics.priceAnomalies,
  };
}

function buildAlerts(summary, riskZones) {
  const alerts = [];
  const highestZone = summary?.highestRiskArea;

  if (highestZone?.riskLevel === "HIGH_RISK") {
    alerts.push({
      type: "high-risk",
      severity: "HIGH",
      title: "High risk area detected",
      description: `${highestZone.village}, ${highestZone.district} risk score ${highestZone.riskScore} with ${Math.round(
        highestZone.outbreakProbabilityNext3Days * 100
      )}% outbreak probability in next 2-3 days.`,
      district: highestZone.district,
      village: highestZone.village,
    });
  }

  if (summary?.growthPercent > 0) {
    alerts.push({
      type: "case-growth",
      severity: summary.growthPercent > 25 ? "HIGH" : "MEDIUM",
      title: "Cases are increasing",
      description: `Last 7-day caseload is up ${summary.growthPercent}% vs previous 7 days.`,
    });
  }

  if ((summary?.hospitalLoadPercent || 0) >= 80) {
    alerts.push({
      type: "hospital-load",
      severity: "HIGH",
      title: "Healthcare load is nearing capacity",
      description: `Estimated ${summary.expectedPatientsNext2Days} patients in next 2 days. Care load is ${summary.hospitalLoadPercent}%.`,
    });
  }

  if (!alerts.length && riskZones.length) {
    alerts.push({
      type: "stable",
      severity: "LOW",
      title: "Situation stable",
      description: "No severe outbreak signals detected right now.",
    });
  }

  return alerts;
}

function evaluateCounterpartMatch({ reportRole, disease, newCases, criticalCases, counterpart }) {
  if (!counterpart) {
    return {
      status: "NO_COUNTERPART",
      mismatchScore: 0.5,
      reasons: [
        `No ${reportRole === "ASHA" ? "MEDICAL" : "ASHA"} counterpart submission found in recent window`,
      ],
      counterpartReportId: null,
    };
  }

  const caseDenominator = Math.max(newCases, counterpart.newCases || 0, 1);
  const criticalDenominator = Math.max(criticalCases, counterpart.criticalCases || 0, 1);
  const caseDeltaRatio = Math.abs(newCases - (counterpart.newCases || 0)) / caseDenominator;
  const criticalDeltaRatio =
    Math.abs(criticalCases - (counterpart.criticalCases || 0)) / criticalDenominator;
  const diseaseMatches =
    normalizeText(disease) && normalizeText(disease) === normalizeText(counterpart.disease || "");

  let mismatchScore = caseDeltaRatio * 0.7 + criticalDeltaRatio * 0.2 + (diseaseMatches ? 0 : 0.1);
  mismatchScore = clamp(mismatchScore, 0, 1);

  const reasons = [];
  if (caseDeltaRatio > 0.45) {
    reasons.push("Case count differs strongly from counterpart report");
  } else {
    reasons.push("Case count aligns with counterpart signal");
  }

  if (!diseaseMatches) {
    reasons.push("Disease labels do not match counterpart report");
  } else {
    reasons.push("Disease labels are aligned");
  }

  if (criticalDeltaRatio > 0.55) {
    reasons.push("Critical case trend mismatch detected");
  }

  const status =
    mismatchScore >= 0.65 ? "HIGH_MISMATCH" : mismatchScore >= 0.35 ? "PARTIAL_MISMATCH" : "MATCHED";

  return {
    status,
    mismatchScore: roundTo(mismatchScore, 2),
    reasons,
    counterpartReportId: counterpart?._id || null,
  };
}

function estimateSelfPricePenalty(medicineSales) {
  if (!Array.isArray(medicineSales) || medicineSales.length === 0) return 0;

  let penalty = 0;
  for (const sale of medicineSales) {
    const price = Number(sale?.unitPrice) || 0;
    const benchmark = Number(sale?.benchmarkPrice);
    if (price <= 0 || !Number.isFinite(benchmark) || benchmark <= 0) continue;
    if (price > benchmark * 1.4) {
      penalty += clamp((price - benchmark) / benchmark, 0, 1) * 0.08;
    }
  }

  return clamp(penalty, 0, 0.25);
}

async function computeTrustScore({
  reportedBy,
  reporterRole,
  mismatchScore,
  newCases,
  district,
  village,
  reportDate,
  medicineSales,
}) {
  const [history, locationHistory] = await Promise.all([
    HealthData.find({ reportedBy, reporterRole })
      .sort({ reportDate: -1, createdAt: -1 })
      .limit(15)
      .select("newCases verification")
      .lean(),
    HealthData.find({
      reporterRole,
      "location.district": district,
      "location.village": village,
      reportDate: { $gte: new Date(reportDate.getTime() - 1000 * 60 * 60 * 24 * 7) },
    })
      .sort({ reportDate: -1, createdAt: -1 })
      .limit(25)
      .select("newCases")
      .lean(),
  ]);

  const historyMismatch = history
    .map((item) => (Number.isFinite(item?.verification?.mismatchScore) ? item.verification.mismatchScore : 0.4))
    .filter((value) => Number.isFinite(value));
  const historyCases = history
    .map((item) => (Number.isFinite(item?.newCases) ? item.newCases : 0))
    .filter((value) => Number.isFinite(value));
  const neighborhoodCases = locationHistory
    .map((item) => (Number.isFinite(item?.newCases) ? item.newCases : 0))
    .filter((value) => Number.isFinite(value));

  const avgMismatch = historyMismatch.length > 0 ? calculateMean(historyMismatch) : 0.4;
  const caseStdDev = calculateStdDev(historyCases);
  const consistency = 1 / (1 + caseStdDev / 8);

  const neighborhoodAvg = neighborhoodCases.length > 0 ? calculateMean(neighborhoodCases) : newCases;
  const neighborhoodDeviation =
    neighborhoodAvg > 0 ? Math.abs(newCases - neighborhoodAvg) / neighborhoodAvg : newCases > 0 ? 1 : 0;
  const deviationPenalty = clamp(neighborhoodDeviation * 0.12, 0, 0.18);
  const pricePenalty = reporterRole === "MEDICAL" ? estimateSelfPricePenalty(medicineSales) : 0;

  const trustScoreRaw =
    (1 - mismatchScore) * 0.55 + (1 - avgMismatch) * 0.25 + clamp(consistency, 0, 1) * 0.2 - deviationPenalty - pricePenalty;

  return roundTo(clamp(trustScoreRaw, 0.05, 0.99), 3);
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || (role !== "ASHA" && role !== "MEDICAL")) {
    return Response.json(
      { message: "Only ASHA and MEDICAL can submit health data" },
      { status: 401 }
    );
  }

  if (!hasLocation(session.user.location)) {
    return Response.json({ message: "User location is missing" }, { status: 400 });
  }

  const { body, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  try {
    const householdsVisited = normalizeCount(body?.householdsVisited, 0);
    const newCases = normalizeCount(body?.newCases, null);
    const criticalCases = normalizeCount(body?.criticalCases, 0);
    const disease = typeof body?.disease === "string" ? body.disease.trim() : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
    const medicineSales = normalizeMedicineSales(body?.medicineSales);
    const reportDate = body?.reportDate ? new Date(body.reportDate) : new Date();
    const latitude = parseCoordinate(body?.latitude);
    const longitude = parseCoordinate(body?.longitude);

    if (householdsVisited === null || newCases === null || criticalCases === null) {
      return Response.json(
        { message: "householdsVisited, newCases, and criticalCases must be non-negative integers" },
        { status: 400 }
      );
    }

    if (!disease) {
      return Response.json({ message: "disease is required" }, { status: 400 });
    }

    if (latitude === null || longitude === null) {
      return Response.json(
        { message: "latitude and longitude must be valid numbers" },
        { status: 400 }
      );
    }

    if ((latitude === undefined) !== (longitude === undefined)) {
      return Response.json(
        { message: "latitude and longitude must be provided together" },
        { status: 400 }
      );
    }

    if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
      return Response.json({ message: "latitude must be between -90 and 90" }, { status: 400 });
    }

    if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
      return Response.json(
        { message: "longitude must be between -180 and 180" },
        { status: 400 }
      );
    }

    if (criticalCases > newCases) {
      return Response.json(
        { message: "criticalCases cannot be greater than newCases" },
        { status: 400 }
      );
    }

    if (Number.isNaN(reportDate.getTime())) {
      return Response.json({ message: "Invalid reportDate" }, { status: 400 });
    }

    if (role === "MEDICAL" && body?.medicineSales && !medicineSales.length) {
      return Response.json(
        { message: "medicineSales format is invalid. Provide medicine, unitsSold, unitPrice." },
        { status: 400 }
      );
    }

    await dbConnect();

    const sessionHasCoordinates = hasCoordinates(session.user.location);
    const resolvedLatitude =
      latitude !== undefined ? latitude : sessionHasCoordinates ? session.user.location.latitude : undefined;
    const resolvedLongitude =
      longitude !== undefined ? longitude : sessionHasCoordinates ? session.user.location.longitude : undefined;

    if ((resolvedLatitude === undefined) !== (resolvedLongitude === undefined)) {
      return Response.json({ message: "Missing coordinates for this report" }, { status: 400 });
    }

    if (resolvedLatitude === undefined || resolvedLongitude === undefined) {
      return Response.json(
        { message: "GPS coordinates are required. Provide latitude and longitude." },
        { status: 400 }
      );
    }

    const resolvedWorkerId =
      role === "ASHA"
        ? session.user.workerId
        : `MEDICAL_${String(session.user.id || "").slice(-6).toUpperCase() || "USER"}`;

    if (!resolvedWorkerId) {
      return Response.json({ message: "Reporter ID is missing for this account" }, { status: 400 });
    }

    const counterpartRole = role === "ASHA" ? "MEDICAL" : "ASHA";
    const counterpartStart = new Date(reportDate.getTime() - VERIFICATION_WINDOW_HOURS * 60 * 60 * 1000);
    const counterpart = await HealthData.findOne({
      reporterRole: counterpartRole,
      "location.district": session.user.location.district,
      "location.village": session.user.location.village,
      reportDate: { $gte: counterpartStart, $lte: reportDate },
    })
      .sort({ reportDate: -1, createdAt: -1 })
      .lean();

    const verification = evaluateCounterpartMatch({
      reportRole: role,
      disease,
      newCases,
      criticalCases,
      counterpart,
    });

    const trustScore = await computeTrustScore({
      reportedBy: session.user.id,
      reporterRole: role,
      mismatchScore: verification.mismatchScore,
      newCases,
      district: session.user.location.district,
      village: session.user.location.village,
      reportDate,
      medicineSales,
    });

    const report = await HealthData.create({
      reportedBy: session.user.id,
      workerId: resolvedWorkerId,
      reporterRole: role,
      location: {
        village: session.user.location.village,
        district: session.user.location.district,
        latitude: resolvedLatitude,
        longitude: resolvedLongitude,
      },
      disease,
      reportDate,
      householdsVisited,
      newCases,
      criticalCases,
      notes,
      medicineSales: role === "MEDICAL" ? medicineSales : [],
      verification: {
        status: verification.status,
        mismatchScore: verification.mismatchScore,
        reasons: verification.reasons,
        counterpartReportId: verification.counterpartReportId,
      },
      trustScore,
    });

    return Response.json(
      { message: "Health data submitted", data: serializeReport(report) },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/health-data/post", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to submit health data", error: reason },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const role = session?.user?.role;

  if (!session || !ALLOWED_GET_ROLES.includes(role)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const url = new URL(request.url);
    const limitValue = Number(url.searchParams.get("limit") || DEFAULT_LIMIT);
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, MAX_LIMIT) : DEFAULT_LIMIT;
    const query = {};
    const disease = (url.searchParams.get("disease") || "").trim();
    const reporterRole = url.searchParams.get("reporterRole");
    const district = (url.searchParams.get("district") || "").trim();
    const village = (url.searchParams.get("village") || "").trim();
    const includeEntities = url.searchParams.get("includeEntities") !== "false";

    const { value: startDate, error: startDateError } = parseDateParam(
      url.searchParams.get("startDate"),
      { endOfDay: false }
    );
    const { value: endDate, error: endDateError } = parseDateParam(url.searchParams.get("endDate"), {
      endOfDay: true,
    });
    if (startDateError || endDateError) {
      return Response.json({ message: startDateError || endDateError }, { status: 400 });
    }
    if (startDate && endDate && startDate > endDate) {
      return Response.json({ message: "startDate cannot be after endDate" }, { status: 400 });
    }

    const { values: severityFilter, error: severityError } = parseSeverityFilter(
      url.searchParams.get("severity")
    );
    if (severityError) {
      return Response.json({ message: severityError }, { status: 400 });
    }

    if (disease) {
      query.disease = {
        $regex: `^${escapeRegex(disease)}$`,
        $options: "i",
      };
    }

    if (reporterRole && ALLOWED_REPORTER_ROLES.includes(reporterRole)) {
      query.reporterRole = reporterRole;
    }

    if (startDate || endDate) {
      query.reportDate = {};
      if (startDate) query.reportDate.$gte = startDate;
      if (endDate) query.reportDate.$lte = endDate;
    }

    let roleScope = "global";

    if (role === "ADMIN") {
      if (district) {
        query["location.district"] = district;
        roleScope = `district:${district}`;
      }

      if (village) {
        query["location.village"] = village;
        roleScope = `village:${village}`;
      }
    } else if (role === "ASHA") {
      if (!hasLocation(session.user.location)) {
        return Response.json({ message: "User location is missing" }, { status: 400 });
      }

      Object.assign(query, locationFilter(session.user.location));
      roleScope = `${session.user.location.village}, ${session.user.location.district}`;
    } else {
      if (!hasLocation(session.user.location)) {
        return Response.json({ message: "User location is missing" }, { status: 400 });
      }

      if (role === "HOSPITAL") {
        query["location.district"] = session.user.location.district;
        if (village) {
          query["location.village"] = village;
        }
        roleScope = `${session.user.location.district} region`;
      } else {
        Object.assign(query, locationFilter(session.user.location));
        roleScope = `${session.user.location.village}, ${session.user.location.district}`;
      }
    }

    const mongoLimit = severityFilter ? Math.min(limit * 3, MAX_LIMIT) : limit;

    const matchedReports = await HealthData.find(query)
      .sort({ reportDate: -1, createdAt: -1 })
      .limit(mongoLimit)
      .lean();

    const reports = matchedReports
      .filter((report) => reportMatchesSeverity(report, severityFilter))
      .slice(0, limit);

    let entities = {
      ashaWorkers: [],
      hospitals: [],
      medicalTeams: [],
    };

    if (includeEntities) {
      const entityQuery = {
        $or: [
          { role: "ASHA" },
          { role: { $in: ["HOSPITAL", "MEDICAL"] }, status: "APPROVED" },
        ],
      };

      if (role !== "ADMIN" && hasLocation(session.user.location)) {
        entityQuery["location.district"] = session.user.location.district;
        if (role === "ASHA" || role === "MEDICAL") {
          entityQuery["location.village"] = session.user.location.village;
        }
      }

      const users = await User.find(entityQuery)
        .select("_id name email role workerId location status")
        .lean();

      entities = users.reduce(
        (acc, current) => {
          const serialized = serializeEntity(current);

          if (current.role === "ASHA") {
            acc.ashaWorkers.push(serialized);
          } else if (current.role === "HOSPITAL") {
            acc.hospitals.push(serialized);
          } else if (current.role === "MEDICAL") {
            acc.medicalTeams.push(serialized);
          }

          return acc;
        },
        { ashaWorkers: [], hospitals: [], medicalTeams: [] }
      );
    }

    const dailyTrend = buildDailyTrend(reports);
    const weeklyTrend = buildWeeklyTrend(reports);
    const diseaseDistribution = buildDiseaseDistribution(reports);
    const riskZones = buildRiskZones(reports);
    const medicineAnalytics = buildMedicineAnalytics(reports, riskZones);
    const aiInsights = buildAiInsights(reports, riskZones, medicineAnalytics);
    const summary = buildSummary({
      reports,
      riskZones,
      dailyTrend,
      entities,
    });
    const alerts = buildAlerts(summary, riskZones);

    return Response.json({
      count: reports.length,
      data: reports.map(serializeReport),
      summary,
      alerts,
      diseaseDistribution,
      riskZones,
      aiInsights,
      trends: {
        daily: dailyTrend,
        weekly: weeklyTrend,
      },
      entities,
      meta: {
        roleScope,
        filters: {
          district: district || null,
          village: village || null,
          disease: disease || null,
          reporterRole: reporterRole || null,
          startDate,
          endDate,
          severity: severityFilter ? [...severityFilter] : null,
        },
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logServerError("api/health-data/get", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to fetch health data", error: reason },
      { status: 500 }
    );
  }
}
