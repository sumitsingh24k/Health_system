// ============ PHASE 7: MAP-CENTRIC LAYOUT PATTERN ============
// This file demonstrates the new dashboard layout structure
// Integration guide: Replace the main return statement in workspace-client.js with this pattern

/*
OVERALL LAYOUT STRUCTURE (60-30-10 Grid):
┌──────────────────────────────────────────────────────────────┐
│  TOP STATUS BAR (10%)  - Location | Alerts | Critical Stats  │
├──────────────────────┬──────────────────────────────────────┤
│                      │                                        │
│   MAP CONTAINER      │    RIGHT PANEL (30%)                 │
│   (60%)              │  ┌──────────────────────────────┐    │
│                      │  │ Role-Specific Actions        │    │
│   Heatmap with       │  │ - ASHA: Submit Form         │    │
│   Risk Gradients     │  │ - MEDICAL: Stock Status     │    │
│   - Green: 0-30      │  │ - HOSPITAL: Bed Status      │    │
│   - Yellow: 30-70    │  │ - ADMIN: Approvals          │    │
│   - Red: 70+         │  │                              │    │
│                      │  │ Insights Grid                │    │
│   Controls:          │  │ Top 4-6 Actionable Signals  │    │
│   - GPS Location     │  │                              │    │
│   - Radius Adjuster  │  │ Quick Access to:             │    │
│   - Disease Filter   │  │ - Supply Updates            │    │
│   - Legend           │  │ - Demand Forecasts          │    │
│                      │  │ - Recent Alerts             │    │
│                      │  └──────────────────────────────┘    │
├──────────────────────┴──────────────────────────────────────┤
│  INSIGHTS FOOTER - Top emerging insights (collapsible)       │
└──────────────────────────────────────────────────────────────┘

RESPONSIVE BEHAVIOR:
- Desktop (≥1024px): Full 60-30-10 layout
- Tablet (768-1023px): Map 70%, Panel 30%, Top bar responsive
- Mobile (<768px): Stacked layout, Map full width with bottom drawer

KEY IMPROVEMENTS FROM PHASE 7:
1. Map-Centric: Outbreak risk visible at a glance via heatmap
2. Role-Optimized: Each role sees only relevant data
3. Reduced Clutter: Raw data tables removed, show insights only
4. Heatmap Integration: Color gradient shows outbreak risk (green → yellow → red)
5. Actionable: Each card has clear action or next step
6. Mobile-First: Touch-friendly controls for field workers
*/

/**
 * TEMPLATE: New Dashboard Layout
 * Paste this into workspace-client.js main return() after line ~1498
 */
export const newDashboardTemplate = `
<main className="flex h-screen flex-col bg-slate-50">
  {/* TOP STATUS BAR - 10% height */}
  <TopStatusBar
    user={user}
    alertCount={dashboardAlerts.length}
    summary={dashboardSummary}
  />

  {/* MAIN CONTENT - 90% height */}
  <div className="flex flex-1 overflow-hidden">
    {/* LEFT: MAP CONTAINER - 60% width (70% on tablet, full on mobile) */}
    <section className="relative flex flex-1 flex-col bg-white shadow-md lg:w-3/5">
      {/* Map Component with Heatmap */}
      <div className="flex-1 overflow-hidden">
        <HealthMap
          reports={scopedReports}
          entities={mapEntities}
          user={user}
          selectedRegion={selectedRegion}
          onSelectRegion={setSelectedRegion}
          displayMode="heatmap"  {/* NEW: Shows risk gradient colors */}
        />
      </div>

      {/* Map Controls */}
      <div className="border-t border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid gap-3 md:grid-cols-3">
          {/* GPS Locator */}
          <button className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100">
            📍 Current Location
          </button>

          {/* Radius Adjuster */}
          <div>
            <label className="text-xs font-semibold text-slate-600">Radius (km)</label>
            <input
              type="range"
              min="2"
              max="80"
              value={areaRadiusKm}
              onChange={(e) => setAreaRadiusKm(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Disease Filter (if user is ADMIN) */}
          {user.role === "ADMIN" && (
            <div>
              <label className="text-xs font-semibold text-slate-600">Disease</label>
              <select className="w-full rounded border border-slate-300 px-2 py-1 text-xs">
                <option value="">All Diseases</option>
                <option value="DENGUE">Dengue</option>
                <option value="MALARIA">Malaria</option>
                <option value="TYPHOID">Typhoid</option>
              </select>
            </div>
          )}
        </div>

        {/* Map Legend */}
        <MapLegend />
      </div>
    </section>

    {/* DIVIDER */}
    <div className="hidden w-px bg-slate-200 lg:block"></div>

    {/* RIGHT: PANEL - 30% width (hidden on mobile, drawer on tablet) */}
    <aside className="hidden overflow-y-auto border-l border-slate-200 bg-slate-50 p-4 lg:flex lg:w-2/5 lg:flex-col">
      {/* Role-Specific Action Panel */}
      <RolePanel
        role={user.role}
        data={{
          district: user.location?.district,
          pendingTasks: roleActions.length,
          demandTrend: resolveDemandSignal(aiInsights.medicineDemand?.[0]?.expectedUnits),
          demandChange: "+12%",
          topMedicine: aiInsights.topMedicinesSold?.[0]?.medicine,
          stockStatus: "Adequate",
          availableBeds: "45/100",
          incomingSupply: "3 units",
          supplyStatus: "Pending",
          pendingCount: pendingUsers.length,
          alertCount: dashboardAlerts.length,
          priceFlags: aiInsights.priceAnomalies?.length || 0,
        }}
      />

      {/* Insights Grid Below Role Panel */}
      <div className="mt-4">
        <h3 className="text-xs font-bold uppercase text-slate-600 mb-3">📊 Key Insights</h3>
        <InsightsGrid
          role={user.role}
          aiInsights={aiInsights}
          summary={dashboardSummary}
        />
      </div>

      {/* Recent Alerts (Role-Specific) */}
      {dashboardAlerts.length > 0 && (
        <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-3">
          <p className="text-xs font-bold text-rose-700 mb-2">🚨 Recent Alerts ({dashboardAlerts.length})</p>
          <div className="space-y-2">
            {dashboardAlerts.slice(0, 3).map((alert) => (
              <p key={alert.id} className="text-xs text-rose-700 line-clamp-2">
                • {alert.title}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Supply Status (HOSPITAL only) */}
      {user.role === "HOSPITAL" && (
        <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-3">
          <p className="text-xs font-bold text-blue-700 mb-2">📦 Supply Alert</p>
          <p className="text-xs text-blue-700">Paracetamol stock depletes in 2 days at current rate</p>
          <button className="mt-2 w-full rounded b

order border-blue-300 px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100">
            Order Supply
          </button>
        </div>
      )}
    </aside>
  </div>

  {/* MOBILE BOTTOM DRAWER - visible only on small screens */}
  {showBottomDock && <BottomRoleDock role={user.role} />}
</main>
`;

