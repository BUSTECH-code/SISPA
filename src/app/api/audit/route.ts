import { NextResponse } from "next/server";
import { getAuditLogs } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);

    const logs = await getAuditLogs(businessId, userRole, 60);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to load audit logs:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load the activity audit trail." },
      { status: 500 }
    );
  }
}
