CREATE TABLE "inventory_location_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"name" text NOT NULL,
	"locations" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "variant_stock_target_sets" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"targets" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"unassigned" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_stock_target_sets_orgId_shopifyDomain_variantId_pk" PRIMARY KEY("orgId","shopifyDomain","variantId")
);
--> statement-breakpoint
ALTER TABLE "inventory_location_groups" ADD CONSTRAINT "inventory_location_groups_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_stock_target_sets" ADD CONSTRAINT "variant_stock_target_sets_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_location_groups_org" ON "inventory_location_groups" USING btree ("orgId");
--> statement-breakpoint
-- Keep each existing Amazon quantity on one explicitly account-scoped US group.
INSERT INTO "inventory_location_groups" ("orgId", "name", "locations")
SELECT c."orgId", 'Amazon US', jsonb_build_array(
  jsonb_build_object('provider', 'amazon', 'accountId', c."externalId", 'scope', 'ATVPDKIKX0DER', 'externalId', 'fba'),
  jsonb_build_object('provider', 'amazon', 'accountId', c."externalId", 'scope', 'us', 'externalId', 'awd')
)
FROM "connections" c
WHERE c."provider" = 'amazon'
AND EXISTS (SELECT 1 FROM "variant_fields" v WHERE v."orgId" = c."orgId" AND v."amazonStockTarget" IS NOT NULL);
--> statement-breakpoint
-- A store buffer has no saved warehouse identity. Preserve it for an explicit destination choice, never split it.
INSERT INTO "variant_stock_target_sets" ("orgId", "shopifyDomain", "variantId", "targets", "unassigned")
SELECT v."orgId", v."shopifyDomain", v."variantId",
  CASE WHEN v."amazonStockTarget" IS NOT NULL AND g."id" IS NOT NULL THEN jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid(), 'quantity', v."amazonStockTarget", 'stocked', v."amazonStockTarget" <> 0, 'destination',
      jsonb_build_object('kind', 'group', 'groupId', g."id"))) ELSE '[]'::jsonb END,
  CASE WHEN v."storeStockTarget" IS NOT NULL THEN jsonb_build_array(
    jsonb_build_object('source', 'store', 'quantity', v."storeStockTarget")) ELSE '[]'::jsonb END
  || CASE WHEN v."amazonStockTarget" IS NOT NULL AND g."id" IS NULL THEN jsonb_build_array(
    jsonb_build_object('source', 'amazon', 'quantity', v."amazonStockTarget")) ELSE '[]'::jsonb END
FROM "variant_fields" v
LEFT JOIN "connections" sc ON sc."orgId" = v."orgId" AND sc."provider" = 'shopify' AND sc."externalId" = v."shopifyDomain"
LEFT JOIN "inventory_location_groups" g ON g."orgId" = v."orgId" AND sc."id" IS NOT NULL
WHERE v."amazonStockTarget" IS NOT NULL OR v."storeStockTarget" IS NOT NULL;
