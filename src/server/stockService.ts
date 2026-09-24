import { db } from "@/db";
import {
  products,
  stockLedgerEntries,
  buyingListItems,
  customers,
  sales,
  customerPayments,
  expenses,
  auditLogs,
  dailyCashChecks,
  users,
  type Product,
  type StockLedgerEntry,
  type Customer,
  type Sale,
  type CustomerPayment,
  type Expense,
  type AuditLog,
  type DailyCashCheck,
  type User,
} from "@/db/schema";
import { eq, desc, and, asc, sql } from "drizzle-orm";
import {
  calculateStockIntelligence,
  calculateVelocity,
  type StockIntelligenceResult,
} from "@/domain/intelligence";
import {
  calculateCustomerDebt,
  calculatePeriodSummary,
  type CustomerDebtSummary,
  type BusinessPeriodMetrics,
} from "@/domain/debt";
import { getAuthContextForUser } from "@/server/authService";
import { assertCan, can, redactSensitiveDataForStaff } from "@/server/authorization";

export interface EnrichedProduct extends Product {
  currentStock: number;
  intelligence: StockIntelligenceResult;
  lastSupplierInfo: {
    supplierName: string | null;
    unitCost: number | null; // Sanitized: null for STAFF users
    quantity: number | null;
    restockDate: Date | null;
  } | null;
}

export interface EnrichedCustomer extends Customer {
  totalCreditSales: number;
  totalPaid: number;
  outstandingBalance: number;
  isOverdue: boolean;
  salesCount: number;
}

export interface BusinessException {
  id: string;
  type: "NEGATIVE_STOCK" | "LOW_STOCK" | "OVERDUE_DEBT" | "MISSING_COST" | "UNCHECKED_STOCK" | "CASH_DISCREPANCY" | "STOCK_CORRECTION";
  severity: "URGENT" | "ATTENTION" | "INFO";
  title: string;
  description: string;
  actionText: string;
  actionTab?: "HOME" | "STOCK" | "DEBT" | "BUYING" | "REPORTS" | "EXPENSES" | "ACTIVITY" | "WHATSAPP";
}

// ==========================================
// 1. AUDIT TRAIL LOGGING
// ==========================================

export async function logAuditEvent(params: {
  userId: number; // Business tenant ID
  actorId: number;
  actorName: string;
  actorRole: "OWNER" | "STAFF";
  eventType: string;
  description: string;
  entityType: string;
  entityId?: number;
  oldValue?: string | null;
  newValue?: string | null;
  reason?: string | null;
  source?: "WEB" | "WHATSAPP" | "SYSTEM";
  isSensitive?: boolean;
}): Promise<AuditLog> {
  const {
    userId,
    actorId,
    actorName,
    actorRole,
    eventType,
    description,
    entityType,
    entityId,
    oldValue,
    newValue,
    reason,
    source = "WEB",
    isSensitive = false,
  } = params;

  const [entry] = await db
    .insert(auditLogs)
    .values({
      userId,
      actorId,
      actorName,
      actorRole,
      eventType,
      description,
      entityType,
      entityId,
      oldValue,
      newValue,
      reason,
      source,
      isSensitive,
      createdAt: new Date(),
    })
    .returning();

  return entry;
}

export async function getAuditLogs(
  userId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  limit: number = 60
): Promise<AuditLog[]> {
  const query = db
    .select()
    .from(auditLogs)
    .where(
      userRole === "OWNER"
        ? eq(auditLogs.userId, userId)
        : and(eq(auditLogs.userId, userId), eq(auditLogs.isSensitive, false))
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);

  return query;
}

// ==========================================
// 2. PRODUCTS & DERIVED STOCK INTELLIGENCE
// ==========================================

export async function getAllEnrichedProducts(
  userId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
): Promise<EnrichedProduct[]> {
  const authCtx = await getAuthContextForUser(actorId || userId, userRole);
  const canSeePurchaseCost = authCtx ? can(authCtx, "PURCHASE_COST_VIEW") : userRole === "OWNER";

  const userProducts = await db
    .select()
    .from(products)
    .where(eq(products.userId, userId))
    .orderBy(asc(products.name));

  if (userProducts.length === 0) {
    return [];
  }

  // Authoritative Stock Ledger entries
  const allLedger = await db
    .select()
    .from(stockLedgerEntries)
    .where(eq(stockLedgerEntries.userId, userId))
    .orderBy(desc(stockLedgerEntries.createdAt));

  const ledgerByProduct = new Map<number, StockLedgerEntry[]>();
  for (const entry of allLedger) {
    const list = ledgerByProduct.get(entry.productId) || [];
    list.push(entry);
    ledgerByProduct.set(entry.productId, list);
  }

  const now = new Date();

  return userProducts.map((prod) => {
    const entries = ledgerByProduct.get(prod.id) || [];

    // Current Stock = SUM(quantity_delta)
    const currentStock = entries.reduce(
      (sum, e) => sum + Number(e.quantityDelta || 0),
      0
    );

    // Filter sales for velocity
    const productSales = entries
      .filter((e) => e.entryType === "SALE")
      .map((e) => ({
        quantity: Math.abs(Number(e.quantityDelta)),
        date: new Date(e.createdAt),
      }));

    let earliestActivityDate: Date | null = null;
    if (entries.length > 0) {
      const sortedEntries = [...entries].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      earliestActivityDate = new Date(sortedEntries[0].createdAt);
    }

    const velocity = calculateVelocity({
      sales: productSales,
      productCreatedAt: new Date(prod.createdAt),
      earliestActivityDate,
      manualDailySalesOverride: prod.manualDailySalesOverride
        ? Number(prod.manualDailySalesOverride)
        : null,
      now,
    });

    const intelligence = calculateStockIntelligence({
      currentStock,
      velocity,
      desiredCoverageDays: prod.desiredCoverageDays,
      minimumStockThreshold: prod.minimumStockThreshold,
    });

    // Last Supplier Info (RESTOCK or OPENING_BALANCE) — Commercial Sensitivity:
    // If userRole is STAFF, unitCost is strictly redacted server-side
    const lastRestockOrOpening = entries.find(
      (e) => (e.entryType === "RESTOCK" || e.entryType === "OPENING_BALANCE") && e.unitCost !== null
    );
    const lastSupplierInfo = lastRestockOrOpening
      ? {
          supplierName: lastRestockOrOpening.supplierName,
          unitCost: canSeePurchaseCost && lastRestockOrOpening.unitCost ? Number(lastRestockOrOpening.unitCost) : null,
          quantity: Number(lastRestockOrOpening.quantityDelta),
          restockDate: new Date(lastRestockOrOpening.createdAt),
        }
      : null;

    return {
      ...prod,
      currentStock,
      intelligence,
      lastSupplierInfo,
    };
  });
}

export async function getProductDetails(
  userId: number,
  productId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
): Promise<{
  product: EnrichedProduct;
  ledgerHistory: Array<Omit<StockLedgerEntry, "unitCost"> & { unitCost: string | null }>;
} | null> {
  const authCtx = await getAuthContextForUser(actorId || userId, userRole);
  const canSeePurchaseCost = authCtx ? can(authCtx, "PURCHASE_COST_VIEW") : userRole === "OWNER";

  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .limit(1);

  if (!prod) return null;

  const entries = await db
    .select()
    .from(stockLedgerEntries)
    .where(and(eq(stockLedgerEntries.productId, productId), eq(stockLedgerEntries.userId, userId)))
    .orderBy(desc(stockLedgerEntries.createdAt));

  const currentStock = entries.reduce(
    (sum, e) => sum + Number(e.quantityDelta || 0),
    0
  );

  const productSales = entries
    .filter((e) => e.entryType === "SALE")
    .map((e) => ({
      quantity: Math.abs(Number(e.quantityDelta)),
      date: new Date(e.createdAt),
    }));

  let earliestActivityDate: Date | null = null;
  if (entries.length > 0) {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
    earliestActivityDate = new Date(sorted[0].createdAt);
  }

  const velocity = calculateVelocity({
    sales: productSales,
    productCreatedAt: new Date(prod.createdAt),
    earliestActivityDate,
    manualDailySalesOverride: prod.manualDailySalesOverride
      ? Number(prod.manualDailySalesOverride)
      : null,
  });

  const intelligence = calculateStockIntelligence({
    currentStock,
    velocity,
    desiredCoverageDays: prod.desiredCoverageDays,
    minimumStockThreshold: prod.minimumStockThreshold,
  });

  const lastRestockOrOpening = entries.find(
    (e) => (e.entryType === "RESTOCK" || e.entryType === "OPENING_BALANCE") && e.unitCost !== null
  );
  const lastSupplierInfo = lastRestockOrOpening
    ? {
        supplierName: lastRestockOrOpening.supplierName,
        unitCost: canSeePurchaseCost && lastRestockOrOpening.unitCost ? Number(lastRestockOrOpening.unitCost) : null,
        quantity: Number(lastRestockOrOpening.quantityDelta),
        restockDate: new Date(lastRestockOrOpening.createdAt),
      }
    : null;

  // Redact unitCost from history if user lacks PURCHASE_COST_VIEW capability
  const sanitizedHistory = entries.map((e) => ({
    ...e,
    unitCost: canSeePurchaseCost ? e.unitCost : null,
  }));

  return {
    product: {
      ...prod,
      currentStock,
      intelligence,
      lastSupplierInfo,
    },
    ledgerHistory: sanitizedHistory,
  };
}

