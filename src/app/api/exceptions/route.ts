import { NextResponse } from "next/server";
import { getBusinessExceptions } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, userRole, actorId } = await requireRouteBusinessContext(request);
    const exceptions = await getBusinessExceptions(businessId, userRole, actorId);

    return NextResponse.json({
      success: true,
      data: exceptions,
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't check business exceptions.");
  }
}
