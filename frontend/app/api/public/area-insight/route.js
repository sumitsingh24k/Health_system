import dbConnect from "@/app/lib/dbconnect";
import { buildDecisionCenter } from "@/app/lib/decision-engine";
import HealthData from "@/app/lib/schema/healthDataSchema";
import User from "@/app/lib/schema/userschema";
import { logServerError } from "@/app/lib/server-log";

const DEFAULT_RADIUS_KM = 10;
const MAX_RADIUS_KM = 25;
const MIN_RADIUS_KM = 2;

function parseNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function resolveRiskLevel(score) {
  if (score >= 70) return "HIGH";
  if (score >= 40) return "MEDIUM";
  return "LOW";
}

function buildPrecautions(level) {
  if (level === "HIGH") {
    return [
      "Wear mask in crowded places and avoid stagnant water areas.",
      "Use mosquito protection and report fever symptoms early.",
      "Keep emergency medicine and hydration packets ready at home.",
    ];
  }
  if (level === "MEDIUM") {
    return [
      "Follow hygiene, hydration, and mosquito prevention at home.",
      "Monitor fever symptoms in children and elderly family members.",
      "Use nearby medical stores early if symptoms persist.",
    ];
  }
  return [
    "Continue normal preventive steps and clean water storage weekly.",
    "Keep basic fever medicine and ORS available at home.",
    "Follow local updates and report unusual symptoms quickly.",
  ];
}

function normalizeHospital(user, lat, lng) {
  const latitude = Number(user?.location?.latitude);
  const longitude = Number(user?.location?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    id: user._id.toString(),
    name: user.name,
    role: user.role,
    latitude,
    longitude,
    distanceKm: Number(distanceKm(lat, lng, latitude, longitude).toFixed(2)),
    district: user?.location?.district || null,
    village: user?.location?.village || null,
  };
}

function normalizeMedicineDemand(reports, riskBoost) {
  const demandMap = new Map();
  for (const report of reports) {
    if (report.reporterRole !== "MEDICAL") continue;
    const sales = Array.isArray(report?.medicineSales) ? report.medicineSales : [];
    for (const sale of sales) {
      const medicine = typeof sale?.medicine === "string" ? sale.medicine.trim() : "";
      const units = Number(sale?.unitsSold);
      if (!medicine || !Number.isFinite(units) || units <= 0) continue;
      const key = medicine.toLowerCase();
      const current = demandMap.get(key) || { medicine, units: 0 };
      current.units += units;
      demandMap.set(key, current);
    }
  }

  return [...demandMap.values()]
    .map((item) => {
      const expectedUnitsNext3Days = Math.round(item.units * (0.9 + riskBoost));
      const availability =
        expectedUnitsNext3Days >= 150 ? "High" : expectedUnitsNext3Days >= 70 ? "Medium" : "Low";
      return {
        medicine: item.medicine,
        expectedUnitsNext3Days,
        availability,
      };
    })
    .sort((a, b) => b.expectedUnitsNext3Days - a.expectedUnitsNext3Days)
    .slice(0, 6);
}

function buildDailyTrend(reports, days = 14) {
  const buckets = new Map();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let index = days - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    const key = date.toISOString().slice(0, 10);
    buckets.set(key, { date: key, newCases: 0, criticalCases: 0 });
  }

  for (const report of reports) {
    const date = new Date(report?.reportDate || report?.createdAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.newCases += Number(report?.newCases) || 0;
    bucket.criticalCases += Number(report?.criticalCases) || 0;
  }

  return [...buckets.values()];
}

