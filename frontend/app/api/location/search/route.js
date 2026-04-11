import { logServerError } from "@/app/lib/server-log";

function normalizeLocation(item) {
  const address = item?.address || {};

  const village =
    address.village ||
    address.town ||
    address.city ||
    address.hamlet ||
    address.suburb ||
    "";
  const district = address.state_district || address.county || address.state || "";
  const latitude = Number(item?.lat);
  const longitude = Number(item?.lon);

  if (!village || !district || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }

  return {
    displayName: item.display_name || `${village}, ${district}`,
    village,
    district,
    latitude,
    longitude,
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q") || "").trim();

  if (query.length < 3) {
    return Response.json(
      { message: "Please enter at least 3 characters for area search." },
      { status: 400 }
    );
  }

  if (query.length > 120) {
    return Response.json({ message: "Search query is too long." }, { status: 400 });
  }

  try {
    const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
    searchUrl.searchParams.set("format", "jsonv2");
    searchUrl.searchParams.set("addressdetails", "1");
    searchUrl.searchParams.set("limit", "5");
    searchUrl.searchParams.set("q", query);

    const response = await fetch(searchUrl.toString(), {
      headers: {
        "User-Agent": "jansetu-location-search",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      return Response.json({ message: "Location service is not reachable right now." }, { status: 502 });
    }

    const rawResults = await response.json();
    const results = Array.isArray(rawResults)
      ? rawResults.map(normalizeLocation).filter(Boolean)
      : [];

    return Response.json({
      location: results[0] || null,
      alternatives: results,
      message: results.length ? undefined : "No location found for this area.",
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      return Response.json(
        { message: "Location service timed out. Please try again." },
        { status: 504 }
      );
    }

    logServerError("api/location/search", error);
    return Response.json({ message: "Failed to search location." }, { status: 500 });
  }
}
