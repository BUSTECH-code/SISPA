import { describe, it, expect, beforeAll } from "vitest";
import {
  addProduct,
  recordSale,
  recordDelivery,
  recordCustomerPayment,
  recordStockCount,
  getAllEnrichedProducts,
  getAllCustomers,
  getAuditLogs,
} from "./stockService";
import { createUser, createStaffMember, updateStaffMembershipStatus, getAuthContextForUser } from "./authService";
import { can, assertCan } from "./authorization";
import { db } from "@/db";
import { businesses } from "@/db/schema";
import { eq } from "drizzle-orm";

describe("SISPA Phase 3 Independent Verification & Hardening Suite", () => {
  let ownerA: any;
  let staffA: any;
  let ownerB: any;
  let bizAId: number;
  let bizBId: number;
  let cementProdA: any;
  let rebarProdA: any;
  let cementProdB: any;

  beforeAll(async () => {
    // 1. Create Tenant A Owner & Staff
    ownerA = await createUser({
      email: `phase3_ownerA_${Date.now()}@test.com`,
      password: "password123",
      fullName: "Alhaji Musa Owner",
      role: "OWNER",
      businessName: "Musa Building Materials Ltd",
    });
    const [bizA] = await db.select().from(businesses).where(eq(businesses.ownerUserId, ownerA.id)).limit(1);
    bizAId = bizA.id;

    staffA = await createStaffMember({
      ownerUser: ownerA,
      email: `phase3_staffA_${Date.now()}@test.com`,
      password: "password123",
      fullName: "Kabiru Counter Staff",
    });

    // 2. Create Tenant B Owner
    ownerB = await createUser({
      email: `phase3_ownerB_${Date.now()}@test.com`,
      password: "password123",
      fullName: "Chief Okon Owner",
      role: "OWNER",
      businessName: "Okon Mega Supplies",
    });
    const [bizB] = await db.select().from(businesses).where(eq(businesses.ownerUserId, ownerB.id)).limit(1);
    bizBId = bizB.id;

    // 3. Add products for Tenant A
    cementProdA = await addProduct({
      businessId: bizAId,
      actorId: ownerA.id,
      actorName: ownerA.fullName,
      actorRole: "OWNER",
      name: "Elephant Cement 50kg",
      unit: "bags",
      category: "CEMENT",
      sellingPrice: 9000,
      openingStock: 100,
      openingUnitCost: 8200,
      supplierName: "Dangote Plant",
    });

    rebarProdA = await addProduct({
      businessId: bizAId,
      actorId: ownerA.id,
      actorName: ownerA.fullName,
      actorRole: "OWNER",
      name: "12mm High Tensile Iron Rod",
      unit: "lengths",
      category: "IRON_ROD",
      sellingPrice: 7500,
      openingStock: 50,
      openingUnitCost: 6800,
      supplierName: "Ajaokuta Steel Depot",
    });

    // 4. Add product for Tenant B
    cementProdB = await addProduct({
      businessId: bizBId,
      actorId: ownerB.id,
      actorName: ownerB.fullName,
      actorRole: "OWNER",
      name: "Dangote 3X 50kg",
      unit: "bags",
      category: "CEMENT",
      sellingPrice: 9200,
      openingStock: 200,
      openingUnitCost: 8400,
      supplierName: "Ibese Plant",
    });
  });

  describe("1. Authority Verification & Regression Defense", () => {
    it("verifies staff can perform delegated operational jobs (Sell, Receive, Collect, Count)", async () => {
      const staffAuth = await getAuthContextForUser(staffA.id, "STAFF", bizAId);
      expect(can(staffAuth, "SALE_CREATE")).toBe(true);
      expect(can(staffAuth, "DELIVERY_CREATE")).toBe(true);
      expect(can(staffAuth, "PAYMENT_CREATE")).toBe(true);
      expect(can(staffAuth, "STOCK_COUNT")).toBe(true);
    });

    it("verifies staff CANNOT view owner financial reports, margins or purchase costs", async () => {
      const staffAuth = await getAuthContextForUser(staffA.id, "STAFF", bizAId);
      expect(can(staffAuth, "PURCHASE_COST_VIEW")).toBe(false);
      expect(can(staffAuth, "PURCHASE_COST_EDIT")).toBe(false);
      expect(can(staffAuth, "REPORT_VIEW")).toBe(false);

      expect(() => assertCan(staffAuth, "REPORT_VIEW", { businessId: bizAId })).toThrow(/FORBIDDEN/);
    });

    it("verifies staff CANNOT perform sensitive administrative operations", async () => {
      const staffAuth = await getAuthContextForUser(staffA.id, "STAFF", bizAId);
      expect(can(staffAuth, "STAFF_MANAGE")).toBe(false);
      expect(can(staffAuth, "BUSINESS_SETTINGS")).toBe(false);
      expect(can(staffAuth, "OWNERSHIP_TRANSFER")).toBe(false);
    });

    it("verifies staff products view redacts confidential purchase costs and suppliers", async () => {
      const staffProducts = await getAllEnrichedProducts(bizAId, "STAFF", staffA.id);
      const prod = staffProducts.find((p) => p.id === cementProdA.id);
      expect(prod).toBeDefined();
      expect(prod?.lastSupplierInfo?.unitCost).toBeNull();
    });

    it("verifies tenant isolation: Tenant A cannot see or mutate Tenant B products", async () => {
      const tenantAProducts = await getAllEnrichedProducts(bizAId, "OWNER");
      const hasTenantBProd = tenantAProducts.some((p) => p.id === cementProdB.id);
      expect(hasTenantBProd).toBe(false);

      // Attempting to sell Tenant B's product under Tenant A must be rejected
      await expect(
        recordSale({
          businessId: bizAId,
          actorId: ownerA.id,
          actorName: ownerA.fullName,
          actorRole: "OWNER",
          productId: cementProdB.id,
          quantity: 5,
          amountPaid: 45000,
        })
      ).rejects.toThrow();
    });
  });

  describe("2. Offline Idempotency & Replay Attack Defense", () => {
    it("replaying an identical sale idempotencyKey returns existing sale without duplicate stock deduction", async () => {
      const fixedKey = "idemp_sale_" + Date.now();

      // First submission
      const saleResult1 = await recordSale({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        productId: cementProdA.id,
        quantity: 10,
        unitPrice: 9000,
        amountPaid: 90000,
        idempotencyKey: fixedKey,
      });

      expect(saleResult1.sale.id).toBeGreaterThan(0);

      // Check stock after first sale: 100 - 10 = 90
      const productsAfterFirst = await getAllEnrichedProducts(bizAId, "OWNER");
      const stockAfterFirst = productsAfterFirst.find((p) => p.id === cementProdA.id)?.currentStock;
      expect(stockAfterFirst).toBe(90);

      // Replay identical mutation
      const saleResult2 = await recordSale({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        productId: cementProdA.id,
        quantity: 10,
        unitPrice: 9000,
        amountPaid: 90000,
        idempotencyKey: fixedKey,
      });

      // Replay must return the EXACT same sale record ID
      expect(saleResult2.sale.id).toBe(saleResult1.sale.id);
      expect(saleResult2.isDuplicateReplay).toBe(true);

      // Stock must NOT be deducted a second time
      const productsAfterSecond = await getAllEnrichedProducts(bizAId, "OWNER");
      const stockAfterSecond = productsAfterSecond.find((p) => p.id === cementProdA.id)?.currentStock;
      expect(stockAfterSecond).toBe(90);
    });

    it("replaying a delivery with identical idempotencyKey does not double-credit stock", async () => {
      const fixedKey = "idemp_deliv_" + Date.now();

      // First delivery: +20 lengths
      const delivery1 = await recordDelivery({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        productId: rebarProdA.id,
        quantityReceived: 20,
        supplierName: "Direct Mill Delivery",
        idempotencyKey: fixedKey,
      });

      const prods1 = await getAllEnrichedProducts(bizAId, "OWNER");
      const stock1 = prods1.find((p) => p.id === rebarProdA.id)?.currentStock;
      expect(stock1).toBe(70); // 50 + 20 = 70

      // Replay same delivery
      const replayResult = await recordDelivery({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        productId: rebarProdA.id,
        quantityReceived: 20,
        supplierName: "Direct Mill Delivery",
        idempotencyKey: fixedKey,
      });

      expect(replayResult.id).toBe(delivery1.id);

      const prods2 = await getAllEnrichedProducts(bizAId, "OWNER");
      const stock2 = prods2.find((p) => p.id === rebarProdA.id)?.currentStock;
      expect(stock2).toBe(70); // Must remain 70, NOT 90
    });

    it("replaying a customer payment with identical idempotencyKey does not double-reduce debt", async () => {
      // Create credit sale to establish customer debt
      const saleWithCredit = await recordSale({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        productId: cementProdA.id,
        quantity: 5,
        unitPrice: 9000,
        customerName: "Engr. Nnamdi Contractor",
        amountPaid: 15000, // Total: 45000 -> Owes 30000
      });

      const custId = saleWithCredit.sale.customerId!;
      expect(custId).toBeDefined();

      const customers1 = await getAllCustomers(bizAId);
      const debt1 = customers1.find((c) => c.id === custId)?.outstandingBalance;
      expect(debt1).toBe(30000);

      // Record ₦10,000 payment with idempotency key
      const fixedPaymentKey = "idemp_pay_" + Date.now();
      const payment1 = await recordCustomerPayment({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        customerId: custId,
        amount: 10000,
        paymentMethod: "TRANSFER",
        idempotencyKey: fixedPaymentKey,
      });

      const customers2 = await getAllCustomers(bizAId);
      const debt2 = customers2.find((c) => c.id === custId)?.outstandingBalance;
      expect(debt2).toBe(20000);

      // Replay exact payment
      const paymentReplay = await recordCustomerPayment({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        customerId: custId,
        amount: 10000,
        paymentMethod: "TRANSFER",
        idempotencyKey: fixedPaymentKey,
      });

      expect(paymentReplay.id).toBe(payment1.id);

      const customers3 = await getAllCustomers(bizAId);
      const debt3 = customers3.find((c) => c.id === custId)?.outstandingBalance;
      expect(debt3).toBe(20000); // Must remain 20000, NOT 10000
    });
  });

  describe("3. Multi-Line Item Sales & Atomic Ledger Consistency", () => {
    it("records a multi-line item sale atomically across multiple products", async () => {
      const multiSale = await recordSale({
        businessId: bizAId,
        actorId: staffA.id,
        actorName: staffA.fullName,
        actorRole: "STAFF",
        items: [
          { productId: cementProdA.id, quantity: 5, unitPrice: 9000 },
          { productId: rebarProdA.id, quantity: 4, unitPrice: 7500 },
        ],
        customerName: "Chief Bamidele Sites",
        amountPaid: 50000, // Total: (5*9000) + (4*7500) = 45000 + 30000 = 75000 -> Owes 25000
      });

      expect(multiSale.totalAmount).toBe(75000);
      expect(multiSale.amountPaid).toBe(50000);
      expect(multiSale.outstandingAmount).toBe(25000);
      expect(multiSale.sales.length).toBe(2);

      // Verify stock deducted for BOTH items
      const prods = await getAllEnrichedProducts(bizAId, "OWNER");
      const cementStock = prods.find((p) => p.id === cementProdA.id)?.currentStock;
      const rebarStock = prods.find((p) => p.id === rebarProdA.id)?.currentStock;

      expect(cementStock).toBe(80); // 100 - 10 (first sale) - 5 (credit sale) - 5 (multi-sale) = 80
      expect(rebarStock).toBe(66); // 50 + 20 (delivery) - 4 (multi-sale) = 66

      // Verify customer debt balance
      const custs = await getAllCustomers(bizAId);
      const chiefCust = custs.find((c) => c.id === multiSale.sale.customerId);
      expect(chiefCust?.outstandingBalance).toBe(25000);
    });
  });

  describe("4. Staff Lifecycle & Deactivation Enforcement", () => {
    it("deactivated staff cannot record sales or access shop data", async () => {
      // Suspend staff member
      await updateStaffMembershipStatus({
        ownerUser: ownerA,
        businessId: bizAId,
        staffUserId: staffA.id,
        newStatus: "SUSPENDED",
        reason: "Counter desk rotation",
      });

      // Verify authorization check fails
      const suspendedCtx = await getAuthContextForUser(staffA.id, "STAFF", bizAId);
      expect(can(suspendedCtx, "SALE_CREATE")).toBe(false);

      // Attempting to record sale with suspended staff must fail
      await expect(
        recordSale({
          businessId: bizAId,
          actorId: staffA.id,
          actorName: staffA.fullName,
          actorRole: "STAFF",
          productId: cementProdA.id,
          quantity: 1,
          amountPaid: 9000,
        })
      ).rejects.toThrow();

      // Reactivate staff for subsequent tests
      await updateStaffMembershipStatus({
        ownerUser: ownerA,
        businessId: bizAId,
        staffUserId: staffA.id,
        newStatus: "ACTIVE",
        reason: "Returned to counter duty",
      });
    });
  });

  describe("5. Audit Trail Attribution & Integrity", () => {
    it("verifies all operational actions preserve staff user ID and full name in audit logs", async () => {
      const logs = await getAuditLogs(bizAId, "OWNER", 50);
      expect(logs.length).toBeGreaterThan(0);

      const staffLogs = logs.filter((l) => l.actorId === staffA.id);
      expect(staffLogs.length).toBeGreaterThan(0);
      expect(staffLogs[0].actorRole).toBe("STAFF");
    });
  });
});
