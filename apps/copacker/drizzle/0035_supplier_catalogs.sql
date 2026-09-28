CREATE TABLE "catalog_products" (
	"catalogId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"priceMinor" integer,
	"priceBreaks" jsonb,
	"quantityRules" jsonb,
	CONSTRAINT "catalog_products_catalogId_productId_pk" PRIMARY KEY("catalogId","productId")
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"adjustmentBasisPoints" integer DEFAULT 0 NOT NULL,
	"includeNewProducts" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_product_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"productCode" text,
	"url" text,
	"description" text,
	"optionNames" text[] DEFAULT '{}' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "groupId" uuid;--> statement-breakpoint
-- Each existing product becomes a product of its own with one variant, sharing its id.
INSERT INTO "supplier_product_groups" ("id", "supplierOrgId", "title", "created_at", "updatedAt")
SELECT "id", "supplierOrgId", "title", "created_at", "updatedAt" FROM "supplier_products";--> statement-breakpoint
UPDATE "supplier_products" SET "groupId" = "id";--> statement-breakpoint
ALTER TABLE "supplier_products" ALTER COLUMN "groupId" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "options" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "position" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "priceBreaks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "quantityRules" jsonb DEFAULT '{"increment":1,"minimum":1,"maximum":null}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" ADD COLUMN "catalogId" uuid;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_catalogId_catalogs_id_fk" FOREIGN KEY ("catalogId") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_productId_supplier_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."supplier_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_product_groups" ADD CONSTRAINT "supplier_product_groups_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "catalog_product_product" ON "catalog_products" USING btree ("productId");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_supplier_title" ON "catalogs" USING btree ("supplierOrgId","title");--> statement-breakpoint
CREATE INDEX "supplier_product_group_org" ON "supplier_product_groups" USING btree ("supplierOrgId");--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_groupId_supplier_product_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."supplier_product_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_catalogId_catalogs_id_fk" FOREIGN KEY ("catalogId") REFERENCES "public"."catalogs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "supplier_product_group" ON "supplier_products" USING btree ("groupId");