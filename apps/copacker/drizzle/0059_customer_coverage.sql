-- Fail before changing the schema if stored Shopify data still needs the previous release's refresh path.
-- Do not invent missing financial values or delete historical records to satisfy the new runtime contract.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM sales_orders
    WHERE source = 'shopify' AND (
      jsonb_typeof(data->'tags') IS DISTINCT FROM 'array'
      OR jsonb_typeof(data->'transactions') IS DISTINCT FROM 'array'
      OR jsonb_typeof(data->'lines') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'lines') = 'array' THEN data->'lines' ELSE '[]'::jsonb END) AS line
        WHERE jsonb_typeof(line->'originalUnitPriceSet'->'shopMoney'->'amount') IS DISTINCT FROM 'string'
          OR jsonb_typeof(line->'originalUnitPriceSet'->'shopMoney'->'currencyCode') IS DISTINCT FROM 'string'
          OR jsonb_typeof(line->'discountAllocations') IS DISTINCT FROM 'array'
      )
    )
  ) OR EXISTS (
    SELECT 1 FROM stock_snapshots
    WHERE source = 'shopify' AND data IS NOT NULL AND (
      jsonb_typeof(data->'rows') IS DISTINCT FROM 'array'
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(data->'rows') = 'array' THEN data->'rows' ELSE '[]'::jsonb END) AS item
        WHERE jsonb_typeof(item->'productId') IS DISTINCT FROM 'string'
          OR jsonb_typeof(item->'productTitle') IS DISTINCT FROM 'string'
          OR jsonb_typeof(item->'variantTitle') IS DISTINCT FROM 'string'
          OR NOT (item ? 'imageUrl')
      )
    )
  ) THEN
    RAISE EXCEPTION 'Stored Shopify data needs a refresh with the previous release before this migration. No data was removed. See docs/operations.md.';
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "customersIncluded" boolean DEFAULT false NOT NULL;
