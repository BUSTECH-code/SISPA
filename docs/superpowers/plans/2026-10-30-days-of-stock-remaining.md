# Days of Stock Remaining Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the "Days of Stock Remaining" calculation and display feature with urgency sorting across SISPA's product surfaces without modifying existing ledger, sales records, or stock status enums.

**Architecture:** Pure domain classification and non-upward-rounding formatting in `src/domain/intelligence.ts`, dedicated comparator with explicit priority groups in `src/domain/stockSorting.ts`, lightweight UI presentation utility in `src/utils/stockDisplay.ts`, and integration into four UI components (`ProductCard`, `StockListView`, `ProductDetailDrawer`, `StaffHomeView`). Presentation styles (Tailwind classes) are strictly kept out of the domain layer.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind CSS v4, Lucide React, Vitest.

**Spec:** Approved feature scope and design constraints from user session (preserved `RUNNING_LOW` enum, UI label `BUY NOW`, non-upward rounding to 1 decimal place, pure domain layer, stable urgency sorting composed with search/category/status filters).

## Global Constraints

- Preserve `RUNNING_LOW` as internal enum and `BUY NOW` as user-facing business label; do not rename enum or introduce alias constants.
- Domain layer must remain pure: strictly no Tailwind CSS classes or JSX/HTML returned from `src/domain/`.
- No upward rounding that overstates stock life: format with floor or truncation to at most 1 decimal place.
- Classification must evaluate the raw unrounded `daysRemaining`. Fractional estimates are formatted to one decimal place without rounding upward; whole numbers omit the decimal.
- Do not mutate arrays during sorting; return fresh sorted copies.
- Do not modify database schema, Drizzle tables, inventory ledger movements, or sales transaction records.
- Preserve existing attention calculations (`calculateStockIntelligence`, `calculateAttentionStatus`, `calculateSuggestedPurchaseQuantity`).
- Urgency sorting must compose cleanly with search, category, and status filters in `StockListView`.
- Explicitly validate all numerical inputs: non-finite values (`NaN`, `null`, `undefined`) must never bleed into user-facing copy.

## Review Focus

1. `currentStock < 0` (negative stock / ledger anomaly) -> returns tier `DISCREPANCY` with text `"Stock discrepancy"` and sorts into Priority Group 1 (highest urgency).
2. `daysRemaining` between `0.001` and `0.999` (fractional stock life under 24 hours) -> returns tier `CRITICAL` with text `"Less than 1 day"`.
3. Boundary value `daysRemaining = 3.01` -> classified using raw unrounded value as `LOW` (since `3.01 > 3`), and displayed to 1 decimal place without upward rounding as `"Low — 3.0 days"`. By contrast, an exact whole number `daysRemaining = 3.0` classifies as `CRITICAL` and displays as `"Critical — 3 days"` (omitting decimal).
4. `velocity = 0` with `currentStock > 0` (positive stock with zero recent sales) -> returns tier `NO_SALES` with text `"No recent sales"` and sorts into Priority Group 4.
5. `velocity = null` or insufficient history -> returns tier `NO_ESTIMATE` with text `"No estimate"` and sorts into Priority Group 5.
6. Non-finite or invalid inputs (`NaN`, `Infinity`, `null`, `undefined`) in `currentStock`, `velocity`, or `daysRemaining` -> handled safely without crashing and never displayed as string `"NaN"`.

---

### Task 1: Domain Classification and Formatting Function (TDD)

**Files:**
- Modify: `src/domain/intelligence.ts`
- Modify: `src/domain/intelligence.test.ts`

**Interfaces:**
- Consumes: `calculateDaysRemaining(currentStock: number, velocity: number | null): number | null` from `src/domain/intelligence.ts:108`
- Produces:
  ```typescript
  export type DaysRemainingTier =
    | "DISCREPANCY"
    | "OUT_OF_STOCK"
    | "CRITICAL"
    | "LOW"
    | "NORMAL"
    | "NO_SALES"
    | "NO_ESTIMATE";

  export interface DaysRemainingDisplay {
    tier: DaysRemainingTier;
    text: string;
    days: number | null;
  }

  export function formatDaysRemainingDisplay(
    currentStock: number,
    velocity: number | null,
    daysRemaining: number | null
  ): DaysRemainingDisplay;
  ```

- [ ] **Step 1: Write the failing tests in `src/domain/intelligence.test.ts`**

