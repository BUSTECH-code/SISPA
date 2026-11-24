import { db } from "@/db";
import {
  products,
  businesses,
  stockLedgerEntries,
  openingStockSessions,
  openingStockItems,
  pendingStockMovements,
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
  type PendingStockMovement,
  type Customer,
  type Sale,
  type CustomerPayment,
  type Expense,
  type AuditLog,
  type DailyCashCheck,
} from "@/db/schema";
import { eq, desc, and, asc, inArray, isNotNull, sql } from "drizzle-orm";
import {
  calculateStockIntelligence,
  calculateVelocity,
  type StockIntelligenceResult,
  type VerificationStatus,
} from "@/domain/intelligence";
import {
  calculateCustomerDebt,
  calculatePeriodSummary,
  type BusinessPeriodMetrics,
  type LedgerValuationEntry,
} from "@/domain/debt";
import { validateQuantityConstraints } from "@/domain/packaging";
import {
  ActiveBusinessRequiredError,
  parsePositiveBusinessId,
  getAuthContextForUser,
  requireActiveBusinessContext,
} from "@/server/authService";
import { assertCan, can } from "@/server/authorization";
import {
  acquirePendingMovementMutexes,
  acquireProductMutexes,
  acquireSaleMutexes,
  withLockedProducts,
  resolveBusinessForUser,
  resolveTransactionTimestamp,
  recordReconciledMovementInTx,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "./openingStock";

export interface EnrichedProduct extends Product {
  currentStock: number;
  pendingMovementsCount: number;
  provisionalMinStock: number | null;
  provisionalMaxStock: number | null;
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
  type:
    | "NEGATIVE_STOCK"
    | "LOW_STOCK"
    | "OVERDUE_DEBT"
    | "MISSING_COST"
    | "UNCHECKED_STOCK"
    | "CASH_DISCREPANCY"
    | "STOCK_CORRECTION";
  severity: "URGENT" | "ATTENTION" | "INFO";
  title: string;
  description: string;
  actionText: string;
  actionTab?: "HOME" | "STOCK" | "DEBT" | "BUYING" | "REPORTS" | "EXPENSES" | "ACTIVITY" | "WHATSAPP";
}

function requireValidBusinessId(businessId?: number | null): number {
  const parsed = parsePositiveBusinessId(businessId);
  if (!parsed) {
    throw new ActiveBusinessRequiredError();
  }
  return parsed;
}

function toKobo(amount: number): number {
  return Math.round(amount * 100);
}

function koboToNumericString(kobo: number): string {
  return (kobo / 100).toFixed(2);
}

// ==========================================
// 1. AUDIT TRAIL LOGGING
// ==========================================

export async function logAuditEvent(params: {
  businessId: number;
  userId?: number;
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
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
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

  let ownerUserId = params.userId;
  if (!ownerUserId) {
    const biz = await resolveBusinessForUser(actorId, parsedBizId);
    ownerUserId = biz.ownerUserId ?? actorId;
  }

  const [entry] = await db
    .insert(auditLogs)
    .values({
      businessId: parsedBizId,
      userId: ownerUserId,
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
  businessId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  limit: number = 60,
  actorId?: number
): Promise<AuditLog[]> {
  const parsedBizId = requireValidBusinessId(businessId);
  let canViewSensitive = userRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: userRole,
    });
    canViewSensitive = userRole === "STAFF" ? false : can(authCtx, "AUDIT_VIEW_SENSITIVE");
  }

  return db
    .select()
    .from(auditLogs)
    .where(
      canViewSensitive
        ? eq(auditLogs.businessId, parsedBizId)
        : and(eq(auditLogs.businessId, parsedBizId), eq(auditLogs.isSensitive, false))
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

// ==========================================
// 2. PRODUCTS & DERIVED STOCK INTELLIGENCE
// ==========================================

function normalizeDbVerificationStatus(status: unknown): VerificationStatus {
  if (status === "VERIFIED" || status === "NEEDS_RECOUNT" || status === "UNVERIFIED") {
    return status;
  }
  return "UNVERIFIED";
}

function buildProductVelocityInputs(entries: StockLedgerEntry[]) {
  return entries
    .filter((e) => e.entryType === "SALE" || e.entryType === "CORRECTION")
    .map((e) => {
      if (e.entryType === "CORRECTION") {
        // Ledger CORRECTION > 0 means returned units (reduces net sold); < 0 means additional units sold.
        return {
          quantity: -Number(e.quantityDelta),
          date: new Date(e.occurredAt),
          isCorrection: true,
        };
      }
      return {
        quantity: Math.abs(Number(e.quantityDelta)),
        date: new Date(e.occurredAt),
      };
    });
}

function computeProvisionalStockBounds(
  currentStock: number,
  pendingMovements: PendingStockMovement[]
): {
  pendingMovementsCount: number;
  provisionalMinStock: number | null;
  provisionalMaxStock: number | null;
} {
  if (pendingMovements.length === 0) {
    return {
      pendingMovementsCount: 0,
      provisionalMinStock: currentStock,
      provisionalMaxStock: currentStock,
    };
  }

  const hasPendingPhysicalCount = pendingMovements.some(
    (pm) => pm.transactionType === "ADJUSTMENT"
  );
  if (hasPendingPhysicalCount) {
    return {
      pendingMovementsCount: pendingMovements.length,
      provisionalMinStock: null,
      provisionalMaxStock: null,
    };
  }

  let minOffset = 0;
  let maxOffset = 0;
  for (const pm of pendingMovements) {
    const delta = Number(pm.quantityDelta || 0);
    if (delta < 0) minOffset += delta;
    else if (delta > 0) maxOffset += delta;
  }

  return {
    pendingMovementsCount: pendingMovements.length,
    provisionalMinStock: currentStock + minOffset,
    provisionalMaxStock: currentStock + maxOffset,
  };
}

export async function getAllEnrichedProducts(
  businessId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
): Promise<EnrichedProduct[]> {
  const parsedBizId = requireValidBusinessId(businessId);
  let canSeePurchaseCost = userRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: userRole,
    });
    canSeePurchaseCost = userRole === "STAFF" ? false : can(authCtx, "PURCHASE_COST_VIEW");
  }

  const businessProducts = await db
    .select()
    .from(products)
    .where(eq(products.businessId, parsedBizId))
    .orderBy(asc(products.name));

  if (businessProducts.length === 0) {
    return [];
  }

  const [allLedger, allPending] = await Promise.all([
    db
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.businessId, parsedBizId))
      .orderBy(desc(stockLedgerEntries.createdAt)),
    db
      .select()
      .from(pendingStockMovements)
      .where(
        and(
          eq(pendingStockMovements.businessId, parsedBizId),
          eq(pendingStockMovements.status, "PENDING_REVIEW")
        )
      ),
  ]);

  const ledgerByProduct = new Map<number, StockLedgerEntry[]>();
  for (const entry of allLedger) {
    const list = ledgerByProduct.get(entry.productId) || [];
    list.push(entry);
    ledgerByProduct.set(entry.productId, list);
  }

  const pendingByProduct = new Map<number, PendingStockMovement[]>();
  for (const pm of allPending) {
    const list = pendingByProduct.get(pm.productId) || [];
    list.push(pm);
    pendingByProduct.set(pm.productId, list);
  }

  const now = new Date();

  return businessProducts.map((prod) => {
    const entries = ledgerByProduct.get(prod.id) || [];
    const prodPending = pendingByProduct.get(prod.id) || [];

    const currentStock = entries.reduce((sum, e) => sum + Number(e.quantityDelta || 0), 0);
    const { pendingMovementsCount, provisionalMinStock, provisionalMaxStock } =
      computeProvisionalStockBounds(currentStock, prodPending);

    const productSales = buildProductVelocityInputs(entries);

    let earliestActivityDate: Date | null = null;
    if (entries.length > 0) {
      const sortedEntries = [...entries].sort(
        (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
      );
      earliestActivityDate = new Date(sortedEntries[0].occurredAt);
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
      verificationStatus: normalizeDbVerificationStatus(prod.verificationStatus),
      lastVerifiedQuantity:
        prod.lastVerifiedQuantity !== null && prod.lastVerifiedQuantity !== undefined
          ? Number(prod.lastVerifiedQuantity)
          : null,
      lastVerifiedAt: prod.lastVerifiedAt ? new Date(prod.lastVerifiedAt) : null,
    });

    const lastRestockOrOpening = [...entries]
      .filter(
        (e) =>
          (e.entryType === "RESTOCK" || e.entryType === "OPENING_BALANCE") && e.unitCost !== null
      )
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];

    const lastSupplierInfo = lastRestockOrOpening
      ? {
          supplierName: lastRestockOrOpening.supplierName,
          unitCost:
            canSeePurchaseCost && lastRestockOrOpening.unitCost
              ? Number(lastRestockOrOpening.unitCost)
              : null,
          quantity: Number(lastRestockOrOpening.quantityDelta),
          restockDate: new Date(lastRestockOrOpening.occurredAt),
        }
      : null;

    return {
      ...prod,
      currentStock,
      pendingMovementsCount,
      provisionalMinStock,
      provisionalMaxStock,
      intelligence,
      lastSupplierInfo,
    };
  });
}

export async function getProductDetails(
  businessId: number,
  productId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
): Promise<{
  product: EnrichedProduct;
  ledgerHistory: Array<Omit<StockLedgerEntry, "unitCost"> & { unitCost: string | null }>;
} | null> {
  const parsedBizId = requireValidBusinessId(businessId);
  let canSeePurchaseCost = userRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: userRole,
    });
    canSeePurchaseCost = userRole === "STAFF" ? false : can(authCtx, "PURCHASE_COST_VIEW");
  }

  const [prod] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.businessId, parsedBizId)))
    .limit(1);

  if (!prod) return null;

  const [entries, prodPending] = await Promise.all([
    db
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.productId, productId),
          eq(stockLedgerEntries.businessId, parsedBizId)
        )
      )
      .orderBy(desc(stockLedgerEntries.createdAt)),
    db
      .select()
      .from(pendingStockMovements)
      .where(
        and(
          eq(pendingStockMovements.businessId, parsedBizId),
          eq(pendingStockMovements.productId, productId),
          eq(pendingStockMovements.status, "PENDING_REVIEW")
        )
      ),
  ]);

  const currentStock = entries.reduce((sum, e) => sum + Number(e.quantityDelta || 0), 0);
  const { pendingMovementsCount, provisionalMinStock, provisionalMaxStock } =
    computeProvisionalStockBounds(currentStock, prodPending);

  const productSales = buildProductVelocityInputs(entries);

  let earliestActivityDate: Date | null = null;
  if (entries.length > 0) {
    const sorted = [...entries].sort(
      (a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()
    );
    earliestActivityDate = new Date(sorted[0].occurredAt);
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
    verificationStatus: normalizeDbVerificationStatus(prod.verificationStatus),
    lastVerifiedQuantity:
      prod.lastVerifiedQuantity !== null && prod.lastVerifiedQuantity !== undefined
        ? Number(prod.lastVerifiedQuantity)
        : null,
    lastVerifiedAt: prod.lastVerifiedAt ? new Date(prod.lastVerifiedAt) : null,
  });

  const lastRestockOrOpening = [...entries]
    .filter(
      (e) =>
        (e.entryType === "RESTOCK" || e.entryType === "OPENING_BALANCE") && e.unitCost !== null
    )
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())[0];

  const lastSupplierInfo = lastRestockOrOpening
    ? {
        supplierName: lastRestockOrOpening.supplierName,
        unitCost:
          canSeePurchaseCost && lastRestockOrOpening.unitCost
            ? Number(lastRestockOrOpening.unitCost)
            : null,
        quantity: Number(lastRestockOrOpening.quantityDelta),
        restockDate: new Date(lastRestockOrOpening.occurredAt),
      }
    : null;

  const sanitizedHistory = entries.map((e) => ({
    ...e,
    unitCost: canSeePurchaseCost ? e.unitCost : null,
  }));

  return {
    product: {
      ...prod,
      currentStock,
      pendingMovementsCount,
      provisionalMinStock,
      provisionalMaxStock,
      intelligence,
      lastSupplierInfo,
    },
    ledgerHistory: sanitizedHistory,
  };
}

