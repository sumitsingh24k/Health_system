"use client";

import Link from "next/link";
import { useWorkspace } from "@/app/workspace/workspace-context";

export function AdminSidebarNav() {
  const { pendingUsers, summary, aiInsights } = useWorkspace();

  const links = [
    { href: "/workspace/team#create-asha", label: "Create ASHA" },
    { href: "/workspace/trends", label: "Filters" },
    { href: "/workspace/team#memory", label: "ASHA Memory" },
    { href: "/workspace/reports#pending-approvals", label: "Approvals" },
    { href: "/workspace/map", label: "Map" },
  ];

  return (
    <aside className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm xl:sticky xl:top-6 xl:h-fit">
      <p className="text-xs font-semibold tracking-[0.18em] text-emerald-800 uppercase">Admin Sidebar</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs text-slate-500">Pending approvals</p>
        <p className="text-lg font-bold text-slate-900">{pendingUsers.length}</p>
        <p className="mt-2 text-xs text-slate-500">Critical alerts</p>
        <p className="text-lg font-bold text-emerald-800">{summary.criticalAlerts}</p>
        <p className="mt-2 text-xs text-slate-500">Data mismatches</p>
        <p className="text-lg font-bold text-emerald-700">{aiInsights.mismatchReports.length}</p>
        <p className="mt-2 text-xs text-slate-500">Price anomaly flags</p>
        <p className="text-lg font-bold text-emerald-700">{aiInsights.priceAnomalies.length}</p>
      </div>
    </aside>
  );
}
