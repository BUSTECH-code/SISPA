import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, updateBusinessSubscriptionAdmin } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await req.json();
    const { businessId, plan, status, extendTrialDays } = body;

    if (!businessId) {
      return NextResponse.json(
        { success: false, error: "Business ID is required." },
        { status: 400 }
      );
    }

    const updated = await updateBusinessSubscriptionAdmin({
      adminUserId: admin.id,
      businessId: Number(businessId),
      plan,
      status,
      extendTrialDays: extendTrialDays ? Number(extendTrialDays) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: `Subscription updated for business #${businessId}.`,
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
      { success: false, error: error.message || "Failed to update subscription." },
      { status: 500 }
    );
  }
}
