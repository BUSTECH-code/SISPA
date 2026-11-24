import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import fs from "fs";
import path from "path";

const rawTestDbUrl = process.env.TEST_DATABASE_URL?.trim() || "";

function assertSafeTestDatabaseUrl(urlStr: string): void {
  if (!urlStr) return;
  let dbName = "";
  try {
    const parsed = new URL(urlStr);
    dbName = parsed.pathname.replace(/^\/+/, "");
  } catch {
    throw new Error("TEST_DATABASE_URL is not a valid PostgreSQL connection URL.");
  }
  if (!/_test$/i.test(dbName)) {
    throw new Error(
      `REFUSING TO RUN POSTGRES CONCURRENCY TESTS: database name "${dbName}" in TEST_DATABASE_URL must end with "_test".`
    );
  }
}

if (rawTestDbUrl) {
  assertSafeTestDatabaseUrl(rawTestDbUrl);
}

const hasTestDb = Boolean(rawTestDbUrl);

async function runSqlStatements(pool: Pool, relPath: string) {
  const fullPath = path.resolve(process.cwd(), relPath);
  const sql = fs.readFileSync(fullPath, "utf8");
  const stmts = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of stmts) {
    await pool.query(stmt);
  }
}

describe.skipIf(!hasTestDb)(
  "PostgreSQL Real Two-Connection Concurrency, Migrations & Constraint Verification",
  () => {
    let pool1: Pool;
    let pool2: Pool;
    let ownerId: number;
    let bizId: number;
    let productId: number;

    beforeAll(async () => {
      assertSafeTestDatabaseUrl(rawTestDbUrl);
      pool1 = new Pool({ connectionString: rawTestDbUrl, max: 4 });
      pool2 = new Pool({ connectionString: rawTestDbUrl, max: 4 });

      // Reset dedicated _test schema cleanly before verifying migrations 0000-0005 + 0005.down + 0005
      await pool1.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
      await runSqlStatements(pool1, "src/db/migrations/0000_shiny_moonstone.sql");
      await runSqlStatements(pool1, "src/db/migrations/0002_commercial_tenants_and_invitations.sql");
      await runSqlStatements(pool1, "src/db/migrations/0003_offline_idempotency.sql");
      await runSqlStatements(pool1, "src/db/migrations/0004_product_catalog_and_opening_stock.sql");
      await runSqlStatements(pool1, "src/db/migrations/0005_pending_quarantine_and_integrity.sql");

      // Verify 0005 rollback migration cleanly reverts and re-applies cleanly
      await runSqlStatements(pool1, "src/db/migrations/0005_pending_quarantine_and_integrity.down.sql");
      await runSqlStatements(pool1, "src/db/migrations/0005_pending_quarantine_and_integrity.sql");

      // Seed minimal owner, business, and product
      const userRes = await pool1.query(
        `INSERT INTO users (email, password_hash, full_name, role, business_name)
         VALUES ($1, 'hash', 'PG Concurrency Owner', 'OWNER', 'PG Test Yard')
         RETURNING id`,
        [`pg_owner_${Date.now()}@test.local`]
      );
      ownerId = userRes.rows[0].id;

      const bizRes = await pool1.query(
        `INSERT INTO businesses (name, currency, state, owner_user_id)
         VALUES ('PG Test Yard', 'NGN', 'ACTIVE', $1)
         RETURNING id`,
        [ownerId]
      );
      bizId = bizRes.rows[0].id;

      await pool1.query(
        `INSERT INTO business_memberships (business_id, user_id, role, status)
         VALUES ($1, $2, 'OWNER', 'ACTIVE')`,
        [bizId, ownerId]
      );

      const prodRes = await pool1.query(
        `INSERT INTO products (business_id, user_id, name, category, unit, selling_price)
         VALUES ($1, $2, 'PG Cement 50kg', 'Cement', 'bags', 9000)
         RETURNING id`,
        [bizId, ownerId]
      );
      productId = prodRes.rows[0].id;
    });

    afterAll(async () => {
      await pool1?.end();
      await pool2?.end();
    });

    it("serializes opening_stock_sessions FOR UPDATE row lock across two independent PostgreSQL connections", async () => {
      const sessRes = await pool1.query(
        `INSERT INTO opening_stock_sessions (business_id, user_id, name, status)
         VALUES ($1, $2, 'Two-Conn Session Lock', 'DRAFT')
         RETURNING id`,
        [bizId, ownerId]
      );
      const sessionId = sessRes.rows[0].id;

      const c1 = await pool1.connect();
      const c2 = await pool2.connect();
      try {
        await c1.query("BEGIN");
        const locked = await c1.query(
          `SELECT status FROM opening_stock_sessions WHERE id = $1 AND business_id = $2 FOR UPDATE`,
          [sessionId, bizId]
        );
        expect(locked.rows[0].status).toBe("DRAFT");

        await c2.query("BEGIN");
        let c2Finished = false;
        const c2LockPromise = c2
          .query(
            `SELECT status FROM opening_stock_sessions WHERE id = $1 AND business_id = $2 FOR UPDATE`,
            [sessionId, bizId]
          )
          .then((r) => {
            c2Finished = true;
            return r;
          });

        // Give PostgreSQL time to enqueue c2 on the row lock held by c1
        await new Promise((r) => setTimeout(r, 80));
        expect(c2Finished).toBe(false);

        await c1.query(
          `UPDATE opening_stock_sessions SET status = 'POSTED', posted_at = NOW() WHERE id = $1`,
          [sessionId]
        );
        await c1.query("COMMIT");

        const c2Result = await c2LockPromise;
        expect(c2Finished).toBe(true);
        expect(c2Result.rows[0].status).toBe("POSTED");
        await c2.query("ROLLBACK");
      } finally {
        c1.release();
        c2.release();
      }
    });

    it("enforces CHECK constraints and ON DELETE RESTRICT foreign keys at PostgreSQL level", async () => {
      // Negative refund_amount violates sales_refund_non_negative_chk
      await expect(
        pool1.query(
          `INSERT INTO sales (business_id, user_id, product_id, quantity, unit_price, total_amount, amount_paid, refund_amount, outstanding_amount, payment_status)
           VALUES ($1, $2, $3, 1, 9000, 9000, 9000, -1, 0, 'PAID')`,
          [bizId, ownerId, productId]
        )
      ).rejects.toThrow();

      // Broken financial invariant violates sales_financial_invariant_chk
      await expect(
        pool1.query(
          `INSERT INTO sales (business_id, user_id, product_id, quantity, unit_price, total_amount, amount_paid, refund_amount, outstanding_amount, payment_status)
           VALUES ($1, $2, $3, 1, 9000, 9000, 5000, 0, 1000, 'PARTIAL')`,
          [bizId, ownerId, productId]
        )
      ).rejects.toThrow();

      // Valid sale + ON DELETE RESTRICT prevents deleting referenced product
      await pool1.query(
        `INSERT INTO sales (business_id, user_id, product_id, quantity, unit_price, total_amount, amount_paid, refund_amount, outstanding_amount, payment_status)
         VALUES ($1, $2, $3, 2, 9000, 18000, 18000, 0, 0, 'PAID')`,
        [bizId, ownerId, productId]
      );
      await expect(
        pool1.query(`DELETE FROM products WHERE id = $1`, [productId])
      ).rejects.toThrow();

      // pending_movements_resolution_invariant_chk rejects RESOLVED_POST_CUTOFF without resolved_by_user_id
      await expect(
        pool1.query(
          `INSERT INTO pending_stock_movements (business_id, product_id, transaction_type, status, quantity_delta, provisional_occurred_at, timestamp_basis)
           VALUES ($1, $2, 'SALE', 'RESOLVED_POST_CUTOFF', -1, NOW(), 'SERVER_INGESTION')`,
          [bizId, productId]
        )
      ).rejects.toThrow();
    });
  }
);
