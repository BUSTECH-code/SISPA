import { NextResponse } from "next/server";
import { getAllEnrichedProducts, addProduct } from "@/server/stockService";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);
    const products = await getAllEnrichedProducts(businessId, userRole, user.id);

    const runningLowCount = products.filter((p) => p.intelligence.status === "RUNNING_LOW").length;
    const checkSoonCount = products.filter((p) => p.intelligence.status === "CHECK_SOON").length;
    const okCount = products.filter((p) => p.intelligence.status === "OK").length;
    const noDataCount = products.filter((p) => p.intelligence.status === "NO_DATA").length;
    const negativeStockCount = products.filter((p) => p.currentStock < 0).length;

    return NextResponse.json({
      success: true,
      data: {
        products,
        counts: {
          total: products.length,
          runningLow: runningLowCount,
          checkSoon: checkSoonCount,
          ok: okCount,
          noData: noDataCount,
          negativeStock: negativeStockCount,
        },
      },
    });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to load products:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load your stock list. Please try again." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const body = await request.json();
    const {
      name,
      category,
      unit,
      sellingPrice,
      desiredCoverageDays,
      minimumStockThreshold,
      manualDailySalesOverride,
      openingStock,
      openingUnitCost,
      supplierName,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter a product name." },
        { status: 400 }
      );
    }

    const cost = userRole === "OWNER" && openingUnitCost ? Number(openingUnitCost) : null;

    const product = await addProduct({
      userId: businessId,
      actorId,
      actorName,
      actorRole: userRole,
      name,
      category,
      unit,
      sellingPrice: sellingPrice !== undefined && sellingPrice !== null && sellingPrice !== "" ? Number(sellingPrice) : null,
      desiredCoverageDays: desiredCoverageDays ? Number(desiredCoverageDays) : 7,
      minimumStockThreshold:
        minimumStockThreshold !== null && minimumStockThreshold !== undefined && minimumStockThreshold !== ""
          ? Number(minimumStockThreshold)
          : null,
      manualDailySalesOverride:
        manualDailySalesOverride !== null && manualDailySalesOverride !== undefined && manualDailySalesOverride !== ""
          ? Number(manualDailySalesOverride)
          : null,
      openingStock:
        openingStock !== null && openingStock !== undefined && openingStock !== ""
          ? Number(openingStock)
          : null,
      openingUnitCost: cost,
      supplierName: supplierName || null,
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to add product:", error);
    return NextResponse.json(
      { success: false, error: error.message || "We couldn't add this product. Please try again." },
      { status: 400 }
    );
  }
}
