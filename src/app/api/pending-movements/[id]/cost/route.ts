import { NextResponse } from "next/server";
import { updatePendingDeliveryCost, ValidationError } from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function PATCH(
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

    const unitCost = Number(body?.unitCost);
    const updated = await updatePendingDeliveryCost({
      pendingMovementId,
      businessId,
      actorId,
      actorName,
      unitCost,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Unit purchase cost updated on pending delivery #${pendingMovementId}.`,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to update pending delivery cost.");
  }
}
