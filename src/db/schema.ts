import { pgTable, serial, text, integer, numeric, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

// ==========================================
// 1. Commercial Businesses & Tenants
// ==========================================
export const businesses = pgTable(
  "businesses",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    currency: text("currency").notNull().default("NGN"),
    state: text("state").notNull().default("ACTIVE"), // 'ACTIVE' | 'SUSPENDED' | 'CLOSED'
    ownerUserId: integer("owner_user_id"), // References the primary owner
    subscriptionPlan: text("subscription_plan").notNull().default("STANDARD"), // 'TRIAL' | 'STANDARD' | 'ENTERPRISE'
    subscriptionStatus: text("subscription_status").notNull().default("TRIAL"), // 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'RESTRICTED' | 'SUSPENDED' | 'CANCELLED'
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("businesses_state_idx").on(table.state),
    index("businesses_owner_idx").on(table.ownerUserId),
  ]
);

// ==========================================
// 2. Users (Identity & Credentials)
// ==========================================
export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    phone: text("phone"),
    role: text("role").notNull().default("OWNER"), // 'OWNER' | 'STAFF' (kept for backwards compatibility)
    businessName: text("business_name").notNull().default("My Building Materials Shop"),
    businessOwnerId: integer("business_owner_id"), // References owner for STAFF users (legacy)
    isActive: boolean("is_active").notNull().default(true),
    isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("users_email_idx").on(table.email),
    index("users_business_owner_idx").on(table.businessOwnerId),
  ]
);

// ==========================================
// 3. Business Memberships (Staff Lifecycle & Role Delegation)
// ==========================================
export const businessMemberships = pgTable(
  "business_memberships",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("STAFF"), // 'OWNER' | 'STAFF'
    status: text("status").notNull().default("ACTIVE"), // 'INVITED' | 'ACCEPTED' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
    customCapabilities: text("custom_capabilities"), // JSON array string of delegated capabilities e.g. ["SALE_CREATE", "DELIVERY_CREATE"]
    invitedByUserId: integer("invited_by_user_id").references(() => users.id),
    invitedAt: timestamp("invited_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("business_user_idx").on(table.businessId, table.userId),
    index("memberships_business_idx").on(table.businessId),
    index("memberships_user_idx").on(table.userId),
    index("memberships_status_idx").on(table.status),
  ]
);

// ==========================================
// 4. Staff Invitations (Owner Controlled, Single-Use, Short-Lived)
// ==========================================
export const staffInvitations = pgTable(
  "staff_invitations",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(), // Cryptographic token
    inviteeEmail: text("invitee_email"), // Optional target email
    inviteeName: text("invitee_name"), // Target display name
    role: text("role").notNull().default("STAFF"), // Default role 'STAFF'
    invitedByUserId: integer("invited_by_user_id")
      .notNull()
      .references(() => users.id),
    customCapabilities: text("custom_capabilities"), // JSON string of intended capabilities e.g. ["CAN_SELL", "CAN_RECEIVE"]
    status: text("status").notNull().default("PENDING"), // 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED'
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedByUserId: integer("accepted_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("invitations_token_idx").on(table.token),
    index("invitations_business_idx").on(table.businessId),
    index("invitations_status_idx").on(table.status),
  ]
);

// ==========================================
// 5. Business Subscriptions & Entitlements
// ==========================================
export const businessSubscriptions = pgTable(
  "business_subscriptions",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    plan: text("plan").notNull().default("STANDARD"), // 'TRIAL' | 'STANDARD' | 'ENTERPRISE'
    status: text("status").notNull().default("TRIAL"), // 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'GRACE_PERIOD' | 'RESTRICTED' | 'SUSPENDED' | 'CANCELLED'
    provider: text("provider").notNull().default("DIRECT"), // 'DIRECT' | 'PAYSTACK' | 'STRIPE'
    providerSubscriptionId: text("provider_subscription_id"),
    providerCustomerId: text("provider_customer_id"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("subscriptions_business_idx").on(table.businessId),
    index("subscriptions_status_idx").on(table.status),
  ]
);

// ==========================================
// 6. Billing & Payment Transactions
// ==========================================
export const billingTransactions = pgTable(
  "billing_transactions",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    currency: text("currency").notNull().default("NGN"),
    status: text("status").notNull().default("SUCCEEDED"), // 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REFUNDED'
    provider: text("provider").notNull().default("DIRECT"),
    providerReference: text("provider_reference"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("billing_business_idx").on(table.businessId),
    index("billing_status_idx").on(table.status),
  ]
);

