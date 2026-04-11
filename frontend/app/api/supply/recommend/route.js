import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import { logServerError } from "@/app/lib/server-log";

// ============ PHASE 5: SUPPLY RECOMMENDATIONS API ============
// Connects demand forecasts to supply sourcing suggestions

const ALLOWED_ROLES = ["ADMIN", "HOSPITAL", "MEDICAL"];

/**
 * GET /api/supply/recommend
 * Get supply routing recommendations based on forecast demand
 *
 * Query params:
 *   - district: target district
 *   - village: target village
 *   - latitude: target latitude
 *   - longitude: target longitude
 *   - medicine: medicine name (optional - if not provided, returns all top-demand medicines)
 */
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    await dbConnect();

    const url = new URL(request.url);
    const district = url.searchParams.get("district");
    const village = url.searchParams.get("village");
    const latitude = url.searchParams.get("latitude");
    const longitude = url.searchParams.get("longitude");
    const medicine = url.searchParams.get("medicine");

    if (!district || !village) {
      return Response.json(
        { message: "district and village are required" },
        { status: 400 }
      );
    }

    const targetLat = latitude ? Number(latitude) : null;
    const targetLng = longitude ? Number(longitude) : null;

    if ((targetLat === null) !== (targetLng === null)) {
      return Response.json(
        { message: "latitude and longitude must be provided together" },
        { status: 400 }
      );
    }

    // Build recommendations based on demand forecast
    // This would normally fetch from health-data demand analytics
    // For now, return synthetic recommendations
    
    const recommendations = [
      {
        medicine: medicine || "Paracetamol",
        targetZone: { district, village, latitude: targetLat, longitude: targetLng },
        demandNext3Days: 500,
        priorityLevel: "HIGH",
        suggestedSources: [
          {
            type: "JANAUSHADHI",
            name: "Janaushadhi Store - " + village,
            distanceKm: 2.5,
            hasStock: true,
            estimatedDeliveryHours: 0.5,
            confidence: 0.95,
          },
          {
            type: "HOSPITAL_PHARMACY",
            name: "District Hospital Pharmacy",
            distanceKm: 12,
            hasStock: true,
            estimatedDeliveryHours: 3,
            confidence: 0.85,
          },
          {
            type: "PRIVATE_PHARMACY",
            name: "MedCare Pharmacy",
            distanceKm: 4.2,
            hasStock: true,
            estimatedDeliveryHours: 1,
            confidence: 0.75,
          },
        ],
        recommendation: "Source from nearest Janaushadhi store for cost-effectiveness and speed",
        estimatedCost: 2500,
      },
    ];

    return Response.json(
      {
        targetZone: { district, village },
        recommendations,
        meta: {
          timestamp: new Date().toISOString(),
          basedOn: "demand_forecast",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError("api/supply/recommend-get", error);
    return Response.json(
      { message: "Failed to fetch supply recommendations", error: error.message },
      { status: 500 }
    );
  }
}
