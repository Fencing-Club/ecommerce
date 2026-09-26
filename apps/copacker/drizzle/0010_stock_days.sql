CREATE TABLE "stock_days" (
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"pool" text NOT NULL,
	"scope" text NOT NULL,
	"itemKey" text NOT NULL,
	"day" date NOT NULL,
	"units" integer NOT NULL,
	"origin" text NOT NULL,
	CONSTRAINT "stock_days_orgId_externalAccountId_pool_scope_itemKey_day_pk" PRIMARY KEY("orgId","externalAccountId","pool","scope","itemKey","day")
);
--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "stockCoveredFrom" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "stockCoveredTo" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD COLUMN "stockErrorCode" text;--> statement-breakpoint
ALTER TABLE "stock_days" ADD CONSTRAINT "stock_days_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;