Add tests covering all 8 specified display rules, boundary cases, unrounded classification, and invalid numerical guards:
```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/intelligence.test.ts`
Expected: FAIL with `formatDaysRemainingDisplay is not defined`.

- [ ] **Step 3: Implement `formatDaysRemainingDisplay` in `src/domain/intelligence.ts`**

Define:
```typescript
function formatDaysNumber(val: number): { formatted: string; value: number } {
  const truncated = Math.floor(val * 10) / 10;
  if (Number.isInteger(val)) {
    return { formatted: `${val}`, value: val };
  }
  return { formatted: truncated.toFixed(1), value: truncated };
}
```
Implement `formatDaysRemainingDisplay` using explicit guards for `NaN`/invalid numbers, and classifying based on raw unrounded `daysRemaining`. Also update `StockIntelligenceResult` to include `daysRemainingDisplay: DaysRemainingDisplay` populated via `calculateStockIntelligence`.

- [ ] **Step 4: Run tests to verify it passes**

Run: `npx vitest run src/domain/intelligence.test.ts`
Expected: PASS all tests in file.

- [ ] **Step 5: Verify test suite passes**

Run: `npm test`
Expected: PASS all tests with 0 failures.

---

### Task 2: Stable Urgency Sorting Logic with Explicit Priority Groups (TDD)

**Files:**
- Create: `src/domain/stockSorting.ts`
- Create: `src/domain/stockSorting.test.ts`

**Interfaces:**
- Consumes:
  - `DaysRemainingDisplay` from `src/domain/intelligence.ts`
  - `StockIntelligenceResult` from `src/domain/intelligence.ts`
- Produces:
  ```typescript
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

  export function getProductUrgencyGroup(currentStock: number, velocity: number | null, daysRemaining: number | null): UrgencyPriorityGroup;
  export function compareProductsByDaysRemaining<T extends SortableProduct>(a: T, b: T): number;
  export function sortProducts<T extends SortableProduct>(products: readonly T[], sortOption: StockSortOption): T[];
  ```

- [ ] **Step 1: Write comprehensive tests in `src/domain/stockSorting.test.ts`**