export async function addProduct(params: {
  businessId: number;
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
  allowFractionalQuantity?: boolean;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
    actorId,
    actorName,
    actorRole,
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
    allowFractionalQuantity = false,
  } = params;

  if (!name || !name.trim()) {
    throw new ValidationError("PRODUCT_NAME_REQUIRED", "Please enter a product name.");
  }
  if (
    sellingPrice !== null &&
    sellingPrice !== undefined &&
    (!Number.isFinite(sellingPrice) || sellingPrice < 0)
  ) {
    throw new ValidationError(
      "INVALID_SELLING_PRICE",
      "Selling price must be a valid non-negative number."
    );
  }
  if (
    openingStock !== null &&
    openingStock !== undefined &&
    (!Number.isFinite(openingStock) || openingStock < 0)
  ) {
    throw new ValidationError(
      "INVALID_OPENING_STOCK",
      "Opening stock must be a valid non-negative number."
    );
  }
  if (
    openingUnitCost !== null &&
    openingUnitCost !== undefined &&
    (!Number.isFinite(openingUnitCost) || openingUnitCost < 0)
  ) {
    throw new ValidationError(
      "INVALID_OPENING_UNIT_COST",
      "Opening unit cost must be a valid non-negative number."
    );
  }

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;

  let resolvedActorId = actorId ?? ownerUserId;
  let resolvedActorName = actorName || "Owner";
  let resolvedActorRole: "OWNER" | "STAFF" = actorRole || "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "PRODUCT_CREATE", { businessId: parsedBizId });
    resolvedActorId = authCtx.userId;
    resolvedActorName = actorName || authCtx.fullName;
    resolvedActorRole = authCtx.membership.role;
  }

  const resolvedUnit = unit.trim() || "units";

  return await db.transaction(async (tx) => {
    const now = new Date();
    const [product] = await tx
      .insert(products)
      .values({
        userId: ownerUserId,
        businessId: parsedBizId,
        name: name.trim(),
        category: category.trim() || "General",
        unit: resolvedUnit,
        stockUnit: resolvedUnit,
        allowFractionalQuantity: Boolean(allowFractionalQuantity),
        verificationStatus: "UNVERIFIED",
        sellingPrice:
          sellingPrice !== null && sellingPrice !== undefined ? String(sellingPrice) : null,
        desiredCoverageDays: desiredCoverageDays > 0 ? desiredCoverageDays : 7,
        minimumStockThreshold:
          minimumStockThreshold !== null && minimumStockThreshold >= 0
            ? minimumStockThreshold
            : null,
        manualDailySalesOverride:
          manualDailySalesOverride !== null && manualDailySalesOverride >= 0
            ? String(manualDailySalesOverride)
            : null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (openingStock !== null && openingStock !== undefined && openingStock > 0) {
      await tx.insert(stockLedgerEntries).values({
        businessId: parsedBizId,
        userId: ownerUserId,
        staffUserId: resolvedActorId,
        productId: product.id,
        entryType: "OPENING_BALANCE",
        quantityDelta: String(openingStock),
        unitCost:
          openingUnitCost !== null && openingUnitCost !== undefined
            ? String(openingUnitCost)
            : null,
        supplierName: supplierName?.trim() || null,
        notes: "Initial opening balance (unverified catalog setup)",
        occurredAt: now,
        createdAt: now,
      });
    }

    await tx.insert(auditLogs).values({
      userId: ownerUserId,
      businessId: parsedBizId,
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      actorRole: resolvedActorRole,
      eventType: "ADD_PRODUCT",
      description: `${resolvedActorName} added new product: "${product.name}"${
        openingStock ? ` with ${openingStock} ${product.unit} opening stock` : ""
      }`,
      entityType: "PRODUCT",
      entityId: product.id,
      newValue: product.name,
      source: "WEB",
      createdAt: now,
    });

    return product;
  });
}

export async function updateProduct(params: {
  businessId: number;
  productId: number;
  actorId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  name?: string;
  category?: string;
  unit?: string;
  sellingPrice?: number | null;
  desiredCoverageDays?: number;
  minimumStockThreshold?: number | null;
  manualDailySalesOverride?: number | null;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const { productId, actorId, actorName, actorRole } = params;

  const [oldProd] = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.businessId, parsedBizId)))
    .limit(1);

  if (!oldProd) {
    throw new NotFoundError("PRODUCT_NOT_FOUND", "Product not found or not owned by this business.");
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
    explicitRole: actorRole,
  });

  const resolvedActorName = actorName || authCtx.fullName;
  const resolvedActorRole = authCtx.membership.role;

  const isPriceChanging =
    params.sellingPrice !== undefined &&
    String(params.sellingPrice) !== String(oldProd.sellingPrice);

  const isNonPriceChanging =
    (params.name !== undefined && params.name.trim() !== oldProd.name) ||
    (params.category !== undefined && params.category.trim() !== oldProd.category) ||
    (params.unit !== undefined && params.unit.trim() !== oldProd.unit) ||
    (params.desiredCoverageDays !== undefined &&
      params.desiredCoverageDays !== oldProd.desiredCoverageDays) ||
    (params.minimumStockThreshold !== undefined &&
      params.minimumStockThreshold !== oldProd.minimumStockThreshold) ||
    (params.manualDailySalesOverride !== undefined &&
      params.manualDailySalesOverride !==
        (oldProd.manualDailySalesOverride ? Number(oldProd.manualDailySalesOverride) : null));

  if (isNonPriceChanging) {
    assertCan(authCtx, "PRODUCT_EDIT", { businessId: parsedBizId });
  }
  if (isPriceChanging) {
    assertCan(authCtx, "SELLING_PRICE_CHANGE", { businessId: parsedBizId });
  }

  const updateData: Partial<typeof products.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (params.name !== undefined) updateData.name = params.name.trim();
  if (params.category !== undefined) updateData.category = params.category.trim();
  if (params.unit !== undefined) updateData.unit = params.unit.trim();
  if (params.sellingPrice !== undefined) {
    updateData.sellingPrice =
      params.sellingPrice !== null ? String(params.sellingPrice) : null;
  }
  if (params.desiredCoverageDays !== undefined) {
    updateData.desiredCoverageDays = Math.max(1, params.desiredCoverageDays);
  }
  if (params.minimumStockThreshold !== undefined) {
    updateData.minimumStockThreshold = params.minimumStockThreshold;
  }
  if (params.manualDailySalesOverride !== undefined) {
    updateData.manualDailySalesOverride =
      params.manualDailySalesOverride !== null ? String(params.manualDailySalesOverride) : null;
  }

  const [updated] = await db
    .update(products)
    .set(updateData)
    .where(and(eq(products.id, productId), eq(products.businessId, parsedBizId)))
    .returning();

  if (params.sellingPrice !== undefined && String(params.sellingPrice) !== oldProd.sellingPrice) {
    await logAuditEvent({
      businessId: parsedBizId,
      userId: oldProd.userId,
      actorId,
      actorName: resolvedActorName,
      actorRole: resolvedActorRole,
      eventType: "PRICE_CHANGE",
      description: `${resolvedActorName} changed ${updated.name} selling price from ₦${Number(
        oldProd.sellingPrice || 0
      ).toLocaleString()} to ₦${Number(params.sellingPrice || 0).toLocaleString()}`,
      entityType: "PRODUCT",
      entityId: productId,
      oldValue: oldProd.sellingPrice || "0",
      newValue: String(params.sellingPrice || 0),
    });
  } else {
    await logAuditEvent({
      businessId: parsedBizId,
      userId: oldProd.userId,
      actorId,
      actorName: resolvedActorName,
      actorRole: resolvedActorRole,
      eventType: "PRODUCT_SETTINGS_UPDATE",
      description: `${resolvedActorName} updated settings for ${updated.name}`,
      entityType: "PRODUCT",
      entityId: productId,
    });
  }

  return updated;
}

/**
 * Restrictive product deletion policy preserving historical ledger, sales, pending movements, and stocktake evidence.
 */
export async function deleteProduct(params: {
  businessId: number;
  productId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
}): Promise<{ deleted: true; productId: number }> {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const { productId, actorId, actorName, actorRole } = params;

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;

  let resolvedActorId = actorId ?? ownerUserId;
  let resolvedActorName = actorName || "Owner";
  let resolvedActorRole: "OWNER" | "STAFF" = actorRole || "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "PRODUCT_EDIT", { businessId: parsedBizId });
    resolvedActorId = authCtx.userId;
    resolvedActorName = actorName || authCtx.fullName;
    resolvedActorRole = authCtx.membership.role;
  } else if (actorRole && actorRole !== "OWNER") {
    throw new Error("FORBIDDEN_PRODUCT_EDIT");
  }

  return await withLockedProducts(parsedBizId, [productId], async (tx, [prod]) => {
    const [hasLedger] = await tx
      .select({ id: stockLedgerEntries.id })
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.productId, prod.id),
          eq(stockLedgerEntries.businessId, parsedBizId)
        )
      )
      .limit(1);

    if (hasLedger) {
      throw new ConflictError(
        "PRODUCT_HAS_HISTORY",
        "PRODUCT_HAS_HISTORY: Cannot delete this product because it has stock ledger history that must be preserved."
      );
    }

    const [hasSale] = await tx
      .select({ id: sales.id })
      .from(sales)
      .where(and(eq(sales.productId, prod.id), eq(sales.businessId, parsedBizId)))
      .limit(1);

    if (hasSale) {
      throw new ConflictError(
        "PRODUCT_HAS_HISTORY",
        "PRODUCT_HAS_HISTORY: Cannot delete this product because it has historical sales records that must be preserved."
      );
    }

    const [hasPending] = await tx
      .select({ id: pendingStockMovements.id })
      .from(pendingStockMovements)
      .where(
        and(
          eq(pendingStockMovements.productId, prod.id),
          eq(pendingStockMovements.businessId, parsedBizId)
        )
      )
      .limit(1);

    if (hasPending) {
      throw new ConflictError(
        "PRODUCT_HAS_HISTORY",
        "PRODUCT_HAS_HISTORY: Cannot delete this product because it has pending movement records that must be preserved."
      );
    }

    const [hasStocktakeItem] = await tx
      .select({ id: openingStockItems.id })
      .from(openingStockItems)
      .where(eq(openingStockItems.productId, prod.id))
      .limit(1);

    if (hasStocktakeItem) {
      throw new ConflictError(
        "PRODUCT_HAS_HISTORY",
        "PRODUCT_HAS_HISTORY: Cannot delete this product because it is referenced by stocktake session evidence."
      );
    }

    const now = new Date();
    await tx
      .delete(products)
      .where(and(eq(products.id, prod.id), eq(products.businessId, parsedBizId)));

    await tx.insert(auditLogs).values({
      userId: prod.userId,
      businessId: parsedBizId,
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      actorRole: resolvedActorRole,
      eventType: "PRODUCT_DELETED",
      description: `${resolvedActorName} deleted unused product "${prod.name}"`,
      entityType: "PRODUCT",
      entityId: prod.id,
      oldValue: prod.name,
      source: "WEB",
      createdAt: now,
    });

    return { deleted: true, productId: prod.id };
  });
}

// ==========================================
// 3. SALE EVENT & CORRECTIONS (SELL)
// ==========================================

