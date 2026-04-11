# Phase 7: UI/UX Refinement - Implementation Guide

## Overview
Phase 7 transforms the health system dashboard from a data-heavy portal into a beautiful, map-centric outbreak detection interface. The new design follows a 60-30-10 layout principle: 60% map, 30% role-specific actions, 10% status bar.

## Key Improvements

### 1. Map-Centric Design
**Current State**: Dashboard starts with text cards and tables, map is secondary
**New State**: Map dominates the screen (60% of viewport), provides immediate visual context

**Implementation**:
- Move map to full-width flex container
- Add heatmap layer showing outbreak risk (green → yellow → red gradient)
- Implement risk score color mapping:
  - Green (#22c55e): 0-30 risk score (low threat)
  - Yellow (#eab308): 30-70 risk score (monitoring needed)
  - Red (#ef4444): 70+ risk score (critical action required)

**File to Update**: `app/components/maps/health-map.js`
```javascript
// Add new prop: displayMode
export function HealthMap({ displayMode = "markers", ...props }) {
  if (displayMode === "heatmap") {
    // Add heatmap layer calculation
    const heatmapPoints = calculateHeatmapPoints(reports, riskScores);
    // Render L.heatLayer(heatmapPoints, heatmapOptions)
  }
}
```

### 2. Role-Based Panel (30% width on desktop)
Right sidebar shows ONLY relevant information for each role:

**ASHA Workers**:
- 📍 Submit Report button (primary action)
- Show: Their assigned district
- Show: Pending tasks count
- Hide: Medicine prices, hospital internal scores

**Medical Shops**:
- 📦 Stock Status card
- 📈 Demand Trend (next 7 days forecast)
- ⚠️ Price Alerts (anomalies detected)
- Hide: Other pharmacy data, ASHA worker identities

**Hospital Staff**:
- 🏥 Available Beds (numerator/denominator)
- 📬 Incoming Supply Status
- 🚨 Outbreak Risk Score (for area)
- Hide: Worker IDs, pharmacy internal data

**Admin**:
- ✅ Pending Approvals count
- 🚨 Critical Alerts count (from trustWatchlist)
- 💰 Price Anomalies detected
- 👥 Data Mismatches flag

### 3. Insights Instead of Raw Data
**Principle**: Show only actionable insights, hide raw data tables

**Changes**:
- Remove: Daily trends tables, full hospital load data, worker verification scores
- Add: "Top Hotspot" insight card (highest risk zone)
- Add: "Most Needed Medicine" (forecast demand)
- Add: "Supply Status" alert if critical
- Add: Risk trend indicator (📈 +15% week-over-week)

### 4. Simplified Top Status Bar
**Purpose**: At-a-glance status without scrolling
**Content**:
- Left: Location (Village, District) + Alert count badge
- Center: Key metrics (New Cases, Critical Cases)
- Right: User role + quick sign-out

**File to Create**: Covered in `app/components/phase7-layout-components.js` → `TopStatusBar`

### 5. Heatmap Layer Implementation
**Integration Points**:

1. **health-map.js**:
   ```javascript
   // After map initialization, add heatmap layer
   const heatmapData = reports
     .filter(r => r.riskScore > 0)
     .map(r => [r.latitude, r.longitude, r.riskScore / 100]); // Normalize 0-1
   
   L.heatLayer(heatmapData, {
     radius: 30,
     blur: 15,
     maxZoom: 17,
     gradient: {
       0.0: '#22c55e',  // Green (low)
       0.5: '#eab308',  // Yellow (medium)
       1.0: '#ef4444'   // Red (high)
     }
   }).addTo(map);
   ```

2. **workspace-client.js** (loadReports):
   - Ensure reports include `riskScore` field
   - Call API: `GET /api/health-data?includeRiskScores=true`

### 6. Mobile-Responsive Layout

**Desktop (≥1024px)**:
- Full 60-30-10 layout
- Right panel sticky
- Map full interactive

**Tablet (768-1023px)**:
- Map: 70% width
- Panel: 30% width (scrollable)
- Top bar: Full width

**Mobile (<768px)**:
- Map: 100% width
- Panel: Bottom drawer (slide-up)
- Top bar: Condensed (location + alerts only)
- Bottom dock navigation with key actions

### 7. Color-Coded Risk Levels (Simplified Display)
Instead of numeric scores, show clearly:
```
🟢 LOW THREAT (0-30): "Area is safe, routine monitoring"
🟡 MONITOR (30-70): "Increased activity, watch closely"
🔴 HIGH ALERT (70+): "Immediate action needed"
```

### 8. Removed Clutter
Remove from Phase 7 UI:
- ✂️ Raw case count tables (show charts instead)
- ✂️ Worker verification scores (show trust level instead)
- ✂️ Medicine price benchmarks (show price trend indicator instead)
- ✂️ Historical trends (show only last 7 days)
- ✂️ "Raw Data" sections (admin-only export button)

## Implementation Checklist

### Step 1: Create Layout Components
- ✅ Created: `app/components/phase7-layout-components.js`
  - TopStatusBar: Location, alerts, stats
  - InsightCard: Reusable insight display
  - RolePanel: Role-specific actions
  - InsightsGrid: Dashboard insights
  - MapLegend: Heatmap color explanation
  - Tooltip: ? help bubbles

### Step 2: Update Health Map
- **File**: `app/components/maps/health-map.js`
- **Changes Needed**:
  1. Add `displayMode` prop (default: "markers")
  2. When displayMode === "heatmap":
     - Calculate heatmap from reports with risk scores
     - Apply color gradient (green → yellow → red)
     - Add L.heatLayer to map
  3. Add map controls for zoom, centering

### Step 3: Refactor Workspace Layout
- **File**: `app/workspace/workspace-client.js`
- **Changes Needed**:
  1. Replace main return statement (line ~1498) with new layout
  2. Import new components from phase7-layout-components.js
  3. Apply 60-30-10 grid structure
  4. Move map to left column (flex-1)
  5. Move role panel to right column (lg:w-2/5)
  6. Add top status bar component
  7. Update mobile layout (bottom drawer instead of sidebar)

### Step 4: Enhance Map with Risk Visualization
- **File**: Same as Step 2 (health-map.js)
- **Implementation**:
  ```javascript
  // Add heatmap layer calculation
  const reports_with_risk = reports.map(r => ({
    ...r,
    riskScore: calculateRiskScore(r) // Use Phase 4 formula
  }));

  // Heatmap needs: [lat, lng, intensity 0-1]
  const heatmapData = reports_with_risk
    .filter(r => r.riskScore > 0)
    .map(r => [
      r.latitude,
      r.longitude,
      r.riskScore / 100 // Normalize to 0-1
    ]);

  // Add layer
  L.heatLayer(heatmapData, {
    radius: 30,
    blur: 15,
    maxZoom: 17,
    gradient: { 0: '#22c55e', 0.5: '#eab308', 1: '#ef4444' }
  }).addTo(this.mapInstance);
  ```

### Step 5: Add Role-Specific Filtering
- **File**: `app/workspace/workspace-client.js`
- **Changes**:
  - ASHA panel: `hideFields: ["medicineData", "hospitalData"]`
  - MEDICAL panel: `hideFields: ["workerIds", "hospitalInternalData"]`
  - HOSPITAL panel: `hideFields: ["workerIds", "pharmacyInternalData"]`
  - ADMIN panel: No filtering (full visibility)

### Step 6: Simplify Data Presentation
- **Action Items**:
  1. Remove tables from main view (keep in Admin panel only)
  2. Add charts instead of raw numbers
  3. Use icons + color to convey status (🟢🟡🔴)
  4. Show only "Top 3" of each category
  5. Add "View More" link for detailed reports

## Testing Checklist

### Layout Tests
- [ ] Top bar fits on all screen sizes
- [ ] Map renders without overflow
- [ ] Right panel scrolls independently
- [ ] Mobile bottom drawer appears on <768px
- [ ] Touch controls work on mobile

### Heatmap Tests
- [ ] Green zones appear for low risk (0-30)
- [ ] Yellow zones appear for medium risk (30-70)
- [ ] Red zones appear for high risk (70+)
- [ ] Heatmap updates when data changes
- [ ] Legend shows correct colors

### Role-Based Tests
- [ ] ASHA sees only ASHA panel content (no prices)
- [ ] MEDICAL sees stock status, demand trends
- [ ] HOSPITAL sees bed status, supply alerts
- [ ] ADMIN sees all data without restrictions

### Mobile Tests
- [ ] Bottom dock has 4-5 main action buttons
- [ ] Map takes 100% width on mobile
- [ ] Panel converts to drawer (tap to expand)
- [ ] Touch works smoothly on heatmap

## File Structure After Phase 7

```
app/
├── components/
│   ├── phase7-layout-components.js (NEW)
│   │   ├── TopStatusBar
│   │   ├── InsightCard  
│   │   ├── RolePanel
│   │   ├── InsightsGrid
│   │   ├── MapLegend
│   │   └── Tooltip
│   ├── maps/
│   │   └── health-map.js (UPDATED)
│   │       ├── Add displayMode prop
│   │       ├── Add heatmap layer
│   │       └── Add color gradient
│   └── ...existing
├── workspace/
│   ├── workspace-client.js (REFACTORED)
│   │   ├── New layout: 60-30-10 grid
│   │   ├── New TopStatusBar
│   │   ├── New RolePanel
│   │   └── Mobile drawer
│   ├── phase7-layout-reference.js (NEW - for reference)
│   └── page.js
├── api/
│   ├── health-data/route.js (unchanged - Phases 1-6 complete)
│   ├── supply/route.js (unchanged - Phase 5)
│   ├── supply/recommend/route.js (unchanged - Phase 5)
│   └── notifications/audit/route.js (unchanged - Phase 6)
└── ...
```

## Migration Strategy

### Option A: Gradual (Recommended)
1. Create new components in `phase7-layout-components.js` ✅
2. Keep old layout, add new components as overlays
3. Add feature flag to toggle between layouts
4. Once tested, replace main layout
5. Remove old components

### Option B: Full Replacement
1. Create new layout in separate file
2. Replace workspace-client.js entirely
3. Test all roles
4. Rollback if issues

**Recommendation**: Go with Option A for safety.

## Performance Considerations

**Heatmap Rendering**:
- Filter reports to only those with riskScore > 0
- Use max 1000 points for heatmap (performance limit)
- Cache heatmap layer, rebuild on data change

**Right Panel**:
- Lazy load on desktop (show after 1s)
- Immediately on tablet/mobile
- Memoize InsightsGrid to prevent re-renders

**Mobile**:
- Use bottom drawer (avoid rendering panel initially)
- Virtualize long lists (>10 items)

## Success Criteria for Phase 7

✅ All tasks complete when:
1. Dashboard layout is 60% map, 30% panel, 10% bar on desktop
2. Heatmap shows color gradient (green → yellow → red) based on risk
3. Each role sees ONLY their relevant data in right panel
4. Raw data tables are hidden (expert mode in admin only)
5. Mobile layout works smoothly with bottom drawer
6. All color schemes follow role-based palette (amber/rose/sky/emerald)
7. Load time < 3 seconds (map interactive within 1s)
8. Zero layout shift on data load

---

## Quick Start for Developers

1. **Import new components**:
   ```javascript
   import {
     TopStatusBar,
     RolePanel,
     InsightsGrid,
     MapLegend,
   } from "@/app/components/phase7-layout-components";
   ```

2. **Update HealthMap call**:
   ```javascript
   <HealthMap
     displayMode="heatmap"
     reports={scopedReports}
     // ... rest of props
   />
   ```

3. **Add new layout**:
   ```jsx
   // Copy template from phase7-layout-reference.js
   // Replace old return() in workspace-client.js
   ```

4. **Test roles**: Sign in as each role, verify panel content

5. **Mobile test**: Resize to <768px, test bottom drawer

Done! Your dashboard is now map-centric and beautiful.
