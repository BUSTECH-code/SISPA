/**
 * SISPA Domain - Debt, Financial & Profit Calculations
 * Deterministic and pure functions for:
 * - Sales, customer returns, refunds, and money collected
 * - Customer debt and recovery (cash refunds never increase debt)
 * - Cost of goods sold (COGS) traceability & ledger-consistent valuation
 * - Operating expenses & pending delivery expenditure projection
 * - Transparent "Why?" profit breakdown with honest reliability suppression
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

export interface PendingSalesSummary {
  count: number;
  totalAmount: number;
  amountPaid: number;
  outstandingAmount: number;
}

export interface BusinessPeriodMetrics {
  periodStart: Date;
  periodEnd: Date;

  // Sales & Collections
  grossSalesValue: number;
  returnsTotal: number;
  returnsCount: number;
  refundAmount: number;
  creditOffsetAmount: number;
  totalSalesValue: number; // Net sales = grossSales - returns (including legacy corrections)
  salesCount: number;
  cashCollected: number; // Immediate cash from sales + customer debt payments - cash refunds
  cashSalesValue: number; // Net immediate cash from sales minus cash refunds
  creditSalesValue: number; // Net credit issued (credit sales - credit offsets)
  pendingSalesSummary: PendingSalesSummary;

  // Debt & Collections (Collect Job)
  openingDebt: number;
  newCreditIssued: number;
  debtRecovered: number; // Customer payments towards debt
  closingDebt: number;
  overdueDebt: number;

  // Expenses & Buying
  totalDeliveriesReceived: number;
  pendingDeliveriesCount: number;
  pendingRestockExpenditure: number;
  restockExpenditure: number; // Money spent purchasing stock (confirmed + pending without duplication)
  operatingExpenses: number; // Shop running costs (transport, generator, maintenance)
  totalMoneySpent: number; // Restock + Expenses

  // Profitability & "Why?" Explanation
  costOfGoodsSold: number;
  isProfitReliable: boolean;
  profitConfidenceWarning?: string;
  estimatedProfit: number | null; // Sales - COGS - Expenses (null when unreliable)
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
    salesDifference: number;
    cashDifference: number;
    debtRecoveredDifference: number;
    expensesDifference: number;
    summaryStatements: string[];
  };
}

function roundMoney(val: number): number {
  return Math.round(val * 100) / 100;
}

/**
 * Deterministically compute debt balance for a customer.
 * creditSalesAmount includes positive credit sales plus negative credit offsets
 * from returns (`outstandingAmount <= 0`). Cash refunds (`refundAmount`) are
 * strictly excluded from paymentsReceivedAmount so they never inflate debt.
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
    outstandingBalance: roundMoney(balance),
    isOverdue: balance > 0,
  };
}

export interface LedgerValuationEntry {
  id?: number;
  productId: number;
  entryType:
    | "OPENING_BALANCE"
    | "SALE"
    | "RESTOCK"
    | "ADJUSTMENT"
    | "CORRECTION"
    | "OPENING_BALANCE_RECONCILIATION"
    | string;
  quantityDelta: number;
  unitCost: number | null;
  occurredAt: Date;
  reconciledEntryId?: number | null;
}

/**
 * Compute ledger-consistent Moving-Average Cost (MAC) COGS for a period.
 * Walks all stock_ledger_entries in chronological order (`occurredAt ASC, id ASC`):
 * - Respects OPENING_BALANCE physical-count baselines as authoritative resets/anchors.
 * - Applies OPENING_BALANCE_RECONCILIATION quantity adjustments to tracked inventory
 *   so inventory quantity stays mathematically aligned with the authoritative ledger
 *   (e.g., Walkthrough 4 stays at 35, not 30), while never inventing fake expenditure or
 *   negating genuine SALE COGS.
 * - Tracks remaining missing-cost flags if any in-period SALE/CORRECTION lacks a cost basis.
 */
