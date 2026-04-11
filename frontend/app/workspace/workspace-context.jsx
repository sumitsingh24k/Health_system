"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { backendGet, backendPost } from "@/app/lib/api-client";
import {
  fromBackendCaseRecord,
  toBackendCasePayload,
  toPincodeLikeCode,
  toPredictionPayload,
} from "@/app/lib/backend-adapters";
import {
  DEFAULT_AI_INSIGHTS,
  EMPTY_MAP_ENTITIES,
  normalizeText,
} from "@/app/workspace/workspace-shared";

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ user, children }) {
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

  const canCreateAsha = user.role === "ADMIN";
  const canSubmitReports = user.role === "ASHA" || user.role === "MEDICAL";
  const canSeePendingApprovals = user.role === "ADMIN";
  const canSeeLocationInsight = user.role === "HOSPITAL" || user.role === "MEDICAL";
  const showBottomDock = true;

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
            toast.error("Data load failed", {
              description: ingestError.message || "Please refresh and try again.",
            });
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
        toast.error("Data load failed", {
          description: error.message || "Please refresh and try again.",
        });
      } finally {
        setIsLoadingReports(false);
      }
    },
    [user.location, userLocationCode, filters]
  );

  const loadPendingUsers = useCallback(async () => {
    if (!canSeePendingApprovals) return;
    setIsLoadingPending(true);

    try {
      const res = await fetch("/api/admin/pending-users", { credentials: "same-origin" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.message || body.error || "Failed to load pending users");
      }
      setPendingUsers(Array.isArray(body.data) ? body.data : []);
    } catch (error) {
      toast.error("Pending users failed", { description: error.message || "Please refresh." });
      setPendingUsers([]);
    } finally {
      setIsLoadingPending(false);
    }
  }, [canSeePendingApprovals]);

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
        toast.error("ASHA list failed", {
          description: error.message || "Could not load ASHA details.",
        });
      } finally {
        setIsLoadingAshaDirectory(false);
      }
    },
    [canCreateAsha]
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
        const payload = toPredictionPayload(reports, user.location ?? {});
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

  const scopedReports = useMemo(() => {
    if (!selectedRegion?.district) return reports;
    return reports.filter((report) => {
      const districtMatch =
        normalizeText(report?.location?.district) === normalizeText(selectedRegion?.district);
      const villageMatch = selectedRegion?.village
        ? normalizeText(report?.location?.village) === normalizeText(selectedRegion?.village)
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

  const handleCopyAshaId = useCallback(async (workerId) => {
    if (!workerId) return;

    try {
      await navigator.clipboard.writeText(workerId);
      toast.success("Copied", { description: `${workerId} copied to clipboard.` });
    } catch (_error) {
      toast.info("ASHA ID", { description: workerId });
    }
  }, []);

  const applyCreateLocationToLookup = useCallback(() => {
    const nextLookup = {
      district: createAshaForm.district || "",
      village: createAshaForm.village || "",
      latitude: createAshaForm.latitude || "",
      longitude: createAshaForm.longitude || "",
      radiusKm: ashaLookup.radiusKm || "12",
    };

    setAshaLookup(nextLookup);
    return nextLookup;
  }, [createAshaForm.district, createAshaForm.latitude, createAshaForm.longitude, createAshaForm.village, ashaLookup.radiusKm]);

  const handleCreateAsha = useCallback(
    async (event) => {
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

        toast.info("Backend mode", {
          description: "ASHA creation endpoint is not available in backend v1.",
        });
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
        toast.error("Creation failed", {
          description: error.message || "Please review form values.",
        });
      } finally {
        setIsCreatingAsha(false);
      }
    },
    [createAshaForm, ashaLookup.radiusKm, loadAshaDirectory]
  );

  const handleApproveUser = useCallback(async (userId, role) => {
    setApprovingUserId(userId);

    try {
      toast.info("Backend mode", {
        description: `Approval for ${role} is unavailable in backend v1.`,
      });
    } catch (error) {
      toast.error("Approval failed", { description: error.message || "Please retry." });
    } finally {
      setApprovingUserId("");
    }
  }, []);

  const handleSubmitReport = useCallback(
    async (event) => {
      event.preventDefault();
      setIsSubmittingReport(true);

      try {
        const payload = toBackendCasePayload(reportForm, user);
        const path =
          user.role === "MEDICAL" ? "/api/v1/cases/medical-shop/text" : "/api/v1/cases/asha/text";
        await backendPost(path, payload, {}, "Failed to submit report");

        toast.success("Report submitted", {
          description: "Health data is now visible on map.",
        });
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
        toast.error("Submission failed", {
          description: error.message || "Please validate the form.",
        });
      } finally {
        setIsSubmittingReport(false);
      }
    },
    [reportForm, user, filters, loadReports]
  );

  const captureCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      toast.error("GPS unavailable", {
        description: "Your browser does not support geolocation.",
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setReportForm((current) => ({
          ...current,
          latitude: String(position.coords.latitude),
          longitude: String(position.coords.longitude),
        }));
        toast.success("GPS captured", {
          description: "Current coordinates added to the report.",
        });
      },
      (error) => {
        toast.error("GPS permission required", {
          description: error.message || "Could not read your location.",
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const value = useMemo(
    () => ({
      user,
      reports,
      setReports,
      pendingUsers,
      isLoadingReports,
      isLoadingPending,
      filters,
      setFilters,
      selectedRegion,
      setSelectedRegion,
      dashboardSummary,
      dashboardAlerts,
      riskZones,
      aiInsights,
      mapEntities,
      dailyTrend,
      diseaseDistribution,
      isCreatingAsha,
      isSubmittingReport,
      approvingUserId,
      createAshaForm,
      setCreateAshaForm,
      reportForm,
      setReportForm,
      ashaLookup,
      setAshaLookup,
      ashaDirectory,
      isLoadingAshaDirectory,
      prediction,
      predictionError,
      isLoadingPrediction,
      canCreateAsha,
      canSubmitReports,
      canSeePendingApprovals,
      canSeeLocationInsight,
      showBottomDock,
      canSeeAiPanel: Boolean(selectedRegion?.district),
      loadReports,
      loadPendingUsers,
      loadAshaDirectory,
      scopedReports,
      summary,
      diseaseInsights,
      ashaSpotlight,
      selectedZoneInsight,
      selectedAreaDemand,
      selectedAreaPriceAnomalies,
      nearbyZoneRisk,
      handleCopyAshaId,
      applyCreateLocationToLookup,
      handleCreateAsha,
      handleApproveUser,
      handleSubmitReport,
      captureCurrentLocation,
    }),
    [
      user,
      reports,
      pendingUsers,
      isLoadingReports,
      isLoadingPending,
      filters,
      selectedRegion,
      dashboardSummary,
      dashboardAlerts,
      riskZones,
      aiInsights,
      mapEntities,
      dailyTrend,
      diseaseDistribution,
      isCreatingAsha,
      isSubmittingReport,
      approvingUserId,
      createAshaForm,
      reportForm,
      ashaLookup,
      ashaDirectory,
      isLoadingAshaDirectory,
      prediction,
      predictionError,
      isLoadingPrediction,
      canCreateAsha,
      canSubmitReports,
      canSeePendingApprovals,
      canSeeLocationInsight,
      showBottomDock,
      loadReports,
      loadPendingUsers,
      loadAshaDirectory,
      scopedReports,
      summary,
      diseaseInsights,
      ashaSpotlight,
      selectedZoneInsight,
      selectedAreaDemand,
      selectedAreaPriceAnomalies,
      nearbyZoneRisk,
      handleCopyAshaId,
      applyCreateLocationToLookup,
      handleCreateAsha,
      handleApproveUser,
      handleSubmitReport,
      captureCurrentLocation,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return ctx;
}
