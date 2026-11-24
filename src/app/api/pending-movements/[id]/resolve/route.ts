import { NextResponse } from "next/server";
import { resolvePendingMovement, ValidationError } from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

const ALLOWED_MODES = new Set(["EXACT_TIMESTAMP", "PRE_CUTOFF", "POST_CUTOFF"]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName } = await requireRouteBusinessContext(request, body);
    const { id } = await params;
    const pendingMovementId = Number(id);

    if (!Number.isInteger(pendingMovementId) || pendingMovementId <= 0) {
      throw new ValidationError("INVALID_ID", "Invalid pending movement ID.");
    }

    const { resolutionMode, resolvedOccurredAt, resolutionNote } = body || {};
    if (!resolutionMode || !ALLOWED_MODES.has(String(resolutionMode))) {
      throw new ValidationError(
        "INVALID_RESOLUTION_MODE",
        "resolutionMode must be EXACT_TIMESTAMP, PRE_CUTOFF, or POST_CUTOFF."
      );
    }

    const result = await resolvePendingMovement({
      pendingMovementId,
      businessId,
      actorId,
      actorName,
      resolutionMode: resolutionMode as "EXACT_TIMESTAMP" | "PRE_CUTOFF" | "POST_CUTOFF",
      resolvedOccurredAt: resolvedOccurredAt ?? null,
      resolutionNote: typeof resolutionNote === "string" ? resolutionNote : "",
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Pending movement #${pendingMovementId} resolved (${result.pendingMovement.status}).`,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to resolve pending stock movement.");
  }
}
