import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/db";
import {
  stockLedgerEntries,
  auditLogs,
  openingStockItems,
  businesses,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { createUser, createStaffMember } from "./authService";
import {
  addProduct,
  recordSale,
  recordDelivery,
  recordStockCount,
  getProductDetails,
  getBusinessPeriodReport,
} from "./stockService";
import {
  createOpeningStockSession,
  recordSessionCount,
  confirmOpeningSessionItemTimestamp,
  postOpeningStockSession,
  recordReconciledMovement,
  cancelOpeningStockSession,
  getOpeningStockSession,
  resolvePendingMovement,
} from "./openingStock";

describe("Task 3: Opening Stock Cut-Off Snapshot, Concurrency & Late-Sync Reconciliation", () => {
  let owner: any;
  let staff: any;
  let otherOwner: any;
  let ownerBusiness: any;
  let otherBusiness: any;

  // Fixed baseline relative to current time (within valid window >= business.createdAt)
  const HOUR_MS = 60 * 60 * 1000;
  let t0930: Date;
  let t0945: Date;
  let t1000: Date;
  let t1015: Date;
  let t1030: Date;
  let t1100: Date;

  beforeAll(async () => {
    const baseNow = Date.now();
    // Place scenario timestamps within the past 2.5 hours
    t0930 = new Date(baseNow - 2.5 * HOUR_MS);
    t0945 = new Date(baseNow - 2.25 * HOUR_MS);
    t1000 = new Date(baseNow - 2.0 * HOUR_MS);
    t1015 = new Date(baseNow - 1.75 * HOUR_MS);
    t1030 = new Date(baseNow - 1.5 * HOUR_MS);
    t1100 = new Date(baseNow - 1.0 * HOUR_MS);

    owner = await createUser({
      email: `opening_owner_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Alhaji Opening Owner",
      role: "OWNER",
      businessName: "Opening Test Depot Ltd",
    });

    const [biz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, owner.id))
      .limit(1);

    // Backdate business createdAt by 7 days so offline scenario timestamps (2.5h ago) are safely inside business lifetime
    const [updatedBiz] = await db
      .update(businesses)
      .set({ createdAt: new Date(baseNow - 7 * 24 * HOUR_MS) })
      .where(eq(businesses.id, biz.id))
      .returning();
    ownerBusiness = updatedBiz;

    staff = await createStaffMember({
      ownerUser: owner,
      email: `opening_staff_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Suleiman Yard Staff",
    });

    otherOwner = await createUser({
      email: `opening_other_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Chief Other Owner",
      role: "OWNER",
      businessName: "Other Shop Ltd",
    });

    const [otherBiz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, otherOwner.id))
      .limit(1);
    otherBusiness = otherBiz;
  });

  // =========================================================================
  // 1. Late-Arriving Pre-Cut-off Offline Sale (Spec Section 2.3 Example 1)
  // =========================================================================
  it("reconciles late-arriving pre-cut-off offline sale without double-subtracting", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Cement 50kg (Late Sale Test)",
      category: "Cement",
      unit: "bags",
      sellingPrice: 9000,
    });

    // 10:00 physical count = 45 bags
    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Morning Yard Count",
    });

    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 45,
      countedAt: t1000,
      unitCost: 8200,
      countedByUserId: owner.id,
    });

    // 10:30 post opening stock session
    const postRes = await postOpeningStockSession({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      idempotencyKey: `post-late-sale-${Date.now()}`,
    });
    expect(postRes.postedCount).toBe(1);

    let details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(45);
    expect(details?.product.verificationStatus).toBe("VERIFIED");
    expect(Number(details?.product.lastVerifiedQuantity)).toBe(45);

    // 11:00 late offline sale that occurred at 09:30 (5 bags) syncs via recordSale
    const lateSaleKey = `offline-sale-0930-${Date.now()}`;
    const saleRes = await recordSale({
      businessId: ownerBusiness.id,
      actorId: staff.id,
      actorName: staff.fullName,
      actorRole: "STAFF",
      productId: prod.id,
      quantity: 5,
      unitPrice: 9000,
      amountPaid: 45000,
      clientTimestamp: t0930,
      isOfflineSync: true,
      idempotencyKey: lateSaleKey,
    });

    expect(saleRes.sale.id).toBeGreaterThan(0);

    // Ledger must have SALE (-5) AND OPENING_BALANCE_RECONCILIATION (+5)
    const entries = await db
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.productId, prod.id));

    const saleEntry = entries.find((e) => e.entryType === "SALE");
    const reconEntry = entries.find((e) => e.entryType === "OPENING_BALANCE_RECONCILIATION");

    expect(saleEntry).toBeDefined();
    expect(Number(saleEntry!.quantityDelta)).toBe(-5);
    expect(reconEntry).toBeDefined();
    expect(Number(reconEntry!.quantityDelta)).toBe(5);
    expect(reconEntry!.reconciledEntryId).toBe(saleEntry!.id);
    expect(reconEntry!.unitCost).toBeNull();
    expect(reconEntry!.idempotencyKey).toBe(`${lateSaleKey}:recon`);

    // Final stock balance MUST stay at 45
    details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(45);
    expect(details?.product.verificationStatus).toBe("VERIFIED");

    // Replaying the exact same late offline sale must NOT duplicate sale, ledger, or reconciliation
    const replayRes = await recordSale({
      businessId: ownerBusiness.id,
      actorId: staff.id,
      actorName: staff.fullName,
      actorRole: "STAFF",
      productId: prod.id,
      quantity: 5,
      unitPrice: 9000,
      amountPaid: 45000,
      clientTimestamp: t0930,
      isOfflineSync: true,
      idempotencyKey: lateSaleKey,
    });
    expect(replayRes.isDuplicateReplay).toBe(true);
    expect(replayRes.sale.id).toBe(saleRes.sale.id);

    details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(45);
  });

  // =========================================================================
  // 2. Late-Arriving Pre-Cut-off Delivery (Spec Section 2.3 Example 2)
  // =========================================================================
  it("reconciles late-arriving pre-cut-off delivery while preserving supplier cost record", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "TMT Rebar 12mm (Late Delivery Test)",
      category: "Steel",
      unit: "lengths",
      sellingPrice: 7000,
    });

    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Steel Bay Count",
    });

    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 45,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    await postOpeningStockSession({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
    });

    // 11:15 late delivery that arrived at 09:45 (+20 lengths, already on shelf during 10:00 count)
    const lateDelivKey = `offline-deliv-0945-${Date.now()}`;
    const restockEntry = await recordDelivery({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      productId: prod.id,
      quantityReceived: 20,
      unitCost: 6200,
      supplierName: "Katsina Rolling Mill",
      clientTimestamp: t0945,
      isOfflineSync: true,
      idempotencyKey: lateDelivKey,
    });

    expect(restockEntry.isQuarantined).toBe(false);
    expect(Number(restockEntry.quantityDelta)).toBe(20);
    expect(restockEntry.unitCost).toBe("6200.00");

    const entries = await db
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.productId, prod.id));

    const reconEntry = entries.find((e) => e.entryType === "OPENING_BALANCE_RECONCILIATION");
    expect(reconEntry).toBeDefined();
    expect(Number(reconEntry!.quantityDelta)).toBe(-20);
    expect(reconEntry!.reconciledEntryId).toBe(restockEntry.id);
    expect(reconEntry!.unitCost).toBeNull();

    // Physical balance stays 45
    const details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(45);
    expect(details?.product.lastSupplierInfo?.unitCost).toBe(6200);
  });

  // =========================================================================
  // 3. Pre-Cut-off & Post-Cut-off Transactions Already Present at Posting Time
  // =========================================================================
  it("computes OPENING_BALANCE net of already-committed pre-cut-off entries while preserving post-cut-off deltas", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "PVC Pipe 4in (Boundary Math Test)",
      category: "Plumbing",
      unit: "lengths",
      sellingPrice: 6500,
    });

    // 09:30 pre-cut-off sale (-5) already in ledger
    await recordSale({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      productId: prod.id,
      quantity: 5,
      unitPrice: 6500,
      amountPaid: 32500,
      occurredAt: t0930,
    });

    // 10:15 post-cut-off sale (-3) already in ledger before session posts at 10:30
    await recordSale({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      productId: prod.id,
      quantity: 3,
      unitPrice: 6500,
      amountPaid: 19500,
      occurredAt: t1015,
    });

    // 10:00 physical count was 45
    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Boundary Math Session",
    });

    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 45,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    await postOpeningStockSession({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
    });

    // Pre-cut-off sum was -5 -> OPENING_BALANCE must be 45 - (-5) = +50
    // Post-cut-off sale (-3) occurred after t1000 so it applies on top: 45 - 3 = 42!
    const entries = await db
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.productId, prod.id));

    const openingEntry = entries.find((e) => e.entryType === "OPENING_BALANCE");
    expect(openingEntry).toBeDefined();
    expect(Number(openingEntry!.quantityDelta)).toBe(50);

    const details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(42);
    expect(Number(details?.product.lastVerifiedQuantity)).toBe(45);

    // Now a subsequent post-cut-off offline sale at t1100 (-2) arrives -> NO reconciliation
    await recordReconciledMovement({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      productId: prod.id,
      transactionType: "SALE",
      quantityDelta: -2,
      occurredAt: t1100,
      notes: "Post-count offline sale",
    });

    const detailsAfter = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(detailsAfter?.product.currentStock).toBe(40);
  });

  // =========================================================================
  // 4. Partial Session Safety & Explicit Zero Count
  // =========================================================================
  it("supports partial sessions: verifies counted items (including explicit 0) and leaves uncounted items UNVERIFIED", async () => {
    const countedNonZero = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Partial Counted 20L Paint",
      category: "Paints",
      unit: "buckets",
      sellingPrice: 40000,
    });

    const countedZero = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Partial Counted Zero Primer",
      category: "Paints",
      unit: "tins",
      sellingPrice: 12000,
      minimumStockThreshold: 5,
    });

    const uncountedProd = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Partial Uncounted Brush",
      category: "Tools",
      unit: "pcs",
      sellingPrice: 1500,
      minimumStockThreshold: 10,
    });

    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Partial Store Audit",
      productIds: [countedNonZero.id, countedZero.id, uncountedProd.id],
    });

    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: countedNonZero.id,
      countedQuantity: 18,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: countedZero.id,
      countedQuantity: 0,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    const result = await postOpeningStockSession({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
    });

    expect(result.postedCount).toBe(2);
    expect(result.skippedUncountedCount).toBe(1);
    expect(result.supersededCount).toBe(0);

    // Counted items transitioned to VERIFIED (including explicit 0!)
    const nonZeroDetails = await getProductDetails(ownerBusiness.id, countedNonZero.id, "OWNER");
    expect(nonZeroDetails?.product.verificationStatus).toBe("VERIFIED");
    expect(nonZeroDetails?.product.currentStock).toBe(18);

    const zeroDetails = await getProductDetails(ownerBusiness.id, countedZero.id, "OWNER");
    expect(zeroDetails?.product.verificationStatus).toBe("VERIFIED");
    expect(Number(zeroDetails?.product.lastVerifiedQuantity)).toBe(0);
    expect(zeroDetails?.product.currentStock).toBe(0);
    expect(zeroDetails?.product.intelligence.status).toBe("RUNNING_LOW");
    expect(zeroDetails?.product.intelligence.statusLabel).toBe("BUY NOW");

    // Uncounted item MUST remain UNVERIFIED and NOT have any OPENING_BALANCE ledger entry
    const uncountedDetails = await getProductDetails(ownerBusiness.id, uncountedProd.id, "OWNER");
    expect(uncountedDetails?.product.verificationStatus).toBe("UNVERIFIED");
    expect(uncountedDetails?.product.lastVerifiedAt).toBeNull();
    expect(uncountedDetails?.product.lastVerifiedQuantity).toBeNull();
    expect(uncountedDetails?.ledgerHistory.length).toBe(0);
    expect(uncountedDetails?.product.intelligence.statusLabel).toBe("UNVERIFIED");
    expect(uncountedDetails?.product.intelligence.reorderUrgent).toBe(false);
  });

  // =========================================================================
  // 5. Discrete Quantity Validation & Commercial Sensitivity in Session Count
  // =========================================================================
  it("enforces discrete integer validation on session counts and redacts staff unitCost", async () => {
    const discreteProd = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Discrete Zinc Sheet",
      category: "Roofing",
      unit: "sheets",
    });

    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: staff.id,
      actorRole: "STAFF",
      name: "Staff Count Session",
      productIds: [discreteProd.id],
    });

    // Reject fractional count when allowFractionalQuantity = false
    await expect(
      recordSessionCount({
        sessionId: session.id,
        businessId: ownerBusiness.id,
        productId: discreteProd.id,
        countedQuantity: 12.5,
        countedAt: t1000,
        countedByUserId: staff.id,
        actorRole: "STAFF",
      })
    ).rejects.toThrow(/whole/i);

    // Reject negative count
    await expect(
      recordSessionCount({
        sessionId: session.id,
        businessId: ownerBusiness.id,
        productId: discreteProd.id,
        countedQuantity: -3,
        countedAt: t1000,
        countedByUserId: staff.id,
        actorRole: "STAFF",
      })
    ).rejects.toThrow();

    // Staff attempts to pass unitCost — must be redacted to null
    const savedItem = await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: discreteProd.id,
      countedQuantity: 12,
      countedAt: t1000,
      unitCost: 5000,
      countedByUserId: staff.id,
      actorRole: "STAFF",
    });
    expect(savedItem.unitCost).toBeNull();
  });

  // =========================================================================
  // 6. Stale / Superseded Session Handling & Session Cancellation
  // =========================================================================
  it("marks older session items as STALE_SUPERSEDED without overwriting newer verification", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Tile Pack (Supersede Test)",
      category: "Tiles",
      unit: "cartons",
    });

    const olderSession = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Older Session",
      productIds: [prod.id],
    });
    await recordSessionCount({
      sessionId: olderSession.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 30,
      countedAt: t0945,
      countedByUserId: owner.id,
    });

    const newerSession = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Newer Session",
      productIds: [prod.id],
    });
    await recordSessionCount({
      sessionId: newerSession.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 25,
      countedAt: t1030,
      countedByUserId: owner.id,
    });

    // Newer session posts first
    const newerPost = await postOpeningStockSession({
      sessionId: newerSession.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
    });
    expect(newerPost.postedCount).toBe(1);

    // Now older session posts -> item must be STALE_SUPERSEDED, keeping 25 & t1030
    const olderPost = await postOpeningStockSession({
      sessionId: olderSession.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
    });
    expect(olderPost.postedCount).toBe(0);
    expect(olderPost.supersededCount).toBe(1);

    const [olderItem] = await db
      .select()
      .from(openingStockItems)
      .where(and(eq(openingStockItems.sessionId, olderSession.id), eq(openingStockItems.productId, prod.id)));
    expect(olderItem.status).toBe("STALE_SUPERSEDED");

    const details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(25);
    expect(Number(details?.product.lastVerifiedQuantity)).toBe(25);

    // Draft cancellation works, while posted session cannot be cancelled or recounted
    const draftToCancel = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Draft To Cancel",
      productIds: [prod.id],
    });
    const cancelled = await cancelOpeningStockSession({
      sessionId: draftToCancel.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
      reason: "Entered wrong warehouse",
    });
    expect(cancelled.status).toBe("CANCELLED");

    await expect(
      recordSessionCount({
        sessionId: cancelled.id,
        businessId: ownerBusiness.id,
        productId: prod.id,
        countedQuantity: 10,
        countedAt: t1100,
        countedByUserId: owner.id,
      })
    ).rejects.toThrow();
  });

  // =========================================================================
  // 7. Concurrency Serialization & Deadlock-Free Multi-Product Locking
  // =========================================================================
  it("serializes concurrent stocktake posting and counter sales deterministically without lost updates", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Concurrency Lock Wire Coil",
      category: "Electrical",
      unit: "coils",
      sellingPrice: 15000,
    });

    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Concurrent Session",
      productIds: [prod.id],
    });
    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 50,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    // Fire postOpeningStockSession and a post-count sale (t1015) and a pre-count sale (t0930) concurrently
    await Promise.all([
      postOpeningStockSession({
        sessionId: session.id,
        businessId: ownerBusiness.id,
        actorId: owner.id,
        idempotencyKey: `concurrent-post-${Date.now()}`,
      }),
      recordSale({
        businessId: ownerBusiness.id,
        actorId: owner.id,
        actorName: owner.fullName,
        actorRole: "OWNER",
        productId: prod.id,
        quantity: 6,
        unitPrice: 15000,
        amountPaid: 90000,
        occurredAt: t1015, // post-count -> MUST reduce final stock by 6
      }),
      recordSale({
        businessId: ownerBusiness.id,
        actorId: owner.id,
        actorName: owner.fullName,
        actorRole: "OWNER",
        productId: prod.id,
        quantity: 4,
        unitPrice: 15000,
        amountPaid: 60000,
        occurredAt: t0930, // pre-count -> already reflected in 50
      }),
    ]);

    // Regardless of execution order, final physical balance MUST be 50 - 6 = 44!
    const details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(44);
    expect(details?.product.verificationStatus).toBe("VERIFIED");

    // Multi-product inverse-order lock acquisition must not deadlock
    const prodB = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Concurrency Lock Switch",
      category: "Electrical",
      unit: "pcs",
      sellingPrice: 1200,
      openingStock: 20,
    });

    await Promise.all([
      recordSale({
        businessId: ownerBusiness.id,
        actorId: owner.id,
        items: [
          { productId: prod.id, quantity: 1, unitPrice: 15000 },
          { productId: prodB.id, quantity: 2, unitPrice: 1200 },
        ],
        amountPaid: 17400,
      }),
      recordSale({
        businessId: ownerBusiness.id,
        actorId: owner.id,
        items: [
          { productId: prodB.id, quantity: 3, unitPrice: 1200 },
          { productId: prod.id, quantity: 1, unitPrice: 15000 },
        ],
        amountPaid: 18600,
      }),
    ]);

    const afterMultiA = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    const afterMultiB = await getProductDetails(ownerBusiness.id, prodB.id, "OWNER");
    expect(afterMultiA?.product.currentStock).toBe(42);
    expect(afterMultiB?.product.currentStock).toBe(15);
  });

  // =========================================================================
  // 8. Database-Enforced Idempotency & Reconciliation Uniqueness
  // =========================================================================
  it("enforces session posting idempotency and single reconciliation per ledger entry at DB level", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Idempotency Marble Tile",
      category: "Tiles",
      unit: "boxes",
    });

    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Idempotent Session",
      productIds: [prod.id],
    });
    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 30,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    const postKey = `post-idemp-${Date.now()}`;
    const firstPost = await postOpeningStockSession({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
      idempotencyKey: postKey,
    });
    expect(firstPost.postedCount).toBe(1);
    expect(firstPost.isDuplicateReplay).toBe(false);

    const replayPost = await postOpeningStockSession({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
      idempotencyKey: postKey,
    });
    expect(replayPost.isDuplicateReplay).toBe(true);

    // Late movement + duplicate DB reconciliation attempt
    const movKey = `mov-idemp-${Date.now()}`;
    const mov1 = await recordReconciledMovement({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      productId: prod.id,
      transactionType: "SALE",
      quantityDelta: -3,
      occurredAt: t0930,
      idempotencyKey: movKey,
    });
    expect(mov1.reconciliationEntry).toBeDefined();

    const mov2 = await recordReconciledMovement({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      productId: prod.id,
      transactionType: "SALE",
      quantityDelta: -3,
      occurredAt: t0930,
      idempotencyKey: movKey,
    });
    expect(mov2.isDuplicateReplay).toBe(true);
    expect(mov2.ledgerEntry.id).toBe(mov1.ledgerEntry.id);
    expect(mov2.reconciliationEntry?.id).toBe(mov1.reconciliationEntry?.id);

    // Direct attempt to insert a second reconciliation row for same reconciledEntryId must fail DB unique constraint
    await expect(
      db.insert(stockLedgerEntries).values({
        businessId: ownerBusiness.id,
        userId: owner.id,
        productId: prod.id,
        entryType: "OPENING_BALANCE_RECONCILIATION",
        quantityDelta: "3",
        reconciledEntryId: mov1.ledgerEntry.id,
        occurredAt: t0930,
      })
    ).rejects.toThrow();

    const details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(30);
  });

  // =========================================================================
  // 9. Timestamp Skew Quarantine Policy & Cross-Tenant Isolation
  // =========================================================================
  it("quarantines future/ancient offline device timestamps (never clamping occurredAt) and enforces cross-tenant isolation", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Clock Skew Adhesive",
      category: "Adhesives",
      unit: "bags",
      sellingPrice: 3500,
      openingStock: 40,
    });

    // Future skew (+2 hours) -> quarantined into pending_stock_movements (never clamped into confirmed ledger!)
    const futureDate = new Date(Date.now() + 2 * HOUR_MS);
    const futureSale = await recordSale({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      productId: prod.id,
      quantity: 2,
      unitPrice: 3500,
      amountPaid: 7000,
      clientTimestamp: futureDate,
      isOfflineSync: true,
    });
    expect(futureSale.isQuarantined).toBe(true);
    expect(futureSale.ledgerEntry).toBeNull();
    expect(futureSale.sale.timestampStatus).toBe("PENDING_REVIEW");
    expect(futureSale.pendingMovements.length).toBe(1);
    expect(futureSale.pendingMovements[0].status).toBe("PENDING_REVIEW");
    expect(futureSale.pendingMovements[0].skewFlag).toBe("DEVICE_CLOCK_FUTURE_SKEW");
    expect(new Date(futureSale.pendingMovements[0].deviceTimestamp!).getTime()).toBe(futureDate.getTime());

    const logsAfterFuture = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.businessId, ownerBusiness.id),
          eq(auditLogs.eventType, "DEVICE_CLOCK_FUTURE_SKEW")
        )
      );
    expect(logsAfterFuture.length).toBeGreaterThanOrEqual(1);

    // Ancient skew (year 2020) -> quarantined with DEVICE_CLOCK_ANCIENT_SKEW
    const ancientDate = new Date("2020-01-01T00:00:00Z");
    const ancientSale = await recordSale({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      productId: prod.id,
      quantity: 1,
      unitPrice: 3500,
      amountPaid: 3500,
      clientTimestamp: ancientDate,
      isOfflineSync: true,
    });
    expect(ancientSale.isQuarantined).toBe(true);
    expect(ancientSale.ledgerEntry).toBeNull();
    expect(ancientSale.sale.timestampStatus).toBe("PENDING_REVIEW");
    expect(ancientSale.pendingMovements.length).toBe(1);
    expect(ancientSale.pendingMovements[0].status).toBe("PENDING_REVIEW");
    expect(ancientSale.pendingMovements[0].skewFlag).toBe("DEVICE_CLOCK_ANCIENT_SKEW");

    const logsAfterAncient = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.businessId, ownerBusiness.id),
          eq(auditLogs.eventType, "DEVICE_CLOCK_ANCIENT_SKEW")
        )
      );
    expect(logsAfterAncient.length).toBeGreaterThanOrEqual(1);

    // Confirmed stock remains untouched (40) until owner resolves pending movements; provisional range reflects uncertainty
    let details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(40);
    expect(details?.product.pendingMovementsCount).toBe(2);
    expect(details?.product.provisionalMinStock).toBe(37);
    expect(details?.product.provisionalMaxStock).toBe(40);

    // Resolving futureSale as POST_CUTOFF applies -2 to confirmed stock -> 38
    await resolvePendingMovement({
      pendingMovementId: futureSale.pendingMovements[0].id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
      resolutionMode: "POST_CUTOFF",
      resolvedOccurredAt: t1100,
      resolutionNote: "Confirmed with attendant",
    });
    details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(38);
    expect(details?.product.pendingMovementsCount).toBe(1);

    // Cross-tenant isolation: otherOwner cannot read, count, post, or cancel owner's session
    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Isolated Session",
      productIds: [prod.id],
    });
    expect(await getOpeningStockSession(session.id, otherBusiness.id)).toBeNull();
    await expect(
      postOpeningStockSession({
        sessionId: session.id,
        businessId: otherBusiness.id,
        actorId: otherOwner.id,
      })
    ).rejects.toThrow();
  });

  // =========================================================================
  // 10. Negative Stock on VERIFIED Product -> NEEDS_RECOUNT & Financial Isolation
  // =========================================================================
  it("transitions VERIFIED product to NEEDS_RECOUNT on negative balance and isolates reconciliation from financial reports", async () => {
    const bizOwner = await createUser({
      email: `fin_iso_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Financial Isolation Owner",
      role: "OWNER",
      businessName: "Clean Ledger Materials Ltd",
    });

    const [bizRow] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, bizOwner.id))
      .limit(1);
    await db
      .update(businesses)
      .set({ createdAt: new Date(Date.now() - 7 * 24 * HOUR_MS) })
      .where(eq(businesses.id, bizRow.id));

    const prod = await addProduct({
      businessId: bizRow.id,
      actorId: bizOwner.id,
      actorName: bizOwner.fullName,
      actorRole: "OWNER",
      name: "Gloss Paint 4L",
      category: "Paints",
      unit: "tins",
      sellingPrice: 10000,
    });

    const session = await createOpeningStockSession({
      businessId: bizRow.id,
      actorId: bizOwner.id,
      name: "Clean Count",
      productIds: [prod.id],
    });
    await recordSessionCount({
      sessionId: session.id,
      businessId: bizRow.id,
      productId: prod.id,
      countedQuantity: 10,
      countedAt: t1000,
      countedByUserId: bizOwner.id,
    });
    await postOpeningStockSession({
      sessionId: session.id,
      businessId: bizRow.id,
      actorId: bizOwner.id,
    });

    // Late pre-cutoff offline sale (2 tins @ 10,000 = 20,000) & late delivery (5 tins @ 7,000 = 35,000)
    await recordSale({
      businessId: bizRow.id,
      actorId: bizOwner.id,
      productId: prod.id,
      quantity: 2,
      unitPrice: 10000,
      amountPaid: 20000,
      clientTimestamp: t0930,
      isOfflineSync: true,
    });
    await recordDelivery({
      businessId: bizRow.id,
      actorId: bizOwner.id,
      productId: prod.id,
      quantityReceived: 5,
      unitCost: 7000,
      supplierName: "Coatings Depot",
      clientTimestamp: t0945,
      isOfflineSync: true,
    });

    const report = await getBusinessPeriodReport(bizRow.id, 7, "OWNER");
    expect(report.metrics.totalSalesValue).toBe(20000);
    expect(report.metrics.restockExpenditure).toBe(35000);

    // Physical stock remains 10 (neither late pre-cutoff tx altered shelf truth)
    let details = await getProductDetails(bizRow.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(10);
    expect(details?.product.verificationStatus).toBe("VERIFIED");

    // Post-count sale of 12 tins pushes balance to -2 -> transitions VERIFIED to NEEDS_RECOUNT
    await recordSale({
      businessId: bizRow.id,
      actorId: bizOwner.id,
      productId: prod.id,
      quantity: 12,
      unitPrice: 10000,
      amountPaid: 120000,
    });

    details = await getProductDetails(bizRow.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(-2);
    expect(details?.product.verificationStatus).toBe("NEEDS_RECOUNT");
    expect(details?.product.intelligence.status).toBe("RUNNING_LOW");
    expect(details?.product.intelligence.statusLabel).toBe("BUY NOW");
    expect(details?.product.intelligence.displayNotice).toBe("Recount needed");

    // Quick stockCount updates stock back to physical truth and re-verifies
    const countRes = await recordStockCount({
      businessId: bizRow.id,
      actorId: bizOwner.id,
      productId: prod.id,
      physicalCount: 4,
      notes: "Recounted shelf after negative alert",
    });
    expect(countRes.physicalCount).toBe(4);
    details = await getProductDetails(bizRow.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(4);
    expect(details?.product.verificationStatus).toBe("VERIFIED");
  });

  // =========================================================================
  // 11. Section F Hardening: Session Concurrency, Empty Sessions & Count Skew
  // =========================================================================
  it("serializes recordSessionCount vs postOpeningStockSession without preItems TOCTOU or post-post mutation", async () => {
    const p1 = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "TOCTOU Steel Plate 1",
      category: "Steel",
      unit: "sheets",
    });
    const p2 = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "TOCTOU Steel Plate 2",
      category: "Steel",
      unit: "sheets",
    });

    // Case A: recordSessionCount enqueues before postOpeningStockSession -> both items posted atomically
    const sessionA = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "TOCTOU Race A",
      productIds: [p1.id, p2.id],
    });
    await recordSessionCount({
      sessionId: sessionA.id,
      businessId: ownerBusiness.id,
      productId: p1.id,
      countedQuantity: 10,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    const [countResA, postResA] = await Promise.allSettled([
      recordSessionCount({
        sessionId: sessionA.id,
        businessId: ownerBusiness.id,
        productId: p2.id,
        countedQuantity: 20,
        countedAt: t1000,
        countedByUserId: owner.id,
      }),
      postOpeningStockSession({
        sessionId: sessionA.id,
        businessId: ownerBusiness.id,
        actorId: owner.id,
        idempotencyKey: `toctou-a-${Date.now()}`,
      }),
    ]);
    expect(countResA.status).toBe("fulfilled");
    expect(postResA.status).toBe("fulfilled");
    if (postResA.status === "fulfilled") {
      expect(postResA.value.postedCount).toBe(2);
      expect(postResA.value.skippedUncountedCount).toBe(0);
    }
    expect((await getProductDetails(ownerBusiness.id, p2.id, "OWNER"))?.product.verificationStatus).toBe("VERIFIED");

    // Case B: postOpeningStockSession acquires lock first -> recordSessionCount is rejected on POSTED session
    const p3 = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "TOCTOU Steel Plate 3",
      category: "Steel",
      unit: "sheets",
    });
    const p4 = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "TOCTOU Steel Plate 4",
      category: "Steel",
      unit: "sheets",
    });
    const sessionB = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "TOCTOU Race B",
      productIds: [p3.id, p4.id],
    });
    await recordSessionCount({
      sessionId: sessionB.id,
      businessId: ownerBusiness.id,
      productId: p3.id,
      countedQuantity: 15,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    const [postResB, countResB] = await Promise.allSettled([
      postOpeningStockSession({
        sessionId: sessionB.id,
        businessId: ownerBusiness.id,
        actorId: owner.id,
        idempotencyKey: `toctou-b-${Date.now()}`,
      }),
      recordSessionCount({
        sessionId: sessionB.id,
        businessId: ownerBusiness.id,
        productId: p4.id,
        countedQuantity: 25,
        countedAt: t1000,
        countedByUserId: owner.id,
      }),
    ]);
    expect(postResB.status).toBe("fulfilled");
    expect(countResB.status).toBe("rejected");
    if (countResB.status === "rejected") {
      expect(String(countResB.reason)).toMatch(/already POSTED/i);
    }
    const afterSessionB = await getOpeningStockSession(sessionB.id, ownerBusiness.id);
    const p4Item = afterSessionB?.items.find((i) => i.productId === p4.id);
    expect(p4Item?.status).toBe("NOT_COUNTED");
    expect((await getProductDetails(ownerBusiness.id, p4.id, "OWNER"))?.product.verificationStatus).toBe("UNVERIFIED");
  });

  it("serializes recordSessionCount vs cancelOpeningStockSession and handles concurrent first-time counts", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Cancel Race Valve",
      category: "Plumbing",
      unit: "pcs",
    });

    const cancelSession = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Cancel Race Session",
      productIds: [prod.id],
    });

    const [cancelRes, lateCountRes] = await Promise.allSettled([
      cancelOpeningStockSession({
        sessionId: cancelSession.id,
        businessId: ownerBusiness.id,
        actorId: owner.id,
        reason: "Concurrent cancellation",
      }),
      recordSessionCount({
        sessionId: cancelSession.id,
        businessId: ownerBusiness.id,
        productId: prod.id,
        countedQuantity: 9,
        countedAt: t1000,
        countedByUserId: owner.id,
      }),
    ]);

    expect(cancelRes.status).toBe("fulfilled");
    expect(lateCountRes.status).toBe("rejected");
    if (lateCountRes.status === "rejected") {
      expect(String(lateCountRes.reason)).toMatch(/already CANCELLED/i);
    }

    // Concurrent first-time counts for a product NOT pre-seeded in sessionItems
    const raceSession = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "First-Time Upsert Race",
      productIds: [prod.id],
    });
    const newlyAddedProd = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Dynamically Added Coupling",
      category: "Plumbing",
      unit: "pcs",
    });

    const [firstUpsert, secondUpsert] = await Promise.all([
      recordSessionCount({
        sessionId: raceSession.id,
        businessId: ownerBusiness.id,
        productId: newlyAddedProd.id,
        countedQuantity: 11,
        countedAt: t1000,
        countedByUserId: owner.id,
      }),
      recordSessionCount({
        sessionId: raceSession.id,
        businessId: ownerBusiness.id,
        productId: newlyAddedProd.id,
        countedQuantity: 19,
        countedAt: t1000,
        countedByUserId: owner.id,
      }),
    ]);

    expect(firstUpsert.id).toBe(secondUpsert.id);
    const rows = await db
      .select()
      .from(openingStockItems)
      .where(and(eq(openingStockItems.sessionId, raceSession.id), eq(openingStockItems.productId, newlyAddedProd.id)));
    expect(rows.length).toBe(1);
    expect(Number(rows[0].countedQuantity)).toBe(19);
  });

  it("applies locking, single-post status transitions, idempotency, and audit logging on empty opening-stock sessions", async () => {
    const emptyBizOwner = await createUser({
      email: `empty_sess_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Empty Session Owner",
      role: "OWNER",
      businessName: "Empty Stocktake Yard",
    });

    const [emptyBiz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, emptyBizOwner.id))
      .limit(1);

    const emptySession = await createOpeningStockSession({
      businessId: emptyBiz.id,
      actorId: emptyBizOwner.id,
      name: "Empty Store Session",
    });

    const key = `empty-post-${Date.now()}`;
    const [res1, res2] = await Promise.allSettled([
      postOpeningStockSession({
        sessionId: emptySession.id,
        businessId: emptyBiz.id,
        actorId: emptyBizOwner.id,
        actorName: emptyBizOwner.fullName,
        idempotencyKey: key,
      }),
      postOpeningStockSession({
        sessionId: emptySession.id,
        businessId: emptyBiz.id,
        actorId: emptyBizOwner.id,
        actorName: emptyBizOwner.fullName,
        // Without matching idempotency key -> second concurrent call must reject as already posted
      }),
    ]);

    expect(res1.status).toBe("fulfilled");
    if (res1.status === "fulfilled") {
      expect(res1.value.session.status).toBe("POSTED");
      expect(res1.value.postedCount).toBe(0);
    }
    expect(res2.status).toBe("rejected");
    if (res2.status === "rejected") {
      expect(String(res2.reason)).toMatch(/already been posted/i);
    }

    // Replaying with the matching idempotencyKey returns replay result
    const replay = await postOpeningStockSession({
      sessionId: emptySession.id,
      businessId: emptyBiz.id,
      actorId: emptyBizOwner.id,
      idempotencyKey: key,
    });
    expect(replay.isDuplicateReplay).toBe(true);
    expect(replay.postedCount).toBe(0);

    const postedAudits = await db
      .select()
      .from(auditLogs)
      .where(and(eq(auditLogs.businessId, emptyBiz.id), eq(auditLogs.eventType, "OPENING_STOCK_POSTED")));
    expect(postedAudits.length).toBe(1);
    expect(postedAudits[0].entityId).toBe(emptySession.id);
  });

  it("quarantines skewed future and ancient countedAt timestamps as NEEDS_RECOUNT and blocks posting until OWNER confirms", async () => {
    const prod = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      actorName: owner.fullName,
      actorRole: "OWNER",
      name: "Count Skew Test Product",
      category: "General",
      unit: "bags",
    });

    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Count Skew Session",
      productIds: [prod.id],
    });

    const futureCountAt = new Date(Date.now() + 3 * HOUR_MS);
    const futureItem = await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 12,
      countedAt: futureCountAt,
      countedByUserId: owner.id,
      actorName: owner.fullName,
    });
    expect(futureItem.status).toBe("NEEDS_RECOUNT");
    expect(futureItem.timestampStatus).toBe("PENDING_REVIEW");
    expect(futureItem.countedAt).toBeNull();
    expect(futureItem.skewFlag).toBe("DEVICE_CLOCK_FUTURE_SKEW");
    expect(new Date(futureItem.deviceCountedAt!).getTime()).toBe(futureCountAt.getTime());

    const futureLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.businessId, ownerBusiness.id),
          eq(auditLogs.entityType, "OPENING_STOCK_ITEM"),
          eq(auditLogs.entityId, futureItem.id),
          eq(auditLogs.eventType, "DEVICE_CLOCK_FUTURE_SKEW")
        )
      );
    expect(futureLogs.length).toBe(1);

    const ancientCountAt = new Date("2020-05-01T00:00:00Z");
    const ancientItem = await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      countedQuantity: 14,
      countedAt: ancientCountAt,
      countedByUserId: owner.id,
      actorName: owner.fullName,
    });
    expect(ancientItem.status).toBe("NEEDS_RECOUNT");
    expect(ancientItem.timestampStatus).toBe("PENDING_REVIEW");
    expect(ancientItem.countedAt).toBeNull();
    expect(ancientItem.skewFlag).toBe("DEVICE_CLOCK_ANCIENT_SKEW");

    const ancientLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.businessId, ownerBusiness.id),
          eq(auditLogs.entityType, "OPENING_STOCK_ITEM"),
          eq(auditLogs.entityId, ancientItem.id),
          eq(auditLogs.eventType, "DEVICE_CLOCK_ANCIENT_SKEW")
        )
      );
    expect(ancientLogs.length).toBe(1);

    // Posting MUST reject while item has NEEDS_RECOUNT / PENDING_REVIEW
    await expect(
      postOpeningStockSession({
        sessionId: session.id,
        businessId: ownerBusiness.id,
        actorId: owner.id,
      })
    ).rejects.toThrow(/NEEDS_RECOUNT|unconfirmed skewed/i);

    // STAFF cannot confirm skewed count timestamp; OWNER confirms with valid timestamp -> posting succeeds
    await expect(
      confirmOpeningSessionItemTimestamp({
        sessionId: session.id,
        businessId: ownerBusiness.id,
        productId: prod.id,
        actorId: staff.id,
        confirmedCountedAt: t1000,
      })
    ).rejects.toThrow();

    const confirmedItem = await confirmOpeningSessionItemTimestamp({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: prod.id,
      actorId: owner.id,
      confirmedCountedAt: t1000,
      notes: "Verified count time against security log",
    });
    expect(confirmedItem.status).toBe("COUNTED");
    expect(confirmedItem.timestampStatus).toBe("CONFIRMED");
    expect(confirmedItem.timestampBasis).toBe("OWNER_CONFIRMED_EXACT");
    expect(new Date(confirmedItem.countedAt!).getTime()).toBe(t1000.getTime());

    const postResult = await postOpeningStockSession({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      actorId: owner.id,
    });
    expect(postResult.postedCount).toBe(1);
    const details = await getProductDetails(ownerBusiness.id, prod.id, "OWNER");
    expect(details?.product.currentStock).toBe(14);
    expect(details?.product.verificationStatus).toBe("VERIFIED");
  });

  it("keeps opening_stock_sessions in DRAFT if any counted item fails product locking during posting", async () => {
    const ownedProd = await addProduct({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Partial Post Guard Product",
      category: "General",
      unit: "bags",
    });
    const foreignProd = await addProduct({
      businessId: otherBusiness.id,
      actorId: otherOwner.id,
      name: "Foreign Tenant Product",
      category: "General",
      unit: "bags",
    });

    const session = await createOpeningStockSession({
      businessId: ownerBusiness.id,
      actorId: owner.id,
      name: "Lock Failure Atomicity Session",
      productIds: [ownedProd.id],
    });
    await recordSessionCount({
      sessionId: session.id,
      businessId: ownerBusiness.id,
      productId: ownedProd.id,
      countedQuantity: 10,
      countedAt: t1000,
      countedByUserId: owner.id,
    });

    // Simulate a corrupted/unowned COUNTED item row in session
    await db.insert(openingStockItems).values({
      sessionId: session.id,
      productId: foreignProd.id,
      countedQuantity: "5",
      countedAt: t1000,
      status: "COUNTED",
      timestampStatus: "CONFIRMED",
      countedByUserId: owner.id,
    });

    await expect(
      postOpeningStockSession({
        sessionId: session.id,
        businessId: ownerBusiness.id,
        actorId: owner.id,
        actorName: owner.fullName,
      })
    ).rejects.toThrow(/not found or not owned/i);

    const after = await getOpeningStockSession(session.id, ownerBusiness.id);
    expect(after?.session.status).toBe("DRAFT");
    expect(after?.session.postedAt).toBeNull();
    expect((await getProductDetails(ownerBusiness.id, ownedProd.id, "OWNER"))?.product.verificationStatus).toBe("UNVERIFIED");
  });
});
