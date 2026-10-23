CREATE TABLE "channel_listings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"connectionId" uuid NOT NULL,
	"accountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"sellerSku" text NOT NULL,
	"productType" text NOT NULL,
	"asin" text,
	"fulfillmentMode" text NOT NULL,
	"amountMinor" integer,
	"currency" text,
	"quantity" integer,
	"revision" integer DEFAULT 1 NOT NULL,
	"linkRevision" integer DEFAULT 0 NOT NULL,
	"variantId" text,
	"piecesPerListing" integer,
	"inventoryOwner" text DEFAULT 'external' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"observedAt" timestamp with time zone NOT NULL,
	"generation" uuid NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_listings" ADD CONSTRAINT "channel_listings_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "channel_listing_identity" ON "channel_listings" USING btree ("orgId","connectionId","accountId","marketplaceId","sellerSku");