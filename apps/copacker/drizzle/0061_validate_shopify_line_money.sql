-- Extend the preflight without editing applied migrations or changing stored financial evidence.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales_orders
    WHERE source = 'shopify' AND (
      jsonb_typeof(data->'lines') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'lines') = 'array' THEN data->'lines' ELSE '[]'::jsonb END) AS line
        WHERE jsonb_typeof(line->'discountAllocations') IS DISTINCT FROM 'array'
          OR jsonb_array_length(CASE WHEN jsonb_typeof(line->'discountAllocations') = 'array' THEN line->'discountAllocations' ELSE '[]'::jsonb END) > 250
          OR EXISTS (
            SELECT 1 FROM (
              SELECT line->'originalUnitPriceSet'->'shopMoney' AS value
              UNION ALL
              SELECT allocation->'allocatedAmountSet'->'shopMoney'
              FROM jsonb_array_elements(CASE WHEN jsonb_typeof(line->'discountAllocations') = 'array' THEN line->'discountAllocations' ELSE '[]'::jsonb END) AS allocation
            ) AS money
            WHERE jsonb_typeof(money.value->'amount') IS DISTINCT FROM 'string'
              OR (money.value->>'amount') !~ '^-?[0-9]+(\.[0-9]+)?$'
              OR jsonb_typeof(money.value->'currencyCode') IS DISTINCT FROM 'string'
              OR length(money.value->>'currencyCode') <> 3
          )
      )
    )
  ) THEN
    RAISE EXCEPTION 'Stored Shopify line price or discount allocation data needs a refresh with the previous release before this migration. No data was removed. See docs/operations.md.';
  END IF;
END $$;
