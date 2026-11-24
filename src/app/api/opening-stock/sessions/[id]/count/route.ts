import { NextResponse } from "next/server";
import { recordSessionCount, ValidationError } from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
    const { id } = await params;
    const sessionId = Number(id);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new ValidationError("INVALID_SESSION_ID", "Invalid opening stock session ID.");
    }

    const { productId, countedQuantity, countedAt, unitCost, notes } = body || {};
    const parsedProductId = Number(productId);
    if (!Number.isInteger(parsedProductId) || parsedProductId <= 0) {
      throw new ValidationError("INVALID_PRODUCT_ID", "Valid productId is required.");
    }

    const parsedQuantity = Number(countedQuantity);
    const parsedUnitCost =
      unitCost !== undefined && unitCost !== null && unitCost !== "" ? Number(unitCost) : null;

    const item = await recordSessionCount({
      sessionId,
      businessId,
      productId: parsedProductId,
      countedQuantity: parsedQuantity,
      countedAt: countedAt ?? null,
      unitCost: parsedUnitCost,
      countedByUserId: actorId,
      actorName,
      actorRole: userRole,
      notes: typeof notes === "string" ? notes : undefined,
    });

    return NextResponse.json({
      success: true,
      data: item,
      message:
        item.status === "NEEDS_RECOUNT"
          ? "Count recorded with skewed device clock; flagged NEEDS_RECOUNT for owner timestamp confirmation."
          : "Session physical count recorded.",
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to record session physical count.");
  }
}