// ==========================================
// 7. Scoped Platform Support Access Grants & Logs
// ==========================================
export const supportAccessLogs = pgTable(
  "support_access_logs",
  {
    id: serial("id").primaryKey(),
    businessId: integer("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    requestingUserId: integer("requesting_user_id")
      .references(() => users.id),
    platformAdminUserId: integer("platform_admin_user_id")
      .references(() => users.id),
    reason: text("reason").notNull(),
    scope: text("scope").notNull().default("ACCOUNT_WHATSAPP"), // 'ACCOUNT_WHATSAPP' | 'CATALOG_DIAGNOSTICS' | 'DEBT_RECONCILIATION' | 'SYSTEM_CONFIG' | 'READ_ONLY' | 'FULL'
    requestedDurationMinutes: integer("requested_duration_minutes").notNull().default(30),
    status: text("status").notNull().default("PENDING"), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED'
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectionReason: text("rejection_reason"),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("support_business_idx").on(table.businessId),
    index("support_admin_idx").on(table.platformAdminUserId),
    index("support_status_idx").on(table.status),
  ]
);

// ==========================================
// 8. Platform Settings & Maintenance Configuration
// ==========================================
export const platformSettings = pgTable(
  "platform_settings",
  {
    id: serial("id").primaryKey(),
    maintenanceMode: boolean("maintenance_mode").notNull().default(false),
    maintenanceNotice: text("maintenance_notice"),
    defaultTrialDays: integer("default_trial_days").notNull().default(14),
    gracePeriodDays: integer("grace_period_days").notNull().default(7),
    allowSelfRegistration: boolean("allow_self_registration").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

// Sessions for cookie-based session persistence
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_expires_at_idx").on(table.expiresAt),
  ]
);

// ==========================================
// 2. Customers (Debt & Credit Tracking)
// ==========================================
export const customers = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    address: text("address"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("customers_user_id_idx").on(table.userId),
    index("customers_name_idx").on(table.name),
  ]
);

// ==========================================
// 3. Products (Inventory Catalog)
// ==========================================
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: text("category").notNull().default("General"),
    unit: text("unit").notNull().default("units"),
    sellingPrice: numeric("selling_price", { precision: 12, scale: 2 }), // Standard default selling price
    desiredCoverageDays: integer("desired_coverage_days").notNull().default(7),
    minimumStockThreshold: integer("minimum_stock_threshold"),
    manualDailySalesOverride: numeric("manual_daily_sales_override", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("products_user_id_idx").on(table.userId),
    index("products_name_idx").on(table.name),
  ]
);

// ==========================================
// 4. Suppliers (Vendors & Deliveries)
// ==========================================
export const suppliers = pgTable(
  "suppliers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone"),
    location: text("location"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("suppliers_user_id_idx").on(table.userId),
    index("suppliers_name_idx").on(table.name),
  ]
);

// ==========================================
// 5. Sales Orders & Records
// ==========================================
export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    staffUserId: integer("staff_user_id")
      .references(() => users.id, { onDelete: "set null" }), // Who recorded it
    customerId: integer("customer_id")
      .references(() => customers.id, { onDelete: "set null" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }).notNull().default("0"),
    outstandingAmount: numeric("outstanding_amount", { precision: 12, scale: 2 }).notNull().default("0"),
    paymentStatus: text("payment_status").notNull().default("PAID"), // 'PAID' | 'PARTIAL' | 'UNPAID'
    notes: text("notes"),
    isCorrection: boolean("is_correction").notNull().default(false),
    originalSaleId: integer("original_sale_id"),
    correctionReason: text("correction_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sales_user_id_idx").on(table.userId),
    index("sales_customer_id_idx").on(table.customerId),
    index("sales_product_id_idx").on(table.productId),
    index("sales_created_at_idx").on(table.createdAt),
    index("sales_payment_status_idx").on(table.paymentStatus),
  ]
);

// ==========================================
// 6. Customer Payments (Debt Recovery)
// ==========================================
export const customerPayments = pgTable(
  "customer_payments",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    staffUserId: integer("staff_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull().default("CASH"), // 'CASH' | 'TRANSFER' | 'POS'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payments_user_id_idx").on(table.userId),
    index("payments_customer_id_idx").on(table.customerId),
    index("payments_created_at_idx").on(table.createdAt),
  ]
);

// ==========================================
// 7. Shop Expenses (Operating Costs)
// ==========================================
export const expenses = pgTable(
  "expenses",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    staffUserId: integer("staff_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("Shop Operations"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentMethod: text("payment_method").notNull().default("CASH"), // 'CASH' | 'TRANSFER' | 'POS'
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("expenses_user_id_idx").on(table.userId),
    index("expenses_created_at_idx").on(table.createdAt),
  ]
);

