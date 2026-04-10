"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  Copy,
  Crosshair,
  LocateFixed,
  LogOut,
  MapPin,
  ShieldCheck,
  Stethoscope,
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

function RoleBadge({ role }) {
  const palette = {
    ADMIN: "bg-emerald-100 text-emerald-800 border-emerald-200",
    ASHA: "bg-emerald-100 text-emerald-800 border-emerald-200",
    HOSPITAL: "bg-emerald-100 text-emerald-800 border-emerald-200",
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
      color: "text-emerald-700",
    },
    ASHA: {
      icon: UserCheck,
      text: "Submit ground reports for your assigned area with disease and GPS details.",
      color: "text-emerald-700",
    },
    HOSPITAL: {
      icon: Building2,
      text: "Monitor and validate area-wise reports for treatment readiness.",
      color: "text-emerald-700",
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

function parseMedicineSalesText(input) {
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

function AdminSidebar({ pendingCount, alertCount, mismatchCount, priceFlags }) {
  const links = [
    { href: "#admin-create-asha", label: "Create ASHA" },
    { href: "#admin-filters", label: "Filters" },
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

function BottomRoleDock({ role, canSubmitReports, canSeeLocationInsight, canSeeAiPanel }) {
  const links = [
    { href: "#outbreak-map", label: "Map" },
    { href: "#recent-reports", label: "Reports" },
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
  const [aiInsights, setAiInsights] = useState({
    topHighRiskZones: [],
    emergingHotspots: [],
    trustWatchlist: [],
    mismatchReports: [],
    medicineDemand: [],
    topMedicinesSold: [],
    priceAnomalies: [],
  });
  const [mapEntities, setMapEntities] = useState({
    ashaWorkers: [],
    hospitals: [],
    medicalTeams: [],
  });
  const [dailyTrend, setDailyTrend] = useState([]);
  const [diseaseDistribution, setDiseaseDistribution] = useState([]);
  const [isCreatingAsha, setIsCreatingAsha] = useState(false);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [approvingUserId, setApprovingUserId] = useState("");
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
  const [prediction, setPrediction] = useState(null);
  const [predictionError, setPredictionError] = useState("");
  const [isLoadingPrediction, setIsLoadingPrediction] = useState(false);

  const canCreateAsha = false;
  const canSubmitReports = user.role === "ASHA" || user.role === "MEDICAL";
  const canSeePendingApprovals = false;
  const canSeeLocationInsight = user.role === "HOSPITAL" || user.role === "MEDICAL";

  const userLocationCode = useMemo(
    () =>
      toPincodeLikeCode({
        district: user?.location?.district || "",
        village: user?.location?.village || "",
        latitude: user?.location?.latitude,
        longitude: user?.location?.longitude,
      }),
    [user?.location?.district, user?.location?.latitude, user?.location?.longitude, user?.location?.village]
  );

  const loadReports = useCallback(
    async (_activeFilters = { district: "", village: "", disease: "", reporterRole: "" }) => {
      setIsLoadingReports(true);

      try {
        const data = await backendGet(
          `/api/v1/cases?location=${encodeURIComponent(userLocationCode)}&limit=200`,
          {},
          "Failed to load map data"
        );
        const mapped = Array.isArray(data)
          ? data.map((item) => fromBackendCaseRecord(item, user.location))
          : [];
        setReports(mapped);
      } catch (error) {
        toast.error("Data load failed", error.message || "Please refresh and try again.");
      } finally {
        setIsLoadingReports(false);
      }
    },
    [toast, user.location, userLocationCode]
  );

  const loadPendingUsers = useCallback(async () => {
    if (!canSeePendingApprovals) return;
    setIsLoadingPending(true);

    try {
      setPendingUsers([]);
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
        setAshaDirectory({
          data: [],
          exact: [],
          nearby: [],
          others: [],
          context: {
            district: activeLookup.district || null,
            village: activeLookup.village || null,
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
  }, [canCreateAsha, canSeePendingApprovals, loadAshaDirectory, loadPendingUsers, loadReports]);

  useEffect(() => {
    if (!reports.length) {
      setPrediction(null);
      setPredictionError("");
      return;
    }

    let cancelled = false;
    const loadPrediction = async () => {
      setIsLoadingPrediction(true);
      setPredictionError("");
      try {
        const payload = toPredictionPayload(reports, user.location);
        const result = await backendPost(
          "/api/v1/predictions/outbreak",
          payload,
          {},
          "Failed to load outbreak prediction"
        );
        if (!cancelled) {
          setPrediction(result);
        }
      } catch (error) {
        if (!cancelled) {
          setPrediction(null);
          setPredictionError(error.message || "Could not fetch prediction.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingPrediction(false);
        }
      }
    };

    loadPrediction();
    return () => {
      cancelled = true;
    };
  }, [reports, user.location]);

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
      const nextLookup = {
        district: createAshaForm.district || "",
        village: createAshaForm.village || "",
        latitude: createAshaForm.latitude || "",
        longitude: createAshaForm.longitude || "",
        radiusKm: ashaLookup.radiusKm || "12",
      };

      toast.info("Backend mode", "ASHA creation endpoint is not available in backend v1.");
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
      toast.info("Backend mode", `Approval for ${role} is unavailable in backend v1.`);
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
      const payload = toBackendCasePayload(reportForm, user);
      const path =
        user.role === "MEDICAL" ? "/api/v1/cases/medical-shop/text" : "/api/v1/cases/asha/text";
      await backendPost(path, payload, {}, "Failed to submit report");

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
        setReportForm((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
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
                <Activity size={18} className="text-emerald-600" />
                <p className="text-xs font-semibold tracking-[0.2em] text-emerald-700">WORKSPACE</p>
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

            <Button type="button" variant="secondary" size="md" onClick={() => signOut({ callbackUrl: "/" })}>
              <LogOut size={16} />
              Sign out
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Reports" value={scopedReports.length} />
            <StatCard label="Total New Cases" value={summary.newCases} />
            <StatCard label="Critical Cases" value={summary.criticalCases} />
            <StatCard label="Active Cases" value={summary.activeCases} />
          </div>
        </section>

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
                            Private: ₹{item.privatePrice} | Janaushadhi: ₹
                            {item.janaushadhiReference || item.averageAreaPrice}
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
                  <ShieldCheck size={18} className="text-emerald-600" />
                  <h2 className="text-lg font-bold text-slate-900">Create ASHA Worker</h2>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <input
                    placeholder="Full Name"
                    value={createAshaForm.name}
                    onChange={(event) =>
                      setCreateAshaForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                    required
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={createAshaForm.email}
                    onChange={(event) =>
                      setCreateAshaForm((current) => ({ ...current, email: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                    required
                  />
                  <input
                    type="password"
                    placeholder="Password"
                    value={createAshaForm.password}
                    onChange={(event) =>
                      setCreateAshaForm((current) => ({ ...current, password: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
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
                  className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                  />
                  <input
                    placeholder="Village"
                    value={filters.village}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, village: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                  />
                  <input
                    placeholder="Disease"
                    value={filters.disease}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, disease: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                  />
                  <select
                    value={filters.reporterRole}
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, reporterRole: event.target.value }))
                    }
                    className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                  >
                    <option value="">All Sources</option>
                    <option value="ASHA">ASHA</option>
                    <option value="MEDICAL">MEDICAL</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => loadReports(filters)}
                  className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-600"
                >
                  Apply Filters
                </button>
                <p className="text-xs text-slate-500">
                  Admin can inspect outbreak markers for any location using district, village, and
                  disease filters.
                </p>
              </section>
            </section>

            <section className="rounded-3xl border border-emerald-200/80 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_45%,#f0fdf4_100%)] p-5 shadow-sm md:p-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-emerald-700">
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
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-50"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-100 focus:border-emerald-500 focus:ring md:col-span-2"
                />
                <input
                  placeholder="Village"
                  value={ashaLookup.village}
                  onChange={(event) =>
                    setAshaLookup((current) => ({ ...current, village: event.target.value }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-100 focus:border-emerald-500 focus:ring md:col-span-2"
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
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none ring-emerald-100 focus:border-emerald-500 focus:ring"
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
                <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total ASHA</p>
                  <p className="mt-1 text-2xl font-bold text-slate-900">{ashaDirectory.data.length}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Exact Location
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">{ashaDirectory.exact.length}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Nearby Match
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">{ashaDirectory.nearby.length}</p>
                </div>
                <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Search Radius
                  </p>
                  <p className="mt-1 text-2xl font-bold text-emerald-700">
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
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 font-medium text-emerald-800">
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
            <h2 className="mb-1 text-lg font-bold text-slate-900">{user.role} Field Report</h2>
            <p className="mb-3 text-sm text-slate-600">
              Submit multilingual disease updates with voice or typing. Report is plotted on the map
              instantly for your location.
            </p>
            <form onSubmit={handleSubmitReport} className="grid gap-3 md:grid-cols-2">
              <MultilingualVoiceInput
                title="Disease Voice Capture"
                description="Speak disease type in your language"
                onTranscript={(text) =>
                  setReportForm((current) => ({ ...current, disease: text.toUpperCase() }))
                }
                className="md:col-span-2"
              />

              <input
                placeholder="Disease (e.g. DENGUE)"
                value={reportForm.disease}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, disease: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                required
              />
              <input
                type="number"
                min="0"
                placeholder="Households Visited"
                value={reportForm.householdsVisited}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, householdsVisited: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                required
              />
              <input
                type="number"
                min="0"
                placeholder="New Cases"
                value={reportForm.newCases}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, newCases: event.target.value }))
                }
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
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
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
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
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
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
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
                required
              />

              {user.role === "MEDICAL" ? (
                <textarea
                  placeholder="Medicine Sales (one per line): Paracetamol,120,12,8"
                  value={reportForm.medicineSalesText}
                  onChange={(event) =>
                    setReportForm((current) => ({ ...current, medicineSalesText: event.target.value }))
                  }
                  className="min-h-[90px] rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring md:col-span-2"
                />
              ) : null}

              <MultilingualVoiceInput
                title="Whisper Notes"
                description="Speak field notes in any selected language"
                onTranscript={(text) =>
                  setReportForm((current) => ({
                    ...current,
                    notes: current.notes ? `${current.notes} ${text}` : text,
                  }))
                }
                className="md:col-span-2"
              />

              <textarea
                placeholder="Whisper / Field Notes (optional)"
                value={reportForm.notes}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, notes: event.target.value }))
                }
                className="min-h-[90px] rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring md:col-span-2"
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
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
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

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-2 text-lg font-bold text-slate-900">Outbreak Prediction</h2>
          {isLoadingPrediction ? <p className="text-sm text-slate-500">Loading prediction...</p> : null}
          {predictionError ? <p className="text-sm text-rose-600">{predictionError}</p> : null}
          {!isLoadingPrediction && !predictionError && prediction ? (
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Risk Level</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{prediction.risk_level}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Outbreak Status</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{prediction.outbreak_status}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Current Cases</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{prediction.cases?.current ?? 0}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-500">Confidence</p>
                <p className="mt-1 text-lg font-bold text-slate-900">
                  {Math.round((prediction.confidence_score || 0) * 100)}%
                </p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Outbreak Map</h2>
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
          />
        </section>

        <section id="recent-reports" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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
