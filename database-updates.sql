-- Run this idempotent script in the Supabase SQL Editor.

ALTER TABLE public.repair_orders
    ADD COLUMN IF NOT EXISTS expected_repair_date date,
    ADD COLUMN IF NOT EXISTS visit_at timestamptz,
    ADD COLUMN IF NOT EXISTS visit_notified_at timestamptz,
    ADD COLUMN IF NOT EXISTS visit_completed_at timestamptz;

CREATE INDEX IF NOT EXISTS repair_orders_visit_at_idx
    ON public.repair_orders (visit_at)
    WHERE visit_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title text NOT NULL,
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    category text NOT NULL DEFAULT 'أخرى',
    expense_date date NOT NULL DEFAULT CURRENT_DATE,
    payment_method text NOT NULL DEFAULT 'cash',
    notes text,
    created_by uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expenses_expense_date_idx
    ON public.expenses (expense_date DESC);

-- The current browser app uses its own local session and the Supabase anon key.
-- Review/replace these grants with authenticated RLS policies before public deployment.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO anon, authenticated;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

SELECT
        current_database() AS database_name,
        to_regclass('public.repair_orders') AS repair_orders_table,
        to_regclass('public.expenses') AS expenses_table,
        EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'repair_orders'
                    AND column_name = 'visit_at'
        ) AS has_visit_at,
        EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public'
                    AND table_name = 'repair_orders'
                    AND column_name = 'expected_repair_date'
        ) AS has_expected_repair_date,
        has_schema_privilege('anon', 'public', 'USAGE') AS anon_has_public_usage,
        COALESCE(has_table_privilege('anon', to_regclass('public.expenses'), 'SELECT'), false) AS anon_can_select_expenses;
