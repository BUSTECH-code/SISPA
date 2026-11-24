# SISPA Product Catalogue & Opening Stock Implementation Plan (Approved Architecture)

> **For agentic workers:** REQUIRED SUB-SKILL: Use native in-session execution (`superpowers:executing-plans`) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide SISPA with a high-capacity variant catalogue (Category → Product Family → Sellable SKU) and a progressive opening-stock onboarding engine that safely reconciles physical shelf counts against concurrent and late-arriving offline transactions without stopping daily shop operations, rewriting ledger history, or distorting financial reporting.

**Architecture:**
- **Hybrid Data Model:** Preserve `products` table as the sellable SKU/variant to keep all foreign keys intact across sales, ledger, and buying items. Add `product_families` for grouping, shared brand, category, and attribute definitions.
- **Append-Only Cut-off Reconciliation Engine:** Opening stock sessions record physical counts at shelf cut-off timestamps ($T_{\text{count}}$). When late pre-cut-off offline sales or deliveries arrive after posting, the engine appends linked `OPENING_BALANCE_RECONCILIATION` entries ($-\Delta_{\text{tx}}$) atomically, preserving shelf balance reality, full transaction history, and append-only immutability.
- **Strict Concurrency & Deterministic Product-Row Locking:** Exclusive row locking on all stock-changing operations (`ORDER BY id ASC FOR UPDATE`) preventing race conditions between sales, deliveries, offline sync, and stocktake posting.
- **Business-Scoped SKU Uniqueness:** `UNIQUE INDEX` on `(business_id, sku)` with clear `NULL` semantics, correctly scoped to the commercial business entity.
- **Verification State Model:** Strict 3-state product lifecycle (`UNVERIFIED`, `VERIFIED`, `NEEDS_RECOUNT`). Unverified items display amber badges and are strictly excluded from automated `BUY NOW` alarms. Partial sessions post counted items while leaving uncounted items unverified (zero stock is never assumed).
- **Variant Unit Conversion & Discrete Validation:** Support base inventory unit (`stockUnit`) and packaging unit (`packagingUnit`, `unitsPerPackage`) for both sales and deliveries. Record sales/deliveries in commercial packaging units while recording ledger deltas strictly in base units. Enforce integer quantity validation on both transaction and base units when `allowFractionalQuantity: false`.
- **Secure Bulk Ingestion:** Multi-stage CSV parsing with template generation, dry-run validation, and server-side cost redaction for staff members.

**Tech Stack:** Next.js 16 (App Router), TypeScript, PostgreSQL, Drizzle ORM, Vitest, Tailwind CSS, Lucide React.

**Spec:** `docs/superpowers/specs/2026-11-11-product-catalogue-and-opening-stock-design.md`

## Global Constraints

- Never drop or alter existing historical `stock_ledger_entries`, `sales`, or `products` tables destructively.
- Preserve `products.id` as the primary key for all transactional references (`saleId`, `productId`).
- Every stock-modifying operation must acquire product row locks (`ORDER BY id ASC FOR UPDATE`) inside an isolated transaction.
- Represent tenant ownership via `businessId` and `userId` consistently with existing schema.
- Enforce database constraints: unique `(session_id, product_id)` in `opening_stock_items`, unique `(business_id, sku)` in `products` where `sku IS NOT NULL`, unique `reconciled_entry_id` in `stock_ledger_entries`, and unique session idempotency keys.
- Never expose confidential `unitCost` or wholesale valuation numbers to accounts lacking `PURCHASE_COST_VIEW` capability.
- Distinguish transaction physical occurrence time (`occurredAt`) from server arrival/sync time (`createdAt`) across ledger and reconciliation logic.
- Keep all 90 existing unit and integration tests passing (`npm test`).

## Review Focus

1. **Late-Arriving Pre-Cut-off Sale:** Offline sale of 5 bags at 09:30, physical count of 45 bags at 10:00, session posted at 10:30, offline sale syncs at 11:00. The engine inserts `SALE` ($\Delta = -5$) and linked `OPENING_BALANCE_RECONCILIATION` ($\Delta = +5$), keeping ledger balance at 45.
2. **Late-Arriving Pre-Cut-off Delivery:** Supplier restock of +20 bags offloaded at 09:45, physical count of 45 bags at 10:00 (which included the 20 bags), session posted at 10:30, delivery syncs at 11:15. The engine inserts `RESTOCK` ($\Delta = +20$) and linked `OPENING_BALANCE_RECONCILIATION` ($\Delta = -20$), keeping ledger balance at 45.
3. **Product-Row Locking & Race Prevention:** A concurrent sale and stocktake session posting on Product 1 must serialize via `FOR UPDATE` lock. The stocktake sees the committed sale or the sale sees the committed verification; neither can miss the other.
4. **Partial Session Safety:** A session with 10 products has 6 counted and 4 uncounted. When posted, only the 6 counted items receive `OPENING_BALANCE` entries and transition to `VERIFIED`. The 4 uncounted items remain `UNVERIFIED` and zero stock is never assumed.
5. **Financial Isolation of Reconciliation:** Financial revenue queries sum only `sales.totalAmount` and supplier purchase queries sum only `RESTOCK` rows with `unitCost IS NOT NULL`. Reconciliation entries adjust inventory balances without inflating revenue or expenses.