/**
 * HEALTH MAP CONFIGURATION for Phase 7
 * Update HealthMap component in components/maps/health-map.js to support heatmap mode
 */
export const healthMapConfigForPhase7 = {
  displayMode: "heatmap", // NEW: Can be "markers" or "heatmap"
  heatmapColors: {
    low: "#22c55e",    // Green (0-30 risk score)
    medium: "#eab308", // Yellow (30-70 risk score)
    high: "#ef4444",   // Red (70+ risk score)
  },
  riskGradient: [
    { value: 0, color: "#f0fdf4" },    // Very light green
    { value: 30, color: "#86efac" },   // Light green
    { value: 50, color: "#eab308" },   // Yellow
    { value: 70, color: "#fb923c" },   // Orange
    { value: 100, color: "#ef4444" },  // Red
  ],
  pointSize: (riskScore) => {
    // Larger circles for higher risk
    if (riskScore > 70) return 25;
    if (riskScore > 50) return 20;
    if (riskScore > 30) return 15;
    return 10;
  },
  showLegend: true,
  allowZoom: true,
  centerOnUser: true,
};

/**
 * TAILWIND CSS CLASSES OPTIMIZED FOR PHASE 7 LAYOUT
 * Map container: flex-1 overflow-hidden bg-white
 * Right panel: hidden lg:flex lg:w-2/5 overflow-y-auto
 * Stat displays: text- bold text-2xl
 * Card hover: hover:shadow-md transition
 * Role colors:
 *   - ADMIN: amber (yellow)
 *   - ASHA: rose (pink/red)
 *   - HOSPITAL: sky (blue)
 *   - MEDICAL: emerald (green)
 */

/**
 * ROLE-SPECIFIC CUSTOMIZATIONS
 */
export const roleCustomizations = {
  ASHA: {
    panelHeight: "auto",
    hideFields: ["priceData", "internalVerification"],
    prioritySections: ["Submit Report", "My Area", "Tasks"],
    mapMode: "myAreaOnly",
  },
  MEDICAL: {
    panelHeight: "auto",
    hideFields: ["patientNames", "hospitalInternalData"],
    prioritySections: ["Stock Status", "Demand Trend", "Price Alerts"],
    mapMode: "showPharmacies",
  },
  HOSPITAL: {
    panelHeight: "auto",
    hideFields: ["workerIds", "pharmacyInternalData"],
    prioritySections: ["Bed Status", "Supply Requests", "Outbreak Risk"],
    mapMode: "showHotspots",
  },
  ADMIN: {
    panelHeight: "auto",
    hideFields: [], // ADMIN sees everything
    prioritySections: ["Control Center", "Pending", "Analytics"],
    mapMode: "fullView",
  },
};

/**
 * PERFORMANCE OPTIMIZATIONS FOR PHASE 7
 * - Lazy load right panel on tablets/mobile
 * - Memoize HealthMap to prevent unnecessary re-renders
 * - Virtualize alert lists if > 50 items
 * - Debounce radius adjuster
 * - Cache heatmap calculations
 */

export default {
  newDashboardTemplate,
  healthMapConfigForPhase7,
  roleCustomizations,
};
