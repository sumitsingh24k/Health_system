"use client";

import { Clock3 } from "lucide-react";
import HealthMap from "@/app/components/maps/health-map";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { WorkspacePageHeader } from "@/app/workspace/components/workspace-ui";

export function MapView() {
  const {
    user,
    reports,
    mapEntities,
    riskZones,
    selectedRegion,
    setSelectedRegion,
    scopedReports,
    isLoadingReports,
  } = useWorkspace();

  return (
    <>
      <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-7">
        <WorkspacePageHeader title="Map" />
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Outbreak map</h1>
        <p className="mt-1 text-sm text-slate-600">
          Explore cases, clusters, and risk zones. Select a region to focus insights on the trends page.
        </p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-slate-900">Live map</h2>
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
    </>
  );
}
