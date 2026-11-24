# SISPA Product Catalogue & Opening Stock Design Specification (Approved Architecture)

## 1. Executive Summary & Purpose

SISPA 2 must support building-materials distributors managing hundreds of distinct product variants, starting with no prior digital catalogue and only partial knowledge of physical stock on warehouse shelves.

This specification details:
1. **Product Catalogue Hierarchy:** Category → Product Family → Sellable Variant (SKU), with customizable variant attributes (size, gauge, color, brand).
2. **Packaging & Unit Conversions:** Base inventory unit (`stockUnit`) vs commercial packaging unit (`packagingUnit`, `unitsPerPackage`) for both sales and deliveries, with discrete integer quantity validation.
3. **Late-Arriving Offline Transaction Reconciliation:** An append-only, idempotent reconciliation algorithm that correctly reconciles physical cut-off shelf counts with offline sales and deliveries that arrive after stocktake posting without rewriting ledger history.
4. **Strict Concurrency & Deterministic Product-Row Locking:** Exclusive row locking on all stock-changing operations (`ORDER BY id ASC FOR UPDATE`) preventing race conditions between sales, deliveries, offline sync, and stocktake posting.
5. **Business-Scoped SKU Uniqueness:** `UNIQUE INDEX` on `(business_id, sku)` with clear `NULL` semantics, correctly scoped to the commercial business entity.
6. **Authoritative Verification State Model:** A 3-state product model (`UNVERIFIED`, `VERIFIED`, `NEEDS_RECOUNT`) with defined lifecycle transitions, alert rules, and partial-session safety (uncounted products remain unverified and are never assumed zero).
7. **Timestamp Validation Policy:** Server-assigned timestamps for online operations; bounded validation, skew clamping, and sanity checks for offline device timestamps.
8. **Financial & Reporting Isolation:** Explicit exclusion of reconciliation ledger entries from revenue, sales, expenditure, and purchasing analytics.
9. **Secure Onboarding:** Individual variant creation and bulk CSV import with template generation, dry-run preview, and server-side cost redaction for staff.
10. **Multi-Tier Rollback & Migration Safety:** Transactional DDL migrations, additive backward compatibility, and isolated recovery procedures.

---

## 2. Late-Arriving Offline Transaction Reconciliation Algorithm

### 2.1 The Problem
When a physical shelf count is conducted at cut-off timestamp $T_{\text{count}}$, the physical count $Q_{\text{physical}}$ already reflects all physical movements that occurred prior to $T_{\text{count}}$, including sales and deliveries recorded on offline mobile devices that have not yet synchronized with the server.

If a transaction occurring at $T_{\text{tx}} \le T_{\text{count}}$ synchronizes after the opening stock session has already posted at $T_{\text{post}}$:
- Recording an ordinary sale ($\Delta = -X$) would double-subtract stock that was already missing from the shelf at count time.
- Recording an ordinary delivery ($\Delta = +Y$) would double-add stock that was already physically counted on the shelf.
- Rewriting historical `OPENING_BALANCE` entries violates the SISPA append-only ledger invariant and breaks historical reporting.

### 2.2 The Append-Only Reconciliation Mechanism
Let $T_{\text{cut\_off}}$ be the physical count cut-off timestamp (`counted_at`) of the product's active verification (`lastVerifiedAt`).

When any transaction (sale, delivery/restock, adjustment) synchronizes:
1. **Always Record the Original Transaction:**
   - The original transaction is recorded in its authoritative table (`sales` or delivery receipt in `stock_ledger_entries`), preserving customer receipts, payment tracking, supplier cost, and true `occurredAt`.
2. **Evaluate the Cut-off Boundary Under Product-Row Lock:**
   - **Case A: Post-Cut-off Transaction ($T_{\text{tx}} > T_{\text{cut\_off}}$):**
     The event occurred *after* physical counting. Normal behavior: the transaction delta $\Delta_{\text{tx}}$ applies directly to the ledger.
   - **Case B: Pre-Cut-off Late Transaction ($T_{\text{tx}} \le T_{\text{cut\_off}}$):**
     The event occurred *before* the physical count was taken; its physical effect was already present in $Q_{\text{physical}}$ on the shelf.
     To prevent distortion while preserving append-only immutability, the engine atomically appends a linked reconciliation entry to `stock_ledger_entries`:
     - `entryType = 'OPENING_BALANCE_RECONCILIATION'`
     - `quantityDelta = -\Delta_{\text{tx}}` (exact arithmetic inverse of the late transaction)
     - `occurredAt = T_{\text{tx}}`
     - `reconciledEntryId = originalEntry.id` (database unique foreign key preventing duplicate reconciliation)
     - `saleId = saleRecord.id` (if sale)
     - `idempotencyKey = "${tx.idempotencyKey}:recon"`
     - `unitCost = NULL` (ensuring financial reports are not impacted)
     - `notes = "Reconciliation for pre-count offline ${entryType} synced after cut-off ${T_cut_off}"`

