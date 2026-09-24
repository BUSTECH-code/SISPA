-- ============================================================================
-- SISPA 1.0 — Commercial Tenant Model, Memberships & Single-Use Invitations
-- ============================================================================

-- 1. Create businesses table (First-class commercial tenant)
CREATE TABLE IF NOT EXISTS "businesses" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "currency" text DEFAULT 'NGN' NOT NULL,
  "state" text DEFAULT 'ACTIVE' NOT NULL,
  "owner_user_id" integer,
  "subscription_plan" text DEFAULT 'STANDARD' NOT NULL,
  "subscription_status" text DEFAULT 'TRIAL' NOT NULL,
  "trial_ends_at" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "businesses_state_idx" ON "businesses" ("state");
CREATE INDEX IF NOT EXISTS "businesses_owner_idx" ON "businesses" ("owner_user_id");

-- 2. Update users table with phone & platform admin columns
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_platform_admin" boolean DEFAULT false NOT NULL;

-- 3. Create business_memberships table (User <-> Business lifecycle and capabilities)
CREATE TABLE IF NOT EXISTS "business_memberships" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text DEFAULT 'STAFF' NOT NULL,
  "status" text DEFAULT 'ACTIVE' NOT NULL,
  "custom_capabilities" text,
  "invited_by_user_id" integer REFERENCES "users"("id"),
  "invited_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "suspended_at" timestamp with time zone,
  "deactivated_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "business_user_idx" ON "business_memberships" ("business_id", "user_id");
CREATE INDEX IF NOT EXISTS "memberships_business_idx" ON "business_memberships" ("business_id");
CREATE INDEX IF NOT EXISTS "memberships_user_idx" ON "business_memberships" ("user_id");
CREATE INDEX IF NOT EXISTS "memberships_status_idx" ON "business_memberships" ("status");

-- 4. Create staff_invitations table (Owner-generated, single-use, cryptographic token)
CREATE TABLE IF NOT EXISTS "staff_invitations" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "invitee_email" text,
  "invitee_name" text,
  "role" text DEFAULT 'STAFF' NOT NULL,
  "invited_by_user_id" integer NOT NULL REFERENCES "users"("id"),
  "custom_capabilities" text,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "accepted_at" timestamp with time zone,
  "accepted_by_user_id" integer REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "invitations_token_idx" ON "staff_invitations" ("token");
CREATE INDEX IF NOT EXISTS "invitations_business_idx" ON "staff_invitations" ("business_id");
CREATE INDEX IF NOT EXISTS "invitations_status_idx" ON "staff_invitations" ("status");

-- 5. Create business_subscriptions table
CREATE TABLE IF NOT EXISTS "business_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "plan" text DEFAULT 'STANDARD' NOT NULL,
  "status" text DEFAULT 'TRIAL' NOT NULL,
  "provider" text DEFAULT 'DIRECT' NOT NULL,
  "provider_subscription_id" text,
  "provider_customer_id" text,
  "trial_ends_at" timestamp with time zone,
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "subscriptions_business_idx" ON "business_subscriptions" ("business_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "business_subscriptions" ("status");

-- 6. Create billing_transactions table
CREATE TABLE IF NOT EXISTS "billing_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "amount" numeric(12, 2) NOT NULL,
  "currency" text DEFAULT 'NGN' NOT NULL,
  "status" text DEFAULT 'SUCCEEDED' NOT NULL,
  "provider" text DEFAULT 'DIRECT' NOT NULL,
  "provider_reference" text,
  "description" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "billing_business_idx" ON "billing_transactions" ("business_id");
CREATE INDEX IF NOT EXISTS "billing_status_idx" ON "billing_transactions" ("status");

-- 7. Create support_access_logs table
CREATE TABLE IF NOT EXISTS "support_access_logs" (
  "id" serial PRIMARY KEY NOT NULL,
  "business_id" integer NOT NULL REFERENCES "businesses"("id") ON DELETE CASCADE,
  "requesting_user_id" integer REFERENCES "users"("id"),
  "platform_admin_user_id" integer REFERENCES "users"("id"),
  "reason" text NOT NULL,
  "scope" text DEFAULT 'ACCOUNT_WHATSAPP' NOT NULL,
  "requested_duration_minutes" integer DEFAULT 30 NOT NULL,
  "status" text DEFAULT 'PENDING' NOT NULL,
  "approved_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "rejected_at" timestamp with time zone,
  "rejection_reason" text,
  "revoked_at" timestamp with time zone,
  "revocation_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "support_business_idx" ON "support_access_logs" ("business_id");
CREATE INDEX IF NOT EXISTS "support_admin_idx" ON "support_access_logs" ("platform_admin_user_id");
CREATE INDEX IF NOT EXISTS "support_status_idx" ON "support_access_logs" ("status");

-- 8. Create platform_settings table
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" serial PRIMARY KEY NOT NULL,
  "maintenance_mode" boolean DEFAULT false NOT NULL,
  "maintenance_notice" text,
  "default_trial_days" integer DEFAULT 14 NOT NULL,
  "grace_period_days" integer DEFAULT 7 NOT NULL,
  "allow_self_registration" boolean DEFAULT true NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

-- 8. Add audit_logs commercial tenant & state columns
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "business_id" integer;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "before_state" text;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "after_state" text;

CREATE INDEX IF NOT EXISTS "audit_business_id_idx" ON "audit_logs" ("business_id");

-- 9. Backfill existing businesses from owner users (Migration safety)
INSERT INTO "businesses" ("name", "currency", "state", "owner_user_id", "subscription_plan", "subscription_status", "created_at", "updated_at")
SELECT 
  COALESCE("business_name", 'My Building Materials Shop'),
  'NGN',
  'ACTIVE',
  "id",
  'STANDARD',
  'TRIAL',
  "created_at",
  "updated_at"
FROM "users"
WHERE "role" = 'OWNER'
ON CONFLICT DO NOTHING;

-- 10. Backfill memberships for owners
INSERT INTO "business_memberships" ("business_id", "user_id", "role", "status", "created_at", "updated_at")
SELECT b."id", u."id", 'OWNER', 'ACTIVE', u."created_at", u."updated_at"
FROM "users" u
JOIN "businesses" b ON b."owner_user_id" = u."id"
WHERE u."role" = 'OWNER'
ON CONFLICT DO NOTHING;

-- 11. Backfill memberships for staff
INSERT INTO "business_memberships" ("business_id", "user_id", "role", "status", "created_at", "updated_at")
SELECT b."id", u."id", 'STAFF', 'ACTIVE', u."created_at", u."updated_at"
FROM "users" u
JOIN "businesses" b ON b."owner_user_id" = u."business_owner_id"
WHERE u."role" = 'STAFF'
ON CONFLICT DO NOTHING;
