"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Home,
  User,
  Settings,
  LogOut,
  LogIn,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Bell,
  Search,
  HelpCircle,
  Building2,
  Stethoscope,
} from "lucide-react";

interface NavigationItem {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  badge?: string;
}

export interface SidebarProps {
  className?: string;
  children?: React.ReactNode;
  user?: {
    name?: string | null;
    email?: string | null;
    role?: string | null;
  };
}

function navigationForUser(role: string | undefined | null): NavigationItem[] {
  if (!role) {
    return [
      { id: "portal", name: "Portal home", icon: Home, href: "/" },
      { id: "login", name: "Login", icon: User, href: "/login" },
      {
        id: "medical",
        name: "Medical register",
        icon: Stethoscope,
        href: "/register/medical",
      },
      {
        id: "hospital",
        name: "Hospital register",
        icon: Building2,
        href: "/register/hospital",
      },
    ];
  }

  if (role === "ADMIN") {
    return [
      { id: "dashboard", name: "Dashboard", icon: Home, href: "/admin" },
      { id: "workspace", name: "Workspace", icon: BarChart3, href: "/workspace" },
      {
        id: "notifications",
        name: "Notifications",
        icon: Bell,
        href: "/admin/notifications",
      },
      { id: "profile", name: "Profile", icon: User, href: "/admin/profile" },
      { id: "settings", name: "Settings", icon: Settings, href: "/admin/settings" },
      { id: "help", name: "Help & Support", icon: HelpCircle, href: "/" },
    ];
  }

  return [
    { id: "portal", name: "Portal home", icon: Home, href: "/" },
    { id: "workspace", name: "Workspace", icon: BarChart3, href: "/workspace" },
    { id: "help", name: "Help & Support", icon: HelpCircle, href: "/" },
  ];
}

