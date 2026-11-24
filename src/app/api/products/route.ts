import { NextResponse } from "next/server";
import { getAllEnrichedProducts, addProduct } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, userRole, actorId } = await requireRouteBusinessContext(request);
    const products = await getAllEnrichedProducts(businessId, userRole, actorId);

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
    return handleRouteError(error, "We couldn't load your stock list. Please try again.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);

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
      allowFractionalQuantity,
    } = body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Please enter a product name." },
        { status: 400 }
      );
    }

    const cost = userRole === "OWNER" && openingUnitCost ? Number(openingUnitCost) : null;

    const product = await addProduct({
      businessId,
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
      allowFractionalQuantity: Boolean(allowFractionalQuantity),
    });

    return NextResponse.json({ success: true, data: product }, { status: 201 });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't add this product. Please try again.");
  }
}
