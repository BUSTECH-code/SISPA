import { describe, it, expect, beforeAll, vi } from "vitest";
import { db } from "@/db";
import {
  businesses,
  businessMemberships,
  customers,
  products,
  sales,
  stockLedgerEntries,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import {
  ActiveBusinessRequiredError,
  createSession,
  createUser,
  requireActiveBusinessContext,
  SESSION_COOKIE_NAME,
} from "./authService";
import {
  addProduct,
  deleteProduct,
  getAllCustomers,
  getBusinessPeriodReport,
  getDailyCashChecks,
  getProductDetails,
  getSuppliersDirectory,
  recordCustomerPayment,
  recordDailyCashCheck,
  recordDelivery,
  recordSale,
  recordSaleCorrection,
  recordStockCount,
} from "./stockService";
import {
  createOpeningStockSession,
  listPendingStockMovements,
  postOpeningStockSession,
  recordSessionCount,
  resolvePendingMovement,
  updatePendingDeliveryCost,
} from "./openingStock";
import { calculatePeriodSummary, computeLedgerCogsForPeriod } from "@/domain/debt";
import { calculateVelocity } from "@/domain/intelligence";
import { GET as productsGet } from "@/app/api/products/route";
import { GET as pendingMovementsGet } from "@/app/api/pending-movements/route";
import { POST as resolvePendingPost } from "@/app/api/pending-movements/[id]/resolve/route";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { POST as activeBusinessPost } from "@/app/api/auth/active-business/route";

const cookieStore = vi.hoisted(() => ({ sessionId: null as string | null }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === SESSION_COOKIE_NAME && cookieStore.sessionId
        ? { name, value: cookieStore.sessionId }
        : undefined,
  }),
  headers: async () => new Headers(),
}));