function initialsFromName(name: string | null | undefined) {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Sidebar({ className = "", children, user }: SidebarProps) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setIsOpen(true);
      } else {
        setIsOpen(false);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsOpen(!isOpen);
  const toggleCollapse = () => setIsCollapsed(!isCollapsed);

  const role = user?.role ?? undefined;
  const navigationItems = navigationForUser(role);
  const headerSubtitle = !role
    ? "Portal access"
    : role === "ADMIN"
      ? "Admin console"
      : "Operations";

  const displayName = user?.name || "Guest";
  const subtitle = user?.email || (role ? role.replace(/_/g, " ") : "Not signed in");

  const isActiveHref = (href: string) => {
    if (href === "/") return pathname === "/";
    if (href === "/admin") return pathname === "/admin" || pathname === "/admin/";
    if (href === "/login") return pathname === "/login";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <div className="flex min-h-screen w-full bg-slate-50 md:h-screen md:overflow-hidden">
      <button
        type="button"
        onClick={toggleSidebar}
        className="fixed top-6 left-6 z-50 rounded-lg border border-slate-100 bg-white p-3 shadow-md transition-all duration-200 hover:bg-slate-50 md:hidden"
        aria-label="Toggle sidebar"
      >
        {isOpen ? (
          <X className="h-5 w-5 text-slate-600" />
        ) : (
          <Menu className="h-5 w-5 text-slate-600" />
        )}
      </button>

      {isOpen && (
        <button
          type="button"
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm transition-opacity duration-300 md:hidden"
          onClick={toggleSidebar}
        />
      )}

      <div
        className={`
          fixed top-0 left-0 z-40 flex h-full shrink-0 flex-col border-r border-slate-200 bg-white transition-all duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          ${isCollapsed ? "w-20" : "w-72"}
          md:sticky md:top-0 md:z-auto md:translate-x-0
          ${className}
        `}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-emerald-50/50 p-5">
          {!isCollapsed && (
            <div className="flex items-center space-x-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 shadow-sm">
                <span className="text-base font-bold text-white">H</span>
              </div>
              <div className="flex flex-col">
                <span className="text-base font-semibold text-slate-800">Health System</span>
                <span className="text-xs text-slate-500">{headerSubtitle}</span>
              </div>
            </div>
          )}

          {isCollapsed && (
            <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600 shadow-sm">
              <span className="text-base font-bold text-white">H</span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleCollapse}
            className="hidden rounded-md p-1.5 transition-all duration-200 hover:bg-slate-100 md:flex"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <ChevronRight className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronLeft className="h-4 w-4 text-slate-500" />
            )}
          </button>
        </div>

        {!isCollapsed && (
          <div className="px-4 py-3">
            <div className="relative">
              <Search className="absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 transform text-slate-400" />
              <input
                type="search"
                placeholder="Search..."
                className="w-full rounded-md border border-slate-200 bg-slate-50 py-2 pr-4 pl-9 text-sm placeholder-slate-400 transition-all duration-200 focus:border-transparent focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto px-3 py-2">
          <ul className="space-y-0.5">
            {navigationItems.map((item) => {
              const Icon = item.icon;
              const active = isActiveHref(item.href);

              return (
                <li key={item.id} className="relative">
                  <Link
                    href={item.href}
                    onClick={() => {
                      if (window.innerWidth < 768) setIsOpen(false);
                    }}
                    className={`
                      group flex w-full items-center rounded-md px-3 py-2.5 text-left transition-all duration-200
                      ${active ? "bg-emerald-50 text-emerald-800" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}
                      ${isCollapsed ? "justify-center px-2" : "space-x-2.5"}
                    `}
                    title={isCollapsed ? item.name : undefined}
                  >
                    <div className="flex min-w-[24px] items-center justify-center">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? "text-emerald-700" : "text-slate-500 group-hover:text-slate-700"
                        }`}
                      />
                    </div>

                    {!isCollapsed && (
                      <div className="flex w-full items-center justify-between">
                        <span className={`text-sm ${active ? "font-medium" : "font-normal"}`}>
                          {item.name}
                        </span>
                        {item.badge && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-xs font-medium ${
                              active
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                    )}

                    {isCollapsed && item.badge && (
                      <div className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-emerald-100">
                        <span className="text-[10px] font-medium text-emerald-800">
                          {parseInt(item.badge, 10) > 9 ? "9+" : item.badge}
                        </span>
                      </div>
                    )}

                    {isCollapsed && (
                      <div className="invisible absolute left-full z-50 ml-2 rounded bg-slate-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                        {item.name}
                        {item.badge && (
                          <span className="ml-1.5 rounded-full bg-slate-700 px-1 py-0.5 text-[10px]">
                            {item.badge}
                          </span>
                        )}
                        <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-slate-800" />
                      </div>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="mt-auto border-t border-slate-200">
          <div
            className={`border-b border-slate-200 bg-slate-50/30 ${isCollapsed ? "px-2 py-3" : "p-3"}`}
          >
            {!isCollapsed ? (
              <div className="flex items-center rounded-md bg-white px-3 py-2 transition-colors duration-200 hover:bg-slate-50">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200">
                  <span className="text-sm font-medium text-slate-700">
                    {initialsFromName(displayName)}
                  </span>
                </div>
                <div className="ml-2.5 min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800">{displayName}</p>
                  <p className="truncate text-xs text-slate-500">{subtitle}</p>
                </div>
                {user && (
                  <div className="ml-2 h-2 w-2 rounded-full bg-emerald-500" title="Online" />
                )}
              </div>
            ) : (
              <div className="flex justify-center">
                <div className="relative">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200">
                    <span className="text-sm font-medium text-slate-700">
                      {initialsFromName(displayName)}
                    </span>
                  </div>
                  {user && (
                    <div className="absolute -right-1 -bottom-1 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="p-3">
            {user ? (
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/login" })}
                className={`
                  group relative flex w-full items-center rounded-md text-left transition-all duration-200
                  text-red-600 hover:bg-red-50 hover:text-red-700
                  ${isCollapsed ? "justify-center p-2.5" : "space-x-2.5 px-3 py-2.5"}
                `}
                title={isCollapsed ? "Logout" : undefined}
              >
                <div className="flex min-w-[24px] items-center justify-center">
                  <LogOut className="h-4 w-4 shrink-0 text-red-500 group-hover:text-red-600" />
                </div>

                {!isCollapsed && <span className="text-sm">Logout</span>}

                {isCollapsed && (
                  <div className="invisible absolute left-full z-50 ml-2 rounded bg-slate-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                    Logout
                    <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-slate-800" />
                  </div>
                )}
              </button>
            ) : (
              <Link
                href="/login"
                onClick={() => {
                  if (window.innerWidth < 768) setIsOpen(false);
                }}
                className={`
                  group relative flex w-full items-center rounded-md text-left transition-all duration-200
                  text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800
                  ${isCollapsed ? "justify-center p-2.5" : "space-x-2.5 px-3 py-2.5"}
                `}
                title={isCollapsed ? "Sign in" : undefined}
              >
                <div className="flex min-w-[24px] items-center justify-center">
                  <LogIn className="h-4 w-4 shrink-0 text-emerald-600 group-hover:text-emerald-700" />
                </div>
                {!isCollapsed && <span className="text-sm font-medium">Sign in</span>}
                {isCollapsed && (
                  <div className="invisible absolute left-full z-50 ml-2 rounded bg-slate-800 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 transition-all duration-200 group-hover:visible group-hover:opacity-100">
                    Sign in
                    <div className="absolute top-1/2 left-0 h-1.5 w-1.5 -translate-x-1 -translate-y-1/2 rotate-45 bg-slate-800" />
                  </div>
                )}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="min-w-0 flex-1 pt-20 md:h-screen md:overflow-y-auto md:pt-0">
        {children}
      </div>
    </div>
  );
}
