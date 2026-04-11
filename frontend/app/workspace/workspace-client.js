"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Activity,
  AlertTriangle,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Crosshair,
  LocateFixed,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  ShieldCheck,
  Stethoscope,
  Store,
  UserCheck,
  Users,
} from "lucide-react";
import HealthMap from "@/app/components/maps/health-map";
import { useToast } from "@/app/components/toast-provider";
import AreaSearchFields from "@/app/components/location/area-search-fields";
import MultilingualVoiceInput from "@/app/components/voice/multilingual-voice-input";
import Button from "@/app/components/ui/button";
import { backendGet, backendPost } from "@/app/lib/api-client";
import {
  fromBackendCaseRecord,
  toBackendCasePayload,
  toPincodeLikeCode,
  toPredictionPayload,
} from "@/app/lib/backend-adapters";

const DEFAULT_AI_INSIGHTS = {
  topHighRiskZones: [],
  emergingHotspots: [],
  trustWatchlist: [],
  mismatchReports: [],
  medicineDemand: [],
  topMedicinesSold: [],
  priceAnomalies: [],
};

const EMPTY_MAP_ENTITIES = {
  ashaWorkers: [],
  hospitals: [],
  medicalTeams: [],
};

function RoleBadge({ role }) {
  const palette = {
    ADMIN: "bg-amber-100 text-amber-800 border-amber-200",
    ASHA: "bg-rose-100 text-rose-800 border-rose-200",
    HOSPITAL: "bg-sky-100 text-sky-800 border-sky-200",
    MEDICAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
  };

  return (
    <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${palette[role]}`}>
      {role}
    </span>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function LocationPill({ user }) {
  if (!user?.location?.district || !user?.location?.village) {
    return null;
  }

  return (
    <p className="text-sm text-slate-600">
      <span className="font-semibold text-slate-900">Location:</span> {user.location.village},{" "}
      {user.location.district}
    </p>
  );
}

function RoleIntro({ role }) {
  const config = {
    ADMIN: {
      icon: ShieldCheck,
      text: "Create ASHA workers, approve registrations, and analyze any location outbreak.",
      color: "text-amber-700",
    },
    ASHA: {
      icon: UserCheck,
      text: "Submit ground reports for your assigned area with disease and GPS details.",
      color: "text-rose-700",
    },
    HOSPITAL: {
      icon: Building2,
      text: "Monitor and validate area-wise reports for treatment readiness.",
      color: "text-sky-700",
    },
    MEDICAL: {
      icon: Stethoscope,
      text: "Submit and verify multilingual disease reports to align medicine and clinical response.",
      color: "text-emerald-700",
    },
  };

  const entry = config[role] || config.MEDICAL;
  const Icon = entry.icon;

  return (
    <p className={`mt-2 inline-flex items-center gap-2 text-sm font-medium ${entry.color}`}>
      <Icon size={15} />
      {entry.text}
    </p>
  );
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function locationLabel(location) {
  if (!location?.village && !location?.district) {
    return "Location not set";
  }

  return [location?.village, location?.district].filter(Boolean).join(", ");
}

function formatDistance(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return "";
  }

  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m away` : `${distanceKm.toFixed(1)} km away`;
}

function formatCoordinate(value) {
  if (!Number.isFinite(value)) return "--";
  return value.toFixed(5);
}

function formatMoney(value) {
  if (!Number.isFinite(value)) return "--";
  return `Rs ${value.toFixed(2)}`;
}

function resolveDemandSignal(expectedUnits) {
  if (!Number.isFinite(expectedUnits)) return "Low";
  if (expectedUnits >= 180) return "Demand increasing";
  if (expectedUnits >= 80) return "Stable";
  return "Low";
}

function parseMedicineSalesText(input) {
  if (!input || typeof input !== "string") return [];

  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [medicineRaw, unitsRaw, priceRaw, benchmarkRaw, stockRaw, incomingRaw] = line
        .split(",")
        .map((item) => item.trim());
      const unitsSold = Number(unitsRaw);
      const unitPrice = Number(priceRaw);
      const benchmarkPrice =
        benchmarkRaw === undefined || benchmarkRaw === "" ? null : Number(benchmarkRaw);
      const currentStock = stockRaw === undefined || stockRaw === "" ? 0 : Number(stockRaw);
      const incomingStock = incomingRaw === undefined || incomingRaw === "" ? 0 : Number(incomingRaw);

      if (
        !medicineRaw ||
        !Number.isFinite(unitsSold) ||
        unitsSold < 0 ||
        !Number.isFinite(unitPrice) ||
        unitPrice < 0 ||
        !Number.isFinite(currentStock) ||
        currentStock < 0 ||
        !Number.isFinite(incomingStock) ||
        incomingStock < 0
      ) {
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
        currentStock: Math.round(currentStock),
        incomingStock: Math.round(incomingStock),
      };
    })
    .filter(Boolean);
}

function AdminSidebar({ pendingCount, alertCount, mismatchCount, priceFlags }) {
  const links = [
    { href: "#quick-capture", label: "Quick Capture" },
    { href: "#admin-create-asha", label: "Create ASHA" },
    { href: "#admin-filters", label: "Filters" },
    { href: "#ai-command-center", label: "AI Center" },
    { href: "#ai-decision-panel", label: "AI Panel" },
    { href: "#janaushadhi-intel", label: "Janaushadhi" },
    { href: "#automation-hub", label: "Automation" },
    { href: "#admin-memory", label: "ASHA Memory" },
    { href: "#admin-approvals", label: "Approvals" },
    { href: "#outbreak-map", label: "Map" },
  ];

  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:h-fit">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Admin Sidebar</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
        {links.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {item.label}
          </a>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Pending approvals</p>
        <p className="text-lg font-bold text-slate-900">{pendingCount}</p>
        <p className="mt-2 text-xs text-slate-500">Critical alerts</p>
        <p className="text-lg font-bold text-rose-600">{alertCount}</p>
        <p className="mt-2 text-xs text-slate-500">Data mismatches</p>
        <p className="text-lg font-bold text-amber-600">{mismatchCount}</p>
        <p className="mt-2 text-xs text-slate-500">Price anomaly flags</p>
        <p className="text-lg font-bold text-violet-700">{priceFlags}</p>
      </div>
    </aside>
  );
}

function RoleSidebar({ role, canSubmitReports, canSeeLocationInsight, canSeeAiPanel }) {
  const links = [
    { href: "#quick-capture", label: "Quick Capture" },
    { href: "#outbreak-map", label: "Map" },
    { href: "#ai-command-center", label: "AI Center" },
    { href: "#janaushadhi-intel", label: "Janaushadhi" },
    { href: "#recent-reports", label: "Reports" },
  ];

  if (canSubmitReports) {
    links.unshift({ href: "#field-report", label: "Submit Report" });
  }

  if (canSeeLocationInsight) {
    links.push({ href: "#role-insight", label: "Area Insight" });
  }

  if (canSeeAiPanel) {
    links.push({ href: "#ai-decision-panel", label: "AI Panel" });
  }

  return (
    <aside className="hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:block xl:sticky xl:top-6 xl:h-fit">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{role} Sidebar</p>
      <div className="mt-2 grid gap-2">
        {links.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {item.label}
          </a>
        ))}
      </div>
      <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
        App + WhatsApp + GPS flow keeps area updates simple for field teams.
      </p>
    </aside>
  );
}

