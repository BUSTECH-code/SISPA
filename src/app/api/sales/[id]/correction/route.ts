import { NextResponse } from "next/server";
import { recordSaleCorrection } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const { id } = await params;
    const saleId = Number(id);

    if (isNaN(saleId)) {
      return NextResponse.json({ success: false, error: "Invalid sale ID." }, { status: 400 });
    }

    const body = await request.json();
    const { correctedQuantityDelta, correctionReason } = body;

    const delta = Number(correctedQuantityDelta);
    if (isNaN(delta) || delta === 0) {
      return NextResponse.json({ success: false, error: "Enter a non-zero stock correction quantity." }, { status: 400 });
    }

    if (!correctionReason || !correctionReason.trim()) {
      return NextResponse.json({ success: false, error: "Please enter a reason for this sale correction." }, { status: 400 });
    }

    const result = await recordSaleCorrection({
      userId: businessId,
      actorId,
      actorName,
      actorRole: userRole,
      originalSaleId: saleId,
      correctedQuantityDelta: delta,
      correctionReason: correctionReason.trim(),
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Correction recorded! ${delta > 0 ? `+${delta}` : delta} stock adjusted. Original sale preserved in audit history.`,
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to record sale correction:", error);
    return NextResponse.json({ success: false, error: error.message || "Failed to record sale correction." }, { status: 400 });
  }
}
