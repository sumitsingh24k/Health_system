"use client";

import Link from "next/link";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { Button } from "@/components/ui/button";
import {
  LocationPill,
  RoleBadge,
  RoleIntro,
  StatCard,
  WorkspacePageHeader,
} from "@/app/workspace/components/workspace-ui";

export function OverviewView() {
  const {
    user,
    scopedReports,
    summary,
    dashboardAlerts,
    canSeeLocationInsight,
    canCreateAsha,
  } = useWorkspace();

  return (
    <>
      <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-7">
        <WorkspacePageHeader title="Overview" />
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900 md:text-3xl">
          Welcome, {user.name || user.email}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <RoleBadge role={user.role} />
          <LocationPill user={user} />
        </div>
        <RoleIntro role={user.role} />

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Reports" value={scopedReports.length} />
          <StatCard label="Total New Cases" value={summary.newCases} />
          <StatCard label="Critical Cases" value={summary.criticalCases} />
          <StatCard label="Active Cases" value={summary.activeCases} />
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild variant="secondary" size="sm" className="rounded-xl">
            <Link href="/workspace/trends">Trends &amp; filters</Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="rounded-xl">
            <Link href="/workspace/map">Outbreak map</Link>
          </Button>
          <Button asChild variant="secondary" size="sm" className="rounded-xl">
            <Link href="/workspace/reports">Reports</Link>
          </Button>
          {canSeeLocationInsight ? (
            <Button asChild variant="secondary" size="sm" className="rounded-xl">
              <Link href="/workspace/insights">Area insight</Link>
            </Button>
          ) : null}
          {canCreateAsha ? (
            <Button asChild variant="secondary" size="sm" className="rounded-xl">
              <Link href="/workspace/team">Admin team</Link>
            </Button>
          ) : null}
        </div>

        {dashboardAlerts.length ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Recent alerts</p>
            <ul className="mt-2 space-y-2 text-sm text-slate-700">
              {dashboardAlerts.slice(0, 3).map((alert, index) => (
                <li key={`${alert.title || alert.type || "alert"}-${index}`}>
                  <span className="font-semibold text-slate-900">{alert.title || "Alert"}:</span>{" "}
                  {alert.description || "Location alert available."}
                </li>
              ))}
            </ul>
            <Button asChild variant="link" className="mt-2 h-auto px-0 text-emerald-700">
              <Link href="/workspace/trends">Open full insights</Link>
            </Button>
          </div>
        ) : null}
      </section>
    </>
  );
}
