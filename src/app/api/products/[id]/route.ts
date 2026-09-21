import { NextResponse } from "next/server";
import { getProductDetails, updateProduct } from "@/server/stockService";
import { db } from "@/db";
import { products } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ success: false, error: "Invalid product ID." }, { status: 400 });
    }

    const details = await getProductDetails(businessId, productId, userRole);
    if (!details) {
      return NextResponse.json({ success: false, error: "Product not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: details });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to get product details:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load product information. Please try again." },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { businessId, actorId, actorName, userRole } = resolveBusinessContext(user);
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ success: false, error: "Invalid product ID." }, { status: 400 });
    }

    const body = await request.json();

    const updated = await updateProduct({
      userId: businessId,
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
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to update product:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't save these product settings. Please try again." },
      { status: 400 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const { businessId } = resolveBusinessContext(user);
    const { id } = await params;
    const productId = Number(id);
    if (isNaN(productId)) {
      return NextResponse.json({ success: false, error: "Invalid product ID." }, { status: 400 });
    }

    await db.delete(products).where(and(eq(products.id, productId), eq(products.userId, businessId)));
    return NextResponse.json({ success: true, message: "Product deleted successfully." });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to delete product:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't delete this product. Please try again." },
      { status: 500 }
    );
  }
}
