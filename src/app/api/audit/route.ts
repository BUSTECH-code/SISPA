import { NextResponse } from "next/server";
import { getAuditLogs } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, userRole, actorId } = await requireRouteBusinessContext(request);
    const logs = await getAuditLogs(businessId, userRole, 60, actorId);

    return NextResponse.json({
      success: true,
      data: logs,
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't load the activity audit trail.");
  }
}
