import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV !== "production"
    ? "dev-only-secret-change-before-production"
    : undefined);

function isPublicPath(pathname) {
  if (pathname === "/") return true;
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/register" || pathname.startsWith("/register/")) return true;
  return false;
}

function loginRedirectUrl(request, pathname) {
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  const safeReturn =
    pathname.startsWith("/") && !pathname.startsWith("//")
      ? `${pathname}${request.nextUrl.search || ""}`
      : "/workspace";
  url.searchParams.set("callbackUrl", safeReturn);
  return url;
}

const STATIC_FILE = /\.(ico|png|jpg|jpeg|gif|svg|webp|txt|xml|json|webmanifest|woff2?)$/i;

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/admin")) {
    const token = await getToken({ req: request, secret: NEXTAUTH_SECRET });
    if (!token || token.role !== "ADMIN") {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/api") || pathname.startsWith("/_next")) {
    return NextResponse.next();
  }

  if (pathname === "/robots.txt" || pathname === "/sitemap.xml") {
    return NextResponse.next();
  }

  if (STATIC_FILE.test(pathname)) {
    return NextResponse.next();
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: NEXTAUTH_SECRET });

  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdmin) {
    if (!token) {
      return NextResponse.redirect(loginRedirectUrl(request, pathname));
    }
    if (token.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/workspace", request.url));
    }
    return NextResponse.next();
  }

  if (!token) {
    return NextResponse.redirect(loginRedirectUrl(request, pathname));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/admin/:path*",
    "/((?!api|_next/static|_next/image|favicon.ico).*)",
  ],
};
