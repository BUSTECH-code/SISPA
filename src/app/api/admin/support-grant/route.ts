import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, createSupportAccessGrant, revokeSupportAccessGrant } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { businessId, reason, scope, durationMinutes } = body;

    if (!businessId || !reason || !reason.trim()) {
      return NextResponse.json(
        { success: false, error: "Business ID and an explicit support reason are strictly required." },
        { status: 400 }
      );
    }

    const grant = await createSupportAccessGrant({
      adminUserId: admin.id,
      businessId: Number(businessId),
      reason: reason.trim(),
      scope: scope === "FULL" ? "FULL" : "READ_ONLY",
      durationMinutes: durationMinutes ? Number(durationMinutes) : 30,
    });

    return NextResponse.json({
      success: true,
      message: `Support access granted for business #${businessId}. Session will expire in ${durationMinutes || 30} minutes.`,
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
      { success: false, error: error.message || "Failed to create support grant." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { grantId } = body;

    if (!grantId) {
      return NextResponse.json(
        { success: false, error: "Grant ID is required." },
        { status: 400 }
      );
    }

    const revoked = await revokeSupportAccessGrant({
      adminUserId: admin.id,
      grantId: Number(grantId),
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
