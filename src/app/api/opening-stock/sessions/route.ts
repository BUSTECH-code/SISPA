import { NextResponse } from "next/server";
import {
  createOpeningStockSession,
  listOpeningStockSessions,
  ValidationError,
} from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, actorId } = await requireRouteBusinessContext(request);
    const sessions = await listOpeningStockSessions(businessId, actorId);

    return NextResponse.json({
      success: true,
      data: sessions,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to load opening stock sessions.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);

    const { name, notes, idempotencyKey, productIds } = body || {};
    const headerKey = request.headers.get("x-idempotency-key") || request.headers.get("x-client-tx-id");
    const resolvedKey = (idempotencyKey || headerKey)?.trim() || null;

    let parsedProductIds: number[] | undefined = undefined;
    if (productIds !== undefined && productIds !== null) {
      if (!Array.isArray(productIds)) {
        throw new ValidationError("INVALID_PRODUCTS", "productIds must be an array of product IDs.");
      }
      parsedProductIds = productIds.map((pid: unknown) => Number(pid));
      if (parsedProductIds.some((pid) => !Number.isInteger(pid) || pid <= 0)) {
        throw new ValidationError("INVALID_PRODUCTS", "All productIds must be positive integers.");
      }
    }

    const session = await createOpeningStockSession({
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      name: typeof name === "string" ? name : "",
      notes: typeof notes === "string" ? notes : undefined,
      idempotencyKey: resolvedKey,
      productIds: parsedProductIds,
    });

    return NextResponse.json(
      {
        success: true,
        data: session,
      },
      { status: 201 }
    );
  } catch (error: any) {
    return handleRouteError(error, "Failed to create opening stock session.");
  }
}
