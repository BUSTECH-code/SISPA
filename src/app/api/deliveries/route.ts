import { NextResponse } from "next/server";
import { recordDelivery } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const body = await request.json();
    const { productId, quantityReceived, unitCost, supplierName, notes, customDate } = body;

    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json(
        { success: false, error: "Please choose which product arrived." },
        { status: 400 }
      );
    }

    const qty = Number(quantityReceived);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json(
        { success: false, error: "Enter a received quantity greater than 0." },
        { status: 400 }
      );
    }

    // Commercial sensitivity: only owner can submit purchase price
    const cost =
      userRole === "OWNER" && unitCost !== undefined && unitCost !== null && unitCost !== ""
        ? Number(unitCost)
        : null;

    const entry = await recordDelivery({
      userId: businessId,
      actorId,
      actorName,
      actorRole: userRole,
      productId: Number(productId),
      quantityReceived: qty,
      unitCost: cost,
      supplierName,
      notes,
      customDate: customDate ? new Date(customDate) : undefined,
    });

    return NextResponse.json({
      success: true,
      data: entry,
      message: "Delivery recorded! Stock has been updated.",
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to record delivery:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "We couldn't save this delivery. Check your connection and try again.",
      },
      { status: 400 }
    );
  }
}
