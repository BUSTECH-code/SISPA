import { NextRequest, NextResponse } from "next/server";
import {
  requirePlatformAdmin,
  approveSupportRequest,
  rejectSupportRequest,
  revokeSupportAccessGrant,
  createSupportRequest,
} from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { action, grantId, rejectionReason, businessId, reason, scope, durationMinutes } = body;

    // 1. APPROVE pending support request
    if (action === "APPROVE") {
      if (!grantId) {
        return NextResponse.json(
          { success: false, error: "Grant ID is required to approve." },
          { status: 400 }
        );
      }
      const updated = await approveSupportRequest({
        adminUserId: admin.id,
        grantId: Number(grantId),
      });
      return NextResponse.json({
        success: true,
        message: `Support grant #${grantId} approved. Scoped access is now active.`,
        data: updated,
      });
    }

    // 2. REJECT pending support request
    if (action === "REJECT") {
      if (!grantId || !rejectionReason || !rejectionReason.trim()) {
        return NextResponse.json(
          { success: false, error: "Grant ID and rejection reason are required." },
          { status: 400 }
        );
      }
      const updated = await rejectSupportRequest({
        adminUserId: admin.id,
        grantId: Number(grantId),
        rejectionReason: rejectionReason.trim(),
      });
      return NextResponse.json({
        success: true,
        message: `Support request #${grantId} rejected.`,
        data: updated,
      });
    }

    // 3. Fallback: Direct emergency support request initiation
    if (!businessId || !reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, error: "Business ID and an explicit support reason are strictly required." },
        { status: 400 }
      );
    }

    const grant = await createSupportRequest({
      requestingUserId: admin.id,
      businessId: Number(businessId),
      reason: reason.trim(),
      scope: scope || "ACCOUNT_WHATSAPP",
      requestedDurationMinutes: durationMinutes ? Number(durationMinutes) : 30,
    });

    return NextResponse.json({
      success: true,
      message: `Support request created for business #${businessId}.`,
      data: grant,
    });
  } catch (error: any) {
    if (error.message === "FORBIDDEN_PLATFORM_ADMIN_ONLY" || error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Access denied. Platform Admin privileges required." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to process support action." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { grantId, revocationReason } = body;

    if (!grantId) {
      return NextResponse.json(
        { success: false, error: "Grant ID is required to revoke." },
        { status: 400 }
      );
    }

    const revoked = await revokeSupportAccessGrant({
      actorUserId: admin.id,
      grantId: Number(grantId),
      revocationReason: revocationReason || "Revoked by Platform Administrator",
    });

    return NextResponse.json({
      success: true,
      message: "Support access session revoked successfully.",
      data: revoked,
    });
  } catch (error: any) {
    if (error.message === "FORBIDDEN_PLATFORM_ADMIN_ONLY" || error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Access denied. Platform Admin privileges required." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to revoke support grant." },
      { status: 500 }
    );
  }
}
