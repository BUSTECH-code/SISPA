import { NextResponse } from "next/server";
import { cancelOpeningStockSession, ValidationError } from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
    const { id } = await params;
    const sessionId = Number(id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new ValidationError("INVALID_SESSION_ID", "Invalid opening stock session ID.");
    }

    const cancelled = await cancelOpeningStockSession({
      sessionId,
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      reason: typeof body?.reason === "string" ? body.reason : undefined,
    });

    return NextResponse.json({
      success: true,
      data: cancelled,
      message: "Opening stock session cancelled.",
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to cancel opening stock session.");
  }
}
