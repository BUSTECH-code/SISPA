/**
 * SISPA 2.0 — Packaging Conversion & Discrete Unit Mathematics
 * 
 * Domain Rules:
 * - Pure calculation and validation functions with zero database/UI dependencies.
 * - Handles base stock units vs commercial packaging units (e.g. cartons, bundles, pallets).
 * - Enforces integer validation on discrete building materials (e.g. bags of cement, roofing sheets, blocks).
 * - Tolerates floating-point precision edge cases (IEEE 754 epsilon).
 */

const EPSILON = 1e-9;

/**
 * Check whether a numeric value is effectively a discrete whole integer.
 */
export function isWholeNumber(value: number): boolean {
  if (typeof value !== "number" || !isFinite(value)) {
    return false;
  }
  return Math.abs(value - Math.round(value)) < EPSILON;
}

/**
 * Convert commercial packaging units into base inventory units.
 * e.g. 3 cartons * 12 pieces/carton = 36 pieces.
 */
export function convertPackagingQuantity(packageQuantity: number, unitsPerPackage: number): number {
  if (typeof unitsPerPackage !== "number" || isNaN(unitsPerPackage) || unitsPerPackage <= 0) {
    throw new Error("Units per package must be greater than zero.");
  }
  if (typeof packageQuantity !== "number" || isNaN(packageQuantity)) {
    throw new Error("Package quantity must be a valid number.");
  }

  const rawBase = packageQuantity * unitsPerPackage;
  // If the result is within floating-point epsilon of a whole integer, snap to integer
  return isWholeNumber(rawBase) ? Math.round(rawBase) : rawBase;
}

/**
 * Convert base inventory units into packaging representation.
 * e.g. 38 tiles with 12 tiles/carton = 3 full cartons, 2 remainder tiles.
 */
export function convertBaseToPackagingQuantity(
  baseQuantity: number,
  unitsPerPackage: number
): {
  fullPackages: number;
  remainderBase: number;
  fractionalPackages: number;
} {
  if (typeof unitsPerPackage !== "number" || isNaN(unitsPerPackage) || unitsPerPackage <= 0) {
    throw new Error("Units per package must be greater than zero.");
  }
  if (typeof baseQuantity !== "number" || isNaN(baseQuantity)) {
    throw new Error("Base quantity must be a valid number.");
  }

  const fractionalPackages = baseQuantity / unitsPerPackage;
  const fullPackages = Math.floor(fractionalPackages);
  const rawRemainder = baseQuantity - fullPackages * unitsPerPackage;
  const remainderBase = isWholeNumber(rawRemainder) ? Math.round(rawRemainder) : rawRemainder;

  return {
    fullPackages,
    remainderBase,
    fractionalPackages,
  };
}

export interface QuantityValidationParams {
  quantity: number;
  allowFractionalQuantity: boolean;
  unitName?: string;
  allowZero?: boolean;
}

export interface QuantityValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate input quantities against discrete and positivity bounds.
 */
export function validateQuantityConstraints(params: QuantityValidationParams): QuantityValidationResult {
  const { quantity, allowFractionalQuantity, unitName = "unit", allowZero = false } = params;

  if (typeof quantity !== "number" || isNaN(quantity) || !isFinite(quantity)) {
    return {
      valid: false,
      error: "Please enter a valid numeric quantity.",
    };
  }

  if (quantity < 0) {
    return {
      valid: false,
      error: "Quantity must be greater than zero.",
    };
  }

  if (quantity === 0 && !allowZero) {
    return {
      valid: false,
      error: "Quantity must be greater than zero.",
    };
  }

  if (!allowFractionalQuantity && !isWholeNumber(quantity)) {
    return {
      valid: false,
      error: `Whole units only: ${unitName} does not support fractional quantities.`,
    };
  }

  return { valid: true };
}

export interface PackagingTransactionParams {
  packageQuantity: number;
  unitsPerPackage: number;
  packageUnitName?: string;
  baseUnitName?: string;
  allowFractionalQuantity: boolean;
  allowZero?: boolean;
}

export interface PackagingTransactionResult {
  valid: boolean;
  error?: string;
  baseQuantity?: number;
}

/**
 * Validate a commercial packaging transaction (sale or delivery intake)
 * and compute the equivalent base inventory unit movement.
 */
export function validatePackagingTransaction(
  params: PackagingTransactionParams
): PackagingTransactionResult {
  const {
    packageQuantity,
    unitsPerPackage,
    packageUnitName = "package",
    baseUnitName = "unit",
    allowFractionalQuantity,
    allowZero = false,
  } = params;

  // 1. Validate package-level quantity input
  const packageValidation = validateQuantityConstraints({
    quantity: packageQuantity,
    allowFractionalQuantity,
    unitName: packageUnitName,
    allowZero,
  });

  if (!packageValidation.valid) {
    return {
      valid: false,
      error: packageValidation.error,
    };
  }

  // 2. Calculate base quantity
  let baseQuantity: number;
  try {
    baseQuantity = convertPackagingQuantity(packageQuantity, unitsPerPackage);
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || "Invalid unit conversion multiplier.",
    };
  }

  // 3. Ensure base quantity is also valid under discrete constraints
  const baseValidation = validateQuantityConstraints({
    quantity: baseQuantity,
    allowFractionalQuantity,
    unitName: baseUnitName,
    allowZero,
  });

  if (!baseValidation.valid) {
    return {
      valid: false,
      error: baseValidation.error,
    };
  }

  return {
    valid: true,
    baseQuantity,
  };
}
