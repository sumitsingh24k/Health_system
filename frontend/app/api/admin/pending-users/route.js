import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { requireAdmin } from "@/app/lib/auth/requireAdmin";
import { logServerError } from "@/app/lib/server-log";

function serializeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    location: user.location || null,
    createdAt: user.createdAt,
  };
}

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await dbConnect();

    const users = await User.find({
      role: { $in: ["HOSPITAL", "MEDICAL"] },
      status: "PENDING",
    })
      .sort({ createdAt: -1 })
      .lean();

    return Response.json({
      count: users.length,
      data: users.map(serializeUser),
    });
  } catch (error) {
    logServerError("api/admin/pending-users", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to fetch pending users", error: reason },
      { status: 500 }
    );
  }
}
