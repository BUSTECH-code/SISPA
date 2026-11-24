import { describe, it, expect } from "vitest";
import {
  calculateDaysRemaining,
  calculateAttentionStatus,
  calculateSuggestedPurchaseQuantity,
  calculateStockIntelligence,
  calculateVelocity,
  formatDaysRemainingDisplay,
} from "./intelligence";

describe("SISPA 1.0 Domain Intelligence - Approved Test Cases", () => {
  // Case 1: Stock = 84, Velocity = 12, Coverage = 7 -> Days = 7, Status = RUNNING_LOW, Suggested = 0
  it("Case 1: Stock = 84, Velocity = 12, Coverage = 7", () => {
    const res = calculateStockIntelligence({
      currentStock: 84,
      velocity: 12,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.daysRemaining).toBe(7);
    expect(res.status).toBe("RUNNING_LOW");
    expect(res.suggestedPurchaseQuantity).toBe(0);
  });

  // Case 2: Stock = 30, Velocity = 12, Coverage = 7 -> Target = 84, Days = 2.5, Status = RUNNING_LOW, Suggested = 54
  it("Case 2: Stock = 30, Velocity = 12, Coverage = 7", () => {
    const res = calculateStockIntelligence({
      currentStock: 30,
      velocity: 12,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.targetStock).toBe(84);
    expect(res.daysRemaining).toBe(2.5);
    expect(res.status).toBe("RUNNING_LOW");
    expect(res.suggestedPurchaseQuantity).toBe(54);
  });

  // Case 3: Velocity = null, Stock = 10, Minimum = 50 -> Status = RUNNING_LOW, Suggested = 40
  it("Case 3: Velocity = null, Stock = 10, Minimum = 50", () => {
    const res = calculateStockIntelligence({
      currentStock: 10,
      velocity: null,
      desiredCoverageDays: 7,
      minimumStockThreshold: 50,
    });
    expect(res.status).toBe("RUNNING_LOW");
    expect(res.suggestedPurchaseQuantity).toBe(40);
  });

  // Case 4: Velocity = null, Stock = 100, Minimum = 50 -> Status = OK, Suggested = 0
  it("Case 4: Velocity = null, Stock = 100, Minimum = 50", () => {
    const res = calculateStockIntelligence({
      currentStock: 100,
      velocity: null,
      desiredCoverageDays: 7,
      minimumStockThreshold: 50,
    });
    expect(res.status).toBe("OK");
    expect(res.suggestedPurchaseQuantity).toBe(0);
  });

  // Case 5: Velocity = null, Stock = 100, No minimum -> Status = NO_DATA, Suggested = 0
  it("Case 5: Velocity = null, Stock = 100, No minimum", () => {
    const res = calculateStockIntelligence({
      currentStock: 100,
      velocity: null,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.status).toBe("NO_DATA");
    expect(res.suggestedPurchaseQuantity).toBe(0);
  });

  // Case 6: Velocity = 0, Stock = 100 -> Days = Infinity, Status = OK, Suggested = 0
  it("Case 6: Velocity = 0, Stock = 100", () => {
    const res = calculateStockIntelligence({
      currentStock: 100,
      velocity: 0,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.daysRemaining).toBe(Infinity);
    expect(res.status).toBe("OK");
    expect(res.suggestedPurchaseQuantity).toBe(0);
  });

  // Case 7: Stock = 0, Velocity = 0 -> Status = RUNNING_LOW
  it("Case 7: Stock = 0, Velocity = 0", () => {
    const res = calculateStockIntelligence({
      currentStock: 0,
      velocity: 0,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.status).toBe("RUNNING_LOW");
  });

  // Case 8: Stock = -20, Velocity = 10, Coverage = 7 -> Status = RUNNING_LOW, Effective stock = 0, Suggested = 70
  it("Case 8: Stock = -20, Velocity = 10, Coverage = 7", () => {
    const res = calculateStockIntelligence({
      currentStock: -20,
      velocity: 10,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.status).toBe("RUNNING_LOW");
    expect(res.effectiveStock).toBe(0);
    expect(res.suggestedPurchaseQuantity).toBe(70);
  });

  // Case 9: Stock = 80, Velocity = 10, Coverage = 7 -> Target = 70, Suggested = 0
  it("Case 9: Stock = 80, Velocity = 10, Coverage = 7", () => {
    const res = calculateStockIntelligence({
      currentStock: 80,
      velocity: 10,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.targetStock).toBe(70);
    expect(res.suggestedPurchaseQuantity).toBe(0);
  });

  // Case 10: Stock = 80, Velocity = 12.5, Coverage = 7 -> Target = 87.5, Suggested = 8 (ceiling)
  it("Case 10: Stock = 80, Velocity = 12.5, Coverage = 7", () => {
    const res = calculateStockIntelligence({
      currentStock: 80,
      velocity: 12.5,
      desiredCoverageDays: 7,
      minimumStockThreshold: null,
    });
    expect(res.targetStock).toBe(87.5);
    expect(res.suggestedPurchaseQuantity).toBe(8);
  });

  // Velocity Calculation and 7 calendar days rule
  describe("Velocity Calculation Engine", () => {
    const now = new Date("2025-05-15T12:00:00Z");

    it("returns null if usable history is less than 7 calendar days", () => {
      const productCreatedAt = new Date("2025-05-10T12:00:00Z"); // 5 days ago
      const sales = [
        { quantity: 20, date: new Date("2025-05-12T10:00:00Z") },
        { quantity: 15, date: new Date("2025-05-14T10:00:00Z") },
      ];
      const velocity = calculateVelocity({
        sales,
        productCreatedAt,
        now,
      });
      expect(velocity).toBeNull();
    });

    it("calculates velocity when >= 7 calendar days of history exist", () => {
      const productCreatedAt = new Date("2025-05-01T12:00:00Z"); // 14 days ago
      // Sold 70 bags over 14 days = 5 bags/day
      const sales = [
        { quantity: 30, date: new Date("2025-05-05T10:00:00Z") },
        { quantity: 40, date: new Date("2025-05-10T10:00:00Z") },
      ];
      const velocity = calculateVelocity({
        sales,
        productCreatedAt,
        now,
      });
      expect(velocity).toBe(5);
    });

    it("respects manual daily sales override even with 0 history", () => {
      const productCreatedAt = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
      const velocity = calculateVelocity({
        sales: [],
        productCreatedAt,
        manualDailySalesOverride: 15,
        now,
      });
      expect(velocity).toBe(15);
    });

    it("handles zero sales over 10 days as velocity = 0", () => {
      const productCreatedAt = new Date("2025-05-05T12:00:00Z"); // 10 days ago
      const velocity = calculateVelocity({
        sales: [],
        productCreatedAt,
        now,
      });
      expect(velocity).toBe(0);
    });
  });

  describe("Days of Stock Remaining Domain Formatting", () => {
    it("classifies negative stock as DISCREPANCY with 'Stock discrepancy'", () => {
      const res = formatDaysRemainingDisplay(-5, 2, -2.5);
      expect(res).toEqual({ tier: "DISCREPANCY", text: "Stock discrepancy", days: null });
    });

    it("classifies zero stock as OUT_OF_STOCK with 'Out of stock'", () => {
      const res = formatDaysRemainingDisplay(0, 5, 0);
      expect(res).toEqual({ tier: "OUT_OF_STOCK", text: "Out of stock", days: 0 });
    });

    it("classifies null velocity as NO_ESTIMATE with 'No estimate'", () => {
      const res = formatDaysRemainingDisplay(50, null, null);
      expect(res).toEqual({ tier: "NO_ESTIMATE", text: "No estimate", days: null });
    });

    it("classifies zero velocity with positive stock as NO_SALES with 'No recent sales'", () => {
      const res = formatDaysRemainingDisplay(50, 0, Infinity);
      expect(res).toEqual({ tier: "NO_SALES", text: "No recent sales", days: Infinity });
    });

    it("classifies days < 1 as CRITICAL with 'Less than 1 day'", () => {
      const res = formatDaysRemainingDisplay(3, 5, 0.6);
      expect(res).toEqual({ tier: "CRITICAL", text: "Less than 1 day", days: 0.6 });
    });

    it("classifies 1 <= days <= 3 as CRITICAL with 'Critical — X days' without rounding up", () => {
      // Fractional estimate formatted to 1 decimal place
      const res1 = formatDaysRemainingDisplay(10, 4, 2.58);
      expect(res1).toEqual({ tier: "CRITICAL", text: "Critical — 2.5 days", days: 2.5 });

      // Whole number 1 omits decimal and uses singular 'day'
      const res2 = formatDaysRemainingDisplay(10, 10, 1.0);
      expect(res2).toEqual({ tier: "CRITICAL", text: "Critical — 1 day", days: 1 });

      // Whole number 3 omits decimal
      const res3 = formatDaysRemainingDisplay(30, 10, 3.0);
      expect(res3).toEqual({ tier: "CRITICAL", text: "Critical — 3 days", days: 3 });
    });

    it("classifies 3 < days <= 7 as LOW and uses unrounded value for tier classification", () => {
      // 3.01 is strictly > 3 so tier is LOW; fractional part is formatted to 1 decimal without upward rounding -> 3.0
      const resBoundary = formatDaysRemainingDisplay(30.1, 10, 3.01);
      expect(resBoundary).toEqual({ tier: "LOW", text: "Low — 3.0 days", days: 3.0 });

      // Whole number 5 omits decimal
      const resWhole = formatDaysRemainingDisplay(25, 5, 5.0);
      expect(resWhole).toEqual({ tier: "LOW", text: "Low — 5 days", days: 5 });

      // Fractional 4.49 truncates to 4.4 without rounding up
      const resFraction = formatDaysRemainingDisplay(22, 5, 4.49);
      expect(resFraction).toEqual({ tier: "LOW", text: "Low — 4.4 days", days: 4.4 });
    });

    it("classifies days > 7 as NORMAL with 'X days remaining'", () => {
      // Whole number 10 omits decimal
      const res1 = formatDaysRemainingDisplay(100, 10, 10.0);
      expect(res1).toEqual({ tier: "NORMAL", text: "10 days remaining", days: 10 });

      // Fractional 14.42 truncates to 14.4
      const res2 = formatDaysRemainingDisplay(75, 5.2, 14.42);
      expect(res2).toEqual({ tier: "NORMAL", text: "14.4 days remaining", days: 14.4 });

      // Fractional 7.05 truncates to 7.0
      const res3 = formatDaysRemainingDisplay(70.5, 10, 7.05);
      expect(res3).toEqual({ tier: "NORMAL", text: "7.0 days remaining", days: 7.0 });
    });

    it("safely handles invalid, NaN, or non-finite numbers without emitting 'NaN'", () => {
      expect(formatDaysRemainingDisplay(NaN, 5, NaN)).toEqual({ tier: "DISCREPANCY", text: "Stock discrepancy", days: null });
      expect(formatDaysRemainingDisplay(10, NaN as any, NaN)).toEqual({ tier: "NO_ESTIMATE", text: "No estimate", days: null });
      expect(formatDaysRemainingDisplay(10, 5, NaN)).toEqual({ tier: "NO_ESTIMATE", text: "No estimate", days: null });
    });
  });

  describe("Task 2: Verification States and Buying Intelligence Integration", () => {
    it("UNVERIFIED products do not trigger automatic BUY NOW for positive, zero, or negative stock", () => {
      const resPositive = calculateStockIntelligence({
        currentStock: 3,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "UNVERIFIED",
      });
      expect(resPositive.status).toBe("NO_DATA");
      expect(resPositive.statusLabel).toBe("UNVERIFIED");
      expect(resPositive.reorderUrgent).toBe(false);
      expect(resPositive.suggestedPurchaseQuantity).toBe(0);
      expect(resPositive.displayNotice).toBe("Stock unverified");

      const resZero = calculateStockIntelligence({
        currentStock: 0,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "UNVERIFIED",
      });
      expect(resZero.status).toBe("NO_DATA");
      expect(resZero.statusLabel).toBe("UNVERIFIED");
      expect(resZero.reorderUrgent).toBe(false);
      expect(resZero.suggestedPurchaseQuantity).toBe(0);
      expect(resZero.displayNotice).toBe("Stock unverified");
      expect(resZero.explanation).toContain("Physical stock has not been verified yet");

      const resNegative = calculateStockIntelligence({
        currentStock: -4,
        velocity: 2,
        desiredCoverageDays: 7,
        minimumStockThreshold: null,
        verificationStatus: "UNVERIFIED",
      });
      expect(resNegative.status).toBe("NO_DATA");
      expect(resNegative.statusLabel).toBe("UNVERIFIED");
      expect(resNegative.reorderUrgent).toBe(false);
      expect(resNegative.suggestedPurchaseQuantity).toBe(0);
      expect(resNegative.displayNotice).toBe("Stock unverified");
    });

    it("VERIFIED products retain distinction between last verified physical quantity and current ledger balance", () => {
      const verifyDate = new Date("2026-11-01T10:00:00Z");
      const res = calculateStockIntelligence({
        currentStock: 38,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "VERIFIED",
        lastVerifiedQuantity: 45,
        lastVerifiedAt: verifyDate,
      });

      expect(res.verificationStatus).toBe("VERIFIED");
      expect(res.lastVerifiedQuantity).toBe(45);
      expect(res.currentStock).toBe(38);
      expect(res.lastVerifiedAt).toEqual(verifyDate);
      expect(res.verificationNotice).toBeDefined();
      expect(res.verificationNotice).toContain("45");
      expect(res.verificationNotice).toContain("38");
    });

    it("VERIFIED products trigger BUY NOW for zero and negative stock", () => {
      const resZero = calculateStockIntelligence({
        currentStock: 0,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "VERIFIED",
        lastVerifiedQuantity: 0,
        lastVerifiedAt: new Date("2026-11-01T10:00:00Z"),
      });

      expect(resZero.status).toBe("RUNNING_LOW");
      expect(resZero.statusLabel).toBe("BUY NOW");
      expect(resZero.reorderUrgent).toBe(true);
      expect(resZero.suggestedPurchaseQuantity).toBe(35);

      const resNegative = calculateStockIntelligence({
        currentStock: -3,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "VERIFIED",
        lastVerifiedQuantity: 10,
        lastVerifiedAt: new Date("2026-11-01T10:00:00Z"),
      });

      expect(resNegative.status).toBe("RUNNING_LOW");
      expect(resNegative.statusLabel).toBe("BUY NOW");
      expect(resNegative.reorderUrgent).toBe(true);
      expect(resNegative.effectiveStock).toBe(0);
      expect(resNegative.suggestedPurchaseQuantity).toBe(35);
    });

    it("NEEDS_RECOUNT retains active buying intelligence with explicit provisional recount warning across low, zero, negative, and check-soon stock", () => {
      const verifyDate = new Date("2026-10-01T10:00:00Z");

      // Running low
      const resLow = calculateStockIntelligence({
        currentStock: 5,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "NEEDS_RECOUNT",
        lastVerifiedQuantity: 50,
        lastVerifiedAt: verifyDate,
      });
      expect(resLow.verificationStatus).toBe("NEEDS_RECOUNT");
      expect(resLow.status).toBe("RUNNING_LOW");
      expect(resLow.statusLabel).toBe("BUY NOW");
      expect(resLow.reorderUrgent).toBe(true);
      expect(resLow.suggestedPurchaseQuantity).toBe(30);
      expect(resLow.displayNotice).toBe("Recount needed");
      expect(resLow.explanation).toContain("Provisional");
      expect(resLow.explanation).toContain("recount advised");
      expect(resLow.verificationNotice).toContain("Recount pending");

      // Zero stock
      const resZero = calculateStockIntelligence({
        currentStock: 0,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "NEEDS_RECOUNT",
        lastVerifiedQuantity: 50,
        lastVerifiedAt: verifyDate,
      });
      expect(resZero.status).toBe("RUNNING_LOW");
      expect(resZero.statusLabel).toBe("BUY NOW");
      expect(resZero.reorderUrgent).toBe(true);
      expect(resZero.suggestedPurchaseQuantity).toBe(35);
      expect(resZero.displayNotice).toBe("Recount needed");
      expect(resZero.explanation).toContain("completely out of stock");
      expect(resZero.explanation).toContain("Provisional");

      // Negative stock
      const resNegative = calculateStockIntelligence({
        currentStock: -2,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "NEEDS_RECOUNT",
        lastVerifiedQuantity: 50,
        lastVerifiedAt: verifyDate,
      });
      expect(resNegative.status).toBe("RUNNING_LOW");
      expect(resNegative.statusLabel).toBe("BUY NOW");
      expect(resNegative.reorderUrgent).toBe(true);
      expect(resNegative.suggestedPurchaseQuantity).toBe(35);
      expect(resNegative.displayNotice).toBe("Recount needed");
      expect(resNegative.explanation).toContain("below zero");
      expect(resNegative.explanation).toContain("Provisional");

      // Check soon
      const resSoon = calculateStockIntelligence({
        currentStock: 50,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: 10,
        verificationStatus: "NEEDS_RECOUNT",
        lastVerifiedQuantity: 80,
        lastVerifiedAt: verifyDate,
      });
      expect(resSoon.status).toBe("CHECK_SOON");
      expect(resSoon.statusLabel).toBe("BUY SOON");
      expect(resSoon.reorderUrgent).toBe(false);
      expect(resSoon.displayNotice).toBe("Recount needed");
      expect(resSoon.explanation).toContain("Provisional");
    });

    it("preserves backward compatibility when verificationStatus is omitted (defaults to VERIFIED)", () => {
      const res = calculateStockIntelligence({
        currentStock: 0,
        velocity: 5,
        desiredCoverageDays: 7,
        minimumStockThreshold: null,
      });
      expect(res.verificationStatus).toBe("VERIFIED");
      expect(res.status).toBe("RUNNING_LOW");
      expect(res.statusLabel).toBe("BUY NOW");
      expect(res.reorderUrgent).toBe(true);
    });
  });
});


