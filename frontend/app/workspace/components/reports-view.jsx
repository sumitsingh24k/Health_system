"use client";

import { CheckCircle2, Crosshair } from "lucide-react";
import MultilingualVoiceInput from "@/app/components/voice/multilingual-voice-input";
import { useWorkspace } from "@/app/workspace/workspace-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspacePageHeader } from "@/app/workspace/components/workspace-ui";

export function ReportsView() {
  const {
    user,
    canSubmitReports,
    canSeePendingApprovals,
    scopedReports,
    reportForm,
    setReportForm,
    handleSubmitReport,
    isSubmittingReport,
    captureCurrentLocation,
    pendingUsers,
    isLoadingPending,
    loadPendingUsers,
    handleApproveUser,
    approvingUserId,
  } = useWorkspace();

  return (
    <>
      <section className="rounded-3xl border border-white/70 bg-white/80 p-5 shadow-xl backdrop-blur md:p-7">
        <WorkspacePageHeader title="Reports" />
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Reports</h1>
        <p className="mt-1 text-sm text-slate-600">
          Review recent submissions and file new field reports when your role allows.
        </p>
      </section>

      {canSeePendingApprovals ? (
        <section
          id="pending-approvals"
          className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900">Pending Hospital/Medical Approvals</h2>
            <Button type="button" variant="outline" size="sm" onClick={loadPendingUsers}>
              Refresh
            </Button>
          </div>

          {isLoadingPending ? <p className="text-sm text-slate-500">Loading pending users...</p> : null}

          {!isLoadingPending && pendingUsers.length === 0 ? (
            <p className="text-sm text-slate-500">No pending users right now.</p>
          ) : null}

          <div className="space-y-3">
            {pendingUsers.map((pending) => (
              <div
                key={pending.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="font-semibold text-slate-900">{pending.name}</p>
                  <p className="text-xs text-slate-600">
                    {pending.role} - {pending.email}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pending.location?.village}, {pending.location?.district}
                  </p>
                </div>

                <Button
                  type="button"
                  onClick={() => handleApproveUser(pending.id, pending.role)}
                  disabled={approvingUserId === pending.id}
                  className="bg-emerald-600 hover:bg-emerald-500"
                >
                  <CheckCircle2 size={15} />
                  {approvingUserId === pending.id ? "Approving..." : "Approve"}
                </Button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {canSubmitReports ? (
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="mb-1 text-lg font-bold text-slate-900">{user.role} Field Report</h2>
          <p className="mb-3 text-sm text-slate-600">
            Submit multilingual disease updates with voice or typing. Report is plotted on the map
            instantly for your location.
          </p>
          <form onSubmit={handleSubmitReport} className="grid gap-3 md:grid-cols-2">
            <MultilingualVoiceInput
              title="Disease Voice Capture"
              description="Speak disease type in your language"
              onTranscript={(text) =>
                setReportForm((current) => ({ ...current, disease: text.toUpperCase() }))
              }
              className="md:col-span-2"
            />

            <Input
              placeholder="Disease (e.g. DENGUE)"
              value={reportForm.disease}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, disease: event.target.value }))
              }
              className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
              required
            />
            <Input
              type="number"
              min="0"
              placeholder="Households Visited"
              value={reportForm.householdsVisited}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, householdsVisited: event.target.value }))
              }
              className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
              required
            />
            <Input
              type="number"
              min="0"
              placeholder="New Cases"
              value={reportForm.newCases}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, newCases: event.target.value }))
              }
              className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
              required
            />
            <Input
              type="number"
              min="0"
              placeholder="Critical Cases"
              value={reportForm.criticalCases}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, criticalCases: event.target.value }))
              }
              className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
              required
            />
            <Input
              type="number"
              step="any"
              placeholder="Latitude"
              value={reportForm.latitude}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, latitude: event.target.value }))
              }
              className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
              required
            />
            <Input
              type="number"
              step="any"
              placeholder="Longitude"
              value={reportForm.longitude}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, longitude: event.target.value }))
              }
              className="border-slate-300 ring-emerald-200 focus-visible:border-emerald-500 focus-visible:ring-emerald-200"
              required
            />

            {user.role === "MEDICAL" ? (
              <textarea
                placeholder="Medicine Sales (one per line): Paracetamol,120,12,8"
                value={reportForm.medicineSalesText}
                onChange={(event) =>
                  setReportForm((current) => ({ ...current, medicineSalesText: event.target.value }))
                }
                className="min-h-[90px] rounded-xl border border-emerald-300 bg-emerald-50/40 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring md:col-span-2"
              />
            ) : null}

            <MultilingualVoiceInput
              title="Whisper Notes"
              description="Speak field notes in any selected language"
              onTranscript={(text) =>
                setReportForm((current) => ({
                  ...current,
                  notes: current.notes ? `${current.notes} ${text}` : text,
                }))
              }
              className="md:col-span-2"
            />

            <textarea
              placeholder="Whisper / Field Notes (optional)"
              value={reportForm.notes}
              onChange={(event) =>
                setReportForm((current) => ({ ...current, notes: event.target.value }))
              }
              className="min-h-[90px] rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring md:col-span-2"
            />
            <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
              <Button type="button" variant="outline" onClick={captureCurrentLocation}>
                <Crosshair size={15} />
                Use Current GPS
              </Button>
              <Button
                type="submit"
                disabled={isSubmittingReport}
                className="bg-emerald-700 text-white hover:bg-emerald-600"
              >
                {isSubmittingReport ? "Submitting..." : "Submit Report"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <h2 className="mb-3 text-lg font-bold text-slate-900">Recent Reports</h2>
        {scopedReports.length === 0 ? (
          <p className="text-sm text-slate-500">No reports available yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Disease</th>
                  <th className="px-3 py-2">Area</th>
                  <th className="px-3 py-2">New</th>
                  <th className="px-3 py-2">Critical</th>
                  <th className="px-3 py-2">Worker</th>
                  <th className="px-3 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {scopedReports.slice(0, 15).map((report) => (
                  <tr key={report.id} className="border-b border-slate-100 text-slate-700">
                    <td className="px-3 py-2">{report.reporterRole || "ASHA"}</td>
                    <td className="px-3 py-2 font-medium text-slate-900">{report.disease}</td>
                    <td className="px-3 py-2">
                      {report.location?.village}, {report.location?.district}
                    </td>
                    <td className="px-3 py-2">{report.newCases}</td>
                    <td className="px-3 py-2">{report.criticalCases}</td>
                    <td className="px-3 py-2">{report.workerId}</td>
                    <td className="px-3 py-2">
                      {new Date(report.reportDate || report.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
