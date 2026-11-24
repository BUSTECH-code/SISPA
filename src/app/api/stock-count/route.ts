import { NextResponse } from "next/server";
import { recordStockCount } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
    const {
      productId,
      physicalCount,
      notes,
      occurredAt,
      clientTimestamp,
      isOfflineSync,
      idempotencyKey,
    } = body;

    const headerKey = request.headers.get("x-idempotency-key") || request.headers.get("x-client-tx-id");
    const resolvedIdempotencyKey = (idempotencyKey || headerKey)?.trim() || undefined;

    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json(
        { success: false, error: "Please choose which product you counted." },
        { status: 400 }
      );
    }

    if (physicalCount === undefined || physicalCount === null || physicalCount === "") {
      return NextResponse.json(
        { success: false, error: "Please enter 0 or a positive number for the physical count." },
        { status: 400 }
      );
    }

    const count = Number(physicalCount);
    if (!Number.isFinite(count) || count < 0) {
      return NextResponse.json(
        { success: false, error: "Please enter 0 or a positive number for the physical count." },
        { status: 400 }
      );
    }

    const result = await recordStockCount({
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      productId: Number(productId),
      physicalCount: count,
      notes,
      occurredAt: occurredAt ?? undefined,
      clientTimestamp: clientTimestamp ?? undefined,
      isOfflineSync: Boolean(isOfflineSync),
      idempotencyKey: resolvedIdempotencyKey,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.isQuarantined
        ? `Physical count of ${count} queued for owner timestamp review (recount needed).`
        : `Stock updated to match your count of ${count} items.`,
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't update the stock. Please try again.");
  }
}
