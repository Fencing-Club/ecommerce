CREATE TABLE "product_barcodes" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"productId" text NOT NULL,
	"objectKey" text NOT NULL,
	"name" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploadedBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_barcodes_orgId_shopifyDomain_variantId_pk" PRIMARY KEY("orgId","shopifyDomain","variantId"),
	CONSTRAINT "product_barcodes_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;