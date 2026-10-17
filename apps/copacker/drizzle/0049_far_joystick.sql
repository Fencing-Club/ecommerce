CREATE TABLE "amazon_removal_reports" (
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"kind" text NOT NULL,
	"from" timestamp with time zone NOT NULL,
	"requestedTo" timestamp with time zone NOT NULL,
	"coveredTo" timestamp with time zone,
	"status" text NOT NULL,
	"errorCode" text,
	"rowCount" integer,
	"checkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"importedAt" timestamp with time zone,
	CONSTRAINT "amazon_removal_reports_identity" PRIMARY KEY("orgId","externalAccountId","marketplaceId","kind","from")
);
--> statement-breakpoint
CREATE TABLE "amazon_removals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"kind" text NOT NULL,
	"requestedAt" timestamp with time zone NOT NULL,
	"orderId" text NOT NULL,
	"orderType" text,
	"orderSource" text,
	"serviceSpeed" text,
	"status" text,
	"updatedAt" timestamp with time zone,
	"shippedAt" timestamp with time zone,
	"sku" text,
	"fnsku" text,
	"disposition" text,
	"requestedQuantity" integer,
	"cancelledQuantity" integer,
	"disposedQuantity" integer,
	"shippedQuantity" integer,
	"inProcessQuantity" integer,
	"removalFee" numeric,
	"currency" text,
	"carrier" text,
	"trackingNumber" text,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_removal_reports" ADD CONSTRAINT "amazon_removal_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_removals" ADD CONSTRAINT "amazon_removals_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_removals_requests" ON "amazon_removals" USING btree ("orgId","externalAccountId","marketplaceId","kind","requestedAt");--> statement-breakpoint
CREATE INDEX "amazon_removals_shipments" ON "amazon_removals" USING btree ("orgId","externalAccountId","marketplaceId","kind","shippedAt");--> statement-breakpoint
CREATE INDEX "amazon_removals_orders" ON "amazon_removals" USING btree ("orgId","externalAccountId","orderId");