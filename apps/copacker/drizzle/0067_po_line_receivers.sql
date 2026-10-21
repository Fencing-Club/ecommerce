-- Each PO line now names its receiver (fba, awd_us or warehouse) in place of the PO's destination and the line's Amazon
-- network: a line to Amazon keeps its network, and every line of a PO to the buyer's location goes to "warehouse".
UPDATE "orders" SET "data" = ("data" - 'destination') || jsonb_build_object('items', (
  SELECT coalesce(jsonb_agg((item - 'amazonNetwork') || jsonb_build_object('receiver',
    CASE WHEN "orders"."data"->>'destination' = 'warehouse' THEN 'warehouse' ELSE coalesce(item->>'amazonNetwork', 'fba') END
  ) ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements("orders"."data"->'items') WITH ORDINALITY AS line(item, position)
)) WHERE "data" ? 'destination';--> statement-breakpoint
UPDATE "order_revisions" SET "data" = ("data" - 'destination') || jsonb_build_object('items', (
  SELECT coalesce(jsonb_agg((item - 'amazonNetwork') || jsonb_build_object('receiver',
    CASE WHEN "order_revisions"."data"->>'destination' = 'warehouse' THEN 'warehouse' ELSE coalesce(item->>'amazonNetwork', 'fba') END
  ) ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements("order_revisions"."data"->'items') WITH ORDINALITY AS line(item, position)
)) WHERE "data" ? 'destination';--> statement-breakpoint
UPDATE "shipments" SET "snapshot" = ("snapshot" - 'destination') || jsonb_build_object('items', (
  SELECT coalesce(jsonb_agg((item - 'amazonNetwork') || jsonb_build_object('receiver',
    CASE WHEN "shipments"."snapshot"->>'destination' = 'warehouse' THEN 'warehouse' ELSE coalesce(item->>'amazonNetwork', 'fba') END
  ) ORDER BY position), '[]'::jsonb)
  FROM jsonb_array_elements("shipments"."snapshot"->'items') WITH ORDINALITY AS line(item, position)
)) WHERE "snapshot" ? 'destination';
