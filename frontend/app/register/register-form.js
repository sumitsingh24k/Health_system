"use client";

import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/app/components/toast-provider";
import AreaSearchFields from "@/app/components/location/area-search-fields";
import { backendGet } from "@/app/lib/api-client";
import Button from "@/app/components/ui/button";

export default function RegisterForm({ title, roleLabel }) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    village: "",
    district: "",
    latitude: "",
    longitude: "",
  });

  async function onSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      await backendGet("/health", {}, "Backend is unavailable");

      toast.info(
        "Registration not supported in backend v1",
        "Please login with existing credentials. Worker/admin onboarding APIs are not yet available."
      );
      setForm({
        name: "",
        email: "",
        password: "",
        village: "",
        district: "",
        latitude: "",
        longitude: "",
      });
    } catch (error) {
      toast.error("Backend unavailable", error.message || "Please verify backend server status.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10 md:px-6">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,#dcfce7_0%,#f8fafc_42%,#e2efe8_100%)]" />
      <form
        onSubmit={onSubmit}
        className="w-full max-w-2xl space-y-4 rounded-3xl border border-white/70 bg-white/90 p-6 shadow-xl backdrop-blur md:p-8"
      >
        <p className="text-xs font-semibold tracking-[0.15em] text-emerald-700">{roleLabel} REGISTRATION</p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
        <p className="text-sm text-slate-600">
          Your account will stay pending until approved by admin.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <input
            placeholder="Full Name"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none ring-emerald-200 focus:border-emerald-500 focus:ring"
            required
          />

          <AreaSearchFields
            value={{
              village: form.village,
              district: form.district,
              latitude: form.latitude,
              longitude: form.longitude,
            }}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
            className="md:col-span-2"
          />
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full">
          {isSubmitting ? "Submitting..." : `Register ${roleLabel}`}
        </Button>

        <p className="text-center text-sm text-slate-600">
          Already approved?{" "}
          <Link href="/login" className="font-semibold text-emerald-700 hover:text-emerald-600">
            Login here
          </Link>
        </p>
      </form>
    </main>
  );
}
