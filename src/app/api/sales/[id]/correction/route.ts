import { NextResponse } from "next/server";
import { recordSaleCorrection } from "@/server/stockService";
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
    const saleId = Number(id);

    if (isNaN(saleId)) {
      return NextResponse.json({ success: false, error: "Invalid sale ID." }, { status: 400 });
    }

    const {
      correctedQuantityDelta,
      correctionReason,
      occurredAt,
      clientTimestamp,
      isOfflineSync,
      idempotencyKey,
    } = body;

    const delta = Number(correctedQuantityDelta);
    if (!Number.isFinite(delta) || delta <= 0) {
      return NextResponse.json(
        { success: false, error: "Enter a positive return quantity greater than 0." },
        { status: 400 }
      );
    }

    if (!correctionReason || !correctionReason.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter a reason for this sale correction." },
        { status: 400 }
      );
    }

    const headerKey = request.headers.get("x-idempotency-key") || request.headers.get("x-client-tx-id");
    const resolvedIdempotencyKey = (idempotencyKey || headerKey)?.trim() || undefined;

    const result = await recordSaleCorrection({
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      originalSaleId: saleId,
      correctedQuantityDelta: delta,
      correctionReason: correctionReason.trim(),
      occurredAt: occurredAt ?? undefined,
      clientTimestamp: clientTimestamp ?? undefined,
      isOfflineSync: Boolean(isOfflineSync),
      idempotencyKey: resolvedIdempotencyKey,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.isDuplicateReplay
        ? "Return was previously recorded (idempotent replay)."
        : result.isQuarantined
        ? `Return recorded (${delta} units); stock restoration queued for owner timestamp review.`
        : `Return recorded! +${delta} stock restored. Original sale preserved in audit history.`,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to record sale correction.");
  }
}
