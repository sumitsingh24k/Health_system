"use client";

import {
  Activity,
  Building2,
  ShieldCheck,
  Stethoscope,
  UserCheck,
} from "lucide-react";

export function RoleBadge({ role }) {
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

export function StatCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-emerald-900">{value}</p>
    </div>
  );
}

export function LocationPill({ user }) {
  if (!user?.location?.district || !user?.location?.village) {
    return null;
  }

  return (
    <p className="text-sm text-slate-600">
      <span className="font-semibold text-slate-900">Location:</span> {user.location?.village},{" "}
      {user.location?.district}
    </p>
  );
}

export function RoleIntro({ role }) {
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

export function WorkspacePageHeader({ title, kicker = "JANSETU" }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <Activity size={18} className="text-emerald-600" />
      <p className="text-xs font-semibold tracking-[0.2em] text-emerald-700">{kicker}</p>
      {title ? (
        <span className="text-xs font-medium text-slate-400">/ {title}</span>
      ) : null}
    </div>
  );
}
