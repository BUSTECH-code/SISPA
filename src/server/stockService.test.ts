import { describe, it, expect, beforeAll } from "vitest";
import {
  addProduct,
  deleteProduct,
  recordSale,
  recordSaleCorrection,
  recordDelivery,
  updateDeliveryPurchaseCost,
  recordStockCount,
  getAllEnrichedProducts,
  getProductDetails,
  getAllCustomers,
  recordCustomerPayment,
  recordExpense,
  getAllExpenses,
  getBusinessPeriodReport,
  recordDailyCashCheck,
  getDailyCashChecks,
  getAuditLogs,
  getSuppliersDirectory,
  addOrUpdateBuyingListItem,
  getBuyingList,
  exportBusinessData,
} from "./stockService";
import { createUser, createStaffMember } from "./authService";
import { createOpeningStockSession } from "./openingStock";
import { db } from "@/db";
import {
  products,
  customers,
  businesses,
} from "@/db/schema";
import { eq, and } from "drizzle-orm";

describe("SISPA 1.0 Financial Truth, Security & Business Control Tests", () => {
  let ownerId: number;
  let bizAId: number;
  let staffId: number;
  let otherBusinessOwnerId: number;
  let bizBId: number;
  let cementProductId: number;
  let rebarProductId: number;
  let recordedSaleId: number;

  beforeAll(async () => {
    // 1. Create Business A Owner
    const owner = await createUser({
      email: `owner_test_${Date.now()}@business.com`,
      password: "password123",
      fullName: "Alhaji Musa (Owner)",
      role: "OWNER",
      businessName: "Musa Building Materials Ltd",
    });
    ownerId = owner.id;
    const [bizA] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, ownerId))
      .limit(1);
    bizAId = bizA.id;

    // 2. Create Business A Staff Member
    const staff = await createStaffMember({
      ownerUser: owner,
      email: `staff_test_${Date.now()}@business.com`,
      password: "password123",
      fullName: "Aminu Staff",
    });
    staffId = staff.id;

    // 3. Create Business B Owner (Cross-business isolation verification)
    const otherOwner = await createUser({
      email: `other_owner_${Date.now()}@business2.com`,
      password: "password123",
      fullName: "Chief Okon (Other Shop)",
      role: "OWNER",
      businessName: "Okon Supplies Ltd",
    });
    otherBusinessOwnerId = otherOwner.id;
    const [bizB] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, otherBusinessOwnerId))
      .limit(1);
    bizBId = bizB.id;

    // 4. Add test products under Business A
    const cement = await addProduct({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      name: "Dangote 3X Cement 50kg",
      category: "Cement & Aggregates",
      unit: "bags",
      sellingPrice: 9200,
      desiredCoverageDays: 7,
      minimumStockThreshold: 40,
      openingStock: 100,
      openingUnitCost: 8500, // Confidential purchase price
      supplierName: "Dangote Depot Lagos",
    });
    cementProductId = cement.id;

    const rebar = await addProduct({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      name: "TMT Rebar 12mm",
      category: "Steel & Rods",
      unit: "lengths",
      sellingPrice: 6800,
      desiredCoverageDays: 10,
      minimumStockThreshold: 20,
      openingStock: 50,
      // Intentionally omitting openingUnitCost to test incomplete cost confidence handling
      supplierName: "Kallos Steel",
    });
    rebarProductId = rebar.id;
  });

  // ==========================================
  // SECTION 18.1: COMMERCIAL SENSITIVITY & ROLE RESTRICTIONS
  // ==========================================
  it("Staff role CANNOT access purchase prices or supplier pricing history", async () => {
    // Owner sees confidential purchase price
    const ownerView = await getProductDetails(bizAId, cementProductId, "OWNER");
    expect(ownerView?.product.lastSupplierInfo?.unitCost).toBe(8500);
    expect(ownerView?.ledgerHistory[0].unitCost).toBe("8500.00");

    // Staff view: purchase price is strictly redacted to null
    const staffView = await getProductDetails(bizAId, cementProductId, "STAFF");
    expect(staffView?.product.lastSupplierInfo?.unitCost).toBeNull();
    expect(staffView?.ledgerHistory[0].unitCost).toBeNull();

    // Staff view in buying list: estimated purchase cost is redacted to null
    await addOrUpdateBuyingListItem({
      businessId: bizAId,
      productId: cementProductId,
      quantityToBuy: 50,
      estimatedUnitCost: 8500,
      supplierName: "Dangote Depot",
    });
    const staffBuyingList = await getBuyingList(bizAId, "STAFF");
    const cementItem = staffBuyingList.find((i) => i.productId === cementProductId);
    expect(cementItem?.estimatedUnitCost).toBeNull();

    // Staff view in suppliers directory: purchase costs are redacted to null
    const staffSuppliers = await getSuppliersDirectory(bizAId, "STAFF");
    for (const s of staffSuppliers) {
      expect(s.lastPurchaseCost).toBeNull();
      s.previousPrices.forEach((p) => expect(p.unitCost).toBeNull());
    }
  });

  it("Staff role CANNOT access profit, margins, or purchase expenditure in reports", async () => {
    // Staff report: profit and purchase expenditures are suppressed server-side
    const staffReport = await getBusinessPeriodReport(bizAId, 7, "STAFF");
    expect(staffReport.metrics.estimatedProfit).toBeNull();
    expect(staffReport.metrics.profitBreakdown).toBeNull();
    expect(staffReport.metrics.costOfGoodsSold).toBe(0);
    expect(staffReport.metrics.restockExpenditure).toBe(0);
    expect(staffReport.recentActivities[0].unitCost).toBeNull();
  });

  it("Owner CAN access authorized financial information and profit breakdowns", async () => {
    const ownerReport = await getBusinessPeriodReport(bizAId, 7, "OWNER");
    expect(ownerReport.metrics).toBeDefined();
    expect(typeof ownerReport.metrics.totalSalesValue).toBe("number");
  });

  // ==========================================
  // SECTION 18.2: CROSS-BUSINESS ISOLATION
  // ==========================================
  it("Cross-business access is strictly impossible", async () => {
    // Business B owner cannot see Business A products
    const otherProducts = await getAllEnrichedProducts(bizBId);
    expect(otherProducts.some((p) => p.id === cementProductId)).toBe(false);

    // Business B owner querying Business A product returns null
    const otherDetail = await getProductDetails(bizBId, cementProductId, "OWNER");
    expect(otherDetail).toBeNull();

    // Business B owner cannot access Business A customers or debt
    const otherCustomers = await getAllCustomers(bizBId);
    expect(otherCustomers.length).toBe(0);
  });

  // ==========================================
  // SECTION 18.3: SALES & STOCK LEDGER
  // ==========================================
  it("Sales correctly affect stock and create customer debt when not paid in full", async () => {
    // Cement opening stock was 100.
    // Record sale of 20 bags to "Alhaji Sanusi Site": 184,000 total, 84,000 paid, 100,000 credit
    const { sale } = await recordSale({
      businessId: bizAId,
      actorId: staffId,
      actorName: "Aminu Staff",
      actorRole: "STAFF",
      productId: cementProductId,
      quantity: 20,
      unitPrice: 9200,
      customerName: "Alhaji Sanusi Site",
      amountPaid: 84000,
      notes: "Truck delivery to site",
    });

    recordedSaleId = sale.id;

    expect(sale.totalAmount).toBe("184000.00");
    expect(sale.amountPaid).toBe("84000.00");
    expect(sale.outstandingAmount).toBe("100000.00");
    expect(sale.paymentStatus).toBe("PARTIAL");

    // Stock automatically reduced: 100 - 20 = 80
    const details = await getProductDetails(bizAId, cementProductId, "OWNER");
    expect(details?.product.currentStock).toBe(80);

    // Customer owes 100,000
    const customersList = await getAllCustomers(bizAId);
    const sanusi = customersList.find((c) => c.name === "Alhaji Sanusi Site");
    expect(sanusi?.outstandingBalance).toBe(100000);
    expect(sanusi?.isOverdue).toBe(true);

    // Audit trail captured staff action with human language
    const logs = await getAuditLogs(bizAId, "OWNER", 10);
    const saleLog = logs.find((l) => l.eventType === "SALE");
    expect(saleLog).toBeDefined();
    expect(saleLog?.actorName).toBe("Aminu Staff");
    expect(saleLog?.description).toContain("Aminu Staff recorded a sale");
  });

  // ==========================================
  // SECTION 18.4: IMMUTABLE HISTORY & CORRECTIONS
  // ==========================================
  it("Corrections preserve historical events and append corrective ledger records", async () => {
    // Customer returned 2 bags of cement from the recorded sale (2 * 9,200 = 18,400 credit offset)
    const { correctionSale, ledgerCorrection, creditOffset, refundAmount } = await recordSaleCorrection({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      originalSaleId: recordedSaleId,
      correctedQuantityDelta: 2,
      correctionReason: "Customer returned 2 unopened bags",
    });

    expect(correctionSale.isCorrection).toBe(true);
    expect(correctionSale.quantity).toBe("-2.00");
    expect(correctionSale.totalAmount).toBe("-18400.00");
    expect(correctionSale.outstandingAmount).toBe("-18400.00");
    expect(correctionSale.refundAmount).toBe("0.00");
    expect(creditOffset).toBe(18400);
    expect(refundAmount).toBe(0);
    expect(ledgerCorrection?.entryType).toBe("CORRECTION");

    // Stock was 80, now 80 + 2 = 82
    const details = await getProductDetails(bizAId, cementProductId, "OWNER");
    expect(details?.product.currentStock).toBe(82);

    // Audit log records correction with reason
    const logs = await getAuditLogs(bizAId, "OWNER", 5);
    const corrLog = logs.find((l) => l.eventType === "TRANSACTION_CORRECTION");
    expect(corrLog).toBeDefined();
    expect(corrLog?.reason).toBe("Customer returned 2 unopened bags");
  });

  // ==========================================
  // SECTION 18.5: DELIVERIES & STAFF RECEIVING
  // ==========================================
  it("Staff can receive deliveries without knowing cost; Owner can update purchase cost later", async () => {
    // Staff receives 50 bags of cement without knowing purchase cost
    const staffDelivery = await recordDelivery({
      businessId: bizAId,
      actorId: staffId,
      actorName: "Aminu Staff",
      actorRole: "STAFF",
      productId: cementProductId,
      quantityReceived: 50,
      supplierName: "Dangote Depot Lagos",
      notes: "Trailer arrived at yard",
    });

    // Stock increased: 82 + 50 = 132
    let details = await getProductDetails(bizAId, cementProductId, "OWNER");
    expect(details?.product.currentStock).toBe(132);
    expect(staffDelivery.unitCost).toBeNull();

    // Owner later adds purchase cost: ₦8,600/bag
    const updated = await updateDeliveryPurchaseCost({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      ledgerEntryId: staffDelivery.id,
      unitCost: 8600,
    });

    expect(updated.unitCost).toBe("8600.00");

    details = await getProductDetails(bizAId, cementProductId, "OWNER");
    expect(details?.product.lastSupplierInfo?.unitCost).toBe(8600);
  });

  // ==========================================
  // SECTION 18.6: PAYMENTS & DEBT RECOVERY
  // ==========================================
  it("Customer debt recovery payments decrease debt and increase recovered funds", async () => {
    const customersList = await getAllCustomers(bizAId);
    const sanusi = customersList.find((c) => c.name === "Alhaji Sanusi Site")!;
    // Initial 100,000 debt reduced by 18,400 return credit offset => 81,600
    expect(sanusi.outstandingBalance).toBe(81600);

    // Sanusi pays 60,000 cash towards debt
    const payment = await recordCustomerPayment({
      businessId: bizAId,
      actorId: staffId,
      actorName: "Aminu Staff",
      actorRole: "STAFF",
      customerId: sanusi.id,
      amount: 60000,
      paymentMethod: "CASH",
      notes: "Part cash payment brought to shop",
    });

    expect(payment.amount).toBe("60000.00");

    // Debt reduced to 21,600
    const updatedCust = await getAllCustomers(bizAId);
    const updatedSanusi = updatedCust.find((c) => c.id === sanusi.id)!;
    expect(updatedSanusi.outstandingBalance).toBe(21600);
  });

  // ==========================================
  // SECTION 18.7: EXPENSES & PROFIT INTEGRITY
  // ==========================================
  it("Expenses affect expense totals and profit calculations handle incomplete data honestly", async () => {
    // Record expense
    await recordExpense({
      businessId: bizAId,
      actorId: staffId,
      actorName: "Aminu Staff",
      actorRole: "STAFF",
      title: "Generator Fuel (30L)",
      category: "Utilities & Fuel",
      amount: 25000,
      paymentMethod: "CASH",
    });

    const expensesList = await getAllExpenses(bizAId);
    expect(expensesList.some((e) => e.title.includes("Generator Fuel"))).toBe(true);

    // Sold Rebar (which had no purchase cost logged) to test data confidence honesty
    await recordSale({
      businessId: bizAId,
      actorId: ownerId,
      productId: rebarProductId,
      quantity: 5,
      unitPrice: 6800,
      amountPaid: 34000,
    });

    // Owner period report: surfaces honest warning that purchase costs are missing for complete profit
    const report = await getBusinessPeriodReport(bizAId, 7, "OWNER");
    expect(report.metrics.isProfitReliable).toBe(false);
    expect(report.metrics.profitConfidenceWarning).toContain("some purchase costs are missing");
  });

  // ==========================================
  // SECTION 18.8: DAILY CASH RECONCILIATION
  // ==========================================
  it("Daily cash check calculates expected movement and reports difference in neutral language", async () => {
    // Actual cash entered: 100,000
    const todayStr = new Date().toISOString().split("T")[0];
    const check = await recordDailyCashCheck({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      checkDate: todayStr,
      actualCash: 100000,
      notes: "End of day cash drawer count",
    });

    expect(check.actualCash).toBe("100000.00");
    expect(check.difference).toBeDefined();

    const checkList = await getDailyCashChecks(bizAId, 5);
    expect(checkList.length).toBeGreaterThanOrEqual(1);
  });

  // ==========================================
  // SECTION 18.9: DATA EXPORT
  // ==========================================
  it("Owner can export complete business backup payload", async () => {
    const backup = await exportBusinessData(bizAId);
    expect(backup.business).toBeDefined();
    expect(backup.products.length).toBeGreaterThan(0);
    expect(backup.sales.length).toBeGreaterThan(0);
    expect(backup.stockLedger.length).toBeGreaterThan(0);
    expect(backup.auditTrail.length).toBeGreaterThan(0);
  });

  // ==========================================
  // SECTION 18.10: VERIFICATION STATUS PROPAGATION
  // ==========================================
  it("propagates database verificationStatus (UNVERIFIED, VERIFIED, NEEDS_RECOUNT) through getAllEnrichedProducts and getProductDetails", async () => {
    const verifyDate = new Date("2026-11-01T10:00:00Z");

    // 1. Newly created product defaults to UNVERIFIED in DB and never triggers BUY NOW even at 0 stock
    const unverifiedProd = await addProduct({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      name: "Unverified Nail 3in",
      category: "Fasteners",
      unit: "kg",
      sellingPrice: 2500,
      minimumStockThreshold: 15,
      openingStock: 0,
    });
    expect(unverifiedProd.verificationStatus).toBe("UNVERIFIED");

    const allAfterUnverified = await getAllEnrichedProducts(bizAId, "OWNER");
    const enrichedUnverified = allAfterUnverified.find((p) => p.id === unverifiedProd.id);
    const detailsUnverified = await getProductDetails(bizAId, unverifiedProd.id, "OWNER");

    for (const view of [enrichedUnverified, detailsUnverified?.product]) {
      expect(view).toBeDefined();
      expect(view!.intelligence.verificationStatus).toBe("UNVERIFIED");
      expect(view!.intelligence.status).toBe("NO_DATA");
      expect(view!.intelligence.statusLabel).toBe("UNVERIFIED");
      expect(view!.intelligence.reorderUrgent).toBe(false);
      expect(view!.intelligence.suggestedPurchaseQuantity).toBe(0);
      expect(view!.intelligence.displayNotice).toBe("Stock unverified");
    }

    // 2. VERIFIED product propagates lastVerifiedQuantity & lastVerifiedAt and triggers BUY NOW at 0/negative stock
    const verifiedProd = await addProduct({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      name: "Verified Bitumen Drum",
      category: "Waterproofing",
      unit: "drums",
      sellingPrice: 45000,
      minimumStockThreshold: 5,
      openingStock: 8,
    });
    // Sell all 8 plus 2 extra -> currentStock = -2 (negative), then verify DB propagation of VERIFIED state
    await recordSale({
      businessId: bizAId,
      actorId: ownerId,
      productId: verifiedProd.id,
      quantity: 10,
      unitPrice: 45000,
      amountPaid: 450000,
    });

    await db
      .update(products)
      .set({
        verificationStatus: "VERIFIED",
        lastVerifiedQuantity: "10.000",
        lastVerifiedAt: verifyDate,
      })
      .where(eq(products.id, verifiedProd.id));

    const allAfterVerified = await getAllEnrichedProducts(bizAId, "OWNER");
    const enrichedVerified = allAfterVerified.find((p) => p.id === verifiedProd.id);
    const detailsVerified = await getProductDetails(bizAId, verifiedProd.id, "OWNER");

    for (const view of [enrichedVerified, detailsVerified?.product]) {
      expect(view).toBeDefined();
      expect(view!.currentStock).toBe(-2);
      expect(view!.intelligence.verificationStatus).toBe("VERIFIED");
      expect(view!.intelligence.lastVerifiedQuantity).toBe(10);
      expect(view!.intelligence.status).toBe("RUNNING_LOW");
      expect(view!.intelligence.statusLabel).toBe("BUY NOW");
      expect(view!.intelligence.reorderUrgent).toBe(true);
      expect(view!.intelligence.suggestedPurchaseQuantity).toBe(5);
      expect(view!.intelligence.verificationNotice).toContain("10");
      expect(view!.intelligence.verificationNotice).toContain("-2");
    }

    // 3. NEEDS_RECOUNT product propagates recount warning while keeping shortage intelligence active
    const recountProd = await addProduct({
      businessId: bizAId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      name: "Recount Galvanized Pipe",
      category: "Plumbing",
      unit: "lengths",
      sellingPrice: 12000,
      minimumStockThreshold: 12,
      openingStock: 0,
    });
    await db
      .update(products)
      .set({
        verificationStatus: "NEEDS_RECOUNT",
        lastVerifiedQuantity: "20.000",
        lastVerifiedAt: verifyDate,
      })
      .where(eq(products.id, recountProd.id));

    const allAfterRecount = await getAllEnrichedProducts(bizAId, "OWNER");
    const enrichedRecount = allAfterRecount.find((p) => p.id === recountProd.id);
    const detailsRecount = await getProductDetails(bizAId, recountProd.id, "OWNER");

    for (const view of [enrichedRecount, detailsRecount?.product]) {
      expect(view).toBeDefined();
      expect(view!.currentStock).toBe(0);
      expect(view!.intelligence.verificationStatus).toBe("NEEDS_RECOUNT");
      expect(view!.intelligence.status).toBe("RUNNING_LOW");
      expect(view!.intelligence.statusLabel).toBe("BUY NOW");
      expect(view!.intelligence.reorderUrgent).toBe(true);
      expect(view!.intelligence.suggestedPurchaseQuantity).toBe(12);
      expect(view!.intelligence.displayNotice).toBe("Recount needed");
      expect(view!.intelligence.explanation).toContain("Provisional");
      expect(view!.intelligence.verificationNotice).toContain("Recount pending");
    }
  });

  // ==========================================
  // SECTION 18.11: SECTION F HARDENING — ATOMICITY, DELETION SAFETY & OCCURRED_AT REPORTING
  // ==========================================
  it("rolls back addProduct and recordSale auto-customer creation atomically on transactional failure", async () => {
    const rollbackProdName = `Atomic Rollback Test ${Date.now()}`;
    await expect(
      addProduct({
        businessId: bizAId,
        actorId: ownerId,
        actorName: "Alhaji Musa",
        actorRole: "OWNER",
        name: rollbackProdName,
        category: "General",
        unit: "bags",
        openingStock: 10,
        // Invalid numeric triggers DB error inside stockLedgerEntries insert after products insert
        openingUnitCost: Number.NaN,
      })
    ).rejects.toThrow();

    const committedRollbackProd = await db
      .select()
      .from(products)
      .where(and(eq(products.businessId, bizAId), eq(products.name, rollbackProdName)));
    expect(committedRollbackProd.length).toBe(0);

    // recordSale with unknown product MUST NOT leave behind an auto-created customer
    const orphanCustName = `Orphan Prevention Cust ${Date.now()}`;
    await expect(
      recordSale({
        businessId: bizAId,
        actorId: ownerId,
        productId: 9999999,
        quantity: 1,
        customerName: orphanCustName,
        amountPaid: 0,
      })
    ).rejects.toThrow();

    const leakedCustomers1 = await db
      .select()
      .from(customers)
      .where(and(eq(customers.businessId, bizAId), eq(customers.name, orphanCustName)));
    expect(leakedCustomers1.length).toBe(0);

    // recordSale with invalid customerId after product validation MUST NOT deduct stock or write ledger entries
    const beforeStock = (await getProductDetails(bizAId, cementProductId, "OWNER"))?.product.currentStock;
    await expect(
      recordSale({
        businessId: bizAId,
        actorId: ownerId,
        productId: cementProductId,
        quantity: 1,
        unitPrice: 9200,
        customerId: 9999999,
        amountPaid: 0,
      })
    ).rejects.toThrow(/Customer not found/i);

    const afterStock = (await getProductDetails(bizAId, cementProductId, "OWNER"))?.product.currentStock;
    expect(afterStock).toBe(beforeStock);
  });

  it("enforces restrictive product deletion when ledger, sales, or stocktake evidence exists", async () => {
    // 1. Product with existing ledger/sales history cannot be deleted
    await expect(
      deleteProduct({
        businessId: bizAId,
        productId: cementProductId,
        actorId: ownerId,
        actorName: "Alhaji Musa",
        actorRole: "OWNER",
      })
    ).rejects.toThrow(/PRODUCT_HAS_HISTORY/);

    const stillCement = await db.select().from(products).where(eq(products.id, cementProductId));
    expect(stillCement.length).toBe(1);

    // 2. Product referenced only by a draft openingStockItems row cannot be deleted
    const sessionProd = await addProduct({
      businessId: bizAId,
      actorId: ownerId,
      name: "Referenced In Stocktake Product",
      category: "General",
      unit: "pcs",
    });
    await createOpeningStockSession({
      businessId: bizAId,
      actorId: ownerId,
      name: "Delete Guard Session",
      productIds: [sessionProd.id],
    });
    await expect(
      deleteProduct({
        businessId: bizAId,
        productId: sessionProd.id,
        actorId: ownerId,
        actorName: "Alhaji Musa",
        actorRole: "OWNER",
      })
    ).rejects.toThrow(/PRODUCT_HAS_HISTORY/);

    // 3. Unused product with zero ledger, sales, or stocktake rows CAN be deleted (by Owner, not unauthorized staff)
    const unusedProd = await addProduct({
      businessId: bizAId,
      actorId: ownerId,
      name: "Unused Draft Deletion Candidate",
      category: "General",
      unit: "pcs",
    });

    await expect(
      deleteProduct({
        businessId: bizAId,
        productId: unusedProd.id,
        actorId: staffId,
        actorName: "Aminu Staff",
        actorRole: "STAFF",
      })
    ).rejects.toThrow(/FORBIDDEN/);

    const deleted = await deleteProduct({
      businessId: bizAId,
      productId: unusedProd.id,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
    });
    expect(deleted).toEqual({ deleted: true, productId: unusedProd.id });

    const remaining = await db.select().from(products).where(eq(products.id, unusedProd.id));
    expect(remaining.length).toBe(0);

    const logs = await getAuditLogs(bizAId, "OWNER", 10);
    expect(logs.some((l) => l.eventType === "PRODUCT_DELETED" && l.entityId === unusedProd.id)).toBe(true);
  });

  it("uses occurredAt (not createdAt) for restock expenditure windows, velocity spans, and latest supplier pricing", async () => {
    const DAY_MS = 24 * 60 * 60 * 1000;
    const histOwner = await createUser({
      email: `hist_report_${Date.now()}@shop.com`,
      password: "password123",
      fullName: "Historical Report Owner",
      role: "OWNER",
      businessName: "Timeline Accuracy Depot",
    });

    const [bizRow] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.ownerUserId, histOwner.id))
      .limit(1);
    await db
      .update(businesses)
      .set({ createdAt: new Date(Date.now() - 35 * DAY_MS) })
      .where(eq(businesses.id, bizRow.id));

    const prod = await addProduct({
      businessId: bizRow.id,
      actorId: histOwner.id,
      name: "Timeline Rebar 16mm",
      category: "Steel",
      unit: "lengths",
      sellingPrice: 11000,
    });

    // Record NEWER restock FIRST (occurredAt = 2 days ago, cost = 9,500, qty = 5 => 47,500)
    await recordDelivery({
      businessId: bizRow.id,
      actorId: histOwner.id,
      productId: prod.id,
      quantityReceived: 5,
      unitCost: 9500,
      supplierName: "Alpha Steel",
      clientTimestamp: new Date(Date.now() - 2 * DAY_MS),
      isOfflineSync: true,
    });

    // Record OLDER late-synced restock SECOND (occurredAt = 20 days ago, cost = 8,000, qty = 10 => 80,000)
    // createdAt is newer, but occurredAt is older
    await recordDelivery({
      businessId: bizRow.id,
      actorId: histOwner.id,
      productId: prod.id,
      quantityReceived: 10,
      unitCost: 8000,
      supplierName: "Alpha Steel",
      clientTimestamp: new Date(Date.now() - 20 * DAY_MS),
      isOfflineSync: true,
    });

    // 7-day report must include ONLY the 2-day-old restock (47,500), NOT the 20-day-old late-synced restock
    const report7 = await getBusinessPeriodReport(bizRow.id, 7, "OWNER");
    expect(report7.metrics.restockExpenditure).toBe(47500);

    // 30-day report must include BOTH restocks (47,500 + 80,000 = 127,500)
    const report30 = await getBusinessPeriodReport(bizRow.id, 30, "OWNER");
    expect(report30.metrics.restockExpenditure).toBe(127500);

    // Latest supplier price on product & directory must reflect occurredAt (9,500), not createdAt (8,000)
    const details = await getProductDetails(bizRow.id, prod.id, "OWNER");
    expect(details?.product.lastSupplierInfo?.unitCost).toBe(9500);

    const suppliers = await getSuppliersDirectory(bizRow.id, "OWNER");
    const alpha = suppliers.find((s) => s.supplierName === "Alpha Steel");
    expect(alpha?.lastPurchaseCost).toBe(9500);

    // Late-synced sale occurredAt = 15 days ago (createdAt = today) drives velocity active days (20 days since earliest occurredAt delivery)
    await recordSale({
      businessId: bizRow.id,
      actorId: histOwner.id,
      productId: prod.id,
      quantity: 32,
      unitPrice: 11000,
      amountPaid: 352000,
      clientTimestamp: new Date(Date.now() - 15 * DAY_MS),
      isOfflineSync: true,
    });

    const detailsAfterSale = await getProductDetails(bizRow.id, prod.id, "OWNER");
    // Total sold = 32 across ~20 active days (~1.6/day), NOT null (which would happen if createdAt today < 7d were used)
    expect(detailsAfterSale?.product.intelligence.velocity).not.toBeNull();
    expect(detailsAfterSale?.product.intelligence.velocity!).toBeLessThan(3);
    expect(detailsAfterSale?.product.intelligence.velocity!).toBeGreaterThan(1.4);
  });
});
