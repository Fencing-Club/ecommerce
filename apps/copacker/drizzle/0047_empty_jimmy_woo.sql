CREATE TABLE "amazon_inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"eventDay" date NOT NULL,
	"sku" text,
	"fnsku" text,
	"asin" text,
	"eventType" text NOT NULL,
	"referenceId" text,
	"quantity" integer NOT NULL,
	"fulfillmentCenterId" text,
	"disposition" text,
	"reason" text,
	"country" text,
	"reconciledQuantity" integer,
	"unreconciledQuantity" integer,
	"dateAndTime" text,
	"store" text,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_movement_reports" (
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"from" timestamp with time zone NOT NULL,
	"requestedTo" timestamp with time zone NOT NULL,
	"coveredTo" timestamp with time zone,
	"status" text NOT NULL,
	"errorCode" text,
	"rowCount" integer,
	"checkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"importedAt" timestamp with time zone,
	CONSTRAINT "amazon_movement_reports_identity" PRIMARY KEY("orgId","externalAccountId","marketplaceId","from")
);
--> statement-breakpoint
ALTER TABLE "amazon_inventory_movements" ADD CONSTRAINT "amazon_inventory_movements_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_movement_reports" ADD CONSTRAINT "amazon_movement_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_movements_period" ON "amazon_inventory_movements" USING btree ("orgId","externalAccountId","marketplaceId","eventDay");--> statement-breakpoint
CREATE INDEX "amazon_movements_reference" ON "amazon_inventory_movements" USING btree ("orgId","externalAccountId","referenceId");--> statement-breakpoint
CREATE INDEX "amazon_movements_product" ON "amazon_inventory_movements" USING btree ("orgId","externalAccountId","sku","eventDay");