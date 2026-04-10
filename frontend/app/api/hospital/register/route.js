import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { buildLocation } from "@/app/lib/location-utils";
import { hashPassword } from "@/app/lib/auth/password-utils";
import { parseJsonBody, normalizeEmail, normalizeRequiredString } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";

export async function POST(request) {
  try {
    const { body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const name = normalizeRequiredString(body?.name);
    const email = normalizeEmail(body?.email);
    const password = normalizeRequiredString(body?.password);
    const { location } = body || {};

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

    const existingUser = await User.findOne({ email }).select("_id");

    if (existingUser) {
      return Response.json({ message: "Email already exists" }, { status: 409 });
    }

    const hashedPassword = await hashPassword(password, 10);

    const user = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "HOSPITAL",
      location: normalizedLocation,
      status: "PENDING",
    });

    return Response.json(
      {
        message: "Hospital registration submitted for approval",
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          location: user.location,
          status: user.status,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/hospital/register", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to register hospital", error: reason },
      { status: 500 }
    );
  }
}
