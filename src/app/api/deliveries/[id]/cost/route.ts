import { NextResponse } from "next/server";
import { updateDeliveryPurchaseCost } from "@/server/stockService";
import { requireOwner, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireOwner();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const { id } = await params;
    const ledgerEntryId = Number(id);

    if (isNaN(ledgerEntryId)) {
      return NextResponse.json({ success: false, error: "Invalid delivery ID." }, { status: 400 });
    }

    const body = await request.json();
    const { unitCost } = body;

    const costNum = Number(unitCost);
    if (isNaN(costNum) || costNum <= 0) {
      return NextResponse.json({ success: false, error: "Enter a valid unit purchase cost greater than 0." }, { status: 400 });
    }

    const updated = await updateDeliveryPurchaseCost({
      userId: businessId,
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
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    if (error.message === "FORBIDDEN_OWNER_ONLY") {
      return NextResponse.json({ success: false, error: "Only the shop owner can record or view purchase costs." }, { status: 403 });
    }
    console.error("Failed to update delivery purchase cost:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to update purchase cost." }, { status: 400 });
  }
}