// ==========================================
// 8. Stock Ledger Entries (Append-only invariant)
// ==========================================
export const stockLedgerEntries = pgTable(
  "stock_ledger_entries",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    staffUserId: integer("staff_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    saleId: integer("sale_id")
      .references(() => sales.id, { onDelete: "set null" }),
    entryType: text("entry_type").notNull(), // 'OPENING_BALANCE' | 'SALE' | 'RESTOCK' | 'ADJUSTMENT' | 'CORRECTION'
    quantityDelta: numeric("quantity_delta", { precision: 12, scale: 2 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 12, scale: 2 }), // Confidential purchase price
    supplierName: text("supplier_name"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ledger_user_id_idx").on(table.userId),
    index("ledger_product_id_idx").on(table.productId),
    index("ledger_sale_id_idx").on(table.saleId),
    index("ledger_created_at_idx").on(table.createdAt),
    index("ledger_entry_type_idx").on(table.entryType),
  ]
);

// ==========================================
// 9. Buying List Items (Checklist)
// ==========================================
export const buyingListItems = pgTable(
  "buying_list_items",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantityToBuy: integer("quantity_to_buy").notNull(),
    isCompleted: boolean("is_completed").notNull().default(false),
    estimatedUnitCost: numeric("estimated_unit_cost", { precision: 12, scale: 2 }),
    supplierName: text("supplier_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("buying_list_user_id_idx").on(table.userId),
    index("buying_list_product_id_idx").on(table.productId),
  ]
);

// ==========================================
// 10. Business Audit Log / Activity Trail (Trustworthy History)
// ==========================================
export const auditLogs = pgTable(
  "audit_logs",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorName: text("actor_name").notNull(),
    actorRole: text("actor_role").notNull().default("OWNER"),
    eventType: text("event_type").notNull(),
    description: text("description").notNull(), // Plain human language description
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id"),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    reason: text("reason"),
    source: text("source").notNull().default("WEB"), // 'WEB' | 'WHATSAPP' | 'SYSTEM'
    isSensitive: boolean("is_sensitive").notNull().default(false), // Purchase prices etc.
    businessId: integer("business_id"), // Commercial Tenant ID
    beforeState: text("before_state"), // Snapshot before modification
    afterState: text("after_state"), // Snapshot after modification
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("audit_user_id_idx").on(table.userId),
    index("audit_business_id_idx").on(table.businessId),
    index("audit_created_at_idx").on(table.createdAt),
    index("audit_event_type_idx").on(table.eventType),
  ]
);

// ==========================================
// 11. Daily Cash Checks (Reconciliation)
// ==========================================
export const dailyCashChecks = pgTable(
  "daily_cash_checks",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorId: integer("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorName: text("actor_name").notNull(),
    checkDate: text("check_date").notNull(), // 'YYYY-MM-DD'
    expectedCash: numeric("expected_cash", { precision: 12, scale: 2 }).notNull(),
    actualCash: numeric("actual_cash", { precision: 12, scale: 2 }).notNull(),
    difference: numeric("difference", { precision: 12, scale: 2 }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("cash_checks_user_id_idx").on(table.userId),
    index("cash_checks_date_idx").on(table.checkDate),
  ]
);

export type Business = typeof businesses.$inferSelect;
export type NewBusiness = typeof businesses.$inferInsert;
export type BusinessMembership = typeof businessMemberships.$inferSelect;
export type NewBusinessMembership = typeof businessMemberships.$inferInsert;
export type StaffInvitation = typeof staffInvitations.$inferSelect;
export type NewStaffInvitation = typeof staffInvitations.$inferInsert;
export type BusinessSubscription = typeof businessSubscriptions.$inferSelect;
export type NewBusinessSubscription = typeof businessSubscriptions.$inferInsert;
export type BillingTransaction = typeof billingTransactions.$inferSelect;
export type NewBillingTransaction = typeof billingTransactions.$inferInsert;
export type SupportAccessLog = typeof supportAccessLogs.$inferSelect;
export type NewSupportAccessLog = typeof supportAccessLogs.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;
export type Supplier = typeof suppliers.$inferSelect;
export type NewSupplier = typeof suppliers.$inferInsert;
export type Sale = typeof sales.$inferSelect;
export type NewSale = typeof sales.$inferInsert;
export type CustomerPayment = typeof customerPayments.$inferSelect;
export type NewCustomerPayment = typeof customerPayments.$inferInsert;
export type Expense = typeof expenses.$inferSelect;
export type NewExpense = typeof expenses.$inferInsert;
export type StockLedgerEntry = typeof stockLedgerEntries.$inferSelect;
export type NewStockLedgerEntry = typeof stockLedgerEntries.$inferInsert;
export type BuyingListItem = typeof buyingListItems.$inferSelect;
export type NewBuyingListItem = typeof buyingListItems.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
export type DailyCashCheck = typeof dailyCashChecks.$inferSelect;
export type NewDailyCashCheck = typeof dailyCashChecks.$inferInsert;
