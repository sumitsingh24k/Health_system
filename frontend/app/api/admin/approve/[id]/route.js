import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { requireAdmin } from "@/app/lib/auth/requireAdmin";

export async function POST(_request, { params }) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    await dbConnect();

    const { id } = await params;
    const user = await User.findById(id);

    if (!user) {
      return Response.json({ message: "User not found" }, { status: 404 });
    }

    if (user.role !== "HOSPITAL" && user.role !== "MEDICAL") {
      return Response.json(
        { message: "Only HOSPITAL or MEDICAL users can be approved here" },
        { status: 400 }
      );
    }

    user.status = "APPROVED";
    await user.save();

    return Response.json({
      message: "User approved successfully",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        location: user.location,
        status: user.status,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to approve user", error: reason },
      { status: 500 }
    );
  }
}
