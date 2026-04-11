export const DEFAULT_AI_INSIGHTS = {
  topHighRiskZones: [],
  emergingHotspots: [],
  trustWatchlist: [],
  mismatchReports: [],
  medicineDemand: [],
  topMedicinesSold: [],
  priceAnomalies: [],
};

export const EMPTY_MAP_ENTITIES = {
  ashaWorkers: [],
  hospitals: [],
  medicalTeams: [],
};

export function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function locationLabel(location) {
  if (!location?.village && !location?.district) {
    return "Location not set";
  }

  return [location?.village, location?.district].filter(Boolean).join(", ");
}

export function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return "";
  }

  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m away` : `${distanceKm.toFixed(1)} km away`;
}

export function parseMedicineSalesText(input) {
  if (!input || typeof input !== "string") return [];

  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [medicineRaw, unitsRaw, priceRaw, benchmarkRaw] = line.split(",").map((item) => item.trim());
      const unitsSold = Number(unitsRaw);
      const unitPrice = Number(priceRaw);
      const benchmarkPrice =
        benchmarkRaw === undefined || benchmarkRaw === "" ? null : Number(benchmarkRaw);

      if (!medicineRaw || !Number.isFinite(unitsSold) || unitsSold < 0 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        return null;
      }

      return {
        medicine: medicineRaw,
        unitsSold: Math.round(unitsSold),
        unitPrice: Number(unitPrice.toFixed(2)),
        benchmarkPrice:
          benchmarkPrice === null || !Number.isFinite(benchmarkPrice) || benchmarkPrice < 0
            ? null
            : Number(benchmarkPrice.toFixed(2)),
      };
    })
    .filter(Boolean);
}