export async function addProduct(params: {
  userId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  name: string;
  category?: string;
  unit?: string;
  sellingPrice?: number | null;
  desiredCoverageDays?: number;
  minimumStockThreshold?: number | null;
  manualDailySalesOverride?: number | null;
  openingStock?: number | null;
  openingUnitCost?: number | null;
  supplierName?: string | null;
}) {
  const {
    userId,
    actorId = userId,
    actorName = "Owner",
    actorRole = "OWNER",
    name,
    category = "General",
    unit = "units",
    sellingPrice = null,
    desiredCoverageDays = 7,
    minimumStockThreshold = null,
    manualDailySalesOverride = null,
    openingStock = null,
    openingUnitCost = null,
    supplierName = null,
  } = params;

  if (!name || !name.trim()) {
    throw new Error("Please enter a product name.");
  }

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "PRODUCT_CREATE");
    }
  }

  const [product] = await db
    .insert(products)
    .values({
      userId,
      name: name.trim(),
      category: category.trim() || "General",
      unit: unit.trim() || "units",
      sellingPrice: sellingPrice !== null && sellingPrice !== undefined ? String(sellingPrice) : null,
      desiredCoverageDays: desiredCoverageDays > 0 ? desiredCoverageDays : 7,
      minimumStockThreshold:
        minimumStockThreshold !== null && minimumStockThreshold >= 0
          ? minimumStockThreshold
          : null,
      manualDailySalesOverride:
        manualDailySalesOverride !== null && manualDailySalesOverride >= 0
          ? String(manualDailySalesOverride)
          : null,
    })
    .returning();

  // If opening stock provided, create OPENING_BALANCE ledger entry
  if (openingStock !== null && openingStock !== undefined && openingStock > 0) {
    await db.insert(stockLedgerEntries).values({
      userId,
      staffUserId: actorId,
      productId: product.id,
      entryType: "OPENING_BALANCE",
      quantityDelta: String(openingStock),
      unitCost: openingUnitCost !== null ? String(openingUnitCost) : null,
      supplierName: supplierName?.trim() || null,
      notes: "Shop opening balance setup",
      createdAt: new Date(),
    });
  }

  // Audit trail
  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "ADD_PRODUCT",
    description: `${actorName} added new product: "${product.name}"${openingStock ? ` with ${openingStock} ${product.unit} opening stock` : ""}`,
    entityType: "PRODUCT",
    entityId: product.id,
    newValue: product.name,
  });

  return product;
}

export async function updateProduct(params: {
  userId: number;
  productId: number;
  actorId: number;
  actorName: string;
  actorRole: "OWNER" | "STAFF";
  name?: string;
  category?: string;
  unit?: string;
  sellingPrice?: number | null;
  desiredCoverageDays?: number;
  minimumStockThreshold?: number | null;
  manualDailySalesOverride?: number | null;
}) {
  const { userId, productId, actorId, actorName, actorRole } = params;

  const [oldProd] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .limit(1);

  if (!oldProd) {
    throw new Error("Product not found or not owned.");
  }

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "PRODUCT_EDIT");
      if (params.sellingPrice !== undefined && String(params.sellingPrice) !== String(oldProd.sellingPrice)) {
        assertCan(authCtx, "SELLING_PRICE_CHANGE");
      }
    }
  }

  const updateData: Partial<typeof products.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (params.name !== undefined) updateData.name = params.name.trim();
  if (params.category !== undefined) updateData.category = params.category.trim();
  if (params.unit !== undefined) updateData.unit = params.unit.trim();
  if (params.sellingPrice !== undefined) {
    updateData.sellingPrice = params.sellingPrice !== null ? String(params.sellingPrice) : null;
  }
  if (params.desiredCoverageDays !== undefined) {
    updateData.desiredCoverageDays = Math.max(1, params.desiredCoverageDays);
  }
  if (params.minimumStockThreshold !== undefined) {
    updateData.minimumStockThreshold = params.minimumStockThreshold;
  }
  if (params.manualDailySalesOverride !== undefined) {
    updateData.manualDailySalesOverride = params.manualDailySalesOverride !== null ? String(params.manualDailySalesOverride) : null;
  }

  const [updated] = await db
    .update(products)
    .set(updateData)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .returning();

  // Audit trail for price change or config change
  if (params.sellingPrice !== undefined && String(params.sellingPrice) !== oldProd.sellingPrice) {
    await logAuditEvent({
      userId,
      actorId,
      actorName,
      actorRole,
      eventType: "PRICE_CHANGE",
      description: `${actorName} changed ${updated.name} selling price from ₦${Number(oldProd.sellingPrice || 0).toLocaleString()} to ₦${Number(params.sellingPrice || 0).toLocaleString()}`,
      entityType: "PRODUCT",
      entityId: productId,
      oldValue: oldProd.sellingPrice || "0",
      newValue: String(params.sellingPrice || 0),
    });
  } else {
    await logAuditEvent({
      userId,
      actorId,
      actorName,
      actorRole,
      eventType: "PRODUCT_SETTINGS_UPDATE",
      description: `${actorName} updated settings for ${updated.name}`,
      entityType: "PRODUCT",
      entityId: productId,
    });
  }

  return updated;
}

// ==========================================
// 3. SALE EVENT & CORRECTIONS (SELL)
// ==========================================

