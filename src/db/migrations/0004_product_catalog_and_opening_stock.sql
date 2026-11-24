-- ============================================================================
-- SISPA 2.0 — Product Catalogue, Packaging & Opening Stock
-- ============================================================================

-- 1. Create product_families table (Hierarchy: Category -> Family -> Variant)
CREATE TABLE IF NOT EXISTS "product_families" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE RESTRICT,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "category" text DEFAULT 'General' NOT NULL,
  "brand" text,
  "description" text,
  "default_stock_unit" text DEFAULT 'units' NOT NULL,
  "suggested_attributes" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_families_business_id_idx" ON "product_families" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_families_user_id_idx" ON "product_families" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_families_name_idx" ON "product_families" ("name");
--> statement-breakpoint

-- 2. Create opening_stock_sessions table
CREATE TABLE IF NOT EXISTS "opening_stock_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE RESTRICT,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" text NOT NULL,
  "status" text DEFAULT 'DRAFT' NOT NULL,
  "notes" text,
  "idempotency_key" text,
  "posted_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_stock_sessions_business_id_idx" ON "opening_stock_sessions" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_stock_sessions_user_id_idx" ON "opening_stock_sessions" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_stock_sessions_status_idx" ON "opening_stock_sessions" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opening_stock_sessions_idempotency_idx" 
  ON "opening_stock_sessions" ("user_id", "idempotency_key") 
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

-- 3. Create opening_stock_items table (ON DELETE RESTRICT on session_id and product_id)
CREATE TABLE IF NOT EXISTS "opening_stock_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "session_id" integer NOT NULL REFERENCES "opening_stock_sessions"("id") ON DELETE RESTRICT,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "counted_quantity" numeric(14, 3),
  "counted_at" timestamp with time zone,
  "status" text DEFAULT 'NOT_COUNTED' NOT NULL,
  "counted_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "unit_cost" numeric(12, 2),
  "notes" text,
  "reconciled_baseline" numeric(14, 3),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opening_stock_items_session_product_idx" 
  ON "opening_stock_items" ("session_id", "product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_stock_items_session_id_idx" ON "opening_stock_items" ("session_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_stock_items_product_id_idx" ON "opening_stock_items" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "opening_stock_items_status_idx" ON "opening_stock_items" ("status");
--> statement-breakpoint

-- 4. Extend products table for variants, packaging, business tenant, and physical verification
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "family_id" integer REFERENCES "product_families"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "sku" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "variant_name" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "brand" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "attributes" jsonb;
--> statement-breakpoint

-- Safe stock_unit addition and NULL-based backfill preserving existing units
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_unit" text;
--> statement-breakpoint
UPDATE "products" 
SET "stock_unit" = CASE WHEN "unit" IS NOT NULL AND "unit" != '' THEN "unit" ELSE 'units' END 
WHERE "stock_unit" IS NULL;
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "stock_unit" SET DEFAULT 'units';
--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "stock_unit" SET NOT NULL;
--> statement-breakpoint

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "packaging_unit" text;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "units_per_package" numeric(10, 4) DEFAULT 1.0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "allow_fractional_quantity" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "verification_status" text DEFAULT 'UNVERIFIED' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "last_verified_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "last_verified_quantity" numeric(14, 3);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "last_verified_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL;
--> statement-breakpoint

-- Deterministic business_id backfill for existing products
UPDATE "products" p
SET "business_id" = sub.business_id
FROM (
  SELECT DISTINCT ON (bm.user_id) bm.user_id, bm.business_id
  FROM "business_memberships" bm
  JOIN "businesses" b ON b.id = bm.business_id
  WHERE bm.role = 'OWNER'
  ORDER BY bm.user_id, b.created_at ASC, b.id ASC
) sub
WHERE p.user_id = sub.user_id 
  AND p.business_id IS NULL;
--> statement-breakpoint

UPDATE "products" p
SET "business_id" = sub.id
FROM (
  SELECT DISTINCT ON (owner_user_id) id, owner_user_id
  FROM "businesses"
  ORDER BY owner_user_id, created_at ASC, id ASC
) sub
WHERE p.user_id = sub.owner_user_id 
  AND p.business_id IS NULL;
--> statement-breakpoint

-- Business-scoped unique SKU constraint
CREATE UNIQUE INDEX IF NOT EXISTS "products_business_sku_idx" 
  ON "products" ("business_id", "sku") 
  WHERE "business_id" IS NOT NULL AND "sku" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "products_family_id_idx" ON "products" ("family_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_business_id_idx" ON "products" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "products_verification_status_idx" ON "products" ("verification_status");
--> statement-breakpoint

-- 5. Extend stock_ledger_entries with occurred_at and reconciliation link
ALTER TABLE "stock_ledger_entries" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD COLUMN IF NOT EXISTS "reconciled_entry_id" integer REFERENCES "stock_ledger_entries"("id") ON DELETE RESTRICT;
--> statement-breakpoint

-- Single reconciliation entry per ledger entry constraint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_ledger_reconciled_entry_idx" 
  ON "stock_ledger_entries" ("reconciled_entry_id") 
  WHERE "reconciled_entry_id" IS NOT NULL;
--> statement-breakpoint

-- Strict idempotency index per user and idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS "stock_ledger_user_idempotency_idx" 
  ON "stock_ledger_entries" ("user_id", "idempotency_key") 
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "stock_ledger_occurred_at_idx" ON "stock_ledger_entries" ("occurred_at");
--> statement-breakpoint

-- 6. Extend sales table with packaging units
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "sale_unit" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "packaging_unit" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "units_per_package" numeric(10, 4);
