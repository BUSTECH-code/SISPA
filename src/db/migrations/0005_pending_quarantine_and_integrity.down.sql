-- ============================================================================
-- SISPA 2.0 — Rollback Migration (0005_pending_quarantine_and_integrity)
-- ============================================================================

-- 1. Drop pending_stock_movements quarantine table
DROP TABLE IF EXISTS "pending_stock_movements";
--> statement-breakpoint

-- 2. Revert stock_ledger_entries constraints and idempotency index
ALTER TABLE "stock_ledger_entries" DROP CONSTRAINT IF EXISTS "stock_ledger_entries_entry_type_chk";
--> statement-breakpoint
DROP INDEX IF EXISTS "stock_ledger_business_idempotency_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_ledger_user_idempotency_idx"
  ON "stock_ledger_entries" ("user_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- 3. Revert opening_stock_items and opening_stock_sessions additions
ALTER TABLE "opening_stock_items" DROP CONSTRAINT IF EXISTS "opening_stock_items_timestamp_status_chk";
--> statement-breakpoint
ALTER TABLE "opening_stock_items" DROP CONSTRAINT IF EXISTS "opening_stock_items_status_chk";
--> statement-breakpoint
ALTER TABLE "opening_stock_items" DROP COLUMN IF EXISTS "timestamp_basis";
--> statement-breakpoint
ALTER TABLE "opening_stock_items" DROP COLUMN IF EXISTS "timestamp_status";
--> statement-breakpoint
ALTER TABLE "opening_stock_items" DROP COLUMN IF EXISTS "device_counted_at";
--> statement-breakpoint
ALTER TABLE "opening_stock_items" DROP COLUMN IF EXISTS "skew_flag";
--> statement-breakpoint

ALTER TABLE "opening_stock_sessions" DROP CONSTRAINT IF EXISTS "opening_stock_sessions_status_chk";
--> statement-breakpoint
DROP INDEX IF EXISTS "opening_stock_sessions_business_idempotency_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opening_stock_sessions_idempotency_idx"
  ON "opening_stock_sessions" ("user_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- 4. Revert sales extensions
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_financial_invariant_chk";
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_timestamp_status_chk";
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_refund_non_negative_chk";
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_original_sale_id_sales_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "sales_business_line_idempotency_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "sales_timestamp_status_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "sales_original_sale_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "sales_occurred_at_idx";
--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN IF EXISTS "device_timestamp";
--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN IF EXISTS "timestamp_basis";
--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN IF EXISTS "timestamp_status";
--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN IF EXISTS "occurred_at";
--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN IF EXISTS "line_idempotency_key";
--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN IF EXISTS "refund_amount";
--> statement-breakpoint

-- 5. Restore ON DELETE CASCADE on sales.product_id and stock_ledger_entries.product_id
ALTER TABLE "stock_ledger_entries" DROP CONSTRAINT IF EXISTS "stock_ledger_entries_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint

-- 6. Drop NOT NULL and business_id columns from tenant tables
DROP INDEX IF EXISTS "cash_checks_business_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "buying_list_business_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "ledger_business_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "expenses_business_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "payments_business_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "sales_business_id_idx";
--> statement-breakpoint
DROP INDEX IF EXISTS "customers_business_id_idx";
--> statement-breakpoint

ALTER TABLE "products" ALTER COLUMN "business_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "daily_cash_checks" DROP COLUMN IF EXISTS "business_id";
--> statement-breakpoint
ALTER TABLE "buying_list_items" DROP COLUMN IF EXISTS "business_id";
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" DROP COLUMN IF EXISTS "business_id";
--> statement-breakpoint
ALTER TABLE "expenses" DROP COLUMN IF EXISTS "business_id";
--> statement-breakpoint
ALTER TABLE "customer_payments" DROP COLUMN IF EXISTS "business_id";
--> statement-breakpoint
ALTER TABLE "sales" DROP COLUMN IF EXISTS "business_id";
--> statement-breakpoint
ALTER TABLE "customers" DROP COLUMN IF EXISTS "business_id";
--> statement-breakpoint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_business_id_businesses_id_fk";
--> statement-breakpoint

-- 7. Drop sessions.active_business_id
DROP INDEX IF EXISTS "sessions_active_business_id_idx";
--> statement-breakpoint
ALTER TABLE "sessions" DROP COLUMN IF EXISTS "active_business_id";
