import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, createSupportRequest, revokeSupportAccessGrant } from "@/server/authService";
import { db } from "@/db";
import { supportAccessLogs, businesses } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const body = await req.json();
    const { businessId, reason, scope, requestedDurationMinutes } = body;

    const targetBizId = businessId ? Number(businessId) : user.activeBusinessId;
    if (!targetBizId) {
      return NextResponse.json(
        { success: false, error: "No active business context found." },
        { status: 400 }
      );
    }

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
      businessId: targetBizId,
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
    return NextResponse.json(
      { success: false, error: error.message || "Failed to submit support request." },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ success: false, error: "UNAUTHORIZED" }, { status: 401 });
    }

    const targetBizId = user.activeBusinessId;
    if (!targetBizId) {
      return NextResponse.json({ success: true, data: [] });
    }

    const logs = await db
      .select()
      .from(supportAccessLogs)
      .where(eq(supportAccessLogs.businessId, targetBizId))
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
    return NextResponse.json(
      { success: false, error: error.message || "Failed to retrieve support requests." },
      { status: 500 }
    );
  }
}
