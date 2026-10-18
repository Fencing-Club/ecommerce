-- 0059 has already been applied in previews. Extend its read-only preflight without changing deployed SQL.
-- Match the payment contract in packages/aisle/src/sales.ts; never fabricate or discard financial evidence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales_orders
    WHERE source = 'shopify' AND (
      jsonb_typeof(data->'transactions') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'transactions') = 'array' THEN data->'transactions' ELSE '[]'::jsonb END) AS payment
        WHERE jsonb_typeof(payment->'id') IS DISTINCT FROM 'string'
          OR length(payment->>'id') = 0
          OR jsonb_typeof(payment->'kind') IS DISTINCT FROM 'string'
          OR jsonb_typeof(payment->'status') IS DISTINCT FROM 'string'
          OR jsonb_typeof(payment->'fees') IS DISTINCT FROM 'array'
          OR jsonb_array_length(CASE WHEN jsonb_typeof(payment->'fees') = 'array' THEN payment->'fees' ELSE '[]'::jsonb END) > 50
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(CASE WHEN jsonb_typeof(payment->'fees') = 'array' THEN payment->'fees' ELSE '[]'::jsonb END) AS fee
            CROSS JOIN LATERAL (VALUES (fee->'amount'), (fee->'taxAmount')) AS money(value)
            WHERE jsonb_typeof(money.value->'amount') IS DISTINCT FROM 'string'
              OR (money.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
              OR jsonb_typeof(money.value->'currencyCode') IS DISTINCT FROM 'string'
              OR length(money.value->>'currencyCode') <> 3
          )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Stored Shopify payment data needs a refresh with the previous release before this migration. No data was removed. See docs/operations.md.';
  END IF;
END $$;
