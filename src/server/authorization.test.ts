import { describe, it, expect } from "vitest";
import {
  can,
  assertCan,
  redactSensitiveDataForStaff,
  type AuthContext,
} from "./authorization";

describe("Capability-Based Authorization & Sensitivity Engine", () => {
  const activeOwnerContext: AuthContext = {
    user: {
      id: 1,
      email: "owner@distributor.com",
      fullName: "Chief Musa",
      phone: "+2348000000001",
    },
    business: {
      id: 10,
      name: "Musa Building Supplies",
      state: "ACTIVE",
      currency: "NGN",
      subscriptionPlan: "STANDARD",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      currentPeriodEnd: null,
    },
    membership: {
      id: 101,
      role: "OWNER",
      status: "ACTIVE",
      customCapabilities: [],
    },
  };

  const activeStaffContext: AuthContext = {
    user: {
      id: 2,
      email: "staff@distributor.com",
      fullName: "Aliyu Operator",
      phone: "+2348000000002",
    },
    business: {
      id: 10,
      name: "Musa Building Supplies",
      state: "ACTIVE",
      currency: "NGN",
      subscriptionPlan: "STANDARD",
      subscriptionStatus: "ACTIVE",
      trialEndsAt: null,
      currentPeriodEnd: null,
    },
    membership: {
      id: 102,
      role: "STAFF",
      status: "ACTIVE",
      customCapabilities: [],
    },
  };

  const suspendedStaffContext: AuthContext = {
    ...activeStaffContext,
    membership: {
      ...activeStaffContext.membership,
      status: "SUSPENDED",
    },
  };

  it("permits Owner to access sensitive costs, exports, and staff management", () => {
    expect(can(activeOwnerContext, "PURCHASE_COST_VIEW")).toBe(true);
    expect(can(activeOwnerContext, "EXPORT_DATA")).toBe(true);
    expect(can(activeOwnerContext, "STAFF_MANAGE")).toBe(true);
    expect(can(activeOwnerContext, "OWNERSHIP_TRANSFER")).toBe(true);
    expect(can(activeOwnerContext, "REPORT_VIEW")).toBe(true);
    expect(() => assertCan(activeOwnerContext, "PURCHASE_COST_VIEW")).not.toThrow();
  });

  it("strictly forbids Staff from accessing sensitive purchase costs or business export", () => {
    expect(can(activeStaffContext, "PURCHASE_COST_VIEW")).toBe(false);
    expect(can(activeStaffContext, "EXPORT_DATA")).toBe(false);
    expect(can(activeStaffContext, "STAFF_MANAGE")).toBe(false);
    expect(can(activeStaffContext, "OWNERSHIP_TRANSFER")).toBe(false);
    expect(() => assertCan(activeStaffContext, "PURCHASE_COST_VIEW")).toThrow("FORBIDDEN_PURCHASE_COST_VIEW");
    expect(() => assertCan(activeStaffContext, "EXPORT_DATA")).toThrow("FORBIDDEN_EXPORT_DATA");
  });

  it("strictly denies all actions when membership status is SUSPENDED", () => {
    expect(can(suspendedStaffContext, "SALE_CREATE")).toBe(false);
    expect(can(suspendedStaffContext, "DELIVERY_CREATE")).toBe(false);
    expect(() => assertCan(suspendedStaffContext, "SALE_CREATE")).toThrow("STAFF_SUSPENDED");
  });

  it("allows operational Staff to perform sales, deliveries, payments, and stock counts", () => {
    expect(can(activeStaffContext, "SALE_CREATE")).toBe(true);
    expect(can(activeStaffContext, "DELIVERY_CREATE")).toBe(true);
    expect(can(activeStaffContext, "PAYMENT_CREATE")).toBe(true);
    expect(can(activeStaffContext, "STOCK_COUNT")).toBe(true);
    expect(() => assertCan(activeStaffContext, "SALE_CREATE")).not.toThrow();
    expect(() => assertCan(activeStaffContext, "DELIVERY_CREATE")).not.toThrow();
    expect(() => assertCan(activeStaffContext, "PAYMENT_CREATE")).not.toThrow();
    expect(() => assertCan(activeStaffContext, "STOCK_COUNT")).not.toThrow();
  });

  it("permits delegated capabilities such as CAN_CHANGE_PRICE when configured", () => {
    const staffWithPriceCapability: AuthContext = {
      ...activeStaffContext,
      membership: {
        ...activeStaffContext.membership,
        customCapabilities: ["CAN_CHANGE_PRICE"] as any,
      },
    };

    expect(can(staffWithPriceCapability, "SELLING_PRICE_CHANGE")).toBe(true);
    expect(() => assertCan(staffWithPriceCapability, "SELLING_PRICE_CHANGE")).not.toThrow();
    // But sensitive owner data remains restricted
    expect(can(staffWithPriceCapability, "PURCHASE_COST_VIEW")).toBe(false);
  });

  it("redactSensitiveDataForStaff thoroughly strips purchase costs and margins for staff", () => {
    const sensitiveProduct = {
      id: 1,
      name: "Dangote 3X Cement",
      unitCost: 8500,
      openingUnitCost: 8400,
      estimatedProfit: 120000,
      sellingPrice: 9500,
    };

    const redacted = redactSensitiveDataForStaff(sensitiveProduct, activeStaffContext);
    expect(redacted.unitCost).toBeNull();
    expect(redacted.openingUnitCost).toBeNull();
    expect(redacted.estimatedProfit).toBeNull();
    expect(redacted.sellingPrice).toBe(9500);

    // Owner receives unaltered data
    const ownerData = redactSensitiveDataForStaff(sensitiveProduct, activeOwnerContext);
    expect(ownerData.unitCost).toBe(8500);
    expect(ownerData.estimatedProfit).toBe(120000);
  });
});
