/**
 * SISPA 1.0 - SMART STOCK & BUYING ASSISTANT
 * Core Domain Calculation Engine
 * 
 * Rules:
 * - Deterministic and pure calculation functions
 * - No UI or database dependencies
 * - Round up suggested quantities using Math.ceil
 * - Effective stock = max(current_stock, 0) for reorder calculations
 */

export type AttentionStatus = "RUNNING_LOW" | "CHECK_SOON" | "OK" | "NO_DATA";

export interface StockCalculationInput {
  currentStock: number;
  velocity: number | null;
  desiredCoverageDays: number;
  minimumStockThreshold: number | null;
}

export interface StockIntelligenceResult {
  currentStock: number;
  effectiveStock: number;
  velocity: number | null;
  daysRemaining: number | null;
  status: AttentionStatus;
  suggestedPurchaseQuantity: number;
  targetStock: number | null;
  statusLabel: string;
  explanation: string;
}

export interface SalesRecord {
  quantity: number; // positive number representing quantity sold
  date: Date;
}

/**
 * Calculate sales velocity in units per calendar day.
 * - Minimum usable history: 7 calendar days
 * - Calculation window: 30 days
 * - Respects manual daily sales override
 */
export function calculateVelocity(params: {
  sales: SalesRecord[];
  productCreatedAt: Date;
  earliestActivityDate?: Date | null;
  manualDailySalesOverride?: number | null;
  now?: Date;
  calculationWindowDays?: number;
  minHistoryDays?: number;
}): number | null {
  const {
    sales,
    productCreatedAt,
    earliestActivityDate,
    manualDailySalesOverride,
    now = new Date(),
    calculationWindowDays = 30,
    minHistoryDays = 7,
  } = params;

  // 1. Manual override takes precedence if set
  if (
    manualDailySalesOverride !== undefined &&
    manualDailySalesOverride !== null &&
    !isNaN(Number(manualDailySalesOverride))
  ) {
    return Math.max(0, Number(manualDailySalesOverride));
  }

  // 2. Determine calendar history duration
  // Use earliest known activity or creation date
  const referenceStartDate = earliestActivityDate || productCreatedAt;
  const totalCalendarDays = Math.max(
    0,
    (now.getTime() - referenceStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  // If less than 7 calendar days of history, velocity is not available yet
  if (totalCalendarDays < minHistoryDays) {
    return null;
  }

  // 3. Calculation window (up to 30 days)
  const windowDays = Math.min(calculationWindowDays, totalCalendarDays);
  if (windowDays <= 0) {
    return null;
  }

  const windowStartTime = now.getTime() - windowDays * 24 * 60 * 60 * 1000;

  // Sum sales in this calculation window
  const totalSalesInWindow = sales
    .filter((s) => s.date.getTime() >= windowStartTime && s.date.getTime() <= now.getTime())
    .reduce((sum, s) => sum + Math.abs(s.quantity), 0);

  // Return sales per calendar day
  return totalSalesInWindow / windowDays;
}

/**
 * Calculate approximate days remaining.
 * - velocity = 0 -> Infinity
 * - velocity unavailable -> null
 * - velocity > 0 -> current_stock / velocity
 */
export function calculateDaysRemaining(currentStock: number, velocity: number | null): number | null {
  if (velocity === null || isNaN(velocity)) {
    return null;
  }
  if (velocity === 0) {
    return Infinity;
  }
  return currentStock / velocity;
}

/**
 * Attention status classification following strict priority order.
 * 
 * 1. FIRST: current_stock <= 0 -> RUNNING_LOW
 * 2. If velocity is available:
 *    - if current_stock > 0 and velocity == 0 -> OK
 *    - if days_remaining <= desired_coverage_days -> RUNNING_LOW
 *    - if days_remaining <= desired_coverage_days * 2.5 -> CHECK_SOON
 *    - otherwise -> OK
 * 3. If velocity is not available:
 *    - if minimum_stock_threshold exists:
 *        - if current_stock <= minimum_stock_threshold -> RUNNING_LOW
 *        - if current_stock <= minimum_stock_threshold * 1.5 -> CHECK_SOON
 *        - otherwise -> OK
 *    - if neither velocity nor minimum stock exists -> NO_DATA
 */
export function calculateAttentionStatus(params: {
  currentStock: number;
  velocity: number | null;
  daysRemaining: number | null;
  desiredCoverageDays: number;
  minimumStockThreshold: number | null;
}): AttentionStatus {
  const { currentStock, velocity, daysRemaining, desiredCoverageDays, minimumStockThreshold } = params;

  // Rule 1: Priority rule - out of stock or negative stock
  if (currentStock <= 0) {
    return "RUNNING_LOW";
  }

  // Rule 2: Velocity is available
  if (velocity !== null && !isNaN(velocity)) {
    if (velocity === 0) {
      return "OK";
    }

    if (daysRemaining !== null) {
      if (daysRemaining <= desiredCoverageDays) {
        return "RUNNING_LOW";
      }
      if (daysRemaining <= desiredCoverageDays * 2.5) {
        return "CHECK_SOON";
      }
      return "OK";
    }
  }

  // Rule 3: Velocity is NOT available, fallback to minimum stock threshold
  if (minimumStockThreshold !== null && minimumStockThreshold !== undefined && minimumStockThreshold > 0) {
    if (currentStock <= minimumStockThreshold) {
      return "RUNNING_LOW";
    }
    if (currentStock <= minimumStockThreshold * 1.5) {
      return "CHECK_SOON";
    }
    return "OK";
  }

  // Rule 4: Neither velocity nor minimum threshold exists
  return "NO_DATA";
}

/**
 * Calculate suggested purchase quantity.
 * 
 * - effective_stock = max(current_stock, 0)
 * - If velocity > 0:
 *     target_stock = velocity * desired_coverage_days
 *     suggested_quantity = ceil(max(0, target_stock - effective_stock))
 * - If velocity = 0: suggested = 0
 * - If velocity is unavailable but minimum stock exists:
 *     suggested_quantity = ceil(max(0, minimum_stock_threshold - effective_stock))
 * - If neither velocity nor minimum stock is available:
 *     suggested_quantity = 0
 * - Never return negative
 */
export function calculateSuggestedPurchaseQuantity(params: {
  currentStock: number;
  velocity: number | null;
  desiredCoverageDays: number;
  minimumStockThreshold: number | null;
}): { suggestedQuantity: number; targetStock: number | null } {
  const { currentStock, velocity, desiredCoverageDays, minimumStockThreshold } = params;
  const effectiveStock = Math.max(currentStock, 0);

  if (velocity !== null && !isNaN(velocity)) {
    if (velocity === 0) {
      return { suggestedQuantity: 0, targetStock: 0 };
    }
    const targetStock = velocity * desiredCoverageDays;
    const suggested = Math.ceil(Math.max(0, targetStock - effectiveStock));
    return { suggestedQuantity: suggested, targetStock };
  }

  if (minimumStockThreshold !== null && minimumStockThreshold !== undefined && minimumStockThreshold > 0) {
    const suggested = Math.ceil(Math.max(0, minimumStockThreshold - effectiveStock));
    return { suggestedQuantity: suggested, targetStock: minimumStockThreshold };
  }

  return { suggestedQuantity: 0, targetStock: null };
}

/**
 * Complete stock intelligence calculation helper.
 */
export function calculateStockIntelligence(input: StockCalculationInput): StockIntelligenceResult {
  const { currentStock, velocity, desiredCoverageDays, minimumStockThreshold } = input;
  const effectiveStock = Math.max(currentStock, 0);
  const daysRemaining = calculateDaysRemaining(currentStock, velocity);
  const status = calculateAttentionStatus({
    currentStock,
    velocity,
    daysRemaining,
    desiredCoverageDays,
    minimumStockThreshold,
  });

  const { suggestedQuantity, targetStock } = calculateSuggestedPurchaseQuantity({
    currentStock,
    velocity,
    desiredCoverageDays,
    minimumStockThreshold,
  });

  let statusLabel = "OK";
  let explanation = "Stock is healthy.";

  if (currentStock < 0) {
    statusLabel = "BUY NOW";
    explanation = "Your stock is below zero. Some sales may not have been recorded correctly.";
  } else if (currentStock === 0) {
    statusLabel = "BUY NOW";
    explanation = "You are completely out of stock.";
  } else if (status === "RUNNING_LOW") {
    statusLabel = "BUY NOW";
    if (daysRemaining !== null && daysRemaining < Infinity) {
      const roundedDays = Math.round(daysRemaining);
      explanation = roundedDays <= 1 
        ? "May finish today or tomorrow based on your sales."
        : `About ${roundedDays} days left before you run out.`;
    } else if (minimumStockThreshold) {
      explanation = `Below your minimum level of ${minimumStockThreshold}.`;
    } else {
      explanation = "Stock is critically low.";
    }
  } else if (status === "CHECK_SOON") {
    statusLabel = "BUY SOON";
    if (daysRemaining !== null && daysRemaining < Infinity) {
      explanation = `About ${Math.round(daysRemaining)} days left. Plan your next delivery soon.`;
    } else if (minimumStockThreshold) {
      explanation = `Approaching your minimum level (${minimumStockThreshold}).`;
    } else {
      explanation = "Approaching reorder point.";
    }
  } else if (status === "NO_DATA") {
    statusLabel = "NO DATA";
    explanation = "Not enough sales recorded yet. Keep recording your sales and we'll give you a better estimate.";
  } else {
    // OK
    statusLabel = "OK";
    if (velocity === 0) {
      explanation = "No sales recorded recently. Stock is steady.";
    } else if (daysRemaining !== null && daysRemaining < Infinity) {
      explanation = `About ${Math.round(daysRemaining)} days of stock available.`;
    } else {
      explanation = "Stock is at a good level.";
    }
  }

  return {
    currentStock,
    effectiveStock,
    velocity,
    daysRemaining,
    status,
    suggestedPurchaseQuantity: suggestedQuantity,
    targetStock,
    statusLabel,
    explanation,
  };
}
