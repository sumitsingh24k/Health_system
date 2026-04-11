import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import HealthData from "@/app/lib/schema/healthDataSchema";
import User from "@/app/lib/schema/userschema";
import { hasCoordinates } from "@/app/lib/location-utils";
import { parseJsonBody } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";
import { buildDecisionCenter, buildRoleDecisionPack } from "@/app/lib/decision-engine";

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 300;
const DAILY_TREND_DAYS = 14;
const WEEKLY_TREND_WEEKS = 8;
const VERIFICATION_WINDOW_HOURS = 24;
const ALLOWED_GET_ROLES = ["ADMIN", "ASHA", "HOSPITAL", "MEDICAL"];
const ALLOWED_REPORTER_ROLES = ["ASHA", "MEDICAL"];
const ALLOWED_SEVERITIES = new Set(["HIGH", "MEDIUM", "LOW"]);
const OUTBREAK_WEBHOOK_URL = (process.env.OUTBREAK_WEBHOOK_URL || "").trim();
const OUTBREAK_WEBHOOK_TOKEN = (process.env.OUTBREAK_WEBHOOK_TOKEN || "").trim();
const OUTBREAK_ALERT_EMAIL_TO = (process.env.OUTBREAK_ALERT_EMAIL_TO || "").trim();
const RESEND_API_KEY = (process.env.RESEND_API_KEY || "").trim();
const SMTP_HOST = (process.env.SMTP_HOST || "").trim();
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = (process.env.SMTP_USER || "").trim();
const SMTP_PASS = (process.env.SMTP_PASS || "").trim();
const SMTP_FROM = (process.env.SMTP_FROM || "alerts@health-system.local").trim();
const TWILIO_ACCOUNT_SID = (process.env.TWILIO_ACCOUNT_SID || "").trim();
const TWILIO_AUTH_TOKEN = (process.env.TWILIO_AUTH_TOKEN || "").trim();
const TWILIO_FROM_NUMBER = (process.env.TWILIO_FROM_NUMBER || "").trim();
const OUTBREAK_SMS_TO = (process.env.OUTBREAK_SMS_TO || "").trim();
const OUTBREAK_NOTIFY_COOLDOWN_MS = 20 * 60 * 1000;
const DEFAULT_RADIUS_KM = 18;
const MIN_RADIUS_KM = 2;
const MAX_RADIUS_KM = 80;

