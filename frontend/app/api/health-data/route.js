import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import HealthData from "@/app/lib/schema/healthDataSchema";
import { hasCoordinates } from "@/app/lib/location-utils";

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

  try {
    const body = await request.json();

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

  if (!session || !["ADMIN", "ASHA", "HOSPITAL", "MEDICAL"].includes(role)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const url = new URL(request.url);
    const limitValue = Number(url.searchParams.get("limit") || 50);
    const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 200) : 50;
    const query = {};
    const disease = url.searchParams.get("disease");
    const reporterRole = url.searchParams.get("reporterRole");

    if (role === "ADMIN") {
      const district = url.searchParams.get("district");
      const village = url.searchParams.get("village");

      if (district) {
        query["location.district"] = district;
      }

      if (village) {
        query["location.village"] = village;
      }

      if (disease) {
        query.disease = disease;
      }

      if (reporterRole && ["ASHA", "MEDICAL"].includes(reporterRole)) {
        query.reporterRole = reporterRole;
      }
    } else if (role === "ASHA") {
      query.reportedBy = session.user.id;
    } else {
      if (!hasLocation(session.user.location)) {
        return Response.json({ message: "User location is missing" }, { status: 400 });
      }

      Object.assign(query, locationFilter(session.user.location));
    }

    const reports = await HealthData.find(query)
      .sort({ reportDate: -1, createdAt: -1 })
      .limit(limit)
      .lean();

    return Response.json({
      count: reports.length,
      data: reports.map(serializeReport),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to fetch health data", error: reason },
      { status: 500 }
    );
  }
}
