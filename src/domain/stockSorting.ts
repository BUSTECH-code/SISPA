/**
 * SISPA 1.0 - Stock Sorting Domain Logic
 * 
 * Rules:
 * - Deterministic, pure comparison functions.
 * - Explicit priority groups for urgency sorting.
 * - Stable, case-insensitive tie-breaking by product name.
 * - Input immutability: returns a fresh copy of the array without mutating.
 * - Guards against non-finite or invalid numbers.
 */

import { DaysRemainingDisplay } from "./intelligence";

export type StockSortOption = "URGENCY" | "NAME_ASC" | "STOCK_ASC";

export enum UrgencyPriorityGroup {
  NEGATIVE_STOCK = 1,
  ZERO_STOCK = 2,
  FINITE_DAYS = 3,
  ZERO_SALES_VELOCITY = 4,
  INSUFFICIENT_HISTORY = 5,
}

export interface SortableProduct {
  name: string;
  currentStock: number;
  intelligence: {
    velocity: number | null;
    daysRemaining: number | null;
    daysRemainingDisplay?: DaysRemainingDisplay;
  };
}

/**
 * Determine the explicit priority group for a product based on its stock balance,
 * sales velocity, and calculated days remaining.
 */
export function getProductUrgencyGroup(
  currentStock: number,
  velocity: number | null,
  daysRemaining: number | null
): UrgencyPriorityGroup {
  // Invalid or negative stock
  if (typeof currentStock !== "number" || isNaN(currentStock) || currentStock < 0) {
    return UrgencyPriorityGroup.NEGATIVE_STOCK;
  }

  // Zero stock
  if (currentStock === 0) {
    return UrgencyPriorityGroup.ZERO_STOCK;
  }

  // Null, undefined, or invalid velocity
  if (
    velocity === null ||
    velocity === undefined ||
    typeof velocity !== "number" ||
    isNaN(velocity)
  ) {
    return UrgencyPriorityGroup.INSUFFICIENT_HISTORY;
  }

  // Zero velocity (stock > 0 and no sales)
  if (velocity === 0) {
    return UrgencyPriorityGroup.ZERO_SALES_VELOCITY;
  }

  // Finite days remaining
  if (
    daysRemaining !== null &&
    daysRemaining !== undefined &&
    typeof daysRemaining === "number" &&
    !isNaN(daysRemaining) &&
    Number.isFinite(daysRemaining) &&
    daysRemaining >= 0
  ) {
    return UrgencyPriorityGroup.FINITE_DAYS;
  }

  // Fallback for any other non-finite condition
  return UrgencyPriorityGroup.INSUFFICIENT_HISTORY;
}

/**
 * Compare two products strictly by Days of Stock Remaining urgency:
 * 1. Negative stock (Priority Group 1)
 * 2. Zero stock (Priority Group 2)
 * 3. Finite days remaining, ascending (Priority Group 3)
 * 4. Zero sales velocity (Priority Group 4)
 * 5. Insufficient history (Priority Group 5)
 * 
 * Case-insensitive name tie-breaker is applied deterministically.
 */
export function compareProductsByDaysRemaining<T extends SortableProduct>(a: T, b: T): number {
  const groupA = getProductUrgencyGroup(a.currentStock, a.intelligence.velocity, a.intelligence.daysRemaining);
  const groupB = getProductUrgencyGroup(b.currentStock, b.intelligence.velocity, b.intelligence.daysRemaining);

  if (groupA !== groupB) {
    return groupA - groupB;
  }

  // Within Group 3 (Finite days remaining), sort ascending by days remaining
  if (groupA === UrgencyPriorityGroup.FINITE_DAYS) {
    const daysA = a.intelligence.daysRemaining ?? Infinity;
    const daysB = b.intelligence.daysRemaining ?? Infinity;
    if (daysA !== daysB) {
      return daysA - daysB;
    }
  }

  // Deterministic case-insensitive tie-breaker
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Compare two products alphabetically by name (case-insensitive).
 */
export function compareProductsByName<T extends SortableProduct>(a: T, b: T): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Compare two products by current physical stock (lowest first), with name tie-breaking.
 */
export function compareProductsByStock<T extends SortableProduct>(a: T, b: T): number {
  const stockA = typeof a.currentStock === "number" && !isNaN(a.currentStock) ? a.currentStock : -Infinity;
  const stockB = typeof b.currentStock === "number" && !isNaN(b.currentStock) ? b.currentStock : -Infinity;

  if (stockA !== stockB) {
    return stockA - stockB;
  }

  return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
}

/**
 * Sort an array of products according to the specified sort option.
 * Always returns a new array without mutating the input.
 */
export function sortProducts<T extends SortableProduct>(
  products: readonly T[],
  sortOption: StockSortOption = "URGENCY"
): T[] {
  const copy = [...products];

  switch (sortOption) {
    case "URGENCY":
      return copy.sort(compareProductsByDaysRemaining);
    case "NAME_ASC":
      return copy.sort(compareProductsByName);
    case "STOCK_ASC":
      return copy.sort(compareProductsByStock);
    default:
      return copy.sort(compareProductsByDaysRemaining);
  }
}
