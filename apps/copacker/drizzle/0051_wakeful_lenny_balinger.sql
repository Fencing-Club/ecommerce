CREATE TABLE "inventory_basis_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"kind" text NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"sourceKey" text NOT NULL,
	"quantity" integer NOT NULL,
	"piecesPerUnit" integer NOT NULL,
	"purchaseId" uuid,
	"location" text,
	"data" jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid,
	CONSTRAINT "inventory_basis_quantity" CHECK ("inventory_basis_records"."quantity" >= 0 and "inventory_basis_records"."piecesPerUnit" > 0),
	CONSTRAINT "inventory_basis_receipt" CHECK (("inventory_basis_records"."kind" = 'receipt') = ("inventory_basis_records"."purchaseId" is not null))
);
--> statement-breakpoint
ALTER TABLE "inventory_basis_records" ADD CONSTRAINT "inventory_basis_records_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_basis_product" ON "inventory_basis_records" USING btree ("orgId","kind","shopifyDomain","variantId","occurredAt");--> statement-breakpoint
CREATE INDEX "inventory_basis_purchase" ON "inventory_basis_records" USING btree ("orgId","purchaseId");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_basis_active_source" ON "inventory_basis_records" USING btree ("orgId","kind","sourceKey") WHERE "inventory_basis_records"."retiredAt" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_basis_opening" ON "inventory_basis_records" USING btree ("orgId","shopifyDomain","variantId","location") WHERE "inventory_basis_records"."retiredAt" is null and "inventory_basis_records"."kind" = 'opening';