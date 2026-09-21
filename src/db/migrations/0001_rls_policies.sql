-- ============================================================================
-- SISPA 1.0 — PostgreSQL / Supabase Row Level Security (RLS) Policies
-- ============================================================================

-- 1. Enable Row Level Security on all core tenant tables
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customers" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "customer_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "expenses" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "stock_ledger_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "buying_list_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "daily_cash_checks" ENABLE ROW LEVEL SECURITY;

-- 2. Ready-to-use Supabase Auth Policies (if migrating to Supabase Auth auth.uid()):
--
-- CREATE POLICY "Users can access their own business profile"
--   ON "users" FOR ALL
--   USING (email = auth.jwt() ->> 'email');
--
-- CREATE POLICY "Users can access their own customers"
--   ON "customers" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can access their own products"
--   ON "products" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can access their own sales"
--   ON "sales" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can access their own payments"
--   ON "customer_payments" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can access their own expenses"
--   ON "expenses" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can access and append their own ledger entries"
--   ON "stock_ledger_entries" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can access their own buying list"
--   ON "buying_list_items" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can view audit logs"
--   ON "audit_logs" FOR SELECT
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
--
-- CREATE POLICY "Users can view daily cash checks"
--   ON "daily_cash_checks" FOR ALL
--   USING (user_id = (SELECT id FROM users WHERE email = auth.jwt() ->> 'email'));
