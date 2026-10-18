CREATE TABLE "amazon_fulfillment_shipments" (
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"shipmentId" text NOT NULL,
	"shipmentItemId" text NOT NULL,
	"orderId" text NOT NULL,
	"orderItemId" text,
	"shippedAt" timestamp with time zone NOT NULL,
	"sku" text NOT NULL,
	"quantity" integer NOT NULL,
	"fulfillmentCenterId" text,
	"fulfillmentChannel" text,
	"salesChannel" text,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amazon_fulfillment_shipments_orgId_externalAccountId_shipmentId_shipmentItemId_pk" PRIMARY KEY("orgId","externalAccountId","shipmentId","shipmentItemId")
);
--> statement-breakpoint
CREATE TABLE "amazon_shipment_reports" (
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
	CONSTRAINT "amazon_shipment_reports_orgId_externalAccountId_marketplaceId_from_pk" PRIMARY KEY("orgId","externalAccountId","marketplaceId","from")
);
--> statement-breakpoint
CREATE TABLE "amazon_shipment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"requestedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "amazon_fulfillment_shipments" ADD CONSTRAINT "amazon_fulfillment_shipments_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_shipment_reports" ADD CONSTRAINT "amazon_shipment_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_shipment_requests" ADD CONSTRAINT "amazon_shipment_requests_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_fulfillment_shipments_period" ON "amazon_fulfillment_shipments" USING btree ("orgId","externalAccountId","shippedAt");--> statement-breakpoint
CREATE INDEX "amazon_shipment_request_period" ON "amazon_shipment_requests" USING btree ("orgId","externalAccountId","requestedAt");