Cover all sort options, priority groups, equal urgency values, duplicate names, immutability, and invalid/non-finite inputs:
```typescript
import { describe, it, expect } from "vitest";
import { compareProductsByDaysRemaining, sortProducts, UrgencyPriorityGroup, getProductUrgencyGroup } from "./stockSorting";

describe("stockSorting", () => {
  const pDiscrepancy = { name: "Cement A", currentStock: -2, intelligence: { velocity: 1, daysRemaining: -2 } };
  const pOutOfStock = { name: "Paint B", currentStock: 0, intelligence: { velocity: 5, daysRemaining: 0 } };
  const pUnderOneDay = { name: "Nails C", currentStock: 2, intelligence: { velocity: 4, daysRemaining: 0.5 } };
  const pCritical = { name: "Blocks D", currentStock: 10, intelligence: { velocity: 5, daysRemaining: 2.0 } };
  const pLow = { name: "Pipes E", currentStock: 25, intelligence: { velocity: 5, daysRemaining: 5.0 } };
  const pNormal = { name: "Wood F", currentStock: 100, intelligence: { velocity: 5, daysRemaining: 20.0 } };
  const pNoSales = { name: "Gravel G", currentStock: 40, intelligence: { velocity: 0, daysRemaining: Infinity } };
  const pNoEstimate = { name: "Sand H", currentStock: 30, intelligence: { velocity: null, daysRemaining: null } };

  it("classifies items into explicit UrgencyPriorityGroups 1 through 5", () => {
    expect(getProductUrgencyGroup(-2, 1, -2)).toBe(UrgencyPriorityGroup.NEGATIVE_STOCK);
    expect(getProductUrgencyGroup(0, 5, 0)).toBe(UrgencyPriorityGroup.ZERO_STOCK);
    expect(getProductUrgencyGroup(10, 5, 2.0)).toBe(UrgencyPriorityGroup.FINITE_DAYS);
    expect(getProductUrgencyGroup(40, 0, Infinity)).toBe(UrgencyPriorityGroup.ZERO_SALES_VELOCITY);
    expect(getProductUrgencyGroup(30, null, null)).toBe(UrgencyPriorityGroup.INSUFFICIENT_HISTORY);
  });

  it("orders products according to explicit priority groups under URGENCY sort", () => {
    const unsorted = [pNoEstimate, pNormal, pOutOfStock, pNoSales, pCritical, pDiscrepancy, pLow, pUnderOneDay];
    const sorted = sortProducts(unsorted, "URGENCY");

    expect(sorted.map(p => p.name)).toEqual([
      "Cement A", // Negative stock (Priority Group 1)
      "Paint B",  // Zero stock (Priority Group 2)
      "Nails C",  // Finite days: 0.5 days (Priority Group 3)
      "Blocks D", // Finite days: 2.0 days (Priority Group 3)
      "Pipes E",  // Finite days: 5.0 days (Priority Group 3)
      "Wood F",   // Finite days: 20.0 days (Priority Group 3)
      "Gravel G", // Zero velocity (Priority Group 4)
      "Sand H",   // Insufficient history (Priority Group 5)
    ]);
  });

  it("preserves input immutability and returns a fresh copy", () => {
    const original = [pNormal, pDiscrepancy];
    const originalCopy = [...original];
    const sorted = sortProducts(original, "URGENCY");

    expect(original).toEqual(originalCopy);
    expect(sorted).not.toBe(original);
  });

  it("breaks ties deterministically using case-insensitive product name", () => {
    const p1 = { name: "zinc nails", currentStock: 10, intelligence: { velocity: 4, daysRemaining: 2.5 } };
    const p2 = { name: "Aluminium Nails", currentStock: 10, intelligence: { velocity: 4, daysRemaining: 2.5 } };

    const sorted = sortProducts([p1, p2], "URGENCY");
    expect(sorted[0].name).toBe("Aluminium Nails");
    expect(sorted[1].name).toBe("zinc nails");
  });

  it("handles duplicate product names stably without error", () => {
    const p1 = { name: "Wire", currentStock: 0, intelligence: { velocity: 1, daysRemaining: 0 } };
    const p2 = { name: "Wire", currentStock: 0, intelligence: { velocity: 1, daysRemaining: 0 } };

    const sorted = sortProducts([p1, p2], "URGENCY");
    expect(sorted.length).toBe(2);
    expect(sorted[0].name).toBe("Wire");
  });

  it("sorts correctly by NAME_ASC (case-insensitive)", () => {
    const list = [
      { name: "zinc wire", currentStock: 10, intelligence: { velocity: 1, daysRemaining: 10 } },
      { name: "Aluminium Bar", currentStock: 5, intelligence: { velocity: 1, daysRemaining: 5 } },
      { name: "brass screw", currentStock: 2, intelligence: { velocity: 1, daysRemaining: 2 } },
    ];
    const sorted = sortProducts(list, "NAME_ASC");
    expect(sorted.map(p => p.name)).toEqual(["Aluminium Bar", "brass screw", "zinc wire"]);
  });

  it("sorts correctly by STOCK_ASC (lowest stock first, name tie-break)", () => {
    const list = [
      { name: "Item B", currentStock: 50, intelligence: { velocity: 1, daysRemaining: 50 } },
      { name: "Item A", currentStock: -2, intelligence: { velocity: 1, daysRemaining: -2 } },
      { name: "Item C", currentStock: 10, intelligence: { velocity: 1, daysRemaining: 10 } },
    ];
    const sorted = sortProducts(list, "STOCK_ASC");
    expect(sorted.map(p => p.name)).toEqual(["Item A", "Item C", "Item B"]);
  });

  it("safely handles non-finite inputs (Infinity, NaN, null, undefined) without breaking", () => {
    const pNaNStock = { name: "Bad Stock", currentStock: NaN, intelligence: { velocity: 2, daysRemaining: NaN } };
    const pNullVel = { name: "Null Vel", currentStock: 15, intelligence: { velocity: null, daysRemaining: null } };
    const pInfDays = { name: "Inf Days", currentStock: 20, intelligence: { velocity: 0, daysRemaining: Infinity } };

    const sorted = sortProducts([pNaNStock, pNullVel, pInfDays], "URGENCY");
    expect(sorted).toBeDefined();
    expect(sorted.length).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/stockSorting.test.ts`
Expected: FAIL module not found.

- [ ] **Step 3: Implement `getProductUrgencyGroup`, `compareProductsByDaysRemaining`, and `sortProducts` in `src/domain/stockSorting.ts`**

