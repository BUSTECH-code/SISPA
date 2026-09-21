import { describe, it, expect } from "vitest";
import {
  calculateDaysRemaining,
  calculateAttentionStatus,
  calculateSuggestedPurchaseQuantity,
  calculateStockIntelligence,
  calculateVelocity,
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
});