export async function recordSale(params: {
  businessId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  productId?: number;
  quantity?: number;
  unitPrice?: number;
  items?: Array<{
    productId: number;
    quantity: number;
    unitPrice?: number;
  }>;
  customerId?: number | null;
  customerName?: string | null;
  amountPaid?: number;
  notes?: string;
  source?: "WEB" | "WHATSAPP";
  customDate?: Date;
  occurredAt?: Date | string;
  clientTimestamp?: Date | string;
  isOfflineSync?: boolean;
  idempotencyKey?: string | null;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
    actorId,
    actorName,
    actorRole,
    customerId,
    customerName,
    amountPaid = 0,
    notes,
    source = "WEB",
    customDate,
    occurredAt,
    clientTimestamp,
    isOfflineSync = false,
    idempotencyKey,
  } = params;

  const trimmedIdempotencyKey = idempotencyKey?.trim() || null;

  const buildReplayResult = async (existingSales: Sale[], reader: any) => {
    const saleIds = existingSales.map((s) => s.id);
    const [existingLedgers, existingPendings] = await Promise.all([
      saleIds.length > 0
        ? reader
            .select()
            .from(stockLedgerEntries)
            .where(
              and(
                eq(stockLedgerEntries.businessId, parsedBizId),
                inArray(stockLedgerEntries.saleId, saleIds)
              )
            )
        : Promise.resolve([]),
      saleIds.length > 0
        ? reader
            .select()
            .from(pendingStockMovements)
            .where(
              and(
                eq(pendingStockMovements.businessId, parsedBizId),
                inArray(pendingStockMovements.saleId, saleIds)
              )
            )
        : Promise.resolve([]),
    ]);

    const replayTotals = existingSales.reduce(
      (acc, s) => ({
        totalAmount: acc.totalAmount + Number(s.totalAmount || 0),
        amountPaid: acc.amountPaid + Number(s.amountPaid || 0),
        outstandingAmount: acc.outstandingAmount + Number(s.outstandingAmount || 0),
      }),
      { totalAmount: 0, amountPaid: 0, outstandingAmount: 0 }
    );

    return {
      sale: existingSales[0],
      sales: existingSales,
      ledgerEntry: existingLedgers[0] || null,
      ledgerEntries: existingLedgers,
      pendingMovements: existingPendings,
      isQuarantined:
        existingPendings.some((p: PendingStockMovement) => p.status === "PENDING_REVIEW") &&
        existingLedgers.length === 0,
      ...replayTotals,
      isDuplicateReplay: true,
    };
  };

  // 1. Fast pre-lock idempotency replay check
  if (trimmedIdempotencyKey) {
    const existingSales = await db
      .select()
      .from(sales)
      .where(and(eq(sales.businessId, parsedBizId), eq(sales.idempotencyKey, trimmedIdempotencyKey)))
      .orderBy(asc(sales.id));

    if (existingSales.length > 0) {
      return buildReplayResult(existingSales, db);
    }
  }

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;
  let resolvedActorId = actorId ?? ownerUserId;
  let resolvedActorName = actorName || "Shop Operator";
  let resolvedActorRole: "OWNER" | "STAFF" = actorRole || "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "SALE_CREATE", { businessId: parsedBizId });
    resolvedActorId = authCtx.userId;
    resolvedActorName = actorName || authCtx.fullName;
    resolvedActorRole = authCtx.membership.role;
  }

  const rawItems =
    params.items && params.items.length > 0
      ? params.items
      : params.productId && params.quantity !== undefined
      ? [{ productId: params.productId, quantity: params.quantity, unitPrice: params.unitPrice }]
      : [];

  if (rawItems.length === 0) {
    throw new ValidationError("NO_SALE_ITEMS", "Please specify at least one product to sell.");
  }

  for (const it of rawItems) {
    if (!it.quantity || !Number.isFinite(it.quantity) || it.quantity <= 0) {
      throw new ValidationError(
        "INVALID_SALE_QUANTITY",
        "Enter a quantity greater than 0 for all sold items."
      );
    }
  }

  const timestampResult = await resolveTransactionTimestamp({
    businessId: parsedBizId,
    userId: resolvedActorId,
    occurredAt,
    clientTimestamp,
    customDate,
    isOfflineSync,
  });

  const productIds = rawItems.map((it) => it.productId);

  return await withLockedProducts(parsedBizId, productIds, async (tx, lockedProducts) => {
    // Re-check idempotency inside lock
    if (trimmedIdempotencyKey) {
      const existingSales = await tx
        .select()
        .from(sales)
        .where(
          and(eq(sales.businessId, parsedBizId), eq(sales.idempotencyKey, trimmedIdempotencyKey))
        )
        .orderBy(asc(sales.id));

      if (existingSales.length > 0) {
        return buildReplayResult(existingSales, tx);
      }
    }

    const lockedMap = new Map(lockedProducts.map((p) => [p.id, p]));

    const productRows = rawItems.map((item) => {
      const prod = lockedMap.get(item.productId);
      if (!prod) {
        throw new NotFoundError(
          "PRODUCT_NOT_FOUND",
          `Product #${item.productId} not found or not owned by this business.`
        );
      }

      const qtyValidation = validateQuantityConstraints({
        quantity: item.quantity,
        allowFractionalQuantity: Boolean(prod.allowFractionalQuantity),
        unitName: prod.stockUnit || prod.unit,
        allowZero: false,
      });
      if (!qtyValidation.valid) {
        throw new ValidationError(
          "INVALID_QUANTITY_CONSTRAINT",
          qtyValidation.error || "Invalid sale quantity."
        );
      }

      const unitP =
        item.unitPrice !== undefined && item.unitPrice >= 0
          ? item.unitPrice
          : prod.sellingPrice
          ? Number(prod.sellingPrice)
          : 0;

      const unitPriceKobo = toKobo(unitP);
      const lineTotalKobo = toKobo(item.quantity * unitP);
      return { item, prod, unitPrice: unitP, unitPriceKobo, lineTotalKobo };
    });

    // Resolve or auto-create customer INSIDE the locked transaction
    let resolvedCustomerId: number | null = customerId || null;
    let resolvedCustomerName: string = "Walk-in Customer";

    if (resolvedCustomerId) {
      const [c] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.id, resolvedCustomerId), eq(customers.businessId, parsedBizId)))
        .limit(1);
      if (!c) {
        throw new NotFoundError("CUSTOMER_NOT_FOUND", "Customer not found or not owned by this business.");
      }
      resolvedCustomerName = c.name;
    } else if (customerName && customerName.trim()) {
      const trimmed = customerName.trim();
      const [existing] = await tx
        .select()
        .from(customers)
        .where(and(eq(customers.businessId, parsedBizId), eq(customers.name, trimmed)))
        .limit(1);

      if (existing) {
        resolvedCustomerId = existing.id;
        resolvedCustomerName = existing.name;
      } else {
        const [newCust] = await tx
          .insert(customers)
          .values({
            businessId: parsedBizId,
            userId: ownerUserId,
            name: trimmed,
          })
          .returning();
        resolvedCustomerId = newCust.id;
        resolvedCustomerName = newCust.name;
      }
    }

    const totalInvoiceKobo = productRows.reduce((sum, r) => sum + r.lineTotalKobo, 0);
    const totalPaidKobo = Math.min(totalInvoiceKobo, Math.max(0, toKobo(amountPaid)));
    const totalOutstandingKobo = Math.max(0, totalInvoiceKobo - totalPaidKobo);

    let remainingDepositKobo = totalPaidKobo;
    const createdSales: Sale[] = [];
    const createdLedgers: StockLedgerEntry[] = [];
    const createdPendings: PendingStockMovement[] = [];

    for (let i = 0; i < productRows.length; i++) {
      const { item, prod, unitPriceKobo, lineTotalKobo } = productRows[i];

      const linePaidKobo = Math.min(remainingDepositKobo, lineTotalKobo);
      remainingDepositKobo -= linePaidKobo;
      const lineOutstandingKobo = Math.max(0, lineTotalKobo - linePaidKobo);
      const linePaymentStatus =
        lineOutstandingKobo === 0 ? "PAID" : linePaidKobo > 0 ? "PARTIAL" : "UNPAID";

      const itemLineKey = trimmedIdempotencyKey
        ? i === 0
          ? trimmedIdempotencyKey
          : `${trimmedIdempotencyKey}:item:${i}`
        : null;

      const [saleRecord] = await tx
        .insert(sales)
        .values({
          businessId: parsedBizId,
          userId: prod.userId,
          staffUserId: resolvedActorId,
          customerId: resolvedCustomerId,
          productId: prod.id,
          quantity: String(item.quantity),
          unitPrice: koboToNumericString(unitPriceKobo),
          totalAmount: koboToNumericString(lineTotalKobo),
          amountPaid: koboToNumericString(linePaidKobo),
          refundAmount: "0.00",
          outstandingAmount: koboToNumericString(lineOutstandingKobo),
          paymentStatus: linePaymentStatus,
          notes:
            notes ||
            (productRows.length > 1
              ? `Multi-item invoice item ${i + 1}/${productRows.length}`
              : "Shop customer sale"),
          idempotencyKey: trimmedIdempotencyKey,
          lineIdempotencyKey: itemLineKey,
          occurredAt: timestampResult.provisionalOccurredAt,
          timestampStatus: timestampResult.isUncertain ? "PENDING_REVIEW" : "CONFIRMED",
          timestampBasis: timestampResult.timestampBasis,
          deviceTimestamp: timestampResult.deviceTimestamp,
          createdAt: timestampResult.serverIngestedAt,
        })
        .returning();

      createdSales.push(saleRecord);

      if (timestampResult.isUncertain) {
        const [pendingRow] = await tx
          .insert(pendingStockMovements)
          .values({
            businessId: parsedBizId,
            productId: prod.id,
            actorId: resolvedActorId,
            transactionType: "SALE",
            status: "PENDING_REVIEW",
            saleId: saleRecord.id,
            quantityDelta: String(-Math.abs(item.quantity)),
            notes:
              notes ||
              (resolvedCustomerId ? `Sale to ${resolvedCustomerName}` : "Sale recorded"),
            deviceTimestamp: timestampResult.deviceTimestamp,
            provisionalOccurredAt: timestampResult.provisionalOccurredAt,
            serverIngestedAt: timestampResult.serverIngestedAt,
            cutoffSnapshotAt: prod.lastVerifiedAt ? new Date(prod.lastVerifiedAt) : null,
            timestampBasis: timestampResult.timestampBasis,
            skewFlag: timestampResult.skewFlag ?? null,
            idempotencyKey: itemLineKey,
            createdAt: timestampResult.serverIngestedAt,
            updatedAt: timestampResult.serverIngestedAt,
          })
          .returning();

        createdPendings.push(pendingRow);
      } else {
        const { ledgerEntry } = await recordReconciledMovementInTx(tx, {
          businessId: parsedBizId,
          userId: prod.userId,
          actorId: resolvedActorId,
          product: prod,
          transactionType: "SALE",
          quantityDelta: -Math.abs(item.quantity),
          occurredAt: timestampResult.confirmedOccurredAt!,
          saleId: saleRecord.id,
          idempotencyKey: itemLineKey,
          notes:
            notes || (resolvedCustomerId ? `Sale to ${resolvedCustomerName}` : "Sale recorded"),
        });

        createdLedgers.push(ledgerEntry);
      }
    }

    const itemsSummary = productRows
      .map((r) => `${r.item.quantity} ${r.prod.unit} of ${r.prod.name}`)
      .join(", ");

    const now = new Date();
    const totalInvoiceAmount = totalInvoiceKobo / 100;

    await tx.insert(auditLogs).values({
      userId: ownerUserId,
      businessId: parsedBizId,
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      actorRole: resolvedActorRole,
      eventType: "SALE",
      description: `${resolvedActorName} recorded a sale of ₦${totalInvoiceAmount.toLocaleString()} (${itemsSummary} to ${resolvedCustomerName})${
        timestampResult.isUncertain ? " [inventory pending timestamp review]" : ""
      }`,
      entityType: "SALE",
      entityId: createdSales[0]?.id,
      newValue: `₦${totalInvoiceAmount}`,
      source,
      createdAt: now,
    });

    if (timestampResult.isUncertain) {
      await tx.insert(auditLogs).values({
        userId: ownerUserId,
        businessId: parsedBizId,
        actorId: resolvedActorId,
        actorName: resolvedActorName,
        actorRole: resolvedActorRole,
        eventType: "PENDING_MOVEMENT_QUARANTINED",
        description: `Quarantined inventory effect for sale #${createdSales[0]?.id} due to ${
          timestampResult.skewFlag ?? "uncertain timestamp"
        } (device time ${timestampResult.originalTimestamp?.toISOString() ?? "invalid"})`,
        entityType: "PENDING_STOCK_MOVEMENT",
        entityId: createdPendings[0]?.id,
        oldValue: timestampResult.originalTimestamp?.toISOString() || null,
        newValue: timestampResult.provisionalOccurredAt.toISOString(),
        source,
        createdAt: now,
      });

      if (timestampResult.skewFlag) {
        await tx.insert(auditLogs).values({
          userId: ownerUserId,
          businessId: parsedBizId,
          actorId: resolvedActorId,
          actorName: resolvedActorName,
          actorRole: resolvedActorRole,
          eventType: timestampResult.skewFlag,
          description: `Flagged skewed offline device timestamp (${timestampResult.originalTimestamp?.toISOString() ?? "invalid"}) on sale #${createdSales[0]?.id}; inventory quarantined for review`,
          entityType: "SALE",
          entityId: createdSales[0]?.id,
          oldValue: timestampResult.originalTimestamp?.toISOString() || null,
          newValue: timestampResult.provisionalOccurredAt.toISOString(),
          source,
          createdAt: now,
        });
      }
    }

    return {
      sale: createdSales[0],
      sales: createdSales,
      ledgerEntry: createdLedgers[0] || null,
      ledgerEntries: createdLedgers,
      pendingMovements: createdPendings,
      isQuarantined: timestampResult.isUncertain,
      totalAmount: totalInvoiceAmount,
      amountPaid: totalPaidKobo / 100,
      outstandingAmount: totalOutstandingKobo / 100,
      isDuplicateReplay: false,
    };
  });
}

/**
 * Record a customer return / sale correction (discount-aware proportional kobo value,
 * strict customer debt credit offset vs cash refund split, locked L1->L2->L3).
 */
