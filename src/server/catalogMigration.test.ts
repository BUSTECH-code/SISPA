import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  productFamilies,
  openingStockSessions,
  openingStockItems,
  products,
  stockLedgerEntries,
  sales,
} from "../db/schema";

describe("Task 1: Product Catalogue & Opening Stock Migration Contract", () => {
  it("exports productFamilies, openingStockSessions, and openingStockItems table schemas", () => {
    expect(productFamilies).toBeDefined();
    expect(openingStockSessions).toBeDefined();
    expect(openingStockItems).toBeDefined();

    expect(productFamilies.id).toBeDefined();
    expect(productFamilies.businessId).toBeDefined();
    expect(productFamilies.userId).toBeDefined();
    expect(productFamilies.name).toBeDefined();
    expect(productFamilies.defaultStockUnit).toBeDefined();
    expect(productFamilies.suggestedAttributes).toBeDefined();

    expect(openingStockSessions.id).toBeDefined();
    expect(openingStockSessions.businessId).toBeDefined();
    expect(openingStockSessions.userId).toBeDefined();
    expect(openingStockSessions.status).toBeDefined();
    expect(openingStockSessions.idempotencyKey).toBeDefined();

    expect(openingStockItems.id).toBeDefined();
    expect(openingStockItems.sessionId).toBeDefined();
    expect(openingStockItems.productId).toBeDefined();
    expect(openingStockItems.countedQuantity).toBeDefined();
    expect(openingStockItems.countedAt).toBeDefined();
    expect(openingStockItems.status).toBeDefined();
  });

  it("exports extended products table schema with variant, packaging, and verification attributes", () => {
    expect(products.businessId).toBeDefined();
    expect(products.familyId).toBeDefined();
    expect(products.sku).toBeDefined();
    expect(products.variantName).toBeDefined();
    expect(products.brand).toBeDefined();
    expect(products.attributes).toBeDefined();
    expect(products.stockUnit).toBeDefined();
    expect(products.packagingUnit).toBeDefined();
    expect(products.unitsPerPackage).toBeDefined();
    expect(products.allowFractionalQuantity).toBeDefined();
    expect(products.verificationStatus).toBeDefined();
    expect(products.lastVerifiedAt).toBeDefined();
    expect(products.lastVerifiedQuantity).toBeDefined();
    expect(products.lastVerifiedByUserId).toBeDefined();
  });

  it("exports extended stockLedgerEntries and sales schema", () => {
    expect(stockLedgerEntries.occurredAt).toBeDefined();
    expect(stockLedgerEntries.reconciledEntryId).toBeDefined();
    expect(sales.saleUnit).toBeDefined();
    expect(sales.packagingUnit).toBeDefined();
    expect(sales.unitsPerPackage).toBeDefined();
  });

  it("validates that 0004_product_catalog_and_opening_stock.sql satisfies all structural requirements", () => {
    const migrationPath = path.join(process.cwd(), "src/db/migrations/0004_product_catalog_and_opening_stock.sql");
    expect(fs.existsSync(migrationPath)).toBe(true);

    const sql = fs.readFileSync(migrationPath, "utf-8");

    // Foreign-key deletion safety checks (ON DELETE RESTRICT)
    expect(sql).toContain('"opening_stock_items"');
    expect(sql).toMatch(/REFERENCES\s+"opening_stock_sessions"\("id"\)\s+ON DELETE RESTRICT/i);
    expect(sql).toMatch(/REFERENCES\s+"products"\("id"\)\s+ON DELETE RESTRICT/i);
    expect(sql).toMatch(/REFERENCES\s+"businesses"\("id"\)\s+ON DELETE RESTRICT/i);
    expect(sql).toMatch(/REFERENCES\s+"stock_ledger_entries"\("id"\)\s+ON DELETE RESTRICT/i);

    // NULL-based safe stock_unit backfill
    expect(sql).toContain('ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "stock_unit" text;');
    expect(sql).toContain('SET "stock_unit" = CASE WHEN "unit" IS NOT NULL AND "unit" != \'\' THEN "unit" ELSE \'units\' END');
    expect(sql).toContain('ALTER TABLE "products" ALTER COLUMN "stock_unit" SET DEFAULT \'units\';');
    expect(sql).toContain('ALTER TABLE "products" ALTER COLUMN "stock_unit" SET NOT NULL;');

    // Deterministic business ownership backfill
    expect(sql).toContain('DISTINCT ON (bm.user_id)');
    expect(sql).toContain('DISTINCT ON (owner_user_id)');

    // Database constraints and unique indexes
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "opening_stock_items_session_product_idx"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "products_business_sku_idx"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "opening_stock_sessions_idempotency_idx"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "stock_ledger_reconciled_entry_idx"');
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "stock_ledger_user_idempotency_idx"');

    // No explicit BEGIN/COMMIT inside Drizzle migration file
    expect(sql).not.toMatch(/^\s*BEGIN\s*;/im);
    expect(sql).not.toMatch(/^\s*COMMIT\s*;/im);
  });

  it("validates that rollback migration 0004_product_catalog_and_opening_stock.down.sql exists", () => {
    const downPath = path.join(process.cwd(), "src/db/migrations/0004_product_catalog_and_opening_stock.down.sql");
    expect(fs.existsSync(downPath)).toBe(true);

    const downSql = fs.readFileSync(downPath, "utf-8");
    expect(downSql).toContain('DROP TABLE IF EXISTS "opening_stock_items";');
    expect(downSql).toContain('DROP TABLE IF EXISTS "opening_stock_sessions";');
    expect(downSql).toContain('DROP TABLE IF EXISTS "product_families";');
    expect(downSql).toContain('ALTER TABLE "products" DROP COLUMN IF EXISTS');
    expect(downSql).toContain('ALTER TABLE "stock_ledger_entries" DROP COLUMN IF EXISTS');
    expect(downSql).toContain('ALTER TABLE "sales" DROP COLUMN IF EXISTS');
  });
});
