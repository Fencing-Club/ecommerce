CREATE TABLE "amazon_product_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"sku" text NOT NULL,
	"asin" text,
	"fnsku" text,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"validFrom" timestamp with time zone NOT NULL,
	"validTo" timestamp with time zone NOT NULL,
	"evidence" text NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid,
	CONSTRAINT "amazon_product_mapping_period" CHECK ("amazon_product_mappings"."validFrom" < "amazon_product_mappings"."validTo")
);
--> statement-breakpoint
ALTER TABLE "amazon_product_mappings" ADD CONSTRAINT "amazon_product_mappings_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_product_mapping_scope" ON "amazon_product_mappings" USING btree ("orgId","externalAccountId","marketplaceId","sku","validFrom");