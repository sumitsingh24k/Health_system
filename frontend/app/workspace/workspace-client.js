"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import {
  Activity,
  Building2,
  CheckCircle2,
  Clock3,
  Crosshair,
  LogOut,
  ShieldCheck,
  Stethoscope,
  UserCheck,
} from "lucide-react";
import HealthMap from "@/app/components/maps/health-map";
import { useToast } from "@/app/components/toast-provider";
import AreaSearchFields from "@/app/components/location/area-search-fields";
import MultilingualVoiceInput from "@/app/components/voice/multilingual-voice-input";
import { readApiPayload, resolveApiError } from "@/app/lib/fetch-utils";

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

export default function WorkspaceClient({ user }) {
  const { toast } = useToast();
  const [reports, setReports] = useState([]);
  const [pendingUsers, setPendingUsers] = useState([]);
  const [isLoadingReports, setIsLoadingReports] = useState(true);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [filters, setFilters] = useState({
    district: "",
    village: "",
    disease: "",
    reporterRole: "",
  });
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
    notes: "",
    latitude: user?.location?.latitude?.toString() || "",
    longitude: user?.location?.longitude?.toString() || "",
  });

  const canCreateAsha = user.role === "ADMIN";
  const canSubmitReports = user.role === "ASHA" || user.role === "MEDICAL";
  const canSeePendingApprovals = user.role === "ADMIN";
  const canSeeLocationInsight = user.role === "HOSPITAL" || user.role === "MEDICAL";

  const loadReports = useCallback(
    async (activeFilters = { district: "", village: "", disease: "", reporterRole: "" }) => {
      setIsLoadingReports(true);

      try {
        const params = new URLSearchParams({ limit: "200" });
        if (user.role === "ADMIN") {
          if (activeFilters.district) params.set("district", activeFilters.district);
          if (activeFilters.village) params.set("village", activeFilters.village);
          if (activeFilters.disease) params.set("disease", activeFilters.disease);
          if (activeFilters.reporterRole) params.set("reporterRole", activeFilters.reporterRole);
        }

        const response = await fetch(`/api/health-data?${params.toString()}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = await readApiPayload(response);

        if (!response.ok) {
          throw new Error(resolveApiError(payload, "Failed to load map data"));
        }

        setReports(Array.isArray(payload?.data) ? payload.data : []);
      } catch (error) {
        toast.error("Data load failed", error.message || "Please refresh and try again.");
      } finally {
        setIsLoadingReports(false);
      }
    },
    [toast, user.role]
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

  useEffect(() => {
    loadReports(filters);
    if (canSeePendingApprovals) {
      loadPendingUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const summary = useMemo(() => {
    return reports.reduce(
      (acc, item) => {
        acc.newCases += item.newCases || 0;
        acc.criticalCases += item.criticalCases || 0;
        return acc;
      },
      { newCases: 0, criticalCases: 0 }
    );
  }, [reports]);

  const diseaseInsights = useMemo(() => {
    const buckets = reports.reduce((acc, item) => {
      const key = item.disease || "UNKNOWN";
      const current = acc.get(key) || { disease: key, reports: 0, cases: 0 };
      current.reports += 1;
      current.cases += item.newCases || 0;
      acc.set(key, current);
      return acc;
    }, new Map());

    return [...buckets.values()].sort((a, b) => b.cases - a.cases).slice(0, 5);
  }, [reports]);

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

      toast.success("ASHA created", `${payload?.user?.workerId || ""} is active now.`);
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
      const response = await fetch("/api/health-data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disease: reportForm.disease,
          householdsVisited: reportForm.householdsVisited,
          newCases: reportForm.newCases,
          criticalCases: reportForm.criticalCases,
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
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#e0f2fe_0%,#f8fafc_35%,#f1f5f9_100%)] px-4 py-6 md:px-6 md:py-8">
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
            <StatCard label="Reports" value={reports.length} />
            <StatCard label="Total New Cases" value={summary.newCases} />
            <StatCard label="Critical Cases" value={summary.criticalCases} />
            <StatCard label="Diseases Tracked" value={new Set(reports.map((r) => r.disease)).size} />
          </div>
        </section>

        {canCreateAsha ? (
          <section className="grid gap-5 lg:grid-cols-2">
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
                Admin can inspect outbreak markers for any location using district, village, and disease
                filters.
              </p>
            </section>
          </section>
        ) : null}

        {canSeePendingApprovals ? (
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
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
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-sky-200 focus:border-sky-500 focus:ring"
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
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
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

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-900">Outbreak Map</h2>
            <p className="inline-flex items-center gap-1 text-sm text-slate-600">
              <Clock3 size={14} />
              {isLoadingReports ? "Loading reports..." : `${reports.length} plotted reports`}
            </p>
          </div>
          <HealthMap reports={reports} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-3 text-lg font-bold text-slate-900">Recent Reports</h2>
          {reports.length === 0 ? (
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
                  {reports.slice(0, 15).map((report) => (
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
    </main>
  );
}
