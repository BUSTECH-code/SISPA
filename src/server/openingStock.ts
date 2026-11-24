import { db } from "@/db";
import {
  products,
  businesses,
  stockLedgerEntries,
  openingStockSessions,
  openingStockItems,
  pendingStockMovements,
  sales,
  auditLogs,
  type Product,
  type StockLedgerEntry,
  type OpeningStockSession,
  type OpeningStockItem,
  type PendingStockMovement,
} from "@/db/schema";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import {
  ActiveBusinessRequiredError,
  parsePositiveBusinessId,
  requireActiveBusinessContext,
} from "./authService";
import { assertCan, can } from "./authorization";
import { validateQuantityConstraints } from "@/domain/packaging";

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class ConflictError extends Error {
  readonly statusCode = 409;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ConflictError";
    this.code = code;
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "NotFoundError";
    this.code = code;
  }
}

export class ValidationError extends Error {
  readonly statusCode = 400;
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

// ==========================================
// 1. DETERMINISTIC DEADLOCK-FREE LOCK HIERARCHY
//    L1: opening_stock_sessions / pending_stock_movements (id ASC)
// -> L2: products (id ASC)
// -> L3: sales / customers (id ASC)
// ==========================================

const productLockQueues = new Map<number, Promise<void>>();
const sessionLockQueues = new Map<number, Promise<void>>();
const pendingLockQueues = new Map<number, Promise<void>>();
const saleLockQueues = new Map<number, Promise<void>>();

async function acquireQueueMutex(
  queues: Map<number, Promise<void>>,
  key: number
): Promise<() => void> {
  const previous = queues.get(key) ?? Promise.resolve();
  let releaseFn!: () => void;
  const current = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });
  const chained = previous.then(() => current);
  queues.set(key, chained);

  await previous;

  return () => {
    releaseFn();
    if (queues.get(key) === chained) {
      queues.delete(key);
    }
  };
}

async function acquireSortedMutexes(
  queues: Map<number, Promise<void>>,
  ids: number[],
  emptyError: string
): Promise<{
  sortedIds: number[];
  release: () => void;
}> {
  const sortedIds = [...new Set(ids)]
    .filter((id) => Number.isInteger(id) && id > 0)
    .sort((a, b) => a - b);

  if (sortedIds.length === 0) {
    throw new Error(emptyError);
  }

  const releases: Array<() => void> = [];
  try {
    for (const id of sortedIds) {
      releases.push(await acquireQueueMutex(queues, id));
    }
  } catch (err) {
    for (let i = releases.length - 1; i >= 0; i--) {
      releases[i]();
    }
    throw err;
  }

  return {
    sortedIds,
    release: () => {
      for (let i = releases.length - 1; i >= 0; i--) {
        releases[i]();
      }
    },
  };
}

export async function acquireSessionMutex(sessionId: number): Promise<() => void> {
  return acquireQueueMutex(sessionLockQueues, sessionId);
}

export async function acquirePendingMovementMutexes(ids: number[]) {
  return acquireSortedMutexes(
    pendingLockQueues,
    ids,
    "At least one valid pending movement ID is required for locking."
  );
}

export async function acquireProductMutexes(productIds: number[]) {
  return acquireSortedMutexes(
    productLockQueues,
    productIds,
    "At least one valid product ID is required for locking."
  );
}

export async function acquireSaleMutexes(saleIds: number[]) {
  return acquireSortedMutexes(
    saleLockQueues,
    saleIds,
    "At least one valid sale ID is required for locking."
  );
}

/**
 * L2 lock helper: Acquire exclusive product-row locks in ascending productId order (`ORDER BY id ASC FOR UPDATE`)
 * strictly scoped by `businessId`.
 */
export async function withLockedProducts<T>(
  businessId: number,
  productIds: number[],
  fn: (tx: DbTransaction, lockedProducts: Product[]) => Promise<T>
): Promise<T> {
  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const { sortedIds, release } = await acquireProductMutexes(productIds);

  try {
    return await db.transaction(async (tx) => {
      const lockedProducts = await tx
        .select()
        .from(products)
        .where(and(inArray(products.id, sortedIds), eq(products.businessId, parsedBizId)))
        .orderBy(asc(products.id))
        .for("update");

      if (lockedProducts.length !== sortedIds.length) {
        const foundIds = new Set(lockedProducts.map((p) => p.id));
        const missing = sortedIds.find((id) => !foundIds.has(id));
        throw new NotFoundError(
          "PRODUCT_NOT_FOUND",
          `Product #${missing} not found or not owned by this business.`
        );
      }

      return await fn(tx, lockedProducts);
    });
  } finally {
    release();
  }
}

// ==========================================
// 2. EXPLICIT TENANT BUSINESS & FOUR-TIMESTAMP POLICY
// ==========================================

export const EPOCH_FLOOR = new Date("2024-01-01T00:00:00.000Z");
export const FUTURE_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Strictly validate explicit businessId (zero fallback to userId or businesses[0]).
 */
export async function resolveBusinessForUser(
  _userId: number,
  providedBusinessId?: number | null
): Promise<{ id: number; createdAt: Date; ownerUserId: number | null; state: string }> {
  const parsed = parsePositiveBusinessId(providedBusinessId);
  if (!parsed) {
    throw new ActiveBusinessRequiredError();
  }

  const [biz] = await db
    .select({
      id: businesses.id,
      createdAt: businesses.createdAt,
      ownerUserId: businesses.ownerUserId,
      state: businesses.state,
    })
    .from(businesses)
    .where(eq(businesses.id, parsed))
    .limit(1);

  if (!biz) {
    throw new NotFoundError("BUSINESS_NOT_FOUND", "Business entity not found.");
  }
  return biz;
}

export type TimestampBasis =
  | "SERVER_INGESTION"
  | "DEVICE_TIMESTAMP"
  | "OWNER_CONFIRMED_EXACT"
  | "OWNER_CONFIRMED_CUTOFF_RELATIVE"
  | "PARENT_SALE_PENDING";

export interface TimestampResolutionResult {
  isUncertain: boolean;
  provisionalOccurredAt: Date;
  confirmedOccurredAt: Date | null;
  deviceTimestamp: Date | null;
  serverIngestedAt: Date;
  timestampBasis: TimestampBasis;
  skewFlag?: "DEVICE_CLOCK_FUTURE_SKEW" | "DEVICE_CLOCK_ANCIENT_SKEW" | "INVALID_DEVICE_TIMESTAMP";
  originalTimestamp?: Date;
}

/**
 * Resolve four-timestamp classification for operational mutations:
 * - Online operations without explicit client/historical timestamp strictly use server `now` (CONFIRMED).
 * - Valid timestamps within `[max(business.createdAt, 2024-01-01), now + 5m]` are CONFIRMED.
 * - Skewed future/ancient or invalid device timestamps are NEVER clamped into confirmed occurredAt;
 *   they return `isUncertain: true` with `confirmedOccurredAt: null` and `provisionalOccurredAt: serverNow`
 *   so inventory effects can be quarantined in `pending_stock_movements` / `NEEDS_RECOUNT`.
 */