export async function recordSale(params: {
  userId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  productId: number;
  quantity: number;
  unitPrice?: number;
  customerId?: number | null;
  customerName?: string | null;
  amountPaid?: number;
  notes?: string;
  source?: "WEB" | "WHATSAPP";
  customDate?: Date;
}) {
  const {
    userId,
    actorId = userId,
    actorName = "Shop Operator",
    actorRole = "OWNER",
    productId,
    quantity,
    unitPrice,
    customerId,
    customerName,
    amountPaid = 0,
    notes,
    source = "WEB",
    customDate,
  } = params;

  if (quantity <= 0) {
    throw new Error("Enter a quantity greater than 0.");
  }

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "SALE_CREATE");
    }
  }

  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .limit(1);

  if (!prod) {
    throw new Error("Product not found or not owned by user.");
  }

  // Handle customer association
  let resolvedCustomerId: number | null = customerId || null;
  let resolvedCustomerName: string = "Walk-in Customer";

  if (resolvedCustomerId) {
    const [c] = await db.select().from(customers).where(eq(customers.id, resolvedCustomerId)).limit(1);
    if (c) resolvedCustomerName = c.name;
  } else if (customerName && customerName.trim()) {
    const trimmed = customerName.trim();
    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.userId, userId), eq(customers.name, trimmed)))
      .limit(1);

    if (existing) {
      resolvedCustomerId = existing.id;
      resolvedCustomerName = existing.name;
    } else {
      const [newCust] = await db
        .insert(customers)
        .values({
          userId,
          name: trimmed,
        })
        .returning();
      resolvedCustomerId = newCust.id;
      resolvedCustomerName = newCust.name;
    }
  }

  const pricePerUnit = unitPrice !== undefined && unitPrice > 0
    ? unitPrice
    : (prod.sellingPrice ? Number(prod.sellingPrice) : 0);

  const totalAmount = quantity * pricePerUnit;
  const paid = Math.min(totalAmount, Math.max(0, amountPaid));
  const outstanding = Math.max(0, totalAmount - paid);
  const paymentStatus = outstanding === 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
  const saleTime = customDate || new Date();

  // 1. Create authoritative sale record
  const [saleRecord] = await db
    .insert(sales)
    .values({
      userId,
      staffUserId: actorId,
      customerId: resolvedCustomerId,
      productId,
      quantity: String(quantity),
      unitPrice: String(pricePerUnit),
      totalAmount: String(totalAmount),
      amountPaid: String(paid),
      outstandingAmount: String(outstanding),
      paymentStatus,
      notes: notes || "Shop customer sale",
      createdAt: saleTime,
    })
    .returning();

  // 2. Append to authoritative stock ledger: delta = -Math.abs(quantity)
  const [ledgerEntry] = await db
    .insert(stockLedgerEntries)
    .values({
      userId,
      staffUserId: actorId,
      productId,
      saleId: saleRecord.id,
      entryType: "SALE",
      quantityDelta: String(-Math.abs(quantity)),
      notes: notes || (resolvedCustomerId ? `Sale to ${resolvedCustomerName}` : "Sale recorded"),
      createdAt: saleTime,
    })
    .returning();

  // 3. Audit trail
  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "SALE",
    description: `${actorName} recorded a sale of ₦${totalAmount.toLocaleString()} (${quantity} ${prod.unit} of ${prod.name} to ${resolvedCustomerName})`,
    entityType: "SALE",
    entityId: saleRecord.id,
    newValue: `₦${totalAmount}`,
    source,
  });

  return { sale: saleRecord, ledgerEntry };
}

/**
 * Record a correction to a prior sale (Immutable History: preserves original record, appends correction event)
 */
export async function recordSaleCorrection(params: {
  userId: number;
  actorId: number;
  actorName: string;
  actorRole: "OWNER" | "STAFF";
  originalSaleId: number;
  correctedQuantityDelta: number; // e.g. +2 if customer returned 2 bags, or -1 if 1 more bag was taken
  correctionReason: string;
}) {
  const { userId, actorId, actorName, actorRole, originalSaleId, correctedQuantityDelta, correctionReason } = params;

  if (!correctionReason || !correctionReason.trim()) {
    throw new Error("Please provide a reason for this sale correction.");
  }

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "SALE_CORRECTION");
    }
  }

  const [origSale] = await db
    .select()
    .from(sales)
    .where(and(eq(sales.id, originalSaleId), eq(sales.userId, userId)))
    .limit(1);

  if (!origSale) {
    throw new Error("Original sale record not found.");
  }

  const [prod] = await db.select().from(products).where(eq(products.id, origSale.productId)).limit(1);

  // Append new corrective sale transaction
  const [correctionSale] = await db
    .insert(sales)
    .values({
      userId,
      staffUserId: actorId,
      customerId: origSale.customerId,
      productId: origSale.productId,
      quantity: String(correctedQuantityDelta),
      unitPrice: origSale.unitPrice,
      totalAmount: String(correctedQuantityDelta * Number(origSale.unitPrice)),
      amountPaid: "0",
      outstandingAmount: "0",
      paymentStatus: "PAID",
      notes: `Correction to sale #${originalSaleId}: ${correctionReason}`,
      isCorrection: true,
      originalSaleId,
      correctionReason: correctionReason.trim(),
      createdAt: new Date(),
    })
    .returning();

  // Append to stock ledger (reversing or adjusting stock)
  const [ledgerCorrection] = await db
    .insert(stockLedgerEntries)
    .values({
      userId,
      staffUserId: actorId,
      productId: origSale.productId,
      saleId: correctionSale.id,
      entryType: "CORRECTION",
      quantityDelta: String(correctedQuantityDelta),
      notes: `Correction to sale #${originalSaleId}: ${correctionReason}`,
      createdAt: new Date(),
    })
    .returning();

  // Audit trail
  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "TRANSACTION_CORRECTION",
    description: `${actorName} recorded correction on sale #${originalSaleId} (${prod?.name || "Product"}): ${correctionReason}`,
    entityType: "SALE",
    entityId: originalSaleId,
    newValue: `${correctedQuantityDelta > 0 ? `+${correctedQuantityDelta}` : correctedQuantityDelta} units`,
    reason: correctionReason,
  });

  return { correctionSale, ledgerCorrection };
}

// ==========================================
// 4. RESTOCK ARRIVAL EVENT & SENSITIVE COST UPDATES (RECEIVE GOODS)
// ==========================================

export async function recordDelivery(params: {
  userId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  productId: number;
  quantityReceived: number;
  unitCost?: number | null;
  supplierName?: string | null;
  notes?: string;
  source?: "WEB" | "WHATSAPP";
  customDate?: Date;
}) {
  const {
    userId,
    actorId = userId,
    actorName = "Shop Operator",
    actorRole = "OWNER",
    productId,
    quantityReceived,
    unitCost,
    supplierName,
    notes,
    source = "WEB",
    customDate,
  } = params;

  if (quantityReceived <= 0) {
    throw new Error("Enter a received quantity greater than 0.");
  }

  let canEditCost = actorRole === "OWNER";
  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "DELIVERY_CREATE");
      canEditCost = can(authCtx, "PURCHASE_COST_EDIT");
    }
  }

  const [prod] = await db
    .select({ id: products.id, name: products.name, unit: products.unit })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .limit(1);

  if (!prod) {
    throw new Error("Product not found or not owned by user.");
  }

  // Commercial Sensitivity: only save unitCost if user has capability
  const validatedCost = canEditCost && unitCost !== null && unitCost !== undefined && unitCost > 0
    ? String(unitCost)
    : null;

  const [entry] = await db
    .insert(stockLedgerEntries)
    .values({
      userId,
      staffUserId: actorId,
      productId,
      entryType: "RESTOCK",
      quantityDelta: String(Math.abs(quantityReceived)),
      unitCost: validatedCost,
      supplierName: supplierName?.trim() || null,
      notes: notes || "Goods delivery received",
      createdAt: customDate || new Date(),
    })
    .returning();

  // Audit trail (without exposing unitCost if staff)
  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "DELIVERY",
    description: `${actorName} received +${quantityReceived} ${prod.unit} of "${prod.name}"${supplierName ? ` from ${supplierName}` : ""}`,
    entityType: "DELIVERY",
    entityId: entry.id,
    newValue: `+${quantityReceived} ${prod.unit}`,
    source,
  });

  return entry;
}

/**
 * Owner updates purchase cost for a past delivery (Commercial Sensitivity: Owner only)
 */
export async function updateDeliveryPurchaseCost(params: {
  userId: number;
  actorId: number;
  actorName: string;
  actorRole: "OWNER" | "STAFF";
  ledgerEntryId: number;
  unitCost: number;
}) {
  const { userId, actorId, actorName, actorRole, ledgerEntryId, unitCost } = params;

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "PURCHASE_COST_EDIT");
    } else if (actorRole !== "OWNER") {
      throw new Error("Only authorized personnel can record or edit purchase costs.");
    }
  } else if (actorRole !== "OWNER") {
    throw new Error("Only authorized personnel can record or edit purchase costs.");
  }

  if (unitCost <= 0) {
    throw new Error("Enter a valid unit purchase cost greater than 0.");
  }

  const [entry] = await db
    .select()
    .from(stockLedgerEntries)
    .where(and(eq(stockLedgerEntries.id, ledgerEntryId), eq(stockLedgerEntries.userId, userId)))
    .limit(1);

  if (!entry || entry.entryType !== "RESTOCK") {
    throw new Error("Delivery restock entry not found.");
  }

  const [updated] = await db
    .update(stockLedgerEntries)
    .set({
      unitCost: String(unitCost),
    })
    .where(and(eq(stockLedgerEntries.id, ledgerEntryId), eq(stockLedgerEntries.userId, userId)))
    .returning();

  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "DELIVERY_COST_UPDATE",
    description: `${actorName} recorded/updated purchase price to ₦${unitCost.toLocaleString()} on delivery #${ledgerEntryId}`,
    entityType: "DELIVERY",
    entityId: ledgerEntryId,
    oldValue: entry.unitCost ? `₦${entry.unitCost}` : "None",
    newValue: `₦${unitCost}`,
    isSensitive: true,
  });

  return updated;
}

