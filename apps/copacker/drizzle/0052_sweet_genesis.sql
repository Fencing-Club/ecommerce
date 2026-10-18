CREATE TABLE "inventory_landed_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"sourceKey" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"allocations" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid
);
--> statement-breakpoint
ALTER TABLE "inventory_landed_charges" ADD CONSTRAINT "inventory_landed_charges_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inventory_landed_scope" ON "inventory_landed_charges" USING btree ("orgId","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_landed_source" ON "inventory_landed_charges" USING btree ("orgId","sourceKey") WHERE "inventory_landed_charges"."retiredAt" is null;