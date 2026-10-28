-- ============================================================================
-- SISPA 1.0 — Offline Transaction Idempotency Keys
-- ============================================================================

ALTER TABLE "sales" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE INDEX IF NOT EXISTS "sales_idempotency_key_idx" ON "sales" ("idempotency_key");

ALTER TABLE "stock_ledger_entries" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE INDEX IF NOT EXISTS "stock_ledger_idempotency_key_idx" ON "stock_ledger_entries" ("idempotency_key");

ALTER TABLE "customer_payments" ADD COLUMN IF NOT EXISTS "idempotency_key" text;
CREATE INDEX IF NOT EXISTS "payments_idempotency_key_idx" ON "customer_payments" ("idempotency_key");
