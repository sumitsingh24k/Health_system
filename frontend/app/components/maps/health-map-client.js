"use client";

import { useEffect, useMemo, useState } from "react";
import L from "leaflet";
import {
  Circle,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";

const INDIA_CENTER = [22.9734, 78.6569];
const MAP_BY_ROLE = {
  ADMIN: { center: INDIA_CENTER, zoom: 5 },
  HOSPITAL: { center: [22.9734, 78.6569], zoom: 6 },
  MEDICAL: { center: [22.9734, 78.6569], zoom: 7 },
  ASHA: { center: [22.9734, 78.6569], zoom: 8 },
};

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function isRecentReport(report) {
  const referenceDate = parseDate(report?.createdAt || report?.reportDate);
  if (!referenceDate) return false;
  return Date.now() - referenceDate.getTime() <= 1000 * 60 * 60 * 24;
}

function resolveSeverity(report) {
  const criticalCases = Number(report?.criticalCases) || 0;
  const newCases = Number(report?.newCases) || 0;

  if (criticalCases > 0 || newCases >= 15) return "HIGH";
  if (newCases >= 6) return "MEDIUM";
  return "LOW";
}

function resolveCaseColor(severity) {
  if (severity === "HIGH") return "#dc2626";
  if (severity === "MEDIUM") return "#f59e0b";
  return "#16a34a";
}

function resolveRiskLabel(riskLevel) {
  if (riskLevel === "HIGH_RISK") return "HIGH RISK";
  if (riskLevel === "MEDIUM_RISK") return "MEDIUM";
  return "SAFE";
}

function createMarkerIcon({ label, color, pulse = false }) {
  return L.divIcon({
    className: "",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -12],
    html: `<span class="map-smart-marker ${pulse ? "map-smart-marker-pulse" : ""}" style="background:${color};">${label}</span>`,
  });
}

function createClusterIcon(cluster) {
  const color = cluster.newCases >= 25 ? "#dc2626" : cluster.newCases >= 10 ? "#f59e0b" : "#0ea5e9";

  return L.divIcon({
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    html: `<span class="map-cluster-marker" style="background:${color};">${cluster.count}</span>`,
  });
}

