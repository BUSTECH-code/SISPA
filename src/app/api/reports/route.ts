import { NextResponse } from "next/server";
import { getBusinessPeriodReport } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { assertCan } from "@/server/authorization";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, userRole, actorId, authContext } = await requireRouteBusinessContext(request);
    assertCan(authContext, "REPORT_VIEW", { businessId });

    const { searchParams } = new URL(request.url);
    const days = Number(searchParams.get("days")) || 7;

    const report = await getBusinessPeriodReport(businessId, days, userRole, actorId);

    return NextResponse.json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't generate the business report. Please try again.");
  }
}