export function computeLedgerCogsForPeriod(params: {
  ledgerEntries: LedgerValuationEntry[];
  periodStart: Date;
  periodEnd: Date;
}): {
  costOfGoodsSold: number;
  hasMissingCost: boolean;
  endingQuantities: Map<number, number>;
} {
  const { ledgerEntries, periodStart, periodEnd } = params;

  const sorted = [...ledgerEntries].sort((a, b) => {
    const dt = new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime();
    if (dt !== 0) return dt;
    return (a.id ?? 0) - (b.id ?? 0);
  });

  const stateByProduct = new Map<
    number,
    { qty: number; value: number; lastCost: number | null }
  >();

  let totalCogs = 0;
  let hasMissingCost = false;

  const startMs = periodStart.getTime();
  const endMs = periodEnd.getTime();

  for (const entry of sorted) {
    const state = stateByProduct.get(entry.productId) ?? {
      qty: 0,
      value: 0,
      lastCost: null,
    };

    const delta = Number(entry.quantityDelta || 0);
    const entryUnitCost =
      entry.unitCost !== null && entry.unitCost !== undefined && Number(entry.unitCost) > 0
        ? Number(entry.unitCost)
        : null;

    if (entryUnitCost !== null && (entry.entryType === "RESTOCK" || entry.entryType === "OPENING_BALANCE")) {
      state.lastCost = entryUnitCost;
    }

    const getAvgCost = (): number | null => {
      if (state.qty > 0 && state.value > 0) {
        return state.value / state.qty;
      }
      return state.lastCost;
    };

    const occurredMs = new Date(entry.occurredAt).getTime();
    const inPeriod = occurredMs >= startMs && occurredMs <= endMs;

    switch (entry.entryType) {
      case "OPENING_BALANCE": {
        const nextQty = state.qty + delta;
        const effectiveCost = entryUnitCost ?? state.lastCost;
        if (nextQty <= 0) {
          state.qty = nextQty;
          state.value = 0;
        } else if (effectiveCost !== null) {
          if (state.qty <= 0 || state.value <= 0) {
            state.qty = nextQty;
            state.value = nextQty * effectiveCost;
          } else if (delta >= 0) {
            state.qty = nextQty;
            state.value = Math.max(0, state.value + delta * effectiveCost);
          } else {
            const avg = getAvgCost() ?? effectiveCost;
            state.qty = nextQty;
            state.value = Math.max(0, nextQty * avg);
          }
        } else {
          state.qty = nextQty;
        }
        break;
      }

      case "RESTOCK": {
        const effectiveCost = entryUnitCost ?? state.lastCost;
        if (delta > 0) {
          if (effectiveCost !== null) {
            if (state.qty <= 0) {
              state.qty += delta;
              state.value = state.qty > 0 ? state.qty * effectiveCost : 0;
            } else {
              state.qty += delta;
              state.value = Math.max(0, state.value + delta * effectiveCost);
            }
          } else {
            state.qty += delta;
          }
        } else {
          state.qty += delta;
        }
        break;
      }

      case "SALE": {
        const soldQty = Math.abs(delta);
        const unitCost = getAvgCost();
        if (inPeriod && soldQty > 0) {
          if (unitCost !== null && unitCost > 0) {
            totalCogs += soldQty * unitCost;
          } else {
            hasMissingCost = true;
          }
        }
        state.qty += delta;
        if (state.qty <= 0) {
          state.value = 0;
        } else if (unitCost !== null) {
          state.value = Math.max(0, state.value - soldQty * unitCost);
        }
        break;
      }

      case "CORRECTION": {
        const unitCost = getAvgCost();
        if (delta > 0) {
          // Stock returned to shelf: reduces period COGS if in period
          if (inPeriod) {
            if (unitCost !== null && unitCost > 0) {
              totalCogs -= delta * unitCost;
            } else {
              hasMissingCost = true;
            }
          }
          state.qty += delta;
          if (state.qty > 0 && unitCost !== null) {
            state.value = Math.max(0, state.value + delta * unitCost);
          }
        } else if (delta < 0) {
          const extraSold = Math.abs(delta);
          if (inPeriod) {
            if (unitCost !== null && unitCost > 0) {
              totalCogs += extraSold * unitCost;
            } else {
              hasMissingCost = true;
            }
          }
          state.qty += delta;
          if (state.qty <= 0) {
            state.value = 0;
          } else if (unitCost !== null) {
            state.value = Math.max(0, state.value - extraSold * unitCost);
          }
        }
        break;
      }

      case "ADJUSTMENT": {
        const avg = getAvgCost();
        state.qty += delta;
        if (state.qty <= 0) {
          state.value = 0;
        } else if (avg !== null) {
          state.value = Math.max(0, state.qty * avg);
        }
        break;
      }

      case "OPENING_BALANCE_RECONCILIATION": {
        // Reconciles the quantity effect of a pre-cut-off movement so tracked inventory
        // stays aligned with the authoritative ledger without altering COGS or expenditure.
        const avg = getAvgCost();
        state.qty += delta;
        if (state.qty <= 0) {
          state.value = 0;
        } else if (avg !== null) {
          state.value = Math.max(0, state.qty * avg);
        }
        break;
      }

      default: {
        state.qty += delta;
        break;
      }
    }

    stateByProduct.set(entry.productId, state);
  }

  const endingQuantities = new Map<number, number>();
  for (const [prodId, st] of stateByProduct.entries()) {
    endingQuantities.set(prodId, st.qty);
  }

  return {
    costOfGoodsSold: roundMoney(Math.max(0, totalCogs)),
    hasMissingCost,
    endingQuantities,
  };
}