export async function resolveTransactionTimestamp(params: {
  businessId: number;
  userId?: number;
  occurredAt?: Date | string | null;
  clientTimestamp?: Date | string | null;
  customDate?: Date | string | null;
  isOfflineSync?: boolean;
  now?: Date;
}): Promise<TimestampResolutionResult> {
  const parsedBizId = parsePositiveBusinessId(params.businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const now = params.now ?? new Date();
  const hasClientTs = params.clientTimestamp !== undefined && params.clientTimestamp !== null;
  const hasExplicitOccurredAt = params.occurredAt !== undefined && params.occurredAt !== null;
  const hasCustomDate = params.customDate !== undefined && params.customDate !== null;

  if (!hasClientTs && !hasExplicitOccurredAt && !hasCustomDate) {
    return {
      isUncertain: false,
      provisionalOccurredAt: now,
      confirmedOccurredAt: now,
      deviceTimestamp: null,
      serverIngestedAt: now,
      timestampBasis: "SERVER_INGESTION",
    };
  }

  const rawInput = hasClientTs
    ? params.clientTimestamp!
    : hasExplicitOccurredAt
    ? params.occurredAt!
    : params.customDate!;

  const parsed = rawInput instanceof Date ? rawInput : new Date(rawInput);
  if (isNaN(parsed.getTime())) {
    return {
      isUncertain: true,
      provisionalOccurredAt: now,
      confirmedOccurredAt: null,
      deviceTimestamp: null,
      serverIngestedAt: now,
      timestampBasis: "SERVER_INGESTION",
      skewFlag: "INVALID_DEVICE_TIMESTAMP",
    };
  }

  // Future skew guard (> server_now + 5 minutes)
  if (parsed.getTime() > now.getTime() + FUTURE_SKEW_TOLERANCE_MS) {
    return {
      isUncertain: true,
      provisionalOccurredAt: now,
      confirmedOccurredAt: null,
      deviceTimestamp: parsed,
      serverIngestedAt: now,
      timestampBasis: "SERVER_INGESTION",
      skewFlag: "DEVICE_CLOCK_FUTURE_SKEW",
      originalTimestamp: parsed,
    };
  }

  let minAllowed = EPOCH_FLOOR;
  if (hasClientTs || params.isOfflineSync) {
    const biz = await resolveBusinessForUser(params.userId ?? 0, parsedBizId);
    if (biz.createdAt) {
      const bizCreated = new Date(biz.createdAt);
      if (bizCreated.getTime() > minAllowed.getTime()) {
        minAllowed = bizCreated;
      }
    }
  }

  if (parsed.getTime() < minAllowed.getTime()) {
    return {
      isUncertain: true,
      provisionalOccurredAt: now,
      confirmedOccurredAt: null,
      deviceTimestamp: parsed,
      serverIngestedAt: now,
      timestampBasis: "SERVER_INGESTION",
      skewFlag: "DEVICE_CLOCK_ANCIENT_SKEW",
      originalTimestamp: parsed,
    };
  }

  return {
    isUncertain: false,
    provisionalOccurredAt: parsed,
    confirmedOccurredAt: parsed,
    deviceTimestamp: hasClientTs ? parsed : null,
    serverIngestedAt: now,
    timestampBasis: "DEVICE_TIMESTAMP",
  };
}

// ==========================================
// 3. APPEND-ONLY CUT-OFF RECONCILIATION (EXACT <= BOUNDARY)
// ==========================================

export async function recordReconciledMovementInTx(
  tx: DbTransaction,
  params: {
    businessId: number;
    userId: number;
    actorId?: number;
    product: Product;
    transactionType: "SALE" | "RESTOCK" | "ADJUSTMENT" | "CORRECTION";
    quantityDelta: number;
    occurredAt: Date;
    saleId?: number | null;
    unitCost?: number | null;
    supplierName?: string | null;
    idempotencyKey?: string | null;
    notes?: string | null;
  }
): Promise<{
  ledgerEntry: StockLedgerEntry;
  reconciliationEntry?: StockLedgerEntry;
  isDuplicateReplay: boolean;
}> {
  const {
    businessId,
    userId,
    actorId = userId,
    product,
    transactionType,
    quantityDelta,
    occurredAt,
    saleId = null,
    unitCost = null,
    supplierName = null,
    idempotencyKey,
    notes = null,
  } = params;

  const trimmedKey = idempotencyKey?.trim() || null;

  // Idempotency replay check inside lock (strictly scoped by businessId)
  if (trimmedKey) {
    const [existing] = await tx
      .select()
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.businessId, businessId),
          eq(stockLedgerEntries.idempotencyKey, trimmedKey)
        )
      )
      .limit(1);

    if (existing) {
      const [existingRecon] = await tx
        .select()
        .from(stockLedgerEntries)
        .where(eq(stockLedgerEntries.reconciledEntryId, existing.id))
        .limit(1);

      return {
        ledgerEntry: existing,
        reconciliationEntry: existingRecon,
        isDuplicateReplay: true,
      };
    }
  }

  const now = new Date();

  const [ledgerEntry] = await tx
    .insert(stockLedgerEntries)
    .values({
      businessId,
      userId,
      staffUserId: actorId,
      productId: product.id,
      saleId,
      entryType: transactionType,
      quantityDelta: String(quantityDelta),
      unitCost: unitCost !== null && unitCost !== undefined ? String(unitCost) : null,
      supplierName: supplierName?.trim() || null,
      notes,
      idempotencyKey: trimmedKey,
      occurredAt,
      createdAt: now,
    })
    .returning();

  let reconciliationEntry: StockLedgerEntry | undefined = undefined;

  // Approved cut-off equality rule: occurredAt <= countCutoff is pre-cutoff; occurredAt > countCutoff is post-cutoff
  const cutOffDate = product.lastVerifiedAt ? new Date(product.lastVerifiedAt) : null;
  const isPreCutoff = cutOffDate !== null && occurredAt.getTime() <= cutOffDate.getTime();

  if (isPreCutoff && quantityDelta !== 0) {
    const reconDelta = -quantityDelta;
    const reconKey = trimmedKey ? `${trimmedKey}:recon` : null;

    const [createdRecon] = await tx
      .insert(stockLedgerEntries)
      .values({
        businessId,
        userId,
        staffUserId: actorId,
        productId: product.id,
        saleId,
        entryType: "OPENING_BALANCE_RECONCILIATION",
        quantityDelta: String(reconDelta),
        unitCost: null, // Strictly excluded from financial/COGS reports
        supplierName: null,
        reconciledEntryId: ledgerEntry.id,
        idempotencyKey: reconKey,
        occurredAt,
        createdAt: now,
        notes: `Reconciliation for pre-count ${transactionType} (#${ledgerEntry.id}) at/before cut-off ${cutOffDate.toISOString()}`,
      })
      .returning();

    reconciliationEntry = createdRecon;
  }

  // Transition VERIFIED -> NEEDS_RECOUNT if post-cut-off negative movement pushes balance below zero
  if (!reconciliationEntry && product.verificationStatus === "VERIFIED" && quantityDelta < 0) {
    const allProductEntries = await tx
      .select({ delta: stockLedgerEntries.quantityDelta })
      .from(stockLedgerEntries)
      .where(
        and(
          eq(stockLedgerEntries.productId, product.id),
          eq(stockLedgerEntries.businessId, businessId)
        )
      );

    const newBalance = allProductEntries.reduce((sum, e) => sum + Number(e.delta || 0), 0);
    if (newBalance < 0) {
      await tx
        .update(products)
        .set({
          verificationStatus: "NEEDS_RECOUNT",
          updatedAt: now,
        })
        .where(eq(products.id, product.id));
    }
  }

  return {
    ledgerEntry,
    reconciliationEntry,
    isDuplicateReplay: false,
  };
}

/**
 * Standalone reconciled movement API for offline sync and cut-off-aware ledger entries.
 */