Implementation details:
- Use explicit enum `UrgencyPriorityGroup`:
  - 1: `currentStock < 0`
  - 2: `currentStock === 0`
  - 3: Finite days remaining (`daysRemaining !== null && Number.isFinite(daysRemaining) && daysRemaining >= 0`)
  - 4: `velocity === 0`
  - 5: `velocity === null` or non-finite stock/velocity
- In Group 3: sort by `a.daysRemaining - b.daysRemaining`.
- Tie-break in all groups: `a.name.localeCompare(b.name, undefined, { sensitivity: "base" })`.
- Return a shallow clone `[...products].sort(...)` to strictly avoid in-place mutation.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/stockSorting.test.ts`
Expected: PASS all tests in file.

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: PASS with 0 failures across all test files.

---

### Task 3: Presentation Styling Helper and UI Utilities

**Files:**
- Create: `src/utils/stockDisplay.ts`
- Create: `src/utils/stockDisplay.test.ts`

**Interfaces:**
- Consumes: `DaysRemainingTier`, `DaysRemainingDisplay` from `src/domain/intelligence.ts`
- Produces:
  ```typescript
  export interface TierBadgeStyle {
    badgeClasses: string;
    textClasses: string;
    dotColor: string;
  }

  export function getDaysRemainingBadgeStyle(tier: DaysRemainingTier): TierBadgeStyle;
  ```

- [ ] **Step 1: Write test for UI tier styling in `src/utils/stockDisplay.test.ts`**

Verify that each tier returns high-contrast Tailwind classes suited for non-technical building material distributors:
- `DISCREPANCY` -> red/rose alert styling (`text-red-700 bg-red-50 border-red-200`)
- `OUT_OF_STOCK` -> red bold styling (`text-red-600 bg-red-50 border-red-200`)
- `CRITICAL` -> amber/red urgent styling (`text-amber-800 bg-amber-50 border-amber-200`)
- `LOW` -> amber warning styling (`text-amber-700 bg-amber-50 border-amber-200`)
- `NORMAL` -> emerald/slate calm styling (`text-slate-700 bg-slate-50 border-slate-200`)
- `NO_SALES` -> slate neutral styling (`text-slate-600 bg-slate-50 border-slate-200`)
- `NO_ESTIMATE` -> slate neutral styling (`text-slate-600 bg-slate-50 border-slate-200`)

- [ ] **Step 2: Run test to verify failure**

Run: `npx vitest run src/utils/stockDisplay.test.ts`
Expected: FAIL module not found.

- [ ] **Step 3: Implement `src/utils/stockDisplay.ts`**

Map tiers to accessible Tailwind color classes with high-contrast text.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/utils/stockDisplay.test.ts`
Expected: PASS.

---

### Task 4: UI Surface 1 & 2 — ProductCard & ProductDetailDrawer Integration

**Files:**
- Modify: `src/components/ProductCard.tsx:156-180`
- Modify: `src/components/ProductDetailDrawer.tsx:157-167`

**Interfaces:**
- Consumes:
  - `formatDaysRemainingDisplay` from `src/domain/intelligence.ts`
  - `getDaysRemainingBadgeStyle` from `src/utils/stockDisplay.ts`

- [ ] **Step 1: Update `ProductCard.tsx` "Time Left" section**

Replace ad-hoc inline `Math.round(daysRemaining)` text with `formatDaysRemainingDisplay(product.currentStock, product.intelligence.velocity, product.intelligence.daysRemaining)`:
- Display `display.text` clearly in the right column of the stock stats card.
- Apply `tierStyle.textClasses` so urgency is immediately scannable within 5 seconds.
- Retain sales velocity subline (`~X units/day sold`) when velocity > 0.

- [ ] **Step 2: Update `ProductDetailDrawer.tsx` "Estimated Left" card**

Replace `~${Math.round(daysRemaining)} days` with `display.text`:
- Display `display.text` prominently in the middle summary tile.
- Use `tierStyle.textClasses` for consistent color coding.

- [ ] **Step 3: Verify typecheck**

Run: `npm run typecheck`
Expected: 0 errors.

---

### Task 5: UI Surface 3 — StockListView Urgency Sorting & Filter Composition (with Verification)

**Files:**
- Modify: `src/components/StockListView.tsx:18-60`
- Modify: `src/domain/stockSorting.test.ts` (add filter composition tests)

**Interfaces:**
- Consumes:
  - `sortProducts`, `StockSortOption` from `src/domain/stockSorting.ts`
  - `useStock` from `@/context/StockContext`