/**
 * Calculate weekly/monthly period financial, return, debt recovery, profit metrics,
 * and meaningful "What Changed?" comparisons.
 */
export function calculatePeriodSummary(params: {
  sales: Array<{
    totalAmount: number;
    amountPaid: number;
    refundAmount?: number;
    outstandingAmount: number;
    quantity?: number;
    productId?: number;
    isCorrection?: boolean;
    timestampStatus?: string;
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
  pendingDeliveries?: Array<{
    productId?: number;
    quantityDelta: number;
    unitCost: number | null;
    createdAt: Date;
  }>;
  ledgerEntries?: LedgerValuationEntry[];
  productCosts?: Map<number, number>; // Fallback unit purchase cost for pure domain callers without full ledger
  adjustmentsCount: number;
  hasNonZeroAdjustment?: boolean;
  hasReconciliationInPeriod?: boolean;
  pendingMovementsCount?: number;
  hasNeedsRecountProducts?: boolean;
  hasNegativeStock?: boolean;
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
    pendingDeliveries = [],
    ledgerEntries,
    productCosts = new Map(),
    adjustmentsCount,
    hasNonZeroAdjustment = false,
    hasReconciliationInPeriod = false,
    pendingMovementsCount = 0,
    hasNeedsRecountProducts = false,
    hasNegativeStock = false,
    lowStockCount,
    lastStockCheckDate,
    periodStart,
    periodEnd,
    priorTotalDebt,
    priorPeriodMetrics,
  } = params;

  let grossSalesValue = 0;
  let returnsTotal = 0;
  let returnsCount = 0;
  let refundAmount = 0;
  let creditOffsetAmount = 0;
  let totalSalesValue = 0;
  let cashSalesGross = 0;
  let creditSalesValue = 0;
  let salesCount = 0;

  const pendingSalesSummary: PendingSalesSummary = {
    count: 0,
    totalAmount: 0,
    amountPaid: 0,
    outstandingAmount: 0,
  };
  let hasPendingReviewSales = false;

  // Fallback COGS tracking when full ledgerEntries is not supplied
  let fallbackCogs = 0;
  let salesWithMissingCostCount = 0;

  for (const s of sales) {
    const qty = Number(s.quantity ?? 0);
    const isReturnRow = Boolean(s.isCorrection) && qty < 0;
    const isLegacyPositiveCorrection = Boolean(s.isCorrection) && qty >= 0;
    const rowRefund = Math.max(0, Number(s.refundAmount ?? 0));

    totalSalesValue += s.totalAmount;
    cashSalesGross += s.amountPaid;
    refundAmount += rowRefund;
    creditSalesValue += s.outstandingAmount;

    if (isReturnRow) {
      returnsCount++;
      returnsTotal += Math.abs(s.totalAmount);
      if (s.outstandingAmount < 0) {
        creditOffsetAmount += Math.abs(s.outstandingAmount);
      }
    } else if (!isLegacyPositiveCorrection) {
      salesCount++;
      grossSalesValue += s.totalAmount;
    } else {
      // Legacy positive correction row (quantity >= 0, no inferred cash refund)
      grossSalesValue += s.totalAmount;
    }

    if (s.timestampStatus === "PENDING_REVIEW") {
      hasPendingReviewSales = true;
      pendingSalesSummary.count++;
      pendingSalesSummary.totalAmount = roundMoney(pendingSalesSummary.totalAmount + s.totalAmount);
      pendingSalesSummary.amountPaid = roundMoney(pendingSalesSummary.amountPaid + s.amountPaid);
      pendingSalesSummary.outstandingAmount = roundMoney(
        pendingSalesSummary.outstandingAmount + s.outstandingAmount
      );
    }

    if (!ledgerEntries) {
      if (s.productId !== undefined && s.quantity !== undefined) {
        const unitCost = productCosts.get(s.productId);
        if (unitCost !== undefined && unitCost > 0) {
          fallbackCogs += s.quantity * unitCost;
        } else {
          salesWithMissingCostCount++;
        }
      } else {
        salesWithMissingCostCount++;
      }
    }
  }

  let costOfGoodsSold = fallbackCogs;
  let missingCostFromLedger = false;

  if (ledgerEntries) {
    const ledgerCogs = computeLedgerCogsForPeriod({
      ledgerEntries,
      periodStart,
      periodEnd,
    });
    costOfGoodsSold = ledgerCogs.costOfGoodsSold;
    missingCostFromLedger = ledgerCogs.hasMissingCost;
  }

  const cashSalesValue = cashSalesGross - refundAmount;

  // Debt payments recovered during this period (never reduced by cash refunds)
  const debtRecovered = payments.reduce((sum, p) => sum + p.amount, 0);

  // Total cash money in till (sales cash - cash refunds + debt recovered)
  const cashCollected = cashSalesValue + debtRecovered;

  // Net credit issued during this period (credit sales - credit offsets from returns)
  const newCreditIssued = creditSalesValue;

  // Closing debt = Prior debt + Net new credit - Recovered payments
  const closingDebt = Math.max(0, priorTotalDebt + newCreditIssued - debtRecovered);

  // Operating expenses
  const operatingExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);

  // Confirmed + Pending deliveries expenditure (no duplication once resolved)
  let confirmedRestockExpenditure = 0;
  for (const d of deliveries) {
    if (d.unitCost !== null && d.unitCost > 0) {
      confirmedRestockExpenditure += d.quantityDelta * d.unitCost;
    }
  }

  let pendingRestockExpenditure = 0;
  for (const pd of pendingDeliveries) {
    if (pd.unitCost !== null && pd.unitCost > 0) {
      pendingRestockExpenditure += pd.quantityDelta * pd.unitCost;
    }
  }

  const restockExpenditure = confirmedRestockExpenditure + pendingRestockExpenditure;
  const totalMoneySpent = restockExpenditure + operatingExpenses;

  // Strict honesty rules for profit reliability
  const hasMissingCosts = ledgerEntries
    ? missingCostFromLedger
    : salesCount > 0 && (salesWithMissingCostCount > 0 || productCosts.size === 0);

  const hasPendingQuarantine = pendingMovementsCount > 0 || hasPendingReviewSales;

  const detectedNonZeroAdjustment =
    hasNonZeroAdjustment ||
    Boolean(
      ledgerEntries?.some((e) => {
        const ms = new Date(e.occurredAt).getTime();
        return (
          e.entryType === "ADJUSTMENT" &&
          ms >= periodStart.getTime() &&
          ms <= periodEnd.getTime() &&
          Number(e.quantityDelta) !== 0
        );
      })
    );

  const detectedReconciliation =
    hasReconciliationInPeriod ||
    Boolean(
      ledgerEntries?.some((e) => {
        const ms = new Date(e.occurredAt).getTime();
        return (
          e.entryType === "OPENING_BALANCE_RECONCILIATION" &&
          ms >= periodStart.getTime() &&
          ms <= periodEnd.getTime() &&
          Number(e.quantityDelta) !== 0
        );
      })
    );

  const reliabilityReasons: string[] = [];
  if (hasMissingCosts) {
    reliabilityReasons.push(
      "some purchase costs are missing. Record delivery purchase prices to unlock complete profit tracking"
    );
  }
  if (hasPendingQuarantine) {
    reliabilityReasons.push("there are pending stock movements awaiting timestamp review");
  }
  if (hasNeedsRecountProducts) {
    reliabilityReasons.push("one or more products are marked NEEDS_RECOUNT");
  }
  if (hasNegativeStock) {
    reliabilityReasons.push("one or more products have negative stock balances");
  }
  if (detectedNonZeroAdjustment) {
    reliabilityReasons.push("non-zero physical stock adjustments occurred in this period");
  }
  if (detectedReconciliation) {
    reliabilityReasons.push("late pre-cut-off stock reconciliations affected this period");
  }

  const hasAnySalesActivity = salesCount > 0 || returnsCount > 0 || sales.length > 0;
  const isProfitReliable =
    reliabilityReasons.length === 0 &&
    (!hasAnySalesActivity || costOfGoodsSold >= 0);

  let profitConfidenceWarning: string | undefined;
  let estimatedProfit: number | null = null;
  let profitBreakdown: BusinessPeriodMetrics["profitBreakdown"] = null;

  if (reliabilityReasons.length > 0) {
    profitConfidenceWarning = `Profit cannot be reliably calculated yet because ${reliabilityReasons.join("; ")}.`;
  } else if (hasAnySalesActivity) {
    const net = totalSalesValue - costOfGoodsSold - operatingExpenses;
    estimatedProfit = roundMoney(net);
    profitBreakdown = {
      sales: roundMoney(totalSalesValue),
      costOfGoods: roundMoney(costOfGoodsSold),
      expenses: roundMoney(operatingExpenses),
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
    const salesDiff = roundMoney(totalSalesValue - priorPeriodMetrics.totalSalesValue);
    const cashDiff = roundMoney(cashCollected - priorPeriodMetrics.cashCollected);
    const debtDiff = roundMoney(debtRecovered - priorPeriodMetrics.debtRecovered);
    const expDiff = roundMoney(operatingExpenses - priorPeriodMetrics.operatingExpenses);

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
    grossSalesValue: roundMoney(grossSalesValue),
    returnsTotal: roundMoney(returnsTotal),
    returnsCount,
    refundAmount: roundMoney(refundAmount),
    creditOffsetAmount: roundMoney(creditOffsetAmount),
    totalSalesValue: roundMoney(totalSalesValue),
    salesCount,
    cashCollected: roundMoney(cashCollected),
    cashSalesValue: roundMoney(cashSalesValue),
    creditSalesValue: roundMoney(creditSalesValue),
    pendingSalesSummary,
    openingDebt: roundMoney(priorTotalDebt),
    newCreditIssued: roundMoney(newCreditIssued),
    debtRecovered: roundMoney(debtRecovered),
    closingDebt: roundMoney(closingDebt),
    overdueDebt: roundMoney(closingDebt),
    totalDeliveriesReceived: deliveries.length + pendingDeliveries.length,
    pendingDeliveriesCount: pendingDeliveries.length,
    pendingRestockExpenditure: roundMoney(pendingRestockExpenditure),
    restockExpenditure: roundMoney(restockExpenditure),
    operatingExpenses: roundMoney(operatingExpenses),
    totalMoneySpent: roundMoney(totalMoneySpent),
    costOfGoodsSold: roundMoney(Math.max(0, costOfGoodsSold)),
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
