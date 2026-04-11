import dbConnect from "@/app/lib/dbconnect";
import HealthData from "@/app/lib/schema/healthDataSchema";
import User from "@/app/lib/schema/userschema";
import { parseJsonBody } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";

const WHATSAPP_VERIFY_TOKEN = (process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
const WHATSAPP_WEBHOOK_TOKEN = (process.env.WHATSAPP_WEBHOOK_TOKEN || "").trim();
const VERIFICATION_WINDOW_HOURS = 24;

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

function parseMedicineSales(medicineSales) {
  if (Array.isArray(medicineSales)) {
    return medicineSales
      .map((entry) => {
        const medicine = normalizeText(entry?.medicine);
        const unitsSold = toInteger(entry?.unitsSold, 0);
        const unitPrice = toNumber(entry?.unitPrice);
        const benchmarkPrice = toNumber(entry?.benchmarkPrice);
        const currentStock = toInteger(entry?.currentStock, 0);
        const incomingStock = toInteger(entry?.incomingStock, 0);
        if (!medicine || unitsSold === null || unitPrice === null || unitPrice < 0) return null;
        if (currentStock === null || incomingStock === null) return null;
        return {
          medicine,
          unitsSold,
          unitPrice,
          benchmarkPrice: benchmarkPrice !== null && benchmarkPrice >= 0 ? benchmarkPrice : null,
          currentStock,
          incomingStock,
        };
      })
      .filter(Boolean)
      .slice(0, 20);
  }

  if (typeof medicineSales === "string") {
    return medicineSales
      .split(";")
      .map((chunk) => chunk.trim())
      .filter(Boolean)
      .map((chunk) => {
        const [medicineRaw, unitsRaw, priceRaw, benchmarkRaw, stockRaw, incomingRaw] = chunk
          .split("|")
          .map((item) => item.trim());
        const medicine = normalizeText(medicineRaw);
        const unitsSold = toInteger(unitsRaw, 0);
        const unitPrice = toNumber(priceRaw);
        const benchmarkPrice = toNumber(benchmarkRaw);
        const currentStock = toInteger(stockRaw, 0);
        const incomingStock = toInteger(incomingRaw, 0);
        if (!medicine || unitsSold === null || unitPrice === null || unitPrice < 0) return null;
        if (currentStock === null || incomingStock === null) return null;
        return {
          medicine,
          unitsSold,
          unitPrice,
          benchmarkPrice: benchmarkPrice !== null && benchmarkPrice >= 0 ? benchmarkPrice : null,
          currentStock,
          incomingStock,
        };
      })
      .filter(Boolean)
      .slice(0, 20);
  }

  return [];
}

function parseTextReport(rawMessage) {
  const message = normalizeText(rawMessage);
  const diseaseMatch = message.match(/disease\s*[:=]\s*([a-zA-Z\s-]+)/i);
  const casesMatch = message.match(/(?:cases|newcases|new_cases)\s*[:=]\s*(\d+)/i);
  const criticalMatch = message.match(/(?:critical|criticalcases|critical_cases)\s*[:=]\s*(\d+)/i);
  const householdsMatch = message.match(/(?:households?|hh|homes?)\s*[:=]\s*(\d+)/i);
  const latitudeMatch = message.match(/(?:lat|latitude)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  const longitudeMatch = message.match(/(?:lon|lng|longitude)\s*[:=]\s*(-?\d+(?:\.\d+)?)/i);
  const villageMatch = message.match(/(?:village|area)\s*[:=]\s*([a-zA-Z0-9\s-]+)/i);
  const districtMatch = message.match(/district\s*[:=]\s*([a-zA-Z0-9\s-]+)/i);
  const notesMatch = message.match(/notes?\s*[:=]\s*(.+)$/i);

  return {
    disease: normalizeText(diseaseMatch?.[1]) || "",
    newCases: casesMatch ? Number(casesMatch[1]) : null,
    criticalCases: criticalMatch ? Number(criticalMatch[1]) : 0,
    householdsVisited: householdsMatch ? Number(householdsMatch[1]) : 0,
    latitude: latitudeMatch ? Number(latitudeMatch[1]) : null,
    longitude: longitudeMatch ? Number(longitudeMatch[1]) : null,
    village: normalizeText(villageMatch?.[1]) || "",
    district: normalizeText(districtMatch?.[1]) || "",
    notes: normalizeText(notesMatch?.[1]) || message,
  };
}

function evaluateCounterpartMatch({ disease, newCases, criticalCases, counterpart }) {
  if (!counterpart) {
    return {
      status: "NO_COUNTERPART",
      mismatchScore: 0.5,
      reasons: ["No counterpart submission found in 24h window"],
      counterpartReportId: null,
    };
  }

  const caseDenominator = Math.max(newCases, counterpart.newCases || 0, 1);
  const criticalDenominator = Math.max(criticalCases, counterpart.criticalCases || 0, 1);
  const caseDeltaRatio = Math.abs(newCases - (counterpart.newCases || 0)) / caseDenominator;
  const criticalDeltaRatio =
    Math.abs(criticalCases - (counterpart.criticalCases || 0)) / criticalDenominator;
  const diseaseMatches =
    disease.toLowerCase() === String(counterpart.disease || "").trim().toLowerCase();
  let mismatchScore = caseDeltaRatio * 0.7 + criticalDeltaRatio * 0.2 + (diseaseMatches ? 0 : 0.1);
  mismatchScore = Math.max(0, Math.min(1, mismatchScore));

  return {
    status:
      mismatchScore >= 0.65 ? "HIGH_MISMATCH" : mismatchScore >= 0.35 ? "PARTIAL_MISMATCH" : "MATCHED",
    mismatchScore: Number(mismatchScore.toFixed(2)),
    reasons: [
      caseDeltaRatio > 0.45 ? "Case count mismatch with counterpart source" : "Case count aligns with counterpart",
      diseaseMatches ? "Disease labels aligned" : "Disease labels do not match counterpart",
    ],
    counterpartReportId: counterpart._id || null,
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge) {
    if (!WHATSAPP_VERIFY_TOKEN || token !== WHATSAPP_VERIFY_TOKEN) {
      return new Response("Invalid verification token", { status: 403 });
    }
    return new Response(challenge, { status: 200 });
  }

  return Response.json({ message: "WhatsApp ingestion endpoint active" });
}

export async function POST(request) {
  const authToken = request.headers.get("x-webhook-token") || request.headers.get("authorization") || "";
  if (WHATSAPP_WEBHOOK_TOKEN) {
    const normalized = authToken.replace(/^Bearer\s+/i, "").trim();
    if (normalized !== WHATSAPP_WEBHOOK_TOKEN) {
      return Response.json({ message: "Unauthorized webhook token" }, { status: 401 });
    }
  }

  const { body, error: parseError } = await parseJsonBody(request);
  if (parseError) return parseError;

  try {
    await dbConnect();

    const workerId = normalizeText(body?.workerId);
    const email = normalizeText(body?.email).toLowerCase();
    const message = normalizeText(body?.message);
    const explicitRole = normalizeText(body?.role).toUpperCase();
    const locationPayload = body?.location || {};
    const reportPayload = body?.report || {};

    const userQuery = workerId ? { workerId } : email ? { email } : null;
    if (!userQuery) {
      return Response.json(
        { message: "workerId or email is required to map WhatsApp sender" },
        { status: 400 }
      );
    }

    const user = await User.findOne(userQuery).select("_id role location workerId status").lean();
    if (!user) {
      return Response.json({ message: "User not found for provided sender" }, { status: 404 });
    }

    const role = (explicitRole || user.role || "").toUpperCase();
    if (!["ASHA", "MEDICAL"].includes(role)) {
      return Response.json(
        { message: "Only ASHA or MEDICAL WhatsApp submissions are supported" },
        { status: 400 }
      );
    }

    const parsedFromText = parseTextReport(message);
    const disease = normalizeText(reportPayload?.disease || parsedFromText.disease).toUpperCase();
    const newCases = toInteger(reportPayload?.newCases ?? parsedFromText.newCases, null);
    const criticalCases = toInteger(reportPayload?.criticalCases ?? parsedFromText.criticalCases, 0);
    const notes = normalizeText(reportPayload?.notes || parsedFromText.notes || message);
    const householdsVisited = toInteger(
      reportPayload?.householdsVisited ?? parsedFromText.householdsVisited,
      0
    );
    const reportDate = reportPayload?.reportDate ? new Date(reportPayload.reportDate) : new Date();
    const medicineSales = parseMedicineSales(reportPayload?.medicineSales);

    if (!disease) {
      return Response.json({ message: "Disease is required (message or report.disease)" }, { status: 400 });
    }
    if (newCases === null || criticalCases === null) {
      return Response.json({ message: "newCases/criticalCases must be non-negative integers" }, { status: 400 });
    }
    if (householdsVisited === null) {
      return Response.json(
        { message: "householdsVisited must be a non-negative integer when provided" },
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

    const latitude =
      toNumber(locationPayload?.latitude ?? parsedFromText.latitude) ??
      toNumber(user?.location?.latitude);
    const longitude =
      toNumber(locationPayload?.longitude ?? parsedFromText.longitude) ??
      toNumber(user?.location?.longitude);
    const village =
      normalizeText(locationPayload?.village || parsedFromText.village) ||
      normalizeText(user?.location?.village);
    const district =
      normalizeText(locationPayload?.district || parsedFromText.district) ||
      normalizeText(user?.location?.district);

    if (latitude !== null && (latitude < -90 || latitude > 90)) {
      return Response.json({ message: "latitude must be between -90 and 90" }, { status: 400 });
    }

    if (longitude !== null && (longitude < -180 || longitude > 180)) {
      return Response.json({ message: "longitude must be between -180 and 180" }, { status: 400 });
    }

    if (!village || !district) {
      return Response.json(
        { message: "Location village and district are required in user profile or webhook payload" },
        { status: 400 }
      );
    }

    const counterpartRole = role === "ASHA" ? "MEDICAL" : "ASHA";
    const counterpartStart = new Date(reportDate.getTime() - VERIFICATION_WINDOW_HOURS * 60 * 60 * 1000);
    const counterpart = await HealthData.findOne({
      reporterRole: counterpartRole,
      "location.district": district,
      "location.village": village,
      reportDate: { $gte: counterpartStart, $lte: reportDate },
    })
      .sort({ reportDate: -1, createdAt: -1 })
      .lean();

    const verification = evaluateCounterpartMatch({
      disease,
      newCases,
      criticalCases,
      counterpart,
    });

    const trustScore = Math.max(0.05, Math.min(0.99, Number((1 - verification.mismatchScore * 0.65).toFixed(3))));

    const report = await HealthData.create({
      reportedBy: user._id,
      workerId: role === "ASHA" ? user.workerId : `MEDICAL_${String(user._id).slice(-6).toUpperCase()}`,
      reporterRole: role,
      location: {
        village,
        district,
        latitude,
        longitude,
      },
      disease,
      reportDate,
      householdsVisited: householdsVisited ?? 0,
      newCases,
      criticalCases,
      notes,
      medicineSales: role === "MEDICAL" ? medicineSales : [],
      verification,
      trustScore,
    });

    return Response.json(
      {
        message: "WhatsApp report captured successfully",
        data: {
          id: report._id.toString(),
          workerId: report.workerId,
          reporterRole: report.reporterRole,
          disease: report.disease,
          newCases: report.newCases,
          criticalCases: report.criticalCases,
          location: report.location,
          reportDate: report.reportDate,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/ingest/whatsapp/post", error);
    return Response.json(
      { message: "Failed to capture WhatsApp report" },
      { status: 500 }
    );
  }
}
