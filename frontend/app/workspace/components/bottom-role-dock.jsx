"use client";

import Link from "next/link";
import { useWorkspace } from "@/app/workspace/workspace-context";

export function BottomRoleDock() {
  const {
    user,
    canSubmitReports,
    canSeeLocationInsight,
    canSeeAiPanel,
  } = useWorkspace();

  const links = [
    { href: "/workspace/map", label: "Map" },
    { href: "/workspace/reports", label: "Reports" },
  ];

  if (canSubmitReports) {
    links.unshift({ href: "/workspace/reports", label: "Submit" });
  }

  if (canSeeLocationInsight) {
    links.push({ href: "/workspace/insights", label: "Insight" });
  }

  if (canSeeAiPanel) {
    links.push({ href: "/workspace/trends", label: "AI Panel" });
  }

  const gridClass =
    links.length <= 2 ? "grid-cols-2" : links.length === 3 ? "grid-cols-3" : "grid-cols-4";

  return (
    <nav className="fixed bottom-3 left-1/2 z-50 w-[calc(100%-1rem)] max-w-md -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-xl backdrop-blur md:hidden">
      <p className="px-2 pb-1 text-[10px] font-semibold tracking-[0.16em] text-slate-500 uppercase">
        JanSetu · {user.role}
      </p>
      <div className={`grid gap-1 ${gridClass}`}>
        {links.map((item) => (
          <Link
            key={`${item.href}-${item.label}`}
            href={item.href}
            className="rounded-lg px-2 py-2 text-center text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
