"use client";

import { Copy, LocateFixed, MapPin, ShieldCheck, Users } from "lucide-react";
import AreaSearchFields from "@/app/components/location/area-search-fields";
import { useWorkspace } from "@/app/workspace/workspace-context";
import {
  formatDistance,
  locationLabel,
  normalizeText,
} from "@/app/workspace/workspace-shared";
import { AdminSidebarNav } from "@/app/workspace/components/admin-sidebar-nav";
import { WorkspacePageHeader } from "@/app/workspace/components/workspace-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function TeamView() {
  const {
    filters,
    setFilters,
    loadReports,
    createAshaForm,
    setCreateAshaForm,
    handleCreateAsha,
    isCreatingAsha,
    ashaLookup,
    setAshaLookup,
    ashaDirectory,
    ashaSpotlight,
    isLoadingAshaDirectory,
    loadAshaDirectory,
    applyCreateLocationToLookup,
    handleCopyAshaId,
  } = useWorkspace();

  return (
    <>
      <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-7">
        <WorkspacePageHeader title="Admin team" />
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">ASHA &amp; approvals</h1>
        <p className="mt-1 text-sm text-slate-600">
          Create workers, filter the board, and review pending hospital or medical registrations.
        </p>
      </section>

      <section className="grid gap-6 xl:grid-cols-[250px_minmax(0,1fr)]">
        <AdminSidebarNav />

        <div className="space-y-6">
          <section id="create-asha" className="grid gap-5 lg:grid-cols-2">
            <form
              onSubmit={handleCreateAsha}
              className="space-y-4 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-emerald-600" />
                <h2 className="text-lg font-bold text-slate-900">Create ASHA Worker</h2>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <Input
                  placeholder="Full Name"
                  value={createAshaForm.name}
                  onChange={(event) =>
                    setCreateAshaForm((current) => ({ ...current, name: event.target.value }))
                  }
                  className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
                  required
                />
                <Input
                  type="email"
                  placeholder="Email"
                  value={createAshaForm.email}
                  onChange={(event) =>
                    setCreateAshaForm((current) => ({ ...current, email: event.target.value }))
                  }
                  className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={createAshaForm.password}
                  onChange={(event) =>
                    setCreateAshaForm((current) => ({ ...current, password: event.target.value }))
                  }
                  className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
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

              <Button
                type="submit"
                disabled={isCreatingAsha}
                className="w-full bg-emerald-700 text-white hover:bg-emerald-600"
              >
                {isCreatingAsha ? "Creating..." : "Create ASHA Worker"}
              </Button>
            </form>

            <section className="space-y-3 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
              <h2 className="text-lg font-bold text-slate-900">Admin Map Filters</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  placeholder="District"
                  value={filters.district}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, district: event.target.value }))
                  }
                  className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
                />
                <Input
                  placeholder="Village"
                  value={filters.village}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, village: event.target.value }))
                  }
                  className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
                />
                <Input
                  placeholder="Disease"
                  value={filters.disease}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, disease: event.target.value }))
                  }
                  className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
                />
                <select
                  value={filters.reporterRole}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, reporterRole: event.target.value }))
                  }
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-200"
                >
                  <option value="">All Sources</option>
                  <option value="ASHA">ASHA</option>
                  <option value="MEDICAL">MEDICAL</option>
                </select>
              </div>
              <Button
                type="button"
                onClick={() => loadReports(filters)}
                className="bg-emerald-700 text-white hover:bg-emerald-600"
              >
                Apply Filters
              </Button>
              <p className="text-xs text-slate-500">
                Admin can inspect outbreak markers for any location using district, village, and
                disease filters.
              </p>
            </section>
          </section>

          <section
            id="memory"
            className="rounded-3xl border border-emerald-200/80 bg-[linear-gradient(135deg,#ecfdf5_0%,#ffffff_45%,#f0fdf4_100%)] p-5 shadow-sm md:p-6"
          >
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
              <Button
                type="button"
                variant="outline"
                onClick={() => loadAshaDirectory(ashaLookup)}
                className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
              >
                <LocateFixed size={15} />
                Refresh Board
              </Button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-6">
              <Input
                placeholder="District"
                value={ashaLookup.district}
                onChange={(event) =>
                  setAshaLookup((current) => ({ ...current, district: event.target.value }))
                }
                className="border-slate-300 bg-white ring-emerald-100 focus-visible:border-emerald-500 focus-visible:ring-emerald-100 md:col-span-2"
              />
              <Input
                placeholder="Village"
                value={ashaLookup.village}
                onChange={(event) =>
                  setAshaLookup((current) => ({ ...current, village: event.target.value }))
                }
                className="border-slate-300 bg-white ring-emerald-100 focus-visible:border-emerald-500 focus-visible:ring-emerald-100 md:col-span-2"
              />
              <Input
                type="number"
                min="1"
                max="50"
                step="1"
                placeholder="Nearby Radius (km)"
                value={ashaLookup.radiusKm}
                onChange={(event) =>
                  setAshaLookup((current) => ({ ...current, radiusKm: event.target.value }))
                }
                className="border-slate-300 bg-white ring-emerald-100 focus-visible:border-emerald-500 focus-visible:ring-emerald-100"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const nextLookup = applyCreateLocationToLookup();
                  loadAshaDirectory(nextLookup);
                }}
              >
                Use Create Form Location
              </Button>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Total ASHA</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{ashaDirectory.data.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Exact Location
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{ashaDirectory.exact.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Nearby Match
                </p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{ashaDirectory.nearby.length}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-white/90 p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
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
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyAshaId(worker.workerId)}
                        className="h-auto gap-1 rounded-lg px-2 py-1 text-xs text-slate-600"
                      >
                        <Copy size={13} />
                        ID
                      </Button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full bg-emerald-800 px-2.5 py-1 font-semibold text-white">
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
    </>
  );
}