### 2.3 Worked Examples

#### Example 1: Late-Arriving Offline Sale
- **09:30:** Customer buys 5 bags offline ($T_{\text{tx}} = \text{09:30}, \Delta = -5$).
- **10:00:** Worker counts shelf: 45 bags physically present ($T_{\text{count}} = \text{10:00}, Q_{\text{physical}} = 45$).
- **10:30:** Opening stock session posts. Pre-count movements known at 10:30 = 0. Server posts `OPENING_BALANCE` with $\Delta = +45$, `occurred_at = 10:00`. *Ledger balance = 45.*
- **11:00:** Mobile device syncs the 09:30 sale:
  1. Server acquires row lock on product (`FOR UPDATE`).
  2. Server inserts `sales` record (customer receipt, payment, debt).
  3. Server inserts `stock_ledger_entries`: `SALE`, $\Delta = -5$, `occurredAt = 09:30`.
  4. Server checks: $T_{\text{tx}} (\text{09:30}) \le T_{\text{cut\_off}} (\text{10:00})$.
  5. Server appends: `OPENING_BALANCE_RECONCILIATION`, $\Delta = +5$, `occurredAt = 09:30`, `reconciledEntryId = saleLedgerEntry.id`.
  *Final Ledger Balance:* $45 - 5 + 5 = 45$ bags. Physical shelf reality is preserved.

#### Example 2: Late-Arriving Supplier Delivery
- **09:45:** Delivery of 20 bags offloaded offline ($T_{\text{tx}} = \text{09:45}, \Delta = +20$).
- **10:00:** Worker counts shelf: 45 bags physically present (including the 20 newly arrived bags).
- **10:30:** Session posts: `OPENING_BALANCE` $\Delta = +45$, `occurred_at = 10:00`.
- **11:15:** Delivery note syncs:
  1. Server acquires row lock on product (`FOR UPDATE`).
  2. Server inserts `stock_ledger_entries`: `RESTOCK`, $\Delta = +20$, `occurredAt = 09:45`.
  3. Server checks: $T_{\text{tx}} (\text{09:45}) \le T_{\text{cut\_off}} (\text{10:00})$.
  4. Server appends: `OPENING_BALANCE_RECONCILIATION`, $\Delta = -20$, `reconciledEntryId = restockEntry.id`.
  *Final Ledger Balance:* $45 + 20 - 20 = 45$ bags.

---

## 3. Strict Concurrency & Deterministic Product-Row Locking

### 3.1 The Concurrency Threat
If a counter sale, restock delivery, offline sync, and stocktake session posting execute simultaneously without synchronized locking, a race condition occurs:
- Transaction A (Sale) checks `product.lastVerifiedAt` *before* Transaction B (Stocktake) updates it, concluding "no reconciliation needed".
- Transaction B reads the ledger *before* Transaction A inserts `SALE`, computing an `OPENING_BALANCE` that omits Transaction A.
- Both commit concurrently, permanently corrupting the stock balance.

### 3.2 The Deterministic Locking Protocol
Every stock-modifying operation in SISPA:
1. `recordSale` (Counter sale)
2. `recordDelivery` (Supplier restock)
3. `recordStockCount` (Manual adjustment)
4. `syncSingleMutation` (Offline sync replay)
5. `postOpeningStockSession` (Stocktake posting)

**Must execute inside an isolated SQL transaction (`db.transaction`) and adhere to this strict sequence:**
1. **Acquire Exclusive Product-Row Lock:**
   ```sql
   SELECT id, business_id, last_verified_at, verification_status 
   FROM products 
   WHERE id = ANY($productIds) 
   ORDER BY id ASC 
   FOR UPDATE;
   ```
   *Note: Sorting product IDs ascending (`ORDER BY id ASC`) guarantees deadlock-free locking across multi-item transactions.*