describe("Task 3 Hardening Verification Suite", () => {
  const HOUR_MS = 60 * 60 * 1000;
  let owner: any;
  let ownerEmail: string;
  let bizA: any;
  let bizB: any;
  let staffA: any;

  let t0900: Date;
  let t0930: Date;
  let t1000: Date;
  let t1030: Date;
  let t1100: Date;

  beforeAll(async () => {
    const baseNow = Date.now();
    t0900 = new Date(baseNow - 4 * HOUR_MS);
    t0930 = new Date(baseNow - 3.5 * HOUR_MS);
    t1000 = new Date(baseNow - 3 * HOUR_MS);
    t1030 = new Date(baseNow - 2.5 * HOUR_MS);
    t1100 = new Date(baseNow - 2 * HOUR_MS);

    ownerEmail = `t3_owner_${Date.now()}@shop.com`;
    owner = await createUser({
      email: ownerEmail,
      password: "password123",
      fullName: "Task 3 Multi-Shop Owner",
      role: "OWNER",
      businessName: "Shop Alpha Materials",
    });

    const [firstBiz] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, owner.id))
      .limit(1);

    const [updatedA] = await db
      .update(businesses)
      .set({ createdAt: new Date(baseNow - 14 * 24 * HOUR_MS) })
      .where(eq(businesses.id, firstBiz.id))
      .returning();
    bizA = updatedA;

    // Create second business owned by the same user to test multi-business active context switching & isolation
    const [secondBiz] = await db
      .insert(businesses)
      .values({
        name: "Shop Beta Depot",
        currency: "NGN",
        state: "ACTIVE",
        ownerUserId: owner.id,
        subscriptionPlan: "STANDARD",
        subscriptionStatus: "ACTIVE",
        createdAt: new Date(baseNow - 14 * 24 * HOUR_MS),
      })
      .returning();
    bizB = secondBiz;

    await db.insert(businessMemberships).values({
      businessId: bizB.id,
      userId: owner.id,
      role: "OWNER",
      status: "ACTIVE",
      activatedAt: new Date(),
    });

    staffA = await createUser({
      email: `t3_staff_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Shop Alpha Counter Staff",
      role: "STAFF",
      businessName: "Shop Alpha Materials",
      businessOwnerId: owner.id,
    });
    // Ensure staffA membership is ACTIVE on bizA
    const staffMemberships = await db
      .select()
      .from(businessMemberships)
      .where(eq(businessMemberships.userId, staffA.id));
    if (staffMemberships.length === 0) {
      await db.insert(businessMemberships).values({
        businessId: bizA.id,
        userId: staffA.id,
        role: "STAFF",
        status: "ACTIVE",
        activatedAt: new Date(),
      });
    }
  });

  // =========================================================================
  // 1. Explicit activeBusinessId Context Enforcement & Multi-Business Isolation
  // =========================================================================
  it("enforces explicit activeBusinessId everywhere, even for single-business users, and isolates multi-business workspaces", async () => {
    // Single-business owner
    const singleOwner = await createUser({
      email: `t3_single_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Single Shop Owner",
      role: "OWNER",
      businessName: "Single Yard Ltd",
    });

    await expect(
      requireActiveBusinessContext({ userId: singleOwner.id, activeBusinessId: null })
    ).rejects.toBeInstanceOf(ActiveBusinessRequiredError);

    // Login without activeBusinessId does NOT silently bind businesses[0]
    const loginRes = await loginPost(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ownerEmail, password: "password123" }),
      }) as any
    );
    expect(loginRes.status).toBe(200);
    const loginJson = await loginRes.json();
    expect(loginJson.data.activeBusinessId).toBeNull();
    expect(loginJson.data.availableBusinesses.length).toBe(2);

    // Unbound session without X-Business-Id / query / body must return 400 ACTIVE_BUSINESS_REQUIRED
    const unboundSession = await createSession(singleOwner.id, null);
    cookieStore.sessionId = unboundSession.id;

    const missingBizRes = await productsGet(new Request("http://localhost/api/products"));
    expect(missingBizRes.status).toBe(400);
    const missingBizJson = await missingBizRes.json();
    expect(missingBizJson.code).toBe("ACTIVE_BUSINESS_REQUIRED");

    const missingPendingRes = await pendingMovementsGet(
      new Request("http://localhost/api/pending-movements")
    );
    expect(missingPendingRes.status).toBe(400);
    expect((await missingPendingRes.json()).code).toBe("ACTIVE_BUSINESS_REQUIRED");

    // Multi-business owner switches active business cleanly and cannot read Biz A data under Biz B
    const multiSession = await createSession(owner.id, null);
    cookieStore.sessionId = multiSession.id;

    const switchToARes = await activeBusinessPost(
      new Request("http://localhost/api/auth/active-business", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activeBusinessId: bizA.id }),
      }) as any
    );
    expect(switchToARes.status).toBe(200);
    expect((await switchToARes.json()).data.activeBusinessId).toBe(bizA.id);

    const prodA = await addProduct({
      businessId: bizA.id,
      actorId: owner.id,
      name: "Alpha Exclusive Beam",
      category: "Steel",
      unit: "lengths",
      openingStock: 10,
    });

    // Requesting Biz A products succeeds, requesting Biz B products does NOT leak Biz A's product
    const prodARes = await productsGet(
      new Request(`http://localhost/api/products?activeBusinessId=${bizA.id}`)
    );
    expect(prodARes.status).toBe(200);
    const prodAJson = await prodARes.json();
    expect(prodAJson.data.products.some((p: any) => p.id === prodA.id)).toBe(true);

    const prodBRes = await productsGet(
      new Request(`http://localhost/api/products?activeBusinessId=${bizB.id}`)
    );
    expect(prodBRes.status).toBe(200);
    const prodBJson = await prodBRes.json();
    expect(prodBJson.data.products.some((p: any) => p.id === prodA.id)).toBe(false);

    // Non-member (staffA) trying to access bizB must be rejected with 403
    const staffSession = await createSession(staffA.id, bizA.id);
    cookieStore.sessionId = staffSession.id;
    const forbiddenRes = await productsGet(
      new Request("http://localhost/api/products", {
        headers: { "X-Business-Id": String(bizB.id) },
      })
    );
    expect(forbiddenRes.status).toBe(403);
    cookieStore.sessionId = null;
  });

  // =========================================================================
  // 2. Customer Return Accounting (All 5 Worked Scenarios + Discounts + Legacy + Cash Check)
  // =========================================================================
  it("handles fully paid, unpaid, partially paid, over-credit, and partial discounted returns without inflating customer debt", async () => {
    const prod = await addProduct({
      businessId: bizA.id,
      actorId: owner.id,
      name: "Return Accounting Steel Rod",
      category: "Steel",
      unit: "lengths",
      sellingPrice: 10000,
      openingStock: 100,
      openingUnitCost: 8000,
    });

    const [cust1] = await db
      .insert(customers)
      .values({
        businessId: bizA.id,
        userId: owner.id,
        name: "Bala Builders Ltd",
        phone: "08030001111",
      })
      .returning();

    // Scenario A: Fully paid sale (5 * 10,000 = 50,000 paid) -> return 2 = 20,000 cash refund, 0 credit offset
    const fullSale = await recordSale({
      businessId: bizA.id,
      actorId: owner.id,
      productId: prod.id,
      customerId: cust1.id,
      quantity: 5,
      unitPrice: 10000,
      amountPaid: 50000,
    });
    const fullRet = await recordSaleCorrection({
      businessId: bizA.id,
      actorId: owner.id,
      originalSaleId: fullSale.sale.id,
      correctedQuantityDelta: 2,
      correctionReason: "Excess rods returned",
    });
    expect(fullRet.returnValue).toBe(20000);
    expect(fullRet.creditOffset).toBe(0);
    expect(fullRet.refundAmount).toBe(20000);
    expect(Number(fullRet.correctionSale.amountPaid)).toBe(0);
    expect(Number(fullRet.correctionSale.refundAmount)).toBe(20000);
    expect(Number(fullRet.correctionSale.outstandingAmount)).toBe(0);

    // Scenario B: Unpaid credit sale (10 * 10,000 = 100,000 unpaid) -> full return offsets 100,000 debt, 0 refund
    const unpaidSale = await recordSale({
      businessId: bizA.id,
      actorId: owner.id,
      productId: prod.id,
      customerId: cust1.id,
      quantity: 10,
      unitPrice: 10000,
      amountPaid: 0,
    });
    let custRow = (await getAllCustomers(bizA.id, owner.id)).find((c) => c.id === cust1.id);
    expect(custRow?.outstandingBalance).toBe(100000);

    const unpaidRet = await recordSaleCorrection({
      businessId: bizA.id,
      actorId: owner.id,
      originalSaleId: unpaidSale.sale.id,
      correctedQuantityDelta: 10,
      correctionReason: "Wrong specification delivered",
    });
    expect(unpaidRet.returnValue).toBe(100000);
    expect(unpaidRet.creditOffset).toBe(100000);
    expect(unpaidRet.refundAmount).toBe(0);
    custRow = (await getAllCustomers(bizA.id, owner.id)).find((c) => c.id === cust1.id);
    expect(custRow?.outstandingBalance).toBe(0);

    // Scenario C: Partially paid sale (10 * 10,000 = 100,000; paid 60,000, outstanding 40,000) -> return 7 = 70,000
    // Credit offset absorbs 40,000 debt, remaining 30,000 is cash refund! Debt MUST become 0 (never +20k/+30k).
    const partialSale = await recordSale({
      businessId: bizA.id,
      actorId: owner.id,
      productId: prod.id,
      customerId: cust1.id,
      quantity: 10,
      unitPrice: 10000,
      amountPaid: 60000,
    });
    const partialRet = await recordSaleCorrection({
      businessId: bizA.id,
      actorId: owner.id,
      originalSaleId: partialSale.sale.id,
      correctedQuantityDelta: 7,
      correctionReason: "Returned 7 unused rods",
    });
    expect(partialRet.returnValue).toBe(70000);
    expect(partialRet.creditOffset).toBe(40000);
    expect(partialRet.refundAmount).toBe(30000);
    custRow = (await getAllCustomers(bizA.id, owner.id)).find((c) => c.id === cust1.id);
    expect(custRow?.outstandingBalance).toBe(0);

    // Scenario D: Over-credit with subsequent customer_payments reducing balance before return
    const [cust2] = await db
      .insert(customers)
      .values({
        businessId: bizA.id,
        userId: owner.id,
        name: "Amina Roofing Contractors",
        phone: "08030002222",
      })
      .returning();

    const creditSale2 = await recordSale({
      businessId: bizA.id,
      actorId: owner.id,
      productId: prod.id,
      customerId: cust2.id,
      quantity: 10,
      unitPrice: 10000,
      amountPaid: 0, // 100,000 owed
    });
    await recordCustomerPayment({
      businessId: bizA.id,
      actorId: owner.id,
      customerId: cust2.id,
      amount: 70000, // 30,000 owed remaining
    });
    const retOverCredit = await recordSaleCorrection({
      businessId: bizA.id,
      actorId: owner.id,
      originalSaleId: creditSale2.sale.id,
      correctedQuantityDelta: 5, // 50,000 return value
      correctionReason: "Half batch returned",
    });
    expect(retOverCredit.returnValue).toBe(50000);
    expect(retOverCredit.creditOffset).toBe(30000);
    expect(retOverCredit.refundAmount).toBe(20000);
    const cust2After = (await getAllCustomers(bizA.id, owner.id)).find((c) => c.id === cust2.id);
    expect(cust2After?.outstandingBalance).toBe(0);

    // Scenario E: Multiple partial returns on a discounted sale + over-return guard
    // Catalog price is 10,000, sold at discounted unitPrice 9,000 * 5 = 45,000
    const discSale = await recordSale({
      businessId: bizA.id,
      actorId: owner.id,
      productId: prod.id,
      quantity: 5,
      unitPrice: 9000,
      amountPaid: 45000,
    });
    const partRet1 = await recordSaleCorrection({
      businessId: bizA.id,
      actorId: owner.id,
      originalSaleId: discSale.sale.id,
      correctedQuantityDelta: 2,
      correctionReason: "First partial return",
    });
    expect(partRet1.returnValue).toBe(18000);
    expect(partRet1.refundAmount).toBe(18000);

    const partRet2 = await recordSaleCorrection({
      businessId: bizA.id,
      actorId: owner.id,
      originalSaleId: discSale.sale.id,
      correctedQuantityDelta: 3,
      correctionReason: "Final partial return",
    });
    expect(partRet2.returnValue).toBe(27000);
    expect(partRet2.refundAmount).toBe(27000);

    await expect(
      recordSaleCorrection({
        businessId: bizA.id,
        actorId: owner.id,
        originalSaleId: discSale.sale.id,
        correctedQuantityDelta: 1,
        correctionReason: "Over-return attempt",
      })
    ).rejects.toThrow(/already returned 5 of 5/i);

    // Daily cash check deducts cash refunds (here today's net cash = paid - refunds)
    const todayStr = new Date().toISOString().slice(0, 10);
    const cashCheck = await recordDailyCashCheck({
      businessId: bizA.id,
      actorId: owner.id,
      checkDate: todayStr,
      actualCash: 110000,
    });
    const checks = await getDailyCashChecks(bizA.id, 1, owner.id);
    expect(checks[0].id).toBe(cashCheck.id);
    // 50,000 + 60,000 + 70,000(debt recovery) + 45,000 - (20,000 + 30,000 + 20,000 + 18,000 + 27,000) = 110,000
    expect(Number(cashCheck.expectedCash)).toBe(110000);
    expect(Number(cashCheck.difference)).toBe(0);
  });

  it("preserves legacy positive correction semantics and clamps calculateVelocity with returns", () => {
    const now = new Date();
    const start = new Date(now.getTime() - 7 * 24 * HOUR_MS);
    const summary = calculatePeriodSummary({
      sales: [
        {
          totalAmount: 10000,
          amountPaid: 10000,
          refundAmount: 0,
          outstandingAmount: 0,
          quantity: 2,
          isCorrection: false,
          createdAt: now,
        },
        {
          // Legacy positive correction row (pre-Task 3 convention)
          totalAmount: 5000,
          amountPaid: 5000,
          refundAmount: 0,
          outstandingAmount: 0,
          quantity: 1,
          isCorrection: true,
          createdAt: now,
        },
      ],
      payments: [],
      deliveries: [],
      adjustmentsCount: 0,
      lowStockCount: 0,
      periodStart: start,
      periodEnd: now,
      priorTotalDebt: 0,
    });
    // Legacy positive correction row preserves its recorded values without inferring a cash refund
    expect(summary.refundAmount).toBe(0);
    expect(summary.totalSalesValue).toBe(15000);
    expect(summary.cashCollected).toBe(15000);

    // calculateVelocity returns net velocity clamped >= 0
    const createdAt = new Date(now.getTime() - 10 * 24 * HOUR_MS);
    const velPositive = calculateVelocity({
      sales: [
        { quantity: 10, date: new Date(now.getTime() - 2 * 24 * HOUR_MS), isCorrection: false },
        { quantity: -4, date: new Date(now.getTime() - 1 * 24 * HOUR_MS), isCorrection: true },
      ],
      productCreatedAt: createdAt,
      earliestActivityDate: createdAt,
      now,
    });
    expect(velPositive).toBeCloseTo(0.6, 4);

    const velClamped = calculateVelocity({
      sales: [
        { quantity: 3, date: new Date(now.getTime() - 2 * 24 * HOUR_MS), isCorrection: false },
        { quantity: -8, date: new Date(now.getTime() - 1 * 24 * HOUR_MS), isCorrection: true },
      ],
      productCreatedAt: createdAt,
      earliestActivityDate: createdAt,
      now,
    });
    expect(velClamped).toBe(0);
  });

  // =========================================================================
  // 3. Walkthrough 4 COGS Compatibility & Profit Reliability Suppression
  // =========================================================================
  it("keeps COGS ending quantities aligned with Walkthrough 4 (35, not 30) and suppresses unreliable profit", () => {
    const start = new Date("2026-01-01T00:00:00Z");
    const t1 = new Date("2026-01-02T09:30:00Z"); // late sale occurred before count
    const t2 = new Date("2026-01-02T10:00:00Z"); // physical count observed 35
    const end = new Date("2026-01-03T00:00:00Z");

    const cogsResult = computeLedgerCogsForPeriod({
      periodStart: start,
      periodEnd: end,
      ledgerEntries: [
        { id: 1, productId: 99, entryType: "OPENING_BALANCE", quantityDelta: 40, unitCost: 5000, occurredAt: start },
        // Physical count at t2 saw 35 before late sale synced -> ADJUSTMENT -5
        { id: 2, productId: 99, entryType: "ADJUSTMENT", quantityDelta: -5, unitCost: null, occurredAt: t2 },
        // Late sale resolved at t1 -> SALE -5 AND OPENING_BALANCE_RECONCILIATION +5
        { id: 3, productId: 99, entryType: "SALE", quantityDelta: -5, unitCost: null, occurredAt: t1 },
        { id: 4, productId: 99, entryType: "OPENING_BALANCE_RECONCILIATION", quantityDelta: 5, unitCost: null, occurredAt: t1, reconciledEntryId: 3 },
      ],
    });

    // Authoritative inventory balance is 40 - 5 (adj) - 5 (sale) + 5 (recon) = 35
    expect(cogsResult.endingQuantities.get(99)).toBe(35);
    expect(cogsResult.costOfGoodsSold).toBe(25000); // 5 sold @ 5,000

    // Profit must be suppressed when non-zero adjustment & reconciliation exist in period
    const report = calculatePeriodSummary({
      sales: [{ totalAmount: 30000, amountPaid: 30000, refundAmount: 0, outstandingAmount: 0, quantity: 5, productId: 99, createdAt: t1 }],
      payments: [],
      deliveries: [],
      ledgerEntries: [
        { id: 1, productId: 99, entryType: "OPENING_BALANCE", quantityDelta: 40, unitCost: 5000, occurredAt: start },
        { id: 2, productId: 99, entryType: "ADJUSTMENT", quantityDelta: -5, unitCost: null, occurredAt: t2 },
        { id: 3, productId: 99, entryType: "SALE", quantityDelta: -5, unitCost: null, occurredAt: t1 },
        { id: 4, productId: 99, entryType: "OPENING_BALANCE_RECONCILIATION", quantityDelta: 5, unitCost: null, occurredAt: t1, reconciledEntryId: 3 },
      ],
      adjustmentsCount: 1,
      lowStockCount: 0,
      periodStart: start,
      periodEnd: end,
      priorTotalDebt: 0,
    });
    expect(report.isProfitReliable).toBe(false);
    expect(report.estimatedProfit).toBeNull();
    expect(report.profitConfidenceWarning).toMatch(/non-zero physical stock adjustments|reconciliations/i);
  });

  // =========================================================================
  // 4. Multi-Count Reconciliation Order Invariance & Exact Cutoff Equality
  // =========================================================================
  it("produces identical stock balance under chronological and reverse-chronological resolution and honors exact <= cutoff equality", async () => {
    const setupProductWithCounts = async (name: string) => {
      const prod = await addProduct({
        businessId: bizA.id,
        actorId: owner.id,
        name,
        category: "Cement",
        unit: "bags",
        sellingPrice: 9000,
      });

      // Initial stock (+50) received at t0900 before all subsequent events
      await recordDelivery({
        businessId: bizA.id,
        actorId: owner.id,
        productId: prod.id,
        quantityReceived: 50,
        unitCost: 8000,
        occurredAt: t0900,
      });

      // Intervening sale (-4) at t0930 before counts
      await recordSale({
        businessId: bizA.id,
        actorId: owner.id,
        productId: prod.id,
        quantity: 4,
        unitPrice: 9000,
        amountPaid: 36000,
        occurredAt: t0930,
      });

      // Intervening delivery (+10) at t1030 between count 1 (t1000) and count 2 (t1100)
      await recordDelivery({
        businessId: bizA.id,
        actorId: owner.id,
        productId: prod.id,
        quantityReceived: 10,
        unitCost: 8000,
        occurredAt: t1030,
      });

      // Two skewed physical counts quarantined in pending_stock_movements
      const skewedC1 = await recordStockCount({
        businessId: bizA.id,
        actorId: owner.id,
        productId: prod.id,
        physicalCount: 44, // at t1000 (ledger before t1000 was 50 - 4 = 46 -> adj -2)
        clientTimestamp: new Date(Date.now() + 2 * HOUR_MS),
        isOfflineSync: true,
      });

      const skewedC2 = await recordStockCount({
        businessId: bizA.id,
        actorId: owner.id,
        productId: prod.id,
        physicalCount: 52, // at t1100 (after +10 delivery, shelf has 52 -> 44 + 10 = 54, adj -2)
        clientTimestamp: new Date(Date.now() + 3 * HOUR_MS),
        isOfflineSync: true,
      });

      return { prod, c1Id: skewedC1.pendingMovement!.id, c2Id: skewedC2.pendingMovement!.id };
    };

    // Order 1: Chronological (c1 @ t1000, then c2 @ t1100)
    const chrono = await setupProductWithCounts("Multi-Count Chrono");
    await resolvePendingMovement({
      pendingMovementId: chrono.c1Id,
      businessId: bizA.id,
      actorId: owner.id,
      resolutionMode: "EXACT_TIMESTAMP",
      resolvedOccurredAt: t1000,
      resolutionNote: "Count 1 confirmed",
    });
    await resolvePendingMovement({
      pendingMovementId: chrono.c2Id,
      businessId: bizA.id,
      actorId: owner.id,
      resolutionMode: "EXACT_TIMESTAMP",
      resolvedOccurredAt: t1100,
      resolutionNote: "Count 2 confirmed",
    });
    const chronoDetails = await getProductDetails(bizA.id, chrono.prod.id, "OWNER");
    expect(chronoDetails?.product.currentStock).toBe(52);
    expect(chronoDetails?.product.verificationStatus).toBe("VERIFIED");

    // Order 2: Reverse-chronological (c2 @ t1100 first, then c1 @ t1000 -> must not double-count!)
    const rev = await setupProductWithCounts("Multi-Count Reverse");
    await resolvePendingMovement({
      pendingMovementId: rev.c2Id,
      businessId: bizA.id,
      actorId: owner.id,
      resolutionMode: "EXACT_TIMESTAMP",
      resolvedOccurredAt: t1100,
      resolutionNote: "Count 2 confirmed first",
    });
    await resolvePendingMovement({
      pendingMovementId: rev.c1Id,
      businessId: bizA.id,
      actorId: owner.id,
      resolutionMode: "EXACT_TIMESTAMP",
      resolvedOccurredAt: t1000,
      resolutionNote: "Count 1 confirmed second",
    });
    const revDetails = await getProductDetails(bizA.id, rev.prod.id, "OWNER");
    expect(revDetails?.product.currentStock).toBe(52);
    expect(revDetails?.product.verificationStatus).toBe("VERIFIED");
    expect(Number(revDetails?.product.lastVerifiedQuantity)).toBe(52);

    // Exact cutoff equality boundary:
    // Verify a movement at exact t1100 (occurredAt === countCutoff) IS reconciled (PRE_CUTOFF),
    // while t1100 + 1ms IS NOT reconciled (POST_CUTOFF).
    const saleAtExactCutoff = await recordSale({
      businessId: bizA.id,
      actorId: owner.id,
      productId: rev.prod.id,
      quantity: 3,
      unitPrice: 9000,
      amountPaid: 27000,
      clientTimestamp: t1100,
      isOfflineSync: true,
    });
    expect(saleAtExactCutoff.isQuarantined).toBe(false);
    const exactRecon = await db
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.reconciledEntryId, saleAtExactCutoff.ledgerEntry!.id));
    expect(exactRecon.length).toBe(1);
    expect(Number(exactRecon[0].quantityDelta)).toBe(3);

    const tAfterCutoff = new Date(t1100.getTime() + 1);
    const saleAfterCutoff = await recordSale({
      businessId: bizA.id,
      actorId: owner.id,
      productId: rev.prod.id,
      quantity: 2,
      unitPrice: 9000,
      amountPaid: 18000,
      clientTimestamp: tAfterCutoff,
      isOfflineSync: true,
    });
    const postRecon = await db
      .select()
      .from(stockLedgerEntries)
      .where(eq(stockLedgerEntries.reconciledEntryId, saleAfterCutoff.ledgerEntry!.id));
    expect(postRecon.length).toBe(0);
    expect((await getProductDetails(bizA.id, rev.prod.id, "OWNER"))?.product.currentStock).toBe(50);

    // COUNT_CONFLICT_EXACT_TIMESTAMP: attempting a different physical count at exact t1100 must throw 409 conflict
    await expect(
      recordStockCount({
        businessId: bizA.id,
        actorId: owner.id,
        productId: rev.prod.id,
        physicalCount: 49,
        occurredAt: t1100,
      })
    ).rejects.toThrow(/already has a verified count/i);
  });

  // =========================================================================
  // 5. Pending Delivery Projection, Cost Edit, Dependent Return & ON DELETE RESTRICT
  // =========================================================================
  it("projects pending deliveries without duplication, blocks dependent return resolution until parent resolves, and enforces ON DELETE RESTRICT", async () => {
    const prod = await addProduct({
      businessId: bizB.id,
      actorId: owner.id,
      name: "Quarantine Timber Plank",
      category: "Timber",
      unit: "pieces",
      sellingPrice: 3000,
      openingStock: 20,
      openingUnitCost: 2200,
    });

    // Skewed offline delivery -> quarantined in pending_stock_movements
    const skewedDeliv = await recordDelivery({
      businessId: bizB.id,
      actorId: owner.id,
      productId: prod.id,
      quantityReceived: 10,
      unitCost: 2400,
      supplierName: "Benin Timber Yard",
      clientTimestamp: new Date(Date.now() + 2 * HOUR_MS),
      isOfflineSync: true,
    });
    expect(skewedDeliv.isQuarantined).toBe(true);
    const pendingDelivId = skewedDeliv.pendingMovement!.id;

    // Owner updates pending delivery cost -> reflected in report & supplier directory without duplicating
    await updatePendingDeliveryCost({
      pendingMovementId: pendingDelivId,
      businessId: bizB.id,
      actorId: owner.id,
      unitCost: 2500,
    });

    const reportBefore = await getBusinessPeriodReport(bizB.id, 7, "OWNER");
    expect(reportBefore.metrics.pendingDeliveriesCount).toBe(1);
    expect(reportBefore.metrics.pendingRestockExpenditure).toBe(25000);
    expect(reportBefore.metrics.restockExpenditure).toBe(25000);
    expect(reportBefore.metrics.isProfitReliable).toBe(false);

    const suppliersOwner = await getSuppliersDirectory(bizB.id, "OWNER");
    const beninOwner = suppliersOwner.find((s) => s.supplierName === "Benin Timber Yard");
    expect(beninOwner?.deliveriesCount).toBe(1);
    expect(beninOwner?.lastPurchaseCost).toBe(2500);

    const suppliersStaff = await getSuppliersDirectory(bizB.id, "STAFF");
    const beninStaff = suppliersStaff.find((s) => s.supplierName === "Benin Timber Yard");
    expect(beninStaff?.lastPurchaseCost).toBeNull();

    // Resolve pending delivery -> moves cleanly from pending to confirmed without duplication
    await resolvePendingMovement({
      pendingMovementId: pendingDelivId,
      businessId: bizB.id,
      actorId: owner.id,
      resolutionMode: "POST_CUTOFF",
      resolvedOccurredAt: t1100,
      resolutionNote: "Confirmed delivery arrival",
    });

    const reportAfter = await getBusinessPeriodReport(bizB.id, 7, "OWNER");
    expect(reportAfter.metrics.pendingDeliveriesCount).toBe(0);
    expect(reportAfter.metrics.pendingRestockExpenditure).toBe(0);
    expect(reportAfter.metrics.restockExpenditure).toBe(25000);
    const suppliersAfter = await getSuppliersDirectory(bizB.id, "OWNER");
    expect(suppliersAfter.find((s) => s.supplierName === "Benin Timber Yard")?.deliveriesCount).toBe(1);

    // Dependent return on a quarantined sale cannot be resolved until parent sale resolves
    const skewedSale = await recordSale({
      businessId: bizB.id,
      actorId: owner.id,
      productId: prod.id,
      quantity: 4,
      unitPrice: 3000,
      amountPaid: 12000,
      clientTimestamp: new Date(Date.now() + 2 * HOUR_MS),
      isOfflineSync: true,
    });
    const parentPendingId = skewedSale.pendingMovements[0].id;

    const depReturn = await recordSaleCorrection({
      businessId: bizB.id,
      actorId: owner.id,
      originalSaleId: skewedSale.sale.id,
      correctedQuantityDelta: 1,
      correctionReason: "One split plank",
    });
    expect(depReturn.isQuarantined).toBe(true);
    const childPendingId = depReturn.pendingMovement!.id;

    // Resolving child first MUST fail with 409 PARENT_SALE_PENDING_REVIEW
    const ownerSession = await createSession(owner.id, bizB.id);
    cookieStore.sessionId = ownerSession.id;

    const childFirstRes = await resolvePendingPost(
      new Request(`http://localhost/api/pending-movements/${childPendingId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Business-Id": String(bizB.id) },
        body: JSON.stringify({
          resolutionMode: "POST_CUTOFF",
          resolvedOccurredAt: t1100.toISOString(),
          resolutionNote: "Try resolving child first",
        }),
      }),
      { params: Promise.resolve({ id: String(childPendingId) }) }
    );
    expect(childFirstRes.status).toBe(409);
    expect((await childFirstRes.json()).code).toBe("PARENT_SALE_PENDING_REVIEW");

    // STAFF cannot resolve pending movements (OWNER-only -> 403)
    const staffBMembership = await db
      .insert(businessMemberships)
      .values({
        businessId: bizB.id,
        userId: staffA.id,
        role: "STAFF",
        status: "ACTIVE",
        activatedAt: new Date(),
      })
      .returning();
    expect(staffBMembership.length).toBe(1);

    const staffSess = await createSession(staffA.id, bizB.id);
    cookieStore.sessionId = staffSess.id;
    const staffResolveRes = await resolvePendingPost(
      new Request(`http://localhost/api/pending-movements/${parentPendingId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Business-Id": String(bizB.id) },
        body: JSON.stringify({
          resolutionMode: "POST_CUTOFF",
          resolvedOccurredAt: t1100.toISOString(),
          resolutionNote: "Staff attempt",
        }),
      }),
      { params: Promise.resolve({ id: String(parentPendingId) }) }
    );
    expect(staffResolveRes.status).toBe(403);

    // Owner resolves parent then child -> stock settles accurately (20 + 10 - 4 + 1 = 27)
    cookieStore.sessionId = ownerSession.id;
    await resolvePendingMovement({
      pendingMovementId: parentPendingId,
      businessId: bizB.id,
      actorId: owner.id,
      resolutionMode: "POST_CUTOFF",
      resolvedOccurredAt: t1100,
      resolutionNote: "Parent sale confirmed",
    });
    await resolvePendingMovement({
      pendingMovementId: childPendingId,
      businessId: bizB.id,
      actorId: owner.id,
      resolutionMode: "POST_CUTOFF",
      resolvedOccurredAt: new Date(t1100.getTime() + 60000),
      resolutionNote: "Return confirmed after parent",
    });

    const finalDetails = await getProductDetails(bizB.id, prod.id, "OWNER");
    expect(finalDetails?.product.currentStock).toBe(27);
    expect(
      (await listPendingStockMovements({ businessId: bizB.id, actorId: owner.id, status: "PENDING_REVIEW" })).length
    ).toBe(0);

    // ON DELETE RESTRICT prevents deleting a product that has sales or ledger history
    await expect(
      deleteProduct({ businessId: bizB.id, actorId: owner.id, productId: prod.id })
    ).rejects.toThrow(/cannot delete/i);
    await expect(
      db.delete(products).where(eq(products.id, prod.id))
    ).rejects.toThrow();

    // Ensure session listing still returns expected resolved items
    const resolvedList = await listPendingStockMovements({
      businessId: bizB.id,
      actorId: owner.id,
      status: "RESOLVED_POST_CUTOFF",
    });
    expect(resolvedList.length).toBeGreaterThanOrEqual(3);

    // Clean up cookie mock
    cookieStore.sessionId = null;

    // Sanity verify session post empty helper still works cleanly
    const sess = await createOpeningStockSession({
      businessId: bizB.id,
      actorId: owner.id,
      name: "Sanity Check Session",
      productIds: [prod.id],
    });
    await recordSessionCount({
      sessionId: sess.id,
      businessId: bizB.id,
      productId: prod.id,
      countedQuantity: 27,
      countedAt: new Date(),
      countedByUserId: owner.id,
    });
    const posted = await postOpeningStockSession({
      sessionId: sess.id,
      businessId: bizB.id,
      actorId: owner.id,
    });
    expect(posted.postedCount).toBe(1);
    const [updatedSaleRow] = await db
      .select()
      .from(sales)
      .where(eq(sales.id, skewedSale.sale.id))
      .limit(1);
    expect(updatedSaleRow.timestampStatus).toBe("RESOLVED_POST_CUTOFF");
  });
});
