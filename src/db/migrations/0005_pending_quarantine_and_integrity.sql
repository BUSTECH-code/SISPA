-- ============================================================================
-- SISPA 2.0 — Task 3 Hardening: Tenant Isolation, Quarantine, Four-Timestamp
-- Model, Customer Returns & Foreign-Key Integrity
-- ============================================================================

-- 1. Sessions: explicit active business binding
ALTER TABLE "sessions" ADD COLUMN IF NOT EXISTS "active_business_id" integer REFERENCES "businesses"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_active_business_id_idx" ON "sessions" ("active_business_id");
--> statement-breakpoint

-- 2. Add business_id to remaining tenant-scoped tables
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "customer_payments" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "buying_list_items" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE "daily_cash_checks" ADD COLUMN IF NOT EXISTS "business_id" integer REFERENCES "businesses"("id") ON DELETE RESTRICT;
--> statement-breakpoint

-- Normalize invalid legacy sentinel business_id = 0 on audit_logs to NULL before adding FK
UPDATE "audit_logs" SET "business_id" = NULL WHERE "business_id" = 0;
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_business_id_businesses_id_fk" FOREIGN KEY ("business_id") REFERENCES "businesses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint

-- 3. Deterministic, ambiguity-guarded backfill for business_id
-- 3a. Products: backfill from single active OWNER business or membership if NULL
UPDATE "products" p
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = p."user_id"
    AND (
      SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = p."user_id"
    ) = 1
  LIMIT 1
)
WHERE p."business_id" IS NULL;
--> statement-breakpoint
UPDATE "products" p
SET "business_id" = (
  SELECT bm."business_id"
  FROM "business_memberships" bm
  WHERE bm."user_id" = p."user_id"
    AND bm."status" = 'ACTIVE'
    AND (
      SELECT COUNT(*) FROM "business_memberships" bm2 WHERE bm2."user_id" = p."user_id" AND bm2."status" = 'ACTIVE'
    ) = 1
  LIMIT 1
)
WHERE p."business_id" IS NULL;
--> statement-breakpoint

-- 3b. Customers, expenses, daily_cash_checks: backfill from unambiguous owner/single-membership user_id
UPDATE "customers" c
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = c."user_id"
    AND (SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = c."user_id") = 1
  LIMIT 1
)
WHERE c."business_id" IS NULL;
--> statement-breakpoint
UPDATE "customers" c
SET "business_id" = (
  SELECT bm."business_id"
  FROM "business_memberships" bm
  WHERE bm."user_id" = c."user_id"
    AND bm."status" = 'ACTIVE'
    AND (SELECT COUNT(*) FROM "business_memberships" bm2 WHERE bm2."user_id" = c."user_id" AND bm2."status" = 'ACTIVE') = 1
  LIMIT 1
)
WHERE c."business_id" IS NULL;
--> statement-breakpoint

UPDATE "expenses" e
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = e."user_id"
    AND (SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = e."user_id") = 1
  LIMIT 1
)
WHERE e."business_id" IS NULL;
--> statement-breakpoint
UPDATE "expenses" e
SET "business_id" = (
  SELECT bm."business_id"
  FROM "business_memberships" bm
  WHERE bm."user_id" = e."user_id"
    AND bm."status" = 'ACTIVE'
    AND (SELECT COUNT(*) FROM "business_memberships" bm2 WHERE bm2."user_id" = e."user_id" AND bm2."status" = 'ACTIVE') = 1
  LIMIT 1
)
WHERE e."business_id" IS NULL;
--> statement-breakpoint

UPDATE "daily_cash_checks" d
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = d."user_id"
    AND (SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = d."user_id") = 1
  LIMIT 1
)
WHERE d."business_id" IS NULL;
--> statement-breakpoint
UPDATE "daily_cash_checks" d
SET "business_id" = (
  SELECT bm."business_id"
  FROM "business_memberships" bm
  WHERE bm."user_id" = d."user_id"
    AND bm."status" = 'ACTIVE'
    AND (SELECT COUNT(*) FROM "business_memberships" bm2 WHERE bm2."user_id" = d."user_id" AND bm2."status" = 'ACTIVE') = 1
  LIMIT 1
)
WHERE d."business_id" IS NULL;
--> statement-breakpoint