// ============ PHASE 3: BACKEND AI SERVICE CONFIGURATION ============
const BACKEND_BASE_URL = (process.env.BACKEND_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").trim();
const PREDICTION_TIMEOUT_MS = 12000; // 12 seconds timeout for LLM predictions

// ============ PHASE 1: VALIDATION CONSTANTS ============
const MEDICINE_PRICE_MIN = 0.1;
const MEDICINE_PRICE_MAX = 10000;
const MEDICINE_STOCK_MIN = 0;
const MEDICINE_STOCK_MAX = 999999;
const CASE_COUNT_MIN = 1;
const CASE_COUNT_MAX = 10000;
const HOUSEHOLDS_VISITED_MAX = 50000;
const PRICE_TO_BENCHMARK_MAX_RATIO = 2.0; // Price cannot be > 200% of benchmark
const DEDUP_WINDOW_HOURS = 1; // Reports within 1 hour from same worker = potential duplicate
const ALLOWED_DISEASES = new Set([
  "DENGUE", "MALARIA", "TYPHOID", "CHOLERA", "COVID", "INFLUENZA",
  "MEASLES", "CHICKENPOX", "TUBERCULOSIS", "HEPATITIS", "PNEUMONIA",
  "VIRAL_FEVER", "GENERAL_FEVER", "UNKNOWN", "OTHER"
]);

function hasLocation(location) {
  return Boolean(location?.district && location?.village);
}

// Validate disease is in allowed list
function validateDisease(disease) {
  const normalized = normalizeText(disease);
  const mapped = normalized
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
  
  if (!mapped || !ALLOWED_DISEASES.has(mapped)) {
    return { valid: false, error: `Disease "${disease}" not recognized. Allowed: ${[...ALLOWED_DISEASES].join(", ")}` };
  }
  return { valid: true, normalized: mapped, error: null };
}

// Check for duplicate report from same worker within dedup window
async function checkDuplicate(reportedBy, reporterRole, location, reportDate) {
  const windowStart = new Date(reportDate.getTime() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000);
  const recent = await HealthData.findOne({
    reportedBy,
    reporterRole,
    "location.district": location.district,
    "location.village": location.village,
    reportDate: { $gte: windowStart, $lte: reportDate },
    createdAt: { $gte: new Date(Date.now() - DEDUP_WINDOW_HOURS * 60 * 60 * 1000) },
  }).lean();
  
  if (recent) {
    return { isDuplicate: true, existingReportId: recent._id, createdMinutesAgo: Math.round((Date.now() - recent.createdAt) / 60000) };
  }
  return { isDuplicate: false };
}

// ============ PHASE 2: ROLE-BASED DATA FILTERING ============
/**
 * Filter reports based on user role
 * - ASHA: Only see own ASHA reports + other ASHA reports in same area (no medicine prices)
 * - MEDICAL: See own pharmacy reports + ASHA reports for cross-verification (hide other pharmacy internal data)
 * - HOSPITAL: See ASHA + MEDICAL reports (actionable data, hide worker identities)
 * - ADMIN: See all reports unfiltered
 */
function filterReportsByRole(reports, role, userLocation) {
  if (role === "ADMIN") {
    return reports; // Admin sees all
  }

  return reports.map((report) => {
    const filtered = { ...report };

    if (role === "ASHA") {
      // ASHA can only see ASHA reports, hide sensitive fields
      if (filtered.reporterRole !== "ASHA") {
        return null; // Don't include non-ASHA reports
      }
      // Hide medical pricing data
      filtered.medicineSales = [];
    } else if (role === "MEDICAL") {
      // MEDICAL sees own pharmacy + ASHA reports (for cross-check)
      if (filtered.reporterRole === "MEDICAL" && filtered.reportedBy !== userLocation?.workerId) {
        // Hide other pharmacy internal data (prices, stock)
        filtered.medicineSales = [];
        filtered.notes = "[Hidden - Other pharmacy data]";
      }
      // Allow ASHA reports to stay fully visible for cross-verification
    } else if (role === "HOSPITAL") {
      // HOSPITAL sees ASHA + MEDICAL reports (not internal analysis)
      if (filtered.reporterRole !== "ASHA" && filtered.reporterRole !== "MEDICAL") {
        return null;
      }
      // For MEDICAL reports, hide individual worker identity but show aggregate insights
      if (filtered.reporterRole === "MEDICAL") {
        filtered.workerId = "[Pharmacy Report]";
      }
      // Hide verification details (internal checks)
      filtered.verification = {
        status: filtered.verification?.status || "UNKNOWN",
        mismatchScore: undefined, // Don't expose internal scores
        reasons: [],
        counterpartReportId: undefined,
      };
    }

    return filtered;
  }).filter(Boolean); // Remove nulled entries
}

/**
 * Sanitize entities (workers/hospitals) based on role visibility
 */
function filterEntitiesByRole(entities, role, userLocation) {
  if (role === "ADMIN") {
    return entities; // Admin sees all entities
  }

  const filtered = { ...entities };

  if (role === "ASHA") {
    // ASHA sees only ASHA workers and hospitals (not medical shops/other ASHAs' details)
    filtered.ashaWorkers = []; // Don't expose other worker info
    filtered.medicalTeams = []; // Don't expose pharmacy details
  } else if (role === "MEDICAL") {
    // MEDICAL sees hospitals and ASHA summary, not other pharmacies
    filtered.ashaWorkers = filtered.ashaWorkers.map((w) => ({
      ...w,
      workerId: "[ASHA Report]", // Anonymize worker ID
    }));
    filtered.medicalTeams = []; // Hide other pharmacies
  } else if (role === "HOSPITAL") {
    // HOSPITAL sees ASHA + anonymized pharmacy counts, not specific worker details
    filtered.ashaWorkers = filtered.ashaWorkers.slice(0, 3); // Only summary count
    filtered.medicalTeams = filtered.medicalTeams.map((m) => ({
      ...m,
      email: undefined, // Hide contact info
      workerId: undefined,
    }));
  }

  return filtered;
}

// ============ PHASE 3: BACKEND AI SERVICE INTEGRATION ============
/**
 * Call Python backend AI service to get outbreak predictions
 * Returns {riskScore, probability, predictions} or null if backend unavailable
 */
async function callBackendPredictionService(location, disease, recentReports) {
  if (!BACKEND_BASE_URL || BACKEND_BASE_URL === "http://localhost:8000") {
    // Backend not configured, skip
    return null;
  }

  try {
    const recentCases = recentReports.reduce((sum, r) => sum + (r.newCases || 0), 0);
    const recentCriticalCases = recentReports.reduce((sum, r) => sum + (r.criticalCases || 0), 0);
    const durationDays = recentReports.length > 0 ? 7 : 1;

    const payload = {
      location: {
        district: location.district,
        village: location.village,
        latitude: location.latitude,
        longitude: location.longitude,
      },
      disease: disease || "GENERAL_FEVER",
      cases: recentCases || 1,
      critical_cases: recentCriticalCases || 0,
      duration_days: durationDays,
      recent_reports: recentReports.slice(0, 10).map((r) => ({
        cases: r.newCases,
        disease: r.disease,
        critical: r.criticalCases,
      })), // Last 10 reports context
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), PREDICTION_TIMEOUT_MS);

    const response = await fetch(`${BACKEND_BASE_URL}/api/v1/predictions/outbreak`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Backend returned ${response.status}: ${errorText}`);
    }

    const prediction = await response.json();
    return {
      source: "backend_ai",
      riskScore: Number.isFinite(prediction.risk_score) ? prediction.risk_score : null,
      outbreakProbability: Number.isFinite(prediction.outbreak_probability_next_3_days)
        ? prediction.outbreak_probability_next_3_days
        : null,
      predictedCases: Number.isFinite(prediction.predicted_cases_next_7_days)
        ? prediction.predicted_cases_next_7_days
        : null,
      recommendations: Array.isArray(prediction.recommended_action) ? prediction.recommended_action : [],
    };
  } catch (error) {
    if (error.name === "AbortError") {
      logServerError("api/health-data/prediction-timeout", new Error(`Backend prediction timed out after ${PREDICTION_TIMEOUT_MS}ms`));
    } else {
      logServerError("api/health-data/prediction-error", error);
    }
    return null; // Fall back to heuristics
  }
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

// ============ PHASE 1: ENHANCED MEDICINE SALES VALIDATION ============
function normalizeMedicineSales(rawSales) {
  if (!Array.isArray(rawSales)) return { sales: [], errors: [] };

  const sales = [];
  const errors = [];

  rawSales.forEach((entry, idx) => {
    const lineNum = idx + 1;
    const medicine = typeof entry?.medicine === "string" ? entry.medicine.trim() : "";
    const unitsSold = normalizeCount(entry?.unitsSold, 0);
    const unitPrice = normalizePrice(entry?.unitPrice);
    const benchmarkPrice = normalizePrice(entry?.benchmarkPrice);
    const currentStock = normalizeCount(entry?.currentStock, 0);
    const incomingStock = normalizeCount(entry?.incomingStock, 0);

    // Validation checks
    if (!medicine) {
      errors.push(`Line ${lineNum}: medicine name is required`);
      return;
    }
    if (unitsSold === null) {
      errors.push(`Line ${lineNum}: unitsSold must be a non-negative integer`);
      return;
    }
    if (unitPrice === null) {
      errors.push(`Line ${lineNum}: unitPrice must be a valid positive number`);
      return;
    }
    if (currentStock === null) {
      errors.push(`Line ${lineNum}: currentStock must be a non-negative integer`);
      return;
    }
    if (incomingStock === null) {
      errors.push(`Line ${lineNum}: incomingStock must be a non-negative integer`);
      return;
    }

    // Range checks
    if (unitPrice < MEDICINE_PRICE_MIN || unitPrice > MEDICINE_PRICE_MAX) {
      errors.push(`Line ${lineNum}: unitPrice must be between ${MEDICINE_PRICE_MIN} and ${MEDICINE_PRICE_MAX}`);
      return;
    }
    if (currentStock < MEDICINE_STOCK_MIN || currentStock > MEDICINE_STOCK_MAX) {
      errors.push(`Line ${lineNum}: currentStock must be between ${MEDICINE_STOCK_MIN} and ${MEDICINE_STOCK_MAX}`);
      return;
    }
    if (incomingStock < MEDICINE_STOCK_MIN || incomingStock > MEDICINE_STOCK_MAX) {
      errors.push(`Line ${lineNum}: incomingStock must be between ${MEDICINE_STOCK_MIN} and ${MEDICINE_STOCK_MAX}`);
      return;
    }

    // Sanity checks
    if (benchmarkPrice && benchmarkPrice > 0 && unitPrice > benchmarkPrice * PRICE_TO_BENCHMARK_MAX_RATIO) {
      errors.push(`Line ${lineNum}: WARNING - unitPrice ₹${unitPrice} is > 200% of benchmarkPrice ₹${benchmarkPrice}. Please verify data entry.`);
      // Don't return - just warn, still accept the data
    }

    sales.push({
      medicine,
      unitsSold,
      unitPrice,
      benchmarkPrice,
      currentStock,
      incomingStock,
    });
  });

  return { sales: sales.slice(0, 20), errors };
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

function parseOptionalNumber(value, label) {
  if (value === undefined || value === null || value === "") {
    return { value: null, error: null };
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return { value: null, error: `${label} must be a valid number` };
  }

  return { value: number, error: null };
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const start =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(start), Math.sqrt(1 - start));
}

function withinRadius(location, centerLatitude, centerLongitude, radiusKm) {
  const latitude = Number(location?.latitude);
  const longitude = Number(location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  const distanceKm = haversineDistanceKm(centerLatitude, centerLongitude, latitude, longitude);
  return Number.isFinite(distanceKm) && distanceKm <= radiusKm;
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

// ============ PHASE 4: DISEASE-SPECIFIC DEMAND MULTIPLIERS ============
// Medicine demand varies significantly by disease type
// Based on typical treatment protocols and symptom patterns
const DISEASE_MEDICINE_MULTIPLIERS = {
  DENGUE: { multiplier: 1.8, keyMedicines: ["Paracetamol", "Ibuprofen", "Platelet"] },
  MALARIA: { multiplier: 1.6, keyMedicines: ["Artemether", "Quinine", "Paracetamol"] },
  TYPHOID: { multiplier: 1.2, keyMedicines: ["Ceftriaxone", "Chloramphenicol", "Paracetamol"] },
  CHOLERA: { multiplier: 2.5, keyMedicines: ["ORS", "Ciprofloxacin", "Zinc"] },
  COVID: { multiplier: 1.4, keyMedicines: ["Remdesivir", "Dexamethasone", "Paracetamol"] },
  INFLUENZA: { multiplier: 1.3, keyMedicines: ["Oseltamivir", "Paracetamol", "Vitamin C"] },
  MEASLES: { multiplier: 1.5, keyMedicines: ["Vitamin A", "Paracetamol", "Antibiotics"] },
  CHICKENPOX: { multiplier: 1.1, keyMedicines: ["Acyclovir", "Calamine", "Paracetamol"] },
  TUBERCULOSIS: { multiplier: 2.2, keyMedicines: ["Isoniazid", "Rifampicin", "Pyrazinamide"] },
  HEPATITIS: { multiplier: 1.7, keyMedicines: ["Silymarin", "Vitamin E", "Ursodeoxycholic"] },
  PNEUMONIA: { multiplier: 1.9, keyMedicines: ["Amoxicillin", "Azithromycin", "Oxygen"] },
  VIRAL_FEVER: { multiplier: 1.4, keyMedicines: ["Paracetamol", "Ibuprofen", "Fluids"] },
  GENERAL_FEVER: { multiplier: 1.0, keyMedicines: ["Paracetamol", "Ibuprofen"] },
};

function getDiseaseMultiplier(disease) {
  const normalized = String(disease).toUpperCase();
  return DISEASE_MEDICINE_MULTIPLIERS[normalized]?.multiplier || 1.0;
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
        totalCurrentStock: 0,
        totalIncomingStock: 0,
        reports: 0,
      };
      areaEntry.totalUnits += unitsSold;
      areaEntry.totalRevenue += unitsSold * Math.max(unitPrice, 0);
      areaEntry.totalCurrentStock += Number.isFinite(sale?.currentStock) ? sale.currentStock : 0;
      areaEntry.totalIncomingStock += Number.isFinite(sale?.incomingStock) ? sale.incomingStock : 0;
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
      
      // ============ PHASE 4: ENHANCED DEMAND FORECASTING ============
      // Base daily average from recent reports
      const baseDaily = entry.totalUnits / Math.max(1, entry.reports);
      
      // Disease multiplier - some diseases consume far more medicine than others
      const diseaseMultiplier = risk ? getDiseaseMultiplier(risk.topDiseases?.[0] || "GENERAL_FEVER") : 1.0;
      
      // Trend factor - are cases increasing or decreasing?
      const trendFactor = risk ? (1 + Math.max(risk.growthPercent || 0, -50) / 100) : 1.0; // Don't predict drops
      
      // Risk/probability boost - higher outbreak risk = higher medicine demand
      const outbreakProbability = risk ? risk.outbreakProbabilityNext3Days : 0.2;
      const riskFactor = 1 + Math.max(0, outbreakProbability * 0.8); // Scale 0-1.8
      
      // Population density adjustment - normalize by report frequency
      const reportFrequency = Math.max(1, entry.reports); // More reports = better signal
      const populationDensityFactor = Math.min(2.0, 1 + Math.log(reportFrequency) / 10); // Log scale cap at 2x
      
      // Calculate 3-day and 7-day forecasts
      const expectedUnitsNext3Days = Math.max(
        0,
        Math.round(
          baseDaily * 3 *
          diseaseMultiplier *
          trendFactor *
          riskFactor *
          populationDensityFactor
        )
      );
      
      const expectedUnitsNext7Days = Math.max(
        0,
        Math.round(
          baseDaily * 7 *
          diseaseMultiplier *
          Math.max(0.8, trendFactor) * // Slightly less aggressive for longer term
          (0.5 + riskFactor * 0.5) * // Moderate the risk factor for longer term
          populationDensityFactor
        )
      );
      
      // Confidence score (0-1): higher confidence when more reports and aligned signals
      const reportConfidence = Math.min(1.0, entry.reports / 5); // More reports = more confidence
      const alignmentConfidence = risk ? Math.max(0, 1 - risk.mismatchAverage) : 0.5;
      const confidenceScore = roundTo((reportConfidence * 0.6 + alignmentConfidence * 0.4), 2);
      
      // Stock adequacy check
      const currentStock = Math.max(0, Math.round(entry.totalCurrentStock));
      const incomingStock = Math.max(0, Math.round(entry.totalIncomingStock));
      const totalAvailableStock = currentStock + incomingStock;
      const shortageUnits = Math.max(0, expectedUnitsNext3Days - totalAvailableStock);

      return {
        district: entry.district,
        village: entry.village,
        medicine: entry.medicine,
        expectedUnitsNext3Days,
        expectedUnitsNext7Days,
        currentStock,
        incomingStock,
        shortageUnits,
        stockDecision: shortageUnits > 0 ? "Stock Required" : "Stock Sufficient",
        riskLevel: risk?.riskLevel || "SAFE",
        confidenceScore,  // NEW: Added confidence
        forecastFactors: {  // NEW: Transparency into calculation
          diseaseMultiplier: roundTo(diseaseMultiplier, 2),
          trendFactor: roundTo(trendFactor, 2),
          riskFactor: roundTo(riskFactor, 2),
          populationDensity: roundTo(populationDensityFactor, 2),
        },
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

function getOutbreakNotifierState() {
  if (!globalThis.__healthOutbreakNotifier) {
    globalThis.__healthOutbreakNotifier = {
      lastSentAt: 0,
      lastFingerprint: "",
    };
  }
  return globalThis.__healthOutbreakNotifier;
}

function shouldNotifyOutbreak(summary, highestZone) {
  if (!highestZone) return false;
  if (highestZone.riskLevel !== "HIGH_RISK") return false;
  return (
    (summary?.outbreakProbabilityNext3Days || 0) >= 0.6 ||
    (summary?.criticalAlerts || 0) >= 1 ||
    (summary?.expectedPatientsNext2Days || 0) >= 25
  );
}

// ============ PHASE 6: NOTIFICATION AUDIT LOGGING ============
let notificationAuditLog = [];
const AUDIT_LOG_MAX_SIZE = 10000;
const NOTIFICATION_DEDUP_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Log notification event to audit trail
 */
function logNotificationEvent(event) {
  const auditEntry = {
    _id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    outbreakId: event.outbreakId,
    channel: event.channel,
    recipient: event.recipient || "default",
    status: event.status, // "SENT", "FAILED", "SKIPPED", "RETRYING"
    reason: event.reason || null,
    error: event.error || null,
    retryCount: event.retryCount || 0,
    nextRetryAt: event.nextRetryAt || null,
    metadata: event.metadata || {},
  };

  notificationAuditLog.push(auditEntry);
  if (notificationAuditLog.length > AUDIT_LOG_MAX_SIZE) {
    notificationAuditLog = notificationAuditLog.slice(-AUDIT_LOG_MAX_SIZE);
  }
  return auditEntry;
}

/**
 * Check if we should deduplicate this notification
 * (same outbreak + recipient + channel within 20 minutes)
 */
function shouldDeduplicate(outbreakId, channel, recipient) {
  const windowStart = Date.now() - NOTIFICATION_DEDUP_WINDOW_MS;
  const recent = notificationAuditLog.filter(
    (entry) =>
      entry.outbreakId === outbreakId &&
      entry.channel === channel &&
      entry.recipient === recipient &&
      entry.timestamp >= new Date(windowStart) &&
      entry.status === "SENT"
  );
  return recent.length > 0;
}

/**
 * Get notification history for an outbreak
 */
function getNotificationHistory(outbreakId) {
  return notificationAuditLog
    .filter((entry) => entry.outbreakId === outbreakId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

async function sendOutbreakWebhook(payload, outbreakId) {
  const channel = "webhook";
  
  if (!OUTBREAK_WEBHOOK_URL) {
    logNotificationEvent({
      outbreakId,
      channel,
      status: "SKIPPED",
      reason: "OUTBREAK_WEBHOOK_URL not configured",
    });
    return { sent: false, channel, reason: "not_configured" };
  }

  try {
    const response = await fetch(OUTBREAK_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(OUTBREAK_WEBHOOK_TOKEN ? { Authorization: `Bearer ${OUTBREAK_WEBHOOK_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      const error = `Webhook failed (${response.status}): ${text || "Unknown"}`;
      logNotificationEvent({
        outbreakId,
        channel,
        status: "FAILED",
        error,
        metadata: { statusCode: response.status },
      });
      throw new Error(error);
    }

    logNotificationEvent({
      outbreakId,
      channel,
      status: "SENT",
      metadata: { statusCode: response.status },
    });
    return { sent: true, channel };
  } catch (error) {
    logNotificationEvent({
      outbreakId,
      channel,
      status: "FAILED",
      error: error.message,
    });
    throw error;
  }
}

function buildOutbreakEmailLines(payload) {
  const zone = payload?.outbreak?.highestRiskZone || {};
  return [
    "Outbreak Auto Alert Triggered",
    `Time: ${payload?.generatedAt || new Date().toISOString()}`,
    `Zone: ${zone.village || "Unknown"}, ${zone.district || "Unknown"}`,
    `Risk Score: ${zone.riskScore || 0}`,
    `Outbreak Probability (2-3 days): ${Math.round((payload?.outbreak?.outbreakProbabilityNext3Days || 0) * 100)}%`,
    `Expected Patients Next 2 Days: ${payload?.outbreak?.expectedPatientsNext2Days || 0}`,
    `Hospital Load Index: ${payload?.outbreak?.hospitalLoadPercent || 0}%`,
    "",
    "Top Alerts:",
    ...(payload?.alerts || []).slice(0, 3).map((alert) => `- ${alert.title}: ${alert.description}`),
  ];
}

async function sendOutbreakEmailViaResend(payload, outbreakId) {
  const channel = "email_resend";
  
  if (!OUTBREAK_ALERT_EMAIL_TO || !RESEND_API_KEY) {
    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO || "not_configured",
      status: "SKIPPED",
      reason: "Email credentials not configured",
    });
    return { sent: false, channel };
  }

  if (shouldDeduplicate(outbreakId, channel, OUTBREAK_ALERT_EMAIL_TO)) {
    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO,
      status: "SKIPPED",
      reason: "Deduplicated (sent < 20 min ago)",
    });
    return { sent: false, channel, deduplicated: true };
  }

  try {
    const zone = payload?.outbreak?.highestRiskZone || {};
    const lines = buildOutbreakEmailLines(payload);

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Health Sentinel <alerts@resend.dev>",
        to: [OUTBREAK_ALERT_EMAIL_TO],
        subject: `Outbreak Alert: ${zone.village || "Area"} (${zone.district || "District"})`,
        text: lines.join("\n"),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      const error = `Resend API failed (${response.status}): ${text || "Unknown"}`;
      logNotificationEvent({
        outbreakId,
        channel,
        recipient: OUTBREAK_ALERT_EMAIL_TO,
        status: "FAILED",
        error,
        metadata: { statusCode: response.status },
      });
      throw new Error(error);
    }

    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO,
      status: "SENT",
      metadata: { statusCode: response.status },
    });
    return { sent: true, channel };
  } catch (error) {
    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO,
      status: "FAILED",
      error: error.message,
    });
    throw error;
  }
}