---

### Task 1: Database Migration & Schema Integrity

**Files:**
- Create: `src/db/migrations/0004_product_catalog_and_opening_stock.sql`
- Create: `src/db/migrations/0004_product_catalog_and_opening_stock.down.sql`
- Modify: `src/db/schema.ts`
- Test: `src/server/catalogMigration.test.ts`

**Interfaces:**
- Produces:
  - `productFamilies` table: `id`, `businessId`, `userId`, `name`, `category`, `brand`, `description`, `defaultStockUnit`, `suggestedAttributes` (json), `createdAt`, `updatedAt`.
  - `openingStockSessions` table: `id`, `businessId`, `userId`, `name`, `status` (`DRAFT`, `POSTED`, `CANCELLED`), `notes`, `idempotencyKey` (unique per user), `postedAt`, `createdAt`, `updatedAt`.
  - `openingStockItems` table: `id`, `sessionId`, `productId`, `countedQuantity` (`NUMERIC(14, 3)`), `countedAt`, `status` (`NOT_COUNTED`, `COUNTED`, `NEEDS_RECOUNT`, `POSTED`, `STALE_SUPERSEDED`), `countedByUserId`, `unitCost`, `notes`, `reconciledBaseline`, `createdAt`, `updatedAt`.
  - Unique constraint: `(sessionId, productId)` in `openingStockItems`.
  - Column in `products`: `businessId` (`integer REFERENCES businesses(id) ON DELETE CASCADE`).
  - Unique constraint: `(businessId, sku)` in `products` where `business_id IS NOT NULL AND sku IS NOT NULL`.
  - `products` columns: `familyId`, `sku`, `variantName`, `brand`, `attributes` (json), `stockUnit`, `packagingUnit`, `unitsPerPackage`, `allowFractionalQuantity`, `verificationStatus` (`UNVERIFIED`, `VERIFIED`, `NEEDS_RECOUNT`), `lastVerifiedAt`, `lastVerifiedQuantity` (`NUMERIC(14, 3)`), `lastVerifiedByUserId`.
  - `stockLedgerEntries` columns: `occurredAt` (`TIMESTAMPTZ`, indexed), `reconciledEntryId` (`integer REFERENCES stock_ledger_entries(id)` with unique index).
  - Unique constraint: `(userId, idempotencyKey)` in `stockLedgerEntries` where `idempotency_key IS NOT NULL`.
  - `sales` columns: `saleUnit`, `packagingUnit`, `unitsPerPackage`.

- [ ] **Step 1: Write the failing schema integrity and constraint test**

