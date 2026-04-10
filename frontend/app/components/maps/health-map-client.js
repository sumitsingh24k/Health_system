"use client";

import { useEffect, useMemo } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";

function resolveMarkerColor(report) {
  if (report.criticalCases > 0) return "#dc2626";
  if (report.newCases >= 10) return "#ea580c";
  if (report.newCases > 0) return "#0284c7";
  return "#16a34a";
}

function AutoFitBounds({ points }) {
  const map = useMap();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 100);

    if (!points.length) return;

    if (points.length === 1) {
      map.setView(points[0], 11);
      return () => window.clearTimeout(timer);
    }

    map.fitBounds(points, { padding: [30, 30] });

    return () => window.clearTimeout(timer);
  }, [map, points]);

  return null;
}

export default function HealthMapClient({ reports }) {
  const points = useMemo(
    () =>
      reports
        .filter(
          (item) =>
            Number.isFinite(item?.location?.latitude) && Number.isFinite(item?.location?.longitude)
        )
        .map((item) => [item.location.latitude, item.location.longitude]),
    [reports]
  );

  return (
    <div className="relative h-[360px] w-full overflow-hidden rounded-3xl border border-slate-200 shadow-sm md:h-[460px]">
      <MapContainer
        center={[22.9734, 78.6569]}
        zoom={5}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <AutoFitBounds points={points} />

        {reports.map((report) => {
          const latitude = report?.location?.latitude;
          const longitude = report?.location?.longitude;

          if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return null;
          }

          const markerColor = resolveMarkerColor(report);
          const markerRadius = Math.max(6, Math.min(20, 6 + report.newCases));

          return (
            <CircleMarker
              key={report.id}
              center={[latitude, longitude]}
              radius={markerRadius}
              pathOptions={{
                color: markerColor,
                fillColor: markerColor,
                fillOpacity: 0.45,
                weight: 2,
              }}
            >
              <Popup>
                <div className="min-w-[180px] space-y-1 text-sm">
                  <p className="text-sm font-bold text-slate-900">{report.disease}</p>
                  <p>
                    <strong>Area:</strong> {report.location.village}, {report.location.district}
                  </p>
                  <p>
                    <strong>New cases:</strong> {report.newCases}
                  </p>
                  <p>
                    <strong>Critical:</strong> {report.criticalCases}
                  </p>
                  <p>
                    <strong>Worker:</strong> {report.workerId}
                  </p>
                  <p>
                    <strong>Source:</strong> {report.reporterRole || "ASHA"}
                  </p>
                  <a
                    href={`https://www.google.com/maps?q=${latitude},${longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block pt-1 text-xs font-semibold text-sky-700 underline"
                  >
                    Open in Google Maps
                  </a>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {!points.length ? (
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-600 shadow">
          No GPS points yet. Add data with area suggestions first.
        </div>
      ) : null}
    </div>
  );
}
