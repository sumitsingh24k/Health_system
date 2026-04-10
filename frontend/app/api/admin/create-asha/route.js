import bcrypt from "bcrypt";
import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { requireAdmin } from "@/app/lib/auth/requireAdmin";
import { buildLocation } from "@/app/lib/location-utils";

async function generateWorkerId() {
  const ashaUsers = await User.find({
    role: "ASHA",
    workerId: { $regex: /^ASHA_\d+$/ },
  })
    .select("workerId")
    .lean();

  const maxNumber = ashaUsers.reduce((max, item) => {
    const current = Number.parseInt((item.workerId || "").split("_")[1], 10);
    return Number.isFinite(current) && current > max ? current : max;
  }, 0);

  return `ASHA_${String(maxNumber + 1).padStart(3, "0")}`;
}

export async function POST(request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  try {
    const body = await request.json();
    const { name, email, password, location } = body || {};

    if (!name || !email || !password) {
      return Response.json(
        { message: "name, email, and password are required" },
        { status: 400 }
      );
    }

    const { location: normalizedLocation, error: locationError } = buildLocation(location);
    if (locationError) {
      return Response.json({ message: locationError }, { status: 400 });
    }

    await dbConnect();

    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail }).select("_id");

    if (existingUser) {
      return Response.json({ message: "Email already exists" }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    let user = null;
    let attempt = 0;

    while (!user && attempt < 5) {
      attempt += 1;
      const workerId = await generateWorkerId();

      try {
        user = await User.create({
          name: name.trim(),
          email: normalizedEmail,
          password: hashedPassword,
          role: "ASHA",
          workerId,
          location: normalizedLocation,
          status: "APPROVED",
          createdBy: session.user.id,
        });
      } catch (createError) {
        const duplicateWorkerId =
          createError?.code === 11000 && createError?.keyPattern?.workerId;

        if (!duplicateWorkerId || attempt >= 5) {
          throw createError;
        }
      }
    }

    if (!user) {
      throw new Error("Could not allocate a unique ASHA workerId.");
    }

    return Response.json(
      {
        message: "ASHA worker created",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          workerId: user.workerId,
          location: user.location,
          status: user.status,
          createdBy: user.createdBy,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to create ASHA worker", error: reason },
      { status: 500 }
    );
  }
}
