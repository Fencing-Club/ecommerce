CREATE TABLE "sales_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"orderId" text NOT NULL,
	"orderedAt" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"syncedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_syncs" (
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"coveredFrom" timestamp with time zone,
	"coveredTo" timestamp with time zone,
	"requestedAt" timestamp with time zone,
	"finishedAt" timestamp with time zone,
	"errorCode" text,
	CONSTRAINT "sales_syncs_orgId_source_pk" PRIMARY KEY("orgId","source")
);
--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD CONSTRAINT "sales_syncs_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_identity" ON "sales_orders" USING btree ("orgId","source","externalAccountId","orderId");--> statement-breakpoint
CREATE INDEX "sales_order_period" ON "sales_orders" USING btree ("orgId","source","orderedAt");