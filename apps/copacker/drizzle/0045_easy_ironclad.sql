CREATE TABLE "amazon_return_reports" (
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
	CONSTRAINT "amazon_return_reports_orgId_externalAccountId_marketplaceId_from_pk" PRIMARY KEY("orgId","externalAccountId","marketplaceId","from")
);
--> statement-breakpoint
CREATE TABLE "amazon_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"returnedAt" timestamp with time zone NOT NULL,
	"orderId" text NOT NULL,
	"sku" text NOT NULL,
	"asin" text,
	"fnsku" text,
	"quantity" integer NOT NULL,
	"fulfillmentCenterId" text,
	"disposition" text,
	"reason" text,
	"status" text,
	"licensePlateNumber" text,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_return_reports" ADD CONSTRAINT "amazon_return_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_returns" ADD CONSTRAINT "amazon_returns_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_returns_period" ON "amazon_returns" USING btree ("orgId","externalAccountId","marketplaceId","returnedAt");--> statement-breakpoint
CREATE INDEX "amazon_returns_order" ON "amazon_returns" USING btree ("orgId","externalAccountId","orderId");