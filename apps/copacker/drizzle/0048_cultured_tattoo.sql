CREATE TABLE "amazon_storage_fee_reports" (
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
	CONSTRAINT "amazon_storage_fee_reports_identity" PRIMARY KEY("orgId","externalAccountId","marketplaceId","kind","from")
);
--> statement-breakpoint
CREATE TABLE "amazon_storage_fees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"kind" text NOT NULL,
	"basis" text NOT NULL,
	"periodDay" date NOT NULL,
	"sku" text,
	"asin" text,
	"fnsku" text,
	"fulfillmentCenterId" text,
	"country" text,
	"currency" text,
	"amount" numeric,
	"quantity" numeric,
	"volume" numeric,
	"volumeUnit" text,
	"rate" numeric,
	"ageTier" text,
	"data" jsonb NOT NULL,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_storage_fee_reports" ADD CONSTRAINT "amazon_storage_fee_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_storage_fees" ADD CONSTRAINT "amazon_storage_fees_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_storage_fees_period" ON "amazon_storage_fees" USING btree ("orgId","externalAccountId","marketplaceId","kind","periodDay");--> statement-breakpoint
CREATE INDEX "amazon_storage_fees_product" ON "amazon_storage_fees" USING btree ("orgId","externalAccountId","asin","fnsku");