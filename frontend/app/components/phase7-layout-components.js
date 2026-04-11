// ============ PHASE 7: MAP-CENTRIC LAYOUT ENHANCEMENT ============
// This file contains enhanced UI components for the new dashboard layout.
// Import these components in workspace-client.js to replace existing UI sections.

import React from "react";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Flame,
  MapPin,
  TrendingUp,
  Package,
  Clock,
  Users,
  FileText,
} from "lucide-react";

/**
 * Top Status Bar (10% of viewport)
 * Shows: Location context, role badge, critical alerts count
 */
export function TopStatusBar({ user, alertCount = 0, summary = {} }) {
  const getRoleColor = (role) => {
    const colors = {
      ADMIN: "bg-amber-50 border-amber-200",
      ASHA: "bg-rose-50 border-rose-200",
      HOSPITAL: "bg-sky-50 border-sky-200",
      MEDICAL: "bg-emerald-50 border-emerald-200",
    };
    return colors[role] || colors.MEDICAL;
  };

  return (
    <div
      className={`sticky top-0 z-40 border-b ${getRoleColor(user.role)} backdrop-blur-sm`}
    >
      <div className="mx-auto max-w-full px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between gap-2">
          {/* Left: Location badge */}
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-slate-600" />
            <span className="text-xs font-semibold text-slate-600">
              {user.location?.village || "Location"},{" "}
              {user.location?.district || "District"}
            </span>
            {alertCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-700">
                <Flame size={12} />
                {alertCount} Alert{alertCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Right: Summary stats */}
          <div className="flex items-center gap-4 text-xs">
            <span className="hidden sm:inline text-slate-600">
              <span className="font-semibold text-slate-900">{summary.newCases || 0}</span> New Cases
            </span>
            <span className="hidden sm:inline text-slate-600">
              <span className="font-semibold text-rose-700">{summary.criticalCases || 0}</span> Critical
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Insight Card
 * Reusable card for displaying actionable insights
 */
export function InsightCard({ icon: Icon, title, value, trend, color, subtitle }) {
  return (
    <div className={`rounded-2xl border ${color} p-4 shadow-sm hover:shadow-md transition`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            {title}
          </p>
          <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {Icon && <Icon size={20} className="mt-1 text-slate-400" />}
      </div>
      {trend && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
          <TrendingUp size={12} />
          {trend}
        </p>
      )}
    </div>
  );
}

/**
 * Role-Specific Right Panel
 * ASHA: Input form, pending tasks
 * MEDICAL: Demand trends, stock alerts
 * HOSPITAL: Supply routes, bed prep
 * ADMIN: Full visibility with quick actions
 */
export function RolePanel({ role, data = {} }) {
  const panelConfig = {
    ASHA: {
      title: "Field Report",
      icon: FileText,
      sections: [
        { label: "Quick Capture", icon: FileText, action: "submit_report" },
        { label: "Your District", subtitle: data.district || "Unknown" },
        { label: "Pending Tasks", count: data.pendingTasks || 0 },
      ],
    },
    MEDICAL: {
      title: "Medicine Insights",
      icon: Package,
      sections: [
        {
          label: "Stock Status",
          icon: Package,
          value: data.stockStatus || "Adequate",
          color: "text-emerald-600",
        },
        {
          label: "Demand Trend",
          value: data.demandTrend || "Stable",
          trend: data.demandChange || "+2%",
        },
        { label: "Top Medicine", value: data.topMedicine || "Paracetamol" },
      ],
    },
    HOSPITAL: {
      title: "Bed & Supply",
      icon: Building2,
      sections: [
        {
          label: "Available Beds",
          value: data.availableBeds || "0/100",
          icon: Building2,
        },
        {
          label: "Supply Status",
          value: data.supplyStatus || "Critical",
          color: "text-rose-600",
        },
        { label: "Incoming Supply", value: data.incomingSupply || "Pending" },
      ],
    },
    ADMIN: {
      title: "Control Center",
      icon: AlertTriangle,
      sections: [
        { label: "Pending Approvals", count: data.pendingCount || 0 },
        { label: "Critical Alerts", count: data.alertCount || 0, color: "text-rose-600" },
        { label: "Price Anomalies", count: data.priceFlags || 0, color: "text-amber-600" },
      ],
    },
  };

  const config = panelConfig[role] || panelConfig.MEDICAL;

  return (
    <div className="h-fit rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          {config.icon && <config.icon size={16} className="text-slate-600" />}
          <h3 className="text-sm font-bold text-slate-900">{config.title}</h3>
        </div>
      </div>

      <div className="divide-y divide-slate-100 p-3 sm:p-4">
        {config.sections.map((section, idx) => (
          <div key={idx} className={idx > 0 ? "pt-3" : ""}>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              {section.label}
            </p>
            {section.value && (
              <p className={`mt-1 font-bold ${section.color || "text-slate-900"}`}>
                {section.value}
              </p>
            )}
            {section.count !== undefined && (
              <p className="mt-1 text-lg font-bold text-slate-900">{section.count}</p>
            )}
            {section.trend && (
              <p className="mt-1 text-xs text-emerald-600 font-semibold">📈 {section.trend}</p>
            )}
            {section.subtitle && <p className="mt-1 text-xs text-slate-500">{section.subtitle}</p>}
          </div>
        ))}

        {/* Action button for ASHA */}
        {role === "ASHA" && (
          <button className="mt-3 w-full rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-100">
            📍 Submit Report
          </button>
        )}

        {/* Supply alert for HOSPITAL */}
        {role === "HOSPITAL" && (
          <div className="mt-3 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
            ⚠️ <span className="font-semibold">1 urgent supply needed</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Insights Grid
 * Shows top 4-6 actionable insights based on role
 */
export function InsightsGrid({ role, aiInsights = {}, summary = {} }) {
  const getRoleInsights = () => {
    switch (role) {
      case "ASHA":
        return [
          {
            icon: AlertTriangle,
            title: "High Risk Zone",
            value: aiInsights.topHighRiskZones?.[0]?.village || "None",
            color: "border-rose-100 bg-rose-50",
          },
          {
            icon: Users,
            title: "New Cases(24h)",
            value: summary.newCases || 0,
            color: "border-sky-100 bg-sky-50",
            subtitle: "in your area",
          },
        ];
      case "MEDICAL":
        return [
          {
            icon: Package,
            title: "Top Medicine",
            value: aiInsights.topMedicinesSold?.[0]?.medicine || "Awaiting",
            color: "border-emerald-100 bg-emerald-50",
          },
          {
            icon: TrendingUp,
            title: "Price Alert",
            value: `${aiInsights.priceAnomalies?.length || 0} Items`,
            color: "border-amber-100 bg-amber-50",
            subtitle: "price changes detected",
          },
        ];
      case "HOSPITAL":
        return [
          {
            icon: Building2,
            title: "Outbreak Risk",
            value: summary.outbreakProbabilityNext3Days
              ? `${Math.round(summary.outbreakProbabilityNext3Days * 100)}%`
              : "Low",
            color: "border-rose-100 bg-rose-50",
          },
          {
            icon: Package,
            title: "Supply Needed",
            value: `${aiInsights.medicineDemand?.length || 0} types`,
            color: "border-blue-100 bg-blue-50",
            subtitle: "next 7 days",
          },
        ];
      case "ADMIN":
        return [
          {
            icon: AlertTriangle,
            title: "Critical Alerts",
            value: aiInsights.trustWatchlist?.length || 0,
            color: "border-rose-100 bg-rose-50",
          },
          {
            icon: CheckCircle2,
            title: "Pending Approvals",
            value: summary.pendingCount || 0,
            color: "border-amber-100 bg-amber-50",
          },
          {
            icon: MapPin,
            title: "Hotspots",
            value: aiInsights.topHighRiskZones?.length || 0,
            color: "border-sky-100 bg-sky-50",
            subtitle: "high risk zones",
          },
        ];
      default:
        return [];
    }
  };

  const insights = getRoleInsights();

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {insights.map((insight, idx) => (
        <InsightCard
          key={idx}
          icon={insight.icon}
          title={insight.title}
          value={insight.value}
          subtitle={insight.subtitle}
          color={insight.color}
        />
      ))}
    </div>
  );
}

/**
 * Map Legend for Heatmap
 * Shows color scale for outbreak risk levels
 */
export function MapLegend() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600 mb-2">
        Risk Scale
      </p>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#22c55e" }}></div>
          <span className="text-slate-600">0-30: Low</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#eab308" }}></div>
          <span className="text-slate-600">30-70: Medium</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: "#ef4444" }}></div>
          <span className="text-slate-600">70+: High</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Tooltip Helper Component
 * Shows contextual help on metrics
 */
export function Tooltip({ label, text }) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  return (
    <div className="inline-flex items-center gap-1 group">
      <span>{label}</span>
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-300"
      >
        ?
      </button>
      {showTooltip && (
        <div className="absolute z-50 mt-6 rounded-lg border border-slate-200 bg-white p-2 shadow-lg text-xs text-slate-700 whitespace-nowrap">
          {text}
        </div>
      )}
    </div>
  );
}

export default {
  TopStatusBar,
  InsightCard,
  RolePanel,
  InsightsGrid,
  MapLegend,
  Tooltip,
};
