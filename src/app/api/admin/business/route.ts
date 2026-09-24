import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, updateBusinessStateAdmin } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { businessId, state, reason } = body;

    if (!businessId || !state || !reason) {
      return NextResponse.json(
        { success: false, error: "Business ID, desired state (ACTIVE | RESTRICTED | SUSPENDED), and a justification reason are strictly required." },
        { status: 400 }
      );
    }

    if (!["ACTIVE", "RESTRICTED", "SUSPENDED"].includes(state)) {
      return NextResponse.json(
        { success: false, error: "Invalid state. Must be ACTIVE, RESTRICTED, or SUSPENDED." },
        { status: 400 }
      );
    }

    const updated = await updateBusinessStateAdmin({
      adminUserId: admin.id,
      businessId: Number(businessId),
      state,
      reason: String(reason).trim(),
    });

    return NextResponse.json({
      success: true,
      message: `Business #${businessId} state changed to ${state}.`,
      data: updated,
    });
  } catch (error: any) {
    if (error.message === "FORBIDDEN_PLATFORM_ADMIN_ONLY" || error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Access denied. Platform Admin privileges required." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to update business state." },
      { status: 500 }
    );
  }
}
