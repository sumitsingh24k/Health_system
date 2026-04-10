import Link from "next/link";
import { Activity, Building2, ShieldCheck, Stethoscope, UserCheck } from "lucide-react";
import { HeroDemo } from "@/components/ui/demo";
import { Button } from "@/components/ui/button";

const portalCards = [
  {
    title: "ASHA Worker",
    description: "Submit field reports and keep village-level surveillance active.",
    href: "/login",
    action: "ASHA sign in",
    icon: UserCheck,
  },
  {
    title: "Medical",
    description: "Track local disease reports and align medicine readiness.",
    href: "/register/medical",
    action: "Medical Register",
    icon: Stethoscope,
  },
  {
    title: "Hospital",
    description: "Monitor area case trends and prepare treatment operations.",
    href: "/register/hospital",
    action: "Hospital Register",
    icon: Building2,
  },
  {
    title: "Admin",
    description: "Access workspace controls and supervise outbreak operations.",
    href: "/login?callbackUrl=/admin",
    action: "Admin sign in",
    icon: ShieldCheck,
  },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dcfce7_0%,#f8fafc_42%,#edf7f1_100%)]">
      <header className="sticky top-0 z-40 border-b border-emerald-100/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-emerald-600 p-2 text-white">
              <Activity className="h-5 w-5" />
            </span>
            <p className="text-lg font-semibold text-slate-900">Health System Portal</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary">
              <Link href="/workspace">Open Workspace</Link>
            </Button>
            <Button asChild>
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <HeroDemo />
      <section className="mx-auto w-full max-w-6xl px-6 pb-16">
        <p className="mb-8 text-sm text-slate-600">
          Continue to role-specific flows without losing existing functionality.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {portalCards.map((card) => {
            const Icon = card.icon;
            return (
              <article
                key={card.title}
                className="flex h-full flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div>
                  <span className="mb-4 inline-flex rounded-xl bg-emerald-100 p-2 text-emerald-700">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{card.description}</p>
                </div>
                <Button asChild variant="ghost" className="mt-5 justify-start px-0 text-emerald-700">
                  <Link href={card.href}>{card.action}</Link>
                </Button>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