// ==========================================
// 5. PHYSICAL STOCK COUNT (ADJUSTMENT)
// ==========================================

export async function recordStockCount(params: {
  userId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  productId: number;
  physicalCount: number;
  notes?: string;
}) {
  const {
    userId,
    actorId = userId,
    actorName = "Shop Operator",
    actorRole = "OWNER",
    productId,
    physicalCount,
    notes,
  } = params;

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "STOCK_COUNT");
    }
  }

  const [prod] = await db
    .select({ id: products.id, name: products.name, unit: products.unit })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.userId, userId)))
    .limit(1);

  if (!prod) {
    throw new Error("Product not found or not owned by user.");
  }

  const entries = await db
    .select({ delta: stockLedgerEntries.quantityDelta })
    .from(stockLedgerEntries)
    .where(and(eq(stockLedgerEntries.productId, productId), eq(stockLedgerEntries.userId, userId)));

  const currentSystemStock = entries.reduce(
    (sum, e) => sum + Number(e.delta || 0),
    0
  );

  const adjustmentDelta = physicalCount - currentSystemStock;

  const [entry] = await db
    .insert(stockLedgerEntries)
    .values({
      userId,
      staffUserId: actorId,
      productId,
      entryType: "ADJUSTMENT",
      quantityDelta: String(adjustmentDelta),
      notes:
        notes ||
        `Physical count: ${physicalCount} ${prod.unit} (system was ${currentSystemStock}, difference: ${
          adjustmentDelta >= 0 ? `+${adjustmentDelta}` : adjustmentDelta
        })`,
      createdAt: new Date(),
    })
    .returning();

  // Audit trail
  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "STOCK_COUNT",
    description: `${actorName} counted ${prod.name}: physical ${physicalCount} ${prod.unit} (Difference: ${
      adjustmentDelta === 0 ? "matches perfectly" : adjustmentDelta > 0 ? `+${adjustmentDelta} more` : `${Math.abs(adjustmentDelta)} fewer`
    })`,
    entityType: "STOCK",
    entityId: productId,
    oldValue: String(currentSystemStock),
    newValue: String(physicalCount),
    reason: notes,
  });

  return { entry, currentSystemStock, physicalCount, adjustmentDelta };
}

// ==========================================
// 6. CUSTOMER DEBT & PAYMENTS (COLLECT)
// ==========================================

export async function getAllCustomers(userId: number): Promise<EnrichedCustomer[]> {
  const allCustomers = await db
    .select()
    .from(customers)
    .where(eq(customers.userId, userId))
    .orderBy(asc(customers.name));

  if (allCustomers.length === 0) {
    return [];
  }

  const userSales = await db
    .select()
    .from(sales)
    .where(eq(sales.userId, userId));

  const userPayments = await db
    .select()
    .from(customerPayments)
    .where(eq(customerPayments.userId, userId));

  return allCustomers.map((cust) => {
    const custSales = userSales.filter((s) => s.customerId === cust.id);
    const custPayments = userPayments.filter((p) => p.customerId === cust.id);

    const totalCreditFromSales = custSales.reduce(
      (sum, s) => sum + Number(s.outstandingAmount || 0),
      0
    );

    const totalAdditionalPayments = custPayments.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0
    );

    const { outstandingBalance, isOverdue } = calculateCustomerDebt({
      creditSalesAmount: totalCreditFromSales,
      paymentsReceivedAmount: totalAdditionalPayments,
    });

    const totalPaid = custSales.reduce((sum, s) => sum + Number(s.amountPaid || 0), 0) + totalAdditionalPayments;

    return {
      ...cust,
      totalCreditSales: totalCreditFromSales,
      totalPaid,
      outstandingBalance,
      isOverdue,
      salesCount: custSales.length,
    };
  });
}

export async function recordCustomerPayment(params: {
  userId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  customerId: number;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  source?: "WEB" | "WHATSAPP";
}) {
  const {
    userId,
    actorId = userId,
    actorName = "Shop Operator",
    actorRole = "OWNER",
    customerId,
    amount,
    paymentMethod = "CASH",
    notes,
    source = "WEB",
  } = params;

  if (amount <= 0) {
    throw new Error("Enter a payment amount greater than 0.");
  }

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "PAYMENT_CREATE");
    }
  }

  const [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.userId, userId)))
    .limit(1);

  if (!cust) {
    throw new Error("Customer not found or not owned by user.");
  }

  const [payment] = await db
    .insert(customerPayments)
    .values({
      userId,
      staffUserId: actorId,
      customerId,
      amount: String(amount),
      paymentMethod,
      notes: notes || `Debt recovery payment from ${cust.name}`,
      createdAt: new Date(),
    })
    .returning();

  // Audit trail
  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "PAYMENT",
    description: `${actorName} collected ₦${amount.toLocaleString()} from ${cust.name} (${paymentMethod})`,
    entityType: "PAYMENT",
    entityId: payment.id,
    newValue: `₦${amount}`,
    source,
  });

  return payment;
}

// ==========================================
// 7. OPERATING EXPENSES (SHOP COSTS)
// ==========================================

export async function getAllExpenses(userId: number): Promise<Expense[]> {
  return db
    .select()
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .orderBy(desc(expenses.createdAt));
}

export async function recordExpense(params: {
  userId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  title: string;
  category?: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
}) {
  const {
    userId,
    actorId = userId,
    actorName = "Shop Operator",
    actorRole = "OWNER",
    title,
    category = "Shop Operations",
    amount,
    paymentMethod = "CASH",
    notes,
  } = params;

  if (!title || !title.trim()) {
    throw new Error("Please enter what this money was spent on.");
  }
  if (amount <= 0) {
    throw new Error("Enter an expense amount greater than 0.");
  }

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "EXPENSE_CREATE");
    }
  }

  const [newExp] = await db
    .insert(expenses)
    .values({
      userId,
      staffUserId: actorId,
      title: title.trim(),
      category: category.trim(),
      amount: String(amount),
      paymentMethod,
      notes: notes?.trim() || undefined,
      createdAt: new Date(),
    })
    .returning();

  // Audit trail
  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "EXPENSE",
    description: `${actorName} recorded expense: "${newExp.title}" (₦${amount.toLocaleString()} via ${paymentMethod})`,
    entityType: "EXPENSE",
    entityId: newExp.id,
    newValue: `₦${amount}`,
  });

  return newExp;
}

// ==========================================
// 8. DAILY BUSINESS CASH CHECK
// ==========================================

