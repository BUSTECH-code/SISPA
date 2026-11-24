import { NextResponse } from "next/server";
import { db } from "@/db";
import { stockLedgerEntries, products, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { requireRouteBusinessContext } from "@/server/authService";
import { can } from "@/server/authorization";
import { handleRouteError } from "@/server/routeError";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { businessId, userRole, authContext } = await requireRouteBusinessContext(request);
    const canSeePurchaseCost = userRole === "STAFF" ? false : can(authContext, "PURCHASE_COST_VIEW");

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
        occurredAt: stockLedgerEntries.occurredAt,
        createdAt: stockLedgerEntries.createdAt,
        staffUserId: stockLedgerEntries.staffUserId,
        staffName: users.fullName,
      })
      .from(stockLedgerEntries)
      .innerJoin(products, eq(stockLedgerEntries.productId, products.id))
      .leftJoin(users, eq(stockLedgerEntries.staffUserId, users.id))
      .where(eq(stockLedgerEntries.businessId, businessId))
      .orderBy(desc(stockLedgerEntries.occurredAt), desc(stockLedgerEntries.id))
      .limit(60);

    const sanitized = list.map((item) => ({
      ...item,
      unitCost: canSeePurchaseCost ? item.unitCost : null,
      staffUserId: item.staffUserId,
      staffName: item.staffName,
    }));

    return NextResponse.json({ success: true, data: sanitized });
  } catch (error: any) {
    return handleRouteError(error, "We couldn't load activity history.");
  }
}
