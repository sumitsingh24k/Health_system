"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import LoginForm from "@/app/login/login-form";

function LoginContent() {
  const searchParams = useSearchParams();
  const raw = searchParams.get("callbackUrl");
  const callbackUrl =
    typeof raw === "string" && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/workspace";

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-12">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_38%,#f1f5f9_100%)]" />
      <div className="absolute -left-20 -top-16 -z-10 h-64 w-64 rounded-full bg-sky-200/50 blur-3xl" />
      <div className="absolute -bottom-20 -right-12 -z-10 h-72 w-72 rounded-full bg-teal-200/40 blur-3xl" />
      <LoginForm callbackUrl={callbackUrl} />
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="relative flex min-h-screen items-center justify-center px-6 py-12">
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_38%,#f1f5f9_100%)]" />
          <p className="text-sm text-slate-600">Loading…</p>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
