import { NextResponse } from "next/server";
import { recordStockCount } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const body = await request.json();
    const { productId, physicalCount, notes } = body;

    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json(
        { success: false, error: "Please choose which product you counted." },
        { status: 400 }
      );
    }

    const count = Number(physicalCount);
    if (isNaN(count) || count < 0) {
      return NextResponse.json(
        { success: false, error: "Please enter 0 or a positive number for the physical count." },
        { status: 400 }
      );
    }

    const result = await recordStockCount({
      userId: businessId,
      actorId,
      actorName,
      actorRole: userRole,
      productId: Number(productId),
      physicalCount: count,
      notes,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Stock updated to match your count of ${count} items.`,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to count stock:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "We couldn't update the stock. Please try again.",
      },
      { status: 400 }
    );
  }
}
