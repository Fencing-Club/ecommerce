CREATE TABLE "amazon_inbound_shipments" (
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"shipmentId" text NOT NULL,
	"network" text NOT NULL,
	"units" jsonb,
	"fetchedAt" timestamp with time zone NOT NULL,
	CONSTRAINT "amazon_inbound_shipments_orgId_externalAccountId_shipmentId_pk" PRIMARY KEY("orgId","externalAccountId","shipmentId")
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"currency" text NOT NULL,
	"day" date NOT NULL,
	"perUsd" numeric(20, 10) NOT NULL,
	CONSTRAINT "exchange_rates_currency_day_pk" PRIMARY KEY("currency","day")
);
--> statement-breakpoint
CREATE TABLE "monthly_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"name" text NOT NULL,
	"amountMinor" integer NOT NULL,
	"currency" text NOT NULL,
	"channel" text,
	"startsOn" date,
	"endsOn" date,
	"createdBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_inbound_shipments" ADD CONSTRAINT "amazon_inbound_shipments_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_costs" ADD CONSTRAINT "monthly_costs_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monthly_cost_org" ON "monthly_costs" USING btree ("orgId");--> statement-breakpoint
-- Units of a currency per US dollar on a day: the latest rate published on or before it, or the earliest one for a day
-- before the stored rates begin. Null for a currency without rates.
CREATE FUNCTION fx_per_usd(text, timestamptz) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN $1 = 'USD' THEN 1::numeric ELSE coalesce(
    (SELECT r."perUsd" FROM exchange_rates r WHERE r.currency = $1 AND r.day <= ($2 AT TIME ZONE 'UTC')::date
      ORDER BY r.day DESC LIMIT 1),
    (SELECT r."perUsd" FROM exchange_rates r WHERE r.currency = $1 ORDER BY r.day LIMIT 1)) END
$$;--> statement-breakpoint
-- What one unit of the first currency is worth in the second on a day. Null when either has no rates.
CREATE FUNCTION fx_rate(text, text, timestamptz) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN $1 = $2 THEN 1::numeric ELSE fx_per_usd($2, $3) / fx_per_usd($1, $3) END
$$;
