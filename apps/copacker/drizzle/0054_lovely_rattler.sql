CREATE TABLE "inventory_import_cursors" (
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"afterOrderId" text,
	"checkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_import_cursors_orgId_source_externalAccountId_pk" PRIMARY KEY("orgId","source","externalAccountId")
);
--> statement-breakpoint
CREATE TABLE "inventory_import_results" (
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"orderId" text NOT NULL,
	"status" text NOT NULL,
	"createdCount" integer NOT NULL,
	"unchangedCount" integer NOT NULL,
	"gaps" jsonb NOT NULL,
	"checkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_import_results_orgId_source_externalAccountId_orderId_pk" PRIMARY KEY("orgId","source","externalAccountId","orderId")
);
--> statement-breakpoint
CREATE TABLE "inventory_unit_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"sourceProductId" text NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"piecesPerUnit" integer NOT NULL,
	"automatic" boolean NOT NULL,
	"validFrom" timestamp with time zone NOT NULL,
	"validTo" timestamp with time zone NOT NULL,
	"evidence" text NOT NULL,
	"request" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid
);
--> statement-breakpoint
ALTER TABLE "inventory_import_cursors" ADD CONSTRAINT "inventory_import_cursors_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_import_results" ADD CONSTRAINT "inventory_import_results_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_unit_mappings" ADD CONSTRAINT "inventory_unit_mappings_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_import_results_scope" ON "inventory_import_results" USING btree ("orgId","source","externalAccountId","checkedAt");--> statement-breakpoint
CREATE INDEX "inventory_unit_mapping_scope" ON "inventory_unit_mappings" USING btree ("orgId","source","externalAccountId","sourceProductId");