-- 3c. Product-linked tables: inherit from product.business_id first, then unambiguous user_id
UPDATE "sales" s
SET "business_id" = p."business_id"
FROM "products" p
WHERE s."product_id" = p."id"
  AND s."business_id" IS NULL
  AND p."business_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "sales" s
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = s."user_id"
    AND (SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = s."user_id") = 1
  LIMIT 1
)
WHERE s."business_id" IS NULL;
--> statement-breakpoint

UPDATE "stock_ledger_entries" l
SET "business_id" = p."business_id"
FROM "products" p
WHERE l."product_id" = p."id"
  AND l."business_id" IS NULL
  AND p."business_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "stock_ledger_entries" l
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = l."user_id"
    AND (SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = l."user_id") = 1
  LIMIT 1
)
WHERE l."business_id" IS NULL;
--> statement-breakpoint

UPDATE "buying_list_items" bl
SET "business_id" = p."business_id"
FROM "products" p
WHERE bl."product_id" = p."id"
  AND bl."business_id" IS NULL
  AND p."business_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "buying_list_items" bl
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = bl."user_id"
    AND (SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = bl."user_id") = 1
  LIMIT 1
)
WHERE bl."business_id" IS NULL;
--> statement-breakpoint

-- 3d. Customer payments: inherit from customer.business_id first, then unambiguous user_id
UPDATE "customer_payments" cp
SET "business_id" = c."business_id"
FROM "customers" c
WHERE cp."customer_id" = c."id"
  AND cp."business_id" IS NULL
  AND c."business_id" IS NOT NULL;
--> statement-breakpoint
UPDATE "customer_payments" cp
SET "business_id" = (
  SELECT b.id
  FROM "businesses" b
  WHERE b."owner_user_id" = cp."user_id"
    AND (SELECT COUNT(*) FROM "businesses" b2 WHERE b2."owner_user_id" = cp."user_id") = 1
  LIMIT 1
)
WHERE cp."business_id" IS NULL;
--> statement-breakpoint

-- 3e. PostgreSQL ambiguity guard: fail loudly if any tenant row remains unassigned before NOT NULL enforcement
DO $$
DECLARE
  v_missing integer;
BEGIN
  SELECT
    (SELECT COUNT(*) FROM "products" WHERE "business_id" IS NULL) +
    (SELECT COUNT(*) FROM "customers" WHERE "business_id" IS NULL) +
    (SELECT COUNT(*) FROM "sales" WHERE "business_id" IS NULL) +
    (SELECT COUNT(*) FROM "customer_payments" WHERE "business_id" IS NULL) +
    (SELECT COUNT(*) FROM "expenses" WHERE "business_id" IS NULL) +
    (SELECT COUNT(*) FROM "stock_ledger_entries" WHERE "business_id" IS NULL) +
    (SELECT COUNT(*) FROM "buying_list_items" WHERE "business_id" IS NULL) +
    (SELECT COUNT(*) FROM "daily_cash_checks" WHERE "business_id" IS NULL)
  INTO v_missing;

  IF v_missing > 0 THEN
    RAISE EXCEPTION 'Migration 0005 aborted: % rows still have NULL business_id (ambiguous multi-business owner or missing membership). Resolve manually before retrying.', v_missing;
  END IF;
END $$;
--> statement-breakpoint

-- 4. Enforce NOT NULL and business indexes on all tenant tables
ALTER TABLE "products" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "customer_payments" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "buying_list_items" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "daily_cash_checks" ALTER COLUMN "business_id" SET NOT NULL;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "customers_business_id_idx" ON "customers" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_business_id_idx" ON "sales" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payments_business_id_idx" ON "customer_payments" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "expenses_business_id_idx" ON "expenses" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ledger_business_id_idx" ON "stock_ledger_entries" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "buying_list_business_id_idx" ON "buying_list_items" ("business_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_checks_business_id_idx" ON "daily_cash_checks" ("business_id");
--> statement-breakpoint

