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
