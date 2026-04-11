"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Crosshair, Hospital, Loader2, MapPin, Pill } from "lucide-react";

function riskTone(level) {
  if (level === "HIGH") return "border-rose-200 bg-rose-50 text-rose-700";
  if (level === "MEDIUM") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function PublicAreaChecker() {
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radiusKm, setRadiusKm] = useState("10");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);

  const risk = result?.risk || null;
  const publicView = result?.publicView || null;
  const nearby = publicView?.nearby || result?.nearby || { hospitals: [], janaushadhi: [], privateStores: [] };
  const riskClass = useMemo(() => riskTone(risk?.level), [risk?.level]);

  async function handleCheck(event) {
    event.preventDefault();
    setError("");
    setIsLoading(true);
    setResult(null);

    try {
      const params = new URLSearchParams({
        latitude,
        longitude,
        radiusKm,
      });
      const response = await fetch(`/api/public/area-insight?${params.toString()}`, {
        method: "GET",
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message || "Could not fetch area insight");
      }
      setResult(payload);
    } catch (fetchError) {
      setError(fetchError?.message || "Could not fetch area insight");
    } finally {
      setIsLoading(false);
    }
  }

  function useCurrentLocation() {
    if (!navigator?.geolocation) {
      setError("Geolocation is not available in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(String(position.coords.latitude));
        setLongitude(String(position.coords.longitude));
      },
      (geoError) => {
        setError(geoError?.message || "Could not capture current location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-xl font-bold text-slate-900">Public Area Safety Checker</h3>
          <p className="text-sm text-slate-600">
            Enter location and get only useful outputs: risk, precautions, nearby care, and medicines.
          </p>
        </div>
      </div>

      <form onSubmit={handleCheck} className="mt-4 grid gap-3 md:grid-cols-4">
        <input
          type="number"
          step="any"
          placeholder="Latitude"
          value={latitude}
          onChange={(event) => setLatitude(event.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
          required
        />
        <input
          type="number"
          step="any"
          placeholder="Longitude"
          value={longitude}
          onChange={(event) => setLongitude(event.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
          required
        />
        <input
          type="number"
          min="2"
          max="25"
          step="1"
          placeholder="Radius (km)"
          value={radiusKm}
          onChange={(event) => setRadiusKm(event.target.value)}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
          required
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={useCurrentLocation}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            <Crosshair size={14} />
            Use GPS
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : null}
            Check
          </button>
        </div>
      </form>

      {error ? (
        <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <article className={`rounded-2xl border px-3 py-2 ${riskClass}`}>
              <p className="text-xs font-semibold uppercase tracking-wide">Risk Decision</p>
              <p className="mt-1 text-xl font-bold">{publicView?.riskLevel || risk?.level || "Low Risk Area"}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trend</p>
              <p className="mt-1 text-2xl font-bold text-amber-700">{publicView?.trend || risk?.trend || "Stable"}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supply Status</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{publicView?.supply || "Stock Check"}</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price Decision</p>
              <p className="mt-1 text-sm font-semibold text-slate-900">{publicView?.price || "Price Normal"}</p>
            </article>
          </div>

          <article className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI Decision</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{publicView?.supplyMessage || risk?.prediction}</p>
            <p className="mt-1 text-xs text-emerald-700">{publicView?.savingsMessage || "Prefer affordable nearby options."}</p>
          </article>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <AlertTriangle size={13} />
                Precautions
              </p>
              <div className="mt-2 space-y-1">
                {(publicView?.precautions || result?.precautions || []).map((item, index) => (
                  <p key={`${item}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                    {item}
                  </p>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Pill size={13} />
                Medicine Need
              </p>
              <div className="mt-2 space-y-1">
                {(result?.medicineDemand || []).slice(0, 4).map((item) => (
                  <div key={item.medicine} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs">
                    <span className="font-medium text-slate-800">{item.medicine}</span>
                    <span className="font-semibold text-slate-700">
                      {item.expectedUnitsNext3Days} ({item.availability})
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Pill size={13} />
                Price Comparison
              </p>
              {result?.priceComparison ? (
                <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <p className="text-sm font-semibold text-slate-900">{result.priceComparison.medicine}</p>
                  <p className="mt-1 text-xs text-slate-700">
                    {`Rs ${result.priceComparison.privatePrice} -> Rs ${result.priceComparison.janaushadhiPrice}`}
                  </p>
                  <p className="mt-1 text-xs font-semibold text-emerald-700">
                    {publicView?.savingsMessage || `Save Rs ${result.priceComparison.savings}`}
                  </p>
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Price comparison appears when medical reports include benchmark pricing.
                </p>
              )}
            </article>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Hospital size={13} />
                Nearby Hospitals
              </p>
              <div className="mt-2 space-y-1 text-xs text-slate-700">
                {nearby.hospitals.length === 0 ? (
                  <p>No hospitals found in range.</p>
                ) : (
                  nearby.hospitals.slice(0, 4).map((item) => (
                    <p key={item.id}>
                      {item.name} ({item.distanceKm} km)
                    </p>
                  ))
                )}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <MapPin size={13} />
                Nearby Janaushadhi
              </p>
              <div className="mt-2 space-y-1 text-xs text-slate-700">
                {nearby.janaushadhi.length === 0 ? (
                  <p>No centers found in range.</p>
                ) : (
                  nearby.janaushadhi.slice(0, 4).map((item) => (
                    <p key={item.id}>
                      {item.name} ({item.distanceKm} km)
                    </p>
                  ))
                )}
              </div>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Pill size={13} />
                Nearby Medical Stores
              </p>
              <div className="mt-2 space-y-1 text-xs text-slate-700">
                {nearby.privateStores.length === 0 ? (
                  <p>No private stores found in range.</p>
                ) : (
                  nearby.privateStores.slice(0, 4).map((item) => (
                    <p key={item.id}>
                      {item.name} ({item.distanceKm} km)
                    </p>
                  ))
                )}
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </section>
  );
}
