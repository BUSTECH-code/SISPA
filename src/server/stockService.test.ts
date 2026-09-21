import { describe, it, expect, beforeAll } from "vitest";
import {
  addProduct,
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

describe("SISPA 1.0 Financial Truth, Security & Business Control Tests", () => {
  let ownerId: number;
  let staffId: number;
  let otherBusinessOwnerId: number;
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

    // 4. Add test products under Business A
    const cement = await addProduct({
      userId: ownerId,
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
      userId: ownerId,
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
    const ownerView = await getProductDetails(ownerId, cementProductId, "OWNER");
    expect(ownerView?.product.lastSupplierInfo?.unitCost).toBe(8500);
    expect(ownerView?.ledgerHistory[0].unitCost).toBe("8500.00");

    // Staff view: purchase price is strictly redacted to null
    const staffView = await getProductDetails(ownerId, cementProductId, "STAFF");
    expect(staffView?.product.lastSupplierInfo?.unitCost).toBeNull();
    expect(staffView?.ledgerHistory[0].unitCost).toBeNull();

    // Staff view in buying list: estimated purchase cost is redacted to null
    await addOrUpdateBuyingListItem({
      userId: ownerId,
      productId: cementProductId,
      quantityToBuy: 50,
      estimatedUnitCost: 8500,
      supplierName: "Dangote Depot",
    });
    const staffBuyingList = await getBuyingList(ownerId, "STAFF");
    const cementItem = staffBuyingList.find((i) => i.productId === cementProductId);
    expect(cementItem?.estimatedUnitCost).toBeNull();

    // Staff view in suppliers directory: purchase costs are redacted to null
    const staffSuppliers = await getSuppliersDirectory(ownerId, "STAFF");
    for (const s of staffSuppliers) {
      expect(s.lastPurchaseCost).toBeNull();
      s.previousPrices.forEach((p) => expect(p.unitCost).toBeNull());
    }
  });

  it("Staff role CANNOT access profit, margins, or purchase expenditure in reports", async () => {
    // Staff report: profit and purchase expenditures are suppressed server-side
    const staffReport = await getBusinessPeriodReport(ownerId, 7, "STAFF");
    expect(staffReport.metrics.estimatedProfit).toBeNull();
    expect(staffReport.metrics.profitBreakdown).toBeNull();
    expect(staffReport.metrics.costOfGoodsSold).toBe(0);
    expect(staffReport.metrics.restockExpenditure).toBe(0);
    expect(staffReport.recentActivities[0].unitCost).toBeNull();
  });

  it("Owner CAN access authorized financial information and profit breakdowns", async () => {
    const ownerReport = await getBusinessPeriodReport(ownerId, 7, "OWNER");
    expect(ownerReport.metrics).toBeDefined();
    expect(typeof ownerReport.metrics.totalSalesValue).toBe("number");
  });

  // ==========================================
  // SECTION 18.2: CROSS-BUSINESS ISOLATION
  // ==========================================
  it("Cross-business access is strictly impossible", async () => {
    // Business B owner cannot see Business A products
    const otherProducts = await getAllEnrichedProducts(otherBusinessOwnerId);
    expect(otherProducts.some((p) => p.id === cementProductId)).toBe(false);

    // Business B owner querying Business A product returns null
    const otherDetail = await getProductDetails(otherBusinessOwnerId, cementProductId, "OWNER");
    expect(otherDetail).toBeNull();

    // Business B owner cannot access Business A customers or debt
    const otherCustomers = await getAllCustomers(otherBusinessOwnerId);
    expect(otherCustomers.length).toBe(0);
  });

  // ==========================================
  // SECTION 18.3: SALES & STOCK LEDGER
  // ==========================================
  it("Sales correctly affect stock and create customer debt when not paid in full", async () => {
    // Cement opening stock was 100.
    // Record sale of 20 bags to "Alhaji Sanusi Site": 184,000 total, 84,000 paid, 100,000 credit
    const { sale, ledgerEntry } = await recordSale({
      userId: ownerId,
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
    const details = await getProductDetails(ownerId, cementProductId, "OWNER");
    expect(details?.product.currentStock).toBe(80);

    // Customer owes 100,000
    const customers = await getAllCustomers(ownerId);
    const sanusi = customers.find((c) => c.name === "Alhaji Sanusi Site");
    expect(sanusi?.outstandingBalance).toBe(100000);
    expect(sanusi?.isOverdue).toBe(true);

    // Audit trail captured staff action with human language
    const logs = await getAuditLogs(ownerId, "OWNER", 10);
    const saleLog = logs.find((l) => l.eventType === "SALE");
    expect(saleLog).toBeDefined();
    expect(saleLog?.actorName).toBe("Aminu Staff");
    expect(saleLog?.description).toContain("Aminu Staff recorded a sale");
  });

  // ==========================================
  // SECTION 18.4: IMMUTABLE HISTORY & CORRECTIONS
  // ==========================================
  it("Corrections preserve historical events and append corrective ledger records", async () => {
    // Customer returned 2 bags of cement from the recorded sale
    // Instead of mutating the original sale, record a sale correction (+2 bags return)
    const { correctionSale, ledgerCorrection } = await recordSaleCorrection({
      userId: ownerId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      originalSaleId: recordedSaleId,
      correctedQuantityDelta: 2,
      correctionReason: "Customer returned 2 unopened bags",
    });

    expect(correctionSale.isCorrection).toBe(true);
    expect(ledgerCorrection.entryType).toBe("CORRECTION");

    // Stock was 80, now 80 + 2 = 82
    const details = await getProductDetails(ownerId, cementProductId, "OWNER");
    expect(details?.product.currentStock).toBe(82);

    // Audit log records correction with reason
    const logs = await getAuditLogs(ownerId, "OWNER", 5);
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
      userId: ownerId,
      actorId: staffId,
      actorName: "Aminu Staff",
      actorRole: "STAFF",
      productId: cementProductId,
      quantityReceived: 50,
      supplierName: "Dangote Depot Lagos",
      notes: "Trailer arrived at yard",
    });

    // Stock increased: 82 + 50 = 132
    let details = await getProductDetails(ownerId, cementProductId, "OWNER");
    expect(details?.product.currentStock).toBe(132);
    expect(staffDelivery.unitCost).toBeNull();

    // Owner later adds purchase cost: ₦8,600/bag
    const updated = await updateDeliveryPurchaseCost({
      userId: ownerId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      ledgerEntryId: staffDelivery.id,
      unitCost: 8600,
    });

    expect(updated.unitCost).toBe("8600.00");

    details = await getProductDetails(ownerId, cementProductId, "OWNER");
    expect(details?.product.lastSupplierInfo?.unitCost).toBe(8600);
  });

  // ==========================================
  // SECTION 18.6: PAYMENTS & DEBT RECOVERY
  // ==========================================
  it("Customer debt recovery payments decrease debt and increase recovered funds", async () => {
    const customers = await getAllCustomers(ownerId);
    const sanusi = customers.find((c) => c.name === "Alhaji Sanusi Site")!;
    expect(sanusi.outstandingBalance).toBe(100000);

    // Sanusi pays 60,000 cash towards debt
    const payment = await recordCustomerPayment({
      userId: ownerId,
      actorId: staffId,
      actorName: "Aminu Staff",
      actorRole: "STAFF",
      customerId: sanusi.id,
      amount: 60000,
      paymentMethod: "CASH",
      notes: "Part cash payment brought to shop",
    });

    expect(payment.amount).toBe("60000.00");

    // Debt reduced to 40,000
    const updatedCust = await getAllCustomers(ownerId);
    const updatedSanusi = updatedCust.find((c) => c.id === sanusi.id)!;
    expect(updatedSanusi.outstandingBalance).toBe(40000);
  });

  // ==========================================
  // SECTION 18.7: EXPENSES & PROFIT INTEGRITY
  // ==========================================
  it("Expenses affect expense totals and profit calculations handle incomplete data honestly", async () => {
    // Record expense
    await recordExpense({
      userId: ownerId,
      actorId: staffId,
      actorName: "Aminu Staff",
      actorRole: "STAFF",
      title: "Generator Fuel (30L)",
      category: "Utilities & Fuel",
      amount: 25000,
      paymentMethod: "CASH",
    });

    const expensesList = await getAllExpenses(ownerId);
    expect(expensesList.some((e) => e.title.includes("Generator Fuel"))).toBe(true);

    // Sold Rebar (which had no purchase cost logged) to test data confidence honesty
    await recordSale({
      userId: ownerId,
      productId: rebarProductId,
      quantity: 5,
      unitPrice: 6800,
      amountPaid: 34000,
    });

    // Owner period report: surfaces honest warning that purchase costs are missing for complete profit
    const report = await getBusinessPeriodReport(ownerId, 7, "OWNER");
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
      userId: ownerId,
      actorId: ownerId,
      actorName: "Alhaji Musa",
      actorRole: "OWNER",
      checkDate: todayStr,
      actualCash: 100000,
      notes: "End of day cash drawer count",
    });

    expect(check.actualCash).toBe("100000.00");
    expect(check.difference).toBeDefined();

    const checkList = await getDailyCashChecks(ownerId, 5);
    expect(checkList.length).toBeGreaterThanOrEqual(1);
  });

  // ==========================================
  // SECTION 18.9: DATA EXPORT
  // ==========================================
  it("Owner can export complete business backup payload", async () => {
    const backup = await exportBusinessData(ownerId);
    expect(backup.business).toBeDefined();
    expect(backup.products.length).toBeGreaterThan(0);
    expect(backup.sales.length).toBeGreaterThan(0);
    expect(backup.stockLedger.length).toBeGreaterThan(0);
    expect(backup.auditTrail.length).toBeGreaterThan(0);
  });
});