```typescript
// src/server/catalogMigration.test.ts
import { describe, it, expect } from "vitest";
import { db } from "../db";
import { products, productFamilies, openingStockSessions, openingStockItems, stockLedgerEntries } from "../db/schema";

describe("Product Catalogue & Opening Stock Schema Migration", () => {
  it("defines productFamilies, openingStockSessions, and openingStockItems tables", () => {
    expect(productFamilies).toBeDefined();
    expect(openingStockSessions).toBeDefined();
    expect(openingStockItems).toBeDefined();
  });

  it("verifies unique constraint definitions and precision", () => {
    expect(products.businessId).toBeDefined();
    expect(products.sku).toBeDefined();
    expect(products.allowFractionalQuantity).toBeDefined();
    expect(products.verificationStatus).toBeDefined();
    expect(stockLedgerEntries.occurredAt).toBeDefined();
    expect(stockLedgerEntries.reconciledEntryId).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/server/catalogMigration.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement migration SQL and schema definitions**

1. Write `src/db/migrations/0004_product_catalog_and_opening_stock.sql` inside a single `BEGIN ... COMMIT` block. Add tables and columns with `IF NOT EXISTS`. Backfill `business_id` from `businesses.owner_user_id = products.user_id`. Add unique partial index on `(business_id, sku)`, unique index on `(session_id, product_id)`, unique index on `(reconciled_entry_id)`, and unique index on `(user_id, idempotency_key)`.
2. Write `src/db/migrations/0004_product_catalog_and_opening_stock.down.sql` with safe reverse drop statements.
3. Update `src/db/schema.ts` to export table definitions, relationships, indexes, and TypeScript types.

- [ ] **Step 4: Execute migration and run test**

Run: `npx vitest run src/server/catalogMigration.test.ts`
Expected: PASS

- [ ] **Step 5: Verify existing 90 tests remain green**

Run: `npm test`
Expected: 11 test files passed, 90+ tests passed.

---

### Task 2: Domain Engine — Packaging Math, Discrete Quantity & Verification States

**Files:**
- Create: `src/domain/packaging.ts`
- Create: `src/domain/packaging.test.ts`
- Modify: `src/domain/intelligence.ts`
- Modify: `src/domain/intelligence.test.ts`

**Interfaces:**
- Produces:
  - `convertPackagingQuantity(qty: number, unitsPerPackage: number): number`
  - `validateQuantityConstraints(params: { quantity: number; allowFractionalQuantity: boolean; unitName: string }): { valid: boolean; error?: string }`
  - `calculateStockIntelligence(params: { currentStock: number; dailySales: number; desiredCoverageDays: number; minimumStockThreshold?: number | null; verificationStatus?: "UNVERIFIED" | "VERIFIED" | "NEEDS_RECOUNT" })`

- [ ] **Step 1: Write failing tests for packaging conversion, fractional validation, and the 3-state verification model**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement domain logic in `src/domain/packaging.ts` and `src/domain/intelligence.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run existing intelligence test suite (`npm test`)**

---

### Task 3: Opening Stock Cut-Off Snapshot, Concurrency & Late-Sync Reconciliation

**Files:**
- Create: `src/server/openingStock.ts`
- Create: `src/server/openingStock.test.ts`
- Modify: `src/server/stockService.ts`

**Interfaces:**
- Produces:
  - `createOpeningStockSession(params: { userId: number; businessId?: number; actorId: number; name: string; notes?: string }): Promise<OpeningStockSession>`
  - `recordSessionCount(params: { sessionId: number; productId: number; countedQuantity: number; countedAt: Date; unitCost?: number; countedByUserId: number }): Promise<OpeningStockItem>`
  - `postOpeningStockSession(params: { sessionId: number; userId: number; actorId: number; idempotencyKey?: string }): Promise<{ postedCount: number; supersededCount: number; skippedUncountedCount: number }>`
  - `recordReconciledMovement(params: { userId: number; actorId?: number; productId: number; transactionType: "SALE" | "RESTOCK" | "ADJUSTMENT"; quantityDelta: number; occurredAt: Date; referenceId?: number; idempotencyKey?: string; notes?: string }): Promise<{ ledgerEntry: StockLedgerEntry; reconciliationEntry?: StockLedgerEntry }>`

- [ ] **Step 1: Write failing sequencing tests for all late-sync, delivery, concurrency, and partial-session scenarios**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement cut-off reconciliation math & concurrency locks (`ORDER BY id ASC FOR UPDATE`) in `src/server/openingStock.ts`**
- [ ] **Step 4: Run test to verify it passes**
- [ ] **Step 5: Run full test suite**

---

### Task 4: Product Catalogue Services (Families & Variants)

**Files:**
- Create: `src/server/productCatalogService.ts`
- Create: `src/server/productCatalogService.test.ts`
- Modify: `src/server/stockService.ts`

**Interfaces:**
- Produces:
  - `createProductFamily(params: { userId: number; businessId?: number; name: string; category: string; brand?: string; defaultStockUnit?: string; suggestedAttributes?: Record<string, string[]> }): Promise<ProductFamily>`
  - `listProductFamilies(userId: number): Promise<ProductFamilyWithVariants[]>`
  - `createProductVariant(params: { familyId?: number; userId: number; businessId?: number; variantName: string; sku?: string; sellingPrice?: number; stockUnit: string; packagingUnit?: string; unitsPerPackage?: number; allowFractionalQuantity?: boolean; attributes?: Record<string, any> }): Promise<Product>`

- [ ] **Step 1: Write tests for family/variant hierarchy, business-scoped SKU generation, and backward-compatible single product creation**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement catalogue services in `src/server/productCatalogService.ts`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 5: Secure CSV Catalogue & Opening Count Bulk Ingestion

