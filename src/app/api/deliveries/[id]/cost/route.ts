import { NextResponse } from "next/server";
import { updateDeliveryPurchaseCost } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
    const { id } = await params;
    const ledgerEntryId = Number(id);

    if (isNaN(ledgerEntryId)) {
      return NextResponse.json({ success: false, error: "Invalid delivery ID." }, { status: 400 });
    }

    const { unitCost } = body;
    const costNum = Number(unitCost);
    if (isNaN(costNum) || costNum <= 0) {
      return NextResponse.json(
        { success: false, error: "Enter a valid unit purchase cost greater than 0." },
        { status: 400 }
      );
    }

    const updated = await updateDeliveryPurchaseCost({
      businessId,
      actorId,
      actorName,
      actorRole: userRole,
      ledgerEntryId,
      unitCost: costNum,
    });

    return NextResponse.json({
      success: true,
      data: updated,
      message: `Purchase cost of ₦${costNum.toLocaleString()} recorded. COGS and profit updated.`,
    });
  } catch (error: any) {
    return handleRouteError(error, "Failed to update purchase cost.");
  }
}
