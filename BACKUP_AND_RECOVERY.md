# SISPA 1.0 — Database Backup, Recovery & Operational Safety Guide

This document details the operational safety, automated backup workflows, disaster recovery procedures, and data export strategies for SISPA 1.0.

---

## 1. DATA SAFETY & IMMUTABILITY INVARIANT

SISPA guarantees that financial and inventory records cannot be silently rewritten or erased:
* **Append-Only Stock Ledger (`stock_ledger_entries`)**: Stock balance is dynamically computed via `SUM(quantity_delta)`. Historical entries are never updated or deleted. Corrections create new `CORRECTION` or `ADJUSTMENT` entries.
* **Audit Trail (`audit_logs`)**: Every sale, shipment arrival, debt recovery payment, price change, and expense records:
  - Acting user ID and Full Name
  - Role (`OWNER` or `STAFF`)
  - Timestamp
  - Affected entity and old/new values
  - Explanatory business reason
  - Source (`WEB`, `WHATSAPP`, `SYSTEM`)
* **Commercial Sensitivity**: Staff members are authorized only for operational tasks (recording sales, receiving goods, counting inventory). Sensitive purchase costs, supplier prices, and business profit calculations are strictly redacted server-side.

---

## 2. BACKUP STRATEGY (PRODUCTION POSTGRESQL / SUPABASE)

### A. Daily Automated Logical Backups (pg_dump)
For self-hosted PostgreSQL or cloud VPS:
```bash
# Automated daily backup script (run via cron)
pg_dump "postgresql://USER:PASSWORD@HOST:5432/DATABASE" \
  --format=custom \
  --blobs \
  --file="/backups/sispa_backup_$(date +%Y%m%d_%H%M%S).dump"
```
* **Retention Policy**: Retain daily dumps for 30 days, weekly dumps for 12 weeks, monthly dumps for 12 months.
* **Offsite Replication**: Encrypt backups and push to AWS S3, Google Cloud Storage, or Cloudflare R2.

### B. Supabase Continuous Point-in-Time Recovery (PITR)
If running on Supabase:
* Supabase executes daily automated backups on all projects.
* On Pro tiers, **Point-in-Time Recovery (PITR)** enables rolling back the database to any second within the past 7 days, protecting against accidental bulk deletions or corrupted imports.

---

## 3. DISASTER RECOVERY PROCEDURES

In the event of database server failure or data corruption:

### Step 1: Provision Clean Database Instance
Verify that the new database instance is running PostgreSQL 14+ and accessible via `DATABASE_URL`.

### Step 2: Restore from Latest pg_dump
```bash
# Terminate active client connections
psql -d "DATABASE_URL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid();"

# Restore schema and data
pg_restore --clean --if-exists --no-owner --no-privileges -d "DATABASE_URL" /backups/sispa_backup_LATEST.dump
```

### Step 3: Verify Integrity & Foreign Keys
Run verification queries:
```sql
-- Check total active products and derived stock
SELECT count(*) FROM products;
SELECT count(*) FROM stock_ledger_entries;
SELECT count(*) FROM sales;
SELECT count(*) FROM audit_logs;
```

---

## 4. IN-APP DATA EXPORT (OWNER BACKUP TOOL)

Shop owners can download a complete backup of their business data directly from the SISPA web application at any time:
* **Endpoint**: `GET /api/export` (Restricted to `OWNER` role)
* **Payload**: Formatted JSON containing:
  - Business profile & shop name
  - Complete product catalog with selling prices and coverage settings
  - Full sales transaction history
  - Customer registry with credit balances
  - Customer debt payment history
  - Operating expenses log
  - Append-only stock ledger entries
  - Complete business activity audit trail
  - Daily cash check reconciliation logs
* **Usage**: On the Attention Feed, Audit Trail, or Reports screen, click **"Export Backup (JSON)"**.

---

## 5. APPLICATION FAILURE RESILIENCE
* **Stateless Next.js Server**: The Next.js application runtime maintains zero state in memory. All state resides in PostgreSQL.
* **Server Restarts**: If the Node.js process restarts, active user sessions remain valid because sessions are stored in the database `sessions` table.
* **Offline Notice**: If network connectivity drops while a staff member or owner is recording an event, the application does not falsely report success; it surfaces a clear retry alert.
