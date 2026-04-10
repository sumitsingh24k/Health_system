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

function toRiskLevel(score, newCases, criticalCases) {
  if (criticalCases >= 4 || newCases >= 35 || score >= 45) {
    return "HIGH_RISK";
  }

  if (criticalCases >= 1 || newCases >= 12 || score >= 18) {
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
      latitudeSum: 0,
      longitudeSum: 0,
      coordinateCount: 0,
      lastReportedAt: null,
    };

    zone.reports += 1;
    zone.newCases += report.newCases || 0;
    zone.criticalCases += report.criticalCases || 0;

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
      const score = zone.newCases + zone.criticalCases * 3 + zone.reports * 0.6;
      const level = toRiskLevel(score, zone.newCases, zone.criticalCases);
      const riskColor =
        level === "HIGH_RISK" ? "#dc2626" : level === "MEDIUM_RISK" ? "#f59e0b" : "#22c55e";
      const radiusMeters = Math.max(4200, Math.min(32000, zone.newCases * 700 + zone.criticalCases * 1600));

      return {
        id: zone.key,
        district: zone.district,
        village: zone.village,
        reports: zone.reports,
        newCases: zone.newCases,
        criticalCases: zone.criticalCases,
        riskScore: Number(score.toFixed(1)),
        riskLevel: level,
        riskColor,
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
  const hospitalsCount = entities?.hospitals?.length || 0;
  const medicalCount = entities?.medicalTeams?.length || 0;
  const careUnits = Math.max(1, hospitalsCount + medicalCount);
  const loadPercent = Math.min(
    100,
    Math.round(((activeCases + totalCriticalCases * 1.8) / (careUnits * 35)) * 100)
  );
  const predictiveIncreasePercent = Math.max(
    -40,
    Math.min(180, Math.round(growthPercent * 0.7 + highRiskCount * 6 + totalCriticalCases * 0.2))
  );

  return {
    totalReports,
    totalPatients: totalNewCases,
    totalNewCases,
    totalCriticalCases,
    activeCases,
    criticalAlerts: highRiskCount,
    growthPercent,
    predictiveIncreasePercent,
    hospitalLoadPercent: loadPercent,
    highestRiskArea: riskZones[0] || null,
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
      description: `${highestZone.village}, ${highestZone.district} has ${highestZone.newCases} new cases.`,
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
      description: `Estimated care unit load is ${summary.hospitalLoadPercent}%.`,
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
