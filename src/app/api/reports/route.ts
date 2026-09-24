import { NextResponse } from "next/server";
import { getBusinessPeriodReport } from "@/server/stockService";
import { requireAuth, resolveBusinessContext, getAuthContextForUser } from "@/server/authService";
import { assertCan } from "@/server/authorization";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);

    const authCtx = await getAuthContextForUser(user.id, userRole);
    assertCan(authCtx, "REPORT_VIEW", { businessId });

    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days")) || 7;

    const report = await getBusinessPeriodReport(businessId, days, userRole);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message?.startsWith("FORBIDDEN") || error.message?.startsWith("STAFF")) {
      return NextResponse.json(
        { success: false, error: "Commercial financial reports are restricted to the business owner." },
        { status: 403 }
      );
    }
    console.error("Failed to generate business report:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't generate the business report. Please try again." },
      { status: 500 }
    );
  }
}
