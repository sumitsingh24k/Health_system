"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useToast } from "@/app/components/toast-provider";
import Button from "@/app/components/ui/button";

export default function LoginForm({ callbackUrl = "/" }) {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  async function handleSubmit(event) {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const result = await signIn("credentials", {
        username,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        toast.error("Login failed", result.error);
        return;
      }

      toast.success("Login successful", "Redirecting to your workspace");
      router.push(result?.url || callbackUrl);
    } catch (_error) {
      toast.error("Login failed", "Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md space-y-5 rounded-3xl border border-white/70 bg-white/90 p-7 shadow-xl backdrop-blur"
    >
      <div>
        <p className="mb-2 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold tracking-wide text-emerald-700">
          SECURE ACCESS
        </p>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm font-medium text-slate-700">Health System</p>
        <p className="mt-2 text-sm text-slate-600">Use your approved account credentials.</p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Login ID</span>
        <input
          type="text"
          placeholder="admin / ASHA_001 / your email"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none ring-emerald-200 transition focus:border-emerald-500 focus:ring"
          required
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">Password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none ring-emerald-200 transition focus:border-emerald-500 focus:ring"
          required
        />
      </label>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? "Signing in..." : "Sign in"}
      </Button>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
        <p className="font-semibold text-slate-800">Need a new account?</p>
        <p className="mt-1 text-slate-500">
          Use one login page for all: Admin uses `ADMIN_USERNAME`, ASHA can use `workerId`, and
          Hospital/Medical can use email.
        </p>
        <div className="mt-1 flex flex-wrap gap-3">
          <Link href="/register/hospital" className="font-semibold text-emerald-700 hover:text-emerald-600">
            Hospital Register
          </Link>
          <Link href="/register/medical" className="font-semibold text-emerald-700 hover:text-emerald-600">
            Medical Register
          </Link>
        </div>
      </div>
    </form>
  );
}