2. **Read Authoritative State:** While the lock is held, the transaction reads the true committed `lastVerifiedAt` and ledger state. No other transaction can mutate stock or post counts for these products.
3. **Decide Reconciliation & Write Ledger:** Insert original transaction and optional linked reconciliation entry. If posting a session, update `products.last_verified_at = item.counted_at` and `products.last_verified_quantity = item.counted_quantity`.
4. **Commit Transaction:** Releases locks atomically.

---

## 4. Database Integrity, SKU Uniqueness & Multi-Tenancy

### 4.1 Business-Scoped SKU Uniqueness
- An owner can operate multiple distinct shops/businesses in SISPA.
- Products carry `business_id integer REFERENCES businesses(id) ON DELETE CASCADE`.
- Uniqueness is scoped strictly to `business_id`:
  ```sql
  CREATE UNIQUE INDEX products_business_sku_idx 
  ON products (business_id, sku) 
  WHERE business_id IS NOT NULL AND sku IS NOT NULL;
  ```
- **Null Semantics:** `NULL` SKUs are ignored by PostgreSQL unique indexes, allowing variants to exist without SKUs.
- **Generated SKU Format:** `[CAT]-[FAMILY]-[VARIANT]`, uppercase, alphanumeric with hyphens (e.g. `CEM-DANG-50KG`).

### 4.2 Database-Enforced Idempotency
1. **Unique Reconciliation Entry Constraint:**
   ```sql
   ALTER TABLE stock_ledger_entries ADD COLUMN reconciled_entry_id INTEGER REFERENCES stock_ledger_entries(id) ON DELETE CASCADE;
   CREATE UNIQUE INDEX stock_ledger_reconciled_entry_idx 
   ON stock_ledger_entries (reconciled_entry_id) 
   WHERE reconciled_entry_id IS NOT NULL;
   ```
   *Guarantees at the database level that an original ledger entry can never have more than one reconciliation entry.*
2. **Ledger Idempotency Key Constraint:**
   ```sql
   CREATE UNIQUE INDEX stock_ledger_user_idempotency_idx 
   ON stock_ledger_entries (user_id, idempotency_key) 
   WHERE idempotency_key IS NOT NULL;
   ```
3. **Session Posting Idempotency:**
   ```sql
   CREATE UNIQUE INDEX opening_stock_sessions_idempotency_idx 
   ON opening_stock_sessions (user_id, idempotency_key) 
   WHERE idempotency_key IS NOT NULL;
   ```

### 4.3 Quantity Precision & Measurement
`quantity` in `sales`, `quantity_delta` in `stock_ledger_entries`, and `counted_quantity` in `opening_stock_items` utilize `NUMERIC(14, 3)` (supports 3 decimal places for grams, milliliters, millimeters).

---

## 5. Timestamp Policy & Offline Device Validation

1. **Online Transactions (Counter Sales, Web Deliveries):**
   - Occurrence timestamp is **strictly server-assigned**: `occurredAt = new Date()`. Client device timestamps are disregarded for online operations.
2. **Offline Device Timestamps:**
   - Client sends `clientTimestamp` when offline.
   - **Validation Rules:**
     - **Future Skew Guard:** If `clientTimestamp > server_now + 5 minutes`, clamp to `server_now` and record audit log flag `DEVICE_CLOCK_FUTURE_SKEW`.
     - **Ancient Skew Guard:** If `clientTimestamp < business.createdAt` (or epoch 2024-01-01), clamp to `business.createdAt`.
3. **Opening Balance Timestamp:**
   - `OPENING_BALANCE` ledger entries record:
     - `occurred_at = item.countedAt` (the exact cut-off timestamp when the shelf was physically counted).
     - `created_at = NOW()` (server transaction ingestion time).
   - This ensures historical stock calculations ($\sum_{\text{occurredAt} \le T} \Delta_t$) at count time match the exact shelf count.

---

## 6. Authoritative Verification-State Model & Partial Sessions