async function loadNodemailer() {
  try {
    const dynamicImporter = new Function("moduleName", "return import(moduleName);");
    const loaded = await dynamicImporter("nodemailer");
    return loaded?.default || loaded;
  } catch (_error) {
    return null;
  }
}

async function sendOutbreakEmailViaNodemailer(payload, outbreakId) {
  const channel = "email_smtp";
  
  if (!OUTBREAK_ALERT_EMAIL_TO || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO || "not_configured",
      status: "SKIPPED",
      reason: "SMTP credentials not configured",
    });
    return { sent: false, channel };
  }

  if (shouldDeduplicate(outbreakId, channel, OUTBREAK_ALERT_EMAIL_TO)) {
    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO,
      status: "SKIPPED",
      reason: "Deduplicated (sent < 20 min ago)",
    });
    return { sent: false, channel, deduplicated: true };
  }

  try {
    const nodemailer = await loadNodemailer();
    if (!nodemailer?.createTransport) {
      const error = "nodemailer not installed";
      logNotificationEvent({
        outbreakId,
        channel,
        recipient: OUTBREAK_ALERT_EMAIL_TO,
        status: "SKIPPED",
        reason: error,
      });
      return { sent: false, channel, reason: "nodemailer_not_installed" };
    }

    const zone = payload?.outbreak?.highestRiskZone || {};
    const lines = buildOutbreakEmailLines(payload);

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number.isFinite(SMTP_PORT) ? SMTP_PORT : 587,
      secure: Number(SMTP_PORT) === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    await transporter.sendMail({
      from: SMTP_FROM,
      to: OUTBREAK_ALERT_EMAIL_TO,
      subject: `Outbreak Alert: ${zone.village || "Area"} (${zone.district || "District"})`,
      text: lines.join("\n"),
    });

    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO,
      status: "SENT",
    });
    return { sent: true, channel };
  } catch (error) {
    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_ALERT_EMAIL_TO,
      status: "FAILED",
      error: error.message,
    });
    throw error;
  }
}

