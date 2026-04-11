"use client";

import { useWorkspace } from "@/app/workspace/workspace-context";
import { DailyTrendChart } from "@/components/workspace/daily-trend-chart";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspacePageHeader } from "@/app/workspace/components/workspace-ui";

export function TrendsView() {
  const {
    filters,
    setFilters,
    selectedRegion,
    setSelectedRegion,
    loadReports,
    summary,
    dashboardAlerts,
    selectedZoneInsight,
    selectedAreaDemand,
    selectedAreaPriceAnomalies,
    nearbyZoneRisk,
    aiInsights,
    dailyTrend,
    prediction,
    predictionError,
    isLoadingPrediction,
  } = useWorkspace();

  return (
    <>
      <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-7">
        <WorkspacePageHeader title="Trends" />
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Outbreak insights &amp; filters</h1>
        <p className="mt-1 text-sm text-slate-600">
          Apply filters, review risk signals, and inspect the daily case trend.
        </p>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <h2 className="text-lg font-bold text-slate-900">Filters</h2>
          {selectedRegion?.district ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedRegion(null)}
              className="border-emerald-200 bg-emerald-50 text-xs text-emerald-800 hover:bg-emerald-100"
            >
              Focus: {selectedRegion.village ? `${selectedRegion.village}, ` : ""}
              {selectedRegion.district} (Clear)
            </Button>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <Input
            placeholder="Disease"
            value={filters.disease}
            onChange={(event) => setFilters((current) => ({ ...current, disease: event.target.value }))}
            className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
          />
          <select
            value={filters.severity}
            onChange={(event) => setFilters((current) => ({ ...current, severity: event.target.value }))}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-2 focus-visible:ring-emerald-200"
          >
            <option value="">All Severity</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <Input
            type="date"
            value={filters.startDate}
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
            className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
          />
          <Input
            type="date"
            value={filters.endDate}
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
            className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
          />
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            onClick={() => loadReports(filters)}
            className="bg-emerald-700 text-white hover:bg-emerald-600"
          >
            Apply Insights
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              const defaults = {
                district: "",
                village: "",
                disease: "",
                reporterRole: "",
                severity: "",
                startDate: "",
                endDate: "",
              };
              setFilters(defaults);
              setSelectedRegion(null);
              loadReports(defaults);
            }}
          >
            Reset
          </Button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Current Risk</p>
            <p className="mt-1 text-xl font-bold text-emerald-900">{summary.criticalAlerts} High Risk Areas</p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Next 2-3 Days</p>
            <p className="mt-1 text-xl font-bold text-emerald-800">
              {summary.predictiveIncreasePercent > 0 ? "+" : ""}
              {summary.predictiveIncreasePercent}% predicted change
            </p>
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Supply Pressure</p>
            <p className="mt-1 text-xl font-bold text-emerald-800">{summary.hospitalLoadPercent}% load index</p>
          </article>
        </div>

        {dashboardAlerts.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {dashboardAlerts.slice(0, 3).map((alert, index) => (
              <article
                key={`${alert.title || alert.type || "alert"}-${index}`}
                className="rounded-2xl border border-slate-200 bg-white p-3"
              >
                <p className="text-sm font-semibold text-slate-900">{alert.title || "Alert"}</p>
                <p className="mt-1 text-xs text-slate-600">{alert.description || "Location alert available."}</p>
              </article>
            ))}
          </div>
        ) : null}

        {selectedRegion?.district ? (
          <section
            id="ai-decision-panel"
            className="mt-4 space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4"
          >
            <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
              <h3 className="text-sm font-bold tracking-[0.16em] text-emerald-800 uppercase">AI Decision Panel</h3>
              <p className="text-xs text-slate-600">
                {selectedRegion?.village ? `${selectedRegion.village}, ` : ""}
                {selectedRegion?.district}
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Risk Score</p>
                <p className="mt-1 text-xl font-bold text-emerald-900">
                  {Number.isFinite(selectedZoneInsight?.riskScore) ? selectedZoneInsight.riskScore : "--"}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  Outbreak Probability
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-800">
                  {Number.isFinite(selectedZoneInsight?.outbreakProbabilityNext3Days)
                    ? `${Math.round(selectedZoneInsight.outbreakProbabilityNext3Days * 100)}%`
                    : "--"}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                  Predicted Extra Cases
                </p>
                <p className="mt-1 text-xl font-bold text-emerald-800">
                  {Number.isFinite(selectedZoneInsight?.predictedAdditionalCases3d)
                    ? selectedZoneInsight.predictedAdditionalCases3d
                    : "--"}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">Hospital Prep</p>
                <p className="mt-1 text-xl font-bold text-emerald-800">{summary.expectedPatientsNext2Days}</p>
              </article>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Medicine Demand (Next 3 Days)
                </p>
                {selectedAreaDemand.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No medical sales data captured yet for this area.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedAreaDemand.map((item, index) => (
                      <div key={`${item.medicine}-${index}`} className="flex items-center justify-between text-sm">
                        <span className="font-medium text-slate-800">{item.medicine}</span>
                        <span className="font-bold text-emerald-700">{item.expectedUnitsNext3Days} units</span>
                      </div>
                    ))}
                  </div>
                )}
              </article>

              <article className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Price Comparison &amp; Overpricing
                </p>
                {selectedAreaPriceAnomalies.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No overpricing flagged for selected area.</p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {selectedAreaPriceAnomalies.map((item, index) => (
                      <div
                        key={`${item.reportId || index}-${item.medicine}`}
                        className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-2 py-1.5 text-xs"
                      >
                        <p className="font-semibold text-emerald-900">
                          {item.medicine} - {item.workerId}
                        </p>
                        <p className="text-slate-600">
                          Private: ₹{item.privatePrice} | Janaushadhi: ₹
                          {item.janaushadhiReference || item.averageAreaPrice}
                        </p>
                        <p className="font-medium text-emerald-800">Overpriced by {item.overByPercent}%</p>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <article className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Supply Action</p>
                <p className="mt-1">
                  {selectedAreaDemand[0]
                    ? `Send ${selectedAreaDemand[0].expectedUnitsNext3Days} units of ${selectedAreaDemand[0].medicine}.`
                    : "Collect medical inventory for precise dispatch."}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Spread Watch</p>
                <p className="mt-1">
                  {nearbyZoneRisk.length
                    ? `${nearbyZoneRisk[0].village} nearby has risk score ${nearbyZoneRisk[0].riskScore}.`
                    : "No nearby high-risk area in same district right now."}
                </p>
              </article>
              <article className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Data Integrity</p>
                <p className="mt-1">
                  {aiInsights.mismatchReports.length
                    ? `${aiInsights.mismatchReports.length} high mismatch reports need review.`
                    : "No major ASHA-MEDICAL mismatch detected."}
                </p>
              </article>
            </div>
          </section>
        ) : null}

        <DailyTrendChart data={dailyTrend} />
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900">Outbreak Prediction</h2>
        {isLoadingPrediction ? <p className="text-sm text-slate-500">Loading prediction...</p> : null}
        {predictionError ? <p className="text-sm text-slate-700">{predictionError}</p> : null}
        {!isLoadingPrediction && !predictionError && prediction ? (
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">Risk Level</p>
              <p className="mt-1 text-lg font-bold text-emerald-900">{prediction.risk_level}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">Outbreak Status</p>
              <p className="mt-1 text-lg font-bold text-emerald-900">{prediction.outbreak_status}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">Current Cases</p>
              <p className="mt-1 text-lg font-bold text-emerald-900">{prediction.cases?.current ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold text-slate-500">Confidence</p>
              <p className="mt-1 text-lg font-bold text-emerald-900">
                {Math.round((prediction.confidence_score || 0) * 100)}%
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