export async function recordDailyCashCheck(params: {
  userId: number;
  actorId: number;
  actorName: string;
  actorRole: "OWNER" | "STAFF";
  checkDate: string; // YYYY-MM-DD
  actualCash: number;
  notes?: string;
}): Promise<DailyCashCheck> {
  const { userId, actorId, actorName, actorRole, checkDate, actualCash, notes } = params;

  if (actorId) {
    const authCtx = await getAuthContextForUser(actorId, actorRole);
    if (authCtx) {
      assertCan(authCtx, "CASH_CHECK_CREATE");
    }
  }

  const startOfDay = new Date(`${checkDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${checkDate}T23:59:59.999Z`);

  // Today's cash sales
  const todaySales = await db
    .select({ amountPaid: sales.amountPaid })
    .from(sales)
    .where(
      and(
        eq(sales.userId, userId),
        sql`${sales.createdAt} >= ${startOfDay}`,
        sql`${sales.createdAt} <= ${endOfDay}`
      )
    );
  const salesCash = todaySales.reduce((sum, s) => sum + Number(s.amountPaid || 0), 0);

  // Today's debt recovery payments
  const todayPayments = await db
    .select({ amount: customerPayments.amount })
    .from(customerPayments)
    .where(
      and(
        eq(customerPayments.userId, userId),
        sql`${customerPayments.createdAt} >= ${startOfDay}`,
        sql`${customerPayments.createdAt} <= ${endOfDay}`
      )
    );
  const debtRecoveredCash = todayPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Today's cash expenses
  const todayExpenses = await db
    .select({ amount: expenses.amount, paymentMethod: expenses.paymentMethod })
    .from(expenses)
    .where(
      and(
        eq(expenses.userId, userId),
        sql`${expenses.createdAt} >= ${startOfDay}`,
        sql`${expenses.createdAt} <= ${endOfDay}`
      )
    );
  const expenseCash = todayExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  const expectedCash = salesCash + debtRecoveredCash - expenseCash;
  const difference = actualCash - expectedCash;

  const [check] = await db
    .insert(dailyCashChecks)
    .values({
      userId,
      actorId,
      actorName,
      checkDate,
      expectedCash: String(expectedCash),
      actualCash: String(actualCash),
      difference: String(difference),
      notes: notes?.trim() || undefined,
      createdAt: new Date(),
    })
    .returning();

  await logAuditEvent({
    userId,
    actorId,
    actorName,
    actorRole,
    eventType: "DAILY_CASH_CHECK",
    description: `${actorName} recorded daily cash check: Actual ₦${actualCash.toLocaleString()} vs Expected ₦${expectedCash.toLocaleString()} (Difference: ${
      difference === 0 ? "matches exactly" : `₦${Math.abs(difference).toLocaleString()}`
    })`,
    entityType: "CASH_CHECK",
    entityId: check.id,
    oldValue: String(expectedCash),
    newValue: String(actualCash),
    reason: notes,
  });

  return check;
}

export async function getDailyCashChecks(userId: number, limit: number = 14): Promise<DailyCashCheck[]> {
  return db
    .select()
    .from(dailyCashChecks)
    .where(eq(dailyCashChecks.userId, userId))
    .orderBy(desc(dailyCashChecks.createdAt))
    .limit(limit);
}

// ==========================================
// 9. BUSINESS EXCEPTIONS DETECTION
// ==========================================

export async function getBusinessExceptions(
  userId: number,
  userRole: "OWNER" | "STAFF" = "OWNER"
): Promise<BusinessException[]> {
  const exceptions: BusinessException[] = [];

  // 1. Negative Stock
  const allProducts = await getAllEnrichedProducts(userId, userRole);
  const negativeProds = allProducts.filter((p) => p.currentStock < 0);
  for (const p of negativeProds) {
    exceptions.push({
      id: `neg_${p.id}`,
      type: "NEGATIVE_STOCK",
      severity: "URGENT",
      title: `${p.name}: ${p.currentStock} ${p.unit} (Below Zero)`,
      description: "Sales were recorded when recorded stock was empty. A physical count is required to correct the balance.",
      actionText: "Count Stock",
      actionTab: "STOCK",
    });
  }

  // 2. Urgent Stock (Running out)
  const urgentProds = allProducts.filter((p) => p.intelligence.status === "RUNNING_LOW" && p.currentStock >= 0);
  for (const p of urgentProds.slice(0, 3)) {
    const days = p.intelligence.daysRemaining !== null ? Math.round(p.intelligence.daysRemaining) : null;
    exceptions.push({
      id: `urgent_${p.id}`,
      type: "LOW_STOCK",
      severity: "URGENT",
      title: `${p.name}: ${p.currentStock} ${p.unit} Left`,
      description: days !== null ? `About ${days} days remaining based on recent sales.` : "Approaching minimum stock level.",
      actionText: `Buy ${p.intelligence.suggestedPurchaseQuantity}`,
      actionTab: "BUYING",
    });
  }

  // 3. Overdue Debt
  const allCustomers = await getAllCustomers(userId);
  const highDebtors = allCustomers.filter((c) => c.outstandingBalance >= 50000);
  for (const c of highDebtors.slice(0, 2)) {
    exceptions.push({
      id: `debt_${c.id}`,
      type: "OVERDUE_DEBT",
      severity: "ATTENTION",
      title: `${c.name} Owes ₦${c.outstandingBalance.toLocaleString()}`,
      description: "Customer has a pending credit balance waiting for collection.",
      actionText: "Collect Debt",
      actionTab: "DEBT",
    });
  }

  // 4. Missing Purchase Cost (Only visible to OWNER)
  if (userRole === "OWNER") {
    const prodsWithoutCost = allProducts.filter(
      (p) => !p.lastSupplierInfo?.unitCost || p.lastSupplierInfo.unitCost === 0
    );
    if (prodsWithoutCost.length > 0) {
      exceptions.push({
        id: "missing_costs",
        type: "MISSING_COST",
        severity: "INFO",
        title: `${prodsWithoutCost.length} Products Missing Purchase Prices`,
        description: "Record delivery purchase costs to calculate exact Cost of Goods Sold and Net Profit.",
        actionText: "Update Costs",
        actionTab: "STOCK",
      });
    }
  }

  // 5. Stock Check Recency
  const lastCounts = await db
    .select()
    .from(stockLedgerEntries)
    .where(and(eq(stockLedgerEntries.userId, userId), eq(stockLedgerEntries.entryType, "ADJUSTMENT")))
    .orderBy(desc(stockLedgerEntries.createdAt))
    .limit(1);

  if (lastCounts.length === 0) {
    exceptions.push({
      id: "no_counts",
      type: "UNCHECKED_STOCK",
      severity: "ATTENTION",
      title: "Physical Stock Has Not Been Counted Yet",
      description: "Perform your first shop stock check to reconcile physical goods with system numbers.",
      actionText: "Start Stock Check",
      actionTab: "HOME",
    });
  } else {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastCounts[0].createdAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSince > 14) {
      exceptions.push({
        id: "old_count",
        type: "UNCHECKED_STOCK",
        severity: "ATTENTION",
        title: `Stock Not Counted for ${daysSince} Days`,
        description: "Weekly counting helps prevent discrepancies from building up unnoticed.",
        actionText: "Check Stock",
        actionTab: "HOME",
      });
    }
  }

  // 6. Latest Cash Check Discrepancy (Owner only)
  if (userRole === "OWNER") {
    const latestCashCheck = (await getDailyCashChecks(userId, 1))[0];
    if (latestCashCheck && Number(latestCashCheck.difference) !== 0) {
      const diff = Number(latestCashCheck.difference);
      exceptions.push({
        id: `cash_diff_${latestCashCheck.id}`,
        type: "CASH_DISCREPANCY",
        severity: "ATTENTION",
        title: `Cash Difference on ${latestCashCheck.checkDate}: ₦${Math.abs(diff).toLocaleString()} ${diff < 0 ? "short" : "extra"}`,
        description: "There is an unverified difference between recorded sales/expenses and actual cash.",
        actionText: "Review Check",
        actionTab: "REPORTS",
      });
    }
  }

  return exceptions;
}

// ==========================================
// 10. BUSINESS REPORTS & PERIOD SUMMARIES
// ==========================================