export async function recordReconciledMovement(params: {
  businessId: number;
  userId?: number;
  actorId?: number;
  productId: number;
  transactionType: "SALE" | "RESTOCK" | "ADJUSTMENT" | "CORRECTION";
  quantityDelta: number;
  occurredAt: Date;
  referenceId?: number;
  saleId?: number | null;
  unitCost?: number | null;
  supplierName?: string | null;
  idempotencyKey?: string | null;
  notes?: string;
}): Promise<{
  ledgerEntry: StockLedgerEntry;
  reconciliationEntry?: StockLedgerEntry;
  isDuplicateReplay: boolean;
}> {
  const parsedBizId = parsePositiveBusinessId(params.businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const biz = await resolveBusinessForUser(params.actorId ?? params.userId ?? 0, parsedBizId);
  const ownerUserId = biz.ownerUserId ?? params.userId ?? params.actorId ?? 0;

  if (params.actorId) {
    const authCtx = await requireActiveBusinessContext({
      userId: params.actorId,
      activeBusinessId: parsedBizId,
    });
    const capMap = {
      SALE: "SALE_CREATE",
      RESTOCK: "DELIVERY_CREATE",
      ADJUSTMENT: "STOCK_COUNT",
      CORRECTION: "SALE_CORRECTION",
    } as const;
    assertCan(authCtx, capMap[params.transactionType], { businessId: parsedBizId });
  }

  return withLockedProducts(parsedBizId, [params.productId], async (tx, [lockedProduct]) => {
    return recordReconciledMovementInTx(tx, {
      businessId: parsedBizId,
      userId: lockedProduct.userId ?? ownerUserId,
      actorId: params.actorId ?? ownerUserId,
      product: lockedProduct,
      transactionType: params.transactionType,
      quantityDelta: params.quantityDelta,
      occurredAt: params.occurredAt,
      saleId: params.saleId ?? params.referenceId ?? null,
      unitCost: params.unitCost ?? null,
      supplierName: params.supplierName ?? null,
      idempotencyKey: params.idempotencyKey,
      notes: params.notes ?? null,
    });
  });
}

// ==========================================
// 4. OPENING STOCK SESSIONS & CUT-OFF POSTING
// ==========================================

export async function createOpeningStockSession(params: {
  businessId: number;
  userId?: number;
  actorId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  name: string;
  notes?: string;
  idempotencyKey?: string | null;
  productIds?: number[];
}): Promise<OpeningStockSession> {
  const {
    businessId,
    actorId,
    name,
    notes,
    idempotencyKey,
    productIds,
  } = params;

  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  if (!name || !name.trim()) {
    throw new ValidationError("VALIDATION_ERROR", "Please enter a session name.");
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "STOCK_COUNT", { businessId: parsedBizId });

  const trimmedKey = idempotencyKey?.trim() || null;
  if (trimmedKey) {
    const [existing] = await db
      .select()
      .from(openingStockSessions)
      .where(
        and(
          eq(openingStockSessions.businessId, parsedBizId),
          eq(openingStockSessions.idempotencyKey, trimmedKey)
        )
      )
      .limit(1);
    if (existing) return existing;
  }

  const ownerUserId = authCtx.business.ownerUserId || actorId;

  return await db.transaction(async (tx) => {
    const [session] = await tx
      .insert(openingStockSessions)
      .values({
        businessId: parsedBizId,
        userId: ownerUserId,
        name: name.trim(),
        status: "DRAFT",
        notes: notes?.trim() || null,
        idempotencyKey: trimmedKey,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    let targetProducts: Array<{ id: number }> = [];
    if (productIds && productIds.length > 0) {
      const uniqueIds = [...new Set(productIds)];
      targetProducts = await tx
        .select({ id: products.id })
        .from(products)
        .where(and(inArray(products.id, uniqueIds), eq(products.businessId, parsedBizId)));
      if (targetProducts.length !== uniqueIds.length) {
        throw new ValidationError(
          "INVALID_PRODUCTS",
          "One or more specified products do not exist or belong to this shop."
        );
      }
    } else {
      targetProducts = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.businessId, parsedBizId));
    }

    if (targetProducts.length > 0) {
      const now = new Date();
      await tx.insert(openingStockItems).values(
        targetProducts.map((p) => ({
          sessionId: session.id,
          productId: p.id,
          status: "NOT_COUNTED",
          timestampStatus: "CONFIRMED",
          createdAt: now,
          updatedAt: now,
        }))
      );
    }

    return session;
  });
}

export async function recordSessionCount(params: {
  sessionId: number;
  businessId: number;
  userId?: number;
  productId: number;
  countedQuantity: number;
  countedAt?: Date | string | null;
  unitCost?: number | null;
  countedByUserId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  notes?: string;
}): Promise<OpeningStockItem> {
  const {
    sessionId,
    businessId,
    productId,
    countedQuantity,
    countedAt,
    unitCost,
    countedByUserId,
    actorName,
    notes,
  } = params;

  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  if (typeof countedQuantity !== "number" || !Number.isFinite(countedQuantity) || countedQuantity < 0) {
    throw new ValidationError(
      "INVALID_COUNT_QUANTITY",
      "Physical count quantity must be a valid number greater than or equal to 0."
    );
  }

  const authCtx = await requireActiveBusinessContext({
    userId: countedByUserId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "STOCK_COUNT", { businessId: parsedBizId });

  const canEditCost = can(authCtx, "PURCHASE_COST_EDIT", { businessId: parsedBizId });
  const resolvedActorName = actorName || authCtx.fullName || "Shop Operator";
  const resolvedActorRole = authCtx.membership.role;

  const sanitizedCost =
    canEditCost && unitCost !== null && unitCost !== undefined && unitCost > 0
      ? String(unitCost)
      : null;

  // Strict lock hierarchy: L1 session lock FIRST inside transaction
  const releaseSession = await acquireSessionMutex(sessionId);
  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(openingStockSessions)
        .where(
          and(
            eq(openingStockSessions.id, sessionId),
            eq(openingStockSessions.businessId, parsedBizId)
          )
        )
        .for("update")
        .limit(1);

      if (!session) {
        throw new NotFoundError("SESSION_NOT_FOUND", "Opening stock session not found.");
      }

      if (session.status !== "DRAFT") {
        throw new ConflictError(
          "SESSION_NOT_DRAFT",
          `Cannot record count: opening stock session is already ${session.status}.`
        );
      }

      const [prod] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, productId), eq(products.businessId, parsedBizId)))
        .limit(1);

      if (!prod) {
        throw new NotFoundError(
          "PRODUCT_NOT_FOUND",
          "Product not found or not owned by this business."
        );
      }

      const quantityCheck = validateQuantityConstraints({
        quantity: countedQuantity,
        allowFractionalQuantity: prod.allowFractionalQuantity,
        unitName: prod.stockUnit || prod.unit,
        allowZero: true,
      });
      if (!quantityCheck.valid) {
        throw new ValidationError(
          "INVALID_QUANTITY",
          quantityCheck.error || "Invalid counted quantity."
        );
      }

      const now = new Date();
      const timestampResult = await resolveTransactionTimestamp({
        businessId: parsedBizId,
        userId: session.userId,
        clientTimestamp: countedAt ?? null,
        isOfflineSync: countedAt !== undefined && countedAt !== null,
        now,
      });

      const isUncertain = timestampResult.isUncertain;
      const itemStatus = isUncertain ? "NEEDS_RECOUNT" : "COUNTED";
      const itemTimestampStatus = isUncertain ? "PENDING_REVIEW" : "CONFIRMED";
      const effectiveCountedAt = isUncertain ? null : timestampResult.confirmedOccurredAt;

      const [existingItem] = await tx
        .select()
        .from(openingStockItems)
        .where(
          and(
            eq(openingStockItems.sessionId, sessionId),
            eq(openingStockItems.productId, productId)
          )
        )
        .limit(1);

      let savedItem: OpeningStockItem;
      if (existingItem) {
        const [updated] = await tx
          .update(openingStockItems)
          .set({
            countedQuantity: String(countedQuantity),
            countedAt: effectiveCountedAt,
            deviceCountedAt: timestampResult.deviceTimestamp,
            skewFlag: timestampResult.skewFlag ?? null,
            timestampStatus: itemTimestampStatus,
            timestampBasis: timestampResult.timestampBasis,
            status: itemStatus,
            countedByUserId,
            unitCost: sanitizedCost,
            notes: notes?.trim() || existingItem.notes,
            updatedAt: now,
          })
          .where(eq(openingStockItems.id, existingItem.id))
          .returning();
        savedItem = updated;
      } else {
        const [inserted] = await tx
          .insert(openingStockItems)
          .values({
            sessionId,
            productId,
            countedQuantity: String(countedQuantity),
            countedAt: effectiveCountedAt,
            deviceCountedAt: timestampResult.deviceTimestamp,
            skewFlag: timestampResult.skewFlag ?? null,
            timestampStatus: itemTimestampStatus,
            timestampBasis: timestampResult.timestampBasis,
            status: itemStatus,
            countedByUserId,
            unitCost: sanitizedCost,
            notes: notes?.trim() || null,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        savedItem = inserted;
      }

      if (timestampResult.skewFlag) {
        await tx.insert(auditLogs).values({
          userId: session.userId,
          businessId: parsedBizId,
          actorId: countedByUserId,
          actorName: resolvedActorName,
          actorRole: resolvedActorRole,
          eventType: timestampResult.skewFlag,
          description: `Quarantined physical count with skewed timestamp (${timestampResult.originalTimestamp?.toISOString() ?? "invalid"}) as NEEDS_RECOUNT on opening stock item #${savedItem.id} (session #${session.id})`,
          entityType: "OPENING_STOCK_ITEM",
          entityId: savedItem.id,
          oldValue: timestampResult.originalTimestamp?.toISOString() || null,
          newValue: "NEEDS_RECOUNT",
          source: "WEB",
          createdAt: now,
        });
      }

      return savedItem;
    });
  } finally {
    releaseSession();
  }
}

