export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Admin dashboard</h1>
        <p className="mt-2 text-slate-600">
          Manage approvals, ASHA workers, and system oversight from this console. Use the sidebar to
          open workspace analytics, notifications, and account settings.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Quick actions
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Field operations and case intake live in the workspace. Use Analytics or Documents in
              the sidebar to jump there.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Status</p>
            <p className="mt-2 text-sm text-slate-600">
              You are signed in as an administrator. Sign out from the bottom of the sidebar.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