export async function recordSaleCorrection(params: {
  businessId: number;
  actorId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  originalSaleId: number;
  correctedQuantityDelta: number; // Positive number of units returned by customer (e.g. +2)
  correctionReason: string;
  occurredAt?: Date | string | null;
  clientTimestamp?: Date | string | null;
  isOfflineSync?: boolean;
  idempotencyKey?: string | null;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
    actorId,
    actorName,
    actorRole,
    originalSaleId,
    correctedQuantityDelta,
    correctionReason,
    occurredAt,
    clientTimestamp,
    isOfflineSync = false,
    idempotencyKey,
  } = params;

  if (!correctionReason || !correctionReason.trim()) {
    throw new ValidationError(
      "CORRECTION_REASON_REQUIRED",
      "Please provide a reason for this sale correction."
    );
  }

  if (
    typeof correctedQuantityDelta !== "number" ||
    !Number.isFinite(correctedQuantityDelta) ||
    correctedQuantityDelta <= 0
  ) {
    throw new ValidationError(
      "INVALID_RETURN_QUANTITY",
      "Return quantity must be a positive number of units."
    );
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
    explicitRole: actorRole,
  });
  assertCan(authCtx, "SALE_CORRECTION", { businessId: parsedBizId });

  const resolvedActorName = actorName || authCtx.fullName || "Shop Operator";
  const resolvedActorRole = authCtx.membership.role;
  const trimmedKey = idempotencyKey?.trim() || null;

  const buildCorrectionReplay = async (existingCorrSale: Sale, reader: any) => {
    const [existingLedger] = await reader
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.businessId, parsedBizId),
          eq(stockLedgerEntries.saleId, existingCorrSale.id)
        )
      )
      .limit(1);

    const [existingPending] = await reader
      .select()
      .from(pendingStockMovements)
      .where(
        and(
          eq(pendingStockMovements.businessId, parsedBizId),
          eq(pendingStockMovements.saleId, existingCorrSale.id)
        )
      )
      .limit(1);

    return {
      correctionSale: existingCorrSale,
      ledgerCorrection: existingLedger || null,
      pendingMovement: existingPending || null,
      returnValue: Math.abs(Number(existingCorrSale.totalAmount)),
      creditOffset: Math.abs(Number(existingCorrSale.outstandingAmount)),
      refundAmount: Number(existingCorrSale.refundAmount || 0),
      isQuarantined: Boolean(existingPending && existingPending.status === "PENDING_REVIEW"),
      isDuplicateReplay: true,
    };
  };

  if (trimmedKey) {
    const [existingCorrSale] = await db
      .select()
      .from(sales)
      .where(
        and(eq(sales.businessId, parsedBizId), eq(sales.lineIdempotencyKey, trimmedKey))
      )
      .limit(1);

    if (existingCorrSale) {
      return buildCorrectionReplay(existingCorrSale, db);
    }
  }

  const [peekOrigSale] = await db
    .select({
      id: sales.id,
      productId: sales.productId,
    })
    .from(sales)
    .where(and(eq(sales.id, originalSaleId), eq(sales.businessId, parsedBizId)))
    .limit(1);

  if (!peekOrigSale) {
    throw new NotFoundError("SALE_NOT_FOUND", "Original sale record not found.");
  }

  const peekPendings = await db
    .select({ id: pendingStockMovements.id })
    .from(pendingStockMovements)
    .where(
      and(
        eq(pendingStockMovements.businessId, parsedBizId),
        eq(pendingStockMovements.saleId, originalSaleId),
        eq(pendingStockMovements.status, "PENDING_REVIEW")
      )
    );

  const timestampResult = await resolveTransactionTimestamp({
    businessId: parsedBizId,
    userId: actorId,
    occurredAt,
    clientTimestamp,
    isOfflineSync,
  });

  // Strict lock acquisition order: L1 (pending_stock_movements) -> L2 (products) -> L3 (sales)
  const releasePending =
    peekPendings.length > 0
      ? (await acquirePendingMovementMutexes(peekPendings.map((p) => p.id))).release
      : null;

  try {
    const { release: releaseProduct } = await acquireProductMutexes([peekOrigSale.productId]);
    try {
      const { release: releaseSale } = await acquireSaleMutexes([originalSaleId]);
      try {
        return await db.transaction(async (tx) => {
          // L1: Lock any pending movement for the parent sale
          const lockedParentPendings = await tx
            .select()
            .from(pendingStockMovements)
            .where(
              and(
                eq(pendingStockMovements.businessId, parsedBizId),
                eq(pendingStockMovements.saleId, originalSaleId),
                eq(pendingStockMovements.status, "PENDING_REVIEW")
              )
            )
            .orderBy(asc(pendingStockMovements.id))
            .for("update");
          const parentPending = lockedParentPendings[0] ?? null;

          // L2: Lock product row
          const [prod] = await tx
            .select()
            .from(products)
            .where(
              and(
                eq(products.id, peekOrigSale.productId),
                eq(products.businessId, parsedBizId)
              )
            )
            .for("update")
            .limit(1);

          if (!prod) {
            throw new NotFoundError("PRODUCT_NOT_FOUND", "Product not found for original sale.");
          }

          // L3: Lock original sale row
          const [origSale] = await tx
            .select()
            .from(sales)
            .where(and(eq(sales.id, originalSaleId), eq(sales.businessId, parsedBizId)))
            .for("update")
            .limit(1);

          if (!origSale) {
            throw new NotFoundError("SALE_NOT_FOUND", "Original sale record not found.");
          }

          if (trimmedKey) {
            const [existingCorrSale] = await tx
              .select()
              .from(sales)
              .where(
                and(eq(sales.businessId, parsedBizId), eq(sales.lineIdempotencyKey, trimmedKey))
              )
              .limit(1);
            if (existingCorrSale) {
              return buildCorrectionReplay(existingCorrSale, tx);
            }
          }

          if (origSale.isCorrection) {
            throw new ValidationError(
              "CANNOT_RETURN_CORRECTION",
              "Cannot record a customer return against another correction entry."
            );
          }

          const returnQty = correctedQuantityDelta;
          const qtyValidation = validateQuantityConstraints({
            quantity: returnQty,
            allowFractionalQuantity: Boolean(prod.allowFractionalQuantity),
            unitName: prod.stockUnit || prod.unit,
            allowZero: false,
          });
          if (!qtyValidation.valid) {
            throw new ValidationError(
              "INVALID_QUANTITY_CONSTRAINT",
              qtyValidation.error || "Invalid return quantity."
            );
          }

          const origQty = Number(origSale.quantity);
          const allLinkedCorrections = await tx
            .select()
            .from(sales)
            .where(
              and(
                eq(sales.businessId, parsedBizId),
                eq(sales.originalSaleId, origSale.id),
                eq(sales.isCorrection, true)
              )
            );
          const priorReturns = allLinkedCorrections.filter((r) => Number(r.quantity) < 0);

          const priorReturnedQty = priorReturns.reduce(
            (sum, r) => sum + Math.abs(Number(r.quantity)),
            0
          );

          if (priorReturnedQty + returnQty > origQty + 1e-9) {
            throw new ValidationError(
              "RETURN_EXCEEDS_ORIGINAL_QUANTITY",
              `Cannot return ${returnQty} ${prod.unit}: already returned ${priorReturnedQty} of ${origQty} sold.`
            );
          }

          // Discount-aware proportional kobo valuation
          const origTotalKobo = toKobo(Number(origSale.totalAmount));
          const priorReturnedKobo = priorReturns.reduce(
            (sum, r) => sum + Math.abs(toKobo(Number(r.totalAmount))),
            0
          );
          const priorCreditOffsetKobo = priorReturns.reduce(
            (sum, r) => sum + Math.abs(toKobo(Number(r.outstandingAmount))),
            0
          );

          const remainingValueKobo = Math.max(0, origTotalKobo - priorReturnedKobo);
          const isFinalFullReturn = Math.abs(priorReturnedQty + returnQty - origQty) < 1e-9;
          const returnValueKobo = isFinalFullReturn
            ? remainingValueKobo
            : Math.min(Math.round((origTotalKobo * returnQty) / origQty), remainingValueKobo);

          const origOutstandingKobo = toKobo(Number(origSale.outstandingAmount));
          const saleRemainingCreditKobo = Math.max(0, origOutstandingKobo - priorCreditOffsetKobo);

          let maxCreditOffsetKobo = saleRemainingCreditKobo;
          if (origSale.customerId !== null && origSale.customerId !== undefined) {
            await tx
              .select({ id: customers.id })
              .from(customers)
              .where(
                and(
                  eq(customers.id, origSale.customerId),
                  eq(customers.businessId, parsedBizId)
                )
              )
              .for("update")
              .limit(1);

            const [custSales, custPayments] = await Promise.all([
              tx
                .select({ outstandingAmount: sales.outstandingAmount })
                .from(sales)
                .where(
                  and(
                    eq(sales.businessId, parsedBizId),
                    eq(sales.customerId, origSale.customerId)
                  )
                ),
              tx
                .select({ amount: customerPayments.amount })
                .from(customerPayments)
                .where(
                  and(
                    eq(customerPayments.businessId, parsedBizId),
                    eq(customerPayments.customerId, origSale.customerId)
                  )
                ),
            ]);

            const totalCreditKobo = custSales.reduce(
              (s, row) => s + toKobo(Number(row.outstandingAmount || 0)),
              0
            );
            const totalPaymentsKobo = custPayments.reduce(
              (s, row) => s + toKobo(Number(row.amount || 0)),
              0
            );
            const customerCurrentDebtKobo = Math.max(0, totalCreditKobo - totalPaymentsKobo);
            maxCreditOffsetKobo = Math.min(saleRemainingCreditKobo, customerCurrentDebtKobo);
          }

          const creditOffsetKobo = Math.min(returnValueKobo, maxCreditOffsetKobo);
          const refundKobo = returnValueKobo - creditOffsetKobo;

          const effectiveReturnUnitPriceKobo =
            returnQty > 0 ? Math.round(returnValueKobo / returnQty) : 0;

          const parentPendingFlag = Boolean(
            parentPending || origSale.timestampStatus === "PENDING_REVIEW"
          );
          const shouldQuarantine = parentPendingFlag || timestampResult.isUncertain;
          const corrTimestampBasis = timestampResult.isUncertain
            ? timestampResult.timestampBasis
            : parentPendingFlag
            ? "PARENT_SALE_PENDING"
            : timestampResult.timestampBasis;

          const [correctionSale] = await tx
            .insert(sales)
            .values({
              businessId: parsedBizId,
              userId: origSale.userId,
              staffUserId: actorId,
              customerId: origSale.customerId,
              productId: origSale.productId,
              quantity: String(-returnQty),
              unitPrice: koboToNumericString(effectiveReturnUnitPriceKobo),
              totalAmount: koboToNumericString(-returnValueKobo),
              amountPaid: "0.00",
              refundAmount: koboToNumericString(refundKobo),
              outstandingAmount: koboToNumericString(-creditOffsetKobo),
              paymentStatus: "PAID",
              notes: `Correction to sale #${originalSaleId}: ${correctionReason.trim()}`,
              isCorrection: true,
              originalSaleId,
              correctionReason: correctionReason.trim(),
              idempotencyKey: trimmedKey,
              lineIdempotencyKey: trimmedKey,
              occurredAt: timestampResult.provisionalOccurredAt,
              timestampStatus: shouldQuarantine ? "PENDING_REVIEW" : "CONFIRMED",
              timestampBasis: corrTimestampBasis,
              deviceTimestamp: timestampResult.deviceTimestamp,
              createdAt: timestampResult.serverIngestedAt,
            })
            .returning();

          let ledgerCorrection: StockLedgerEntry | null = null;
          let pendingMovement: PendingStockMovement | null = null;

          if (shouldQuarantine) {
            const [createdPending] = await tx
              .insert(pendingStockMovements)
              .values({
                businessId: parsedBizId,
                productId: prod.id,
                actorId,
                transactionType: "CORRECTION",
                status: "PENDING_REVIEW",
                saleId: correctionSale.id,
                originalSaleId: origSale.id,
                dependsOnPendingId: parentPending?.id ?? null,
                quantityDelta: String(returnQty),
                notes: `Correction to sale #${originalSaleId}: ${correctionReason.trim()}`,
                deviceTimestamp: timestampResult.deviceTimestamp,
                provisionalOccurredAt: timestampResult.provisionalOccurredAt,
                serverIngestedAt: timestampResult.serverIngestedAt,
                cutoffSnapshotAt: prod.lastVerifiedAt ? new Date(prod.lastVerifiedAt) : null,
                timestampBasis: corrTimestampBasis,
                skewFlag: timestampResult.skewFlag ?? null,
                idempotencyKey: trimmedKey,
                createdAt: timestampResult.serverIngestedAt,
                updatedAt: timestampResult.serverIngestedAt,
              })
              .returning();
            pendingMovement = createdPending;
          } else {
            const moved = await recordReconciledMovementInTx(tx, {
              businessId: parsedBizId,
              userId: origSale.userId,
              actorId,
              product: prod,
              transactionType: "CORRECTION",
              quantityDelta: returnQty,
              occurredAt: timestampResult.confirmedOccurredAt!,
              saleId: correctionSale.id,
              idempotencyKey: trimmedKey,
              notes: `Correction to sale #${originalSaleId}: ${correctionReason.trim()}`,
            });
            ledgerCorrection = moved.ledgerEntry;
          }

          const now = new Date();
          await tx.insert(auditLogs).values({
            userId: origSale.userId,
            businessId: parsedBizId,
            actorId,
            actorName: resolvedActorName,
            actorRole: resolvedActorRole,
            eventType: "TRANSACTION_CORRECTION",
            description: `${resolvedActorName} recorded return of ${returnQty} ${prod.unit} on sale #${originalSaleId} (${prod.name}): value ₦${(
              returnValueKobo / 100
            ).toLocaleString()}, credit offset ₦${(
              creditOffsetKobo / 100
            ).toLocaleString()}, cash refund ₦${(refundKobo / 100).toLocaleString()}`,
            entityType: "SALE",
            entityId: originalSaleId,
            newValue: `+${returnQty} ${prod.unit}`,
            reason: correctionReason.trim(),
            source: "WEB",
            createdAt: now,
          });

          if (shouldQuarantine) {
            await tx.insert(auditLogs).values({
              userId: origSale.userId,
              businessId: parsedBizId,
              actorId,
              actorName: resolvedActorName,
              actorRole: resolvedActorRole,
              eventType: "PENDING_MOVEMENT_QUARANTINED",
              description: `Quarantined inventory return on correction sale #${correctionSale.id} (${
                parentPendingFlag ? "parent sale awaiting timestamp review" : timestampResult.skewFlag
              })`,
              entityType: "PENDING_STOCK_MOVEMENT",
              entityId: pendingMovement?.id,
              source: "WEB",
              createdAt: now,
            });
          }

          return {
            correctionSale,
            ledgerCorrection,
            pendingMovement,
            returnValue: returnValueKobo / 100,
            creditOffset: creditOffsetKobo / 100,
            refundAmount: refundKobo / 100,
            isQuarantined: shouldQuarantine,
            isDuplicateReplay: false,
          };
        });
      } finally {
        releaseSale();
      }
    } finally {
      releaseProduct();
    }
  } finally {
    if (releasePending) releasePending();
  }
}

// ==========================================
// 4. RESTOCK ARRIVAL EVENT & SENSITIVE COST UPDATES (RECEIVE GOODS)
// ==========================================