/**
 * OWNER-only confirmation of a skewed physical count timestamp inside a DRAFT opening-stock session.
 */
export async function confirmOpeningSessionItemTimestamp(params: {
  sessionId: number;
  businessId: number;
  productId: number;
  actorId: number;
  actorName?: string;
  confirmedCountedAt: Date | string;
  notes?: string;
}): Promise<OpeningStockItem> {
  const { sessionId, businessId, productId, actorId, actorName, confirmedCountedAt, notes } = params;

  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "STOCK_COUNT_TIMESTAMP_CONFIRM", { businessId: parsedBizId });

  const resolvedAt = confirmedCountedAt instanceof Date ? confirmedCountedAt : new Date(confirmedCountedAt);
  if (isNaN(resolvedAt.getTime())) {
    throw new ValidationError("INVALID_TIMESTAMP", "Provide a valid confirmed count timestamp.");
  }

  const now = new Date();
  let minAllowed = EPOCH_FLOOR;
  const biz = await resolveBusinessForUser(actorId, parsedBizId);
  if (biz.createdAt && new Date(biz.createdAt).getTime() > minAllowed.getTime()) {
    minAllowed = new Date(biz.createdAt);
  }

  if (resolvedAt.getTime() > now.getTime() + FUTURE_SKEW_TOLERANCE_MS) {
    throw new ValidationError("FUTURE_TIMESTAMP_NOT_ALLOWED", "Confirmed count timestamp cannot be in the future.");
  }
  if (resolvedAt.getTime() < minAllowed.getTime()) {
    throw new ValidationError(
      "ANCIENT_TIMESTAMP_NOT_ALLOWED",
      `Confirmed count timestamp cannot predate business creation (${minAllowed.toISOString()}).`
    );
  }

  const resolvedActorName = actorName || authCtx.fullName || "Owner";
  const releaseSession = await acquireSessionMutex(sessionId);

  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(openingStockSessions)
        .where(
          and(
            eq(openingStockSessions.id, sessionId),
            eq(openingStockSessions.businessId, parsedBizId)
          )
        )
        .for("update")
        .limit(1);

      if (!session) {
        throw new NotFoundError("SESSION_NOT_FOUND", "Opening stock session not found.");
      }
      if (session.status !== "DRAFT") {
        throw new ConflictError(
          "SESSION_NOT_DRAFT",
          `Cannot confirm count timestamp: opening stock session is already ${session.status}.`
        );
      }

      const [item] = await tx
        .select()
        .from(openingStockItems)
        .where(
          and(
            eq(openingStockItems.sessionId, sessionId),
            eq(openingStockItems.productId, productId)
          )
        )
        .limit(1);

      if (!item) {
        throw new NotFoundError("SESSION_ITEM_NOT_FOUND", "Opening stock item not found.");
      }
      if (item.status !== "NEEDS_RECOUNT" && item.timestampStatus !== "PENDING_REVIEW") {
        throw new ConflictError(
          "ITEM_NOT_PENDING_TIMESTAMP",
          `Session item #${item.id} does not have a pending skewed timestamp.`
        );
      }

      const [updated] = await tx
        .update(openingStockItems)
        .set({
          countedAt: resolvedAt,
          status: "COUNTED",
          timestampStatus: "CONFIRMED",
          timestampBasis: "OWNER_CONFIRMED_EXACT",
          notes: notes?.trim() ? `${item.notes ? item.notes + " | " : ""}${notes.trim()}` : item.notes,
          updatedAt: now,
        })
        .where(eq(openingStockItems.id, item.id))
        .returning();

      await tx.insert(auditLogs).values({
        userId: session.userId,
        businessId: parsedBizId,
        actorId,
        actorName: resolvedActorName,
        actorRole: "OWNER",
        eventType: "STOCK_COUNT_TIMESTAMP_CONFIRMED",
        description: `${resolvedActorName} confirmed timestamp ${resolvedAt.toISOString()} for opening stock item #${item.id} (session #${session.id})`,
        entityType: "OPENING_STOCK_ITEM",
        entityId: item.id,
        oldValue: item.deviceCountedAt?.toISOString() ?? item.skewFlag ?? "PENDING_REVIEW",
        newValue: resolvedAt.toISOString(),
        reason: notes?.trim() || null,
        source: "WEB",
        createdAt: now,
      });

      return updated;
    });
  } finally {
    releaseSession();
  }
}

function summarizeSessionItems(items: OpeningStockItem[]) {
  let postedCount = 0;
  let supersededCount = 0;
  let skippedUncountedCount = 0;
  for (const it of items) {
    if (it.status === "POSTED") postedCount++;
    else if (it.status === "STALE_SUPERSEDED") supersededCount++;
    else if (it.status === "NOT_COUNTED") skippedUncountedCount++;
  }
  return { postedCount, supersededCount, skippedUncountedCount };
}

