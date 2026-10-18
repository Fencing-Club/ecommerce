CREATE TABLE "amazon_transactions" (
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"transactionId" text NOT NULL,
	"orderId" text,
	"postedAt" timestamp with time zone NOT NULL,
	"type" text NOT NULL,
	"currency" text NOT NULL,
	"totalMinor" integer NOT NULL,
	"feesMinor" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "amazon_transactions_orgId_externalAccountId_transactionId_pk" PRIMARY KEY("orgId","externalAccountId","transactionId")
);
--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "timeZone" text;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "dataVersion" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "feesCoveredFrom" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "feesCoveredTo" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "feesErrorCode" text;--> statement-breakpoint
ALTER TABLE "amazon_transactions" ADD CONSTRAINT "amazon_transactions_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_transaction_order" ON "amazon_transactions" USING btree ("orgId","orderId");--> statement-breakpoint
CREATE INDEX "amazon_transaction_posted" ON "amazon_transactions" USING btree ("orgId","externalAccountId","postedAt");