export async function recordDelivery(params: {
  businessId: number;
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
  occurredAt?: Date | string;
  clientTimestamp?: Date | string;
  isOfflineSync?: boolean;
  idempotencyKey?: string | null;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
    actorId,
    actorName,
    actorRole,
    productId,
    quantityReceived,
    unitCost,
    supplierName,
    notes,
    source = "WEB",
    customDate,
    occurredAt,
    clientTimestamp,
    isOfflineSync = false,
    idempotencyKey,
  } = params;

  const trimmedIdempotencyKey = idempotencyKey?.trim() || null;

  if (trimmedIdempotencyKey) {
    const [existingLedger] = await db
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.businessId, parsedBizId),
          eq(stockLedgerEntries.idempotencyKey, trimmedIdempotencyKey)
        )
      )
      .limit(1);

    if (existingLedger) {
      return {
        ...existingLedger,
        pendingMovement: null,
        isQuarantined: false,
        isDuplicateReplay: true,
      };
    }

    const [existingPending] = await db
      .select()
      .from(pendingStockMovements)
      .where(
        and(
          eq(pendingStockMovements.businessId, parsedBizId),
          eq(pendingStockMovements.idempotencyKey, trimmedIdempotencyKey)
        )
      )
      .limit(1);

    if (existingPending) {
      return {
        ...existingPending,
        pendingMovement: existingPending,
        isQuarantined: true,
        isDuplicateReplay: true,
      };
    }
  }

  if (!quantityReceived || !Number.isFinite(quantityReceived) || quantityReceived <= 0) {
    throw new ValidationError(
      "INVALID_DELIVERY_QUANTITY",
      "Enter a received quantity greater than 0."
    );
  }

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;
  let resolvedActorId = actorId ?? ownerUserId;
  let resolvedActorName = actorName || "Shop Operator";
  let resolvedActorRole: "OWNER" | "STAFF" = actorRole || "OWNER";
  let canEditCost = resolvedActorRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "DELIVERY_CREATE", { businessId: parsedBizId });
    resolvedActorId = authCtx.userId;
    resolvedActorName = actorName || authCtx.fullName;
    resolvedActorRole = authCtx.membership.role;
    canEditCost = resolvedActorRole === "STAFF" ? false : can(authCtx, "PURCHASE_COST_EDIT");
  }

  const validatedCostNum =
    canEditCost && unitCost !== null && unitCost !== undefined && unitCost > 0
      ? Number(unitCost)
      : null;

  const timestampResult = await resolveTransactionTimestamp({
    businessId: parsedBizId,
    userId: resolvedActorId,
    occurredAt,
    clientTimestamp,
    customDate,
    isOfflineSync,
  });

  return await withLockedProducts(parsedBizId, [productId], async (tx, [prod]) => {
    const qtyValidation = validateQuantityConstraints({
      quantity: quantityReceived,
      allowFractionalQuantity: Boolean(prod.allowFractionalQuantity),
      unitName: prod.stockUnit || prod.unit,
      allowZero: false,
    });
    if (!qtyValidation.valid) {
      throw new ValidationError(
        "INVALID_QUANTITY_CONSTRAINT",
        qtyValidation.error || "Invalid delivery quantity."
      );
    }

    if (trimmedIdempotencyKey) {
      const [existingPending] = await tx
        .select()
        .from(pendingStockMovements)
        .where(
          and(
            eq(pendingStockMovements.businessId, parsedBizId),
            eq(pendingStockMovements.idempotencyKey, trimmedIdempotencyKey)
          )
        )
        .limit(1);

      if (existingPending) {
        return {
          ...existingPending,
          pendingMovement: existingPending,
          isQuarantined: true,
          isDuplicateReplay: true,
        };
      }
    }

    if (timestampResult.isUncertain) {
      const [pendingRow] = await tx
        .insert(pendingStockMovements)
        .values({
          businessId: parsedBizId,
          productId: prod.id,
          actorId: resolvedActorId,
          transactionType: "RESTOCK",
          status: "PENDING_REVIEW",
          quantityDelta: String(Math.abs(quantityReceived)),
          unitCost: validatedCostNum !== null ? String(validatedCostNum) : null,
          supplierName: supplierName?.trim() || null,
          notes: notes || "Goods delivery received",
          deviceTimestamp: timestampResult.deviceTimestamp,
          provisionalOccurredAt: timestampResult.provisionalOccurredAt,
          serverIngestedAt: timestampResult.serverIngestedAt,
          cutoffSnapshotAt: prod.lastVerifiedAt ? new Date(prod.lastVerifiedAt) : null,
          timestampBasis: timestampResult.timestampBasis,
          skewFlag: timestampResult.skewFlag ?? null,
          idempotencyKey: trimmedIdempotencyKey,
          createdAt: timestampResult.serverIngestedAt,
          updatedAt: timestampResult.serverIngestedAt,
        })
        .returning();

      const now = new Date();
      await tx.insert(auditLogs).values({
        userId: prod.userId,
        businessId: parsedBizId,
        actorId: resolvedActorId,
        actorName: resolvedActorName,
        actorRole: resolvedActorRole,
        eventType: "PENDING_MOVEMENT_QUARANTINED",
        description: `${resolvedActorName} received +${quantityReceived} ${prod.unit} of "${prod.name}" (quarantined pending timestamp review)`,
        entityType: "PENDING_STOCK_MOVEMENT",
        entityId: pendingRow.id,
        oldValue: timestampResult.originalTimestamp?.toISOString() || null,
        newValue: timestampResult.provisionalOccurredAt.toISOString(),
        source,
        createdAt: now,
      });

      if (timestampResult.skewFlag) {
        await tx.insert(auditLogs).values({
          userId: prod.userId,
          businessId: parsedBizId,
          actorId: resolvedActorId,
          actorName: resolvedActorName,
          actorRole: resolvedActorRole,
          eventType: timestampResult.skewFlag,
          description: `Flagged skewed offline device timestamp (${timestampResult.originalTimestamp?.toISOString() ?? "invalid"}) on pending delivery #${pendingRow.id}`,
          entityType: "PENDING_STOCK_MOVEMENT",
          entityId: pendingRow.id,
          oldValue: timestampResult.originalTimestamp?.toISOString() || null,
          newValue: timestampResult.provisionalOccurredAt.toISOString(),
          source,
          createdAt: now,
        });
      }

      return {
        ...pendingRow,
        pendingMovement: pendingRow,
        isQuarantined: true,
        isDuplicateReplay: false,
      };
    }

    const deliveryTime = timestampResult.confirmedOccurredAt!;
    const { ledgerEntry: entry, isDuplicateReplay } = await recordReconciledMovementInTx(tx, {
      businessId: parsedBizId,
      userId: prod.userId,
      actorId: resolvedActorId,
      product: prod,
      transactionType: "RESTOCK",
      quantityDelta: Math.abs(quantityReceived),
      occurredAt: deliveryTime,
      unitCost: validatedCostNum,
      supplierName: supplierName?.trim() || null,
      idempotencyKey: trimmedIdempotencyKey,
      notes: notes || "Goods delivery received",
    });

    if (isDuplicateReplay) {
      return {
        ...entry,
        pendingMovement: null,
        isQuarantined: false,
        isDuplicateReplay: true,
      };
    }

    const now = new Date();
    await tx.insert(auditLogs).values({
      userId: prod.userId,
      businessId: parsedBizId,
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      actorRole: resolvedActorRole,
      eventType: "DELIVERY",
      description: `${resolvedActorName} received +${quantityReceived} ${prod.unit} of "${prod.name}"${
        supplierName ? ` from ${supplierName}` : ""
      }`,
      entityType: "DELIVERY",
      entityId: entry.id,
      newValue: `+${quantityReceived} ${prod.unit}`,
      source,
      createdAt: now,
    });

    return {
      ...entry,
      pendingMovement: null,
      isQuarantined: false,
      isDuplicateReplay: false,
    };
  });
}

