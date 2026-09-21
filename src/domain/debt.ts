/**
 * SISPA Domain - Debt, Financial & Profit Calculations
 * Deterministic and pure functions for:
 * - Sales and money collected
 * - Customer debt and recovery
 * - Cost of goods sold (COGS) traceability
 * - Operating expenses
 * - Transparent "Why?" profit breakdown with honest confidence warnings
 * - "What Changed?" period comparisons against previous periods
 */

export interface CustomerDebtSummary {
  customerId: number;
  customerName: string;
  totalCreditSales: number;
  totalPaid: number;
  outstandingBalance: number;
  lastPaymentDate: Date | null;
  lastSaleDate: Date | null;
  status: "CURRENT" | "OVERDUE" | "SETTLED";
}

export interface BusinessPeriodMetrics {
  periodStart: Date;
  periodEnd: Date;
  
  // Sales & Collections
  totalSalesValue: number;
  salesCount: number;
  cashCollected: number; // Immediate cash from sales + customer debt payments
  cashSalesValue: number; // Sales paid in cash/immediate funds
  creditSalesValue: number;

  // Debt & Collections (Collect Job)
  openingDebt: number;
  newCreditIssued: number;
  debtRecovered: number; // Customer payments towards debt
  closingDebt: number;
  overdueDebt: number;

  // Expenses & Buying
  totalDeliveriesReceived: number;
  restockExpenditure: number; // Money spent purchasing stock
  operatingExpenses: number; // Shop running costs (transport, generator, maintenance)
  totalMoneySpent: number; // Restock + Expenses

  // Profitability & "Why?" Explanation
  costOfGoodsSold: number;
  isProfitReliable: boolean;
  profitConfidenceWarning?: string;
  estimatedProfit: number | null; // Sales - COGS - Expenses
  profitBreakdown: {
    sales: number;
    costOfGoods: number;
    expenses: number;
    netProfit: number;
  } | null;

  // Stock health & check
  lowStockItemsCount: number;
  adjustmentsCount: number;
  daysSinceLastCount?: number;
  stockCheckWarning?: string;

  // Meaningful "What Changed?" period comparisons against prior period
  comparison?: {
    hasPriorData: boolean;
    salesDifference: number; // totalSalesValue - priorSalesValue
    cashDifference: number; // cashCollected - priorCashCollected
    debtRecoveredDifference: number;
    expensesDifference: number;
    summaryStatements: string[];
  };
}

/**
 * Deterministically compute debt balance for a customer.
 */
export function calculateCustomerDebt(params: {
  creditSalesAmount: number;
  paymentsReceivedAmount: number;
}): {
  outstandingBalance: number;
  isOverdue: boolean;
} {
  const { creditSalesAmount, paymentsReceivedAmount } = params;
  const balance = Math.max(0, creditSalesAmount - paymentsReceivedAmount);
  return {
    outstandingBalance: Math.round(balance * 100) / 100,
    isOverdue: balance > 0,
  };
}

/**
 * Calculate weekly/monthly period financial, debt recovery, profit metrics,
 * and meaningful "What Changed?" comparisons.
 */
