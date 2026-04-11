"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "unauthenticated" || status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <p className="text-sm text-slate-600">Redirecting…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-6 text-center">
      <h1 className="text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="max-w-md text-sm text-slate-600">
        This URL does not exist. Use the sidebar or go back to your workspace.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
          <Link href="/workspace">Workspace</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
        <Button variant="outline" type="button" onClick={() => router.push("/login")}>
          Sign in as another user
        </Button>
      </div>
    </main>
  );
}
