import { NextResponse } from "next/server";
import { db } from "@/db";
import { stockLedgerEntries, products, users } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";
import { requireAuth, resolveBusinessContext } from "@/server/authService";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();
    const { businessId, userRole } = resolveBusinessContext(user);

    const list = await db
      .select({
        id: stockLedgerEntries.id,
        productId: stockLedgerEntries.productId,
        productName: products.name,
        productUnit: products.unit,
        entryType: stockLedgerEntries.entryType,
        quantityDelta: stockLedgerEntries.quantityDelta,
        unitCost: stockLedgerEntries.unitCost,
        supplierName: stockLedgerEntries.supplierName,
        notes: stockLedgerEntries.notes,
        createdAt: stockLedgerEntries.createdAt,
      })
      .from(stockLedgerEntries)
      .innerJoin(products, eq(stockLedgerEntries.productId, products.id))
      .where(eq(stockLedgerEntries.userId, businessId))
      .orderBy(desc(stockLedgerEntries.createdAt))
      .limit(60);

    // Sanitize unitCost server-side: Staff must not see purchase costs
    const sanitized = list.map((item) => ({
      ...item,
      unitCost: userRole === "OWNER" ? item.unitCost : null,
    }));

    return NextResponse.json({ success: true, data: sanitized });
  } catch (error: any) {
    if (error.message === "UNAUTHORIZED") {
      return NextResponse.json({ success: false, error: "Please log in." }, { status: 401 });
    }
    console.error("Failed to load activity:", error);
    return NextResponse.json(
      { success: false, error: "We couldn't load activity history." },
      { status: 500 }
    );
  }
}