export async function GET(request) {
  const url = new URL(request.url);
  const latitude = parseNumber(url.searchParams.get("latitude"));
  const longitude = parseNumber(url.searchParams.get("longitude"));
  const rawRadius = parseNumber(url.searchParams.get("radiusKm"));
  const radiusKm = clamp(rawRadius ?? DEFAULT_RADIUS_KM, MIN_RADIUS_KM, MAX_RADIUS_KM);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json(
      { message: "latitude and longitude are required" },
      { status: 400 }
    );
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return Response.json({ message: "Invalid latitude or longitude range" }, { status: 400 });
  }

  try {
    await dbConnect();

    const lookbackStart = new Date();
    lookbackStart.setDate(lookbackStart.getDate() - 14);

    const candidateReports = await HealthData.find({
      reportDate: { $gte: lookbackStart },
      "location.latitude": { $exists: true },
      "location.longitude": { $exists: true },
    })
      .sort({ reportDate: -1, createdAt: -1 })
      .limit(400)
      .lean();

    const reports = candidateReports.filter((report) => {
      const lat = Number(report?.location?.latitude);
      const lng = Number(report?.location?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
      return distanceKm(latitude, longitude, lat, lng) <= radiusKm;
    });

    const totalCases = reports.reduce((sum, report) => sum + (Number(report?.newCases) || 0), 0);
    const criticalCases = reports.reduce(
      (sum, report) => sum + (Number(report?.criticalCases) || 0),
      0
    );
    const reportCount = reports.length;
    const recentWindowStart = new Date();
    recentWindowStart.setDate(recentWindowStart.getDate() - 4);
    const previousWindowStart = new Date();
    previousWindowStart.setDate(previousWindowStart.getDate() - 8);
    const recentCases = reports
      .filter((report) => new Date(report?.reportDate || report?.createdAt) >= recentWindowStart)
      .reduce((sum, report) => sum + (Number(report?.newCases) || 0), 0);
    const previousCases = reports
      .filter((report) => {
        const reportDate = new Date(report?.reportDate || report?.createdAt);
        return reportDate >= previousWindowStart && reportDate < recentWindowStart;
      })
      .reduce((sum, report) => sum + (Number(report?.newCases) || 0), 0);
    const trend =
      recentCases > previousCases * 1.1
        ? "Increasing"
        : previousCases > 0 && recentCases < previousCases * 0.9
          ? "Decreasing"
          : "Stable";
    const riskScore = clamp(
      Math.round(totalCases * 1.9 + criticalCases * 4.5 + reportCount * 1.2),
      0,
      100
    );
    const riskLevel = resolveRiskLevel(riskScore);
    const outbreakProbability = clamp(0.08 + riskScore / 115, 0.03, 0.98);

    const diseaseCounts = new Map();
    for (const report of reports) {
      const disease = report?.disease || "General";
      diseaseCounts.set(disease, (diseaseCounts.get(disease) || 0) + (report?.newCases || 0));
    }
    const topDiseases = [...diseaseCounts.entries()]
      .map(([disease, cases]) => ({ disease, cases }))
      .sort((a, b) => b.cases - a.cases)
      .slice(0, 5);

    const hospitalsRaw = await User.find({
      role: { $in: ["HOSPITAL", "MEDICAL"] },
      status: "APPROVED",
      "location.latitude": { $exists: true },
      "location.longitude": { $exists: true },
    })
      .select("_id name role location")
      .lean();

    const nearbyHospitals = hospitalsRaw
      .map((entry) => normalizeHospital(entry, latitude, longitude))
      .filter(Boolean)
      .filter((entry) => entry.distanceKm <= radiusKm + 6)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 6);

    const medicineDemand = normalizeMedicineDemand(reports, outbreakProbability * 0.7);
    const priceComparisons = [];
    for (const report of reports) {
      if (report.reporterRole !== "MEDICAL") continue;
      const sales = Array.isArray(report?.medicineSales) ? report.medicineSales : [];
      for (const sale of sales) {
        const medicine = typeof sale?.medicine === "string" ? sale.medicine.trim() : "";
        const privatePrice = Number(sale?.unitPrice);
        const janaushadhiPrice = Number(sale?.benchmarkPrice);
        if (!medicine || !Number.isFinite(privatePrice) || !Number.isFinite(janaushadhiPrice)) {
          continue;
        }
        if (privatePrice <= 0 || janaushadhiPrice <= 0) continue;
        priceComparisons.push({
          medicine,
          privatePrice: Number(privatePrice.toFixed(2)),
          janaushadhiPrice: Number(janaushadhiPrice.toFixed(2)),
          savings: Number((privatePrice - janaushadhiPrice).toFixed(2)),
        });
      }
    }
    const topPriceComparison =
      priceComparisons.sort((a, b) => b.savings - a.savings)[0] || null;
    const dailyTrend = buildDailyTrend(reports);
    const riskZone = {
      id: "area-focus",
      district: reports[0]?.location?.district || null,
      village: reports[0]?.location?.village || null,
      riskScore,
      riskLevel: riskLevel === "HIGH" ? "HIGH_RISK" : riskLevel === "MEDIUM" ? "MEDIUM_RISK" : "SAFE",
      outbreakProbabilityNext3Days: outbreakProbability,
      predictedAdditionalCases3d: Math.max(
        0,
        Math.round(recentCases * 0.45 + criticalCases * 0.9)
      ),
    };
    const decisionCenter = buildDecisionCenter({
      summary: {
        outbreakProbabilityNext3Days: outbreakProbability,
        expectedPatientsNext2Days: Math.round(totalCases * 0.22 + criticalCases * 0.9),
        highestRiskArea: riskZone,
      },
      riskZones: [riskZone],
      dailyTrend,
      medicineDemand,
      priceComparison: topPriceComparison,
    });

    const pharmacyUrl = new URL("/api/location/janaushadhi", request.url);
    pharmacyUrl.searchParams.set("latitude", String(latitude));
    pharmacyUrl.searchParams.set("longitude", String(longitude));
    pharmacyUrl.searchParams.set("radiusKm", String(radiusKm));
    let pharmacyPayload = {
      janaushadhi: [],
      privateStores: [],
      degraded: true,
    };
    try {
      const pharmacyResponse = await fetch(pharmacyUrl.toString(), {
        method: "GET",
        cache: "no-store",
      });
      const parsed = await pharmacyResponse.json();
      pharmacyPayload = {
        janaushadhi: Array.isArray(parsed?.janaushadhi) ? parsed.janaushadhi : [],
        privateStores: Array.isArray(parsed?.privateStores) ? parsed.privateStores : [],
        recommendation: parsed?.recommendation || "",
        degraded: Boolean(parsed?.degraded),
      };
    } catch (_error) {
      pharmacyPayload = {
        janaushadhi: [],
        privateStores: [],
        recommendation: "",
        degraded: true,
      };
    }

    return Response.json({
      risk: {
        level: riskLevel,
        score: riskScore,
        trend,
        outbreakProbabilityNext2Days: Number(outbreakProbability.toFixed(2)),
        prediction:
          outbreakProbability >= 0.6
            ? "Risk may increase in next 2 days."
            : outbreakProbability >= 0.4
              ? "Area is under watch for next 2 days."
              : "Risk is likely stable for now.",
      },
      summary: {
        reports: reportCount,
        totalCases,
        criticalCases,
      },
      topDiseases,
      precautions: buildPrecautions(riskLevel),
      medicineDemand,
      priceComparison: topPriceComparison,
      nearby: {
        hospitals: nearbyHospitals,
        janaushadhi: pharmacyPayload.janaushadhi.slice(0, 6),
        privateStores: pharmacyPayload.privateStores.slice(0, 6),
      },
      decisions: decisionCenter,
      publicView: {
        riskLevel: decisionCenter?.statusPills?.risk || `${riskLevel} Risk Area`,
        trend: decisionCenter?.trendSignal?.trend || trend,
        price: decisionCenter?.statusPills?.price || "Price Normal",
        supply: decisionCenter?.statusPills?.supply || "Stock Check",
        supplyMessage: `This area will need ${
          decisionCenter?.supplyPlan?.requiredUnitsNext48Hours || 0
        } units of ${decisionCenter?.supplyPlan?.medicine || "Paracetamol"} in next 48 hours.`,
        savingsMessage:
          Number(decisionCenter?.priceSignal?.savingsEstimate) > 0
            ? `You save Rs ${decisionCenter.priceSignal.savingsEstimate} using Janaushadhi.`
            : "Compare prices and prefer affordable options.",
        precautions: buildPrecautions(riskLevel),
        nearby: {
          hospitals: nearbyHospitals.slice(0, 4),
          janaushadhi: pharmacyPayload.janaushadhi.slice(0, 4),
          privateStores: pharmacyPayload.privateStores.slice(0, 4),
        },
      },
      recommendation: pharmacyPayload.recommendation || "",
      meta: {
        center: { latitude, longitude, radiusKm },
        generatedAt: new Date().toISOString(),
        degraded: Boolean(pharmacyPayload.degraded),
      },
    });
  } catch (error) {
    logServerError("api/public/area-insight", error);
    return Response.json(
      { message: "Could not build area insight right now" },
      { status: 500 }
    );
  }
}
