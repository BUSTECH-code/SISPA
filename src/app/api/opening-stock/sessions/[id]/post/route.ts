import { NextResponse } from "next/server";
import { postOpeningStockSession, ValidationError } from "@/server/openingStock";
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

    const headerKey = request.headers.get("x-idempotency-key") || request.headers.get("x-client-tx-id");
    const resolvedKey = (body?.idempotencyKey || headerKey)?.trim() || null;

    const result = await postOpeningStockSession({
      sessionId,
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      idempotencyKey: resolvedKey,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.isDuplicateReplay
        ? "Opening stock session was already posted (idempotent replay)."
        : `Posted opening stock session (${result.postedCount} verified, ${result.supersededCount} superseded, ${result.skippedUncountedCount} uncounted).`,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to post opening stock session.");
  }
}