**Files:**
- Create: `src/server/catalogImport.ts`
- Create: `src/server/catalogImport.test.ts`
- Create: `src/app/api/products/import/template/route.ts`
- Create: `src/app/api/products/import/preview/route.ts`
- Create: `src/app/api/products/import/commit/route.ts`

**Interfaces:**
- Produces:
  - `generateImportTemplate(canViewCost: boolean): string`
  - `parseAndValidateCatalogCsv(csvContent: string, canViewCost: boolean): { validRows: any[]; errors: any[]; summary: any }`
  - `commitCatalogImport(validRows: any[], userId: number, businessId?: number, canEditCost: boolean): Promise<{ createdCount: number }>`

- [ ] **Step 1: Write tests for template generation, error parsing, and server-side cost redaction**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement CSV parser and API routes**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 6: API Routes & Packaging Support in Sales and Deliveries

**Files:**
- Create: `src/app/api/products/families/route.ts`
- Create: `src/app/api/opening-stock/route.ts`
- Create: `src/app/api/opening-stock/[id]/route.ts`
- Create: `src/app/api/opening-stock/[id]/items/route.ts`
- Create: `src/app/api/opening-stock/[id]/post/route.ts`
- Modify: `src/app/api/sales/route.ts`
- Modify: `src/app/api/deliveries/route.ts`
- Modify: `src/server/stockService.ts`

**Interfaces:**
- Produces: Packaging unit intake in `recordSale` and `recordDelivery`:
  - `recordSale` converts packaging quantity to base units, records `sales.packagingUnit`, `sales.unitsPerPackage`, and decrements stock ledger in base units.
  - `recordDelivery` converts incoming packaging quantity to base units, increments stock ledger in base units.

- [ ] **Step 1: Write API and service integration tests for packaging sales & deliveries**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement route handlers and packaging intake in `stockService.ts`**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 7: UI Surfaces — Catalogue Management, Opening Stock Hub & Packaging Pickers

**Files:**
- Create: `src/components/AddProductFamilyModal.tsx`
- Create: `src/components/OpeningStockHubModal.tsx`
- Create: `src/components/BulkCatalogImportModal.tsx`
- Modify: `src/components/StockListView.tsx` (Display `lastVerifiedAt`, unverified warning badge, and family grouping)
- Modify: `src/components/ProductCard.tsx` (Show packaging units and verification badge)
- Modify: `src/components/RecordSaleModal.tsx` (Add packaging unit conversion selector)
- Modify: `src/components/RecordDeliveryModal.tsx` (Add packaging unit conversion selector)

**Interfaces:**
- Produces:
  - Accessible modal dialogs designed for building-material wholesalers.
  - Visual distinction between physical count evidence and current ledger balance.
  - Real-time packaging calculation on counter sales (e.g. "Sell 3 Cartons = 36 Tiles").

- [ ] **Step 1: Write UI component tests**
- [ ] **Step 2: Run test to verify it fails**
- [ ] **Step 3: Implement UI components**
- [ ] **Step 4: Run test to verify it passes**

---

### Task 8: Full Verification, Rollback Check & Integration Test

**Files:**
- Test: `src/server/fullCatalogIntegration.test.ts`

**Interfaces:**
- Tests the entire end-to-end lifecycle: Family Creation → Variant Definition → Packaging Unit Setup → Offline Sale Before Count → Physical Opening Stock Count → Delivery During Session → Partial Session Post Reconciliation → Late Offline Sync Replay → Urgent Reorder Trigger Verification.

- [ ] **Step 1: Write the end-to-end integration test**
- [ ] **Step 2: Run full integration test**
- [ ] **Step 3: Run full application test suite (`npm test`)**
- [ ] **Step 4: Run typecheck (`npm run typecheck`) and linter (`npm run lint`)**
- [ ] **Step 5: Run compilation check (`compile_applet`)**

---

## Deployment & Multi-Tier Rollback Strategy

1. **Pre-flight Snapshot Check:** Verify clean database state and test suite execution.
2. **Transactional Forward Migration:** Run `0004_product_catalog_and_opening_stock.sql` inside a single transaction.
3. **Additive Backward Compatibility:** All schema changes are strictly additive. If a release must be rolled back, application code can be reverted without touching the database schema, ensuring no newly created catalogue or stocktake data is destroyed.
4. **Isolated Down-Migration:** In the rare event of a database rollback, `0004_product_catalog_and_opening_stock.down.sql` safely drops the new tables and added columns while leaving historical core tables and entries intact.
