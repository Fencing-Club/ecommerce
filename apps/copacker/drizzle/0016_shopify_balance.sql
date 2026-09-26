CREATE TABLE "shopify_balance_transactions" (
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"transactionId" text NOT NULL,
	"type" text NOT NULL,
	"processedAt" timestamp with time zone NOT NULL,
	"orderId" text,
	"currency" text NOT NULL,
	"amountMinor" integer NOT NULL,
	"feeMinor" integer NOT NULL,
	"netMinor" integer NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "shopify_balance_transactions_orgId_externalAccountId_transactionId_pk" PRIMARY KEY("orgId","externalAccountId","transactionId")
);
--> statement-breakpoint
ALTER TABLE "shopify_balance_transactions" ADD CONSTRAINT "shopify_balance_transactions_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shopify_balance_processed" ON "shopify_balance_transactions" USING btree ("orgId","externalAccountId","processedAt");