import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import { logServerError } from "@/app/lib/server-log";
import { parseJsonBody } from "@/app/lib/request-utils";

// ============ PHASE 5: SUPPLY CHAIN DATABASE SCHEMA ============
// Define Mongoose models for supply orders (in-memory for now, can be migrated to MongoDB)

const ALLOWED_ROLES = ["ADMIN", "HOSPITAL", "MEDICAL"];
const ORDER_STATUSES = ["REQUESTED", "APPROVED", "IN_TRANSIT", "DELIVERED", "CANCELLED"];
const URGENCY_LEVELS = ["NORMAL", "HIGH", "CRITICAL"];

// In-memory storage for supply orders (replace with MongoDB later)
let supplyOrders = [];

/**
 * Calculate great-circle distance between two GPS coordinates (Haversine formula)
 * Returns distance in kilometers
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimate delivery time in hours based on distance
 * Assumes 60 km/hour average speed including loading/unloading
 */
function estimateDeliveryHours(distanceKm) {
  const speedKmPerHour = 60;
  const baseTime = 0.5; // 30 min fixed overhead
  return Math.ceil((distanceKm / speedKmPerHour + baseTime) * 10) / 10;
}

/**
 * PHASE 5: Suggest optimal supply source for a given demand
 * Considers distance, current stock, and cost
 */
function suggestSupplyRoute(targetZone, demand, availableInventory) {
  // For now, use simple nearest-neighbor + stock availability
  // In production, integrate with actual pharmacy database
  
  const candidates = availableInventory
    .filter((inv) => inv.available >= demand.quantity)
    .map((inv) => {
      const distance = calculateDistance(
        targetZone.latitude,
        targetZone.longitude,
        inv.latitude,
        inv.longitude
      );
      return {
        ...inv,
        distance,
        estimatedDeliveryHours: estimateDeliveryHours(distance),
        cost: distance * 5 + demand.quantity * 0.1, // Simple cost model
      };
    })
    .sort((a, b) => a.cost - b.cost);

  if (candidates.length === 0) {
    return null; // No suitable supply found
  }

  const selected = candidates[0];
  return {
    sourcePharmacyId: selected.pharmacyId,
    sourceLocation: {
      name: selected.pharmacyName,
      latitude: selected.latitude,
      longitude: selected.longitude,
      district: selected.district,
      village: selected.village,
    },
    destinationZone: targetZone,
    distanceKm: Math.round(selected.distance * 100) / 100,
    estimatedDeliveryHours: selected.estimatedDeliveryHours,
    estimatedArrival: new Date(Date.now() + selected.estimatedDeliveryHours * 60 * 60 * 1000),
    confidenceScore: 0.85, // How confident are we in this route?
  };
}

/**
 * Validate supply order request
 */
function validateSupplyOrder(body) {
  const errors = [];

  if (!body.targetDistrict || !body.targetVillage) {
    errors.push("targetDistrict and targetVillage are required");
  }
  if (!body.medicine) {
    errors.push("medicine name is required");
  }
  if (!Number.isFinite(body.quantity) || body.quantity < 1 || body.quantity > 100000) {
    errors.push("quantity must be a positive integer between 1 and 100000");
  }
  if (body.urgency && !URGENCY_LEVELS.includes(body.urgency)) {
    errors.push(`urgency must be one of: ${URGENCY_LEVELS.join(", ")}`);
  }

  return { valid: errors.length === 0, errors };
}

// ============ SUPPLY CHAIN API ENDPOINTS ============

/**
 * POST /api/supply/orders
 * Create a new supply order
 */
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    return Response.json(
      { message: "Only Admin, Hospital, and Medical can create supply orders" },
      { status: 401 }
    );
  }

  try {
    const { body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    // Validate request
    const validation = validateSupplyOrder(body);
    if (!validation.valid) {
      return Response.json(
        { message: "Invalid supply order", errors: validation.errors },
        { status: 400 }
      );
    }

    await dbConnect();

    // Create order
    const order = {
      _id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      requesterRole: session.user.role,
      requesterId: session.user.id,
      requesterLocation: session.user.location,
      targetDistrict: body.targetDistrict,
      targetVillage: body.targetVillage,
      targetLatitude: body.targetLatitude,
      targetLongitude: body.targetLongitude,
      medicine: body.medicine,
      quantity: body.quantity,
      urgency: body.urgency || "NORMAL",
      status: "REQUESTED",
      createdAt: new Date(),
      estimatedDelivery: null,
      sourcePharmacy: null,
      notes: body.notes || "",
    };

    // TODO: Calculate supply route (integrate with pharmacy inventory DB)
    // For now, mark as pending route calculation
    order.routeStatus = "PENDING_CALCULATION";

    // Store order (in-memory for now)
    supplyOrders.push(order);

    return Response.json(
      {
        message: "Supply order created successfully",
        data: order,
      },
      { status: 201 }
    );
  } catch (error) {
    logServerError("api/supply/post", error);
    const reason = error instanceof Error ? error.message : "Unknown server error";
    return Response.json(
      { message: "Failed to create supply order", error: reason },
      { status: 500 }
    );
  }
}

/**
 * GET /api/supply/orders
 * List supply orders (filtered by user role)
 */
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session || !ALLOWED_ROLES.includes(session.user.role)) {
    return Response.json(
      { message: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    await dbConnect();

    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const role = session.user.role;

    // Filter orders based on role
    let filtered = supplyOrders;

    if (role === "HOSPITAL" || role === "MEDICAL") {
      // Users see only their own orders
      filtered = filtered.filter(
        (order) => order.requesterId === session.user.id
      );
    }
    // ADMIN sees all

    if (status && ORDER_STATUSES.includes(status)) {
      filtered = filtered.filter((order) => order.status === status);
    }

    const orders = filtered
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);

    return Response.json(
      {
        count: orders.length,
        data: orders,
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError("api/supply/get", error);
    return Response.json(
      { message: "Failed to fetch supply orders", error: error.message },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/supply/orders/[orderId]
 * Update order status (Admin only)
 */
export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return Response.json(
      { message: "Only Admin can update supply orders" },
      { status: 403 }
    );
  }

  try {
    const { body, error: parseError } = await parseJsonBody(request);
    if (parseError) return parseError;

    const orderId = body.orderId;
    const newStatus = body.status;

    if (!orderId || !newStatus || !ORDER_STATUSES.includes(newStatus)) {
      return Response.json(
        { message: "orderId and valid status are required" },
        { status: 400 }
      );
    }

    await dbConnect();

    const orderIndex = supplyOrders.findIndex((o) => o._id === orderId);
    if (orderIndex === -1) {
      return Response.json(
        { message: "Order not found" },
        { status: 404 }
      );
    }

    supplyOrders[orderIndex].status = newStatus;
    supplyOrders[orderIndex].updatedAt = new Date();

    return Response.json(
      {
        message: "Order updated",
        data: supplyOrders[orderIndex],
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError("api/supply/patch", error);
    return Response.json(
      { message: "Failed to update supply order", error: error.message },
      { status: 500 }
    );
  }
}
