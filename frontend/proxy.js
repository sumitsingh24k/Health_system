import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";

const NEXTAUTH_SECRET =
  process.env.NEXTAUTH_SECRET ||
  process.env.AUTH_SECRET ||
  (process.env.NODE_ENV !== "production"
    ? "dev-only-secret-change-before-production"
    : undefined);

export async function proxy(request) {
  const token = await getToken({
    req: request,
    secret: NEXTAUTH_SECRET,
  });

  if (!token || token.role !== "ADMIN") {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/admin/:path*"],
};