- [ ] **Step 1: Write filter + sorting composition tests in `src/domain/stockSorting.test.ts`**

Test a simulated pipeline that verifies urgency sorting composes correctly with search, category filtering, and status filtering:
```typescript
describe("Filter and Sort Composition", () => {
  const dataset = [
    { name: "Dangote 50kg", category: "Cement", currentStock: 0, intelligence: { status: "RUNNING_LOW", velocity: 10, daysRemaining: 0 } },
    { name: "Elephant 50kg", category: "Cement", currentStock: 20, intelligence: { status: "RUNNING_LOW", velocity: 10, daysRemaining: 2 } },
    { name: "Dulux Gloss", category: "Paint", currentStock: 10, intelligence: { status: "OK", velocity: 0.5, daysRemaining: 20 } },
    { name: "Berger Emulsion", category: "Paint", currentStock: 5, intelligence: { status: "CHECK_SOON", velocity: 1, daysRemaining: 5 } },
  ];

  it("correctly filters by category and then sorts by URGENCY", () => {
    const cementOnly = dataset.filter(p => p.category === "Cement");
    const sorted = sortProducts(cementOnly, "URGENCY");
    expect(sorted.map(p => p.name)).toEqual(["Dangote 50kg", "Elephant 50kg"]);
  });

  it("correctly filters by search text, status, and then sorts by URGENCY", () => {
    const filtered = dataset
      .filter(p => p.name.toLowerCase().includes("e")) // Matches Dangote, Elephant, Berger
      .filter(p => p.intelligence.status === "RUNNING_LOW"); // Matches Dangote, Elephant
    const sorted = sortProducts(filtered, "URGENCY");
    expect(sorted.map(p => p.name)).toEqual(["Dangote 50kg", "Elephant 50kg"]);
  });
});
```

- [ ] **Step 2: Add sort option state and dropdown to `StockListView.tsx`**

- Add state `sortBy: StockSortOption = "URGENCY"`.
- Add Sort dropdown in the filter controls bar next to Category and Status filters:
  - "Days Remaining (Lowest first)" (`URGENCY`)
  - "Product Name (A–Z)" (`NAME_ASC`)
  - "Current Stock (Lowest first)" (`STOCK_ASC`)
- Feed filtered products through `sortProducts(filteredProducts, sortBy)`.
- Ensure clean composition: Search Query -> Category Filter -> Status Filter -> Sort Comparator.

- [ ] **Step 3: Verify typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: PASS with 0 failures.

---

### Task 6: UI Surface 4 — StaffHomeView Live Search Display Integration

**Files:**
- Modify: `src/components/StaffHomeView.tsx:244-254`

**Interfaces:**
- Consumes:
  - `formatDaysRemainingDisplay` from `src/domain/intelligence.ts`
  - `getDaysRemainingBadgeStyle` from `src/utils/stockDisplay.ts`

- [ ] **Step 1: Update matching product cards in `StaffHomeView.tsx`**

In the live product search results of the Staff Quick Desk:
- Call `formatDaysRemainingDisplay(p.currentStock, p.intelligence.velocity, p.intelligence.daysRemaining)`.
- Show days remaining tier text (e.g., `Critical — 2 days` or `Out of stock`) alongside current stock balance in the badge.
- Ensure 44px touch targets remain uncompromised for quick-tap selling.

- [ ] **Step 2: Verify typecheck and build**

Run: `npm run typecheck && npm run lint`
Expected: 0 errors, 0 warnings.

---

### Task 7: Full System Verification and Regression Testing

**Verified Environment Commands:**
- Typecheck: `npm run typecheck` (maps to `tsc --noEmit` in `package.json:9`)
- Tests: `npm test` (maps to `vitest run --exclude '**/.next/**'` in `package.json:10`)
- Linter: `npm run lint` (maps to `eslint .` in `package.json:8`)
- Build / Compilation: `compile_applet` / `npm run build` (maps to `NODE_ENV=production next build` in `package.json:6`)

- [ ] **Step 1: Run comprehensive test suite**

Run: `npm test`
Expected: All test suites pass with 0 failures across all domain and server test files.

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: Clean exit code 0, 0 type errors.

- [ ] **Step 3: Run linter**

Run: `npm run lint`
Expected: Clean exit code 0, 0 lint warnings or errors.

- [ ] **Step 4: Run app compilation**

Run: `compile_applet`
Expected: Applet compiles successfully.
