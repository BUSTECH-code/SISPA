import { NextResponse } from "next/server";
import { getOpeningStockSession, NotFoundError, ValidationError } from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { businessId, actorId } = await requireRouteBusinessContext(request);
    const { id } = await params;
    const sessionId = Number(id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new ValidationError("INVALID_SESSION_ID", "Invalid opening stock session ID.");
    }

    const details = await getOpeningStockSession(sessionId, businessId, actorId);
    if (!details) {
      throw new NotFoundError("SESSION_NOT_FOUND", "Opening stock session not found.");
    }

    return NextResponse.json({
      success: true,
      data: details,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to load opening stock session.");
  }
}
