"use client";

import { useWorkspace } from "@/app/workspace/workspace-context";
import { WorkspacePageHeader } from "@/app/workspace/components/workspace-ui";

export function InsightsView() {
  const { diseaseInsights } = useWorkspace();

  return (
    <>
      <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-7">
        <WorkspacePageHeader title="Area insight" />
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Location insight</h1>
        <p className="mt-1 text-sm text-slate-600">Disease mix from current filters and map scope.</p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Disease distribution</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {diseaseInsights.length === 0 ? (
            <p className="text-sm text-slate-500 md:col-span-3">No disease data available yet.</p>
          ) : null}
          {diseaseInsights.map((item) => (
            <div key={item.disease} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="font-semibold text-slate-900">{item.disease}</p>
              <p className="mt-1 text-sm text-slate-600">Cases: {item.cases}</p>
              <p className="text-xs text-slate-500">Reports: {item.reports}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