async function sendOutbreakEmail(payload, outbreakId) {
  const smtpResult = await sendOutbreakEmailViaNodemailer(payload, outbreakId);
  if (smtpResult.sent) return smtpResult;
  return sendOutbreakEmailViaResend(payload, outbreakId);
}

async function sendOutbreakSms(payload, outbreakId) {
  const channel = "sms_twilio";
  const recipients = OUTBREAK_SMS_TO
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER || recipients.length === 0) {
    logNotificationEvent({
      outbreakId,
      channel,
      recipient: OUTBREAK_SMS_TO || "not_configured",
      status: "SKIPPED",
      reason: "Twilio credentials or recipients not configured",
    });
    return { sent: false, channel };
  }

  try {
    const zone = payload?.outbreak?.highestRiskZone || {};
    const message = [
      "Outbreak Alert",
      `${zone.village || "Area"}, ${zone.district || "District"}`,
      `Risk ${zone.riskScore || 0}`,
      `Prob ${Math.round((payload?.outbreak?.outbreakProbabilityNext3Days || 0) * 100)}%`,
      `Patients ${payload?.outbreak?.expectedPatientsNext2Days || 0}`,
    ].join(" | ");

    let successCount = 0;
    let failureCount = 0;
    const errors = [];

    for (const to of recipients) {
      // Check deduplication per recipient
      if (shouldDeduplicate(outbreakId, channel, to)) {
        logNotificationEvent({
          outbreakId,
          channel,
          recipient: to,
          status: "SKIPPED",
          reason: "Deduplicated (sent < 20 min ago)",
        });
        continue;
      }

      try {
        const body = new URLSearchParams({
          From: TWILIO_FROM_NUMBER,
          To: to,
          Body: message,
        });

        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(
                `${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`
              ).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body.toString(),
            cache: "no-store",
          }
        );

        if (!response.ok) {
          const text = await response.text();
          const error = `Twilio failed (${response.status}): ${text || "Unknown"}`;
          logNotificationEvent({
            outbreakId,
            channel,
            recipient: to,
            status: "FAILED",
            error,
            metadata: { statusCode: response.status },
          });
          errors.push(error);
          failureCount++;
        } else {
          logNotificationEvent({
            outbreakId,
            channel,
            recipient: to,
            status: "SENT",
            metadata: { statusCode: response.status },
          });
          successCount++;
        }
      } catch (error) {
        logNotificationEvent({
          outbreakId,
          channel,
          recipient: to,
          status: "FAILED",
          error: error.message,
        });
        errors.push(error.message);
        failureCount++;
      }
    }

    if (failureCount > 0) {
      throw new Error(`SMS delivery: ${successCount} sent, ${failureCount} failed - ${errors.join("; ")}`);
    }

    return { sent: true, channel, successCount };
  } catch (error) {
    logNotificationEvent({
      outbreakId,
      channel,
      status: "FAILED",
      error: error.message,
    });
    throw error;
  }
}

