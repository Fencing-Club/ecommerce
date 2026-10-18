CREATE TABLE "supplier_catalog_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"objectKey" text NOT NULL,
	"filename" text NOT NULL,
	"createdBy" text NOT NULL,
	"rowCount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_catalog_imports_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"supplierSku" text NOT NULL,
	"title" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"currency" text NOT NULL,
	"priceMinor" integer,
	"priceBasis" text DEFAULT 'piece' NOT NULL,
	"piecesPerSellablePack" integer DEFAULT 1 NOT NULL,
	"sellablePacksPerCase" integer DEFAULT 1 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_profiles" (
	"orgId" uuid PRIMARY KEY NOT NULL,
	"website" text,
	"phoneNumber" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "supplier_buyer_email";--> statement-breakpoint
ALTER TABLE "supplier_catalog_imports" ADD CONSTRAINT "supplier_catalog_imports_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_product_sku" ON "supplier_products" USING btree ("supplierOrgId","supplierSku");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_buyer_name" ON "suppliers" USING btree ("buyerOrgId","name");