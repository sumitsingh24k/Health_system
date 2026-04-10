import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Hospital,
  MapPin,
  Pill,
  ShieldCheck,
  Users,
} from "lucide-react";

const roles = [
  {
    title: "ASHA Worker",
    description: "Submit local household health updates from assigned village and district.",
    icon: Users,
    accent: "from-rose-500/20 to-rose-100",
    href: "/login",
    actionLabel: "ASHA Login",
  },
  {
    title: "Medical",
    description: "Monitor same-location reports to verify medicine demand and community risk.",
    icon: Pill,
    accent: "from-emerald-500/20 to-emerald-100",
    href: "/register/medical",
    actionLabel: "Medical Register",
  },
  {
    title: "Hospital",
    description: "Track area-specific case movement and coordinate treatment readiness.",
    icon: Hospital,
    accent: "from-sky-500/20 to-sky-100",
    href: "/register/hospital",
    actionLabel: "Hospital Register",
  },
  {
    title: "Admin",
    description: "Approve registrations, create ASHA accounts, and supervise regional activity.",
    icon: ShieldCheck,
    accent: "from-amber-500/20 to-amber-100",
    href: "/login",
    actionLabel: "Admin Login",
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden selection:bg-sky-200/60">
      <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_38%,#edf2f7_100%)]" />
      <div className="absolute -left-12 top-24 -z-10 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl" />
      <div className="absolute -right-12 bottom-16 -z-10 h-72 w-72 rounded-full bg-cyan-200/40 blur-3xl" />

      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-sky-600 p-2 text-white shadow-lg shadow-sky-600/20">
            <Activity size={22} />
          </div>
          <p className="text-2xl font-extrabold tracking-tight text-slate-900">
            Health<span className="text-sky-600">System</span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/workspace"
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Workspace
          </Link>
          <Link
            href="/login"
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-600"
          >
            Login
          </Link>
        </div>
      </nav>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 pb-16 pt-8">
        <section className="rounded-[2rem] border border-white/70 bg-white/80 p-8 shadow-xl shadow-slate-200/60 backdrop-blur md:p-12">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold tracking-wide text-sky-700">
            <span className="h-2 w-2 rounded-full bg-sky-600" />
            LOCATION-FIRST HEALTH MONITORING
          </p>

          <h1 className="max-w-4xl text-4xl font-black leading-tight tracking-tight text-slate-900 md:text-6xl">
            One connected system for ASHA, medical teams, hospitals, and admin response.
          </h1>

          <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-600 md:text-lg">
            Capture community health signals at source, verify data across departments, and take
            faster district-level action through secure role-based access.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-sky-600"
            >
              Access Portal
              <ArrowRight size={16} />
            </Link>
            <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-600">
              <MapPin size={16} className="text-sky-600" />
              Area-based permissions enabled
            </span>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {roles.map((role) => {
            const Icon = role.icon;
            return (
              <article
                key={role.title}
                className="group rounded-3xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-slate-900 ${role.accent}`}
                >
                  <Icon size={22} />
                </div>
                <h2 className="mb-2 text-xl font-bold text-slate-900">{role.title}</h2>
                <p className="text-sm leading-relaxed text-slate-600">{role.description}</p>
                <Link
                  href={role.href}
                  className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 transition group-hover:text-sky-600"
                >
                  {role.actionLabel}
                  <ArrowRight size={15} />
                </Link>
              </article>
            );
          })}
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-slate-900 p-8 text-white md:p-10">
          <h3 className="text-2xl font-bold">How your flow works</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-300 md:text-base">
            Admin creates ASHA users. Hospital and Medical register and wait for approval. ASHA
            submits field reports. Hospital and Medical read only matching location data.
          </p>
        </section>
      </main>
    </div>
  );
}