export async function postOpeningStockSession(params: {
  sessionId: number;
  businessId: number;
  userId?: number;
  actorId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  idempotencyKey?: string | null;
}): Promise<{
  session: OpeningStockSession;
  postedCount: number;
  supersededCount: number;
  skippedUncountedCount: number;
  isDuplicateReplay: boolean;
}> {
  const {
    sessionId,
    businessId,
    actorId,
    actorName,
    idempotencyKey,
  } = params;

  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "STOCK_COUNT", { businessId: parsedBizId });

  const canEditCost = can(authCtx, "PURCHASE_COST_EDIT", { businessId: parsedBizId });
  const resolvedActorName = actorName || authCtx.fullName || "Shop Operator";
  const resolvedActorRole = authCtx.membership.role;

  const trimmedKey = idempotencyKey?.trim() || null;

  // Consistent L1 -> L2 lock hierarchy: acquire L1 session lock FIRST inside tx,
  // inspect authoritative sessionItems under lock (eliminating preItems TOCTOU),
  // then acquire L2 product locks in id ASC order.
  const releaseSession = await acquireSessionMutex(sessionId);
  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(openingStockSessions)
        .where(
          and(
            eq(openingStockSessions.id, sessionId),
            eq(openingStockSessions.businessId, parsedBizId)
          )
        )
        .for("update")
        .limit(1);

      if (!session) {
        throw new NotFoundError("SESSION_NOT_FOUND", "Opening stock session not found.");
      }
      if (session.status === "CANCELLED") {
        throw new ConflictError("SESSION_NOT_DRAFT", "Cannot post a cancelled opening stock session.");
      }
      if (session.status === "POSTED") {
        const currentItems = await tx
          .select()
          .from(openingStockItems)
          .where(eq(openingStockItems.sessionId, session.id));
        if (trimmedKey && session.idempotencyKey === trimmedKey) {
          return {
            session,
            ...summarizeSessionItems(currentItems),
            isDuplicateReplay: true,
          };
        }
        throw new ConflictError("SESSION_ALREADY_POSTED", "Opening stock session has already been posted.");
      }

      if (trimmedKey) {
        const [otherByKey] = await tx
          .select()
          .from(openingStockSessions)
          .where(
            and(
              eq(openingStockSessions.businessId, parsedBizId),
              eq(openingStockSessions.idempotencyKey, trimmedKey)
            )
          )
          .limit(1);
        if (otherByKey && otherByKey.status === "POSTED") {
          const items = await tx
            .select()
            .from(openingStockItems)
            .where(eq(openingStockItems.sessionId, otherByKey.id));
          return {
            session: otherByKey,
            ...summarizeSessionItems(items),
            isDuplicateReplay: true,
          };
        }
      }

      const sessionItems = await tx
        .select()
        .from(openingStockItems)
        .where(eq(openingStockItems.sessionId, sessionId))
        .orderBy(asc(openingStockItems.productId));

      // Block posting if any item has an unresolved skewed timestamp (NEEDS_RECOUNT / PENDING_REVIEW)
      const pendingTimestampItems = sessionItems.filter(
        (i) => i.status === "NEEDS_RECOUNT" || i.timestampStatus === "PENDING_REVIEW"
      );
      if (pendingTimestampItems.length > 0) {
        throw new ConflictError(
          "SESSION_HAS_PENDING_TIMESTAMP_ITEMS",
          `Cannot post opening stock session while ${pendingTimestampItems.length} item(s) have unconfirmed skewed timestamps (NEEDS_RECOUNT). Confirm timestamps or recount before posting.`
        );
      }

      const countedProductIds = [
        ...new Set(
          sessionItems
            .filter((i) => i.status === "COUNTED" && i.countedQuantity !== null && i.countedAt !== null)
            .map((i) => i.productId)
        ),
      ].sort((a, b) => a - b);

      const now = new Date();

      // Empty/uncounted-only session: follows identical locking, status-transition, and audit rules
      if (countedProductIds.length === 0) {
        const skippedUncountedCount = sessionItems.filter((i) => i.status === "NOT_COUNTED").length;
        const [updatedSession] = await tx
          .update(openingStockSessions)
          .set({
            status: "POSTED",
            postedAt: now,
            idempotencyKey: trimmedKey ?? session.idempotencyKey,
            updatedAt: now,
          })
          .where(eq(openingStockSessions.id, session.id))
          .returning();

        await tx.insert(auditLogs).values({
          userId: session.userId,
          businessId: parsedBizId,
          actorId,
          actorName: resolvedActorName,
          actorRole: resolvedActorRole,
          eventType: "OPENING_STOCK_POSTED",
          description: `${resolvedActorName} posted opening stock session "${session.name}": 0 verified, 0 superseded, ${skippedUncountedCount} left unverified`,
          entityType: "OPENING_STOCK_SESSION",
          entityId: session.id,
          newValue: "0 verified",
          source: "WEB",
          createdAt: now,
        });

        return {
          session: updatedSession,
          postedCount: 0,
          supersededCount: 0,
          skippedUncountedCount,
          isDuplicateReplay: false,
        };
      }

      // Non-empty session: acquire L2 product locks in ascending ID order after L1 session lock
      const { sortedIds, release: releaseProducts } = await acquireProductMutexes(countedProductIds);
      try {
        const lockedProducts = await tx
          .select()
          .from(products)
          .where(and(inArray(products.id, sortedIds), eq(products.businessId, parsedBizId)))
          .orderBy(asc(products.id))
          .for("update");

        if (lockedProducts.length !== sortedIds.length) {
          const foundIds = new Set(lockedProducts.map((p) => p.id));
          const missing = sortedIds.find((id) => !foundIds.has(id));
          throw new NotFoundError(
            "PRODUCT_NOT_FOUND",
            `Product #${missing} not found or not owned by this business.`
          );
        }

        const productMap = new Map(lockedProducts.map((p) => [p.id, p]));

        let postedCount = 0;
        let supersededCount = 0;
        let skippedUncountedCount = 0;

        for (const item of sessionItems) {
          if (item.status === "NOT_COUNTED" || item.countedQuantity === null || item.countedAt === null) {
            skippedUncountedCount++;
            continue;
          }

          if (item.status !== "COUNTED") {
            continue;
          }

          const prod = productMap.get(item.productId);
          if (!prod) {
            throw new NotFoundError(
              "PRODUCT_NOT_FOUND",
              `Counted product #${item.productId} could not be locked for posting.`
            );
          }

          const countedQty = Number(item.countedQuantity);
          const countedAt = new Date(item.countedAt);

          if (prod.lastVerifiedAt) {
            const existingVerifiedMs = new Date(prod.lastVerifiedAt).getTime();
            const existingVerifiedQty = Number(prod.lastVerifiedQuantity);

            // Exact-timestamp physical count conflict guard
            if (existingVerifiedMs === countedAt.getTime() && existingVerifiedQty !== countedQty) {
              throw new ConflictError(
                "COUNT_CONFLICT_EXACT_TIMESTAMP",
                `Product #${prod.id} already has a verified count of ${existingVerifiedQty} at exact timestamp ${countedAt.toISOString()} (attempted ${countedQty}).`
              );
            }

            // Stale / Superseded guard: do not overwrite strictly newer (or identical-qty equal-timestamp) verification
            if (existingVerifiedMs >= countedAt.getTime()) {
              await tx
                .update(openingStockItems)
                .set({
                  status: "STALE_SUPERSEDED",
                  notes: item.notes
                    ? `${item.notes} (Superseded by newer verification)`
                    : `Superseded by newer verification at ${new Date(prod.lastVerifiedAt).toISOString()}`,
                  updatedAt: now,
                })
                .where(eq(openingStockItems.id, item.id));
              supersededCount++;
              continue;
            }
          }

          // Compute authoritative pre-cut-off ledger sum (occurredAt <= countedAt)
          const existingEntries = await tx
            .select({
              quantityDelta: stockLedgerEntries.quantityDelta,
              occurredAt: stockLedgerEntries.occurredAt,
            })
            .from(stockLedgerEntries)
            .where(
              and(
                eq(stockLedgerEntries.productId, prod.id),
                eq(stockLedgerEntries.businessId, parsedBizId)
              )
            );

          const preCutoffSum = existingEntries
            .filter((e) => new Date(e.occurredAt).getTime() <= countedAt.getTime())
            .reduce((sum, e) => sum + Number(e.quantityDelta || 0), 0);

          const openingDelta = countedQty - preCutoffSum;

          await tx.insert(stockLedgerEntries).values({
            businessId: parsedBizId,
            userId: session.userId,
            staffUserId: item.countedByUserId || actorId,
            productId: prod.id,
            entryType: "OPENING_BALANCE",
            quantityDelta: String(openingDelta),
            unitCost: canEditCost && item.unitCost ? item.unitCost : null,
            notes: `Opening stock session #${session.id} (${session.name}): physical count ${countedQty} ${prod.stockUnit || prod.unit} at ${countedAt.toISOString()}`,
            occurredAt: countedAt,
            createdAt: now,
          });

          await tx
            .update(openingStockItems)
            .set({
              status: "POSTED",
              reconciledBaseline: String(preCutoffSum),
              updatedAt: now,
            })
            .where(eq(openingStockItems.id, item.id));

          await tx
            .update(products)
            .set({
              verificationStatus: "VERIFIED",
              lastVerifiedAt: countedAt,
              lastVerifiedQuantity: String(countedQty),
              lastVerifiedByUserId: item.countedByUserId || actorId,
              updatedAt: now,
            })
            .where(eq(products.id, prod.id));

          postedCount++;
        }

        const [updatedSession] = await tx
          .update(openingStockSessions)
          .set({
            status: "POSTED",
            postedAt: now,
            idempotencyKey: trimmedKey ?? session.idempotencyKey,
            updatedAt: now,
          })
          .where(eq(openingStockSessions.id, session.id))
          .returning();

        await tx.insert(auditLogs).values({
          userId: session.userId,
          businessId: parsedBizId,
          actorId,
          actorName: resolvedActorName,
          actorRole: resolvedActorRole,
          eventType: "OPENING_STOCK_POSTED",
          description: `${resolvedActorName} posted opening stock session "${session.name}": ${postedCount} verified, ${supersededCount} superseded, ${skippedUncountedCount} left unverified`,
          entityType: "OPENING_STOCK_SESSION",
          entityId: session.id,
          newValue: `${postedCount} verified`,
          source: "WEB",
          createdAt: now,
        });

        return {
          session: updatedSession,
          postedCount,
          supersededCount,
          skippedUncountedCount,
          isDuplicateReplay: false,
        };
      } finally {
        releaseProducts();
      }
    });
  } finally {
    releaseSession();
  }
}

