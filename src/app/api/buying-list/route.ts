import { NextResponse } from "next/server";
import {
  getBuyingList,
  addOrUpdateBuyingListItem,
  toggleBuyingListItem,
  removeBuyingListItem,
  clearCompletedBuyingItems,
} from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, userRole, actorId } = await requireRouteBusinessContext(request);
    const items = await getBuyingList(businessId, userRole, actorId);
    const totalEstimatedOutlay = items.reduce((sum, item) => {
      const cost = item.estimatedUnitCost ? Number(item.estimatedUnitCost) : 0;
      return sum + item.quantityToBuy * cost;
    }, 0);

    const pendingCount = items.filter((i) => !i.isCompleted).length;
    const completedCount = items.filter((i) => i.isCompleted).length;

    return NextResponse.json({
      success: true,
      data: {
        items,
        totalEstimatedOutlay: userRole === "OWNER" ? totalEstimatedOutlay : null,
        pendingCount,
        completedCount,
      },
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't load your buying list. Please try again.");
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { businessId, userRole, actorId } = await requireRouteBusinessContext(request, body);
    const { productId, quantityToBuy, estimatedUnitCost, supplierName } = body;

    if (!productId || isNaN(Number(productId))) {
      return NextResponse.json(
        { success: false, error: "Please choose a product." },
        { status: 400 }
      );
    }

    const qty = Number(quantityToBuy);
    if (isNaN(qty) || qty <= 0) {
      return NextResponse.json(
        { success: false, error: "Please enter a quantity to buy greater than 0." },
        { status: 400 }
      );
    }

    const cost = userRole === "OWNER" && estimatedUnitCost ? Number(estimatedUnitCost) : null;

    const item = await addOrUpdateBuyingListItem({
      businessId,
      actorId,
      productId: Number(productId),
      quantityToBuy: qty,
      estimatedUnitCost: cost,
      supplierName: supplierName || null,
    });

    return NextResponse.json({
      success: true,
      data: item,
      message: "Added to your buying list!",
    });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't update your buying list.");
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { businessId, actorId } = await requireRouteBusinessContext(request, body);
    const { id, isCompleted, quantityToBuy } = body;

    if (!id || isNaN(Number(id))) {
      return NextResponse.json({ success: false, error: "Item ID is required." }, { status: 400 });
    }

    const item = await toggleBuyingListItem(
      businessId,
      Number(id),
      isCompleted !== undefined ? Boolean(isCompleted) : undefined,
      quantityToBuy !== undefined ? Number(quantityToBuy) : undefined,
      actorId
    );
    return NextResponse.json({ success: true, data: item });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't update this item. Please try again.");
  }
}

export async function DELETE(request: Request) {
  try {
    const { businessId, actorId } = await requireRouteBusinessContext(request);
    const { searchParams } = new URL(request.url);
    const clearCompleted = searchParams.get("clearCompleted");
    const id = searchParams.get("id");

    if (clearCompleted === "true") {
      await clearCompletedBuyingItems(businessId, actorId);
      return NextResponse.json({ success: true, message: "Cleared completed items." });
    }

    if (id && !isNaN(Number(id))) {
      await removeBuyingListItem(businessId, Number(id), actorId);
      return NextResponse.json({ success: true, message: "Item removed from buying list." });
    }

    return NextResponse.json(
      { success: false, error: "Item ID or clearCompleted flag is required." },
      { status: 400 }
    );
  } catch (error: any) {
    return handleRouteError(error, "We couldn't remove this item. Please try again.");
  }
}
