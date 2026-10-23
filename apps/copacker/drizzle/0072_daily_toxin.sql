ALTER TABLE "connections" ADD COLUMN "inventoryLocations" jsonb;
--> statement-breakpoint
-- A single authoritative warehouse is unambiguous. Preserve multi-warehouse quantities for an explicit choice.
-- Only untouched imported sets are converted; subsequent buyer edits and account replacements remain untouched.
WITH merchant_locations AS (
  SELECT DISTINCT ss."orgId", ss."externalAccountId" AS domain, level->>'locationId' AS location_id
  FROM "stock_snapshots" ss
  JOIN "connections" c ON c."orgId" = ss."orgId" AND c."provider" = 'shopify'
    AND c."externalId" = ss."externalAccountId"
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(ss."data"->'rows', '[]'::jsonb)) product
  CROSS JOIN LATERAL jsonb_array_elements(coalesce(product->'levels', '[]'::jsonb)) level
  LEFT JOIN "inventory_location_mappings" m ON m."orgId" = ss."orgId"
    AND m."shopifyDomain" = ss."externalAccountId" AND m."locationId" = level->>'locationId'
  WHERE ss."source" = 'shopify' AND ss."scopeKey" = 'store'
    AND level->>'locationId' IS NOT NULL
    AND coalesce(level->>'locationKind', '') <> 'amazon_fulfillment'
    AND coalesce(m."classification", CASE WHEN level->>'locationKind' = 'merchant' THEN 'merchant' ELSE 'unresolved' END) = 'merchant'
), single_warehouse AS (
  SELECT "orgId", domain, min(location_id) AS location_id
  FROM merchant_locations GROUP BY "orgId", domain HAVING count(*) = 1
)
UPDATE "variant_stock_target_sets" s SET
  "targets" = s."targets" || jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid(), 'quantity', imported->'quantity', 'destination', jsonb_build_object(
      'kind', 'pool', 'locations', jsonb_build_array(jsonb_build_object(
        'provider', 'shopify', 'accountId', w.domain, 'scope', 'store', 'externalId', w.location_id))))),
  "unassigned" = (SELECT coalesce(jsonb_agg(value), '[]'::jsonb) FROM jsonb_array_elements(s."unassigned") WHERE value->>'source' <> 'store'),
  "revision" = s."revision" + 1
FROM single_warehouse w
JOIN "variant_stock_target_sets" original ON original."orgId" = w."orgId" AND original."shopifyDomain" = w.domain
CROSS JOIN LATERAL jsonb_array_elements(original."unassigned") imported
WHERE s."orgId" = w."orgId" AND s."shopifyDomain" = w.domain AND s."revision" = 1
  AND original."orgId" = s."orgId" AND original."shopifyDomain" = s."shopifyDomain" AND original."variantId" = s."variantId"
  AND imported->>'source' = 'store'
  AND NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(s."targets") target
    WHERE target->'destination'->>'kind' <> 'group'
      OR NOT EXISTS (SELECT 1 FROM "inventory_location_groups" g
        WHERE g."orgId" = s."orgId" AND g."id"::text = target->'destination'->>'groupId'
        AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(g."locations") member WHERE member->>'provider' <> 'amazon'))
  );
