-- A freight forwarder is only a stop on the way (`via`) to Amazon or the buyer's own location, never where a PO ends.
-- POs that went to a forwarder, drafts since submitting refused them, go to Amazon, the default destination, with that
-- forwarder address as their stop. Each line keeps its Amazon network, or goes to FBA when it has none.
UPDATE "orders" SET "data" = jsonb_set(
  ("data" - 'forwarderId' - 'deliveryId') || '{"destination":"amazon"}'::jsonb || CASE
    WHEN jsonb_typeof("data"->'forwarderId') = 'string' AND jsonb_typeof("data"->'deliveryId') = 'string'
    THEN jsonb_build_object('via', jsonb_build_object('forwarderId', "data"->'forwarderId', 'addressId', "data"->'deliveryId'))
    ELSE '{}'::jsonb
  END,
  '{items}',
  (
    SELECT coalesce(jsonb_agg('{"amazonNetwork":"fba"}'::jsonb || line.item ORDER BY line.position), '[]'::jsonb)
    FROM jsonb_array_elements("orders"."data"->'items') WITH ORDINALITY AS line(item, position)
  )
) WHERE "data"->>'destination' = 'forwarder';--> statement-breakpoint
UPDATE "order_revisions" SET "data" = jsonb_set(
  ("data" - 'forwarderId' - 'deliveryId') || '{"destination":"amazon"}'::jsonb || CASE
    WHEN jsonb_typeof("data"->'forwarderId') = 'string' AND jsonb_typeof("data"->'deliveryId') = 'string'
    THEN jsonb_build_object('via', jsonb_build_object('forwarderId', "data"->'forwarderId', 'addressId', "data"->'deliveryId'))
    ELSE '{}'::jsonb
  END,
  '{items}',
  (
    SELECT coalesce(jsonb_agg('{"amazonNetwork":"fba"}'::jsonb || line.item ORDER BY line.position), '[]'::jsonb)
    FROM jsonb_array_elements("order_revisions"."data"->'items') WITH ORDINALITY AS line(item, position)
  )
) WHERE "data"->>'destination' = 'forwarder';--> statement-breakpoint
UPDATE "shipments" SET "snapshot" = jsonb_set(
  ("snapshot" - 'forwarderId' - 'deliveryId') || '{"destination":"amazon"}'::jsonb || CASE
    WHEN jsonb_typeof("snapshot"->'forwarderId') = 'string' AND jsonb_typeof("snapshot"->'deliveryId') = 'string'
    THEN jsonb_build_object('via', jsonb_build_object('forwarderId', "snapshot"->'forwarderId', 'addressId', "snapshot"->'deliveryId'))
    ELSE '{}'::jsonb
  END,
  '{items}',
  (
    SELECT coalesce(jsonb_agg('{"amazonNetwork":"fba"}'::jsonb || line.item ORDER BY line.position), '[]'::jsonb)
    FROM jsonb_array_elements("shipments"."snapshot"->'items') WITH ORDINALITY AS line(item, position)
  )
) WHERE "snapshot"->>'destination' = 'forwarder';