export async function getBusinessPeriodReport(
  userId: number,
  days: number = 7,
  userRole: "OWNER" | "STAFF" = "OWNER"
): Promise<{
  metrics: BusinessPeriodMetrics;
  topDebtors: EnrichedCustomer[];
  urgentStockItems: EnrichedProduct[];
  recentActivities: Array<Omit<StockLedgerEntry, "unitCost"> & { unitCost: string | null }>;
}> {
  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  // 1. Fetch sales in window
  const allSales = await db
    .select()
    .from(sales)
    .where(and(eq(sales.userId, userId), sql`${sales.createdAt} >= ${periodStart}`));

  // 2. Fetch payments in window
  const allPayments = await db
    .select()
    .from(customerPayments)
    .where(and(eq(customerPayments.userId, userId), sql`${customerPayments.createdAt} >= ${periodStart}`));

  // 3. Fetch expenses in window
  const allExpenses = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.userId, userId), sql`${expenses.createdAt} >= ${periodStart}`));

  // 4. Fetch deliveries in window
  const allDeliveries = await db
    .select()
    .from(stockLedgerEntries)
    .where(
      and(
        eq(stockLedgerEntries.userId, userId),
        eq(stockLedgerEntries.entryType, "RESTOCK"),
        sql`${stockLedgerEntries.createdAt} >= ${periodStart}`
      )
    );

  // 5. Fetch adjustments in window
  const adjustments = await db
    .select()
    .from(stockLedgerEntries)
    .where(
      and(
        eq(stockLedgerEntries.userId, userId),
        eq(stockLedgerEntries.entryType, "ADJUSTMENT"),
        sql`${stockLedgerEntries.createdAt} >= ${periodStart}`
      )
    );

  // Build product cost map (weighted average purchase cost or most recent known unitCost per product)
  const allLedger = await db
    .select({
      productId: stockLedgerEntries.productId,
      unitCost: stockLedgerEntries.unitCost,
      quantityDelta: stockLedgerEntries.quantityDelta,
      entryType: stockLedgerEntries.entryType,
    })
    .from(stockLedgerEntries)
    .where(eq(stockLedgerEntries.userId, userId));

  const productCosts = new Map<number, number>();
  const productWeightedTotals = new Map<number, { totalQty: number; totalValue: number }>();

  for (const l of allLedger) {
    if (l.unitCost && Number(l.unitCost) > 0) {
      const qty = Math.abs(Number(l.quantityDelta || 0));
      const cost = Number(l.unitCost);
      const cur = productWeightedTotals.get(l.productId) || { totalQty: 0, totalValue: 0 };
      cur.totalQty += qty;
      cur.totalValue += qty * cost;
      productWeightedTotals.set(l.productId, cur);
    }
  }

  for (const [pId, val] of productWeightedTotals.entries()) {
    if (val.totalQty > 0) {
      productCosts.set(pId, Math.round((val.totalValue / val.totalQty) * 100) / 100);
    }
  }

  const lastAdjustment = adjustments.length > 0 ? new Date(adjustments[0].createdAt) : null;

  const allProducts = await getAllEnrichedProducts(userId, userRole);
  const lowStockCount = allProducts.filter(
    (p) => p.intelligence.status === "RUNNING_LOW" || p.intelligence.status === "CHECK_SOON"
  ).length;

  const urgentStockItems = allProducts.filter((p) => p.intelligence.status === "RUNNING_LOW");

  const allCust = await getAllCustomers(userId);
  const topDebtors = allCust
    .filter((c) => c.outstandingBalance > 0)
    .sort((a, b) => b.outstandingBalance - a.outstandingBalance);

  const priorDebt = topDebtors.reduce((sum, c) => sum + c.outstandingBalance, 0);

  const metrics = calculatePeriodSummary({
    sales: allSales.map((s) => ({
      totalAmount: Number(s.totalAmount),
      amountPaid: Number(s.amountPaid),
      outstandingAmount: Number(s.outstandingAmount),
      quantity: Number(s.quantity),
      productId: s.productId,
      createdAt: new Date(s.createdAt),
    })),
    payments: allPayments.map((p) => ({
      amount: Number(p.amount),
      paymentDate: new Date(p.createdAt),
    })),
    expenses: allExpenses.map((e) => ({
      amount: Number(e.amount),
      createdAt: new Date(e.createdAt),
    })),
    deliveries: allDeliveries.map((d) => ({
      productId: d.productId,
      quantityDelta: Number(d.quantityDelta),
      unitCost: d.unitCost ? Number(d.unitCost) : null,
      createdAt: new Date(d.createdAt),
    })),
    productCosts,
    adjustmentsCount: adjustments.length,
    lowStockCount,
    lastStockCheckDate: lastAdjustment,
    periodStart,
    periodEnd: now,
    priorTotalDebt: priorDebt,
  });

  // Capability-based commercial sensitivity redaction
  const authCtx = await getAuthContextForUser(userId, userRole);
  const canSeePurchaseCost = authCtx ? can(authCtx, "PURCHASE_COST_VIEW") : userRole === "OWNER";
  const canSeeReports = authCtx ? can(authCtx, "REPORT_VIEW") : true;

  if (!canSeePurchaseCost || !canSeeReports) {
    metrics.costOfGoodsSold = 0;
    metrics.restockExpenditure = 0;
    metrics.totalMoneySpent = metrics.operatingExpenses;
    metrics.estimatedProfit = null;
    metrics.profitBreakdown = null;
    metrics.profitConfidenceWarning = undefined;
  }

  const rawActivities = await db
    .select()
    .from(stockLedgerEntries)
    .where(eq(stockLedgerEntries.userId, userId))
    .orderBy(desc(stockLedgerEntries.createdAt))
    .limit(20);

  const recentActivities = rawActivities.map((a) => ({
    ...a,
    unitCost: canSeePurchaseCost ? a.unitCost : null,
  }));

  return {
    metrics,
    topDebtors,
    urgentStockItems,
    recentActivities,
  };
}

// ==========================================
// 11. DATA EXPORT (OWNER ONLY)
// ==========================================

