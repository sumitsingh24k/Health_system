"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { Sidebar } from "@/components/ui/modern-side-bar";

function isPublicMarketingOrAuthPath(pathname: string) {
  if (pathname === "/") return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname.startsWith("/register")) return true;
  return false;
}

export default function ConditionalAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (isPublicMarketingOrAuthPath(pathname)) {
    return <>{children}</>;
  }

  const user = session?.user
    ? {
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }
    : undefined;

  return <Sidebar user={user}>{children}</Sidebar>;
}
