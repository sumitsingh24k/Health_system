"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Search } from "lucide-react";
import { useToast } from "@/app/components/toast-provider";
import { readApiPayload, resolveApiError } from "@/app/lib/fetch-utils";

function toDisplayLabel(item) {
  return item.displayName || `${item.village}, ${item.district}`;
}

export default function AreaSearchFields({ value, onChange, className = "" }) {
  const { toast } = useToast();
  const containerRef = useRef(null);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [helperMessage, setHelperMessage] = useState("Start typing area name for GPS suggestion.");

  const normalizedQuery = useMemo(() => query.trim(), [query]);

  function applyLocation(location) {
    onChange({
      village: location.village,
      district: location.district,
      latitude: String(location.latitude),
      longitude: String(location.longitude),
    });

    setQuery(toDisplayLabel(location));
    setSuggestions([]);
    setShowSuggestions(false);
    setActiveIndex(-1);
    setHelperMessage("Location selected from suggestion.");
    toast.success("Location set", toDisplayLabel(location));
  }

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!containerRef.current?.contains(event.target)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  useEffect(() => {
    if (normalizedQuery.length < 3) {
      setSuggestions([]);
      setActiveIndex(-1);
      setIsSearching(false);
      setShowSuggestions(false);
      if (normalizedQuery.length === 0) {
        setHelperMessage("Start typing area name for GPS suggestion.");
      } else {
        setHelperMessage("Type at least 3 characters to get location suggestions.");
      }
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);

      try {
        const response = await fetch(`/api/location/search?q=${encodeURIComponent(normalizedQuery)}`, {
          method: "GET",
          signal: controller.signal,
        });
        const payload = await readApiPayload(response);

        if (!response.ok) {
          throw new Error(resolveApiError(payload, "Location search failed"));
        }

        const options = Array.isArray(payload?.alternatives) ? payload.alternatives : [];
        if (cancelled) return;

        setSuggestions(options);
        setShowSuggestions(true);
        setActiveIndex(options.length ? 0 : -1);
        setHelperMessage(options.length ? "Select your area from suggestions." : "No matching area found.");
      } catch (error) {
        if (error.name === "AbortError" || cancelled) return;
        setSuggestions([]);
        setShowSuggestions(false);
        setActiveIndex(-1);
        setHelperMessage(error.message || "Could not search location right now.");
      } finally {
        if (!cancelled) {
          setIsSearching(false);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [normalizedQuery]);

  function onInputKeyDown(event) {
    if (!showSuggestions || !suggestions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
      return;
    }

    if (event.key === "Enter" && activeIndex >= 0 && activeIndex < suggestions.length) {
      event.preventDefault();
      applyLocation(suggestions[activeIndex]);
    }
  }

  return (
    <div ref={containerRef} className={`space-y-3 ${className}`}>
      <div className="relative">
        <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3 focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-200">
          <Search size={14} className="mr-2 text-slate-500" />
          <input
            placeholder="Type area (e.g. Indore, Madhya Pradesh)"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => {
              if (suggestions.length) setShowSuggestions(true);
            }}
            onKeyDown={onInputKeyDown}
            className="w-full bg-transparent py-2.5 text-sm outline-none"
            autoComplete="off"
          />
          {isSearching ? <Loader2 size={15} className="animate-spin text-emerald-700" /> : null}
        </div>

        {showSuggestions && (suggestions.length > 0 || normalizedQuery.length >= 3) ? (
          <div className="absolute z-30 mt-2 max-h-60 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
            {suggestions.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No results found.</p>
            ) : (
              suggestions.map((item, index) => (
                <button
                  key={`${item.latitude}-${item.longitude}-${index}`}
                  type="button"
                  onClick={() => applyLocation(item)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition ${
                    index === activeIndex ? "bg-emerald-50" : "hover:bg-slate-50"
                  }`}
                >
                  <p className="truncate text-sm font-semibold text-slate-900">{item.village}</p>
                  <p className="truncate text-xs text-slate-500">
                    {item.district} - {item.latitude.toFixed(5)}, {item.longitude.toFixed(5)}
                  </p>
                </button>
              ))
            )}
          </div>
        ) : null}
      </div>

      <p className="text-xs text-slate-500">{helperMessage}</p>

      <div className="grid gap-3 md:grid-cols-2">
        <input
          placeholder="Village"
          value={value.village}
          onChange={(event) => onChange({ village: event.target.value })}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
          required
        />
        <input
          placeholder="District"
          value={value.district}
          onChange={(event) => onChange({ district: event.target.value })}
          className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
          required
        />
      </div>

      <div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        <MapPin size={13} className="text-emerald-700" />
        {value.latitude && value.longitude
          ? `GPS: ${value.latitude}, ${value.longitude}`
          : "GPS is auto-filled after selecting suggestion"}
      </div>
    </div>
  );
}