export async function exportBusinessData(
  userId: number,
  actorId?: number,
  actorRole?: "OWNER" | "STAFF"
) {
  const authCtx = await getAuthContextForUser(actorId || userId, actorRole);
  if (authCtx) {
    assertCan(authCtx, "EXPORT_DATA");
  }
  const [
    allUsers,
    allProducts,
    allSales,
    allCustomers,
    allPayments,
    allExpenses,
    allLedger,
    allAudits,
    allCashChecks,
  ] = await Promise.all([
    db.select({ id: users.id, email: users.email, fullName: users.fullName, role: users.role, businessName: users.businessName }).from(users).where(eq(users.id, userId)),
    db.select().from(products).where(eq(products.userId, userId)),
    db.select().from(sales).where(eq(sales.userId, userId)),
    db.select().from(customers).where(eq(customers.userId, userId)),
    db.select().from(customerPayments).where(eq(customerPayments.userId, userId)),
    db.select().from(expenses).where(eq(expenses.userId, userId)),
    db.select().from(stockLedgerEntries).where(eq(stockLedgerEntries.userId, userId)),
    db.select().from(auditLogs).where(eq(auditLogs.userId, userId)),
    db.select().from(dailyCashChecks).where(eq(dailyCashChecks.userId, userId)),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    business: allUsers[0] || null,
    products: allProducts,
    sales: allSales,
    customers: allCustomers,
    payments: allPayments,
    expenses: allExpenses,
    stockLedger: allLedger,
    auditTrail: allAudits,
    cashChecks: allCashChecks,
  };
}

// ==========================================
// 11B. SUPPLIER HISTORY DIRECTORY
// ==========================================

export interface SupplierSummary {
  supplierName: string;
  deliveriesCount: number;
  productsSupplied: string[];
  lastDeliveryDate: Date | null;
  lastPurchaseCost: number | null; // Sanitized: null for STAFF users
  previousPrices: Array<{
    productName: string;
    unitCost: number | null;
    quantity: number;
    date: Date;
  }>;
}

export async function getSuppliersDirectory(
  userId: number,
  userRole: "OWNER" | "STAFF" = "OWNER"
): Promise<SupplierSummary[]> {
  const deliveries = await db
    .select({
      id: stockLedgerEntries.id,
      productId: stockLedgerEntries.productId,
      productName: products.name,
      productUnit: products.unit,
      entryType: stockLedgerEntries.entryType,
      quantityDelta: stockLedgerEntries.quantityDelta,
      unitCost: stockLedgerEntries.unitCost,
      supplierName: stockLedgerEntries.supplierName,
      createdAt: stockLedgerEntries.createdAt,
    })
    .from(stockLedgerEntries)
    .innerJoin(products, eq(stockLedgerEntries.productId, products.id))
    .where(
      and(
        eq(stockLedgerEntries.userId, userId),
        eq(stockLedgerEntries.entryType, "RESTOCK")
      )
    )
    .orderBy(desc(stockLedgerEntries.createdAt));

  const suppliersMap = new Map<string, typeof deliveries>();

  for (const d of deliveries) {
    if (d.supplierName && d.supplierName.trim()) {
      const key = d.supplierName.trim();
      const list = suppliersMap.get(key) || [];
      list.push(d);
      suppliersMap.set(key, list);
    }
  }

  const result: SupplierSummary[] = [];

  for (const [name, list] of suppliersMap.entries()) {
    const productsSet = new Set<string>();
    list.forEach((item) => productsSet.add(item.productName));

    const latest = list[0];
    const previousPrices = list.slice(0, 5).map((item) => ({
      productName: item.productName,
      unitCost: userRole === "OWNER" && item.unitCost ? Number(item.unitCost) : null,
      quantity: Number(item.quantityDelta),
      date: new Date(item.createdAt),
    }));

    result.push({
      supplierName: name,
      deliveriesCount: list.length,
      productsSupplied: Array.from(productsSet),
      lastDeliveryDate: latest ? new Date(latest.createdAt) : null,
      lastPurchaseCost: userRole === "OWNER" && latest?.unitCost ? Number(latest.unitCost) : null,
      previousPrices,
    });
  }

  return result.sort((a, b) => b.deliveriesCount - a.deliveriesCount);
}

// ==========================================
// 12. BUYING LIST CHECKLIST
// ==========================================

export async function getBuyingList(userId: number, userRole: "OWNER" | "STAFF" = "OWNER") {
  const items = await db
    .select({
      id: buyingListItems.id,
      productId: buyingListItems.productId,
      quantityToBuy: buyingListItems.quantityToBuy,
      isCompleted: buyingListItems.isCompleted,
      estimatedUnitCost: buyingListItems.estimatedUnitCost,
      supplierName: buyingListItems.supplierName,
      createdAt: buyingListItems.createdAt,
      productName: products.name,
      productUnit: products.unit,
      category: products.category,
    })
    .from(buyingListItems)
    .innerJoin(products, eq(buyingListItems.productId, products.id))
    .where(eq(buyingListItems.userId, userId))
    .orderBy(asc(buyingListItems.isCompleted), desc(buyingListItems.createdAt));

  return items.map((item) => ({
    ...item,
    estimatedUnitCost: userRole === "OWNER" ? item.estimatedUnitCost : null,
  }));
}

export async function addOrUpdateBuyingListItem(params: {
  userId: number;
  productId: number;
  quantityToBuy: number;
  estimatedUnitCost?: number | null;
  supplierName?: string | null;
}) {
  const { userId, productId, quantityToBuy, estimatedUnitCost, supplierName } = params;

  const existing = await db
    .select()
    .from(buyingListItems)
    .where(and(eq(buyingListItems.productId, productId), eq(buyingListItems.userId, userId)))
    .limit(1);

  if (existing.length > 0) {
    const [updated] = await db
      .update(buyingListItems)
      .set({
        quantityToBuy,
        isCompleted: false,
        estimatedUnitCost:
          estimatedUnitCost !== undefined
            ? estimatedUnitCost !== null
              ? String(estimatedUnitCost)
              : null
            : existing[0].estimatedUnitCost,
        supplierName:
          supplierName !== undefined ? supplierName : existing[0].supplierName,
        updatedAt: new Date(),
      })
      .where(and(eq(buyingListItems.id, existing[0].id), eq(buyingListItems.userId, userId)))
      .returning();
    return updated;
  }

  const [item] = await db
    .insert(buyingListItems)
    .values({
      userId,
      productId,
      quantityToBuy,
      isCompleted: false,
      estimatedUnitCost: estimatedUnitCost ? String(estimatedUnitCost) : null,
      supplierName: supplierName?.trim() || null,
    })
    .returning();

  return item;
}

export async function toggleBuyingListItem(
  userId: number,
  id: number,
  isCompleted?: boolean,
  quantityToBuy?: number
) {
  const setFields: any = { updatedAt: new Date() };
  if (isCompleted !== undefined) setFields.isCompleted = isCompleted;
  if (quantityToBuy !== undefined && Number(quantityToBuy) > 0) {
    setFields.quantityToBuy = Number(quantityToBuy);
  }

  const [updated] = await db
    .update(buyingListItems)
    .set(setFields)
    .where(and(eq(buyingListItems.id, id), eq(buyingListItems.userId, userId)))
    .returning();
  return updated;
}

export async function removeBuyingListItem(userId: number, id: number) {
  await db
    .delete(buyingListItems)
    .where(and(eq(buyingListItems.id, id), eq(buyingListItems.userId, userId)));
  return true;
}

export async function clearCompletedBuyingItems(userId: number) {
  await db
    .delete(buyingListItems)
    .where(and(eq(buyingListItems.isCompleted, true), eq(buyingListItems.userId, userId)));
  return true;
}

// ==========================================
// 13. SEED SAMPLE SHOP DEMO
// ==========================================

export async function seedBuildingMaterialDemoData(userId: number) {
  // Clear existing data for user
  await db.delete(dailyCashChecks).where(eq(dailyCashChecks.userId, userId));
  await db.delete(auditLogs).where(eq(auditLogs.userId, userId));
  await db.delete(expenses).where(eq(expenses.userId, userId));
  await db.delete(customerPayments).where(eq(customerPayments.userId, userId));
  await db.delete(sales).where(eq(sales.userId, userId));
  await db.delete(customers).where(eq(customers.userId, userId));
  await db.delete(buyingListItems).where(eq(buyingListItems.userId, userId));
  await db.delete(stockLedgerEntries).where(eq(stockLedgerEntries.userId, userId));
  await db.delete(products).where(eq(products.userId, userId));

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  // Seed sample customers
  const [cust1] = await db
    .insert(customers)
    .values({
      userId,
      name: "Engr. Patrick Site Lead",
      phone: "08031234567",
      address: "Lekki Phase 1 Project Site",
    })
    .returning();

  const [cust2] = await db
    .insert(customers)
    .values({
      userId,
      name: "Musa Plumber & Sons",
      phone: "08059876543",
      address: "Obalende Workshop",
    })
    .returning();

  const sampleProducts = [
    {
      name: "Dangote 3X Cement 50kg",
      category: "Cement & Aggregates",
      unit: "bags",
      sellingPrice: 9200,
      desiredCoverageDays: 7,
      minimumStockThreshold: 40,
      openingStock: 120,
      cost: 8500,
      supplier: "Dangote Depot Lagos",
      daysAgoCreated: 21,
      salesPattern: [
        { daysAgo: 20, qty: 10, custId: cust1.id, paid: 92000, credit: 0 },
        { daysAgo: 18, qty: 15, custId: null, paid: 138000, credit: 0 },
        { daysAgo: 15, qty: 12, custId: cust1.id, paid: 60000, credit: 50400 },
        { daysAgo: 12, qty: 14, custId: null, paid: 128800, credit: 0 },
        { daysAgo: 10, qty: 16, custId: null, paid: 147200, credit: 0 },
        { daysAgo: 8, qty: 15, custId: cust1.id, paid: 0, credit: 138000 },
        { daysAgo: 5, qty: 18, custId: null, paid: 165600, credit: 0 },
        { daysAgo: 3, qty: 16, custId: null, paid: 147200, credit: 0 },
        { daysAgo: 1, qty: 12, custId: cust1.id, paid: 50000, credit: 60400 },
      ],
    },
    {
      name: "TMT High-Yield Rebar 12mm",
      category: "Steel & Iron Rods",
      unit: "lengths",
      sellingPrice: 6800,
      desiredCoverageDays: 10,
      minimumStockThreshold: 30,
      openingStock: 80,
      cost: 6200,
      supplier: "Kallos Steel Mills",
      daysAgoCreated: 25,
      salesPattern: [
        { daysAgo: 22, qty: 8, custId: null, paid: 54400, credit: 0 },
        { daysAgo: 19, qty: 10, custId: cust1.id, paid: 30000, credit: 38000 },
        { daysAgo: 14, qty: 12, custId: null, paid: 81600, credit: 0 },
        { daysAgo: 9, qty: 11, custId: null, paid: 74800, credit: 0 },
        { daysAgo: 4, qty: 14, custId: null, paid: 95200, credit: 0 },
        { daysAgo: 1, qty: 9, custId: null, paid: 61200, credit: 0 },
      ],
    },
    {
      name: "PVC Drainage Pipe 4-inch (3m)",
      category: "Plumbing",
      unit: "pipes",
      sellingPrice: 4800,
      desiredCoverageDays: 7,
      minimumStockThreshold: 20,
      openingStock: 45,
      cost: 4100,
      supplier: "Tiger Plastics",
      daysAgoCreated: 14,
      salesPattern: [
        { daysAgo: 12, qty: 5, custId: cust2.id, paid: 0, credit: 24000 },
        { daysAgo: 10, qty: 6, custId: cust2.id, paid: 28800, credit: 0 },
        { daysAgo: 7, qty: 4, custId: null, paid: 19200, credit: 0 },
        { daysAgo: 4, qty: 6, custId: cust2.id, paid: 10000, credit: 18800 },
        { daysAgo: 2, qty: 5, custId: null, paid: 24000, credit: 0 },
      ],
    },
    {
      name: "Tiger Tile Adhesive (Extra Strength 20kg)",
      category: "Finishing & Tiles",
      unit: "bags",
      sellingPrice: 4400,
      desiredCoverageDays: 7,
      minimumStockThreshold: 25,
      openingStock: 90,
      cost: 3800,
      supplier: "Apex Building Supplies",
      daysAgoCreated: 18,
      salesPattern: [
        { daysAgo: 16, qty: 8, custId: null, paid: 35200, credit: 0 },
        { daysAgo: 12, qty: 6, custId: null, paid: 26400, credit: 0 },
        { daysAgo: 8, qty: 7, custId: null, paid: 30800, credit: 0 },
        { daysAgo: 4, qty: 5, custId: null, paid: 22000, credit: 0 },
        { daysAgo: 1, qty: 4, custId: null, paid: 17600, credit: 0 },
      ],
    },
    {
      name: "Dulux WeatherShield White Paint (20L)",
      category: "Paints & Chemicals",
      unit: "drums",
      sellingPrice: 34000,
      desiredCoverageDays: 14,
      minimumStockThreshold: 15,
      openingStock: 35,
      cost: 29500,
      supplier: "Dulux Certified Distributor",
      daysAgoCreated: 16,
      salesPattern: [
        { daysAgo: 14, qty: 2, custId: null, paid: 68000, credit: 0 },
        { daysAgo: 10, qty: 1, custId: null, paid: 34000, credit: 0 },
        { daysAgo: 7, qty: 2, custId: null, paid: 68000, credit: 0 },
        { daysAgo: 3, qty: 2, custId: null, paid: 68000, credit: 0 },
      ],
    },
    {
      name: "Corrugated Aluminum Roofing Sheet 0.45mm",
      category: "Roofing & Timber",
      unit: "sheets",
      sellingPrice: 8900,
      desiredCoverageDays: 7,
      minimumStockThreshold: 50,
      openingStock: 150,
      cost: 7800,
      supplier: "Tower Aluminum Plc",
      daysAgoCreated: 15,
      salesPattern: [
        { daysAgo: 13, qty: 15, custId: null, paid: 133500, credit: 0 },
        { daysAgo: 9, qty: 20, custId: null, paid: 178000, credit: 0 },
        { daysAgo: 5, qty: 18, custId: null, paid: 160200, credit: 0 },
        { daysAgo: 2, qty: 12, custId: null, paid: 106800, credit: 0 },
      ],
    },
    {
      name: "Ordinary Portland Sand (Tipper Load)",
      category: "Cement & Aggregates",
      unit: "trips",
      sellingPrice: 52000,
      desiredCoverageDays: 5,
      minimumStockThreshold: 5,
      openingStock: 4,
      cost: 45000,
      supplier: "Lekki Quarry Services",
      daysAgoCreated: 10,
      salesPattern: [
        { daysAgo: 8, qty: 2, custId: null, paid: 104000, credit: 0 },
        { daysAgo: 5, qty: 2, custId: null, paid: 104000, credit: 0 },
        { daysAgo: 2, qty: 1, custId: null, paid: 52000, credit: 0 },
      ],
    },
    {
      name: "Pre-treated Timber Wood 2x4 (12ft)",
      category: "Roofing & Timber",
      unit: "pieces",
      sellingPrice: 2900,
      desiredCoverageDays: 7,
      minimumStockThreshold: 60,
      openingStock: 180,
      cost: 2400,
      supplier: "Oko-Baba Timber Market",
      daysAgoCreated: 4,
      salesPattern: [
        { daysAgo: 3, qty: 15, custId: null, paid: 43500, credit: 0 },
        { daysAgo: 1, qty: 20, custId: null, paid: 58000, credit: 0 },
      ],
    },
  ];

  for (const item of sampleProducts) {
    const createdDate = new Date(now.getTime() - item.daysAgoCreated * dayMs);

    const [prod] = await db
      .insert(products)
      .values({
        userId,
        name: item.name,
        category: item.category,
        unit: item.unit,
        sellingPrice: String(item.sellingPrice),
        desiredCoverageDays: item.desiredCoverageDays,
        minimumStockThreshold: item.minimumStockThreshold,
        createdAt: createdDate,
        updatedAt: createdDate,
      })
      .returning();

    // Opening Balance
    await db.insert(stockLedgerEntries).values({
      userId,
      productId: prod.id,
      entryType: "OPENING_BALANCE",
      quantityDelta: String(item.openingStock),
      unitCost: String(item.cost),
      supplierName: item.supplier,
      notes: "Shop opening balance setup",
      createdAt: createdDate,
    });

    // Record past sales & link to ledger
    for (const s of item.salesPattern) {
      const saleDate = new Date(now.getTime() - s.daysAgo * dayMs);
      const total = s.qty * item.sellingPrice;
      const status = s.credit === 0 ? "PAID" : s.paid > 0 ? "PARTIAL" : "UNPAID";

      const [saleRec] = await db
        .insert(sales)
        .values({
          userId,
          customerId: s.custId,
          productId: prod.id,
          quantity: String(s.qty),
          unitPrice: String(item.sellingPrice),
          totalAmount: String(total),
          amountPaid: String(s.paid),
          outstandingAmount: String(s.credit),
          paymentStatus: status,
          notes: "Daily customer sale",
          createdAt: saleDate,
        })
        .returning();

      await db.insert(stockLedgerEntries).values({
        userId,
        productId: prod.id,
        saleId: saleRec.id,
        entryType: "SALE",
        quantityDelta: String(-Math.abs(s.qty)),
        notes: "Daily customer sale",
        createdAt: saleDate,
      });
    }

    // Delivery received
    if (item.name.includes("Cement")) {
      await db.insert(stockLedgerEntries).values({
        userId,
        productId: prod.id,
        entryType: "RESTOCK",
        quantityDelta: "50",
        unitCost: "8500",
        supplierName: "Dangote Depot Lagos",
        notes: "Trailer delivery received",
        createdAt: new Date(now.getTime() - 9 * dayMs),
      });
    }
  }

  // Record a customer debt recovery payment
  await db.insert(customerPayments).values({
    userId,
    customerId: cust1.id,
    amount: "70000",
    paymentMethod: "TRANSFER",
    notes: "Site lead partial payment towards cement debt",
    createdAt: new Date(now.getTime() - 2 * dayMs),
  });

  // Record realistic shop operating expenses
  await db.insert(expenses).values({
    userId,
    title: "Generator Diesel Fuel (50L)",
    category: "Shop Operations",
    amount: "65000",
    paymentMethod: "CASH",
    notes: "Weekly shop power fuel",
    createdAt: new Date(now.getTime() - 3 * dayMs),
  });

  await db.insert(expenses).values({
    userId,
    title: "Offloading Labor for Cement Trailer",
    category: "Transport & Logistics",
    amount: "25000",
    paymentMethod: "CASH",
    notes: "Offloaded 50 bags to yard",
    createdAt: new Date(now.getTime() - 9 * dayMs),
  });

  // Pre-seed buying list item for Cement
  const allProds = await db.select().from(products).where(eq(products.userId, userId));
  const cement = allProds.find((p) => p.name.includes("Cement"));
  if (cement) {
    await db.insert(buyingListItems).values({
      userId,
      productId: cement.id,
      quantityToBuy: 80,
      estimatedUnitCost: "8500",
      supplierName: "Dangote Depot Lagos",
      isCompleted: false,
    });
  }

  // Pre-seed an audit log entry
  await logAuditEvent({
    userId,
    actorId: userId,
    actorName: "Owner",
    actorRole: "OWNER",
    eventType: "INITIAL_SETUP",
    description: "Shop opened and inventory catalog initialized",
    entityType: "SYSTEM",
  });

  return true;
}
