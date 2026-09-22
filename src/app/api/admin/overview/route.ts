import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin, getPlatformOverview } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const admin = await requirePlatformAdmin();
    const overview = await getPlatformOverview(admin.id);
    return NextResponse.json({ success: true, data: overview });
  } catch (error: any) {
    if (error.message === "FORBIDDEN_PLATFORM_ADMIN_ONLY" || error.message === "UNAUTHORIZED") {
      return NextResponse.json(
        { success: false, error: "Access denied. Platform Admin privileges required." },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || "Failed to load platform overview." },
      { status: 500 }
    );
  }
}