export function calculatePeriodSummary(params: {
  sales: Array<{
    totalAmount: number;
    amountPaid: number;
    outstandingAmount: number;
    quantity?: number;
    productId?: number;
    createdAt: Date;
  }>;
  payments: Array<{
    amount: number;
    paymentDate: Date;
  }>;
  expenses?: Array<{
    amount: number;
    createdAt: Date;
  }>;
  deliveries: Array<{
    productId?: number;
    quantityDelta: number;
    unitCost: number | null;
    createdAt: Date;
  }>;
  productCosts?: Map<number, number>; // Known unit purchase cost for each product
  adjustmentsCount: number;
  lowStockCount: number;
  lastStockCheckDate?: Date | null;
  periodStart: Date;
  periodEnd: Date;
  priorTotalDebt: number;
  priorPeriodMetrics?: {
    totalSalesValue: number;
    cashCollected: number;
    debtRecovered: number;
    operatingExpenses: number;
  } | null;
}): BusinessPeriodMetrics {
  const {
    sales,
    payments,
    expenses = [],
    deliveries,
    productCosts = new Map(),
    adjustmentsCount,
    lowStockCount,
    lastStockCheckDate,
    periodStart,
    periodEnd,
    priorTotalDebt,
    priorPeriodMetrics,
  } = params;

  let totalSalesValue = 0;
  let cashSalesValue = 0;
  let creditSalesValue = 0;
  let salesCount = sales.length;

  // Track COGS
  let costOfGoodsSold = 0;
  let salesWithMissingCostCount = 0;

  for (const s of sales) {
    totalSalesValue += s.totalAmount;
    cashSalesValue += s.amountPaid;
    creditSalesValue += s.outstandingAmount;

    // Look up purchase cost for this product if known
    if (s.productId !== undefined && s.quantity !== undefined) {
      const unitCost = productCosts.get(s.productId);
      if (unitCost !== undefined && unitCost > 0) {
        costOfGoodsSold += s.quantity * unitCost;
      } else {
        salesWithMissingCostCount++;
      }
    } else {
      salesWithMissingCostCount++;
    }
  }

  // Debt payments recovered during this period
  const debtRecovered = payments.reduce((sum, p) => sum + p.amount, 0);

  // Total cash money collected (sales cash + debt recovered)
  const cashCollected = cashSalesValue + debtRecovered;

  // New credit issued during this period
  const newCreditIssued = creditSalesValue;

  // Closing debt = Prior debt + New credit - Recovered payments
  const closingDebt = Math.max(0, priorTotalDebt + newCreditIssued - debtRecovered);

  // Operating expenses
  const operatingExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Deliveries expenditure (money spent buying stock)
  let restockExpenditure = 0;
  for (const d of deliveries) {
    if (d.unitCost !== null && d.unitCost > 0) {
      restockExpenditure += d.quantityDelta * d.unitCost;
    }
  }

  const totalMoneySpent = restockExpenditure + operatingExpenses;

  // Data confidence for profit
  const isProfitReliable = salesCount === 0 || (salesWithMissingCostCount === 0 && productCosts.size > 0);
  let profitConfidenceWarning: string | undefined;
  let estimatedProfit: number | null = null;
  let profitBreakdown = null;

  if (salesCount > 0 && (!isProfitReliable || costOfGoodsSold === 0)) {
    profitConfidenceWarning = "Profit cannot be fully calculated yet because some purchase costs are missing. Record delivery purchase prices to unlock complete profit tracking.";
  } else if (salesCount > 0) {
    const net = totalSalesValue - costOfGoodsSold - operatingExpenses;
    estimatedProfit = Math.round(net * 100) / 100;
    profitBreakdown = {
      sales: Math.round(totalSalesValue * 100) / 100,
      costOfGoods: Math.round(costOfGoodsSold * 100) / 100,
      expenses: Math.round(operatingExpenses * 100) / 100,
      netProfit: estimatedProfit,
    };
  }

  // Stock check recency warning
  let daysSinceLastCount: number | undefined;
  let stockCheckWarning: string | undefined;
  if (lastStockCheckDate) {
    daysSinceLastCount = Math.floor(
      (periodEnd.getTime() - lastStockCheckDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysSinceLastCount > 14) {
      stockCheckWarning = `Stock may need checking. Last physical count was ${daysSinceLastCount} days ago.`;
    }
  } else {
    stockCheckWarning = "Stock has not been physically counted recently.";
  }

  // Meaningful "What Changed?" comparison statements
  let comparison: BusinessPeriodMetrics["comparison"];
  if (priorPeriodMetrics) {
    const salesDiff = Math.round((totalSalesValue - priorPeriodMetrics.totalSalesValue) * 100) / 100;
    const cashDiff = Math.round((cashCollected - priorPeriodMetrics.cashCollected) * 100) / 100;
    const debtDiff = Math.round((debtRecovered - priorPeriodMetrics.debtRecovered) * 100) / 100;
    const expDiff = Math.round((operatingExpenses - priorPeriodMetrics.operatingExpenses) * 100) / 100;

    const statements: string[] = [];
    if (salesDiff !== 0) {
      statements.push(
        salesDiff > 0
          ? `Sales were ₦${Math.abs(salesDiff).toLocaleString()} higher than last period.`
          : `Sales were ₦${Math.abs(salesDiff).toLocaleString()} lower than last period.`
      );
    }
    if (cashDiff !== 0) {
      statements.push(
        cashDiff > 0
          ? `Money collected was ₦${Math.abs(cashDiff).toLocaleString()} higher than last period.`
          : `Money collected was ₦${Math.abs(cashDiff).toLocaleString()} lower than last period.`
      );
    }
    if (debtDiff !== 0) {
      statements.push(
        debtDiff > 0
          ? `Customer debt recovery improved by ₦${Math.abs(debtDiff).toLocaleString()}.`
          : `Customer debt recovery was ₦${Math.abs(debtDiff).toLocaleString()} less than last period.`
      );
    }
    if (expDiff !== 0) {
      statements.push(
        expDiff > 0
          ? `Shop operating expenses increased by ₦${Math.abs(expDiff).toLocaleString()}.`
          : `Shop operating expenses decreased by ₦${Math.abs(expDiff).toLocaleString()}.`
      );
    }

    comparison = {
      hasPriorData: true,
      salesDifference: salesDiff,
      cashDifference: cashDiff,
      debtRecoveredDifference: debtDiff,
      expensesDifference: expDiff,
      summaryStatements: statements,
    };
  }

  return {
    periodStart,
    periodEnd,
    totalSalesValue: Math.round(totalSalesValue * 100) / 100,
    salesCount,
    cashCollected: Math.round(cashCollected * 100) / 100,
    cashSalesValue: Math.round(cashSalesValue * 100) / 100,
    creditSalesValue: Math.round(creditSalesValue * 100) / 100,
    openingDebt: Math.round(priorTotalDebt * 100) / 100,
    newCreditIssued: Math.round(newCreditIssued * 100) / 100,
    debtRecovered: Math.round(debtRecovered * 100) / 100,
    closingDebt: Math.round(closingDebt * 100) / 100,
    overdueDebt: Math.round(closingDebt * 100) / 100,
    totalDeliveriesReceived: deliveries.length,
    restockExpenditure: Math.round(restockExpenditure * 100) / 100,
    operatingExpenses: Math.round(operatingExpenses * 100) / 100,
    totalMoneySpent: Math.round(totalMoneySpent * 100) / 100,
    costOfGoodsSold: Math.round(costOfGoodsSold * 100) / 100,
    isProfitReliable,
    profitConfidenceWarning,
    estimatedProfit,
    profitBreakdown,
    lowStockItemsCount: lowStockCount,
    adjustmentsCount,
    daysSinceLastCount,
    stockCheckWarning,
    comparison,
  };
}
