import { NextResponse } from "next/server";
import { confirmOpeningSessionItemTimestamp, ValidationError } from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; productId: string }> }
) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName } = await requireRouteBusinessContext(request, body);
    const { id, productId: rawProductId } = await params;
    const sessionId = Number(id);
    const productId = Number(rawProductId);

    if (!Number.isInteger(sessionId) || sessionId <= 0) {
      throw new ValidationError("INVALID_SESSION_ID", "Invalid opening stock session ID.");
    }
    if (!Number.isInteger(productId) || productId <= 0) {
      throw new ValidationError("INVALID_PRODUCT_ID", "Invalid product ID.");
    }

    const { confirmedCountedAt, notes } = body || {};
    if (!confirmedCountedAt) {
      throw new ValidationError("INVALID_TIMESTAMP", "confirmedCountedAt is required.");
    }

    const updated = await confirmOpeningSessionItemTimestamp({
      sessionId,
      businessId,
      productId,
      actorId,
      actorName,
      confirmedCountedAt,
      notes: typeof notes === "string" ? notes : undefined,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Timestamp confirmed for product #${productId} in session #${sessionId}.`,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to confirm opening session item timestamp.");
  }
}