export async function updateDeliveryPurchaseCost(params: {
  businessId: number;
  actorId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  ledgerEntryId: number;
  unitCost: number;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const { actorId, actorName, actorRole, ledgerEntryId, unitCost } = params;

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
    explicitRole: actorRole,
  });
  assertCan(authCtx, "PURCHASE_COST_EDIT", { businessId: parsedBizId });

  const resolvedActorName = actorName || authCtx.fullName;
  const resolvedActorRole = authCtx.membership.role;

  if (typeof unitCost !== "number" || !Number.isFinite(unitCost) || unitCost <= 0) {
    throw new ValidationError(
      "INVALID_UNIT_COST",
      "Enter a valid unit purchase cost greater than 0."
    );
  }

  const [entry] = await db
    .select()
    .from(stockLedgerEntries)
    .where(
      and(
        eq(stockLedgerEntries.id, ledgerEntryId),
        eq(stockLedgerEntries.businessId, parsedBizId)
      )
    )
    .limit(1);

  if (!entry || entry.entryType !== "RESTOCK") {
    throw new NotFoundError("DELIVERY_NOT_FOUND", "Delivery restock entry not found.");
  }

  const [updated] = await db
    .update(stockLedgerEntries)
    .set({
      unitCost: String(unitCost),
    })
    .where(
      and(
        eq(stockLedgerEntries.id, ledgerEntryId),
        eq(stockLedgerEntries.businessId, parsedBizId)
      )
    )
    .returning();

  await logAuditEvent({
    businessId: parsedBizId,
    userId: entry.userId,
    actorId,
    actorName: resolvedActorName,
    actorRole: resolvedActorRole,
    eventType: "DELIVERY_COST_UPDATE",
    description: `${resolvedActorName} recorded/updated purchase price to ₦${unitCost.toLocaleString()} on delivery #${ledgerEntryId}`,
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
  businessId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  productId: number;
  physicalCount: number;
  notes?: string;
  occurredAt?: Date | string;
  clientTimestamp?: Date | string;
  isOfflineSync?: boolean;
  idempotencyKey?: string | null;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
    actorId,
    actorName,
    actorRole,
    productId,
    physicalCount,
    notes,
    occurredAt,
    clientTimestamp,
    isOfflineSync = false,
    idempotencyKey,
  } = params;

  const trimmedIdempotencyKey = idempotencyKey?.trim() || null;

  if (trimmedIdempotencyKey) {
    const [existingLedger] = await db
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.businessId, parsedBizId),
          eq(stockLedgerEntries.idempotencyKey, trimmedIdempotencyKey)
        )
      )
      .limit(1);

    if (existingLedger) {
      return {
        entry: existingLedger,
        pendingMovement: null,
        currentSystemStock: 0,
        physicalCount,
        adjustmentDelta: Number(existingLedger.quantityDelta),
        isQuarantined: false,
        isDuplicateReplay: true,
      };
    }

    const [existingPending] = await db
      .select()
      .from(pendingStockMovements)
      .where(
        and(
          eq(pendingStockMovements.businessId, parsedBizId),
          eq(pendingStockMovements.idempotencyKey, trimmedIdempotencyKey)
        )
      )
      .limit(1);

    if (existingPending) {
      return {
        entry: null,
        pendingMovement: existingPending,
        currentSystemStock: 0,
        physicalCount: Number(existingPending.physicalCount ?? physicalCount),
        adjustmentDelta: 0,
        isQuarantined: true,
        isDuplicateReplay: true,
      };
    }
  }

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;
  let resolvedActorId = actorId ?? ownerUserId;
  let resolvedActorName = actorName || "Shop Operator";
  let resolvedActorRole: "OWNER" | "STAFF" = actorRole || "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "STOCK_COUNT", { businessId: parsedBizId });
    resolvedActorId = authCtx.userId;
    resolvedActorName = actorName || authCtx.fullName;
    resolvedActorRole = authCtx.membership.role;
  }

  const timestampResult = await resolveTransactionTimestamp({
    businessId: parsedBizId,
    userId: resolvedActorId,
    occurredAt,
    clientTimestamp,
    isOfflineSync,
  });

  return await withLockedProducts(parsedBizId, [productId], async (tx, [prod]) => {
    const qtyValidation = validateQuantityConstraints({
      quantity: physicalCount,
      allowFractionalQuantity: Boolean(prod.allowFractionalQuantity),
      unitName: prod.stockUnit || prod.unit,
      allowZero: true,
    });
    if (!qtyValidation.valid) {
      throw new ValidationError(
        "INVALID_QUANTITY_CONSTRAINT",
        qtyValidation.error || "Invalid physical count quantity."
      );
    }

    if (trimmedIdempotencyKey) {
      const [existingLedger] = await tx
        .select()
        .from(stockLedgerEntries)
        .where(
          and(
            eq(stockLedgerEntries.businessId, parsedBizId),
            eq(stockLedgerEntries.idempotencyKey, trimmedIdempotencyKey)
          )
        )
        .limit(1);

      if (existingLedger) {
        return {
          entry: existingLedger,
          pendingMovement: null,
          currentSystemStock: 0,
          physicalCount,
          adjustmentDelta: Number(existingLedger.quantityDelta),
          isQuarantined: false,
          isDuplicateReplay: true,
        };
      }

      const [existingPending] = await tx
        .select()
        .from(pendingStockMovements)
        .where(
          and(
            eq(pendingStockMovements.businessId, parsedBizId),
            eq(pendingStockMovements.idempotencyKey, trimmedIdempotencyKey)
          )
        )
        .limit(1);

      if (existingPending) {
        return {
          entry: null,
          pendingMovement: existingPending,
          currentSystemStock: 0,
          physicalCount: Number(existingPending.physicalCount ?? physicalCount),
          adjustmentDelta: 0,
          isQuarantined: true,
          isDuplicateReplay: true,
        };
      }
    }

    // Skewed/uncertain offline stock count: quarantine and mark NEEDS_RECOUNT without modifying lastVerifiedAt/stock ledger
    if (timestampResult.isUncertain) {
      const now = new Date();
      const [pendingRow] = await tx
        .insert(pendingStockMovements)
        .values({
          businessId: parsedBizId,
          productId: prod.id,
          actorId: resolvedActorId,
          transactionType: "ADJUSTMENT",
          status: "PENDING_REVIEW",
          quantityDelta: "0",
          physicalCount: String(physicalCount),
          notes:
            notes ||
            `Quarantined physical count: ${physicalCount} ${prod.stockUnit || prod.unit} (timestamp requires review)`,
          deviceTimestamp: timestampResult.deviceTimestamp,
          provisionalOccurredAt: timestampResult.provisionalOccurredAt,
          serverIngestedAt: timestampResult.serverIngestedAt,
          cutoffSnapshotAt: prod.lastVerifiedAt ? new Date(prod.lastVerifiedAt) : null,
          timestampBasis: timestampResult.timestampBasis,
          skewFlag: timestampResult.skewFlag ?? null,
          idempotencyKey: trimmedIdempotencyKey,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      await tx
        .update(products)
        .set({
          verificationStatus: "NEEDS_RECOUNT",
          updatedAt: now,
        })
        .where(eq(products.id, prod.id));

      await tx.insert(auditLogs).values({
        userId: prod.userId,
        businessId: parsedBizId,
        actorId: resolvedActorId,
        actorName: resolvedActorName,
        actorRole: resolvedActorRole,
        eventType: "PENDING_MOVEMENT_QUARANTINED",
        description: `Quarantined physical count (${physicalCount} ${prod.unit}) for "${prod.name}" pending timestamp review`,
        entityType: "PENDING_STOCK_MOVEMENT",
        entityId: pendingRow.id,
        oldValue: timestampResult.originalTimestamp?.toISOString() || null,
        newValue: String(physicalCount),
        reason: notes || null,
        source: "WEB",
        createdAt: now,
      });

      if (timestampResult.skewFlag) {
        await tx.insert(auditLogs).values({
          userId: prod.userId,
          businessId: parsedBizId,
          actorId: resolvedActorId,
          actorName: resolvedActorName,
          actorRole: resolvedActorRole,
          eventType: timestampResult.skewFlag,
          description: `Flagged skewed offline device timestamp (${timestampResult.originalTimestamp?.toISOString() ?? "invalid"}) on stock count #${pendingRow.id}`,
          entityType: "STOCK",
          entityId: prod.id,
          oldValue: timestampResult.originalTimestamp?.toISOString() || null,
          newValue: timestampResult.provisionalOccurredAt.toISOString(),
          source: "WEB",
          createdAt: now,
        });
      }

      return {
        entry: null,
        pendingMovement: pendingRow,
        currentSystemStock: 0,
        physicalCount,
        adjustmentDelta: 0,
        isQuarantined: true,
        isDuplicateReplay: false,
      };
    }

    const countTime = timestampResult.confirmedOccurredAt!;

    // Exact-timestamp physical count conflict guard
    if (
      prod.lastVerifiedAt &&
      new Date(prod.lastVerifiedAt).getTime() === countTime.getTime() &&
      Number(prod.lastVerifiedQuantity) !== physicalCount
    ) {
      throw new ConflictError(
        "COUNT_CONFLICT_EXACT_TIMESTAMP",
        `Product #${prod.id} already has a verified count of ${prod.lastVerifiedQuantity} at exact timestamp ${countTime.toISOString()} (attempted ${physicalCount}).`
      );
    }

    const entries = await tx
      .select({
        delta: stockLedgerEntries.quantityDelta,
        occurredAt: stockLedgerEntries.occurredAt,
      })
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.productId, productId),
          eq(stockLedgerEntries.businessId, parsedBizId)
        )
      );

    // Authoritative pre-cut-off ledger sum at countTime (occurredAt <= countTime)
    const preCutoffSum = entries
      .filter((e) => new Date(e.occurredAt).getTime() <= countTime.getTime())
      .reduce((sum, e) => sum + Number(e.delta || 0), 0);

    const adjustmentDelta = physicalCount - preCutoffSum;

    const { ledgerEntry: entry, reconciliationEntry } = await recordReconciledMovementInTx(tx, {
      businessId: parsedBizId,
      userId: prod.userId,
      actorId: resolvedActorId,
      product: prod,
      transactionType: "ADJUSTMENT",
      quantityDelta: adjustmentDelta,
      occurredAt: countTime,
      idempotencyKey: trimmedIdempotencyKey,
      notes:
        notes ||
        `Physical count: ${physicalCount} ${prod.unit} (system at count time was ${preCutoffSum}, difference: ${
          adjustmentDelta >= 0 ? `+${adjustmentDelta}` : adjustmentDelta
        })`,
    });

    const isNewerThanVerification =
      !prod.lastVerifiedAt || countTime.getTime() > new Date(prod.lastVerifiedAt).getTime();

    if (!reconciliationEntry && isNewerThanVerification && physicalCount >= 0) {
      const [otherPendingCount] = await tx
        .select({ id: pendingStockMovements.id })
        .from(pendingStockMovements)
        .where(
          and(
            eq(pendingStockMovements.businessId, parsedBizId),
            eq(pendingStockMovements.productId, prod.id),
            eq(pendingStockMovements.status, "PENDING_REVIEW"),
            eq(pendingStockMovements.transactionType, "ADJUSTMENT")
          )
        )
        .limit(1);

      await tx
        .update(products)
        .set({
          verificationStatus: otherPendingCount ? "NEEDS_RECOUNT" : "VERIFIED",
          lastVerifiedAt: countTime,
          lastVerifiedQuantity: String(physicalCount),
          lastVerifiedByUserId: resolvedActorId,
          updatedAt: new Date(),
        })
        .where(eq(products.id, prod.id));
    }

    const now = new Date();
    await tx.insert(auditLogs).values({
      userId: prod.userId,
      businessId: parsedBizId,
      actorId: resolvedActorId,
      actorName: resolvedActorName,
      actorRole: resolvedActorRole,
      eventType: "STOCK_COUNT",
      description: `${resolvedActorName} counted ${prod.name}: physical ${physicalCount} ${prod.unit} (Difference: ${
        adjustmentDelta === 0
          ? "matches perfectly"
          : adjustmentDelta > 0
          ? `+${adjustmentDelta} more`
          : `${Math.abs(adjustmentDelta)} fewer`
      })`,
      entityType: "STOCK",
      entityId: productId,
      oldValue: String(preCutoffSum),
      newValue: String(physicalCount),
      reason: notes || null,
      source: "WEB",
      createdAt: now,
    });

    return {
      entry,
      pendingMovement: null,
      currentSystemStock: preCutoffSum,
      physicalCount,
      adjustmentDelta,
      isQuarantined: false,
      isDuplicateReplay: false,
    };
  });
}

// ==========================================
// 6. CUSTOMER DEBT & PAYMENTS (COLLECT)
// ==========================================

