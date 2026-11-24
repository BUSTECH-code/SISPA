-- ============================================================================
-- SISPA 2.0 — Rollback Migration (0004_product_catalog_and_opening_stock)
-- ============================================================================

-- 1. Drop sales packaging columns
ALTER TABLE "sales" DROP COLUMN IF EXISTS "units_per_package";
ALTER TABLE "sales" DROP COLUMN IF EXISTS "packaging_unit";
ALTER TABLE "sales" DROP COLUMN IF EXISTS "sale_unit";

-- 2. Drop stock_ledger_entries columns and indexes
DROP INDEX IF EXISTS "stock_ledger_occurred_at_idx";
DROP INDEX IF EXISTS "stock_ledger_user_idempotency_idx";
DROP INDEX IF EXISTS "stock_ledger_reconciled_entry_idx";
ALTER TABLE "stock_ledger_entries" DROP COLUMN IF EXISTS "reconciled_entry_id";
ALTER TABLE "stock_ledger_entries" DROP COLUMN IF EXISTS "occurred_at";

-- 3. Drop products columns and indexes
DROP INDEX IF EXISTS "products_verification_status_idx";
DROP INDEX IF EXISTS "products_business_id_idx";
DROP INDEX IF EXISTS "products_family_id_idx";
DROP INDEX IF EXISTS "products_business_sku_idx";

ALTER TABLE "products" DROP COLUMN IF EXISTS "last_verified_by_user_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "last_verified_quantity";
ALTER TABLE "products" DROP COLUMN IF EXISTS "last_verified_at";
ALTER TABLE "products" DROP COLUMN IF EXISTS "verification_status";
ALTER TABLE "products" DROP COLUMN IF EXISTS "allow_fractional_quantity";
ALTER TABLE "products" DROP COLUMN IF EXISTS "units_per_package";
ALTER TABLE "products" DROP COLUMN IF EXISTS "packaging_unit";
ALTER TABLE "products" DROP COLUMN IF EXISTS "stock_unit";
ALTER TABLE "products" DROP COLUMN IF EXISTS "attributes";
ALTER TABLE "products" DROP COLUMN IF EXISTS "brand";
ALTER TABLE "products" DROP COLUMN IF EXISTS "variant_name";
ALTER TABLE "products" DROP COLUMN IF EXISTS "sku";
ALTER TABLE "products" DROP COLUMN IF EXISTS "family_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "business_id";

-- 4. Drop opening_stock_items table
DROP TABLE IF EXISTS "opening_stock_items";

-- 5. Drop opening_stock_sessions table
DROP TABLE IF EXISTS "opening_stock_sessions";

-- 6. Drop product_families table
DROP TABLE IF EXISTS "product_families";
