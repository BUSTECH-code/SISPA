import { describe, it, expect } from "vitest";
import { calculateCustomerDebt, calculatePeriodSummary } from "./debt";

describe("SISPA Domain Debt, Financial & 'What Changed?' Calculations", () => {
  it("accurately calculates customer outstanding debt from credit sales and payments", () => {
    // Customer took 150,000 credit, paid 100,000
    const result = calculateCustomerDebt({
      creditSalesAmount: 150000,
      paymentsReceivedAmount: 100000,
    });
    expect(result.outstandingBalance).toBe(50000);
    expect(result.isOverdue).toBe(true);

    // Customer fully settled
    const settled = calculateCustomerDebt({
      creditSalesAmount: 150000,
      paymentsReceivedAmount: 150000,
    });
    expect(settled.outstandingBalance).toBe(0);
    expect(settled.isOverdue).toBe(false);
  });

  it("calculates weekly business report metrics and meaningful 'What Changed?' comparison against prior period", () => {
    const periodStart = new Date("2026-09-08T00:00:00Z");
    const periodEnd = new Date("2026-09-14T23:59:59Z");

    const sales = [
      { totalAmount: 120000, amountPaid: 100000, outstandingAmount: 20000, quantity: 12, productId: 1, createdAt: new Date("2026-09-09") },
      { totalAmount: 100000, amountPaid: 40000, outstandingAmount: 60000, quantity: 15, productId: 2, createdAt: new Date("2026-09-10") },
    ];

    const payments = [
      { amount: 50000, paymentDate: new Date("2026-09-11") },
    ];

    const expenses = [
      { amount: 20000, createdAt: new Date("2026-09-10") },
    ];

    const deliveries = [
      { productId: 1, quantityDelta: 50, unitCost: 8000, createdAt: new Date("2026-09-09") },
    ];

    const productCosts = new Map<number, number>([
      [1, 7500],
      [2, 5000],
    ]);

    const priorPeriodMetrics = {
      totalSalesValue: 180000,
      cashCollected: 160000,
      debtRecovered: 30000,
      operatingExpenses: 15000,
    };

    const summary = calculatePeriodSummary({
      sales,
      payments,
      expenses,
      deliveries,
      productCosts,
      adjustmentsCount: 1,
      lowStockCount: 2,
      lastStockCheckDate: new Date("2026-09-05"),
      periodStart,
      periodEnd,
      priorTotalDebt: 40000,
      priorPeriodMetrics,
    });

    // Total sales = 120k + 100k = 220k
    expect(summary.totalSalesValue).toBe(220000);
    // Cash from sales = 100k + 40k = 140k
    // Total cash collected = 140k + 50k debt recovered = 190k
    expect(summary.cashCollected).toBe(190000);

    // Verify "What Changed?" comparison statements
    expect(summary.comparison).toBeDefined();
    expect(summary.comparison?.hasPriorData).toBe(true);
    // Sales difference: 220,000 - 180,000 = +40,000
    expect(summary.comparison?.salesDifference).toBe(40000);
    // Cash difference: 190,000 - 160,000 = +30,000
    expect(summary.comparison?.cashDifference).toBe(30000);
    // Debt recovered difference: 50,000 - 30,000 = +20,000
    expect(summary.comparison?.debtRecoveredDifference).toBe(20000);
    expect(summary.comparison?.summaryStatements.length).toBeGreaterThan(0);
    expect(summary.comparison?.summaryStatements[0]).toContain("Sales were ₦40,000 higher");
  });
});
