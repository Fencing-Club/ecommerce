CREATE TABLE "shopify_field_imports" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_field_imports_orgId_shopifyDomain_pk" PRIMARY KEY("orgId","shopifyDomain")
);
--> statement-breakpoint
CREATE TABLE "variant_fields" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"supplierSku" text,
	"asin" text,
	"amazonStockTarget" integer,
	"storeStockTarget" integer,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_fields_orgId_shopifyDomain_variantId_pk" PRIMARY KEY("orgId","shopifyDomain","variantId")
);
--> statement-breakpoint
ALTER TABLE "product_defaults" ADD COLUMN "caseQuantity" integer;--> statement-breakpoint
ALTER TABLE "shopify_field_imports" ADD CONSTRAINT "shopify_field_imports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_fields" ADD CONSTRAINT "variant_fields_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;