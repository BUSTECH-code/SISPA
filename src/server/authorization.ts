/**
 * SISPA 1.0 — Central Capability-Based Authorization & Tenant Policy Engine
 * 
 * Rules:
 * - Commercial SaaS capability-based authorization: can(context, capability, resource)
 * - Strict tenant isolation: Actor cannot access another business
 * - Commercial sensitivity: Purchase costs, profit, reports, expenses are restricted
 * - Staff lifecycle enforcement: Only ACTIVE members can perform actions
 * - Subscription & Entitlement enforcement: Checked centrally, not scattered
 * - Explicit Support Access: Platform admins cannot casually inspect customer data
 */

export type Capability =
  | "SALE_CREATE"
  | "PAYMENT_CREATE"
  | "DELIVERY_CREATE"
  | "STOCK_COUNT"
  | "SELLING_PRICE_CHANGE"
  | "PURCHASE_COST_VIEW"
  | "PURCHASE_COST_EDIT"
  | "EXPENSE_CREATE"
  | "EXPENSE_VIEW"
  | "REPORT_VIEW"
  | "STAFF_MANAGE"
  | "EXPORT_DATA"
  | "BUSINESS_SETTINGS"
  | "OWNERSHIP_TRANSFER"
  | "AUDIT_VIEW_SENSITIVE"
  | "CASH_CHECK_CREATE"
  | "CASH_CHECK_VIEW"
  | "PRODUCT_CREATE"
  | "PRODUCT_EDIT"
  | "BUYING_DECISION";

export type MembershipRole = "OWNER" | "STAFF";

export type MembershipStatus =
  | "INVITED"
  | "ACCEPTED"
  | "ACTIVE"
  | "SUSPENDED"
  | "DEACTIVATED";

export type BusinessState = "ACTIVE" | "SUSPENDED" | "CLOSED";

export type SubscriptionStatus =
  | "TRIAL"
  | "ACTIVE"
  | "PAST_DUE"
  | "GRACE_PERIOD"
  | "RESTRICTED"
  | "SUSPENDED"
  | "CANCELLED";

export type SubscriptionPlan = "TRIAL" | "STANDARD" | "ENTERPRISE";

export type Entitlement =
  | "OPERATIONAL_RECORDING" // Sales, deliveries, counts
  | "MULTI_USER_STAFF"
  | "EXPORT_BUSINESS_DATA"
  | "ADVANCED_REPORTS"
  | "WHATSAPP_ASSISTANT"
  | "UNLIMITED_PRODUCTS";

export interface AuthContext {
  userId: number;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  user?: {
    id: number;
    email: string;
    fullName: string;
    phone?: string | null;
  };
  business: {
    id: number;
    name: string;
    currency: string;
    state: BusinessState;
    ownerUserId: number;
    subscriptionPlan: SubscriptionPlan;
    subscriptionStatus: SubscriptionStatus;
    trialEndsAt: Date | null;
    currentPeriodEnd: Date | null;
  };
  membership: {
    id: number;
    role: MembershipRole;
    status: MembershipStatus;
    customCapabilities: Capability[];
  };
  activeSupportGrant?: {
    platformAdminUserId: number;
    reason: string;
    scope: "READ_ONLY" | "FULL";
    expiresAt: Date;
  };
}

/**
 * Standard Capabilities Granted to Roles by Default
 */
export const OWNER_DEFAULT_CAPABILITIES: readonly Capability[] = [
  "SALE_CREATE",
  "PAYMENT_CREATE",
  "DELIVERY_CREATE",
  "STOCK_COUNT",
  "SELLING_PRICE_CHANGE",
  "PURCHASE_COST_VIEW",
  "PURCHASE_COST_EDIT",
  "EXPENSE_CREATE",
  "EXPENSE_VIEW",
  "REPORT_VIEW",
  "STAFF_MANAGE",
  "EXPORT_DATA",
  "BUSINESS_SETTINGS",
  "OWNERSHIP_TRANSFER",
  "AUDIT_VIEW_SENSITIVE",
  "CASH_CHECK_CREATE",
  "CASH_CHECK_VIEW",
  "PRODUCT_CREATE",
  "PRODUCT_EDIT",
  "BUYING_DECISION",
];

export const STAFF_DEFAULT_CAPABILITIES: readonly Capability[] = [
  "SALE_CREATE",
  "PAYMENT_CREATE",
  "DELIVERY_CREATE", // Goods receipt (quantity & supplier, NOT purchase cost)
  "STOCK_COUNT",
  "CASH_CHECK_CREATE",
  "PRODUCT_CREATE", // Can enter product catalog details, NOT sensitive purchase costs
  "EXPENSE_CREATE", // Operational expenses (fuel, offloading, minor repairs)
];

/**
 * Entitlements enabled per Subscription Plan
 */
export const PLAN_ENTITLEMENTS: Record<SubscriptionPlan, readonly Entitlement[]> = {
  TRIAL: [
    "OPERATIONAL_RECORDING",
    "MULTI_USER_STAFF",
    "EXPORT_BUSINESS_DATA",
    "ADVANCED_REPORTS",
    "WHATSAPP_ASSISTANT",
    "UNLIMITED_PRODUCTS",
  ],
  STANDARD: [
    "OPERATIONAL_RECORDING",
    "MULTI_USER_STAFF",
    "EXPORT_BUSINESS_DATA",
    "ADVANCED_REPORTS",
    "WHATSAPP_ASSISTANT",
    "UNLIMITED_PRODUCTS",
  ],
  ENTERPRISE: [
    "OPERATIONAL_RECORDING",
    "MULTI_USER_STAFF",
    "EXPORT_BUSINESS_DATA",
    "ADVANCED_REPORTS",
    "WHATSAPP_ASSISTANT",
    "UNLIMITED_PRODUCTS",
  ],
};

