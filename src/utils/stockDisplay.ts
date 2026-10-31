/**
 * SISPA 1.0 - UI Stock Display Helpers
 * 
 * Separates presentation styles (Tailwind CSS classes) from the core domain calculation engine.
 */

import { DaysRemainingTier } from "@/domain/intelligence";

export interface TierBadgeStyle {
  badgeClasses: string;
  textClasses: string;
  dotColor: string;
}

/**
 * Returns accessible, high-contrast Tailwind styling for a given DaysRemainingTier.
 */
export function getDaysRemainingBadgeStyle(tier: DaysRemainingTier): TierBadgeStyle {
  switch (tier) {
    case "DISCREPANCY":
      return {
        badgeClasses: "bg-red-50 text-red-800 border-red-200",
        textClasses: "text-red-700 font-bold",
        dotColor: "bg-red-600",
      };
    case "OUT_OF_STOCK":
      return {
        badgeClasses: "bg-red-50 text-red-800 border-red-200",
        textClasses: "text-red-600 font-bold",
        dotColor: "bg-red-600",
      };
    case "CRITICAL":
      return {
        badgeClasses: "bg-amber-50 text-amber-900 border-amber-200",
        textClasses: "text-amber-800 font-bold",
        dotColor: "bg-amber-600",
      };
    case "LOW":
      return {
        badgeClasses: "bg-amber-50 text-amber-800 border-amber-200",
        textClasses: "text-amber-700 font-semibold",
        dotColor: "bg-amber-500",
      };
    case "NORMAL":
      return {
        badgeClasses: "bg-slate-50 text-slate-700 border-slate-200",
        textClasses: "text-slate-700 font-medium",
        dotColor: "bg-emerald-500",
      };
    case "NO_SALES":
      return {
        badgeClasses: "bg-slate-50 text-slate-600 border-slate-200",
        textClasses: "text-slate-600 font-medium",
        dotColor: "bg-slate-400",
      };
    case "NO_ESTIMATE":
    default:
      return {
        badgeClasses: "bg-slate-50 text-slate-600 border-slate-200",
        textClasses: "text-slate-600 font-medium",
        dotColor: "bg-slate-300",
      };
  }
}
