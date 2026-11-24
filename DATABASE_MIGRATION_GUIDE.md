# SISPA 1.0 — Manual Database & Production Migration Guide
## How to Migrate to Your Own PostgreSQL / Supabase Database & Connect WhatsApp

This document details the exact steps and requirements to manually migrate the SISPA 1.0 database to your own PostgreSQL or Supabase database when development is complete.

---

### 1. Requirements & Prerequisites
* A PostgreSQL instance (v14+) or a Supabase project.
* Connection string URL (`DATABASE_URL`).
* Node.js v18+ and npm.

---

### 2. Authoritative Database Schema & Tables
All version-controlled migrations are in `src/db/migrations/`:
* `0000_shiny_moonstone.sql`: Creates all 11 core tables, foreign keys, unique constraints, and B-tree indexes:
  1. `users` — Multi-tenant shop owners & staff accounts (`role`, `business_owner_id`)
  2. `sessions` — Cookie-based session persistence
  3. `customers` — Customer identity, debt & phone registry
  4. `products` — Inventory catalog with unit selling prices & replenishment coverage
  5. `sales` — Authoritative sales transactions with paid & credit amounts and staff attribution
  6. `customer_payments` — Debt recovery cash/transfer payments
  7. `expenses` — Operating shop expenses (generator fuel, transport, repairs)
  8. `stock_ledger_entries` — Append-only inventory invariant (`OPENING_BALANCE`, `SALE`, `RESTOCK`, `ADJUSTMENT`, `CORRECTION`)
  9. `buying_list_items` — Simple purchase checklist
  10. `audit_logs` — Immutable business activity trail with actor attribution and human-readable descriptions
  11. `daily_cash_checks` — End-of-day cash reconciliation logs
* `0001_rls_policies.sql`: Ready-to-run Row Level Security (RLS) policies for Supabase.
* `0002_commercial_tenants_and_invitations.sql`: Commercial multi-tenant architecture & lifecycle:
  12. `businesses` — Dedicated commercial business entity with subscription plan and status
  13. `business_memberships` — User-to-business membership records with roles (`OWNER`, `STAFF`), status (`ACTIVE`, `SUSPENDED`, `DEACTIVATED`), and granular delegated capabilities
  14. `staff_invitations` — Cryptographic, single-use, expiring invitation tokens
  15. `business_subscriptions` — Subscription tracking and plan management
  16. `billing_transactions` — Audit trail for billing and payments
* `0003_offline_idempotency.sql`: Adds offline idempotency keys (`idempotency_key`) to `sales`, `stock_ledger_entries`, and `customer_payments`.
* `0004_product_catalog_and_opening_stock.sql` (rollback: `0004_product_catalog_and_opening_stock.down.sql`): Adds `product_families`, `opening_stock_sessions`, `opening_stock_items`, variant/packaging columns on `products` & `sales`, and `occurred_at` / `reconciled_entry_id` on `stock_ledger_entries`.
* `0005_pending_quarantine_and_integrity.sql` (rollback: `0005_pending_quarantine_and_integrity.down.sql`):
  - Adds `sessions.active_business_id` for explicit multi-business session context.
  - Enforces `business_id NOT NULL` + `ON DELETE RESTRICT` across all tenant-scoped tables (`products`, `customers`, `sales`, `customer_payments`, `expenses`, `stock_ledger_entries`, `buying_list_items`, `daily_cash_checks`) with deterministic ambiguity-guarded backfill.
  - Upgrades `sales.product_id` and `stock_ledger_entries.product_id` foreign keys from `ON DELETE CASCADE` to `ON DELETE RESTRICT`.
  - Extends `sales` (`refund_amount`, `line_idempotency_key`, `occurred_at`, `timestamp_status`, `timestamp_basis`, `device_timestamp`, return & financial invariant CHECKs) and `opening_stock_items` (`skew_flag`, `device_counted_at`, `timestamp_status`, `timestamp_basis`).
  - Creates `pending_stock_movements` quarantine table for timestamp-uncertain movements and dependent returns.

---

### 3. Step-by-Step Migration Instructions

#### Option A: Running Migrations via Drizzle Kit (Recommended)
1. Point your `.env` to your new database:
   ```bash
   DATABASE_URL="postgresql://postgres.[YOUR-PROJECT]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:6543/postgres?sslmode=require"
   ```
2. Apply the schema migrations:
   ```bash
   npx drizzle-kit migrate
   # OR
   npx drizzle-kit push
   ```
3. Seed default building-material catalog (optional):
   ```bash
   npx tsx src/server/runSeed.ts
   ```

#### Option B: Direct SQL Execution (Supabase SQL Editor / psql)
1. Open your database console (e.g. Supabase SQL Editor or `psql`).
2. Run the SQL file:
   ```sql
   -- Paste content from src/db/migrations/0000_shiny_moonstone.sql
   ```
3. If using Supabase with RLS:
   ```sql
   -- Paste content from src/db/migrations/0001_rls_policies.sql
   ```

---

### 4. WhatsApp Cloud API / Twilio Integration
SISPA 1.0 includes a natural language WhatsApp assistant that reads and writes from the same database layer:
* **Webhook Endpoint**: `https://your-domain.com/api/whatsapp`
* **Verification Token**: Configure `WHATSAPP_WEBHOOK_VERIFY_TOKEN` in your `.env`.
* When Meta / Twilio sends a webhook verification request, SISPA handles the challenge handshake (`hub.challenge`).
* Messages sent to the webhook are parsed by `parseNaturalLanguageInput` and execute the same authoritative actions (`recordSale`, `recordDelivery`, `recordCustomerPayment`, `getBusinessPeriodReport`).

---

### 5. Database Portability & Operational Safety Audit
* **Extensions**: Standard PostgreSQL only. No vendor-locked extensions.
* **ID generation**: Uses standard PostgreSQL `serial` integer primary keys for entities and cryptographic strings for sessions.
* **Data Types**: Clean, portable types (`text`, `integer`, `numeric(12, 2)`, `timestamp with time zone`, `boolean`).
* **Isolation**: All tables have explicit foreign keys with `ON DELETE CASCADE` referencing `users(id)` and indexes on `user_id`.
* **Export**: Owner can download a complete JSON backup at any time via `GET /api/export`.