/**
 * Check whether a business currently has an entitlement
 */
export function hasEntitlement(
  business: AuthContext["business"],
  entitlement: Entitlement
): boolean {
  // If business is suspended or closed, all commercial entitlements are blocked
  if (business.state !== "ACTIVE") {
    return false;
  }

  // If subscription is cancelled or suspended, block non-essential entitlements
  if (
    business.subscriptionStatus === "SUSPENDED" ||
    business.subscriptionStatus === "CANCELLED"
  ) {
    return false;
  }

  // Check trial expiration
  if (
    business.subscriptionStatus === "TRIAL" &&
    business.trialEndsAt &&
    new Date() > new Date(business.trialEndsAt)
  ) {
    // In restricted trial grace period, operational recording still works for safety
    if (entitlement === "OPERATIONAL_RECORDING") {
      return true;
    }
    return false;
  }

  const planEntitlements = PLAN_ENTITLEMENTS[business.subscriptionPlan] || [];
  return planEntitlements.includes(entitlement);
}

/**
 * Central Capability-Based Authorization Rule
 * can(context, capability, resource)
 */
export function can(
  context: AuthContext | null | undefined,
  capability: Capability,
  resource?: { businessId?: number }
): boolean {
  if (!context) return false;

  const { business, membership, isPlatformAdmin, activeSupportGrant } = context;

  // Platform admin checking: must have an active, non-expired support grant
  if (isPlatformAdmin) {
    if (!activeSupportGrant) {
      return false; // Platform Admin has NO casual access without explicit grant
    }
    if (new Date() > new Date(activeSupportGrant.expiresAt)) {
      return false;
    }
    // Read-only grants block mutations
    if (
      activeSupportGrant.scope === "READ_ONLY" &&
      (capability.endsWith("_CREATE") ||
        capability.endsWith("_EDIT") ||
        capability === "OWNERSHIP_TRANSFER" ||
        capability === "STAFF_MANAGE" ||
        capability === "SELLING_PRICE_CHANGE")
    ) {
      return false;
    }
    return true;
  }

  // Verify business state
  if (business.state !== "ACTIVE") {
    return false;
  }

  // Verify membership status: only ACTIVE members can act
  if (membership.status !== "ACTIVE") {
    return false;
  }

  // Verify tenant boundary if resource specified
  if (resource && resource.businessId !== undefined && resource.businessId !== business.id) {
    return false; // Cross-business breach strictly blocked
  }

  // Owners have full business capability
  if (membership.role === "OWNER") {
    return true;
  }

  // Staff members: check default staff capabilities or explicitly delegated custom capabilities
  if (STAFF_DEFAULT_CAPABILITIES.includes(capability)) {
    return true;
  }

  if (membership.customCapabilities && membership.customCapabilities.includes(capability)) {
    return true;
  }

  return false;
}

/**
 * Throw a descriptive, standardized authorization error if capability is missing
 */
export function assertCan(
  context: AuthContext | null | undefined,
  capability: Capability,
  resource?: { businessId?: number }
): asserts context is AuthContext {
  if (!context) {
    throw new Error("UNAUTHORIZED");
  }

  if (context.business.state !== "ACTIVE") {
    throw new Error(`BUSINESS_${context.business.state}`);
  }

  if (context.membership.status === "SUSPENDED") {
    throw new Error("STAFF_SUSPENDED");
  }

  if (context.membership.status === "DEACTIVATED") {
    throw new Error("STAFF_DEACTIVATED");
  }

  if (resource && resource.businessId !== undefined && resource.businessId !== context.business.id) {
    throw new Error("FORBIDDEN_CROSS_BUSINESS");
  }

  if (!can(context, capability, resource)) {
    throw new Error(`FORBIDDEN_${capability}`);
  }
}

/**
 * Redact sensitive fields (Purchase Cost, Margins, Supplier Price) for Staff
 */
export function redactSensitiveDataForStaff<T extends Record<string, any>>(
  data: T,
  context: AuthContext
): T {
  if (can(context, "PURCHASE_COST_VIEW")) {
    return data;
  }

  // Deep clone or shallow copy and redact
  const copy: Record<string, any> = { ...data };
  if ("unitCost" in copy) copy.unitCost = null;
  if ("openingUnitCost" in copy) copy.openingUnitCost = null;
  if ("estimatedUnitCost" in copy) copy.estimatedUnitCost = null;
  if ("costOfGoodsSold" in copy) copy.costOfGoodsSold = null;
  if ("estimatedProfit" in copy) copy.estimatedProfit = null;
  if ("profitBreakdown" in copy) copy.profitBreakdown = null;
  if ("restockExpenditure" in copy) copy.restockExpenditure = null;
  if ("operatingExpenses" in copy) copy.operatingExpenses = null;
  if ("totalMoneySpent" in copy) copy.totalMoneySpent = null;

  return copy as T;
}
