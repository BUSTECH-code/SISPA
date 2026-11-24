import { NextResponse } from "next/server";
import { getProductDetails, updateProduct, deleteProduct } from "@/server/stockService";
import { requireRouteBusinessContext } from "@/server/authService";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { businessId, userRole, actorId } = await requireRouteBusinessContext(request);
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ success: false, error: "Invalid product ID." }, { status: 400 });
    }

    const details = await getProductDetails(businessId, productId, userRole, actorId);
    if (!details) {
      return NextResponse.json({ success: false, error: "Product not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: details });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't load product information. Please try again.");
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json();
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request, body);
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ success: false, error: "Invalid product ID." }, { status: 400 });
    }

    const updated = await updateProduct({
      businessId,
      productId,
      actorId,
      actorName,
      actorRole: userRole,
      name: body.name,
      category: body.category,
      unit: body.unit,
      sellingPrice: body.sellingPrice !== undefined ? (body.sellingPrice ? Number(body.sellingPrice) : null) : undefined,
      desiredCoverageDays: body.desiredCoverageDays !== undefined ? Number(body.desiredCoverageDays) : undefined,
      minimumStockThreshold: body.minimumStockThreshold !== undefined ? (body.minimumStockThreshold ? Number(body.minimumStockThreshold) : null) : undefined,
      manualDailySalesOverride: body.manualDailySalesOverride !== undefined ? (body.manualDailySalesOverride ? Number(body.manualDailySalesOverride) : null) : undefined,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't save these product settings. Please try again.");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { businessId, actorId, actorName, userRole } = await requireRouteBusinessContext(request);
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ success: false, error: "Invalid product ID." }, { status: 400 });
    }

    await deleteProduct({
      businessId,
      productId,
      actorId,
      actorName,
      actorRole: userRole,
    });
    return NextResponse.json({ success: true, message: "Product deleted successfully." });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't delete this product. Please try again.");
  }
}