async function dispatchOutbreakNotifications({
  summary,
  highestZone,
  alerts,
  roleScope,
  decisionCenter = null,
}) {
  if (!shouldNotifyOutbreak(summary, highestZone)) {
    return {
      notificationId: null,
      status: "skipped",
      reason: "Outbreak threshold not met",
      channels: {},
    };
  }

  const state = getOutbreakNotifierState();
  const now = Date.now();
  const fingerprint = `${highestZone.id || ""}|${highestZone.riskScore || 0}|${summary.expectedPatientsNext2Days || 0}`;

  if (
    state.lastFingerprint === fingerprint &&
    now - state.lastSentAt < OUTBREAK_NOTIFY_COOLDOWN_MS
  ) {
    return {
      notificationId: null,
      status: "deduplicated",
      reason: "Outbreak alert sent recently (20 min cooldown)",
      channels: {},
    };
  }

  const outbreakId = `outbreak_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const payload = {
    type: "outbreak_auto_alert",
    generatedAt: new Date().toISOString(),
    scope: roleScope,
    outbreak: {
      highestRiskZone: {
        id: highestZone.id,
        district: highestZone.district,
        village: highestZone.village,
        riskLevel: highestZone.riskLevel,
        riskScore: highestZone.riskScore,
      },
      outbreakProbabilityNext3Days: summary.outbreakProbabilityNext3Days,
      expectedPatientsNext2Days: summary.expectedPatientsNext2Days,
      hospitalLoadPercent: summary.hospitalLoadPercent,
      predictiveIncreasePercent: summary.predictiveIncreasePercent,
    },
    decisions: decisionCenter?.statusPills || {},
    supplyPlan: decisionCenter?.supplyPlan || null,
    alerts,
  };

  const channelsStatus = {};
  const outbound = [];

  // Queue webhook notification
  outbound.push(
    sendOutbreakWebhook(payload, outbreakId)
      .then((result) => {
        channelsStatus.webhook = { sent: result.sent, reason: result.reason || null };
        return { result, isError: false };
      })
      .catch((error) => {
        channelsStatus.webhook = { sent: false, error: error.message };
        return { result: null, isError: true, error };
      })
  );

  // Queue email notification (if recommended)
  if (decisionCenter?.notifications?.medicalEmailRecommended !== false) {
    outbound.push(
      sendOutbreakEmail(payload, outbreakId)
        .then((result) => {
          channelsStatus.email = { sent: result.sent, reason: result.reason || null };
          return { result, isError: false };
        })
        .catch((error) => {
          channelsStatus.email = { sent: false, error: error.message };
          return { result: null, isError: true, error };
        })
    );
  }

  // Queue SMS notification (if recommended)
  if (decisionCenter?.notifications?.publicSmsRecommended !== false) {
    outbound.push(
      sendOutbreakSms(payload, outbreakId)
        .then((result) => {
          channelsStatus.sms = { sent: result.sent, successCount: result.successCount };
          return { result, isError: false };
        })
        .catch((error) => {
          channelsStatus.sms = { sent: false, error: error.message };
          return { result: null, isError: true, error };
        })
    );
  }

  // Execute all notifications in parallel
  await Promise.all(outbound);

  // Update notifier state regardless of success
  state.lastSentAt = now;
  state.lastFingerprint = fingerprint;

  // Check if we had any fatal failures (all channels failed)
  const successCount = Object.values(channelsStatus).filter((ch) => ch.sent).length;
  if (successCount === 0 && Object.keys(channelsStatus).length > 0) {
    logServerError("api/health-data/outbreak-notification", new Error("All notification channels failed"));
  }

  return {
    notificationId: outbreakId,
    status: successCount > 0 ? "sent" : "failed",
    channelsStatus,
    timestamp: new Date().toISOString(),
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

function buildRoleActions({ role, summary, highestZone, alerts, aiInsights }) {
  const actions = [];
  const topDemand = Array.isArray(aiInsights?.medicineDemand) ? aiInsights.medicineDemand[0] : null;
  const topMismatch = Array.isArray(aiInsights?.mismatchReports) ? aiInsights.mismatchReports[0] : null;
  const topPriceFlag = Array.isArray(aiInsights?.priceAnomalies) ? aiInsights.priceAnomalies[0] : null;
  const topAlert = Array.isArray(alerts) ? alerts[0] : null;

  if (highestZone) {
    actions.push({
      type: "focus-area",
      priority: highestZone.riskLevel === "HIGH_RISK" ? "HIGH" : "MEDIUM",
      text: `Focus ${highestZone.village}, ${highestZone.district} (risk ${highestZone.riskScore}).`,
    });
  }

  if (topDemand) {
    actions.push({
      type: "medicine-dispatch",
      priority: "MEDIUM",
      text: `Prepare ${topDemand.expectedUnitsNext3Days} units of ${topDemand.medicine} for ${topDemand.village}.`,
    });
  }

  if (topAlert) {
    actions.push({
      type: "alert-watch",
      priority: topAlert.severity || "LOW",
      text: topAlert.description,
    });
  }

  if (role === "ADMIN") {
    if ((summary?.criticalAlerts || 0) > 0) {
      actions.push({
        type: "admin-review",
        priority: "HIGH",
        text: "Review high-risk zones and keep webhook/email outage automation active.",
      });
    }
    if (topMismatch) {
      actions.push({
        type: "admin-verification",
        priority: "MEDIUM",
        text: `Audit mismatch report from ${topMismatch.workerId} in ${topMismatch.village}.`,
      });
    }
  }

  if (role === "HOSPITAL" || role === "MEDICAL") {
    actions.push({
      type: "care-capacity",
      priority: (summary?.hospitalLoadPercent || 0) >= 80 ? "HIGH" : "MEDIUM",
      text: `Ready beds and triage for ${summary?.expectedPatientsNext2Days || 0} expected patients in 48h.`,
    });
  }

  if (role === "ASHA") {
    actions.push({
      type: "field-followup",
      priority: "MEDIUM",
      text: "Submit quick village updates through app or WhatsApp with GPS for every cluster visit.",
    });
  }

  if (topPriceFlag && role !== "ASHA") {
    actions.push({
      type: "price-watch",
      priority: "MEDIUM",
      text: `${topPriceFlag.medicine} is ${topPriceFlag.overByPercent}% above benchmark in ${topPriceFlag.village}.`,
    });
  }

  return actions.slice(0, 6);
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
    let householdsVisited = normalizeCount(body?.householdsVisited, 0);
    const newCases = normalizeCount(body?.newCases, null);
    const criticalCases = normalizeCount(body?.criticalCases, 0);
    const diseaseInput = typeof body?.disease === "string" ? body.disease.trim() : "";
    const disease = diseaseInput || "GENERAL_FEVER";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
    
    // ============ PHASE 1: ENHANCED VALIDATION ============
    // Parse medicine sales with detailed error tracking
    const { sales: medicineSales, errors: medicineErrors } = normalizeMedicineSales(body?.medicineSales);
    const reportDate = body?.reportDate ? new Date(body.reportDate) : new Date();
    const latitude = parseCoordinate(body?.latitude);
    const longitude = parseCoordinate(body?.longitude);

    if (householdsVisited === null) {
      householdsVisited = 0;
    }

    // Validate case counts
    if (newCases === null || criticalCases === null) {
      return Response.json(
        { message: "newCases and criticalCases must be non-negative integers" },
        { status: 400 }
      );
    }

    if (newCases < CASE_COUNT_MIN || newCases > CASE_COUNT_MAX) {
      return Response.json(
        { message: `newCases must be between ${CASE_COUNT_MIN} and ${CASE_COUNT_MAX}` },
        { status: 400 }
      );
    }

    if (householdsVisited < 0 || householdsVisited > HOUSEHOLDS_VISITED_MAX) {
      return Response.json(
        { message: `householdsVisited must be between 0 and ${HOUSEHOLDS_VISITED_MAX}` },
        { status: 400 }
      );
    }

    // Validate disease
    const diseaseValidation = validateDisease(disease);
    if (!diseaseValidation.valid) {
      return Response.json(
        { message: diseaseValidation.error },
        { status: 400 }
      );
    }
    const normalizedDisease = diseaseValidation.normalized;

    // Validate medicine sales errors (from enhanced validation)
    if (medicineErrors.length > 0) {
      const errorSummary = medicineErrors.slice(0, 5).join("; ");
      const moreCount = medicineErrors.length > 5 ? ` (+${medicineErrors.length - 5} more)` : "";
      return Response.json(
        {
          message: `Medicine sales validation failed: ${errorSummary}${moreCount}`,
          errors: medicineErrors,
        },
        { status: 400 }
      );
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

    if (role === "MEDICAL" && !medicineSales.length) {
      return Response.json(
        {
          message:
            "Medical stock data is required. Provide medicineSales with medicine, unitsSold, unitPrice, benchmarkPrice, currentStock, incomingStock.",
        },
        { status: 400 }
      );
    }

    await dbConnect();

    // ============ PHASE 1: CHECK FOR DUPLICATES ============
    const resolvedWorkerId =
      role === "ASHA"
        ? session.user.workerId
        : `MEDICAL_${String(session.user.id || "").slice(-6).toUpperCase() || "USER"}`;

    if (!resolvedWorkerId) {
      return Response.json({ message: "Reporter ID is missing for this account" }, { status: 400 });
    }

    const dupCheck = await checkDuplicate(
      session.user.id,
      role,
      session.user.location,
      reportDate
    );

    if (dupCheck.isDuplicate) {
      return Response.json(
        {
          message: `Potential duplicate report detected. You submitted similar data ${dupCheck.createdMinutesAgo} minute(s) ago. Please update the existing report instead of creating a new one.`,
          existingReportId: dupCheck.existingReportId.toString(),
          warning: "DUPLICATE_DETECTED",
        },
        { status: 409 } // Conflict status for duplicate
      );
    }

    // ============ RESOLVE COORDINATES ============
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

    // ============ FIND COUNTERPART REPORT FOR VERIFICATION ============
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
      disease: normalizedDisease,
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
      disease: normalizedDisease,
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

    // ============ PHASE 3: CALL BACKEND AI SERVICE FOR PREDICTIONS ============
    let aiPrediction = null;
    try {
      // Fetch recent reports for context (last 7 days, same location)
      const contextReports = await HealthData.find({
        "location.district": session.user.location.district,
        "location.village": session.user.location.village,
        reportDate: { $gte: new Date(reportDate.getTime() - 7 * 24 * 60 * 60 * 1000) },
      })
        .select("newCases criticalCases disease")
        .lean();

      aiPrediction = await callBackendPredictionService(
        {
          district: session.user.location.district,
          village: session.user.location.village,
          latitude: resolvedLatitude,
          longitude: resolvedLongitude,
        },
        normalizedDisease,
        contextReports
      );
    } catch (predictionError) {
      logServerError("api/health-data/prediction-integration", predictionError);
      // Continue without AI prediction - fall back to heuristics in dashboard
    }

    const serializedReport = serializeReport(report);
    const responseData = {
      ...serializedReport,
      aiPrediction: aiPrediction || { source: "heuristic_fallback", riskScore: null, outbreakProbability: null },
    };

    return Response.json(
      { message: "Health data submitted. AI predictions in progress.", data: responseData },
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
    const { value: centerLatParam, error: centerLatError } = parseOptionalNumber(
      url.searchParams.get("centerLat"),
      "centerLat"
    );
    const { value: centerLngParam, error: centerLngError } = parseOptionalNumber(
      url.searchParams.get("centerLng"),
      "centerLng"
    );
    const { value: radiusParam, error: radiusError } = parseOptionalNumber(
      url.searchParams.get("radiusKm"),
      "radiusKm"
    );

    if (centerLatError || centerLngError || radiusError) {
      return Response.json({ message: centerLatError || centerLngError || radiusError }, { status: 400 });
    }

    if ((centerLatParam === null) !== (centerLngParam === null)) {
      return Response.json(
        { message: "centerLat and centerLng must be provided together" },
        { status: 400 }
      );
    }

    if (centerLatParam !== null && (centerLatParam < -90 || centerLatParam > 90)) {
      return Response.json({ message: "centerLat must be between -90 and 90" }, { status: 400 });
    }

    if (centerLngParam !== null && (centerLngParam < -180 || centerLngParam > 180)) {
      return Response.json({ message: "centerLng must be between -180 and 180" }, { status: 400 });
    }

    if (radiusParam !== null && (radiusParam < MIN_RADIUS_KM || radiusParam > MAX_RADIUS_KM)) {
      return Response.json(
        { message: `radiusKm must be between ${MIN_RADIUS_KM} and ${MAX_RADIUS_KM}` },
        { status: 400 }
      );
    }

    const autoRadiusRoles = new Set(["HOSPITAL", "MEDICAL"]);
    const radiusKm =
      radiusParam !== null
        ? radiusParam
        : autoRadiusRoles.has(role)
          ? DEFAULT_RADIUS_KM
          : null;
    const locationScopeRequested = radiusParam !== null || centerLatParam !== null;

    let centerLatitude = centerLatParam;
    let centerLongitude = centerLngParam;

    if (
      centerLatitude === null &&
      centerLongitude === null &&
      Number.isFinite(radiusKm) &&
      hasCoordinates(session?.user?.location)
    ) {
      centerLatitude = session.user.location.latitude;
      centerLongitude = session.user.location.longitude;
    }

    if (locationScopeRequested && (centerLatitude === null || centerLongitude === null)) {
      return Response.json(
        { message: "GPS center coordinates are required for radius-based area view" },
        { status: 400 }
      );
    }

    const isDistanceScopeEnabled =
      Number.isFinite(radiusKm) && Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude);

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
      if (isDistanceScopeEnabled) {
        roleScope = `within ${roundTo(radiusKm, 1)} km radius`;
      }
    } else if (role === "ASHA") {
      if (!hasLocation(session.user.location)) {
        return Response.json({ message: "User location is missing" }, { status: 400 });
      }

      query["location.district"] = session.user.location.district;
      if (!isDistanceScopeEnabled) {
        query["location.village"] = session.user.location.village;
        roleScope = `${session.user.location.village}, ${session.user.location.district}`;
      } else {
        roleScope = `${session.user.location.district} around ${roundTo(radiusKm, 1)} km`;
      }
    } else {
      if (!hasLocation(session.user.location)) {
        return Response.json({ message: "User location is missing" }, { status: 400 });
      }

      if (role === "HOSPITAL" || role === "MEDICAL") {
        query["location.district"] = session.user.location.district;
        if (village) {
          query["location.village"] = village;
        }
        roleScope = isDistanceScopeEnabled
          ? `${session.user.location.district} around ${roundTo(radiusKm, 1)} km`
          : `${session.user.location.district} region`;
      } else {
        Object.assign(query, locationFilter(session.user.location));
        roleScope = `${session.user.location.village}, ${session.user.location.district}`;
      }
    }

    const mongoLimit =
      severityFilter || isDistanceScopeEnabled ? Math.min(limit * 4, MAX_LIMIT) : limit;

    const matchedReports = await HealthData.find(query)
      .sort({ reportDate: -1, createdAt: -1 })
      .limit(mongoLimit)
      .lean();

    const scopedReports = matchedReports.filter((report) => reportMatchesSeverity(report, severityFilter));
    const reports = scopedReports
      .filter((report) =>
        isDistanceScopeEnabled
          ? withinRadius(report?.location, centerLatitude, centerLongitude, radiusKm)
          : true
      )
      .slice(0, limit);

    // ============ PHASE 2: APPLY ROLE-BASED FILTERING TO REPORTS ============
    const roleFilteredReports = filterReportsByRole(reports, role, session.user);

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
        if (role === "ASHA" && !isDistanceScopeEnabled) {
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

      // ============ PHASE 2: APPLY ROLE-BASED FILTERING TO ENTITIES ============
      entities = filterEntitiesByRole(entities, role, session.user);

      if (isDistanceScopeEnabled) {
        entities = {
          ashaWorkers: entities.ashaWorkers.filter((item) =>
            withinRadius(item?.location, centerLatitude, centerLongitude, radiusKm)
          ),
          hospitals: entities.hospitals.filter((item) =>
            withinRadius(item?.location, centerLatitude, centerLongitude, radiusKm)
          ),
          medicalTeams: entities.medicalTeams.filter((item) =>
            withinRadius(item?.location, centerLatitude, centerLongitude, radiusKm)
          ),
        };
      }
    }

    const dailyTrend = buildDailyTrend(roleFilteredReports);
    const weeklyTrend = buildWeeklyTrend(roleFilteredReports);
    const diseaseDistribution = buildDiseaseDistribution(roleFilteredReports);
    const riskZones = buildRiskZones(roleFilteredReports);
    const medicineAnalytics = buildMedicineAnalytics(roleFilteredReports, riskZones);
    const aiInsights = buildAiInsights(roleFilteredReports, riskZones, medicineAnalytics);
    const summary = buildSummary({
      reports: roleFilteredReports,
      riskZones,
      dailyTrend,
      entities,
    });
    const alerts = buildAlerts(summary, riskZones);
    const decisionCenter = buildDecisionCenter({
      summary,
      riskZones,
      dailyTrend,
      medicineDemand: medicineAnalytics.demandByArea,
      priceAnomalies: medicineAnalytics.priceAnomalies,
    });
    const roleDecisionPack = buildRoleDecisionPack({
      role,
      decisionCenter,
    });
    const legacyRoleActions = buildRoleActions({
      role,
      summary,
      highestZone: summary?.highestRiskArea,
      alerts,
      aiInsights,
    });
    const roleActions = [
      ...(Array.isArray(roleDecisionPack?.tasks)
        ? roleDecisionPack.tasks.map((task) => ({
            type: "ai-task",
            priority: "MEDIUM",
            text: task,
          }))
        : []),
      ...legacyRoleActions,
    ].slice(0, 6);
    try {
      await dispatchOutbreakNotifications({
        summary,
        highestZone: summary?.highestRiskArea,
        alerts,
        roleScope,
        decisionCenter,
      });
    } catch (dispatchError) {
      logServerError("api/health-data/outbreak-dispatch", dispatchError);
    }

    const notifierState = getOutbreakNotifierState();
    let notificationStatus = null;

    // Attempt to get notification audit info
    try {
      const recentNotifications = notificationAuditLog.slice(-10).filter((entry) => {
        return new Date(entry.timestamp) > new Date(Date.now() - 5 * 60 * 1000); // Last 5 minutes
      });
      if (recentNotifications.length > 0) {
        const summary_notif = {
          total: recentNotifications.length,
          sent: recentNotifications.filter((n) => n.status === "SENT").length,
          failed: recentNotifications.filter((n) => n.status === "FAILED").length,
          skipped: recentNotifications.filter((n) => n.status === "SKIPPED").length,
          channels: {},
        };
        recentNotifications.forEach((n) => {
          if (!summary_notif.channels[n.channel]) {
            summary_notif.channels[n.channel] = { sent: 0, failed: 0 };
          }
          if (n.status === "SENT") summary_notif.channels[n.channel].sent++;
          if (n.status === "FAILED") summary_notif.channels[n.channel].failed++;
        });
        notificationStatus = summary_notif;
      }
    } catch (_audErr) {
      // Silently fail audit lookup, don't block response
    }

    return Response.json({
      count: roleFilteredReports.length,
      data: roleFilteredReports.map(serializeReport),
      summary,
      alerts,
      diseaseDistribution,
      riskZones,
      aiInsights,
      decisionCenter,
      roleDecisionPack,
      roleActions,
      notifications: notificationStatus,
      trends: {
        daily: dailyTrend,
        weekly: weeklyTrend,
      },
      entities,
      meta: {
        roleScope,
        locationWindow: {
          enabled: isDistanceScopeEnabled,
          center:
            isDistanceScopeEnabled && Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude)
              ? {
                  latitude: roundTo(centerLatitude, 6),
                  longitude: roundTo(centerLongitude, 6),
                }
              : null,
          radiusKm: isDistanceScopeEnabled ? roundTo(radiusKm, 1) : null,
        },
        outbreakAutomation: {
          autoAlertEnabled: Boolean(
            OUTBREAK_WEBHOOK_URL ||
              (OUTBREAK_ALERT_EMAIL_TO && RESEND_API_KEY) ||
              (OUTBREAK_ALERT_EMAIL_TO && SMTP_HOST && SMTP_USER && SMTP_PASS) ||
              (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER && OUTBREAK_SMS_TO)
          ),
          webhookConfigured: Boolean(OUTBREAK_WEBHOOK_URL),
          emailConfigured: Boolean(
            (OUTBREAK_ALERT_EMAIL_TO && RESEND_API_KEY) ||
              (OUTBREAK_ALERT_EMAIL_TO && SMTP_HOST && SMTP_USER && SMTP_PASS)
          ),
          smsConfigured: Boolean(
            TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM_NUMBER && OUTBREAK_SMS_TO
          ),
          emailChannel: SMTP_HOST && SMTP_USER && SMTP_PASS ? "nodemailer_smtp" : "resend_api",
          cooldownMinutes: Math.round(OUTBREAK_NOTIFY_COOLDOWN_MS / (60 * 1000)),
          lastTriggeredAt: notifierState.lastSentAt
            ? new Date(notifierState.lastSentAt).toISOString()
            : null,
          routing: {
            publicSmsRecommended: Boolean(decisionCenter?.notifications?.publicSmsRecommended),
            medicalEmailRecommended: Boolean(decisionCenter?.notifications?.medicalEmailRecommended),
          },
        },
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
