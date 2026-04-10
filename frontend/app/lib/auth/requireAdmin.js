import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";

export async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "ADMIN") {
    return {
      session: null,
      error: Response.json({ message: "Unauthorized" }, { status: 401 }),
    };
  }

  return { session, error: null };
}
