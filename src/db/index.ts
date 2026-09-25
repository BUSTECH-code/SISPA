import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";
import fs from "fs";
import path from "path";

const isTest = process.env.NODE_ENV === "test" || Boolean(process.env.VITEST);
const databaseUrl = process.env.DATABASE_URL;

let pool: Pool;
let db: ReturnType<typeof drizzle<typeof schema>>;

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaPgMemDb?: ReturnType<typeof drizzle<typeof schema>>;
  __arenaPgMemPool?: Pool;
};

// Check if PostgreSQL server is reachable
function isPostgresReachable(): boolean {
  if (!databaseUrl) return false;
  if (databaseUrl.includes("127.0.0.1:5432") || databaseUrl.includes("localhost:5432")) {
    if (process.platform === "win32") {
      return false;
    }
    try {
      const cp = require("child_process");
      cp.execSync("timeout 0.2 bash -c 'cat < /dev/null > /dev/tcp/127.0.0.1/5432' 2>/dev/null");
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

function initPgMem() {
  if (globalForDb.__arenaPgMemDb && globalForDb.__arenaPgMemPool) {
    return { pool: globalForDb.__arenaPgMemPool, db: globalForDb.__arenaPgMemDb };
  }

  const { newDb } = require("pg-mem");
  const mem = newDb();
  mem.public.registerFunction({
    name: "current_database",
    implementation: () => "sispa_db",
  });
  mem.public.registerFunction({
    name: "version",
    implementation: () => "PostgreSQL 15.0 (pg-mem)",
  });

  const runSqlFile = (relPath: string) => {
    const fullPath = path.resolve(process.cwd(), relPath);
    if (fs.existsSync(fullPath)) {
      const sql = fs.readFileSync(fullPath, "utf8");
      const stmts = sql
        .split("--> statement-breakpoint")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const stmt of stmts) {
        try {
          mem.public.none(stmt);
        } catch {
          // Skip non-critical notices
        }
      }
    }
  };

  runSqlFile("src/db/migrations/0000_shiny_moonstone.sql");
  runSqlFile("src/db/migrations/0002_commercial_tenants_and_invitations.sql");

  const adapter = mem.adapters.createPg();
  const rawPool = new adapter.Pool();

  const NUMERIC_COLS = new Set([
    "unit_cost",
    "selling_price",
    "estimated_unit_cost",
    "total_amount",
    "unit_price",
    "amount_paid",
    "outstanding_amount",
    "amount",
    "expected_cash",
    "actual_cash",
    "difference",
    "manual_daily_sales_override",
    "quantity",
    "quantity_delta",
  ]);

  function formatRow(row: any) {
    if (!row || typeof row !== "object") return row;
    const formatted: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      if (NUMERIC_COLS.has(key) && val !== null && val !== undefined && !isNaN(Number(val))) {
        formatted[key] = Number(val).toFixed(2);
      } else {
        formatted[key] = val;
      }
    }
    return formatted;
  }

  function wrapQuery(origQuery: any) {
    return function (config: any, ...args: any[]) {
      let isRowModeArray = false;
      if (typeof config === "object" && config !== null) {
        delete config.types;
        if (config.rowMode === "array") {
          isRowModeArray = true;
          delete config.rowMode;
        }
      }
      const cb = args.find((a) => typeof a === "function");
      if (cb) {
        const wrappedCb = (err: any, res: any) => {
          if (res && res.rows) {
            if (isRowModeArray) {
              res.rows = res.rows.map((row: any) => Object.values(formatRow(row)));
            } else {
              res.rows = res.rows.map((row: any) => formatRow(row));
            }
          }
          return cb(err, res);
        };
        args = args.map((a) => (a === cb ? wrappedCb : a));
      }
      const result = origQuery(config, ...args);
      if (result && typeof result.then === "function") {
        return result.then((res: any) => {
          if (res && res.rows) {
            if (isRowModeArray) {
              return {
                ...res,
                rows: res.rows.map((row: any) => Object.values(formatRow(row))),
              };
            }
            return {
              ...res,
              rows: res.rows.map((row: any) => formatRow(row)),
            };
          }
          return res;
        });
      }
      return result;
    };
  }

  rawPool.query = wrapQuery(rawPool.query.bind(rawPool));
  const origConnect = rawPool.connect.bind(rawPool);
  rawPool.connect = async function (...args: any[]) {
    const client = await origConnect(...args);
    client.query = wrapQuery(client.query.bind(client));
    return client;
  };

  const memPool = rawPool as unknown as Pool;
  const memDb = drizzle(memPool, { schema });

  globalForDb.__arenaPgMemPool = memPool;
  globalForDb.__arenaPgMemDb = memDb;

  // Auto-seed default persona accounts into in-memory DB if empty
  seedInitialData(memDb).catch((err) => {
    console.error("[SISPA] Initial in-memory seed warning:", err);
  });

  return { pool: memPool, db: memDb };
}

async function seedInitialData(database: any) {
  try {
    const existing = await database.select().from(schema.users).limit(1);
    if (existing.length > 0) return;

    const bcrypt = require("bcryptjs");
    const passwordHash = await bcrypt.hash("password123", 10);

    // 1. Business Owner
    const [owner] = await database
      .insert(schema.users)
      .values({
        email: "owner@buildingmaterials.com",
        passwordHash,
        fullName: "Alhaji Ibrahim Musa",
        phone: "+234 803 123 4567",
        role: "OWNER",
        businessName: "Musa Building Materials & Hardware Ltd",
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    const trialEndsAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
    const [biz] = await database
      .insert(schema.businesses)
      .values({
        name: "Musa Building Materials & Hardware Ltd",
        currency: "NGN",
        state: "ACTIVE",
        ownerUserId: owner.id,
        subscriptionPlan: "STANDARD",
        subscriptionStatus: "ACTIVE",
        trialEndsAt,
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz.id,
      userId: owner.id,
      role: "OWNER",
      status: "ACTIVE",
      activatedAt: new Date(),
    });

    await database.insert(schema.businessSubscriptions).values({
      businessId: biz.id,
      plan: "STANDARD",
      status: "ACTIVE",
      provider: "DIRECT",
      trialEndsAt,
    });

    // 2. Staff Operators for Business 1
    const [staff] = await database
      .insert(schema.users)
      .values({
        email: "staff@buildingmaterials.com",
        passwordHash,
        fullName: "Musa Aminu (Shop Staff)",
        phone: "+234 802 987 6543",
        role: "STAFF",
        businessName: "Musa Building Materials & Hardware Ltd",
        businessOwnerId: owner.id,
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz.id,
      userId: staff.id,
      role: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date(),
      customCapabilities: JSON.stringify(["CAN_SELL", "CAN_RECEIVE", "CAN_COLLECT", "CAN_COUNT"]),
    });

    const [staff2] = await database
      .insert(schema.users)
      .values({
        email: "haruna@buildingmaterials.com",
        passwordHash,
        fullName: "Haruna Bello (Yard Storekeeper)",
        phone: "+234 803 555 1122",
        role: "STAFF",
        businessName: "Musa Building Materials & Hardware Ltd",
        businessOwnerId: owner.id,
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz.id,
      userId: staff2.id,
      role: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date(),
      customCapabilities: JSON.stringify(["CAN_RECEIVE", "CAN_COUNT"]),
    });

    // 3. Platform Admin User
    const [admin] = await database
      .insert(schema.users)
      .values({
        email: "admin@sispa.io",
        passwordHash,
        fullName: "SISPA Operations Platform Admin",
        phone: "+234 800 000 0000",
        role: "OWNER",
        businessName: "SISPA SaaS Platform Operations",
        isActive: true,
        isPlatformAdmin: true,
      })
      .returning();

    // 4. Business 2: Trial Business (Danladi Cement & Aggregates)
    const [owner2] = await database
      .insert(schema.users)
      .values({
        email: "danladi@aggregates.ng",
        passwordHash,
        fullName: "Danladi Ibrahim",
        phone: "+234 805 777 8899",
        role: "OWNER",
        businessName: "Danladi Cement & Aggregates Ltd",
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    const [biz2] = await database
      .insert(schema.businesses)
      .values({
        name: "Danladi Cement & Aggregates Ltd",
        currency: "NGN",
        state: "ACTIVE",
        ownerUserId: owner2.id,
        subscriptionPlan: "TRIAL",
        subscriptionStatus: "TRIAL",
        trialEndsAt: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000), // 8 days remaining
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz2.id,
      userId: owner2.id,
      role: "OWNER",
      status: "ACTIVE",
      activatedAt: new Date(),
    });

    const [staffBiz2] = await database
      .insert(schema.users)
      .values({
        email: "sani@aggregates.ng",
        passwordHash,
        fullName: "Sani Storekeeper",
        phone: "+234 806 333 4455",
        role: "STAFF",
        businessName: "Danladi Cement & Aggregates Ltd",
        businessOwnerId: owner2.id,
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz2.id,
      userId: staffBiz2.id,
      role: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date(),
    });

    // 5. Business 3: Past-Due Business in Grace Period (Emeka Timber & Glass)
    const [owner3] = await database
      .insert(schema.users)
      .values({
        email: "emeka@timberandglass.com",
        passwordHash,
        fullName: "Chief Emeka Okafor",
        phone: "+234 802 444 7788",
        role: "OWNER",
        businessName: "Emeka Timber & Glass Merchant",
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    const [biz3] = await database
      .insert(schema.businesses)
      .values({
        name: "Emeka Timber & Glass Merchant",
        currency: "NGN",
        state: "ACTIVE",
        ownerUserId: owner3.id,
        subscriptionPlan: "STANDARD",
        subscriptionStatus: "PAST_DUE", // Grace period active
        trialEndsAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz3.id,
      userId: owner3.id,
      role: "OWNER",
      status: "ACTIVE",
      activatedAt: new Date(),
    });

    const [staffBiz3] = await database
      .insert(schema.users)
      .values({
        email: "chidi@timberandglass.com",
        passwordHash,
        fullName: "Chidi Clerk",
        phone: "+234 803 666 9911",
        role: "STAFF",
        businessName: "Emeka Timber & Glass Merchant",
        businessOwnerId: owner3.id,
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz3.id,
      userId: staffBiz3.id,
      role: "STAFF",
      status: "ACTIVE",
      activatedAt: new Date(),
    });

    // 6. Business 4: Restricted Business (Kaduna Central Steel Depot)
    const [owner4] = await database
      .insert(schema.users)
      .values({
        email: "amina@kadunasteel.com",
        passwordHash,
        fullName: "Amina Bello",
        phone: "+234 809 111 2233",
        role: "OWNER",
        businessName: "Kaduna Central Steel Depot",
        isActive: true,
        isPlatformAdmin: false,
      })
      .returning();

    const [biz4] = await database
      .insert(schema.businesses)
      .values({
        name: "Kaduna Central Steel Depot",
        currency: "NGN",
        state: "RESTRICTED", // Restricted due to non-payment
        ownerUserId: owner4.id,
        subscriptionPlan: "STANDARD",
        subscriptionStatus: "RESTRICTED",
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz4.id,
      userId: owner4.id,
      role: "OWNER",
      status: "ACTIVE",
      activatedAt: new Date(),
    });

    const [staffBiz4] = await database
      .insert(schema.users)
      .values({
        email: "usman@kadunasteel.com",
        passwordHash,
        fullName: "Usman Counter",
        phone: "+234 808 222 3344",
        role: "STAFF",
        businessName: "Kaduna Central Steel Depot",
        businessOwnerId: owner4.id,
        isActive: false, // Suspended
        isPlatformAdmin: false,
      })
      .returning();

    await database.insert(schema.businessMemberships).values({
      businessId: biz4.id,
      userId: staffBiz4.id,
      role: "STAFF",
      status: "SUSPENDED",
      activatedAt: new Date(),
    });

    // 7. Seed Support Grants and Requests
    // A. Pending Request from Alhaji Musa (Musa Building Materials)
    await database.insert(schema.supportAccessLogs).values({
      businessId: biz.id,
      requestingUserId: owner.id,
      reason: "WhatsApp notification webhook disconnects intermittently when recording counter sales.",
      scope: "ACCOUNT_WHATSAPP",
      requestedDurationMinutes: 30,
      status: "PENDING",
      createdAt: new Date(Date.now() - 45 * 60 * 1000), // 45 mins ago
    });

    // B. Approved Active Grant for Chief Emeka (Emeka Timber & Glass)
    await database.insert(schema.supportAccessLogs).values({
      businessId: biz3.id,
      requestingUserId: owner3.id,
      platformAdminUserId: admin.id,
      reason: "Assistance verifying stock ledger delta calculation after multi-pallet delivery import.",
      scope: "CATALOG_DIAGNOSTICS",
      requestedDurationMinutes: 60,
      status: "APPROVED",
      approvedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
      expiresAt: new Date(Date.now() + 45 * 60 * 1000), // 45 mins remaining
      createdAt: new Date(Date.now() - 30 * 60 * 1000),
    });

    // C. Historical Expired Grant for Amina Bello (Kaduna Central Steel)
    await database.insert(schema.supportAccessLogs).values({
      businessId: biz4.id,
      requestingUserId: owner4.id,
      platformAdminUserId: admin.id,
      reason: "Initial staff onboarding and access role configuration",
      scope: "SYSTEM_CONFIG",
      requestedDurationMinutes: 30,
      status: "APPROVED",
      approvedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000),
      createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    // 8. Seed Platform Audit Trail
    await database.insert(schema.auditLogs).values([
      {
        userId: admin.id,
        businessId: biz4.id,
        actorId: admin.id,
        actorName: "SISPA Operations Platform Admin",
        actorRole: "PLATFORM_ADMIN",
        eventType: "BUSINESS_STATUS_CHANGED",
        entityType: "BUSINESS",
        entityId: biz4.id,
        oldValue: "ACTIVE",
        newValue: "RESTRICTED",
        description: `Platform Admin changed business "${biz4.name}" state from ACTIVE to RESTRICTED. Reason: Commercial subscription past grace period without payment renewal`,
        reason: "Commercial subscription past grace period without payment renewal",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        userId: admin.id,
        businessId: biz3.id,
        actorId: admin.id,
        actorName: "SISPA Operations Platform Admin",
        actorRole: "PLATFORM_ADMIN",
        eventType: "SUBSCRIPTION_STATUS_CHANGED",
        entityType: "SUBSCRIPTION",
        entityId: biz3.id,
        oldValue: "ACTIVE",
        newValue: "PAST_DUE",
        description: `Platform Admin updated subscription for business "${biz3.name}": Plan=STANDARD, Status=PAST_DUE. 7-day grace period initiated.`,
        reason: "Failed automatic card charge; 7-day grace period initiated",
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        userId: admin.id,
        businessId: biz3.id,
        actorId: admin.id,
        actorName: "SISPA Operations Platform Admin",
        actorRole: "PLATFORM_ADMIN",
        eventType: "SUPPORT_REQUEST_APPROVED",
        entityType: "SUPPORT_ACCESS",
        entityId: 2,
        description: `Platform Admin approved support grant #2 for business "${biz3.name}". Scope: CATALOG_DIAGNOSTICS, Active for 60 minutes.`,
        reason: "Assistance verifying stock ledger delta calculation after multi-pallet delivery import",
        createdAt: new Date(Date.now() - 15 * 60 * 1000),
      },
      {
        userId: owner.id,
        businessId: biz.id,
        actorId: owner.id,
        actorName: "Alhaji Ibrahim Musa",
        actorRole: "OWNER",
        eventType: "SUPPORT_REQUEST_SUBMITTED",
        entityType: "SUPPORT_ACCESS",
        entityId: 1,
        description: `Business Owner Alhaji Ibrahim Musa requested 30-minute ACCOUNT_WHATSAPP support access. Reason: WhatsApp notification webhook disconnects intermittently when recording counter sales.`,
        reason: "WhatsApp notification webhook disconnects intermittently when recording counter sales.",
        createdAt: new Date(Date.now() - 45 * 60 * 1000),
      },
    ]);

    // 4. Sample Building Materials Catalog & Stock
    const now = new Date();
    const dayMs = 1000 * 60 * 60 * 24;

    const [p1] = await database
      .insert(schema.products)
      .values({
        userId: owner.id,
        name: "Dangote Cement 42.5R (50kg)",
        category: "Cement & Aggregates",
        unit: "Bag",
        sellingPrice: "9200",
        desiredCoverageDays: 7,
        minimumStockThreshold: 25,
      })
      .returning();

    const [p2] = await database
      .insert(schema.products)
      .values({
        userId: owner.id,
        name: "High-Yield TMT Steel Rebar 12mm (12m length)",
        category: "Steel & Iron",
        unit: "Length",
        sellingPrice: "8500",
        desiredCoverageDays: 14,
        minimumStockThreshold: 50,
      })
      .returning();

    const [p3] = await database
      .insert(schema.products)
      .values({
        userId: owner.id,
        name: "PVC Pressure Pipe 4-inch (5.8m)",
        category: "Plumbing & Drainage",
        unit: "Length",
        sellingPrice: "6800",
        desiredCoverageDays: 10,
        minimumStockThreshold: 20,
      })
      .returning();

    const [p4] = await database
      .insert(schema.products)
      .values({
        userId: owner.id,
        name: "Dulux WeatherShield White Emulsion (20L)",
        category: "Paints & Finishes",
        unit: "Bucket",
        sellingPrice: "48000",
        desiredCoverageDays: 7,
        minimumStockThreshold: 8,
      })
      .returning();

    const [p5] = await database
      .insert(schema.products)
      .values({
        userId: owner.id,
        name: "Corrugated Aluminum Roofing Sheet 0.45mm (10ft)",
        category: "Roofing",
        unit: "Sheet",
        sellingPrice: "7400",
        desiredCoverageDays: 14,
        minimumStockThreshold: 40,
      })
      .returning();

    // Stock Ledger
    await database.insert(schema.stockLedgerEntries).values([
      {
        userId: owner.id,
        productId: p1.id,
        entryType: "RESTOCK",
        quantityDelta: "30",
        unitCost: "8500",
        supplierName: "Dangote Depot Lagos",
        notes: "Trailer delivery received",
        createdAt: new Date(now.getTime() - 9 * dayMs),
      },
      {
        userId: owner.id,
        productId: p2.id,
        entryType: "RESTOCK",
        quantityDelta: "120",
        unitCost: "7800",
        supplierName: "Katsina Steel Rolling Mill",
        notes: "Yard restock",
        createdAt: new Date(now.getTime() - 14 * dayMs),
      },
      {
        userId: owner.id,
        productId: p3.id,
        entryType: "RESTOCK",
        quantityDelta: "35",
        unitCost: "5900",
        supplierName: "Coleman & Pipeline Ltd",
        notes: "Plumbing pipes delivery",
        createdAt: new Date(now.getTime() - 8 * dayMs),
      },
      {
        userId: owner.id,
        productId: p4.id,
        entryType: "RESTOCK",
        quantityDelta: "12",
        unitCost: "42000",
        supplierName: "CAP Plc Coatings Distributor",
        notes: "Paint buckets delivered",
        createdAt: new Date(now.getTime() - 6 * dayMs),
      },
      {
        userId: owner.id,
        productId: p5.id,
        entryType: "RESTOCK",
        quantityDelta: "50",
        unitCost: "6600",
        supplierName: "Tower Aluminum Rolling Mills",
        notes: "Roofing sheets delivered",
        createdAt: new Date(now.getTime() - 12 * dayMs),
      },
    ]);

    // Customers
    const [c1] = await database
      .insert(schema.customers)
      .values({
        userId: owner.id,
        name: "Musa Contractor (Prime Construction)",
        phone: "+234 802 345 6789",
        address: "Plot 14, Ring Road Estate Site",
        notes: "Major residential foundation contractor.",
      })
      .returning();

    const [c2] = await database
      .insert(schema.customers)
      .values({
        userId: owner.id,
        name: "Engr. Danladi (Apex Builders)",
        phone: "+234 803 987 1122",
        address: "Commercial Bank Remodel, Central Ave",
        notes: "Commercial builder.",
      })
      .returning();

    // Sales
    const [s1] = await database
      .insert(schema.sales)
      .values({
        userId: owner.id,
        customerId: c1.id,
        productId: p1.id,
        quantity: "20",
        unitPrice: "9200",
        totalAmount: "184000",
        amountPaid: "100000",
        outstandingAmount: "84000",
        paymentStatus: "PARTIAL",
        notes: "Foundation casting cement",
        createdAt: new Date(now.getTime() - 2 * dayMs),
      })
      .returning();

    await database.insert(schema.stockLedgerEntries).values({
      userId: owner.id,
      productId: p1.id,
      saleId: s1.id,
      entryType: "SALE",
      quantityDelta: "-20",
      notes: "Foundation casting cement",
      createdAt: new Date(now.getTime() - 2 * dayMs),
    });

    const [s2] = await database
      .insert(schema.sales)
      .values({
        userId: owner.id,
        customerId: c2.id,
        productId: p2.id,
        quantity: "40",
        unitPrice: "8500",
        totalAmount: "340000",
        amountPaid: "340000",
        outstandingAmount: "0",
        paymentStatus: "PAID",
        notes: "Direct bank transfer for rebar",
        createdAt: new Date(now.getTime() - 1 * dayMs),
      })
      .returning();

    await database.insert(schema.stockLedgerEntries).values({
      userId: owner.id,
      productId: p2.id,
      saleId: s2.id,
      entryType: "SALE",
      quantityDelta: "-40",
      notes: "Direct bank transfer for rebar",
      createdAt: new Date(now.getTime() - 1 * dayMs),
    });

    // 3. Sale recorded by Staff (Musa Aminu)
    const [s3] = await database
      .insert(schema.sales)
      .values({
        userId: owner.id,
        staffUserId: staff.id,
        customerId: c1.id,
        productId: p1.id,
        quantity: "10",
        unitPrice: "9200",
        totalAmount: "92000",
        amountPaid: "50000",
        outstandingAmount: "42000",
        paymentStatus: "PARTIAL",
        notes: "Counter sale for foundation extension recorded by Musa Aminu",
        createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      })
      .returning();

    await database.insert(schema.stockLedgerEntries).values({
      userId: owner.id,
      staffUserId: staff.id,
      productId: p1.id,
      saleId: s3.id,
      entryType: "SALE",
      quantityDelta: "-10",
      notes: "Counter sale for foundation extension recorded by Musa Aminu",
      createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
    });

    // 4. Delivery received by Staff (Musa Aminu)
    await database.insert(schema.stockLedgerEntries).values({
      userId: owner.id,
      staffUserId: staff.id,
      productId: p4.id,
      entryType: "RESTOCK",
      quantityDelta: "20",
      unitCost: "42000",
      supplierName: "CAP Plc Coatings Distributor",
      notes: "Paint buckets received and offloaded at store by Musa Aminu",
      createdAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
    });

    // Customer Payments
    await database.insert(schema.customerPayments).values([
      {
        userId: owner.id,
        customerId: c1.id,
        amount: "50000",
        paymentMethod: "TRANSFER",
        notes: "Site lead partial payment towards cement debt",
        createdAt: new Date(now.getTime() - 1 * dayMs),
      },
      {
        userId: owner.id,
        staffUserId: staff.id,
        customerId: c1.id,
        amount: "34000",
        paymentMethod: "CASH",
        notes: "Debt recovery payment collected at counter by Musa Aminu",
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      },
    ]);

    // 5. Physical stock count performed by Staff (Musa Aminu)
    await database.insert(schema.stockLedgerEntries).values({
      userId: owner.id,
      staffUserId: staff.id,
      productId: p3.id,
      entryType: "ADJUSTMENT",
      quantityDelta: "-2",
      notes: "Physical shelf count: 33 Length (system was 35, difference: -2 damaged pipes)",
      createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    });

    // Buying List Item
    await database.insert(schema.buyingListItems).values({
      userId: owner.id,
      productId: p1.id,
      quantityToBuy: 50,
      estimatedUnitCost: "8500",
      supplierName: "Dangote Depot Lagos",
      isCompleted: false,
    });

    // Expenses
    await database.insert(schema.expenses).values([
      {
        userId: owner.id,
        title: "Generator Diesel Fuel (50L)",
        category: "Shop Operations",
        amount: "65000",
        paymentMethod: "CASH",
        notes: "Power for yard lighting and office computer",
        createdAt: new Date(now.getTime() - 3 * dayMs),
      },
      {
        userId: owner.id,
        title: "Offloading Labor for Cement Trailer",
        category: "Transport & Logistics",
        amount: "25000",
        paymentMethod: "CASH",
        notes: "Offloaded 50 bags to yard",
        createdAt: new Date(now.getTime() - 9 * dayMs),
      },
    ]);

    // Audit Log demonstrating multi-user attribution
    await database.insert(schema.auditLogs).values([
      {
        userId: owner.id,
        businessId: biz.id,
        actorId: owner.id,
        actorName: "Alhaji Ibrahim Musa",
        actorRole: "OWNER",
        eventType: "INITIAL_SETUP",
        entityType: "SYSTEM",
        description: "Shop opened and inventory catalog initialized with building materials",
        isSensitive: false,
        createdAt: new Date(now.getTime() - 14 * dayMs),
      },
      {
        userId: owner.id,
        businessId: biz.id,
        actorId: staff.id,
        actorName: "Musa Aminu (Shop Staff)",
        actorRole: "STAFF",
        eventType: "DELIVERY",
        entityType: "DELIVERY",
        description: 'Musa Aminu (Shop Staff) received +20 Bucket of "Dulux WeatherShield White Emulsion (20L)" from CAP Plc Coatings Distributor',
        newValue: "+20 Bucket",
        isSensitive: false,
        createdAt: new Date(now.getTime() - 18 * 60 * 60 * 1000),
      },
      {
        userId: owner.id,
        businessId: biz.id,
        actorId: staff.id,
        actorName: "Musa Aminu (Shop Staff)",
        actorRole: "STAFF",
        eventType: "SALE",
        entityType: "SALE",
        entityId: s3.id,
        description: "Musa Aminu (Shop Staff) recorded sale of 10 Bag of Dangote Cement 42.5R (50kg) to Musa Contractor (Prime Construction)",
        newValue: "10 Bag",
        isSensitive: false,
        createdAt: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      },
      {
        userId: owner.id,
        businessId: biz.id,
        actorId: staff.id,
        actorName: "Musa Aminu (Shop Staff)",
        actorRole: "STAFF",
        eventType: "PAYMENT",
        entityType: "PAYMENT",
        description: "Musa Aminu (Shop Staff) collected ₦34,000 from Musa Contractor (Prime Construction) (CASH)",
        newValue: "₦34,000",
        isSensitive: false,
        createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      },
      {
        userId: owner.id,
        businessId: biz.id,
        actorId: staff.id,
        actorName: "Musa Aminu (Shop Staff)",
        actorRole: "STAFF",
        eventType: "STOCK_COUNT",
        entityType: "STOCK",
        entityId: p3.id,
        oldValue: "35",
        newValue: "33",
        description: "Musa Aminu (Shop Staff) counted PVC Pressure Pipe 4-inch (5.8m): physical 33 Length (Difference: 2 fewer)",
        isSensitive: false,
        createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
      },
    ]);
  } catch (err) {
    console.error("[SISPA] Seed error:", err);
  }
}

if (isTest || !isPostgresReachable()) {
  const pgMemInstance = initPgMem();
  pool = pgMemInstance.pool;
  db = pgMemInstance.db;
} else {
  try {
    pool =
      globalForDb.__arenaNextJsPostgresqlPool ??
      new Pool({
        connectionString: databaseUrl,
      });

    if (process.env.NODE_ENV !== "production") {
      globalForDb.__arenaNextJsPostgresqlPool = pool;
    }

    db = drizzle(pool, { schema });

    seedInitialData(db).catch((err) => {
      console.error("[SISPA] Initial Postgres seed warning:", err);
    });
  } catch (error) {
    console.warn("[AI Studio] Database connection initialization failed — using pg-mem fallback:", error);
    const pgMemInstance = initPgMem();
    pool = pgMemInstance.pool;
    db = pgMemInstance.db;
  }
}

export { pool, db, seedInitialData };

