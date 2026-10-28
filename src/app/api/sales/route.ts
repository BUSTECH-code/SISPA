import { NextResponse } from "next/server";
import { recordSale } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const body = await request.json();
    const {
      productId,
      quantity,
      unitPrice,
      items,
      customerId,
      customerName,
      amountPaid,
      notes,
      customDate,
      idempotencyKey,
    } = body;

    const headerKey = request.headers.get("x-idempotency-key") || request.headers.get("x-client-tx-id");
    const resolvedIdempotencyKey = (idempotencyKey || headerKey)?.trim() || undefined;

    let parsedItems: Array<{ productId: number; quantity: number; unitPrice?: number }> = [];

    if (items && Array.isArray(items) && items.length > 0) {
      parsedItems = items.map((it: any) => ({
        productId: Number(it.productId),
        quantity: Number(it.quantity),
        unitPrice: it.unitPrice !== undefined && it.unitPrice !== null && it.unitPrice !== "" ? Number(it.unitPrice) : undefined,
      }));

      for (const it of parsedItems) {
        if (!it.productId || isNaN(it.productId)) {
          return NextResponse.json({ success: false, error: "Invalid product selected in items list." }, { status: 400 });
        }
        if (isNaN(it.quantity) || it.quantity <= 0) {
          return NextResponse.json({ success: false, error: "All items must have a quantity greater than 0." }, { status: 400 });
        }
      }
    } else {
      if (!productId || isNaN(Number(productId))) {
        return NextResponse.json(
          { success: false, error: "Please choose which product was sold." },
          { status: 400 }
        );
      }

      const qty = Number(quantity);
      if (isNaN(qty) || qty <= 0) {
        return NextResponse.json(
          { success: false, error: "Enter a quantity greater than 0." },
          { status: 400 }
        );
      }

      const price = unitPrice !== undefined && unitPrice !== null && unitPrice !== ""
        ? Number(unitPrice)
        : undefined;

      parsedItems = [{ productId: Number(productId), quantity: qty, unitPrice: price }];
    }

    const paid = amountPaid !== undefined && amountPaid !== null && amountPaid !== ""
      ? Number(amountPaid)
      : 0;

    const result = await recordSale({
      userId: businessId,
      actorId,
      actorName,
      actorRole: userRole,
      items: parsedItems,
      customerId: customerId ? Number(customerId) : undefined,
      customerName: customerName || undefined,
      amountPaid: paid,
      notes: notes?.trim() || undefined,
      customDate: customDate ? new Date(customDate) : undefined,
      idempotencyKey: resolvedIdempotencyKey,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: result.isDuplicateReplay
        ? "Sale was previously recorded (idempotent replay)."
        : "Sale recorded successfully! Stock and customer balance updated.",
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to record sale:", error);
    return NextResponse.json(
      { success: false, error: error.message || "We couldn't save this sale. Check your connection and try again." },
      { status: 400 }
    );
  }
}
