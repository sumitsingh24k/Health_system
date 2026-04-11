function normalizeString(value, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function simpleHash(value) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 1_000_000;
  }
  return hash;
}

export function toPincodeLikeCode(location = {}) {
  const district = normalizeString(location.district, "unknown");
  const village = normalizeString(location.village, "unknown");
  const latitude = Number(location.latitude);
  const longitude = Number(location.longitude);
  const coordinatePart =
    Number.isFinite(latitude) && Number.isFinite(longitude)
      ? `${latitude.toFixed(3)}:${longitude.toFixed(3)}`
      : "0:0";

  const seed = `${district.toLowerCase()}|${village.toLowerCase()}|${coordinatePart}`;
  return String(simpleHash(seed)).padStart(6, "0");
}

export function toBackendCasePayload(reportForm, user) {
  const disease = normalizeString(reportForm.disease, "general");
  const newCases = Math.max(1, Number.parseInt(reportForm.newCases || "0", 10) || 1);
  const criticalCases = Math.max(0, Number.parseInt(reportForm.criticalCases || "0", 10) || 0);
  const householdsVisited = Math.max(
    0,
    Number.parseInt(reportForm.householdsVisited || "0", 10) || 0
  );

  return {
    worker_id: normalizeString(user.workerId) || normalizeString(user.id) || "UNKNOWN_WORKER",
    location: toPincodeLikeCode({
      district: user?.location?.district || "",
      village: user?.location?.village || "",
      latitude: reportForm.latitude,
      longitude: reportForm.longitude,
    }),
    symptoms: [disease.toLowerCase()],
    cases_count: newCases,
    text: [
      `disease:${disease}`,
      `newCases:${newCases}`,
      `criticalCases:${criticalCases}`,
      `householdsVisited:${householdsVisited}`,
      `notes:${normalizeString(reportForm.notes) || "none"}`,
      `latitude:${normalizeString(reportForm.latitude) || "na"}`,
      `longitude:${normalizeString(reportForm.longitude) || "na"}`,
    ].join("; "),
    timestamp: new Date().toISOString(),
  };
}

function parseNumericFromTranscript(text, key) {
  if (!text) return 0;
  const pattern = new RegExp(`${key}:(\\d+)`, "i");
  const match = text.match(pattern);
  if (!match) return 0;
  return Number.parseInt(match[1], 10) || 0;
}

export function fromBackendCaseRecord(record, fallbackLocation = null) {
  const transcript = normalizeString(record.transcript_text);
  return {
    id: record.id,
    workerId: record.worker_id,
    reporterRole: record.source === "medical_shop" ? "MEDICAL" : "ASHA",
    location: {
      village: fallbackLocation?.village || "Unknown",
      district: fallbackLocation?.district || "Unknown",
      latitude: Number(fallbackLocation?.latitude),
      longitude: Number(fallbackLocation?.longitude),
    },
    disease: normalizeString(record.symptoms?.[0], "UNKNOWN").toUpperCase(),
    reportDate: record.timestamp,
    householdsVisited: parseNumericFromTranscript(transcript, "householdsVisited"),
    newCases: Number(record.cases_count) || 0,
    criticalCases: parseNumericFromTranscript(transcript, "criticalCases"),
    notes: transcript,
    createdAt: record.timestamp,
    updatedAt: record.timestamp,
  };
}

export function toPredictionPayload(reports, rawLocation) {
  const location =
    rawLocation && typeof rawLocation === "object" ? rawLocation : {};
  const totalCases = reports.reduce((sum, report) => sum + (Number(report.newCases) || 0), 0);
  const diseaseCounter = reports.reduce((acc, report) => {
    const disease = normalizeString(report.disease);
    if (!disease) {
      return acc;
    }
    acc.set(disease, (acc.get(disease) || 0) + 1);
    return acc;
  }, new Map());
  const mostCommonDisease =
    [...diseaseCounter.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "Unknown";

  return {
    location: {
      city: normalizeString(location.village, "Unknown"),
      region: normalizeString(location.district, "Unknown"),
      country: "India",
    },
    time_period: {
      start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      end: new Date().toISOString().slice(0, 10),
    },
    health_data: {
      number_of_cases: totalCases,
      disease_type: mostCommonDisease || "Unknown",
      population_density: 1000,
    },
    environmental_data: {
      temperature: 30,
      humidity: 60,
      rainfall_mm: 10,
    },
  };
}
