import { describe, it, expect } from "vitest";
import {
  compareProductsByDaysRemaining,
  sortProducts,
  UrgencyPriorityGroup,
  getProductUrgencyGroup,
} from "./stockSorting";

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

    expect(sorted.map((p) => p.name)).toEqual([
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
    expect(sorted.map((p) => p.name)).toEqual(["Aluminium Bar", "brass screw", "zinc wire"]);
  });

  it("sorts correctly by STOCK_ASC (lowest stock first, name tie-break)", () => {
    const list = [
      { name: "Item B", currentStock: 50, intelligence: { velocity: 1, daysRemaining: 50 } },
      { name: "Item A", currentStock: -2, intelligence: { velocity: 1, daysRemaining: -2 } },
      { name: "Item C", currentStock: 10, intelligence: { velocity: 1, daysRemaining: 10 } },
    ];
    const sorted = sortProducts(list, "STOCK_ASC");
    expect(sorted.map((p) => p.name)).toEqual(["Item A", "Item C", "Item B"]);
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

describe("Filter and Sort Composition", () => {
  const dataset = [
    { name: "Dangote 50kg", category: "Cement", currentStock: 0, intelligence: { status: "RUNNING_LOW", velocity: 10, daysRemaining: 0 } },
    { name: "Elephant 50kg", category: "Cement", currentStock: 20, intelligence: { status: "RUNNING_LOW", velocity: 10, daysRemaining: 2 } },
    { name: "Dulux Gloss", category: "Paint", currentStock: 10, intelligence: { status: "OK", velocity: 0.5, daysRemaining: 20 } },
    { name: "Berger Emulsion", category: "Paint", currentStock: 5, intelligence: { status: "CHECK_SOON", velocity: 1, daysRemaining: 5 } },
  ];

  it("correctly filters by category and then sorts by URGENCY", () => {
    const cementOnly = dataset.filter((p) => p.category === "Cement");
    const sorted = sortProducts(cementOnly, "URGENCY");
    expect(sorted.map((p) => p.name)).toEqual(["Dangote 50kg", "Elephant 50kg"]);
  });

  it("correctly filters by search text, status, and then sorts by URGENCY", () => {
    const filtered = dataset
      .filter((p) => p.name.toLowerCase().includes("e")) // Matches Dangote, Elephant, Berger
      .filter((p) => p.intelligence.status === "RUNNING_LOW"); // Matches Dangote, Elephant
    const sorted = sortProducts(filtered, "URGENCY");
    expect(sorted.map((p) => p.name)).toEqual(["Dangote 50kg", "Elephant 50kg"]);
  });
});
