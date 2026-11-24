import { NextRequest, NextResponse } from "next/server";
import { requireRouteBusinessContext, createSupportRequest } from "@/server/authService";
import { db } from "@/db";
import { supportAccessLogs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { user, businessId } = await requireRouteBusinessContext(req, body);
    const { reason, scope, requestedDurationMinutes } = body;

    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, error: "Please provide a specific description of what requires platform assistance." },
        { status: 400 }
      );
    }

    const validScopes = [
      "ACCOUNT_WHATSAPP",
      "CATALOG_DIAGNOSTICS",
      "DEBT_RECONCILIATION",
      "SYSTEM_CONFIG",
      "READ_ONLY",
    ];
    const targetScope = validScopes.includes(scope) ? scope : "ACCOUNT_WHATSAPP";

    const request = await createSupportRequest({
      requestingUserId: user.id,
      businessId,
      reason: reason.trim(),
      scope: targetScope as any,
      requestedDurationMinutes: requestedDurationMinutes ? Number(requestedDurationMinutes) : 30,
    });

    return NextResponse.json({
      success: true,
      message: "Support request submitted. A SISPA Platform Administrator will review and authorize your session shortly.",
      data: request,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to submit support request.");
  }
}

export async function GET(req: NextRequest) {
  try {
    const { businessId } = await requireRouteBusinessContext(req);

    const logs = await db
      .select()
      .from(supportAccessLogs)
      .where(eq(supportAccessLogs.businessId, businessId))
      .orderBy(desc(supportAccessLogs.createdAt))
      .limit(10);

    const now = new Date();
    const formatted = logs.map((g) => {
      let status = g.status || "APPROVED";
      if (g.revokedAt) {
        status = "REVOKED";
      } else if (status === "APPROVED" && g.expiresAt && new Date(g.expiresAt) <= now) {
        status = "EXPIRED";
      }
      return {
        ...g,
        status,
        isActiveNow: status === "APPROVED" && Boolean(g.expiresAt && new Date(g.expiresAt) > now),
      };
    });

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    return handleRouteError(error, "Failed to retrieve support requests.");
  }
}