function BottomRoleDock({ role, canSubmitReports, canSeeLocationInsight, canSeeAiPanel }) {
  const links = [
    { href: "#outbreak-map", label: "Map" },
    { href: "#recent-reports", label: "Reports" },
    { href: "#ai-command-center", label: "AI Hub" },
    { href: "#janaushadhi-intel", label: "Meds" },
  ];

  if (canSubmitReports) {
    links.unshift({ href: "#field-report", label: "Submit" });
  }

  if (canSeeLocationInsight) {
    links.push({ href: "#role-insight", label: "Insight" });
  }

  if (canSeeAiPanel) {
    links.push({ href: "#ai-decision-panel", label: "AI Panel" });
  }

  const gridClass =
    links.length <= 2 ? "grid-cols-2" : links.length === 3 ? "grid-cols-3" : "grid-cols-4";

  return (
    <nav className="fixed bottom-3 left-1/2 z-50 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur md:hidden">
      <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {role} Dashboard
      </p>
      <div className={`grid gap-1 ${gridClass}`}>
        {links.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="rounded-lg px-2 py-2 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

export default function WorkspaceClient({ user }) {
  const { toast } = useToast();
  const didBootstrapRef = useRef(false);
  const [reports, setReports] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [filters, setFilters] = useState({
    district: "",
    village: "",
    disease: "",
    reporterRole: "",
    severity: "",
    startDate: "",
    endDate: "",
  });
  const [selectedRegion, setSelectedRegion] = useState(null);
  const [dashboardSummary, setDashboardSummary] = useState(null);
  const [dashboardAlerts, setDashboardAlerts] = useState([]);
  const [riskZones, setRiskZones] = useState([]);
  const [aiInsights, setAiInsights] = useState(() => ({ ...DEFAULT_AI_INSIGHTS }));
  const [mapEntities, setMapEntities] = useState(() => ({ ...EMPTY_MAP_ENTITIES }));
  const [dailyTrend, setDailyTrend] = useState([]);
  const [diseaseDistribution, setDiseaseDistribution] = useState([]);
  const [roleActions, setRoleActions] = useState([]);
  const [decisionCenter, setDecisionCenter] = useState({
    statusPills: {
      risk: "Risk Under Watch",
      demand: "Demand Watch",
      supply: "Stock Check",
      price: "Price Normal",
    },
    supplyPlan: {
      medicine: "Paracetamol",
      requiredUnitsNext48Hours: 0,
    },
    priceSignal: {
      decision: "Price Normal",
      savingsEstimate: 0,
    },
    recommendedActions: [],
  });
  const [roleDecisionPack, setRoleDecisionPack] = useState({
    primaryDecision: "Risk Under Watch",
    secondaryDecision: "Stock Check",
    tasks: [],
  });
  const [responseMeta, setResponseMeta] = useState({
    roleScope: "",
    locationWindow: null,
    outbreakAutomation: null,
  });
  const [isCreatingAsha, setIsCreatingAsha] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [isLoadingJanaushadhi, setIsLoadingJanaushadhi] = useState(false);
  const [approvingUserId, setApprovingUserId] = useState("");
  const [areaRadiusKm, setAreaRadiusKm] = useState(
    user.role === "HOSPITAL" || user.role === "MEDICAL" ? "18" : ""
  );
  const [createAshaForm, setCreateAshaForm] = useState({
    name: "",
    email: "",
    password: "",
    village: "",
    district: "",
    latitude: "",
    longitude: "",
  });
  const [reportForm, setReportForm] = useState({
    disease: "",
    householdsVisited: "",
    newCases: "",
    criticalCases: "",
    medicineSalesText: "",
    notes: "",
    latitude: user?.location?.latitude?.toString() || "",
    longitude: user?.location?.longitude?.toString() || "",
  });
  const [ashaLookup, setAshaLookup] = useState({
    district: "",
    village: "",
    latitude: "",
    longitude: "",
    radiusKm: "12",
  });
  const [ashaDirectory, setAshaDirectory] = useState({
    data: [],
    exact: [],
    nearby: [],
    others: [],
    context: {
      district: null,
      village: null,
      radiusKm: 12,
    },
  });
  const [isLoadingAshaDirectory, setIsLoadingAshaDirectory] = useState(false);
  const [janaushadhiSearch, setJanaushadhiSearch] = useState({
    latitude: user?.location?.latitude?.toString() || "",
    longitude: user?.location?.longitude?.toString() || "",
    radiusKm: "8",
  });
  const [janaushadhiResult, setJanaushadhiResult] = useState({
    janaushadhi: [],
    privateStores: [],
    recommendation: "",
  });

  const canCreateAsha = user.role === "ADMIN";
  const isAshaRole = user.role === "ASHA";
  const isMedicalRole = user.role === "MEDICAL";
  const isHospitalRole = user.role === "HOSPITAL";
  const canSubmitReports = user.role === "ASHA" || user.role === "MEDICAL";
  const canSeePendingApprovals = user.role === "ADMIN";
  const canSeeLocationInsight = user.role === "HOSPITAL";
  const canSeeAdvancedIntel = canCreateAsha || isHospitalRole;
  const showBottomDock = !canCreateAsha;

  const loadReports = useCallback(
    async (activeFilters = filters) => {
      setIsLoadingReports(true);

      try {
        const params = new URLSearchParams({ limit: "200", includeEntities: "true" });
        const district = (activeFilters.district || "").trim();
        const village = (activeFilters.village || "").trim();
        const disease = (activeFilters.disease || "").trim();
        if (district) params.set("district", district);
        if (village) params.set("village", village);
        if (disease) params.set("disease", disease);
        if (activeFilters.reporterRole) params.set("reporterRole", activeFilters.reporterRole);
        if (activeFilters.severity) params.set("severity", activeFilters.severity);
        if (activeFilters.startDate) params.set("startDate", activeFilters.startDate);
        if (activeFilters.endDate) params.set("endDate", activeFilters.endDate);

        const res = await fetch(`/api/health-data?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const payload = await res.json().catch(() => ({}));

        let healthRows = [];
        if (res.ok) {
          healthRows = Array.isArray(payload.data) ? payload.data : [];
          setReports(healthRows);
          setDashboardSummary(payload.summary ?? null);
          setDashboardAlerts(Array.isArray(payload.alerts) ? payload.alerts : []);
          setRiskZones(Array.isArray(payload.riskZones) ? payload.riskZones : []);
          setDiseaseDistribution(
            Array.isArray(payload.diseaseDistribution) ? payload.diseaseDistribution : []
          );
          setDailyTrend(Array.isArray(payload.trends?.daily) ? payload.trends.daily : []);
          setMapEntities({
            ashaWorkers: payload.entities?.ashaWorkers ?? [],
            hospitals: payload.entities?.hospitals ?? [],
            medicalTeams: payload.entities?.medicalTeams ?? [],
          });
          setAiInsights(
            payload.aiInsights && typeof payload.aiInsights === "object"
              ? { ...DEFAULT_AI_INSIGHTS, ...payload.aiInsights }
              : { ...DEFAULT_AI_INSIGHTS }
          );
        } else {
          setReports([]);
          setDashboardSummary(null);
          setDashboardAlerts([]);
          setRiskZones([]);
          setDiseaseDistribution([]);
          setDailyTrend([]);
          setAiInsights({ ...DEFAULT_AI_INSIGHTS });
          setMapEntities({ ...EMPTY_MAP_ENTITIES });
        }

        let mapped = [];
        try {
          const data = await backendGet(
            `/api/v1/cases?location=${encodeURIComponent(userLocationCode)}&limit=200`,
            {},
            "Failed to load map data"
          );
          mapped = Array.isArray(data)
            ? data.map((item) => fromBackendCaseRecord(item, user.location))
            : [];
        } catch (ingestError) {
          if (!res.ok) {
            toast.error("Data load failed", ingestError.message || "Please refresh and try again.");
          }
        }

        if (res.ok && healthRows.length > 0) {
          if (mapped.length) {
            setReports((prev) => {
              const ids = new Set(prev.map((r) => String(r.id)));
              const extra = mapped.filter((r) => !ids.has(String(r.id)));
              return extra.length ? [...prev, ...extra] : prev;
            });
          }
          return;
        }

        if (mapped.length > 0) {
          setReports(mapped);
          setDashboardSummary(null);
          setDashboardAlerts([]);
          setRiskZones([]);
          setDiseaseDistribution([]);
          setDailyTrend([]);
          setAiInsights({ ...DEFAULT_AI_INSIGHTS });
          setMapEntities({ ...EMPTY_MAP_ENTITIES });
        }
      } catch (error) {
        toast.error("Data load failed", error.message || "Please refresh and try again.");
      } finally {
        setIsLoadingReports(false);
      }
    },
    [toast, user.location, userLocationCode, filters]
  );

  const loadPendingUsers = useCallback(async () => {
    if (!canSeePendingApprovals) return;
    setIsLoadingPending(true);

    try {
      const response = await fetch("/api/admin/pending-users", {
        method: "GET",
        cache: "no-store",
      });
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(resolveApiError(payload, "Failed to fetch pending users"));
      }

      setPendingUsers(Array.isArray(payload?.data) ? payload.data : []);
    } catch (error) {
      toast.error("Pending users failed", error.message || "Please refresh.");
    } finally {
      setIsLoadingPending(false);
    }
  }, [canSeePendingApprovals, toast]);

  const loadAshaDirectory = useCallback(
    async (
      activeLookup = {
        district: "",
        village: "",
        latitude: "",
        longitude: "",
        radiusKm: "12",
      }
    ) => {
      if (!canCreateAsha) return;
      setIsLoadingAshaDirectory(true);

      try {
        const params = new URLSearchParams({ limit: "150" });
        if (activeLookup.district) params.set("district", activeLookup.district);
        if (activeLookup.village) params.set("village", activeLookup.village);
        if (activeLookup.radiusKm) params.set("radiusKm", activeLookup.radiusKm);

        const hasLat = normalizeText(activeLookup.latitude) !== "";
        const hasLng = normalizeText(activeLookup.longitude) !== "";
        if (hasLat && hasLng) {
          params.set("latitude", activeLookup.latitude);
          params.set("longitude", activeLookup.longitude);
        }

        const response = await fetch(`/api/admin/asha-workers?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await readApiPayload(response);

        if (!response.ok) {
          throw new Error(resolveApiError(payload, "Failed to load ASHA directory"));
        }

        setAshaDirectory({
          data: Array.isArray(payload?.data) ? payload.data : [],
          exact: Array.isArray(payload?.exact) ? payload.exact : [],
          nearby: Array.isArray(payload?.nearby) ? payload.nearby : [],
          others: Array.isArray(payload?.others) ? payload.others : [],
          context: payload?.context || {
            district: null,
            village: null,
            radiusKm: Number(activeLookup.radiusKm) || 12,
          },
        });
      } catch (error) {
        toast.error("ASHA list failed", error.message || "Could not load ASHA details.");
      } finally {
        setIsLoadingAshaDirectory(false);
      }
    },
    [canCreateAsha, toast]
  );

  const loadJanaushadhi = useCallback(
    async (
      activeSearch = {
        latitude: janaushadhiSearch.latitude,
        longitude: janaushadhiSearch.longitude,
        radiusKm: janaushadhiSearch.radiusKm,
      }
    ) => {
      const latitude = Number(activeSearch.latitude);
      const longitude = Number(activeSearch.longitude);
      const radiusKm = Number(activeSearch.radiusKm || 8);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        toast.error("Missing map center", "Set latitude and longitude for Janaushadhi lookup.");
        return;
      }

      setIsLoadingJanaushadhi(true);
      try {
        const params = new URLSearchParams({
          latitude: String(latitude),
          longitude: String(longitude),
          radiusKm: String(Number.isFinite(radiusKm) ? Math.max(2, Math.min(20, radiusKm)) : 8),
        });
        const response = await fetch(`/api/location/janaushadhi?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await readApiPayload(response);
        if (!response.ok) {
          throw new Error(resolveApiError(payload, "Failed to load Janaushadhi stores"));
        }

        setJanaushadhiResult({
          janaushadhi: Array.isArray(payload?.janaushadhi) ? payload.janaushadhi : [],
          privateStores: Array.isArray(payload?.privateStores) ? payload.privateStores : [],
          recommendation: payload?.recommendation || "",
        });
      } catch (error) {
        toast.error("Janaushadhi lookup failed", error.message || "Try again in a moment.");
      } finally {
        setIsLoadingJanaushadhi(false);
      }
    },
    [janaushadhiSearch.latitude, janaushadhiSearch.longitude, janaushadhiSearch.radiusKm, toast]
  );

  useEffect(() => {
    if (didBootstrapRef.current) return;
    didBootstrapRef.current = true;

    loadReports({
      district: "",
      village: "",
      disease: "",
      reporterRole: "",
      severity: "",
      startDate: "",
      endDate: "",
    });

    if (canSeePendingApprovals) {
      loadPendingUsers();
    }

    if (canCreateAsha) {
      loadAshaDirectory();
    }

    const initialLatitude = Number(janaushadhiSearch.latitude);
    const initialLongitude = Number(janaushadhiSearch.longitude);
    if (Number.isFinite(initialLatitude) && Number.isFinite(initialLongitude)) {
      loadJanaushadhi(janaushadhiSearch);
    }
  }, [
    canCreateAsha,
    canSeePendingApprovals,
    janaushadhiSearch,
    loadAshaDirectory,
    loadJanaushadhi,
    loadPendingUsers,
    loadReports,
  ]);

  useEffect(() => {
    if (!canSubmitReports) return;
    if (!navigator?.geolocation) return;
    if (normalizeText(reportForm.latitude) && normalizeText(reportForm.longitude)) return;

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportForm((current) => {
          if (normalizeText(current.latitude) && normalizeText(current.longitude)) {
            return current;
          }

          return {
            ...current,
            latitude: String(position.coords.latitude),
            longitude: String(position.coords.longitude),
          };
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 }
    );
  }, [canSubmitReports, reportForm.latitude, reportForm.longitude]);

  useEffect(() => {
    const latitude = Number(selectedRegion?.latitude);
    const longitude = Number(selectedRegion?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setJanaushadhiSearch((current) => ({
      ...current,
      latitude: String(latitude),
      longitude: String(longitude),
    }));
  }, [selectedRegion?.latitude, selectedRegion?.longitude]);

  useEffect(() => {
    if (didBootstrapRef.current) return;
    const latitude = Number(user?.location?.latitude);
    const longitude = Number(user?.location?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    setJanaushadhiSearch((current) => ({
      ...current,
      latitude: current.latitude || String(latitude),
      longitude: current.longitude || String(longitude),
    }));
  }, [user?.location?.latitude, user?.location?.longitude]);

  const scopedReports = useMemo(() => {
    if (!selectedRegion?.district) {
      return reports;
    }

    return reports.filter((item) => {
      const districtMatch =
        normalizeText(item?.location?.district) === normalizeText(selectedRegion?.district);
      const villageMatch = selectedRegion?.village
        ? normalizeText(item?.location?.village) === normalizeText(selectedRegion?.village)
        : true;
      return districtMatch && villageMatch;
    });
  }, [reports, selectedRegion]);

  const summary = useMemo(() => {
    const local = scopedReports.reduce(
      (acc, item) => {
        acc.newCases += item.newCases || 0;
        acc.criticalCases += item.criticalCases || 0;
        return acc;
      },
      { newCases: 0, criticalCases: 0 }
    );

    return {
      newCases: selectedRegion?.district
        ? local.newCases
        : Number.isFinite(dashboardSummary?.totalNewCases)
          ? dashboardSummary.totalNewCases
          : local.newCases,
      criticalCases: selectedRegion?.district
        ? local.criticalCases
        : Number.isFinite(dashboardSummary?.totalCriticalCases)
          ? dashboardSummary.totalCriticalCases
          : local.criticalCases,
      activeCases: Number.isFinite(dashboardSummary?.activeCases) ? dashboardSummary.activeCases : local.newCases,
      criticalAlerts: Number.isFinite(dashboardSummary?.criticalAlerts)
        ? dashboardSummary.criticalAlerts
        : riskZones.filter((zone) => zone?.riskLevel === "HIGH_RISK").length,
      predictiveIncreasePercent: Number.isFinite(dashboardSummary?.predictiveIncreasePercent)
        ? dashboardSummary.predictiveIncreasePercent
        : 0,
      outbreakProbabilityNext3Days: Number.isFinite(dashboardSummary?.outbreakProbabilityNext3Days)
        ? dashboardSummary.outbreakProbabilityNext3Days
        : 0,
      expectedPatientsNext2Days: Number.isFinite(dashboardSummary?.expectedPatientsNext2Days)
        ? dashboardSummary.expectedPatientsNext2Days
        : Math.round(local.newCases * 0.25),
      hospitalLoadPercent: Number.isFinite(dashboardSummary?.hospitalLoadPercent)
        ? dashboardSummary.hospitalLoadPercent
        : Math.min(100, Math.round(local.newCases / 2)),
    };
  }, [dashboardSummary, riskZones, scopedReports, selectedRegion]);

  const diseaseInsights = useMemo(() => {
    if (diseaseDistribution.length) {
      return diseaseDistribution.map((item) => ({
        disease: item.disease,
        reports: item.reports,
        cases: item.newCases,
      }));
    }

    const buckets = scopedReports.reduce((acc, item) => {
      const key = item.disease || "UNKNOWN";
      const current = acc.get(key) || { disease: key, reports: 0, cases: 0 };
      current.reports += 1;
      current.cases += item.newCases || 0;
      acc.set(key, current);
      return acc;
    }, new Map());

    return [...buckets.values()].sort((a, b) => b.cases - a.cases).slice(0, 5);
  }, [diseaseDistribution, scopedReports]);

  const ashaSpotlight = useMemo(() => {
    const topMatches =
      ashaDirectory.exact.length || ashaDirectory.nearby.length
        ? [...ashaDirectory.exact, ...ashaDirectory.nearby]
        : ashaDirectory.data;
    return topMatches.slice(0, 12);
  }, [ashaDirectory]);

  const systemPipeline = useMemo(
    () => [
      {
        key: "detect",
        label: "Detect",
        value: decisionCenter?.statusPills?.risk || `${scopedReports.length} reports`,
        tone: "text-rose-700",
      },
      {
        key: "verify",
        label: "Verify",
        value: `${aiInsights.mismatchReports.length} mismatch checks`,
        tone: "text-amber-700",
      },
      {
        key: "predict",
        label: "Predict",
        value:
          decisionCenter?.trendSignal?.trend && Number.isFinite(decisionCenter?.trendSignal?.growthPercent)
            ? `${decisionCenter.trendSignal.trend} (${decisionCenter.trendSignal.growthPercent}%)`
            : `${Math.round(summary.outbreakProbabilityNext3Days * 100)}% outbreak probability`,
        tone: "text-sky-700",
      },
      {
        key: "alert",
        label: "Alert",
        value: `${dashboardAlerts.length} smart alerts`,
        tone: "text-violet-700",
      },
      {
        key: "supply",
        label: "Supply",
        value:
          decisionCenter?.statusPills?.supply ||
          `${aiInsights.medicineDemand.length} medicine plans`,
        tone: "text-emerald-700",
      },
      {
        key: "prevent",
        label: "Prevent",
        value:
          decisionCenter?.statusPills?.price ||
          `${summary.expectedPatientsNext2Days} hospital prep target`,
        tone: "text-cyan-700",
      },
    ],
    [
      decisionCenter?.statusPills?.price,
      decisionCenter?.statusPills?.risk,
      decisionCenter?.statusPills?.supply,
      decisionCenter?.trendSignal?.growthPercent,
      decisionCenter?.trendSignal?.trend,
      aiInsights.medicineDemand.length,
      aiInsights.mismatchReports.length,
      dashboardAlerts.length,
      scopedReports.length,
      summary.expectedPatientsNext2Days,
      summary.outbreakProbabilityNext3Days,
    ]
  );

  const selectedZoneInsight = useMemo(() => {
    if (!selectedRegion?.district) return null;

    return (
      riskZones.find((zone) => {
        const districtMatch = normalizeText(zone?.district) === normalizeText(selectedRegion?.district);
        const villageMatch = selectedRegion?.village
          ? normalizeText(zone?.village) === normalizeText(selectedRegion?.village)
          : true;
        return districtMatch && villageMatch;
      }) || null
    );
  }, [riskZones, selectedRegion]);

  const selectedAreaDemand = useMemo(() => {
    if (!selectedRegion?.district) return [];

    return aiInsights.medicineDemand
      .filter((item) => {
        const districtMatch = normalizeText(item?.district) === normalizeText(selectedRegion?.district);
        const villageMatch = selectedRegion?.village
          ? normalizeText(item?.village) === normalizeText(selectedRegion?.village)
          : true;
        return districtMatch && villageMatch;
      })
      .slice(0, 5);
  }, [aiInsights.medicineDemand, selectedRegion]);

  const selectedAreaPriceAnomalies = useMemo(() => {
    if (!selectedRegion?.district) return [];

    return aiInsights.priceAnomalies
      .filter((item) => {
        const districtMatch = normalizeText(item?.district) === normalizeText(selectedRegion?.district);
        const villageMatch = selectedRegion?.village
          ? normalizeText(item?.village) === normalizeText(selectedRegion?.village)
          : true;
        return districtMatch && villageMatch;
      })
      .slice(0, 6);
  }, [aiInsights.priceAnomalies, selectedRegion]);

  const nearbyZoneRisk = useMemo(() => {
    if (!selectedRegion?.district) return [];

    return riskZones
      .filter((zone) => {
        if (!selectedZoneInsight || zone.id === selectedZoneInsight.id) return false;
        return normalizeText(zone?.district) === normalizeText(selectedRegion?.district);
      })
      .sort((a, b) => (b.riskScore || 0) - (a.riskScore || 0))
      .slice(0, 3);
  }, [riskZones, selectedRegion, selectedZoneInsight]);

  const scopedRoleActions = useMemo(
    () => (Array.isArray(roleActions) ? roleActions.slice(0, 4) : []),
    [roleActions]
  );

  const automationStatus = responseMeta?.outbreakAutomation || null;
  const janaushadhiNearby = useMemo(
    () =>
      Array.isArray(janaushadhiResult?.janaushadhi)
        ? janaushadhiResult.janaushadhi.slice(0, 6)
        : [],
    [janaushadhiResult?.janaushadhi]
  );
  const privateNearby = useMemo(
    () =>
      Array.isArray(janaushadhiResult?.privateStores)
        ? janaushadhiResult.privateStores.slice(0, 6)
        : [],
    [janaushadhiResult?.privateStores]
  );
  const topHotspot = useMemo(
    () =>
      aiInsights.topHighRiskZones[0] ||
      riskZones[0] || {
        district: "No hotspot",
        village: "No hotspot",
        riskScore: 0,
      },
    [aiInsights.topHighRiskZones, riskZones]
  );
  const mostNeededMedicine = useMemo(() => {
    if (selectedAreaDemand[0]) return selectedAreaDemand[0];
    if (aiInsights.medicineDemand[0]) return aiInsights.medicineDemand[0];
    if (aiInsights.topMedicinesSold[0]) {
      return {
        medicine: aiInsights.topMedicinesSold[0].medicine,
        expectedUnitsNext3Days: aiInsights.topMedicinesSold[0].totalUnits,
      };
    }
    return null;
  }, [aiInsights.medicineDemand, aiInsights.topMedicinesSold, selectedAreaDemand]);

  const aiInsightNarrative = useMemo(() => {
    const areaName = selectedZoneInsight
      ? `${selectedZoneInsight.village}, ${selectedZoneInsight.district}`
      : `${topHotspot.village}, ${topHotspot.district}`;
    const demandHint = mostNeededMedicine
      ? `${mostNeededMedicine.medicine} demand is rising.`
      : "Medicine demand signals are still building.";
    const priceHint = selectedAreaPriceAnomalies[0]
      ? `${selectedAreaPriceAnomalies[0].medicine} shows pricing stress in this zone.`
      : "No major price inflation found in the current view.";
    return [
      `AI Insight: ${areaName} is ${
        (selectedZoneInsight?.riskScore || topHotspot?.riskScore || 0) >= 70
          ? "becoming a hotspot"
          : "under active watch"
      }.`,
      `Why: Fever case trend and verification signals shifted in recent reports. ${demandHint}`,
      `Action: ${priceHint}`,
    ];
  }, [mostNeededMedicine, selectedAreaPriceAnomalies, selectedZoneInsight, topHotspot]);

  const roleTaskAlerts = useMemo(() => {
    if (Array.isArray(roleDecisionPack?.tasks) && roleDecisionPack.tasks.length) {
      return roleDecisionPack.tasks.slice(0, 4);
    }

    if (user.role === "ASHA") {
      return [
        "Visit nearby homes and spread awareness in high-risk pockets.",
        "Capture household updates with GPS using app form or WhatsApp.",
      ];
    }
    if (user.role === "HOSPITAL") {
      return [
        `Prepare for about ${summary.expectedPatientsNext2Days} patients in next 48 hours.`,
        "Keep triage and fever ward response teams ready.",
      ];
    }
    if (user.role === "MEDICAL") {
      return [
        "Track medicine demand and keep stock buffer for likely shortage.",
        "Report real selling prices to detect overpricing quickly.",
      ];
    }
    return [
      "Coordinate ASHA, hospitals, and stores for high-risk areas.",
      "Trigger outbreak communication if risk and load keep rising.",
    ];
  }, [roleDecisionPack?.tasks, summary.expectedPatientsNext2Days, user.role]);
  const mapRoleMessage = useMemo(() => {
    if (isAshaRole) {
      return "Focus on your assigned areas, household awareness, and fast field reporting.";
    }
    if (isMedicalRole) {
      return "Focus on demand shifts, pricing fairness, and stock readiness in your area.";
    }
    if (isHospitalRole) {
      return "Focus on incoming patient load and high-risk zone readiness.";
    }
    return "Full control view across districts for outbreak response coordination.";
  }, [isAshaRole, isHospitalRole, isMedicalRole]);

  const priceImpactCard = useMemo(() => {
    const anomaly = selectedAreaPriceAnomalies[0] || aiInsights.priceAnomalies[0] || null;
    if (!anomaly) return null;

    const benchmark = Number(anomaly.janaushadhiReference || anomaly.averageAreaPrice || 0);
    const privatePrice = Number(anomaly.privatePrice || 0);
    const savings = Math.max(0, privatePrice - benchmark);
    return {
      medicine: anomaly.medicine,
      privatePrice,
      benchmark,
      savings,
      overByPercent: anomaly.overByPercent,
      district: anomaly.district,
      village: anomaly.village,
    };
  }, [aiInsights.priceAnomalies, selectedAreaPriceAnomalies]);

  const supplyRoutes = useMemo(() => {
    const origin = janaushadhiNearby[0] || null;
    const destination = selectedZoneInsight || topHotspot || null;
    if (
      !origin ||
      !Number.isFinite(origin.latitude) ||
      !Number.isFinite(origin.longitude) ||
      !Number.isFinite(destination?.latitude) ||
      !Number.isFinite(destination?.longitude)
    ) {
      return [];
    }

    return [
      {
        from: { latitude: origin.latitude, longitude: origin.longitude },
        to: { latitude: destination.latitude, longitude: destination.longitude },
        label: `${origin.name} -> ${destination.village}, ${destination.district}`,
      },
    ];
  }, [janaushadhiNearby, selectedZoneInsight, topHotspot]);

  const mapPharmacyPoints = useMemo(
    () =>
      [...janaushadhiNearby, ...privateNearby].map((entry, index) => ({
        id: entry.id || `pharmacy-${index}`,
        name: entry.name,
        type: entry.type || "PRIVATE",
        latitude: entry.latitude,
        longitude: entry.longitude,
        distanceKm: entry.distanceKm,
        address: entry.address,
        district: selectedRegion?.district || user?.location?.district || null,
        village: selectedRegion?.village || user?.location?.village || null,
      })),
    [
      janaushadhiNearby,
      privateNearby,
      selectedRegion?.district,
      selectedRegion?.village,
      user?.location?.district,
      user?.location?.village,
    ]
  );
  const supplyPlanner = useMemo(() => {
    const demandRows = selectedAreaDemand.length ? selectedAreaDemand : aiInsights.medicineDemand;
    const expectedNeed =
      demandRows.reduce((sum, item) => sum + (Number(item?.expectedUnitsNext3Days) || 0), 0) ||
      (mostNeededMedicine?.expectedUnitsNext3Days || 0);
    const hasStockSignals = demandRows.some(
      (item) =>
        Number.isFinite(item?.currentStock) || Number.isFinite(item?.incomingStock)
    );
    const currentStockLevel = hasStockSignals
      ? Math.max(
          0,
          Math.round(demandRows.reduce((sum, item) => sum + (Number(item?.currentStock) || 0), 0))
        )
      : Math.max(0, Math.round((janaushadhiNearby.length || 1) * 65 + (privateNearby.length || 0) * 40));
    const incomingSupply = hasStockSignals
      ? Math.max(
          0,
          Math.round(demandRows.reduce((sum, item) => sum + (Number(item?.incomingStock) || 0), 0))
        )
      : Math.max(0, Math.round(expectedNeed * 0.45));
    const stockAfterIncoming = currentStockLevel + incomingSupply;
    const shortageUnits = Math.max(0, expectedNeed - stockAfterIncoming);

    return {
      expectedNeed,
      currentStockLevel,
      incomingSupply,
      stockAfterIncoming,
      shortageUnits,
    };
  }, [
    aiInsights.medicineDemand,
    janaushadhiNearby.length,
    mostNeededMedicine?.expectedUnitsNext3Days,
    privateNearby.length,
    selectedAreaDemand,
  ]);

  const medicalStoreBoard = useMemo(() => {
    if (!isMedicalRole) return null;

    const districtScope = selectedRegion?.district || user?.location?.district || "";
    const villageScope = selectedRegion?.village || user?.location?.village || "";
    const ownWorkerId =
      user?.workerId || (user?.id ? `MEDICAL_${String(user.id).slice(-6).toUpperCase()}` : "");
    const areaDemandRows = aiInsights.medicineDemand.filter((item) => {
      const districtMatch =
        !districtScope || normalizeText(item?.district) === normalizeText(districtScope);
      const villageMatch =
        !villageScope || normalizeText(item?.village) === normalizeText(villageScope);
      return districtMatch && villageMatch;
    });
    const projectedNeed = areaDemandRows.reduce(
      (sum, item) => sum + (Number(item?.expectedUnitsNext3Days) || 0),
      0
    );
    const demandSignal = resolveDemandSignal(projectedNeed);

    const mean = (items) =>
      items.length ? items.reduce((sum, value) => sum + value, 0) / items.length : null;
    const priceBuckets = new Map();
    const medicalReports = scopedReports.filter((report) => report.reporterRole === "MEDICAL");

    for (const report of medicalReports) {
      const sales = Array.isArray(report?.medicineSales) ? report.medicineSales : [];
      const isOwnReport = report.workerId === ownWorkerId || report.reportedBy === user?.id;
      for (const sale of sales) {
        const medicine = typeof sale?.medicine === "string" ? sale.medicine.trim() : "";
        const unitPrice = Number(sale?.unitPrice);
        const benchmarkPrice = Number(sale?.benchmarkPrice);
        if (!medicine || !Number.isFinite(unitPrice) || unitPrice <= 0) continue;

        const key = normalizeText(medicine);
        const bucket = priceBuckets.get(key) || {
          medicine,
          ownPrices: [],
          nearbyPrices: [],
          janaushadhiPrices: [],
        };

        if (isOwnReport) {
          bucket.ownPrices.push(unitPrice);
        } else {
          bucket.nearbyPrices.push(unitPrice);
        }
        if (Number.isFinite(benchmarkPrice) && benchmarkPrice > 0) {
          bucket.janaushadhiPrices.push(benchmarkPrice);
        }
        priceBuckets.set(key, bucket);
      }
    }

    const comparisons = [...priceBuckets.values()]
      .map((bucket) => {
        const ownPrice = mean(bucket.ownPrices);
        if (!Number.isFinite(ownPrice)) return null;
        const nearbyAvg = mean(bucket.nearbyPrices);
        const janaPrice = mean(bucket.janaushadhiPrices);

        const overNearby =
          Number.isFinite(nearbyAvg) && nearbyAvg > 0 ? ownPrice > nearbyAvg * 1.2 : false;
        const overJana =
          Number.isFinite(janaPrice) && janaPrice > 0 ? ownPrice > janaPrice * 1.35 : false;
        const status =
          overNearby || overJana ? "You are overpriced" : "Competitive pricing";

        const cheapest = Math.min(
          ...[ownPrice, nearbyAvg, janaPrice].filter((value) => Number.isFinite(value) && value > 0)
        );

        return {
          medicine: bucket.medicine,
          ownPrice: Number(ownPrice.toFixed(2)),
          nearbyAvg: Number.isFinite(nearbyAvg) ? Number(nearbyAvg.toFixed(2)) : null,
          janaPrice: Number.isFinite(janaPrice) ? Number(janaPrice.toFixed(2)) : null,
          status,
          isCheapest: Number.isFinite(cheapest) && Math.abs(ownPrice - cheapest) < 0.01,
        };
      })
      .filter(Boolean)
      .slice(0, 5);

    return {
      demandSignal,
      projectedNeed,
      comparisons,
    };
  }, [
    aiInsights.medicineDemand,
    isMedicalRole,
    scopedReports,
    selectedRegion?.district,
    selectedRegion?.village,
    user?.id,
    user?.location?.district,
    user?.location?.village,
    user?.workerId,
  ]);

  async function handleCopyAshaId(workerId) {
    if (!workerId) return;

    try {
      await navigator.clipboard.writeText(workerId);
      toast.success("Copied", `${workerId} copied to clipboard.`);
    } catch (_error) {
      toast.info("ASHA ID", workerId);
    }
  }

  function applyCreateLocationToLookup() {
    const nextLookup = {
      district: createAshaForm.district || "",
      village: createAshaForm.village || "",
      latitude: createAshaForm.latitude || "",
      longitude: createAshaForm.longitude || "",
      radiusKm: ashaLookup.radiusKm || "12",
    };

    setAshaLookup(nextLookup);
    return nextLookup;
  }

  async function handleCreateAsha(event) {
    event.preventDefault();
    setIsCreatingAsha(true);

    try {
      const response = await fetch("/api/admin/create-asha", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createAshaForm.name,
          email: createAshaForm.email,
          password: createAshaForm.password,
          location: {
            village: createAshaForm.village,
            district: createAshaForm.district,
            latitude: createAshaForm.latitude,
            longitude: createAshaForm.longitude,
          },
        }),
      });

      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(resolveApiError(payload, "Failed to create ASHA worker"));
      }

      const nextLookup = {
        district: createAshaForm.district || "",
        village: createAshaForm.village || "",
        latitude: createAshaForm.latitude || "",
        longitude: createAshaForm.longitude || "",
        radiusKm: ashaLookup.radiusKm || "12",
      };

      toast.success("ASHA created", `${payload?.user?.workerId || ""} is active now.`);
      setAshaLookup(nextLookup);
      loadAshaDirectory(nextLookup);
      setCreateAshaForm({
        name: "",
        email: "",
        password: "",
        village: "",
        district: "",
        latitude: "",
        longitude: "",
      });
    } catch (error) {
      toast.error("Creation failed", error.message || "Please review form values.");
    } finally {
      setIsCreatingAsha(false);
    }
  }

  async function handleApproveUser(userId, role) {
    setApprovingUserId(userId);

    try {
      const response = await fetch(`/api/admin/approve/${userId}`, {
        method: "POST",
      });
      const payload = await readApiPayload(response);

      if (!response.ok) {
        throw new Error(resolveApiError(payload, "Approval failed"));
      }

      toast.success("User approved", `${role} account is now approved.`);
      loadPendingUsers();
    } catch (error) {
      toast.error("Approval failed", error.message || "Please retry.");
    } finally {
      setApprovingUserId("");
    }
  }

  async function handleSubmitReport(event) {
    event.preventDefault();
    setIsSubmittingReport(true);

    try {
      const rawMedicineLines = reportForm.medicineSalesText
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const medicineSales =
        user.role === "MEDICAL" ? parseMedicineSalesText(reportForm.medicineSalesText) : [];

      if (user.role === "MEDICAL" && rawMedicineLines.length === 0) {
        throw new Error(
          "Medical stock lines are required. Use: Medicine,UnitsSold,PrivatePrice,BenchmarkPrice,CurrentStock,IncomingStock"
        );
      }
      if (user.role === "MEDICAL" && rawMedicineLines.length !== medicineSales.length) {
        throw new Error(
          "One or more medicine lines are invalid. Use comma format: Medicine,UnitsSold,PrivatePrice,BenchmarkPrice,CurrentStock,IncomingStock"
        );
      }

      const response = await fetch("/api/health-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disease: reportForm.disease || "GENERAL_FEVER",
          householdsVisited: reportForm.householdsVisited,
          newCases: reportForm.newCases,
          criticalCases: reportForm.criticalCases,
          medicineSales,
          notes: reportForm.notes,
          latitude: reportForm.latitude,
          longitude: reportForm.longitude,
        }),
      });

      const payload = await readApiPayload(response);
      if (!response.ok) {
        throw new Error(resolveApiError(payload, "Failed to submit report"));
      }

      toast.success("Report submitted", "Health data is now visible on map.");
      setReportForm((current) => ({
        ...current,
        disease: "",
        householdsVisited: "",
        newCases: "",
        criticalCases: "",
        medicineSalesText: "",
        notes: "",
      }));
      if (normalizeText(reportForm.latitude) && normalizeText(reportForm.longitude)) {
        setJanaushadhiSearch((current) => ({
          ...current,
          latitude: reportForm.latitude,
          longitude: reportForm.longitude,
        }));
      }
      loadReports(filters);
    } catch (error) {
      toast.error("Submission failed", error.message || "Please validate the form.");
    } finally {
      setIsSubmittingReport(false);
    }
  }

  function captureCurrentLocation() {
    if (!navigator.geolocation) {
      toast.error("GPS unavailable", "Your browser does not support geolocation.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLatitude = String(position.coords.latitude);
        const nextLongitude = String(position.coords.longitude);
        setReportForm((current) => ({
          ...current,
          latitude: nextLatitude,
          longitude: nextLongitude,
        }));
        setJanaushadhiSearch((current) => ({
          ...current,
          latitude: nextLatitude,
          longitude: nextLongitude,
        }));
        toast.success("GPS captured", "Current coordinates added to the report.");
      },
      (error) => {
        toast.error("GPS permission required", error.message || "Could not read your location.");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <main
      className={`min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_35%,#f1f5f9_100%)] px-4 py-6 md:px-6 md:py-8 ${showBottomDock ? "pb-24 md:pb-8" : ""}`}
    >
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Activity size={18} className="text-sky-600" />
                <p className="text-xs font-semibold tracking-[0.2em] text-sky-700">WORKSPACE</p>
              </div>
              <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
                Welcome, {user.name || user.email}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <RoleBadge role={user.role} />
                <LocationPill user={user} />
              </div>
              <RoleIntro role={user.role} />
            </div>

            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/" })}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <LogOut size={16} />
              Sign out
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Reports" value={scopedReports.length} />
            <StatCard label="Total New Cases" value={summary.newCases} />
            <StatCard label="Critical Cases" value={summary.criticalCases} />
            <StatCard label="Active Cases" value={summary.activeCases} />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Hotspot</p>
              <p className="mt-1 text-sm font-bold text-rose-700">
                {topHotspot.village}, {topHotspot.district}
              </p>
              <p className="text-xs text-slate-600">Risk score {topHotspot.riskScore || 0}/100</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Most Needed Medicine
              </p>
              <p className="mt-1 text-sm font-bold text-emerald-700">
                {mostNeededMedicine?.medicine || "Waiting for signals"}
              </p>
              <p className="text-xs text-slate-600">
                {mostNeededMedicine?.expectedUnitsNext3Days
                  ? `${mostNeededMedicine.expectedUnitsNext3Days} units expected`
                  : "Demand increasing signal not ready"}
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Summary</p>
              <p className="mt-1 text-sm font-bold text-sky-700">{summary.newCases} new fever-like cases today</p>
              <p className="text-xs text-slate-600">
                {summary.criticalAlerts} high-risk areas and rising demand watch.
              </p>
            </article>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <article className="rounded-2xl border border-rose-200 bg-rose-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">Risk Decision</p>
              <p className="mt-1 text-sm font-bold text-rose-800">
                {decisionCenter?.statusPills?.risk || roleDecisionPack?.primaryDecision || "Risk Under Watch"}
              </p>
            </article>
            <article className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Demand Decision</p>
              <p className="mt-1 text-sm font-bold text-amber-800">
                {decisionCenter?.statusPills?.demand || "Demand Watch"}
              </p>
            </article>
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Supply Decision</p>
              <p className="mt-1 text-sm font-bold text-emerald-800">
                {decisionCenter?.statusPills?.supply || roleDecisionPack?.secondaryDecision || "Stock Check"}
              </p>
            </article>
            <article className="rounded-2xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Price Decision</p>
              <p className="mt-1 text-sm font-bold text-sky-800">
                {decisionCenter?.statusPills?.price || "Price Normal"}
              </p>
            </article>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-200 bg-[linear-gradient(120deg,#fff7ed_0%,#eff6ff_45%,#ecfeff_100%)] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Detect - Verify - Predict - Alert - Supply - Prevent
            </p>
            <div className="mt-2 grid gap-2 md:grid-cols-6">
              {systemPipeline.map((stage) => (
                <article key={stage.key} className="rounded-xl border border-white/70 bg-white/85 p-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    {stage.label}
                  </p>
                  <p className={`mt-1 text-xs font-bold ${stage.tone}`}>{stage.value}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="outbreak-map" className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Map Command Center</h2>
              <p className="text-sm text-slate-600">{mapRoleMessage}</p>
            </div>
            <p className="inline-flex items-center gap-1 text-sm text-slate-600">
              <Clock3 size={14} />
              {isLoadingReports ? "Loading reports..." : `${scopedReports.length} visible reports`}
            </p>
          </div>
          <HealthMap
            reports={reports}
            entities={mapEntities}
            riskZones={riskZones}
            role={user.role}
            userLocation={user.location || null}
            selectedRegion={selectedRegion}
            onRegionSelect={setSelectedRegion}
            selectedZoneInsight={selectedZoneInsight}
            nearbyRiskZones={nearbyZoneRisk}
            aiInsights={aiInsightNarrative}
            supplyRoutes={supplyRoutes}
            pharmacies={mapPharmacyPoints}
            medicineDemand={selectedAreaDemand.length ? selectedAreaDemand : aiInsights.medicineDemand}
          />
        </section>

        <section
          id="quick-capture"
          className={`grid gap-4 ${canCreateAsha ? "" : "xl:grid-cols-[240px_minmax(0,1fr)]"}`}
        >
          {!canCreateAsha ? (
            <RoleSidebar
              role={user.role}
              canSubmitReports={canSubmitReports}
              canSeeLocationInsight={canSeeLocationInsight}
              canSeeAiPanel={Boolean(selectedRegion?.district)}
            />
          ) : null}

          <div className="space-y-4">
            <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Quick Capture Hub</h2>
                  <p className="text-sm text-slate-600">
                    Simple flow: WhatsApp or app report with GPS, disease, new cases, and critical cases.
                  </p>
                </div>
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  Scope: {responseMeta?.roleScope || "Loading role scope..."}
                </p>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">WhatsApp format</p>
                  <p className="mt-1 text-xs text-slate-700">
                    disease: dengue, cases: 12, critical: 2, district: indore, village: palda,
                    lat: 22.72, lon: 75.86
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">App format</p>
                  <p className="mt-1 text-xs text-slate-700">
                    Households visited is optional now. Required fields are disease, cases, critical, and GPS.
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nearby area view</p>
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      type="number"
                      min="2"
                      max="80"
                      value={areaRadiusKm}
                      onChange={(event) => setAreaRadiusKm(event.target.value)}
                      className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                    />
                    <span className="text-xs text-slate-600">km radius</span>
                    <button
                      type="button"
                      onClick={() => loadReports(filters)}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              </div>

              {scopedRoleActions.length ? (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {scopedRoleActions.map((action, index) => (
                    <article
                      key={`${action.type || "action"}-${index}`}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                    >
                      <p className="font-semibold text-slate-900">
                        {action.priority || "MEDIUM"} priority
                      </p>
                      <p className="mt-1">{action.text}</p>
                    </article>
                  ))}
                </div>
              ) : null}
            </article>

            {canCreateAsha ? (
              <article
                id="automation-hub"
                className="rounded-3xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm md:p-6"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-700" />
                  <h3 className="text-base font-bold text-slate-900">Outbreak Auto-Alert Channels</h3>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-4">
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs">
                    <p className="font-semibold text-slate-900">Webhook</p>
                    <p className="mt-1 text-slate-600">
                      {automationStatus?.webhookConfigured ? "Configured" : "Not configured"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs">
                    <p className="font-semibold text-slate-900">Email</p>
                    <p className="mt-1 text-slate-600">
                      {automationStatus?.emailConfigured ? "Configured" : "Not configured"}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Channel: {automationStatus?.emailChannel || "resend_api"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs">
                    <p className="font-semibold text-slate-900">SMS</p>
                    <p className="mt-1 text-slate-600">
                      {automationStatus?.smsConfigured ? "Configured" : "Not configured"}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs">
                    <p className="font-semibold text-slate-900">Last auto trigger</p>
                    <p className="mt-1 text-slate-600">
                      {automationStatus?.lastTriggeredAt
                        ? new Date(automationStatus.lastTriggeredAt).toLocaleString()
                        : "Not triggered yet"}
                    </p>
                  </div>
                </div>
                <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-700">
                  <Mail size={13} />
                  Cooldown: {automationStatus?.cooldownMinutes || 20} minutes before repeat alert.
                </p>
              </article>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-lg font-bold text-slate-900">AI Insight Story</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              simple language for non-technical users
            </p>
            <div className="mt-3 space-y-2">
              {aiInsightNarrative.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  {line}
                </p>
              ))}
            </div>

            <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-3 text-xs text-cyan-900">
              <p className="font-semibold">Supply Action Recommended</p>
              <p className="mt-1">
                {decisionCenter?.supplyPlan?.medicine
                  ? `This area will need ${decisionCenter.supplyPlan.requiredUnitsNext48Hours || 0} units of ${
                      decisionCenter.supplyPlan.medicine
                    } in next 48 hours.`
                  : mostNeededMedicine
                    ? `${mostNeededMedicine.medicine} stock should move to high-risk area in next 2-3 days.`
                    : "Keep baseline fever medicine stock ready while monitoring trend."}
              </p>
            </div>
          </article>

          <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="text-lg font-bold text-slate-900">Role Alerts</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              action messages for {user.role.toLowerCase()}
            </p>
            <div className="mt-3 space-y-2">
              {roleTaskAlerts.map((line, index) => (
                <p
                  key={`${line}-${index}`}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                >
                  {line}
                </p>
              ))}
            </div>
          </article>
        </section>

        {canSeeAdvancedIntel ? (
        <section id="admin-filters" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-bold text-slate-900">Outbreak Insights & Filters</h2>
            {selectedRegion?.district ? (
              <button
                type="button"
                onClick={() => setSelectedRegion(null)}
                className="rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-700"
              >
                Focus: {selectedRegion.village ? `${selectedRegion.village}, ` : ""}
                {selectedRegion.district} (Clear)
              </button>
            ) : null}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
              Scope: {responseMeta?.roleScope || "role scope loading"}
            </span>
            {responseMeta?.locationWindow?.enabled ? (
              <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-cyan-700">
                Radius {responseMeta.locationWindow.radiusKm} km around{" "}
                {formatCoordinate(responseMeta.locationWindow.center?.latitude)},
                {formatCoordinate(responseMeta.locationWindow.center?.longitude)}
              </span>
            ) : null}
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <input
              placeholder="Disease"
              value={filters.disease}
              onChange={(event) => setFilters((current) => ({ ...current, disease: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
            />
            <select
              value={filters.severity}
              onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
            >
              <option value="">All Severity</option>
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
            <input
              type="date"
              value={filters.startDate}
              onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
              className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => loadReports(filters)}
              className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              Apply Insights
            </button>
            <button
              type="button"
              onClick={() => {
                const defaults = {
                  district: "",
                  village: "",
                  disease: "",
                  reporterRole: "",
                  severity: "",
                  startDate: "",
                  endDate: "",
                };
                setFilters(defaults);
                setSelectedRegion(null);
                loadReports(defaults);
              }}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              Reset
            </button>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Risk</p>
              <p className="mt-1 text-xl font-bold text-rose-600">{summary.criticalAlerts} High Risk Areas</p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Next 2-3 Days</p>
              <p className="mt-1 text-xl font-bold text-amber-600">
                {summary.predictiveIncreasePercent > 0 ? "+" : ""}
                {summary.predictiveIncreasePercent}% predicted change
              </p>
            </article>
            <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supply Pressure</p>
              <p className="mt-1 text-xl font-bold text-sky-700">{summary.hospitalLoadPercent}% load index</p>
            </article>
          </div>

          {dashboardAlerts.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {dashboardAlerts.slice(0, 3).map((alert, index) => (
                <article
                  key={`${alert.title || alert.type || "alert"}-${index}`}
                  className="rounded-2xl border border-slate-200 bg-white p-3"
                >
                  <p className="text-sm font-semibold text-slate-900">{alert.title || "Alert"}</p>
                  <p className="mt-1 text-xs text-slate-600">{alert.description || "Location alert available."}</p>
                </article>
              ))}
            </div>
          ) : null}

          {selectedRegion?.district ? (
            <section
              id="ai-decision-panel"
              className="mt-4 space-y-3 rounded-2xl border border-sky-200 bg-sky-50/40 p-4"
            >
              <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
                <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-sky-700">
                  AI Decision Panel
                </h3>
                <p className="text-xs text-slate-600">
                  {selectedRegion?.village ? `${selectedRegion.village}, ` : ""}
                  {selectedRegion?.district}
                </p>
              </div>

              <div className="grid gap-3 md:grid-cols-4">
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Risk Score</p>
                  <p className="mt-1 text-xl font-bold text-rose-600">
                    {Number.isFinite(selectedZoneInsight?.riskScore) ? selectedZoneInsight.riskScore : "--"}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Outbreak Probability
                  </p>
                  <p className="mt-1 text-xl font-bold text-amber-600">
                    {Number.isFinite(selectedZoneInsight?.outbreakProbabilityNext3Days)
                      ? `${Math.round(selectedZoneInsight.outbreakProbabilityNext3Days * 100)}%`
                      : "--"}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Predicted Extra Cases
                  </p>
                  <p className="mt-1 text-xl font-bold text-sky-700">
                    {Number.isFinite(selectedZoneInsight?.predictedAdditionalCases3d)
                      ? selectedZoneInsight.predictedAdditionalCases3d
                      : "--"}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Hospital Prep
                  </p>
                  <p className="mt-1 text-xl font-bold text-violet-700">{summary.expectedPatientsNext2Days}</p>
                </article>
              </div>

              <article className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Price Comparison Impact
                </p>
                {priceImpactCard ? (
                  <div className="mt-2 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Private Price</p>
                      <p className="mt-1 text-2xl font-bold text-rose-700">Rs {priceImpactCard.privatePrice}</p>
                    </div>
                    <p className="text-center text-xl font-black text-slate-500">to</p>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
                        Janaushadhi Price
                      </p>
                      <p className="mt-1 text-2xl font-bold text-emerald-700">Rs {priceImpactCard.benchmark}</p>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Price gap card appears when private vs benchmark pricing is available.
                  </p>
                )}
                {priceImpactCard ? (
                  <p className="mt-2 inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                    Save Rs {priceImpactCard.savings} ({priceImpactCard.overByPercent}% overpricing flagged)
                  </p>
                ) : null}
              </article>

              <div className="grid gap-3 lg:grid-cols-2">
                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Medicine Demand (Next 3 Days)
                  </p>
                  {selectedAreaDemand.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No medical sales data captured yet for this area.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {selectedAreaDemand.map((item, index) => (
                        <div key={`${item.medicine}-${index}`} className="flex items-center justify-between text-sm">
                          <span className="font-medium text-slate-800">{item.medicine}</span>
                          <span className="font-bold text-emerald-700">{item.expectedUnitsNext3Days} units</span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>

                <article className="rounded-xl border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Price Comparison & Overpricing
                  </p>
                  {selectedAreaPriceAnomalies.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500">No overpricing flagged for selected area.</p>
                  ) : (
                    <div className="mt-2 space-y-2">
                      {selectedAreaPriceAnomalies.map((item, index) => (
                        <div
                          key={`${item.reportId || index}-${item.medicine}`}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs"
                        >
                          <p className="font-semibold text-rose-700">
                            {item.medicine} - {item.workerId}
                          </p>
                          <p className="text-slate-600">
                            Private: Rs {item.privatePrice} | Janaushadhi: Rs {item.janaushadhiReference || item.averageAreaPrice}
                          </p>
                          <p className="font-medium text-rose-700">Overpriced by {item.overByPercent}%</p>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              </div>

              <div className="grid gap-2 md:grid-cols-3">
                <article className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Supply Action</p>
                  <p className="mt-1">
                    {selectedAreaDemand[0]
                      ? `Send ${selectedAreaDemand[0].expectedUnitsNext3Days} units of ${selectedAreaDemand[0].medicine}.`
                      : "Collect medical inventory for precise dispatch."}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Spread Watch</p>
                  <p className="mt-1">
                    {nearbyZoneRisk.length
                      ? `${nearbyZoneRisk[0].village} nearby has risk score ${nearbyZoneRisk[0].riskScore}.`
                      : "No nearby high-risk area in same district right now."}
                  </p>
                </article>
                <article className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  <p className="font-semibold text-slate-900">Data Integrity</p>
                  <p className="mt-1">
                    {aiInsights.mismatchReports.length
                      ? `${aiInsights.mismatchReports.length} high mismatch reports need review.`
                      : "No major ASHA-MEDICAL mismatch detected."}
                  </p>
                </article>
              </div>
            </section>
          ) : null}

          {dailyTrend.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Daily Trend</p>
              <div className="mt-2 flex items-end gap-1.5">
                {dailyTrend.slice(-10).map((point) => {
                  const highest = Math.max(...dailyTrend.map((item) => item.newCases || 0), 1);
                  const height = Math.max(8, Math.round(((point.newCases || 0) / highest) * 75));
                  return (
                    <div key={point.date} className="flex flex-1 flex-col items-center gap-1">
                      <div className="h-[6px] w-full rounded-t bg-sky-500" style={{ height }} />
                      <span className="text-[10px] text-slate-500">{point.newCases || 0}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
        ) : null}

        {canSeeAdvancedIntel ? (
        <section
          id="ai-command-center"
          className="rounded-3xl border border-slate-200 bg-[linear-gradient(130deg,#fff7ed_0%,#f8fafc_35%,#f0fdfa_100%)] p-5 shadow-sm md:p-6"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <h2 className="text-lg font-bold text-slate-900">AI Command Center</h2>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
              Detection | Logistics | Prevention
            </p>
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Emerging Hotspots</p>
              {aiInsights.emergingHotspots.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No emerging hotspots detected right now.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {aiInsights.emergingHotspots.slice(0, 3).map((zone) => (
                    <div key={zone.id} className="rounded-lg border border-amber-100 bg-amber-50 px-2 py-1.5 text-xs">
                      <p className="font-semibold text-amber-700">
                        {zone.village}, {zone.district}
                      </p>
                      <p className="text-slate-700">
                        Growth {zone.growthPercent}% | Risk {zone.riskScore}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top Medicines Sold</p>
              {aiInsights.topMedicinesSold.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No medicine sales data yet.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {aiInsights.topMedicinesSold.slice(0, 4).map((medicine) => (
                    <div key={medicine.medicine} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800">{medicine.medicine}</span>
                      <span className="font-semibold text-emerald-700">{medicine.totalUnits} units</span>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Trust & Fraud Watch</p>
              {aiInsights.trustWatchlist.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No low-trust or fraud-risk reporters flagged.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {aiInsights.trustWatchlist.slice(0, 3).map((entry, index) => (
                    <div
                      key={`${entry.workerId}-${index}`}
                      className="rounded-lg border border-rose-100 bg-rose-50 px-2 py-1.5 text-xs"
                    >
                      <p className="font-semibold text-rose-700">
                        {entry.workerId} ({entry.reporterRole})
                      </p>
                      <p className="text-slate-700">
                        Trust {entry.avgTrustScore} | Mismatch {entry.avgMismatchScore}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>
        </section>
        ) : null}

        {isMedicalRole && medicalStoreBoard ? (
          <section
            id="medical-store-dashboard"
            className="rounded-3xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm md:p-6"
          >
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Medical Store Dashboard</h2>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                  demand + price comparison + stock guidance
                </p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-700">
                {medicalStoreBoard.demandSignal}
              </span>
            </div>

            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <p className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-700">
                You should stock {decisionCenter?.supplyPlan?.requiredUnitsNext48Hours || 0} units
                of {decisionCenter?.supplyPlan?.medicine || "Paracetamol"}.
              </p>
              <p
                className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                  decisionCenter?.statusPills?.price === "Overpriced Medicine"
                    ? "border-rose-200 bg-rose-50 text-rose-700"
                    : "border-sky-200 bg-sky-50 text-sky-700"
                }`}
              >
                {decisionCenter?.statusPills?.price === "Overpriced Medicine"
                  ? "You are overpriced. Please match benchmark."
                  : "Pricing is competitive with nearby benchmark."}
              </p>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <article className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Area Demand</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">
                  {medicalStoreBoard.projectedNeed || 0} units
                </p>
                <p className="text-xs text-slate-600">Expected medicine demand in next 2-3 days.</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current Stock</p>
                <p className="mt-1 text-2xl font-bold text-sky-700">{supplyPlanner.currentStockLevel} units</p>
                <p className="text-xs text-slate-600">Estimated available stock near selected zone.</p>
              </article>
              <article className="rounded-2xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Incoming Supply</p>
                <p className="mt-1 text-2xl font-bold text-violet-700">{supplyPlanner.incomingSupply} units</p>
                <p className="text-xs text-slate-600">
                  {supplyPlanner.shortageUnits > 0
                    ? `${supplyPlanner.shortageUnits} units may still be short.`
                    : "Supply looks sufficient for current demand."}
                </p>
              </article>
            </div>

            <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Price Comparison</p>
              {medicalStoreBoard.comparisons.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  Add medicine sales in your report to unlock comparison cards.
                </p>
              ) : (
                <div className="mt-2 grid gap-2 md:grid-cols-2">
                  {medicalStoreBoard.comparisons.map((item) => (
                    <article
                      key={item.medicine}
                      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-slate-900">{item.medicine}</p>
                      <p className="mt-1 text-xs text-slate-700">
                        {formatMoney(item.ownPrice)} vs{" "}
                        {Number.isFinite(item.janaPrice) ? formatMoney(item.janaPrice) : "--"}
                      </p>
                      <p className="text-xs text-slate-500">
                        Nearby avg: {Number.isFinite(item.nearbyAvg) ? formatMoney(item.nearbyAvg) : "--"}
                      </p>
                      <p
                        className={`mt-1 text-xs font-semibold ${
                          item.status === "You are overpriced"
                            ? "text-rose-700"
                            : "text-emerald-700"
                        }`}
                      >
                        {item.status}
                      </p>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        ) : null}

        <section
          id="janaushadhi-intel"
          className="rounded-3xl border border-emerald-200 bg-[linear-gradient(130deg,#ecfdf5_0%,#ffffff_40%,#eff6ff_100%)] p-5 shadow-sm md:p-6"
        >
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Janaushadhi Nearby Intelligence</h2>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                affordability map + area recommendation
              </p>
            </div>
            <button
              type="button"
              onClick={() => loadJanaushadhi(janaushadhiSearch)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoadingJanaushadhi}
            >
              <Store size={15} />
              {isLoadingJanaushadhi ? "Searching..." : "Search Nearby"}
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <input
              type="number"
              step="any"
              placeholder="Latitude"
              value={janaushadhiSearch.latitude}
              onChange={(event) =>
                setJanaushadhiSearch((current) => ({ ...current, latitude: event.target.value }))
              }
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-100 focus:border-emerald-500 focus:ring"
            />
            <input
              type="number"
              step="any"
              placeholder="Longitude"
              value={janaushadhiSearch.longitude}
              onChange={(event) =>
                setJanaushadhiSearch((current) => ({ ...current, longitude: event.target.value }))
              }
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-100 focus:border-emerald-500 focus:ring"
            />
            <input
              type="number"
              min="2"
              max="20"
              step="1"
              placeholder="Radius (km)"
              value={janaushadhiSearch.radiusKm}
              onChange={(event) =>
                setJanaushadhiSearch((current) => ({ ...current, radiusKm: event.target.value }))
              }
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-100 focus:border-emerald-500 focus:ring"
            />
            <button
              type="button"
              onClick={() => {
                if (!selectedRegion?.latitude || !selectedRegion?.longitude) return;
                setJanaushadhiSearch((current) => ({
                  ...current,
                  latitude: String(selectedRegion.latitude),
                  longitude: String(selectedRegion.longitude),
                }));
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            >
              <Navigation size={14} />
              Use Selected Map Area
            </button>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Janaushadhi Centers
              </p>
              {janaushadhiNearby.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No Janaushadhi center found in this range.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {janaushadhiNearby.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-xs"
                    >
                      <p className="font-semibold text-emerald-700">{entry.name}</p>
                      <p className="text-slate-700">
                        {entry.distanceKm} km away - {entry.address || "Address unavailable"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>

            <article className="rounded-2xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Nearby Private Pharmacies
              </p>
              {privateNearby.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No private pharmacy found in this range.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {privateNearby.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-lg border border-sky-100 bg-sky-50 px-2 py-1.5 text-xs"
                    >
                      <p className="font-semibold text-sky-700">{entry.name}</p>
                      <p className="text-slate-700">
                        {entry.distanceKm} km away - {entry.address || "Address unavailable"}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </article>
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
            <p className="font-semibold text-slate-900">AI recommendation</p>
            <p className="mt-1">
              {janaushadhiResult.recommendation ||
                "Run area search to compare private vs Janaushadhi options for lower-cost supply."}
            </p>
            <p className="mt-2 text-slate-500">
              Center: {formatCoordinate(Number(janaushadhiSearch.latitude))},{" "}
              {formatCoordinate(Number(janaushadhiSearch.longitude))}
            </p>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <article className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
              <p className="font-semibold">Stock incoming</p>
              <p className="mt-1">
                Current stock {supplyPlanner.currentStockLevel} units + incoming{" "}
                {supplyPlanner.incomingSupply} units.
              </p>
            </article>
            <article className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <p className="font-semibold">Shortage predicted</p>
              <p className="mt-1">
                {supplyPlanner.shortageUnits > 0
                  ? `${supplyPlanner.shortageUnits} units may be short in next 2-3 days.`
                  : "No immediate shortage predicted for current demand."}
              </p>
            </article>
            <article className="rounded-2xl border border-cyan-200 bg-cyan-50 p-3 text-xs text-cyan-900">
              <p className="font-semibold">Supply action badge</p>
              <p className="mt-1">
                {supplyRoutes.length
                  ? `Send ${supplyPlanner.expectedNeed || 0} units of ${
                      mostNeededMedicine?.medicine || "priority medicine"
                    } to selected risk zone.`
                  : "Select a risk area to draw supply flow on map."}
              </p>
            </article>
          </div>

          <p className="mt-3 inline-flex items-center gap-2 text-xs text-slate-700">
            <MessageCircle size={13} />
            Field teams can share this same location context through WhatsApp ingestion.
          </p>
        </section>

        {canCreateAsha ? (
          <section className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
            <AdminSidebar
              pendingCount={pendingUsers.length}
              alertCount={summary.criticalAlerts}
              mismatchCount={aiInsights.mismatchReports.length}
              priceFlags={aiInsights.priceAnomalies.length}
            />

            <div className="space-y-6">
              <section id="admin-create-asha" className="grid gap-5 lg:grid-cols-2">
              <form
                onSubmit={handleCreateAsha}
                className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck size={18} className="text-amber-600" />
                  <h2 className="text-lg font-bold text-slate-900">Create ASHA Worker</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    placeholder="Full Name"
                    value={createAshaForm.name}
                    onChange={(event) =>
                      setCreateAshaForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={createAshaForm.email}
                    onChange={(event) =>
                      setCreateAshaForm((current) => ({ ...current, email: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={createAshaForm.password}
                    onChange={(event) =>
                      setCreateAshaForm((current) => ({ ...current, password: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                    required
                  />

                  <AreaSearchFields
                    value={{
                      village: createAshaForm.village,
                      district: createAshaForm.district,
                      latitude: createAshaForm.latitude,
                      longitude: createAshaForm.longitude,
                    }}
                    onChange={(patch) =>
                      setCreateAshaForm((current) => ({
                        ...current,
                        ...patch,
                      }))
                    }
                    className="md:col-span-2"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isCreatingAsha}
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreatingAsha ? "Creating..." : "Create ASHA Worker"}
                </button>
              </form>

              <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
                <h2 className="text-lg font-bold text-slate-900">Admin Map Filters</h2>
                <div className="grid gap-3 md:grid-cols-4">
                  <input
                    placeholder="District"
                    value={filters.district}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, district: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                  />
                  <input
                    placeholder="Village"
                    value={filters.village}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, village: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                  />
                  <input
                    placeholder="Disease"
                    value={filters.disease}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, disease: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                  />
                  <select
                    value={filters.reporterRole}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, reporterRole: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                  >
                    <option value="">All Sources</option>
                    <option value="ASHA">ASHA</option>
                    <option value="MEDICAL">MEDICAL</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => loadReports(filters)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-600"
                >
                  Apply Filters
                </button>
                <p className="text-xs text-slate-500">
                  Admin can inspect outbreak markers for any location using district, village, and
                  disease filters.
                </p>
              </section>
            </section>

            <section
              id="admin-memory"
              className="rounded-3xl border border-cyan-200/80 bg-[linear-gradient(135deg,#ecfeff_0%,#ffffff_45%,#f0f9ff_100%)] p-5 shadow-sm md:p-6"
            >
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-cyan-700">
                    <Users size={14} />
                    ASHA MEMORY BOARD
                  </p>
                  <h2 className="mt-1 text-lg font-bold text-slate-900">
                    Remember ASHA IDs by exact or nearby location
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => loadAshaDirectory(ashaLookup)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-white px-3 py-2 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-50"
                >
                  <LocateFixed size={15} />
                  Refresh Board
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-6">
                <input
                  placeholder="District"
                  value={ashaLookup.district}
                  onChange={(event) =>
                    setAshaLookup((current) => ({ ...current, district: event.target.value }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-cyan-100 focus:border-cyan-500 focus:ring md:col-span-2"
                />
                <input
                  placeholder="Village"
                  value={ashaLookup.village}
                  onChange={(event) =>
                    setAshaLookup((current) => ({ ...current, village: event.target.value }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-cyan-100 focus:border-cyan-500 focus:ring md:col-span-2"
                />
                <input
                  type="number"
                  min="1"
                  max="50"
                  step="1"
                  placeholder="Nearby Radius (km)"
                  value={ashaLookup.radiusKm}
                  onChange={(event) =>
                    setAshaLookup((current) => ({ ...current, radiusKm: event.target.value }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-cyan-100 focus:border-cyan-500 focus:ring"
                />
                <button
                  type="button"
                  onClick={() => {
                    const nextLookup = applyCreateLocationToLookup();
                    loadAshaDirectory(nextLookup);
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  Use Create Form Location
                </button>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl border border-cyan-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total ASHA</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{ashaDirectory.data.length}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Exact Location
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">{ashaDirectory.exact.length}</p>
                </div>
                <div className="rounded-2xl border border-amber-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nearby Match
                  </p>
                  <p className="mt-1 text-2xl font-bold text-amber-700">{ashaDirectory.nearby.length}</p>
                </div>
                <div className="rounded-2xl border border-violet-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Search Radius
                  </p>
                  <p className="mt-1 text-2xl font-bold text-violet-700">
                    {ashaDirectory.context?.radiusKm || 12} km
                  </p>
                </div>
              </div>

              {isLoadingAshaDirectory ? (
                <p className="mt-4 text-sm text-slate-500">Loading ASHA memory board...</p>
              ) : null}

              {!isLoadingAshaDirectory && ashaSpotlight.length === 0 ? (
                <p className="mt-4 text-sm text-slate-500">
                  No ASHA workers found for this filter. Try district-only search for wider nearby results.
                </p>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {ashaSpotlight.map((worker) => {
                  const districtMatches =
                    normalizeText(worker?.location?.district) ===
                    normalizeText(ashaDirectory.context?.district);
                  const villageMatches =
                    normalizeText(worker?.location?.village) === normalizeText(ashaDirectory.context?.village);

                  const matchTag =
                    districtMatches && villageMatches
                      ? "Exact area"
                      : districtMatches
                        ? "Nearby district"
                        : "Other area";

                  return (
                    <article
                      key={worker.id}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{worker.name}</p>
                          <p className="truncate text-xs text-slate-500">{worker.email}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyAshaId(worker.workerId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                        >
                          <Copy size={13} />
                          ID
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-slate-900 px-2.5 py-1 font-semibold text-white">
                          {worker.workerId || "NO_ID"}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
                          {matchTag}
                        </span>
                        {worker.distanceKm !== null ? (
                          <span className="rounded-full bg-cyan-100 px-2.5 py-1 font-medium text-cyan-800">
                            {formatDistance(worker.distanceKm)}
                          </span>
                        ) : null}
                      </div>

                      <p className="mt-3 inline-flex items-center gap-1 text-xs text-slate-600">
                        <MapPin size={12} />
                        {locationLabel(worker.location)}
                      </p>
                    </article>
                  );
                })}
              </div>
              </section>
            </div>
          </section>
        ) : null}

        {canSeePendingApprovals ? (
          <section id="admin-approvals" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Pending Hospital/Medical Approvals</h2>
              <button
                type="button"
                onClick={loadPendingUsers}
                className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Refresh
              </button>
            </div>

            {isLoadingPending ? <p className="text-sm text-slate-500">Loading pending users...</p> : null}

            {!isLoadingPending && pendingUsers.length === 0 ? (
              <p className="text-sm text-slate-500">No pending users right now.</p>
            ) : null}

            <div className="space-y-3">
              {pendingUsers.map((pending) => (
                <div
                  key={pending.id}
                  className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{pending.name}</p>
                    <p className="text-xs text-slate-600">
                      {pending.role} - {pending.email}
                    </p>
                    <p className="text-xs text-slate-500">
                      {pending.location?.village}, {pending.location?.district}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleApproveUser(pending.id, pending.role)}
                    disabled={approvingUserId === pending.id}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <CheckCircle2 size={15} />
                    {approvingUserId === pending.id ? "Approving..." : "Approve"}
                  </button>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {canSubmitReports ? (
          <section id="field-report" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="mb-1 text-lg font-bold text-slate-900">
              {user.role === "MEDICAL" ? "Medical Stock & Supply Report" : `${user.role} Field Report`}
            </h2>
            <p className="mb-3 text-sm text-slate-600">
              {user.role === "MEDICAL"
                ? "Submit medicine sales + stock data for better demand prediction and supply planning."
                : "Submit disease updates with GPS from your field area."}
            </p>
            <p className="mb-3 text-xs text-slate-500">
              {user.role === "MEDICAL"
                ? "Quick rule: new cases, critical cases, GPS, and medicine stock lines are required."
                : "Quick rule: new cases, critical cases, and GPS are required. Disease defaults to GENERAL_FEVER if blank."}
            </p>
            <form onSubmit={handleSubmitReport} className="grid gap-3 md:grid-cols-2">
              <input
                placeholder="Disease (optional, e.g. DENGUE)"
                value={reportForm.disease}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, disease: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
              />
              {user.role !== "MEDICAL" ? (
                <input
                  type="number"
                  min="0"
                  placeholder="Households Visited (optional)"
                  value={reportForm.householdsVisited}
                  onChange={(event) =>
                    setReportForm((current) => ({ ...current, householdsVisited: event.target.value }))
                  }
                  className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                />
              ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                  Format each medicine line:
                  <br />
                  <span className="font-semibold">
                    Medicine,UnitsSold,PrivatePrice,BenchmarkPrice,CurrentStock,IncomingStock
                  </span>
                </div>
              )}
              <input
                type="number"
                min="0"
                placeholder="New Cases"
                value={reportForm.newCases}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, newCases: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                required
              />
              <input
                type="number"
                min="0"
                placeholder="Critical Cases"
                value={reportForm.criticalCases}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, criticalCases: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                required
              />
              <input
                type="number"
                step="any"
                placeholder="Latitude"
                value={reportForm.latitude}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, latitude: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                required
              />
              <input
                type="number"
                step="any"
                placeholder="Longitude"
                value={reportForm.longitude}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, longitude: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
                required
              />

              {user.role === "MEDICAL" ? (
                <textarea
                  placeholder="One per line: Paracetamol,120,12,8,300,120"
                  value={reportForm.medicineSalesText}
                  onChange={(event) =>
                    setReportForm((current) => ({ ...current, medicineSalesText: event.target.value }))
                  }
                  className="min-h-[90px] rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring md:col-span-2"
                  required
                />
              ) : null}

              <textarea
                placeholder="Field Notes (optional)"
                value={reportForm.notes}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, notes: event.target.value }))
                }
                className="min-h-[90px] rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring md:col-span-2"
              />
              <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
                <button
                  type="button"
                  onClick={captureCurrentLocation}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                >
                  <Crosshair size={15} />
                  Use Current GPS
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReport}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmittingReport ? "Submitting..." : "Submit Report"}
                </button>
              </div>
            </form>
          </section>
        ) : null}

        {canSeeLocationInsight ? (
          <section id="role-insight" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
            <h2 className="mb-3 text-lg font-bold text-slate-900">Location Insight</h2>
            <div className="grid gap-3 md:grid-cols-3">
              {diseaseInsights.length === 0 ? (
                <p className="text-sm text-slate-500 md:col-span-3">No disease data available yet.</p>
              ) : null}
              {diseaseInsights.map((item) => (
                <div
                  key={item.disease}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                >
                  <p className="font-semibold text-slate-900">{item.disease}</p>
                  <p className="mt-1 text-sm text-slate-600">Cases: {item.cases}</p>
                  <p className="text-xs text-slate-500">Reports: {item.reports}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section id="recent-reports" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          {isAshaRole ? (
            <>
              <h2 className="mb-3 text-lg font-bold text-slate-900">ASHA Tasks & Alerts</h2>
              <div className="grid gap-2">
                {roleTaskAlerts.map((task, index) => (
                  <p
                    key={`${task}-${index}`}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    {task}
                  </p>
                ))}
              </div>
            </>
          ) : (
            <>
              <h2 className="mb-3 text-lg font-bold text-slate-900">Recent Reports</h2>
              {scopedReports.length === 0 ? (
                <p className="text-sm text-slate-500">No reports available yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Source</th>
                        <th className="px-3 py-2">Disease</th>
                        <th className="px-3 py-2">Area</th>
                        <th className="px-3 py-2">New</th>
                        <th className="px-3 py-2">Critical</th>
                        <th className="px-3 py-2">Worker</th>
                        <th className="px-3 py-2">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {scopedReports.slice(0, 15).map((report) => (
                        <tr key={report.id} className="border-b border-slate-100 text-slate-700">
                          <td className="px-3 py-2">{report.reporterRole || "ASHA"}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{report.disease}</td>
                          <td className="px-3 py-2">
                            {report.location?.village}, {report.location?.district}
                          </td>
                          <td className="px-3 py-2">{report.newCases}</td>
                          <td className="px-3 py-2">{report.criticalCases}</td>
                          <td className="px-3 py-2">{report.workerId}</td>
                          <td className="px-3 py-2">
                            {new Date(report.reportDate || report.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {showBottomDock ? (
        <BottomRoleDock
          role={user.role}
          canSubmitReports={canSubmitReports}
          canSeeLocationInsight={canSeeLocationInsight}
          canSeeAiPanel={Boolean(selectedRegion?.district)}
        />
      ) : null}
    </main>
  );
}