export async function cancelOpeningStockSession(params: {
  sessionId: number;
  businessId: number;
  userId?: number;
  actorId: number;
  actorName?: string;
  actorRole?: "OWNER" | "STAFF";
  reason?: string;
}): Promise<OpeningStockSession> {
  const { sessionId, businessId, actorId, actorName, reason } = params;

  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "STOCK_COUNT", { businessId: parsedBizId });

  const resolvedActorName = actorName || authCtx.fullName || "Shop Operator";
  const resolvedActorRole = authCtx.membership.role;

  const releaseSession = await acquireSessionMutex(sessionId);
  try {
    return await db.transaction(async (tx) => {
      const [session] = await tx
        .select()
        .from(openingStockSessions)
        .where(
          and(
            eq(openingStockSessions.id, sessionId),
            eq(openingStockSessions.businessId, parsedBizId)
          )
        )
        .for("update")
        .limit(1);

      if (!session) {
        throw new NotFoundError("SESSION_NOT_FOUND", "Opening stock session not found.");
      }
      if (session.status !== "DRAFT") {
        throw new ConflictError(
          "SESSION_NOT_DRAFT",
          `Cannot cancel session with status ${session.status}.`
        );
      }

      const now = new Date();
      const [cancelled] = await tx
        .update(openingStockSessions)
        .set({
          status: "CANCELLED",
          notes: reason ? `${session.notes ? session.notes + " | " : ""}Cancelled: ${reason}` : session.notes,
          updatedAt: now,
        })
        .where(eq(openingStockSessions.id, sessionId))
        .returning();

      await tx.insert(auditLogs).values({
        userId: session.userId,
        businessId: parsedBizId,
        actorId,
        actorName: resolvedActorName,
        actorRole: resolvedActorRole,
        eventType: "OPENING_STOCK_CANCELLED",
        description: `${resolvedActorName} cancelled draft opening stock session "${session.name}"`,
        entityType: "OPENING_STOCK_SESSION",
        entityId: session.id,
        reason: reason || null,
        source: "WEB",
        createdAt: now,
      });

      return cancelled;
    });
  } finally {
    releaseSession();
  }
}

export async function getOpeningStockSession(
  sessionId: number,
  businessId: number,
  actorId?: number
): Promise<{ session: OpeningStockSession; items: OpeningStockItem[] } | null> {
  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  if (actorId) {
    await requireActiveBusinessContext({ userId: actorId, activeBusinessId: parsedBizId });
  }

  const [session] = await db
    .select()
    .from(openingStockSessions)
    .where(
      and(
        eq(openingStockSessions.id, sessionId),
        eq(openingStockSessions.businessId, parsedBizId)
      )
    )
    .limit(1);

  if (!session) return null;

  const items = await db
    .select()
    .from(openingStockItems)
    .where(eq(openingStockItems.sessionId, session.id))
    .orderBy(asc(openingStockItems.productId));

  return { session, items };
}

export async function listOpeningStockSessions(
  businessId: number,
  actorId?: number
): Promise<OpeningStockSession[]> {
  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  if (actorId) {
    await requireActiveBusinessContext({ userId: actorId, activeBusinessId: parsedBizId });
  }

  return db
    .select()
    .from(openingStockSessions)
    .where(eq(openingStockSessions.businessId, parsedBizId))
    .orderBy(desc(openingStockSessions.createdAt));
}

// ==========================================
// 5. PENDING STOCK MOVEMENTS QUARANTINE & OWNER RESOLUTION
// ==========================================