function buildClusters(points, zoom) {
  if (!points.length) return [];

  const cellSize = zoom <= 5 ? 2.2 : zoom <= 6 ? 1.4 : zoom <= 7 ? 0.9 : 0.5;
  const grouped = new Map();

  for (const point of points) {
    const lat = point.latitude;
    const lng = point.longitude;
    const cellLat = Math.floor(lat / cellSize);
    const cellLng = Math.floor(lng / cellSize);
    const key = `${cellLat}:${cellLng}`;

    const bucket = grouped.get(key) || {
      id: key,
      count: 0,
      newCases: 0,
      criticalCases: 0,
      latSum: 0,
      lngSum: 0,
      districtCount: new Map(),
      villageCount: new Map(),
    };

    bucket.count += 1;
    bucket.newCases += point.newCases;
    bucket.criticalCases += point.criticalCases;
    bucket.latSum += lat;
    bucket.lngSum += lng;

    if (point.district) {
      bucket.districtCount.set(
        point.district,
        (bucket.districtCount.get(point.district) || 0) + 1
      );
    }
    if (point.village) {
      bucket.villageCount.set(point.village, (bucket.villageCount.get(point.village) || 0) + 1);
    }

    grouped.set(key, bucket);
  }

  return [...grouped.values()].map((cluster) => {
    const centerLat = cluster.latSum / cluster.count;
    const centerLng = cluster.lngSum / cluster.count;
    const district = [...cluster.districtCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const village = [...cluster.villageCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    return {
      ...cluster,
      latitude: centerLat,
      longitude: centerLng,
      district,
      village,
    };
  });
}

function BuildMapState({ points, role, userLocation, selectedRegion, onZoomChange }) {
  const map = useMap();

  useMapEvents({
    zoomend: () => {
      onZoomChange(map.getZoom());
    },
  });

  useEffect(() => {
    const timer = window.setTimeout(() => map.invalidateSize(), 120);
    return () => window.clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (
      Number.isFinite(selectedRegion?.latitude) &&
      Number.isFinite(selectedRegion?.longitude)
    ) {
      map.flyTo([selectedRegion.latitude, selectedRegion.longitude], Math.max(map.getZoom(), 8), {
        duration: 0.8,
      });
      return;
    }

    if (points.length === 0) {
      if (Number.isFinite(userLocation?.latitude) && Number.isFinite(userLocation?.longitude)) {
        map.setView([userLocation.latitude, userLocation.longitude], role === "ASHA" ? 10 : 7);
        return;
      }

      const fallback = MAP_BY_ROLE[role] || MAP_BY_ROLE.ASHA;
      map.setView(fallback.center, fallback.zoom);
      return;
    }

    if (points.length === 1) {
      map.setView(points[0], role === "ADMIN" ? 9 : 10);
      return;
    }

    map.fitBounds(points, {
      padding: [32, 32],
      maxZoom: role === "ADMIN" ? 9 : 10,
    });
  }, [map, points, role, selectedRegion, userLocation]);

  return null;
}

export default function HealthMapClient({
  reports = [],
  entities = {},
  riskZones = [],
  role = "ASHA",
  userLocation = null,
  selectedRegion = null,
  onRegionSelect = null,
}) {
  const [zoomLevel, setZoomLevel] = useState(MAP_BY_ROLE[role]?.zoom || 6);
  const [layers, setLayers] = useState({
    heatmap: true,
    markers: true,
    clusters: true,
    risk: true,
    ashaWorkers: true,
    hospitals: true,
  });

  const caseIcons = useMemo(
    () => ({
      HIGH: createMarkerIcon({ label: "P", color: "#dc2626" }),
      MEDIUM: createMarkerIcon({ label: "P", color: "#f59e0b" }),
      LOW: createMarkerIcon({ label: "P", color: "#16a34a" }),
      HIGH_NEW: createMarkerIcon({ label: "P", color: "#dc2626", pulse: true }),
      MEDIUM_NEW: createMarkerIcon({ label: "P", color: "#f59e0b", pulse: true }),
      LOW_NEW: createMarkerIcon({ label: "P", color: "#16a34a", pulse: true }),
      ASHA: createMarkerIcon({ label: "A", color: "#db2777" }),
      HOSPITAL: createMarkerIcon({ label: "H", color: "#2563eb" }),
      MEDICAL: createMarkerIcon({ label: "M", color: "#0d9488" }),
    }),
    []
  );

  const casePoints = useMemo(() => {
    return reports
      .map((report) => {
        const latitude = report?.location?.latitude;
        const longitude = report?.location?.longitude;
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

        const severity = resolveSeverity(report);

        return {
          ...report,
          latitude,
          longitude,
          severity,
          isRecent: isRecentReport(report),
          district: report?.location?.district || null,
          village: report?.location?.village || null,
          newCases: report?.newCases || 0,
          criticalCases: report?.criticalCases || 0,
        };
      })
      .filter(Boolean);
  }, [reports]);

  const mapPoints = useMemo(() => {
    const points = casePoints.map((point) => [point.latitude, point.longitude]);
    const ashaWorkers = Array.isArray(entities?.ashaWorkers) ? entities.ashaWorkers : [];
    const hospitals = Array.isArray(entities?.hospitals) ? entities.hospitals : [];
    const medicalTeams = Array.isArray(entities?.medicalTeams) ? entities.medicalTeams : [];

    for (const person of [...ashaWorkers, ...hospitals, ...medicalTeams]) {
      const latitude = person?.location?.latitude;
      const longitude = person?.location?.longitude;
      if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
        points.push([latitude, longitude]);
      }
    }

    return points;
  }, [casePoints, entities]);

  const clusters = useMemo(() => buildClusters(casePoints, zoomLevel), [casePoints, zoomLevel]);

  const normalizedRiskZones = useMemo(() => {
    if (riskZones.length) {
      return riskZones.filter(
        (zone) => Number.isFinite(zone?.latitude) && Number.isFinite(zone?.longitude)
      );
    }

    return clusters.map((cluster) => {
      const score = cluster.newCases + cluster.criticalCases * 3;
      const riskLevel = score >= 35 ? "HIGH_RISK" : score >= 14 ? "MEDIUM_RISK" : "SAFE";
      return {
        id: cluster.id,
        district: cluster.district || "Unknown district",
        village: cluster.village || "Unknown village",
        latitude: cluster.latitude,
        longitude: cluster.longitude,
        newCases: cluster.newCases,
        criticalCases: cluster.criticalCases,
        riskLevel,
        riskColor:
          riskLevel === "HIGH_RISK"
            ? "#dc2626"
            : riskLevel === "MEDIUM_RISK"
              ? "#f59e0b"
              : "#22c55e",
        radiusMeters: Math.max(4500, cluster.newCases * 700),
      };
    });
  }, [clusters, riskZones]);

  const showClusters = layers.clusters && zoomLevel <= 7;
  const showIndividualCases = layers.markers && zoomLevel >= 7;
  const showHeatmap = layers.heatmap && zoomLevel <= 9;

  const ashaWorkers = Array.isArray(entities?.ashaWorkers) ? entities.ashaWorkers : [];
  const hospitals = Array.isArray(entities?.hospitals) ? entities.hospitals : [];
  const medicalTeams = Array.isArray(entities?.medicalTeams) ? entities.medicalTeams : [];

  return (
    <div className="relative h-[390px] w-full overflow-hidden rounded-3xl border border-slate-200 shadow-sm md:h-[560px]">
      <MapContainer center={MAP_BY_ROLE[role]?.center || INDIA_CENTER} zoom={MAP_BY_ROLE[role]?.zoom || 6} scrollWheelZoom className="h-full w-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <BuildMapState
          points={mapPoints}
          role={role}
          userLocation={userLocation}
          selectedRegion={selectedRegion}
          onZoomChange={setZoomLevel}
        />

        {role === "ASHA" &&
        Number.isFinite(userLocation?.latitude) &&
        Number.isFinite(userLocation?.longitude) ? (
          <Circle
            center={[userLocation.latitude, userLocation.longitude]}
            radius={6000}
            pathOptions={{
              color: "#be123c",
              fillColor: "#fda4af",
              fillOpacity: 0.14,
              weight: 2,
              dashArray: "6 8",
            }}
          >
            <Tooltip direction="top" sticky>
              <p className="text-xs font-semibold text-slate-900">Assigned ASHA area</p>
            </Tooltip>
          </Circle>
        ) : null}

        {layers.risk
          ? normalizedRiskZones.map((zone) => (
              <Circle
                key={`risk-${zone.id}`}
                center={[zone.latitude, zone.longitude]}
                radius={zone.radiusMeters || 6000}
                pathOptions={{
                  color: zone.riskColor || "#f59e0b",
                  fillColor: zone.riskColor || "#f59e0b",
                  fillOpacity: 0.12,
                  weight: 2,
                }}
                eventHandlers={{
                  click: () => {
                    onRegionSelect?.({
                      district: zone.district,
                      village: zone.village,
                      latitude: zone.latitude,
                      longitude: zone.longitude,
                    });
                  },
                }}
              >
                <Tooltip direction="center" permanent={zoomLevel >= 7}>
                  <span className="text-[10px] font-bold">{resolveRiskLabel(zone.riskLevel)}</span>
                </Tooltip>
                <Popup>
                  <div className="min-w-[210px] space-y-1 text-sm">
                    <p className="text-sm font-bold text-slate-900">
                      {resolveRiskLabel(zone.riskLevel)} - {zone.village}
                    </p>
                    <p>
                      <strong>District:</strong> {zone.district}
                    </p>
                    <p>
                      <strong>Cases:</strong> {zone.newCases || 0}
                    </p>
                    <p>
                      <strong>Critical:</strong> {zone.criticalCases || 0}
                    </p>
                  </div>
                </Popup>
              </Circle>
            ))
          : null}

        {showHeatmap
          ? normalizedRiskZones.map((zone) => {
              const riskColor = zone.riskColor || "#f59e0b";
              const radius = Math.max(3500, (zone.newCases || 0) * 480);
              return (
                <Circle
                  key={`heat-${zone.id}`}
                  center={[zone.latitude, zone.longitude]}
                  radius={radius}
                  pathOptions={{
                    stroke: false,
                    fillColor: riskColor,
                    fillOpacity: 0.2,
                  }}
                />
              );
            })
          : null}

        {showClusters
          ? clusters.map((cluster) => (
              <Marker
                key={`cluster-${cluster.id}`}
                position={[cluster.latitude, cluster.longitude]}
                icon={createClusterIcon(cluster)}
                eventHandlers={{
                  click: () => {
                    onRegionSelect?.({
                      district: cluster.district,
                      village: cluster.village,
                      latitude: cluster.latitude,
                      longitude: cluster.longitude,
                    });
                  },
                }}
              >
                <Popup>
                  <div className="min-w-[190px] space-y-1 text-sm">
                    <p className="font-bold text-slate-900">Cluster Summary</p>
                    <p>
                      <strong>Reports:</strong> {cluster.count}
                    </p>
                    <p>
                      <strong>New cases:</strong> {cluster.newCases}
                    </p>
                    <p>
                      <strong>Critical:</strong> {cluster.criticalCases}
                    </p>
                    <p>
                      <strong>Main area:</strong> {cluster.village || "Unknown"}, {cluster.district || "Unknown"}
                    </p>
                  </div>
                </Popup>
              </Marker>
            ))
          : null}

        {showIndividualCases
          ? casePoints.map((point) => {
              const iconKey = point.isRecent ? `${point.severity}_NEW` : point.severity;
              return (
                <Marker
                  key={`case-${point.id}`}
                  position={[point.latitude, point.longitude]}
                  icon={caseIcons[iconKey]}
                  eventHandlers={{
                    click: () => {
                      onRegionSelect?.({
                        district: point.district,
                        village: point.village,
                        latitude: point.latitude,
                        longitude: point.longitude,
                      });
                    },
                  }}
                >
                  <Popup>
                    <div className="min-w-[220px] space-y-1 text-sm">
                      <p className="text-sm font-bold text-slate-900">
                        Patient Case - {point.disease}
                      </p>
                      <p>
                        <strong>Area:</strong> {point.village}, {point.district}
                      </p>
                      <p>
                        <strong>Severity:</strong>{" "}
                        <span style={{ color: resolveCaseColor(point.severity) }}>{point.severity}</span>
                      </p>
                      <p>
                        <strong>New cases:</strong> {point.newCases}
                      </p>
                      <p>
                        <strong>Critical:</strong> {point.criticalCases}
                      </p>
                      <p>
                        <strong>Worker:</strong> {point.workerId}
                      </p>
                      <p>
                        <strong>Source:</strong> {point.reporterRole || "ASHA"}
                      </p>
                      <a
                        href={`https://www.google.com/maps?q=${point.latitude},${point.longitude}`}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-block pt-1 text-xs font-semibold text-sky-700 underline"
                      >
                        Open in Google Maps
                      </a>
                    </div>
                  </Popup>
                </Marker>
              );
            })
          : null}

        {layers.ashaWorkers
          ? ashaWorkers
              .filter(
                (worker) =>
                  Number.isFinite(worker?.location?.latitude) &&
                  Number.isFinite(worker?.location?.longitude)
              )
              .map((worker) => (
                <Marker
                  key={`asha-${worker.id}`}
                  position={[worker.location.latitude, worker.location.longitude]}
                  icon={caseIcons.ASHA}
                >
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <p className="font-bold text-slate-900">ASHA Worker</p>
                      <p>
                        <strong>Name:</strong> {worker.name}
                      </p>
                      <p>
                        <strong>ID:</strong> {worker.workerId || "N/A"}
                      </p>
                      <p>
                        <strong>Area:</strong> {worker?.location?.village}, {worker?.location?.district}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))
          : null}

        {layers.hospitals
          ? [...hospitals, ...medicalTeams]
              .filter(
                (unit) =>
                  Number.isFinite(unit?.location?.latitude) &&
                  Number.isFinite(unit?.location?.longitude)
              )
              .map((unit) => (
                <Marker
                  key={`hospital-${unit.id}`}
                  position={[unit.location.latitude, unit.location.longitude]}
                  icon={unit.role === "MEDICAL" ? caseIcons.MEDICAL : caseIcons.HOSPITAL}
                >
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <p className="font-bold text-slate-900">
                        {unit.role === "MEDICAL" ? "Medical Team" : "Hospital Unit"}
                      </p>
                      <p>
                        <strong>Name:</strong> {unit.name}
                      </p>
                      <p>
                        <strong>Area:</strong> {unit?.location?.village}, {unit?.location?.district}
                      </p>
                    </div>
                  </Popup>
                </Marker>
              ))
          : null}
      </MapContainer>

      <div className="absolute left-3 top-3 z-[600] w-[260px] rounded-2xl border border-slate-200 bg-white/95 p-3 text-xs shadow-lg backdrop-blur">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Map Layers</p>
        <div className="mt-2 grid grid-cols-2 gap-2 text-slate-700">
          {[
            { key: "heatmap", label: "Heatmap" },
            { key: "markers", label: "Case Markers" },
            { key: "clusters", label: "Clusters" },
            { key: "risk", label: "Risk Areas" },
            { key: "ashaWorkers", label: "ASHA" },
            { key: "hospitals", label: "Hospitals" },
          ].map((item) => (
            <label key={item.key} className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={layers[item.key]}
                onChange={(event) =>
                  setLayers((current) => ({
                    ...current,
                    [item.key]: event.target.checked,
                  }))
                }
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
        <div className="mt-3 space-y-1 text-[11px] text-slate-600">
          <p>
            <strong>Risk:</strong> <span className="text-red-600">High</span> /{" "}
            <span className="text-amber-600">Medium</span> / <span className="text-emerald-600">Safe</span>
          </p>
          <p>
            <strong>Zoom intelligence:</strong> zoom out for clusters + heatmap, zoom in for individual cases.
          </p>
          <p>
            <strong>Selected role view:</strong> {role}
          </p>
        </div>
      </div>

      {!mapPoints.length ? (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow">
          No GPS points yet. Add data with area suggestions first.
        </div>
      ) : null}
    </div>
  );
}
