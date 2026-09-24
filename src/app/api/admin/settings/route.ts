import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, updatePlatformSettingsAdmin } from "@/server/authService";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requirePlatformAdmin();
    const settings = await db.select().from(platformSettings).limit(1);
    return NextResponse.json({
      success: true,
      data: settings[0] || {
        maintenanceMode: false,
        defaultTrialDays: 14,
        gracePeriodDays: 7,
        allowSelfRegistration: true,
      },
    });
  } catch (error: any) {
    if (error.message === "FORBIDDEN_PLATFORM_ADMIN_ONLY" || error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Access denied. Platform Admin privileges required." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load platform settings." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const admin = await requirePlatformAdmin();
    const body = await req.json();

    const updated = await updatePlatformSettingsAdmin({
      adminUserId: admin.id,
      maintenanceMode: body.maintenanceMode !== undefined ? Boolean(body.maintenanceMode) : undefined,
      maintenanceNotice: body.maintenanceNotice !== undefined ? String(body.maintenanceNotice) : undefined,
      defaultTrialDays: body.defaultTrialDays ? Number(body.defaultTrialDays) : undefined,
      gracePeriodDays: body.gracePeriodDays ? Number(body.gracePeriodDays) : undefined,
      allowSelfRegistration: body.allowSelfRegistration !== undefined ? Boolean(body.allowSelfRegistration) : undefined,
    });

    return NextResponse.json({
      success: true,
      message: "Platform settings updated successfully.",
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
      { success: false, error: error.message || "Failed to update platform settings." },
      { status: 500 }
    );
  }
}