export async function listPendingStockMovements(params: {
  businessId: number;
  actorId: number;
  status?: "PENDING_REVIEW" | "RESOLVED_PRE_CUTOFF" | "RESOLVED_POST_CUTOFF" | "ALL";
}): Promise<PendingStockMovement[]> {
  const parsedBizId = parsePositiveBusinessId(params.businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const authCtx = await requireActiveBusinessContext({
    userId: params.actorId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "PENDING_MOVEMENT_RESOLVE", { businessId: parsedBizId });

  const filterStatus = params.status ?? "PENDING_REVIEW";
  if (filterStatus === "ALL") {
    return db
      .select()
      .from(pendingStockMovements)
      .where(eq(pendingStockMovements.businessId, parsedBizId))
      .orderBy(desc(pendingStockMovements.createdAt));
  }

  return db
    .select()
    .from(pendingStockMovements)
    .where(
      and(
        eq(pendingStockMovements.businessId, parsedBizId),
        eq(pendingStockMovements.status, filterStatus)
      )
    )
    .orderBy(desc(pendingStockMovements.createdAt));
}

export async function updatePendingDeliveryCost(params: {
  pendingMovementId: number;
  businessId: number;
  actorId: number;
  actorName?: string;
  unitCost: number;
}): Promise<PendingStockMovement> {
  const { pendingMovementId, businessId, actorId, actorName, unitCost } = params;

  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "PENDING_MOVEMENT_COST_EDIT", { businessId: parsedBizId });

  if (typeof unitCost !== "number" || !Number.isFinite(unitCost) || unitCost <= 0) {
    throw new ValidationError("INVALID_UNIT_COST", "Enter a valid unit purchase cost greater than 0.");
  }

  const resolvedActorName = actorName || authCtx.fullName || "Owner";
  const { release } = await acquirePendingMovementMutexes([pendingMovementId]);

  try {
    return await db.transaction(async (tx) => {
      const [pending] = await tx
        .select()
        .from(pendingStockMovements)
        .where(
          and(
            eq(pendingStockMovements.id, pendingMovementId),
            eq(pendingStockMovements.businessId, parsedBizId)
          )
        )
        .for("update")
        .limit(1);

      if (!pending) {
        throw new NotFoundError("PENDING_MOVEMENT_NOT_FOUND", "Pending stock movement not found.");
      }
      if (pending.transactionType !== "RESTOCK") {
        throw new ValidationError(
          "NOT_A_DELIVERY",
          "Purchase cost can only be edited on pending RESTOCK deliveries."
        );
      }
      if (pending.status !== "PENDING_REVIEW") {
        throw new ConflictError(
          "PENDING_MOVEMENT_ALREADY_RESOLVED",
          "Cannot edit cost on an already resolved pending movement; update the ledger delivery instead."
        );
      }

      const now = new Date();
      const [updated] = await tx
        .update(pendingStockMovements)
        .set({
          unitCost: String(unitCost),
          updatedAt: now,
        })
        .where(eq(pendingStockMovements.id, pending.id))
        .returning();

      await tx.insert(auditLogs).values({
        userId: authCtx.business.ownerUserId || actorId,
        businessId: parsedBizId,
        actorId,
        actorName: resolvedActorName,
        actorRole: "OWNER",
        eventType: "PENDING_MOVEMENT_COST_UPDATED",
        description: `${resolvedActorName} updated unit cost to ₦${unitCost.toLocaleString()} on pending delivery #${pending.id}`,
        entityType: "PENDING_STOCK_MOVEMENT",
        entityId: pending.id,
        oldValue: pending.unitCost ? `₦${pending.unitCost}` : "None",
        newValue: `₦${unitCost}`,
        isSensitive: true,
        source: "WEB",
        createdAt: now,
      });

      return updated;
    });
  } finally {
    release();
  }
}

/**
 * OWNER-only resolution of a quarantined pending stock movement.
 * Enforces strict L1 (pending_stock_movements id ASC) -> L2 (products id ASC) -> L3 (sales id ASC) lock order.
 */
export async function resolvePendingMovement(params: {
  pendingMovementId: number;
  businessId: number;
  actorId: number;
  actorName?: string;
  resolutionMode: "EXACT_TIMESTAMP" | "PRE_CUTOFF" | "POST_CUTOFF";
  resolvedOccurredAt?: Date | string | null;
  resolutionNote: string;
}): Promise<{
  pendingMovement: PendingStockMovement;
  ledgerEntry: StockLedgerEntry;
  reconciliationEntry?: StockLedgerEntry;
}> {
  const {
    pendingMovementId,
    businessId,
    actorId,
    actorName,
    resolutionMode,
    resolvedOccurredAt,
    resolutionNote,
  } = params;

  const parsedBizId = parsePositiveBusinessId(businessId);
  if (!parsedBizId) {
    throw new ActiveBusinessRequiredError();
  }

  if (!resolutionNote || !resolutionNote.trim()) {
    throw new ValidationError("RESOLUTION_NOTE_REQUIRED", "Please provide a resolution note.");
  }

  const authCtx = await requireActiveBusinessContext({
    userId: actorId,
    activeBusinessId: parsedBizId,
  });
  assertCan(authCtx, "PENDING_MOVEMENT_RESOLVE", { businessId: parsedBizId });

  const resolvedActorName = actorName || authCtx.fullName || "Owner";
  const biz = await resolveBusinessForUser(actorId, parsedBizId);

  // Peek outside lock only to discover dependsOnPendingId & productId so we can acquire L1 mutexes in id ASC order,
  // then re-read & lock everything authoritatively inside tx.
  const [peek] = await db
    .select({
      id: pendingStockMovements.id,
      dependsOnPendingId: pendingStockMovements.dependsOnPendingId,
      productId: pendingStockMovements.productId,
    })
    .from(pendingStockMovements)
    .where(
      and(
        eq(pendingStockMovements.id, pendingMovementId),
        eq(pendingStockMovements.businessId, parsedBizId)
      )
    )
    .limit(1);

  if (!peek) {
    throw new NotFoundError("PENDING_MOVEMENT_NOT_FOUND", "Pending stock movement not found.");
  }

  const l1Ids = peek.dependsOnPendingId ? [peek.id, peek.dependsOnPendingId] : [peek.id];
  const { sortedIds: sortedL1Ids, release: releasePending } = await acquirePendingMovementMutexes(l1Ids);

  try {
    return await db.transaction(async (tx) => {
      // L1: lock pending_stock_movements rows in id ASC order
      const lockedPendings = await tx
        .select()
        .from(pendingStockMovements)
        .where(
          and(
            inArray(pendingStockMovements.id, sortedL1Ids),
            eq(pendingStockMovements.businessId, parsedBizId)
          )
        )
        .orderBy(asc(pendingStockMovements.id))
        .for("update");

      const pending = lockedPendings.find((p) => p.id === pendingMovementId);
      if (!pending) {
        throw new NotFoundError("PENDING_MOVEMENT_NOT_FOUND", "Pending stock movement not found.");
      }
      if (pending.status !== "PENDING_REVIEW") {
        throw new ConflictError(
          "PENDING_MOVEMENT_ALREADY_RESOLVED",
          `Pending movement #${pending.id} has already been resolved (${pending.status}).`
        );
      }

      if (pending.dependsOnPendingId) {
        const parentPending = lockedPendings.find((p) => p.id === pending.dependsOnPendingId);
        if (!parentPending || parentPending.status === "PENDING_REVIEW") {
          throw new ConflictError(
            "PARENT_SALE_PENDING_REVIEW",
            `Resolve the original sale's pending movement (#${pending.dependsOnPendingId}) before resolving this dependent return.`
          );
        }
      }

      // L2: lock product row
      const { release: releaseProduct } = await acquireProductMutexes([pending.productId]);
      try {
        const [prod] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, pending.productId), eq(products.businessId, parsedBizId)))
          .for("update")
          .limit(1);

        if (!prod) {
          throw new NotFoundError("PRODUCT_NOT_FOUND", "Product not found for pending movement.");
        }

        const now = new Date();
        let minAllowed = EPOCH_FLOOR;
        if (biz.createdAt && new Date(biz.createdAt).getTime() > minAllowed.getTime()) {
          minAllowed = new Date(biz.createdAt);
        }
        const maxAllowed = new Date(now.getTime() + FUTURE_SKEW_TOLERANCE_MS);

        const productCutoff = prod.lastVerifiedAt ? new Date(prod.lastVerifiedAt) : null;
        const refCutoff = productCutoff ?? (pending.cutoffSnapshotAt ? new Date(pending.cutoffSnapshotAt) : null);

        let targetOccurredAt: Date;
        let timestampBasis: TimestampBasis;

        if (resolutionMode === "EXACT_TIMESTAMP") {
          if (!resolvedOccurredAt) {
            throw new ValidationError(
              "RESOLVED_TIMESTAMP_REQUIRED",
              "resolvedOccurredAt is required when resolutionMode is EXACT_TIMESTAMP."
            );
          }
          const parsedDate =
            resolvedOccurredAt instanceof Date ? resolvedOccurredAt : new Date(resolvedOccurredAt);
          if (isNaN(parsedDate.getTime())) {
            throw new ValidationError("INVALID_TIMESTAMP", "Invalid resolvedOccurredAt timestamp.");
          }
          if (parsedDate.getTime() > maxAllowed.getTime()) {
            throw new ValidationError(
              "FUTURE_TIMESTAMP_NOT_ALLOWED",
              "Resolved occurrence timestamp cannot be in the future."
            );
          }
          if (parsedDate.getTime() < minAllowed.getTime()) {
            throw new ValidationError(
              "ANCIENT_TIMESTAMP_NOT_ALLOWED",
              `Resolved occurrence timestamp cannot predate business creation (${minAllowed.toISOString()}).`
            );
          }
          targetOccurredAt = parsedDate;
          timestampBasis = "OWNER_CONFIRMED_EXACT";
        } else if (resolutionMode === "PRE_CUTOFF") {
          if (!refCutoff) {
            throw new ConflictError(
              "NO_CUTOFF_FOR_PRE_CUTOFF_RESOLUTION",
              "Cannot resolve as PRE_CUTOFF because this product has no verified stocktake cut-off timestamp."
            );
          }
          if (resolvedOccurredAt) {
            const parsedDate =
              resolvedOccurredAt instanceof Date ? resolvedOccurredAt : new Date(resolvedOccurredAt);
            if (isNaN(parsedDate.getTime())) {
              throw new ValidationError("INVALID_TIMESTAMP", "Invalid resolvedOccurredAt timestamp.");
            }
            if (parsedDate.getTime() > refCutoff.getTime()) {
              throw new ValidationError(
                "PRE_CUTOFF_TIMESTAMP_EXCEEDS_CUTOFF",
                `PRE_CUTOFF resolution timestamp must be <= cut-off (${refCutoff.toISOString()}).`
              );
            }
            if (parsedDate.getTime() < minAllowed.getTime()) {
              throw new ValidationError(
                "ANCIENT_TIMESTAMP_NOT_ALLOWED",
                `Resolved occurrence timestamp cannot predate business creation (${minAllowed.toISOString()}).`
              );
            }
            targetOccurredAt = parsedDate;
          } else {
            // Exact cut-off boundary (<= countCutoff) is deterministically pre-cutoff without altering pre-cutoff time order
            targetOccurredAt = refCutoff;
          }
          timestampBasis = "OWNER_CONFIRMED_CUTOFF_RELATIVE";
        } else {
          // POST_CUTOFF
          if (resolvedOccurredAt) {
            const parsedDate =
              resolvedOccurredAt instanceof Date ? resolvedOccurredAt : new Date(resolvedOccurredAt);
            if (isNaN(parsedDate.getTime())) {
              throw new ValidationError("INVALID_TIMESTAMP", "Invalid resolvedOccurredAt timestamp.");
            }
            if (refCutoff && parsedDate.getTime() <= refCutoff.getTime()) {
              throw new ValidationError(
                "POST_CUTOFF_TIMESTAMP_NOT_AFTER_CUTOFF",
                `POST_CUTOFF resolution timestamp must be > cut-off (${refCutoff.toISOString()}).`
              );
            }
            if (parsedDate.getTime() > maxAllowed.getTime()) {
              throw new ValidationError(
                "FUTURE_TIMESTAMP_NOT_ALLOWED",
                "Resolved occurrence timestamp cannot be in the future."
              );
            }
            targetOccurredAt = parsedDate;
          } else {
            if (refCutoff && now.getTime() <= refCutoff.getTime()) {
              targetOccurredAt = new Date(refCutoff.getTime() + 1000);
            } else {
              targetOccurredAt = now;
            }
          }
          timestampBasis = "OWNER_CONFIRMED_CUTOFF_RELATIVE";
        }

        // Authoritative cut-off status determination (<= countCutoff -> PRE_CUTOFF, > countCutoff -> POST_CUTOFF)
        const isPreCutoff =
          productCutoff !== null && targetOccurredAt.getTime() <= productCutoff.getTime();
        const resolvedStatus: "RESOLVED_PRE_CUTOFF" | "RESOLVED_POST_CUTOFF" = isPreCutoff
          ? "RESOLVED_PRE_CUTOFF"
          : "RESOLVED_POST_CUTOFF";

        let ledgerEntry: StockLedgerEntry;
        let reconciliationEntry: StockLedgerEntry | undefined;
        let resolvedDelta: number;

        if (pending.transactionType === "ADJUSTMENT") {
          const physicalCount = Number(pending.physicalCount ?? pending.quantityDelta);

          // Exact-timestamp physical count conflict guard
          if (
            productCutoff &&
            targetOccurredAt.getTime() === productCutoff.getTime() &&
            Number(prod.lastVerifiedQuantity) !== physicalCount
          ) {
            throw new ConflictError(
              "COUNT_CONFLICT_EXACT_TIMESTAMP",
              `Product #${prod.id} already has a verified count of ${prod.lastVerifiedQuantity} at exact timestamp ${targetOccurredAt.toISOString()} (attempted ${physicalCount}).`
            );
          }

          const existingEntries = await tx
            .select({
              quantityDelta: stockLedgerEntries.quantityDelta,
              occurredAt: stockLedgerEntries.occurredAt,
            })
            .from(stockLedgerEntries)
            .where(
              and(
                eq(stockLedgerEntries.productId, prod.id),
                eq(stockLedgerEntries.businessId, parsedBizId)
              )
            );

          const preCutoffSum = existingEntries
            .filter((e) => new Date(e.occurredAt).getTime() <= targetOccurredAt.getTime())
            .reduce((sum, e) => sum + Number(e.quantityDelta || 0), 0);

          resolvedDelta = physicalCount - preCutoffSum;

          const moved = await recordReconciledMovementInTx(tx, {
            businessId: parsedBizId,
            userId: prod.userId,
            actorId: pending.actorId ?? actorId,
            product: prod,
            transactionType: "ADJUSTMENT",
            quantityDelta: resolvedDelta,
            occurredAt: targetOccurredAt,
            idempotencyKey: pending.idempotencyKey ? `${pending.idempotencyKey}:resolved` : null,
            notes:
              pending.notes ||
              `Resolved physical count: ${physicalCount} ${prod.stockUnit || prod.unit} at ${targetOccurredAt.toISOString()}`,
          });
          ledgerEntry = moved.ledgerEntry;
          reconciliationEntry = moved.reconciliationEntry;

          // Check if any OTHER pending ADJUSTMENT still remains for this product
          const otherPendingCounts = await tx
            .select({ id: pendingStockMovements.id })
            .from(pendingStockMovements)
            .where(
              and(
                eq(pendingStockMovements.businessId, parsedBizId),
                eq(pendingStockMovements.productId, prod.id),
                eq(pendingStockMovements.status, "PENDING_REVIEW"),
                eq(pendingStockMovements.transactionType, "ADJUSTMENT")
              )
            );
          const stillHasOtherPendingCount = otherPendingCounts.some((c) => c.id !== pending.id);

          const resultingBalance =
            existingEntries.reduce((sum, e) => sum + Number(e.quantityDelta || 0), 0) +
            resolvedDelta +
            (reconciliationEntry ? Number(reconciliationEntry.quantityDelta || 0) : 0);

          // Only advance verification baseline if this resolved count is strictly newer than current lastVerifiedAt
          const isNewerThanVerification =
            !productCutoff || targetOccurredAt.getTime() > productCutoff.getTime();
          if (isNewerThanVerification && physicalCount >= 0) {
            await tx
              .update(products)
              .set({
                verificationStatus:
                  stillHasOtherPendingCount || resultingBalance < 0 ? "NEEDS_RECOUNT" : "VERIFIED",
                lastVerifiedAt: targetOccurredAt,
                lastVerifiedQuantity: String(physicalCount),
                lastVerifiedByUserId: pending.actorId ?? actorId,
                updatedAt: now,
              })
              .where(eq(products.id, prod.id));
          } else if (
            !isNewerThanVerification &&
            !stillHasOtherPendingCount &&
            prod.verificationStatus === "NEEDS_RECOUNT" &&
            prod.lastVerifiedAt &&
            resultingBalance >= 0
          ) {
            await tx
              .update(products)
              .set({
                verificationStatus: "VERIFIED",
                updatedAt: now,
              })
              .where(eq(products.id, prod.id));
          }
        } else {
          resolvedDelta = Number(pending.quantityDelta);
          const moved = await recordReconciledMovementInTx(tx, {
            businessId: parsedBizId,
            userId: prod.userId,
            actorId: pending.actorId ?? actorId,
            product: prod,
            transactionType: pending.transactionType as "SALE" | "RESTOCK" | "CORRECTION",
            quantityDelta: resolvedDelta,
            occurredAt: targetOccurredAt,
            saleId: pending.saleId,
            unitCost: pending.unitCost ? Number(pending.unitCost) : null,
            supplierName: pending.supplierName,
            idempotencyKey: pending.idempotencyKey ? `${pending.idempotencyKey}:resolved` : null,
            notes: pending.notes,
          });
          ledgerEntry = moved.ledgerEntry;
          reconciliationEntry = moved.reconciliationEntry;
        }

        // L3: if linked to a sales row, lock sales row and update confirmed occurredAt & timestampStatus
        if (pending.saleId) {
          const { release: releaseSale } = await acquireSaleMutexes([pending.saleId]);
          try {
            await tx
              .select({ id: sales.id })
              .from(sales)
              .where(and(eq(sales.id, pending.saleId), eq(sales.businessId, parsedBizId)))
              .for("update")
              .limit(1);

            await tx
              .update(sales)
              .set({
                occurredAt: targetOccurredAt,
                timestampStatus: resolvedStatus,
                timestampBasis,
              })
              .where(and(eq(sales.id, pending.saleId), eq(sales.businessId, parsedBizId)));
          } finally {
            releaseSale();
          }
        }

        const [updatedPending] = await tx
          .update(pendingStockMovements)
          .set({
            status: resolvedStatus,
            resolvedOccurredAt: targetOccurredAt,
            timestampBasis,
            resolvedQuantityDelta: String(resolvedDelta),
            ledgerEntryId: ledgerEntry.id,
            reconciliationEntryId: reconciliationEntry?.id ?? null,
            resolvedByUserId: actorId,
            resolvedAt: now,
            resolutionNote: resolutionNote.trim(),
            updatedAt: now,
          })
          .where(eq(pendingStockMovements.id, pending.id))
          .returning();

        await tx.insert(auditLogs).values({
          userId: prod.userId,
          businessId: parsedBizId,
          actorId,
          actorName: resolvedActorName,
          actorRole: "OWNER",
          eventType: "PENDING_MOVEMENT_RESOLVED",
          description: `${resolvedActorName} resolved pending ${pending.transactionType} #${pending.id} as ${resolvedStatus} (${targetOccurredAt.toISOString()})`,
          entityType: "PENDING_STOCK_MOVEMENT",
          entityId: pending.id,
          oldValue: "PENDING_REVIEW",
          newValue: `${resolvedStatus} @ ${targetOccurredAt.toISOString()}`,
          reason: resolutionNote.trim(),
          source: "WEB",
          createdAt: now,
        });

        return {
          pendingMovement: updatedPending,
          ledgerEntry,
          reconciliationEntry,
        };
      } finally {
        releaseProduct();
      }
    });
  } finally {
    releasePending();
  }
}
