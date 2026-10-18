CREATE TABLE "amazon_ads_connections" (
	"orgId" uuid PRIMARY KEY NOT NULL,
	"sellerId" text NOT NULL,
	"generation" uuid DEFAULT gen_random_uuid() NOT NULL,
	"encryptedToken" text NOT NULL,
	"profiles" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_ads_days" (
	"orgId" uuid NOT NULL,
	"sellerId" text NOT NULL,
	"profileId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"day" date NOT NULL,
	"currency" text NOT NULL,
	"cost" numeric(20, 6) NOT NULL,
	"syncedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "amazon_ads_days_orgId_sellerId_profileId_day_pk" PRIMARY KEY("orgId","sellerId","profileId","day")
);
--> statement-breakpoint
ALTER TABLE "amazon_ads_connections" ADD CONSTRAINT "amazon_ads_connections_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_ads_days" ADD CONSTRAINT "amazon_ads_days_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;