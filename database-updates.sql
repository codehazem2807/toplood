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

CREATE TABLE IF NOT EXISTS public.warranty_certificates (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number text NOT NULL UNIQUE,
    customer_name text NOT NULL,
    customer_phone text NOT NULL,
    customer_address text NOT NULL,
    device_type text NOT NULL,
    device_model text,
    serial_number text,
    warranty_months integer NOT NULL CHECK (warranty_months IN (6, 12, 18, 24, 36)),
    coverage text,
    issued_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    created_by uuid
);

ALTER TABLE public.warranty_certificates
    ADD COLUMN IF NOT EXISTS fault text,
    ADD COLUMN IF NOT EXISTS parts_total numeric(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS labor_cost numeric(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total numeric(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS repair_order_id uuid REFERENCES public.repair_orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS invoice_id uuid REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.warranty_certificates
    ALTER COLUMN customer_name DROP NOT NULL,
    ALTER COLUMN customer_phone DROP NOT NULL,
    ALTER COLUMN customer_address DROP NOT NULL,
    ALTER COLUMN device_type DROP NOT NULL;

ALTER TABLE public.warranty_certificates
    DROP CONSTRAINT IF EXISTS warranty_certificates_customer_id_fkey,
    DROP CONSTRAINT IF EXISTS warranty_certificates_repair_order_id_fkey,
    DROP CONSTRAINT IF EXISTS warranty_certificates_invoice_id_fkey,
    ADD CONSTRAINT warranty_certificates_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL,
    ADD CONSTRAINT warranty_certificates_repair_order_id_fkey
        FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id) ON DELETE SET NULL,
    ADD CONSTRAINT warranty_certificates_invoice_id_fkey
        FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_items
    ALTER COLUMN product_id DROP NOT NULL;

DO $backfill_warranty_products$
DECLARE
    v_legacy_part record;
    v_product_id uuid;
    v_product_barcode text;
BEGIN
    FOR v_legacy_part IN
        SELECT
            wc.certificate_number,
            wc.coverage,
            wc.parts_total,
            ii.id AS invoice_item_id,
            ii.unit_price
        FROM public.warranty_certificates wc
        JOIN public.invoice_items ii
            ON ii.invoice_id = wc.invoice_id
            AND ii.product_id IS NULL
            AND (ii.product_name = wc.coverage OR ii.description = wc.coverage)
        WHERE wc.invoice_id IS NOT NULL
            AND NULLIF(wc.coverage, '') IS NOT NULL
    LOOP
        v_product_barcode := 'WM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

        INSERT INTO public.products (
            name, barcode, sku, cost_price, sell_price, quantity, min_quantity, description
        )
        VALUES (
            v_legacy_part.coverage,
            v_product_barcode,
            v_product_barcode,
            0,
            COALESCE(v_legacy_part.unit_price, v_legacy_part.parts_total, 0),
            0,
            0,
            'صنف أُضيف من شهادة الضمان ' || v_legacy_part.certificate_number
        )
        RETURNING id INTO v_product_id;

        UPDATE public.invoice_items
        SET product_id = v_product_id
        WHERE id = v_legacy_part.invoice_item_id;
    END LOOP;
END;
$backfill_warranty_products$;

CREATE INDEX IF NOT EXISTS warranty_certificates_issued_at_idx
    ON public.warranty_certificates (issued_at DESC);

CREATE OR REPLACE FUNCTION public.issue_instant_warranty_certificate(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
    v_certificate_number text := p_payload->>'certificate_number';
    v_customer_id uuid;
    v_repair_order_id uuid;
    v_invoice_id uuid;
    v_product_id uuid;
    v_product_barcode text;
    v_invoice_number text := COALESCE(
        NULLIF(p_payload->>'invoice_number', ''),
        'INV-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '-' || left(gen_random_uuid()::text, 4)
    );
    v_invoice_uuid_link uuid := COALESCE(NULLIF(p_payload->>'invoice_uuid_link', '')::uuid, gen_random_uuid());
    v_parts_total numeric(12, 2) := COALESCE(NULLIF(p_payload->>'parts_total', '')::numeric, 0);
    v_labor_cost numeric(12, 2) := COALESCE(NULLIF(p_payload->>'labor_cost', '')::numeric, 0);
    v_total numeric(12, 2) := COALESCE(
        NULLIF(p_payload->>'total', '')::numeric,
        COALESCE(NULLIF(p_payload->>'parts_total', '')::numeric, 0) +
        COALESCE(NULLIF(p_payload->>'labor_cost', '')::numeric, 0)
    );
    v_created_by uuid := NULLIF(p_payload->>'created_by', '')::uuid;
BEGIN
    IF v_certificate_number IS NULL OR v_certificate_number = '' THEN
        RAISE EXCEPTION 'رقم شهادة الضمان مطلوب';
    END IF;

    SELECT customer_id, repair_order_id, invoice_id
    INTO v_customer_id, v_repair_order_id, v_invoice_id
    FROM public.warranty_certificates
    WHERE certificate_number = v_certificate_number;

    IF v_invoice_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'certificate_number', v_certificate_number,
            'customer_id', v_customer_id,
            'repair_order_id', v_repair_order_id,
            'invoice_id', v_invoice_id,
            'invoice_number', v_invoice_number
        );
    END IF;

    INSERT INTO public.customers (name, phone, address)
    VALUES (p_payload->>'customer_name', p_payload->>'customer_phone', p_payload->>'customer_address')
    RETURNING id INTO v_customer_id;

    INSERT INTO public.repair_orders (
        customer_id, device_type, device_model, serial_number, problem,
        labor_cost, status, notes, created_by
    )
    VALUES (
        v_customer_id,
        p_payload->>'device_type',
        NULLIF(p_payload->>'device_model', ''),
        NULLIF(p_payload->>'serial_number', ''),
        COALESCE(NULLIF(p_payload->>'fault', ''), 'إصدار شهادة ضمان فورية'),
        v_labor_cost,
        'received',
        'أمر صيانة صادر مع شهادة ضمان ' || v_certificate_number,
        v_created_by
    )
    RETURNING id INTO v_repair_order_id;

    INSERT INTO public.invoices (
        customer_id, repair_order_id, invoice_number, uuid_link,
        parts_total, labor_cost, subtotal, discount, discount_type,
        total, paid_amount, payment_method, paid, warranty_months, created_by
    )
    VALUES (
        v_customer_id, v_repair_order_id, v_invoice_number, v_invoice_uuid_link,
        v_parts_total, v_labor_cost, v_parts_total + v_labor_cost, 0, 'fixed',
        v_total, 0, 'cash', v_total = 0,
        COALESCE(NULLIF(p_payload->>'warranty_months', '')::integer, 6),
        v_created_by
    )
    RETURNING id INTO v_invoice_id;

    IF NULLIF(p_payload->>'coverage', '') IS NOT NULL THEN
        v_product_barcode := 'WM-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

        INSERT INTO public.products (
            name, barcode, sku, cost_price, sell_price, quantity, min_quantity, description
        )
        VALUES (
            p_payload->>'coverage',
            v_product_barcode,
            v_product_barcode,
            0,
            v_parts_total,
            0,
            0,
            'صنف أُضيف تلقائيًا من شهادة الضمان ' || v_certificate_number
        )
        RETURNING id INTO v_product_id;

        INSERT INTO public.invoice_items (
            invoice_id, product_id, product_name, description,
            quantity, unit_price, cost_price, total
        )
        VALUES (
            v_invoice_id, v_product_id, p_payload->>'coverage', p_payload->>'coverage',
            1, v_parts_total, 0, v_parts_total
        );
    END IF;

    INSERT INTO public.repair_timeline (repair_order_id, status, note, created_by)
    VALUES (v_repair_order_id, 'received', 'تم إنشاء أمر الصيانة مع شهادة ضمان ' || v_certificate_number, v_created_by);

    IF EXISTS (
        SELECT 1 FROM public.warranty_certificates
        WHERE certificate_number = v_certificate_number
    ) THEN
        UPDATE public.warranty_certificates
        SET customer_id = v_customer_id,
            repair_order_id = v_repair_order_id,
            invoice_id = v_invoice_id
        WHERE certificate_number = v_certificate_number;
    ELSE
        INSERT INTO public.warranty_certificates (
            certificate_number, warranty_months, coverage,
            issued_at, expires_at, created_by,
            customer_id, repair_order_id, invoice_id
        )
        VALUES (
            v_certificate_number,
            COALESCE(NULLIF(p_payload->>'warranty_months', '')::integer, 6),
            NULLIF(p_payload->>'coverage', ''),
            COALESCE(NULLIF(p_payload->>'issued_at', '')::timestamptz, now()),
            COALESCE(NULLIF(p_payload->>'expires_at', '')::timestamptz, now() + interval '6 months'),
            v_created_by,
            v_customer_id, v_repair_order_id, v_invoice_id
        );
    END IF;

    RETURN jsonb_build_object(
        'certificate_number', v_certificate_number,
        'customer_id', v_customer_id,
        'repair_order_id', v_repair_order_id,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_number
    );
END;
$function$;

-- The current browser app uses its own local session and the Supabase anon key.
-- Review/replace these grants with authenticated RLS policies before public deployment.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.expenses TO anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.warranty_certificates TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_instant_warranty_certificate(jsonb) TO anon, authenticated;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

SELECT
        current_database() AS database_name,
        to_regclass('public.repair_orders') AS repair_orders_table,
        to_regclass('public.expenses') AS expenses_table,
        to_regclass('public.warranty_certificates') AS warranty_certificates_table,
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
        COALESCE(has_table_privilege('anon', to_regclass('public.expenses'), 'SELECT'), false) AS anon_can_select_expenses,
        COALESCE(has_table_privilege('anon', to_regclass('public.warranty_certificates'), 'INSERT'), false) AS anon_can_insert_warranty_certificates;
