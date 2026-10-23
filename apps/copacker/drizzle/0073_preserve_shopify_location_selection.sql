-- Preserve the previously enabled single Shopify warehouse as an explicit connection selection.
-- New discovered locations must not silently change the Fencing Club target's planning scope.
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
UPDATE "connections" c SET "inventoryLocations" = jsonb_build_array(jsonb_build_object(
  'provider', 'shopify', 'accountId', w.domain, 'scope', 'store', 'externalId', w.location_id))
FROM single_warehouse w
WHERE c."orgId" = w."orgId" AND c."provider" = 'shopify' AND c."externalId" = w.domain
  AND c."inventoryLocations" IS NULL;