-- 5. Enforce ON DELETE RESTRICT on sales.product_id and stock_ledger_entries.product_id
ALTER TABLE "sales" DROP CONSTRAINT IF EXISTS "sales_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" DROP CONSTRAINT IF EXISTS "stock_ledger_entries_product_id_products_id_fk";
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint

-- 6. Extend sales for customer returns, line idempotency, and four-timestamp fields
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "refund_amount" numeric(12, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "line_idempotency_key" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "occurred_at" timestamp with time zone DEFAULT now() NOT NULL;
--> statement-breakpoint
UPDATE "sales" SET "occurred_at" = "created_at";
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "timestamp_status" text DEFAULT 'CONFIRMED' NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "timestamp_basis" text;
--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "device_timestamp" timestamp with time zone;
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "sales_occurred_at_idx" ON "sales" ("occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_original_sale_id_idx" ON "sales" ("original_sale_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sales_timestamp_status_idx" ON "sales" ("timestamp_status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "sales_business_line_idempotency_idx"
  ON "sales" ("business_id", "line_idempotency_key")
  WHERE "line_idempotency_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_original_sale_id_sales_id_fk" FOREIGN KEY ("original_sale_id") REFERENCES "sales"("id") ON DELETE RESTRICT ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_refund_non_negative_chk" CHECK ("refund_amount" >= 0);
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_timestamp_status_chk" CHECK ("timestamp_status" IN ('CONFIRMED', 'PENDING_REVIEW', 'RESOLVED_PRE_CUTOFF', 'RESOLVED_POST_CUTOFF'));
--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_financial_invariant_chk" CHECK (
  (
    "is_correction" = false
    AND "quantity" > 0
    AND "total_amount" >= 0
    AND "amount_paid" >= 0
    AND "refund_amount" = 0
    AND "outstanding_amount" >= 0
    AND "total_amount" = "amount_paid" + "outstanding_amount"
  )
  OR (
    "is_correction" = true
    AND "quantity" >= 0
    AND "total_amount" >= 0
    AND "amount_paid" >= 0
    AND "refund_amount" = 0
    AND "outstanding_amount" >= 0
  )
  OR (
    "is_correction" = true
    AND "quantity" < 0
    AND "total_amount" <= 0
    AND "amount_paid" = 0
    AND "refund_amount" >= 0
    AND "outstanding_amount" <= 0
    AND "total_amount" = ("amount_paid" - "refund_amount") + "outstanding_amount"
  )
);
--> statement-breakpoint

-- 7. Extend opening_stock_sessions & opening_stock_items
DROP INDEX IF EXISTS "opening_stock_sessions_idempotency_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "opening_stock_sessions_business_idempotency_idx"
  ON "opening_stock_sessions" ("business_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "opening_stock_sessions" ADD CONSTRAINT "opening_stock_sessions_status_chk" CHECK ("status" IN ('DRAFT', 'POSTED', 'CANCELLED'));
--> statement-breakpoint

ALTER TABLE "opening_stock_items" ADD COLUMN IF NOT EXISTS "skew_flag" text;
--> statement-breakpoint
ALTER TABLE "opening_stock_items" ADD COLUMN IF NOT EXISTS "device_counted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "opening_stock_items" ADD COLUMN IF NOT EXISTS "timestamp_status" text DEFAULT 'CONFIRMED' NOT NULL;
--> statement-breakpoint
ALTER TABLE "opening_stock_items" ADD COLUMN IF NOT EXISTS "timestamp_basis" text;
--> statement-breakpoint
ALTER TABLE "opening_stock_items" ADD CONSTRAINT "opening_stock_items_status_chk" CHECK ("status" IN ('NOT_COUNTED', 'COUNTED', 'NEEDS_RECOUNT', 'POSTED', 'STALE_SUPERSEDED'));
--> statement-breakpoint
ALTER TABLE "opening_stock_items" ADD CONSTRAINT "opening_stock_items_timestamp_status_chk" CHECK ("timestamp_status" IN ('CONFIRMED', 'PENDING_REVIEW', 'RESOLVED_PRE_CUTOFF', 'RESOLVED_POST_CUTOFF'));
--> statement-breakpoint

-- 8. Stock ledger entries: business-scoped idempotency & entry_type check
DROP INDEX IF EXISTS "stock_ledger_user_idempotency_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "stock_ledger_business_idempotency_idx"
  ON "stock_ledger_entries" ("business_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "stock_ledger_entries" ADD CONSTRAINT "stock_ledger_entries_entry_type_chk" CHECK ("entry_type" IN ('OPENING_BALANCE', 'SALE', 'RESTOCK', 'ADJUSTMENT', 'CORRECTION', 'OPENING_BALANCE_RECONCILIATION'));
--> statement-breakpoint

-- 9. Create pending_stock_movements quarantine table
CREATE TABLE IF NOT EXISTS "pending_stock_movements" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE RESTRICT,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
  "actor_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "transaction_type" text NOT NULL,
  "status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
  "sale_id" integer REFERENCES "sales"("id") ON DELETE SET NULL,
  "original_sale_id" integer REFERENCES "sales"("id") ON DELETE RESTRICT,
  "depends_on_pending_id" integer REFERENCES "pending_stock_movements"("id") ON DELETE RESTRICT,
  "quantity_delta" numeric(14, 3) NOT NULL,
  "physical_count" numeric(14, 3),
  "unit_cost" numeric(12, 2),
  "supplier_name" text,
  "notes" text,
  "device_timestamp" timestamp with time zone,
  "provisional_occurred_at" timestamp with time zone NOT NULL,
  "server_ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
  "cutoff_snapshot_at" timestamp with time zone,
  "resolved_occurred_at" timestamp with time zone,
  "timestamp_basis" text NOT NULL,
  "skew_flag" text,
  "resolved_quantity_delta" numeric(14, 3),
  "ledger_entry_id" integer REFERENCES "stock_ledger_entries"("id") ON DELETE RESTRICT,
  "reconciliation_entry_id" integer REFERENCES "stock_ledger_entries"("id") ON DELETE RESTRICT,
  "resolved_by_user_id" integer REFERENCES "users"("id") ON DELETE SET NULL,
  "resolved_at" timestamp with time zone,
  "resolution_note" text,
  "idempotency_key" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_movements_business_status_idx" ON "pending_stock_movements" ("business_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_movements_product_status_idx" ON "pending_stock_movements" ("product_id", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_movements_sale_idx" ON "pending_stock_movements" ("sale_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pending_movements_depends_on_idx" ON "pending_stock_movements" ("depends_on_pending_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pending_movements_business_idempotency_idx"
  ON "pending_stock_movements" ("business_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "pending_stock_movements" ADD CONSTRAINT "pending_movements_tx_type_chk" CHECK ("transaction_type" IN ('SALE', 'RESTOCK', 'ADJUSTMENT', 'CORRECTION'));
--> statement-breakpoint
ALTER TABLE "pending_stock_movements" ADD CONSTRAINT "pending_movements_status_chk" CHECK ("status" IN ('PENDING_REVIEW', 'RESOLVED_PRE_CUTOFF', 'RESOLVED_POST_CUTOFF'));
--> statement-breakpoint
ALTER TABLE "pending_stock_movements" ADD CONSTRAINT "pending_movements_resolution_invariant_chk" CHECK (
  (
    "status" = 'PENDING_REVIEW'
    AND "resolved_occurred_at" IS NULL
    AND "resolved_by_user_id" IS NULL
    AND "resolved_at" IS NULL
  )
  OR (
    "status" IN ('RESOLVED_PRE_CUTOFF', 'RESOLVED_POST_CUTOFF')
    AND "resolved_occurred_at" IS NOT NULL
    AND "resolved_by_user_id" IS NOT NULL
    AND "resolved_at" IS NOT NULL
  )
);