### 6.1 The 3-State Lifecycle
```
     ┌──────────────┐   Count Posted    ┌────────────┐  Discrepancy / Recount Flag
     │  UNVERIFIED  ├──────────────────►│  VERIFIED  ├────────────────────────────►┌─────────────────┐
     └──────────────┘                   └────────────┘                             │  NEEDS_RECOUNT  │
                                              ▲                                    └────────┬────────┘
                                              │                New Count Posted             │
                                              └─────────────────────────────────────────────┘
```

1. **`UNVERIFIED`:**
   - **Trigger:** Initial product creation, CSV bulk import, or pre-migration existing products.
   - **Ledger/Sales:** Allowed to sell, restock, and adjust normally.
   - **UI Badge:** Amber badge *"Stock unverified"*.
   - **Intelligence:** **Excluded from automatic `BUY NOW` alarms.** Even if current ledger balance is 0 or negative, SISPA suppresses urgent buying recommendations to prevent purchasing unverified phantom stock.
   - **Exit:** Transitions to `VERIFIED` upon posting of a physical stock count.
2. **`VERIFIED`:**
   - **Trigger:** Successful posting of a physical opening stock count.
   - **UI Display:** Shows both physical evidence and current balance:
     *"Physical proof: 45 bags on Nov 10 | Current system: 38 bags (7 sold since count)"*.
   - **Intelligence:** **Fully active.** If balance drops below threshold, triggers `BUY NOW` or `CHECK SOON`. If verified physical count was 0, triggers immediate `BUY NOW`.
3. **`NEEDS_RECOUNT`:**
   - **Trigger:** Negative stock reached on a previously verified product, or cyclical recount period elapsed.
   - **UI Badge:** Red badge *"Recount needed"*.
   - **Intelligence:** Active, but flags purchase recommendations with warning: *"Based on unconfirmed stock drift — physical check advised"*.

### 6.2 Partial Sessions Policy
- An opening stock session **can be posted with some products uncounted**.
- Any item in the session that remains in `status = 'NOT_COUNTED'` at posting time:
  - **Is completely skipped by the ledger posting logic.**
  - **No `OPENING_BALANCE` entry is created.**
  - **The product's `verificationStatus` remains `UNVERIFIED` (or its prior state).**
  - **`lastVerifiedAt` and `lastVerifiedQuantity` are NOT touched.**
  - **Zero stock is NEVER assumed.**
- Only products with explicit `status = 'COUNTED'` (where a human worker verified the quantity, even if 0) are posted and transitioned to `VERIFIED`.

---

## 7. Financial & Reporting Isolation

Reconciliation ledger entries must adjust physical inventory balances without corrupting business financial records:
- `entryType = 'OPENING_BALANCE_RECONCILIATION'` is strictly an **Inventory Ledger Balancing Type**.
- **Sales & Revenue Reports:** Queried from `sales` table (`totalAmount`, `paymentStatus`); completely unaffected by reconciliation entries.
- **Supplier Purchases & COGS:** Queried from `stock_ledger_entries WHERE entryType = 'RESTOCK' AND unitCost IS NOT NULL`. Reconciliation entries have `unitCost = NULL` and are excluded from expenditure analytics.
- **Current Inventory Stock:** Computed as $\sum \text{quantityDelta}$ over all entries, preserving physical accuracy.

---

## 8. Full Packaging Support (Sales & Deliveries)

- **Sales:** Customer receipt records `quantity = 3`, `unit = "carton"`, `packagingUnit = "carton"`, `unitsPerPackage = 12`. Stock ledger records base movement: `quantityDelta = -36` (in `piece`).
- **Deliveries:** Delivery receipt records `quantityReceived = 5`, `unit = "pallet"`. Stock ledger records base movement: `quantityDelta = +200` (in `bag`).
- **Discrete Validation:** If `allowFractionalQuantity: false`, validates that both commercial unit and converted base unit are integers.

---

## 9. Migration & Safe Multi-Tier Rollback

1. **Transactional Forward Migration (`0004_product_catalog_and_opening_stock.sql`):** Executed inside `BEGIN ... COMMIT`. Strictly additive.
2. **Zero-Data-Loss Application Rollback:** Application code can be rolled back to the previous release **without running a database down-migration**. Existing code ignores new tables and columns, preserving newly created catalogue and stocktake data.
3. **Database Down-Migration (`0004_product_catalog_and_opening_stock.down.sql`):** Drops added tables and added columns while leaving core historical tables (`products`, `sales`, `stock_ledger_entries`) 100% intact.
