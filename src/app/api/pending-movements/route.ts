import { NextResponse } from "next/server";
import { listPendingStockMovements, ValidationError } from "@/server/openingStock";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

const ALLOWED_STATUSES = new Set([
  "PENDING_REVIEW",
  "RESOLVED_PRE_CUTOFF",
  "RESOLVED_POST_CUTOFF",
  "ALL",
]);

export async function GET(request: Request) {
  try {
    const { businessId, actorId } = await requireRouteBusinessContext(request);
    const url = new URL(request.url);
    const rawStatus = url.searchParams.get("status")?.trim() || "PENDING_REVIEW";

    if (!ALLOWED_STATUSES.has(rawStatus)) {
      throw new ValidationError(
        "INVALID_STATUS",
        "Status must be PENDING_REVIEW, RESOLVED_PRE_CUTOFF, RESOLVED_POST_CUTOFF, or ALL."
      );
    }

    const movements = await listPendingStockMovements({
      businessId,
      actorId,
      status: rawStatus as
        | "PENDING_REVIEW"
        | "RESOLVED_PRE_CUTOFF"
        | "RESOLVED_POST_CUTOFF"
        | "ALL",
    });

    return NextResponse.json({
      success: true,
      data: movements,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to load pending stock movements.");
  }
}
