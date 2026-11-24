import { describe, it, expect } from "vitest";
import {
  convertPackagingQuantity,
  convertBaseToPackagingQuantity,
  validateQuantityConstraints,
  validatePackagingTransaction,
} from "./packaging";

describe("Task 2: Packaging Conversion Mathematics", () => {
  it("converts packaging units into base inventory units accurately", () => {
    // 3 cartons of 12 tiles = 36 tiles
    expect(convertPackagingQuantity(3, 12)).toBe(36);
    // 5 pallets of 40 bags of cement = 200 bags
    expect(convertPackagingQuantity(5, 40)).toBe(200);
    // 1 bundle of 10 rebar lengths = 10 lengths
    expect(convertPackagingQuantity(1, 10)).toBe(10);
    // 1:1 unit conversion (no multiplier)
    expect(convertPackagingQuantity(15, 1)).toBe(15);
  });

  it("handles fractional packaging units when allowed", () => {
    // 2.5 bundles of 10 = 25 units
    expect(convertPackagingQuantity(2.5, 10)).toBe(25);
    // 0.5 rolls of 100 meters = 50 meters
    expect(convertPackagingQuantity(0.5, 100)).toBe(50);
  });

  it("rejects non-positive unitsPerPackage multiplier", () => {
    expect(() => convertPackagingQuantity(5, 0)).toThrow("Units per package must be greater than zero");
    expect(() => convertPackagingQuantity(5, -2)).toThrow("Units per package must be greater than zero");
  });

  it("converts base units into packaging representation with full packages and remainder", () => {
    // 38 tiles with 12 tiles/carton = 3 full cartons, 2 remainder tiles
    const res1 = convertBaseToPackagingQuantity(38, 12);
    expect(res1.fullPackages).toBe(3);
    expect(res1.remainderBase).toBe(2);
    expect(res1.fractionalPackages).toBeCloseTo(3.167, 3);

    // Exact multiple: 40 bags with 40 bags/pallet = 1 pallet, 0 remainder
    const res2 = convertBaseToPackagingQuantity(40, 40);
    expect(res2.fullPackages).toBe(1);
    expect(res2.remainderBase).toBe(0);
    expect(res2.fractionalPackages).toBe(1);
  });
});

describe("Task 2: Discrete and Fractional Quantity Validation", () => {
  it("permits whole integer quantities for discrete items", () => {
    const res = validateQuantityConstraints({
      quantity: 5,
      allowFractionalQuantity: false,
      unitName: "bag",
    });
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it("rejects fractional quantities for discrete items with a clear explanatory error", () => {
    const res = validateQuantityConstraints({
      quantity: 2.5,
      allowFractionalQuantity: false,
      unitName: "bag",
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Whole units only");
    expect(res.error).toContain("bag does not support fractional quantities");
  });

  it("permits fractional quantities when allowFractionalQuantity is true", () => {
    const res1 = validateQuantityConstraints({
      quantity: 12.375,
      allowFractionalQuantity: true,
      unitName: "kg",
    });
    expect(res1.valid).toBe(true);

    const res2 = validateQuantityConstraints({
      quantity: 0.5,
      allowFractionalQuantity: true,
      unitName: "meter",
    });
    expect(res2.valid).toBe(true);
  });

  it("rejects negative quantities", () => {
    const res = validateQuantityConstraints({
      quantity: -5,
      allowFractionalQuantity: true,
      unitName: "kg",
    });
    expect(res.valid).toBe(false);
    expect(res.error).toContain("Quantity must be greater than zero");
  });

  it("handles zero quantity based on allowZero parameter", () => {
    const resDisallow = validateQuantityConstraints({
      quantity: 0,
      allowFractionalQuantity: true,
      unitName: "kg",
      allowZero: false,
    });
    expect(resDisallow.valid).toBe(false);

    const resAllow = validateQuantityConstraints({
      quantity: 0,
      allowFractionalQuantity: false,
      unitName: "bag",
      allowZero: true,
    });
    expect(resAllow.valid).toBe(true);
  });

  it("handles floating-point edge cases safely without false rejections", () => {
    // 3.0000000000000004 should be treated as whole 3
    const res = validateQuantityConstraints({
      quantity: 3.0000000000000004,
      allowFractionalQuantity: false,
      unitName: "piece",
    });
    expect(res.valid).toBe(true);
  });

  it("validates packaging transactions ensuring base conversion is discrete when required", () => {
    // 3 cartons of 12 pieces = 36 pieces (discrete item) -> valid
    const validTx = validatePackagingTransaction({
      packageQuantity: 3,
      unitsPerPackage: 12,
      packageUnitName: "carton",
      baseUnitName: "piece",
      allowFractionalQuantity: false,
    });
    expect(validTx.valid).toBe(true);
    expect(validTx.baseQuantity).toBe(36);

    // 1.5 cartons of 12 pieces (discrete item) -> rejected because carton is fractional for discrete product
    const invalidTx1 = validatePackagingTransaction({
      packageQuantity: 1.5,
      unitsPerPackage: 12,
      packageUnitName: "carton",
      baseUnitName: "piece",
      allowFractionalQuantity: false,
    });
    expect(invalidTx1.valid).toBe(false);
    expect(invalidTx1.error).toContain("Whole units only");

    // Fractional packaging allowed for bulk materials (e.g. 1.5 bags of 25kg sand = 37.5kg)
    const validFractional = validatePackagingTransaction({
      packageQuantity: 1.5,
      unitsPerPackage: 25,
      packageUnitName: "bag",
      baseUnitName: "kg",
      allowFractionalQuantity: true,
    });
    expect(validFractional.valid).toBe(true);
    expect(validFractional.baseQuantity).toBe(37.5);
  });
});
