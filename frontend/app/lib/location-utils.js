function parseCoordinate(value) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }

  const number = Number(value);
  if (!Number.isFinite(number)) {
    return undefined;
  }

  return number;
}

export function buildLocation(input) {
  const village = typeof input?.village === "string" ? input.village.trim() : "";
  const district = typeof input?.district === "string" ? input.district.trim() : "";
  const latitude = parseCoordinate(input?.latitude);
  const longitude = parseCoordinate(input?.longitude);

  if (!village || !district) {
    return { error: "location.village and location.district are required", location: null };
  }

  if ((latitude === undefined) !== (longitude === undefined)) {
    return {
      error: "latitude and longitude must be provided together",
      location: null,
    };
  }

  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    return { error: "latitude must be between -90 and 90", location: null };
  }

  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    return { error: "longitude must be between -180 and 180", location: null };
  }

  return {
    error: null,
    location: {
      village,
      district,
      ...(latitude !== undefined && longitude !== undefined ? { latitude, longitude } : {}),
    },
  };
}

export function hasCoordinates(location) {
  return Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude);
}
