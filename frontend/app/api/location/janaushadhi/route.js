import { logServerError } from "@/app/lib/server-log";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyPharmacy(tags) {
  const name = `${tags?.name || ""} ${tags?.brand || ""} ${tags?.operator || ""}`.toLowerCase();
  const isJanaushadhi =
    /jana\s*aushadhi/.test(name) ||
    /jan aushadhi/.test(name) ||
    /pradhan mantri bharatiya janaushadhi/.test(name) ||
    /pmbi/.test(name);

  return isJanaushadhi ? "JANAUSHADHI" : "PRIVATE";
}

function normalizeResult(element, latitude, longitude) {
  const tags = element?.tags || {};
  const lat = toNumber(element?.lat ?? element?.center?.lat);
  const lng = toNumber(element?.lon ?? element?.center?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const name = tags.name || tags.brand || "Pharmacy";
  const type = classifyPharmacy(tags);
  const distanceKm = haversineKm(latitude, longitude, lat, lng);

  return {
    id: `${element?.type || "node"}-${element?.id || Math.random().toString(36).slice(2)}`,
    name,
    type,
    latitude: lat,
    longitude: lng,
    distanceKm: Number(distanceKm.toFixed(2)),
    address: tags["addr:full"] || [tags["addr:street"], tags["addr:city"], tags["addr:district"]].filter(Boolean).join(", "),
    recommended: type === "JANAUSHADHI",
  };
}

async function queryOverpass(latitude, longitude, radiusMeters) {
  const query = `
[out:json][timeout:20];
(
  node["amenity"="pharmacy"](around:${radiusMeters},${latitude},${longitude});
  way["amenity"="pharmacy"](around:${radiusMeters},${latitude},${longitude});
  relation["amenity"="pharmacy"](around:${radiusMeters},${latitude},${longitude});
);
out center tags 80;`;

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: {
      "Content-Type": "text/plain;charset=UTF-8",
      "User-Agent": "health-system-janaushadhi-search",
    },
    body: query,
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    throw new Error(`Overpass request failed with status ${response.status}`);
  }

  const json = await response.json();
  return Array.isArray(json?.elements) ? json.elements : [];
}

export async function GET(request) {
  const url = new URL(request.url);
  const latitude = toNumber(url.searchParams.get("latitude"));
  const longitude = toNumber(url.searchParams.get("longitude"));
  const radiusKm = toNumber(url.searchParams.get("radiusKm")) ?? 8;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return Response.json(
      { message: "latitude and longitude are required for Janaushadhi search" },
      { status: 400 }
    );
  }

  const boundedRadiusKm = Math.max(2, Math.min(20, radiusKm));
  const fallbackPayload = {
    center: { latitude, longitude, radiusKm: boundedRadiusKm },
    janaushadhi: [],
    privateStores: [],
    all: [],
    recommendation:
      "Live pharmacy lookup is temporarily unavailable. Retry soon and use nearest known medicine center for urgent supply.",
    degraded: true,
  };

  try {
    const radiusMeters = Math.round(boundedRadiusKm * 1000);
    const raw = await queryOverpass(latitude, longitude, radiusMeters);

    const nearby = raw
      .map((entry) => normalizeResult(entry, latitude, longitude))
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 30);

    const janaushadhi = nearby.filter((entry) => entry.type === "JANAUSHADHI").slice(0, 10);
    const privateStores = nearby.filter((entry) => entry.type === "PRIVATE").slice(0, 10);

    return Response.json({
      center: { latitude, longitude, radiusKm: boundedRadiusKm },
      janaushadhi,
      privateStores,
      all: nearby,
      recommendation:
        janaushadhi[0]
          ? `Prefer ${janaushadhi[0].name} (${janaushadhi[0].distanceKm} km) for affordable supply planning.`
          : "No nearby Janaushadhi found. Compare private prices with caution and raise supply request.",
      degraded: false,
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return Response.json(
        {
          ...fallbackPayload,
          message: "Janaushadhi search timed out. Showing fallback results.",
        },
        { status: 200 }
      );
    }

    logServerError("api/location/janaushadhi", error);
    return Response.json(
      {
        ...fallbackPayload,
        message: "Could not reach live map service. Showing fallback results.",
      },
      { status: 200 }
    );
  }
}