export async function getAllCustomers(
  businessId: number,
  actorId?: number
): Promise<EnrichedCustomer[]> {
  const parsedBizId = requireValidBusinessId(businessId);
  if (actorId) {
    await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
  }

  const allCustomers = await db
    .select()
    .from(customers)
    .where(eq(customers.businessId, parsedBizId))
    .orderBy(asc(customers.name));

  if (allCustomers.length === 0) {
    return [];
  }

  const [bizSales, bizPayments] = await Promise.all([
    db.select().from(sales).where(eq(sales.businessId, parsedBizId)),
    db.select().from(customerPayments).where(eq(customerPayments.businessId, parsedBizId)),
  ]);

  return allCustomers.map((cust) => {
    const custSales = bizSales.filter((s) => s.customerId === cust.id);
    const custPayments = bizPayments.filter((p) => p.customerId === cust.id);

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

    const totalPaid =
      custSales.reduce((sum, s) => sum + Number(s.amountPaid || 0), 0) +
      totalAdditionalPayments;

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
  businessId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  customerId: number;
  amount: number;
  paymentMethod?: string;
  notes?: string;
  source?: "WEB" | "WHATSAPP";
  idempotencyKey?: string | null;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
    actorId,
    actorName,
    actorRole,
    customerId,
    amount,
    paymentMethod = "CASH",
    notes,
    source = "WEB",
    idempotencyKey,
  } = params;

  if (idempotencyKey && idempotencyKey.trim()) {
    const existing = await db
      .select()
      .from(customerPayments)
      .where(
        and(
          eq(customerPayments.businessId, parsedBizId),
          eq(customerPayments.idempotencyKey, idempotencyKey.trim())
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }
  }

  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError("INVALID_PAYMENT_AMOUNT", "Enter a payment amount greater than 0.");
  }

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;
  let resolvedActorId = actorId ?? ownerUserId;
  let resolvedActorName = actorName || "Shop Operator";
  let resolvedActorRole: "OWNER" | "STAFF" = actorRole || "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "PAYMENT_CREATE", { businessId: parsedBizId });
    resolvedActorId = authCtx.userId;
    resolvedActorName = actorName || authCtx.fullName;
    resolvedActorRole = authCtx.membership.role;
  }

  const [cust] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, parsedBizId)))
    .limit(1);

  if (!cust) {
    throw new NotFoundError(
      "CUSTOMER_NOT_FOUND",
      "Customer not found or not owned by this business."
    );
  }

  const [payment] = await db
    .insert(customerPayments)
    .values({
      businessId: parsedBizId,
      userId: ownerUserId,
      staffUserId: resolvedActorId,
      customerId,
      amount: String(amount),
      paymentMethod,
      notes: notes || `Debt recovery payment from ${cust.name}`,
      idempotencyKey: idempotencyKey ? idempotencyKey.trim() : null,
      createdAt: new Date(),
    })
    .returning();

  await logAuditEvent({
    businessId: parsedBizId,
    userId: ownerUserId,
    actorId: resolvedActorId,
    actorName: resolvedActorName,
    actorRole: resolvedActorRole,
    eventType: "PAYMENT",
    description: `${resolvedActorName} collected ₦${amount.toLocaleString()} from ${cust.name} (${paymentMethod})`,
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

export async function getAllExpenses(
  businessId: number,
  actorId?: number
): Promise<Expense[]> {
  const parsedBizId = requireValidBusinessId(businessId);
  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
    assertCan(authCtx, "EXPENSE_VIEW", { businessId: parsedBizId });
  }
  return db
    .select()
    .from(expenses)
    .where(eq(expenses.businessId, parsedBizId))
    .orderBy(desc(expenses.createdAt));
}

export async function recordExpense(params: {
  businessId: number;
  actorId?: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  title: string;
  category?: string;
  amount: number;
  paymentMethod?: string;
  notes?: string;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const {
    actorId,
    actorName,
    actorRole,
    title,
    category = "Shop Operations",
    amount,
    paymentMethod = "CASH",
    notes,
  } = params;

  if (!title || !title.trim()) {
    throw new ValidationError("EXPENSE_TITLE_REQUIRED", "Please enter what this money was spent on.");
  }
  if (!amount || !Number.isFinite(amount) || amount <= 0) {
    throw new ValidationError("INVALID_EXPENSE_AMOUNT", "Enter an expense amount greater than 0.");
  }

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;
  let resolvedActorId = actorId ?? ownerUserId;
  let resolvedActorName = actorName || "Shop Operator";
  let resolvedActorRole: "OWNER" | "STAFF" = actorRole || "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "EXPENSE_CREATE", { businessId: parsedBizId });
    resolvedActorId = authCtx.userId;
    resolvedActorName = actorName || authCtx.fullName;
    resolvedActorRole = authCtx.membership.role;
  }

  const [newExp] = await db
    .insert(expenses)
    .values({
      businessId: parsedBizId,
      userId: ownerUserId,
      staffUserId: resolvedActorId,
      title: title.trim(),
      category: category.trim(),
      amount: String(amount),
      paymentMethod,
      notes: notes?.trim() || undefined,
      createdAt: new Date(),
    })
    .returning();

  await logAuditEvent({
    businessId: parsedBizId,
    userId: ownerUserId,
    actorId: resolvedActorId,
    actorName: resolvedActorName,
    actorRole: resolvedActorRole,
    eventType: "EXPENSE",
    description: `${resolvedActorName} recorded expense: "${newExp.title}" (₦${amount.toLocaleString()} via ${paymentMethod})`,
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
  businessId: number;
  actorId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  checkDate: string; // YYYY-MM-DD
  actualCash: number;
  notes?: string;
}): Promise<DailyCashCheck> {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const { actorId, actorName, actorRole, checkDate, actualCash, notes } = params;

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
    explicitRole: actorRole,
  });
  assertCan(authCtx, "CASH_CHECK_CREATE", { businessId: parsedBizId });

  const resolvedActorName = actorName || authCtx.fullName;
  const resolvedActorRole = authCtx.membership.role;
  const ownerUserId = authCtx.business.ownerUserId || actorId;

  const startOfDay = new Date(`${checkDate}T00:00:00.000Z`);
  const endOfDay = new Date(`${checkDate}T23:59:59.999Z`);

  // Today's sales cash using occurredAt (deducting cash refunds from till)
  const todaySales = await db
    .select({
      amountPaid: sales.amountPaid,
      refundAmount: sales.refundAmount,
    })
    .from(sales)
    .where(
      and(
        eq(sales.businessId, parsedBizId),
        sql`${sales.occurredAt} >= ${startOfDay}`,
        sql`${sales.occurredAt} <= ${endOfDay}`
      )
    );
  const salesCash = todaySales.reduce(
    (sum, s) => sum + Number(s.amountPaid || 0) - Number(s.refundAmount || 0),
    0
  );

  // Today's debt recovery payments
  const todayPayments = await db
    .select({ amount: customerPayments.amount })
    .from(customerPayments)
    .where(
      and(
        eq(customerPayments.businessId, parsedBizId),
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
        eq(expenses.businessId, parsedBizId),
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
      businessId: parsedBizId,
      userId: ownerUserId,
      actorId,
      actorName: resolvedActorName,
      checkDate,
      expectedCash: String(expectedCash),
      actualCash: String(actualCash),
      difference: String(difference),
      notes: notes?.trim() || undefined,
      createdAt: new Date(),
    })
    .returning();

  await logAuditEvent({
    businessId: parsedBizId,
    userId: ownerUserId,
    actorId,
    actorName: resolvedActorName,
    actorRole: resolvedActorRole,
    eventType: "DAILY_CASH_CHECK",
    description: `${resolvedActorName} recorded daily cash check: Actual ₦${actualCash.toLocaleString()} vs Expected ₦${expectedCash.toLocaleString()} (Difference: ${
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

export async function getDailyCashChecks(
  businessId: number,
  limit: number = 14,
  actorId?: number
): Promise<DailyCashCheck[]> {
  const parsedBizId = requireValidBusinessId(businessId);
  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
    assertCan(authCtx, "CASH_CHECK_VIEW", { businessId: parsedBizId });
  }
  return db
    .select()
    .from(dailyCashChecks)
    .where(eq(dailyCashChecks.businessId, parsedBizId))
    .orderBy(desc(dailyCashChecks.createdAt))
    .limit(limit);
}

// ==========================================
// 9. BUSINESS EXCEPTIONS DETECTION
// ==========================================

export async function getBusinessExceptions(
  businessId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
): Promise<BusinessException[]> {
  const parsedBizId = requireValidBusinessId(businessId);
  let canSeeCosts = userRole === "OWNER";
  let canSeeCashChecks = userRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: userRole,
    });
    canSeeCosts = userRole === "STAFF" ? false : can(authCtx, "PURCHASE_COST_VIEW");
    canSeeCashChecks = userRole === "STAFF" ? false : can(authCtx, "CASH_CHECK_VIEW");
  }

  const exceptions: BusinessException[] = [];

  const allProducts = await getAllEnrichedProducts(parsedBizId, userRole, actorId);
  const negativeProds = allProducts.filter((p) => p.currentStock < 0);
  for (const p of negativeProds) {
    exceptions.push({
      id: `neg_${p.id}`,
      type: "NEGATIVE_STOCK",
      severity: "URGENT",
      title: `${p.name}: ${p.currentStock} ${p.unit} (Below Zero)`,
      description:
        "Sales were recorded when recorded stock was empty. A physical count is required to correct the balance.",
      actionText: "Count Stock",
      actionTab: "STOCK",
    });
  }

  const urgentProds = allProducts.filter(
    (p) => p.intelligence.status === "RUNNING_LOW" && p.currentStock >= 0
  );
  for (const p of urgentProds.slice(0, 3)) {
    const days =
      p.intelligence.daysRemaining !== null ? Math.round(p.intelligence.daysRemaining) : null;
    exceptions.push({
      id: `urgent_${p.id}`,
      type: "LOW_STOCK",
      severity: "URGENT",
      title: `${p.name}: ${p.currentStock} ${p.unit} Left`,
      description:
        days !== null
          ? `About ${days} days remaining based on recent sales.`
          : "Approaching minimum stock level.",
      actionText: `Buy ${p.intelligence.suggestedPurchaseQuantity}`,
      actionTab: "BUYING",
    });
  }

  const allCustomers = await getAllCustomers(parsedBizId, actorId);
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

  if (canSeeCosts) {
    const prodsWithoutCost = allProducts.filter(
      (p) => !p.lastSupplierInfo?.unitCost || p.lastSupplierInfo.unitCost === 0
    );
    if (prodsWithoutCost.length > 0) {
      exceptions.push({
        id: "missing_costs",
        type: "MISSING_COST",
        severity: "INFO",
        title: `${prodsWithoutCost.length} Products Missing Purchase Prices`,
        description:
          "Record delivery purchase costs to calculate exact Cost of Goods Sold and Net Profit.",
        actionText: "Update Costs",
        actionTab: "STOCK",
      });
    }
  }

  const lastCounts = await db
    .select()
    .from(stockLedgerEntries)
    .where(
      and(
        eq(stockLedgerEntries.businessId, parsedBizId),
        eq(stockLedgerEntries.entryType, "ADJUSTMENT")
      )
    )
    .orderBy(desc(stockLedgerEntries.occurredAt))
    .limit(1);

  if (lastCounts.length === 0) {
    exceptions.push({
      id: "no_counts",
      type: "UNCHECKED_STOCK",
      severity: "ATTENTION",
      title: "Physical Stock Has Not Been Counted Yet",
      description:
        "Perform your first shop stock check to reconcile physical goods with system numbers.",
      actionText: "Start Stock Check",
      actionTab: "HOME",
    });
  } else {
    const daysSince = Math.floor(
      (Date.now() - new Date(lastCounts[0].occurredAt).getTime()) / (1000 * 60 * 60 * 24)
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

  if (canSeeCashChecks) {
    const latestCashCheck = (await getDailyCashChecks(parsedBizId, 1))[0];
    if (latestCashCheck && Number(latestCashCheck.difference) !== 0) {
      const diff = Number(latestCashCheck.difference);
      exceptions.push({
        id: `cash_diff_${latestCashCheck.id}`,
        type: "CASH_DISCREPANCY",
        severity: "ATTENTION",
        title: `Cash Difference on ${latestCashCheck.checkDate}: ₦${Math.abs(
          diff
        ).toLocaleString()} ${diff < 0 ? "short" : "extra"}`,
        description:
          "There is an unverified difference between recorded sales/expenses and actual cash.",
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
  businessId: number,
  days: number = 7,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
): Promise<{
  metrics: BusinessPeriodMetrics;
  topDebtors: EnrichedCustomer[];
  urgentStockItems: EnrichedProduct[];
  recentActivities: Array<Omit<StockLedgerEntry, "unitCost"> & { unitCost: string | null }>;
}> {
  const parsedBizId = requireValidBusinessId(businessId);
  let canSeePurchaseCost = userRole === "OWNER";
  let canSeeReports = userRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: userRole,
    });
    canSeePurchaseCost = userRole === "STAFF" ? false : can(authCtx, "PURCHASE_COST_VIEW");
    canSeeReports = userRole === "STAFF" ? false : can(authCtx, "REPORT_VIEW");
  }

  const now = new Date();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const [
    allSales,
    allPayments,
    allExpenses,
    allDeliveries,
    adjustments,
    allLedger,
    allPendingMovements,
  ] = await Promise.all([
    db
      .select()
      .from(sales)
      .where(and(eq(sales.businessId, parsedBizId), sql`${sales.occurredAt} >= ${periodStart}`)),
    db
      .select()
      .from(customerPayments)
      .where(
        and(
          eq(customerPayments.businessId, parsedBizId),
          sql`${customerPayments.createdAt} >= ${periodStart}`
        )
      ),
    db
      .select()
      .from(expenses)
      .where(
        and(eq(expenses.businessId, parsedBizId), sql`${expenses.createdAt} >= ${periodStart}`)
      ),
    db
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.businessId, parsedBizId),
          eq(stockLedgerEntries.entryType, "RESTOCK"),
          sql`${stockLedgerEntries.occurredAt} >= ${periodStart}`
        )
      ),
    db
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.businessId, parsedBizId),
          eq(stockLedgerEntries.entryType, "ADJUSTMENT"),
          sql`${stockLedgerEntries.occurredAt} >= ${periodStart}`
        )
      )
      .orderBy(desc(stockLedgerEntries.occurredAt)),
    db
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.businessId, parsedBizId)),
    db
      .select()
      .from(pendingStockMovements)
      .where(
        and(
          eq(pendingStockMovements.businessId, parsedBizId),
          eq(pendingStockMovements.status, "PENDING_REVIEW")
        )
      ),
  ]);

  const pendingDeliveriesInPeriod = allPendingMovements.filter(
    (pm) =>
      pm.transactionType === "RESTOCK" &&
      new Date(pm.provisionalOccurredAt).getTime() >= periodStart.getTime()
  );

  const lastAdjustment = adjustments.length > 0 ? new Date(adjustments[0].occurredAt) : null;

  const allProducts = await getAllEnrichedProducts(parsedBizId, userRole, actorId);
  const lowStockCount = allProducts.filter(
    (p) => p.intelligence.status === "RUNNING_LOW" || p.intelligence.status === "CHECK_SOON"
  ).length;
  const urgentStockItems = allProducts.filter((p) => p.intelligence.status === "RUNNING_LOW");
  const hasNeedsRecountProducts = allProducts.some(
    (p) => p.verificationStatus === "NEEDS_RECOUNT"
  );
  const hasNegativeStock = allProducts.some((p) => p.currentStock < 0);

  const allCust = await getAllCustomers(parsedBizId, actorId);
  const topDebtors = allCust
    .filter((c) => c.outstandingBalance > 0)
    .sort((a, b) => b.outstandingBalance - a.outstandingBalance);

  const priorDebt = topDebtors.reduce((sum, c) => sum + c.outstandingBalance, 0);

  const ledgerEntriesForValuation: LedgerValuationEntry[] = allLedger.map((e) => ({
    id: e.id,
    productId: e.productId,
    entryType: e.entryType,
    quantityDelta: Number(e.quantityDelta),
    unitCost: e.unitCost !== null ? Number(e.unitCost) : null,
    occurredAt: new Date(e.occurredAt),
    reconciledEntryId: e.reconciledEntryId,
  }));

  const metrics = calculatePeriodSummary({
    sales: allSales.map((s) => ({
      totalAmount: Number(s.totalAmount),
      amountPaid: Number(s.amountPaid),
      refundAmount: Number(s.refundAmount || 0),
      outstandingAmount: Number(s.outstandingAmount),
      quantity: Number(s.quantity),
      productId: s.productId,
      isCorrection: Boolean(s.isCorrection),
      timestampStatus: s.timestampStatus,
      createdAt: new Date(s.occurredAt),
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
      createdAt: new Date(d.occurredAt),
    })),
    pendingDeliveries: pendingDeliveriesInPeriod.map((pd) => ({
      productId: pd.productId,
      quantityDelta: Number(pd.quantityDelta),
      unitCost: pd.unitCost ? Number(pd.unitCost) : null,
      createdAt: new Date(pd.provisionalOccurredAt),
    })),
    ledgerEntries: ledgerEntriesForValuation,
    adjustmentsCount: adjustments.length,
    pendingMovementsCount: allPendingMovements.length,
    hasNeedsRecountProducts,
    hasNegativeStock,
    lowStockCount,
    lastStockCheckDate: lastAdjustment,
    periodStart,
    periodEnd: now,
    priorTotalDebt: priorDebt,
  });

  if (!canSeePurchaseCost || !canSeeReports) {
    metrics.costOfGoodsSold = 0;
    metrics.restockExpenditure = 0;
    metrics.pendingRestockExpenditure = 0;
    metrics.totalMoneySpent = metrics.operatingExpenses;
    metrics.estimatedProfit = null;
    metrics.profitBreakdown = null;
    metrics.profitConfidenceWarning = undefined;
  }

  const rawActivities = await db
    .select()
    .from(stockLedgerEntries)
    .where(eq(stockLedgerEntries.businessId, parsedBizId))
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
  businessId: number,
  actorId?: number,
  actorRole?: "OWNER" | "STAFF"
) {
  const parsedBizId = requireValidBusinessId(businessId);
  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: actorRole,
    });
    assertCan(authCtx, "EXPORT_DATA", { businessId: parsedBizId });
  } else if (actorRole && actorRole !== "OWNER") {
    throw new Error("FORBIDDEN_EXPORT_DATA");
  }

  const [
    bizRows,
    allProducts,
    allSales,
    allCustomers,
    allPayments,
    allExpenses,
    allLedger,
    allPending,
    allAudits,
    allCashChecks,
  ] = await Promise.all([
    db.select().from(businesses).where(eq(businesses.id, parsedBizId)).limit(1),
    db.select().from(products).where(eq(products.businessId, parsedBizId)),
    db.select().from(sales).where(eq(sales.businessId, parsedBizId)),
    db.select().from(customers).where(eq(customers.businessId, parsedBizId)),
    db.select().from(customerPayments).where(eq(customerPayments.businessId, parsedBizId)),
    db.select().from(expenses).where(eq(expenses.businessId, parsedBizId)),
    db.select().from(stockLedgerEntries).where(eq(stockLedgerEntries.businessId, parsedBizId)),
    db
      .select()
      .from(pendingStockMovements)
      .where(eq(pendingStockMovements.businessId, parsedBizId)),
    db.select().from(auditLogs).where(eq(auditLogs.businessId, parsedBizId)),
    db.select().from(dailyCashChecks).where(eq(dailyCashChecks.businessId, parsedBizId)),
  ]);

  let ownerSummary = null;
  if (bizRows[0]?.ownerUserId) {
    const [u] = await db
      .select({
        id: users.id,
        email: users.email,
        fullName: users.fullName,
        role: users.role,
        businessName: users.businessName,
      })
      .from(users)
      .where(eq(users.id, bizRows[0].ownerUserId))
      .limit(1);
    ownerSummary = u || null;
  }

  return {
    exportedAt: new Date().toISOString(),
    business: bizRows[0] ? { ...bizRows[0], owner: ownerSummary } : null,
    products: allProducts,
    sales: allSales,
    customers: allCustomers,
    payments: allPayments,
    expenses: allExpenses,
    stockLedger: allLedger,
    pendingMovements: allPending,
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
  businessId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
): Promise<SupplierSummary[]> {
  const parsedBizId = requireValidBusinessId(businessId);
  let canSeePurchaseCost = userRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: userRole,
    });
    canSeePurchaseCost = userRole === "STAFF" ? false : can(authCtx, "PURCHASE_COST_VIEW");
  }

  const [confirmedDeliveries, pendingDeliveries] = await Promise.all([
    db
      .select({
        productName: products.name,
        quantityDelta: stockLedgerEntries.quantityDelta,
        unitCost: stockLedgerEntries.unitCost,
        supplierName: stockLedgerEntries.supplierName,
        occurredAt: stockLedgerEntries.occurredAt,
      })
      .from(stockLedgerEntries)
      .innerJoin(products, eq(stockLedgerEntries.productId, products.id))
      .where(
        and(
          eq(stockLedgerEntries.businessId, parsedBizId),
          eq(stockLedgerEntries.entryType, "RESTOCK")
        )
      )
      .orderBy(desc(stockLedgerEntries.occurredAt)),
    db
      .select({
        productName: products.name,
        quantityDelta: pendingStockMovements.quantityDelta,
        unitCost: pendingStockMovements.unitCost,
        supplierName: pendingStockMovements.supplierName,
        occurredAt: pendingStockMovements.provisionalOccurredAt,
      })
      .from(pendingStockMovements)
      .innerJoin(products, eq(pendingStockMovements.productId, products.id))
      .where(
        and(
          eq(pendingStockMovements.businessId, parsedBizId),
          eq(pendingStockMovements.status, "PENDING_REVIEW"),
          eq(pendingStockMovements.transactionType, "RESTOCK")
        )
      )
      .orderBy(desc(pendingStockMovements.provisionalOccurredAt)),
  ]);

  const deliveries = [...confirmedDeliveries, ...pendingDeliveries].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

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
      unitCost: canSeePurchaseCost && item.unitCost ? Number(item.unitCost) : null,
      quantity: Number(item.quantityDelta),
      date: new Date(item.occurredAt),
    }));

    result.push({
      supplierName: name,
      deliveriesCount: list.length,
      productsSupplied: Array.from(productsSet),
      lastDeliveryDate: latest ? new Date(latest.occurredAt) : null,
      lastPurchaseCost: canSeePurchaseCost && latest?.unitCost ? Number(latest.unitCost) : null,
      previousPrices,
    });
  }

  return result.sort((a, b) => b.deliveriesCount - a.deliveriesCount);
}

// ==========================================
// 12. BUYING LIST CHECKLIST
// ==========================================

export async function getBuyingList(
  businessId: number,
  userRole: "OWNER" | "STAFF" = "OWNER",
  actorId?: number
) {
  const parsedBizId = requireValidBusinessId(businessId);
  let canSeePurchaseCost = userRole === "OWNER";

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
      explicitRole: userRole,
    });
    canSeePurchaseCost = userRole === "STAFF" ? false : can(authCtx, "PURCHASE_COST_VIEW");
  }

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
    .where(eq(buyingListItems.businessId, parsedBizId))
    .orderBy(asc(buyingListItems.isCompleted), desc(buyingListItems.createdAt));

  return items.map((item) => ({
    ...item,
    estimatedUnitCost: canSeePurchaseCost ? item.estimatedUnitCost : null,
  }));
}

export async function addOrUpdateBuyingListItem(params: {
  businessId: number;
  productId: number;
  quantityToBuy: number;
  estimatedUnitCost?: number | null;
  supplierName?: string | null;
  actorId?: number;
}) {
  const parsedBizId = requireValidBusinessId(params.businessId);
  const { productId, quantityToBuy, estimatedUnitCost, supplierName, actorId } = params;

  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;

  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
    assertCan(authCtx, "BUYING_DECISION", { businessId: parsedBizId });
  }

  const existing = await db
    .select()
    .from(buyingListItems)
    .where(
      and(eq(buyingListItems.productId, productId), eq(buyingListItems.businessId, parsedBizId))
    )
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
        supplierName: supplierName !== undefined ? supplierName : existing[0].supplierName,
        updatedAt: new Date(),
      })
      .where(
        and(eq(buyingListItems.id, existing[0].id), eq(buyingListItems.businessId, parsedBizId))
      )
      .returning();
    return updated;
  }

  const [item] = await db
    .insert(buyingListItems)
    .values({
      businessId: parsedBizId,
      userId: ownerUserId,
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
  businessId: number,
  id: number,
  isCompleted?: boolean,
  quantityToBuy?: number,
  actorId?: number
) {
  const parsedBizId = requireValidBusinessId(businessId);
  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
    assertCan(authCtx, "BUYING_DECISION", { businessId: parsedBizId });
  }

  const setFields: any = { updatedAt: new Date() };
  if (isCompleted !== undefined) setFields.isCompleted = isCompleted;
  if (quantityToBuy !== undefined && Number(quantityToBuy) > 0) {
    setFields.quantityToBuy = Number(quantityToBuy);
  }

  const [updated] = await db
    .update(buyingListItems)
    .set(setFields)
    .where(and(eq(buyingListItems.id, id), eq(buyingListItems.businessId, parsedBizId)))
    .returning();
  return updated;
}

export async function removeBuyingListItem(
  businessId: number,
  id: number,
  actorId?: number
) {
  const parsedBizId = requireValidBusinessId(businessId);
  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
    assertCan(authCtx, "BUYING_DECISION", { businessId: parsedBizId });
  }

  await db
    .delete(buyingListItems)
    .where(and(eq(buyingListItems.id, id), eq(buyingListItems.businessId, parsedBizId)));
  return true;
}

export async function clearCompletedBuyingItems(businessId: number, actorId?: number) {
  const parsedBizId = requireValidBusinessId(businessId);
  if (actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
    assertCan(authCtx, "BUYING_DECISION", { businessId: parsedBizId });
  }

  await db
    .delete(buyingListItems)
    .where(
      and(eq(buyingListItems.isCompleted, true), eq(buyingListItems.businessId, parsedBizId))
    );
  return true;
}

// ==========================================
// 13. SEED SAMPLE SHOP DEMO
// ==========================================

export async function seedBuildingMaterialDemoData(businessId: number, actorId?: number) {
  const parsedBizId = requireValidBusinessId(businessId);
  const biz = await resolveBusinessForUser(actorId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? actorId ?? 0;

  if (actorId) {
    await requireActiveBusinessContext({
      userId: actorId,
      activeBusinessId: parsedBizId,
    });
  }

  // Delete strictly within parsedBizId in ON DELETE RESTRICT child-first order
  await db
    .delete(pendingStockMovements)
    .where(eq(pendingStockMovements.businessId, parsedBizId));
  await db.delete(dailyCashChecks).where(eq(dailyCashChecks.businessId, parsedBizId));
  await db.delete(auditLogs).where(eq(auditLogs.businessId, parsedBizId));
  await db.delete(expenses).where(eq(expenses.businessId, parsedBizId));
  await db.delete(customerPayments).where(eq(customerPayments.businessId, parsedBizId));

  // Delete child reconciliation ledger rows before parent ledger rows
  await db
    .delete(stockLedgerEntries)
    .where(
      and(
        eq(stockLedgerEntries.businessId, parsedBizId),
        isNotNull(stockLedgerEntries.reconciledEntryId)
      )
    );
  await db.delete(stockLedgerEntries).where(eq(stockLedgerEntries.businessId, parsedBizId));

  // Delete child correction sales before parent sales
  await db
    .delete(sales)
    .where(and(eq(sales.businessId, parsedBizId), isNotNull(sales.originalSaleId)));
  await db.delete(sales).where(eq(sales.businessId, parsedBizId));

  await db.delete(customers).where(eq(customers.businessId, parsedBizId));
  await db.delete(buyingListItems).where(eq(buyingListItems.businessId, parsedBizId));

  const existingSessions = await db
    .select({ id: openingStockSessions.id })
    .from(openingStockSessions)
    .where(eq(openingStockSessions.businessId, parsedBizId));
  if (existingSessions.length > 0) {
    await db
      .delete(openingStockItems)
      .where(
        inArray(
          openingStockItems.sessionId,
          existingSessions.map((s) => s.id)
        )
      );
    await db
      .delete(openingStockSessions)
      .where(eq(openingStockSessions.businessId, parsedBizId));
  }

  await db.delete(products).where(eq(products.businessId, parsedBizId));

  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;

  const [cust1] = await db
    .insert(customers)
    .values({
      businessId: parsedBizId,
      userId: ownerUserId,
      name: "Engr. Patrick Site Lead",
      phone: "08031234567",
      address: "Lekki Phase 1 Project Site",
    })
    .returning();

  const [cust2] = await db
    .insert(customers)
    .values({
      businessId: parsedBizId,
      userId: ownerUserId,
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
        businessId: parsedBizId,
        userId: ownerUserId,
        name: item.name,
        category: item.category,
        unit: item.unit,
        stockUnit: item.unit,
        sellingPrice: String(item.sellingPrice),
        desiredCoverageDays: item.desiredCoverageDays,
        minimumStockThreshold: item.minimumStockThreshold,
        createdAt: createdDate,
        updatedAt: createdDate,
      })
      .returning();

    await db.insert(stockLedgerEntries).values({
      businessId: parsedBizId,
      userId: ownerUserId,
      productId: prod.id,
      entryType: "OPENING_BALANCE",
      quantityDelta: String(item.openingStock),
      unitCost: String(item.cost),
      supplierName: item.supplier,
      notes: "Shop opening balance setup",
      occurredAt: createdDate,
      createdAt: createdDate,
    });

    for (const s of item.salesPattern) {
      const saleDate = new Date(now.getTime() - s.daysAgo * dayMs);
      const total = s.qty * item.sellingPrice;
      const status = s.credit === 0 ? "PAID" : s.paid > 0 ? "PARTIAL" : "UNPAID";

      const [saleRec] = await db
        .insert(sales)
        .values({
          businessId: parsedBizId,
          userId: ownerUserId,
          customerId: s.custId,
          productId: prod.id,
          quantity: String(s.qty),
          unitPrice: String(item.sellingPrice),
          totalAmount: String(total),
          amountPaid: String(s.paid),
          refundAmount: "0.00",
          outstandingAmount: String(s.credit),
          paymentStatus: status,
          notes: "Daily customer sale",
          occurredAt: saleDate,
          timestampStatus: "CONFIRMED",
          timestampBasis: "SERVER_INGESTION",
          createdAt: saleDate,
        })
        .returning();

      await db.insert(stockLedgerEntries).values({
        businessId: parsedBizId,
        userId: ownerUserId,
        productId: prod.id,
        saleId: saleRec.id,
        entryType: "SALE",
        quantityDelta: String(-Math.abs(s.qty)),
        notes: "Daily customer sale",
        occurredAt: saleDate,
        createdAt: saleDate,
      });
    }

    if (item.name.includes("Cement")) {
      const deliveryDate = new Date(now.getTime() - 9 * dayMs);
      await db.insert(stockLedgerEntries).values({
        businessId: parsedBizId,
        userId: ownerUserId,
        productId: prod.id,
        entryType: "RESTOCK",
        quantityDelta: "50",
        unitCost: "8500",
        supplierName: "Dangote Depot Lagos",
        notes: "Trailer delivery received",
        occurredAt: deliveryDate,
        createdAt: deliveryDate,
      });
    }
  }

  await db.insert(customerPayments).values({
    businessId: parsedBizId,
    userId: ownerUserId,
    customerId: cust1.id,
    amount: "70000",
    paymentMethod: "TRANSFER",
    notes: "Site lead partial payment towards cement debt",
    createdAt: new Date(now.getTime() - 2 * dayMs),
  });

  await db.insert(expenses).values({
    businessId: parsedBizId,
    userId: ownerUserId,
    title: "Generator Diesel Fuel (50L)",
    category: "Shop Operations",
    amount: "65000",
    paymentMethod: "CASH",
    notes: "Weekly shop power fuel",
    createdAt: new Date(now.getTime() - 3 * dayMs),
  });

  await db.insert(expenses).values({
    businessId: parsedBizId,
    userId: ownerUserId,
    title: "Offloading Labor for Cement Trailer",
    category: "Transport & Logistics",
    amount: "25000",
    paymentMethod: "CASH",
    notes: "Offloaded 50 bags to yard",
    createdAt: new Date(now.getTime() - 9 * dayMs),
  });

  const allProds = await db
    .select()
    .from(products)
    .where(eq(products.businessId, parsedBizId));
  const cement = allProds.find((p) => p.name.includes("Cement"));
  if (cement) {
    await db.insert(buyingListItems).values({
      businessId: parsedBizId,
      userId: ownerUserId,
      productId: cement.id,
      quantityToBuy: 80,
      estimatedUnitCost: "8500",
      supplierName: "Dangote Depot Lagos",
      isCompleted: false,
    });
  }

  await logAuditEvent({
    businessId: parsedBizId,
    userId: ownerUserId,
    actorId: actorId ?? ownerUserId,
    actorName: "Owner",
    actorRole: "OWNER",
    eventType: "INITIAL_SETUP",
    description: "Shop opened and inventory catalog initialized",
    entityType: "SYSTEM",
  });

  return true;
}
