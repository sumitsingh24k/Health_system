import dbConnect from "@/app/lib/dbconnect";
import User from "@/app/lib/schema/userschema";
import { requireAdmin } from "@/app/lib/auth/requireAdmin";
import { buildLocation } from "@/app/lib/location-utils";
import { hashPassword } from "@/app/lib/auth/password-utils";
import { parseJsonBody, normalizeEmail, normalizeRequiredString } from "@/app/lib/request-utils";
import { logServerError } from "@/app/lib/server-log";

async function generateWorkerId() {
  const [latest] = await User.aggregate([
    {
      $match: {
        role: "ASHA",
        workerId: { $type: "string" },
      },
    },
    {
      $addFields: {
        workerSequence: {
          $cond: [
            { $regexMatch: { input: "$workerId", regex: /^ASHA_\d+$/ } },
            {
              $toInt: {
                $arrayElemAt: [{ $split: ["$workerId", "_"] }, 1],
              },
            },
            null,
          ],
        },
      },
    },
    { $match: { workerSequence: { $ne: null } } },
    { $sort: { workerSequence: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, workerSequence: 1 } },
  ]);

  const nextNumber =
    Number.isInteger(latest?.workerSequence) && latest.workerSequence > 0
      ? latest.workerSequence + 1
      : 1;

  return `ASHA_${String(nextNumber).padStart(3, "0")}`;
}

export async function POST(request) {
  const { session, error } = await requireAdmin();
  if (error) return error;

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
    let user = null;
    let attempt = 0;

    while (!user && attempt < 5) {
      attempt += 1;
      const workerId = await generateWorkerId();

      try {
        user = await User.create({
          name,
          email,
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
    logServerError("api/admin/create-asha", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to create ASHA worker", error: reason },
      { status: 500 }
    );
  }
}
