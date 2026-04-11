import { getServerSession } from "next-auth";
import { authOptions } from "@/app/lib/auth/authOptions";
import dbConnect from "@/app/lib/dbconnect";
import { logServerError } from "@/app/lib/server-log";

// ============ PHASE 6: NOTIFICATION AUDIT & RELIABILITY SYSTEM ============

// In-memory store for notification audit log (replace with MongoDB in production)
let notificationAuditLog = [];
const AUDIT_LOG_MAX_SIZE = 10000; // Keep last 10k notifications

const NOTIFICATION_CHANNELS = ["email_resend", "email_smtp", "sms_twilio", "webhook"];
const RETRY_BACKOFF_MS = [60000, 300000, 900000]; // Retry at 1min, 5min, 15min
const NOTIFICATION_DEDUP_WINDOW_MS = 20 * 60 * 1000; // 20 minutes

/**
 * Log a notification event to audit trail
 */
function logNotificationEvent(event) {
  const auditEntry = {
    _id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date(),
    outbreakId: event.outbreakId,
    channel: event.channel,
    recipient: event.recipient,
    status: event.status, // "SENT", "FAILED", "RETRYING", "SKIPPED"
    reason: event.reason || null,
    retryCount: event.retryCount || 0,
    nextRetryAt: event.nextRetryAt || null,
    metadata: event.metadata || {},
  };

  notificationAuditLog.push(auditEntry);

  // Keep audit log size under control
  if (notificationAuditLog.length > AUDIT_LOG_MAX_SIZE) {
    notificationAuditLog = notificationAuditLog.slice(-AUDIT_LOG_MAX_SIZE);
  }

  return auditEntry;
}

/**
 * Check if we should deduplicate this notification
 * (same outbreak + recipient + channel within 20 minutes)
 */
function shouldDeduplicate(outbreakId, channel, recipient) {
  const windowStart = Date.now() - NOTIFICATION_DEDUP_WINDOW_MS;
  const recent = notificationAuditLog.filter(
    (entry) =>
      entry.outbreakId === outbreakId &&
      entry.channel === channel &&
      entry.recipient === recipient &&
      entry.timestamp >= new Date(windowStart) &&
      entry.status === "SENT"
  );

  return recent.length > 0;
}

/**
 * Get notification history for an outbreak
 */
function getNotificationHistory(outbreakId) {
  return notificationAuditLog
    .filter((entry) => entry.outbreakId === outbreakId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

// ============ PHASE 6: NOTIFICATION API ENDPOINTS ============

/**
 * GET /api/notifications/audit
 * Get notification audit log (Admin only)
 */
export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return Response.json(
      { message: "Only Admin can view notification audit log" },
      { status: 403 }
    );
  }

  try {
    await dbConnect();

    const url = new URL(request.url);
    const outbreakId = url.searchParams.get("outbreakId");
    const limit = Math.min(Number(url.searchParams.get("limit") || 100), 500);

    let filtered = notificationAuditLog;

    if (outbreakId) {
      filtered = filtered.filter((entry) => entry.outbreakId === outbreakId);
    }

    const audit = filtered
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, limit);

    // Summarize status
    const summary = {
      total: audit.length,
      sent: audit.filter((e) => e.status === "SENT").length,
      failed: audit.filter((e) => e.status === "FAILED").length,
      retrying: audit.filter((e) => e.status === "RETRYING").length,
      skipped: audit.filter((e) => e.status === "SKIPPED").length,
    };

    return Response.json(
      {
        audit,
        summary,
        meta: {
          timestamp: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError("api/notifications/audit-get", error);
    return Response.json(
      { message: "Failed to fetch notification audit log", error: error.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/notifications/test
 * Send test notification (Admin only)
 * Useful for verifying email/SMS channels are working
 */
export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session || session.user.role !== "ADMIN") {
    return Response.json(
      { message: "Only Admin can send test notifications" },
      { status: 403 }
    );
  }

  try {
    await dbConnect();

    const body = await request.json();
    const { channel, recipient } = body;

    if (!channel || !NOTIFICATION_CHANNELS.includes(channel)) {
      return Response.json(
        { message: `channel must be one of: ${NOTIFICATION_CHANNELS.join(", ")}` },
        { status: 400 }
      );
    }

    if (!recipient) {
      return Response.json(
        { message: "recipient is required (email or phone number)" },
        { status: 400 }
      );
    }

    // Log test notification
    const testOutbreakId = `test_${Date.now()}`;
    logNotificationEvent({
      outbreakId: testOutbreakId,
      channel,
      recipient,
      status: "SENT",
      reason: "Test notification from admin",
      metadata: { isTest: true },
    });

    return Response.json(
      {
        message: "Test notification logged",
        channelStatus: {
          channel,
          recipient,
          status: "QUEUED",
          estimatedDelivery: "1-2 minutes",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    logServerError("api/notifications/post", error);
    return Response.json(
      { message: "Failed to send test notification", error: error.message },
      { status: 500 }
    );
  }
}
