import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { requireAdmin } from "@/app/lib/auth/requireAdmin";
import { logServerError } from "@/app/lib/server-log";

const DEFAULT_LIMIT = 120;
const MAX_LIMIT = 250;
const DEFAULT_RADIUS_KM = 12;
const MAX_RADIUS_KM = 50;

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return { value: null, error: false };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: true };
  }

  return { value: parsed, error: false };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasCoordinates(location) {
  return Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);
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

function serializeWorker(user, distanceKm = null) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    workerId: user.workerId || null,
    location: user.location || null,
    status: user.status,
    createdAt: user.createdAt,
    createdBy: user.createdBy?.toString ? user.createdBy.toString() : user.createdBy || null,
    distanceKm: Number.isFinite(distanceKm) ? Number(distanceKm.toFixed(2)) : null,
  };
}

export async function GET(request) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const url = new URL(request.url);
    const district = normalizeText(url.searchParams.get("district"));
    const village = normalizeText(url.searchParams.get("village"));

    const { value: limitValue, error: limitError } = parseOptionalNumber(url.searchParams.get("limit"));
    if (limitError) {
      return Response.json({ message: "limit must be a valid number" }, { status: 400 });
    }

    const { value: radiusValue, error: radiusError } = parseOptionalNumber(
      url.searchParams.get("radiusKm")
    );
    if (radiusError) {
      return Response.json({ message: "radiusKm must be a valid number" }, { status: 400 });
    }

    const { value: latitude, error: latitudeError } = parseOptionalNumber(
      url.searchParams.get("latitude")
    );
    const { value: longitude, error: longitudeError } = parseOptionalNumber(
      url.searchParams.get("longitude")
    );

    if (latitudeError || longitudeError) {
      return Response.json({ message: "latitude and longitude must be valid numbers" }, { status: 400 });
    }

    const hasAnchorCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);
    if ((latitude === null) !== (longitude === null)) {
      return Response.json(
        { message: "latitude and longitude must be provided together" },
        { status: 400 }
      );
    }

    if (hasAnchorCoordinates && (latitude < -90 || latitude > 90)) {
      return Response.json({ message: "latitude must be between -90 and 90" }, { status: 400 });
    }

    if (hasAnchorCoordinates && (longitude < -180 || longitude > 180)) {
      return Response.json({ message: "longitude must be between -180 and 180" }, { status: 400 });
    }

    const limit = Number.isFinite(limitValue)
      ? Math.min(Math.max(Math.round(limitValue), 1), MAX_LIMIT)
      : DEFAULT_LIMIT;
    const radiusKm = Number.isFinite(radiusValue)
      ? Math.min(Math.max(radiusValue, 1), MAX_RADIUS_KM)
      : DEFAULT_RADIUS_KM;

    await dbConnect();

    const query = { role: "ASHA" };
    if (district) {
      query["location.district"] = {
        $regex: `^${escapeRegex(district)}$`,
        $options: "i",
      };
    }
    if (village && !district) {
      query["location.village"] = {
        $regex: `^${escapeRegex(village)}$`,
        $options: "i",
      };
    }

    const workers = await User.find(query)
      .select("_id name email role workerId location status createdAt createdBy")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const exact = [];
    const nearby = [];
    const others = [];

    for (const worker of workers) {
      const workerDistrict = normalizeText(worker?.location?.district);
      const workerVillage = normalizeText(worker?.location?.village);
      const districtMatches = Boolean(district) && workerDistrict === district;
      const villageMatches = Boolean(village) && workerVillage === village;
      const distanceKm =
        hasAnchorCoordinates && hasCoordinates(worker.location)
          ? haversineDistanceKm(latitude, longitude, worker.location.latitude, worker.location.longitude)
          : null;

      const isExactMatch =
        district && village
          ? districtMatches && villageMatches
          : district
            ? districtMatches
            : village
              ? villageMatches
              : false;
      const isNearbyByDistrict = districtMatches && !isExactMatch;
      const isNearbyByDistance = Number.isFinite(distanceKm) && distanceKm <= radiusKm && !isExactMatch;

      const serialized = serializeWorker(worker, distanceKm);

      if (isExactMatch) {
        exact.push(serialized);
      } else if (isNearbyByDistrict || isNearbyByDistance) {
        nearby.push(serialized);
      } else {
        others.push(serialized);
      }
    }

    return Response.json({
      count: workers.length,
      exactCount: exact.length,
      nearbyCount: nearby.length,
      context: {
        district: district || null,
        village: village || null,
        latitude: hasAnchorCoordinates ? latitude : null,
        longitude: hasAnchorCoordinates ? longitude : null,
        radiusKm,
      },
      data: [...exact, ...nearby, ...others],
      exact,
      nearby,
      others,
    });
  } catch (error) {
    logServerError("api/admin/asha-workers", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to load ASHA workers", error: reason },
      { status: 500 }
    );
  }
}
