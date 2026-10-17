-- Preserve customized exclusions, including an explicitly empty list.
UPDATE "organizations"
SET "excludedShopifyTags" = ARRAY['Amazon', 'eBay']::text[]
WHERE "excludedShopifyTags" = ARRAY['Amazon']::text[];
