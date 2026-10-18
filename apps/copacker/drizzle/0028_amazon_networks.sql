ALTER TABLE "product_defaults" ADD COLUMN "amazonNetwork" text DEFAULT 'fba' NOT NULL;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "amazonNetwork" text;--> statement-breakpoint
-- A PO to Amazon now names its Amazon network on each line. Shipments already sent keep the network they were created in.
UPDATE "shipments" SET "amazonNetwork" = CASE WHEN "snapshot"->>'destination' = 'fba' THEN 'fba' ELSE 'awd_us' END
WHERE "snapshot"->>'destination' IN ('amazon', 'awd_us', 'awd_china', 'fba') AND "status" NOT IN ('packing', 'approval');--> statement-breakpoint
UPDATE "orders" SET "data" = jsonb_set("data" || '{"destination":"amazon"}', '{items}', (
  SELECT coalesce(jsonb_agg(item || jsonb_build_object('amazonNetwork', CASE WHEN "orders"."data"->>'destination' = 'fba' THEN 'fba' ELSE 'awd_us' END)), '[]'::jsonb)
  FROM jsonb_array_elements("orders"."data"->'items') AS item
)) WHERE "data"->>'destination' IN ('amazon', 'awd_us', 'awd_china', 'fba');--> statement-breakpoint
UPDATE "order_revisions" SET "data" = jsonb_set("data" || '{"destination":"amazon"}', '{items}', (
  SELECT coalesce(jsonb_agg(item || jsonb_build_object('amazonNetwork', CASE WHEN "order_revisions"."data"->>'destination' = 'fba' THEN 'fba' ELSE 'awd_us' END)), '[]'::jsonb)
  FROM jsonb_array_elements("order_revisions"."data"->'items') AS item
)) WHERE "data"->>'destination' IN ('amazon', 'awd_us', 'awd_china', 'fba');--> statement-breakpoint
UPDATE "shipments" SET "snapshot" = jsonb_set("snapshot" || '{"destination":"amazon"}', '{items}', (
  SELECT coalesce(jsonb_agg(item || jsonb_build_object('amazonNetwork', CASE WHEN "shipments"."snapshot"->>'destination' = 'fba' THEN 'fba' ELSE 'awd_us' END)), '[]'::jsonb)
  FROM jsonb_array_elements("shipments"."snapshot"->'items') AS item
)) WHERE "snapshot"->>'destination' IN ('amazon', 'awd_us', 'awd_china', 'fba');
