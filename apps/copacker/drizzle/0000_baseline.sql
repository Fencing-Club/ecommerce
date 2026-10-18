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
CREATE TABLE "amazon_inventory_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"eventDay" date NOT NULL,
	"sku" text,
	"fnsku" text,
	"asin" text,
	"eventType" text NOT NULL,
	"referenceId" text,
	"quantity" integer NOT NULL,
	"fulfillmentCenterId" text,
	"disposition" text,
	"reason" text,
	"country" text,
	"reconciledQuantity" integer,
	"unreconciledQuantity" integer,
	"dateAndTime" text,
	"store" text,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_movement_reports" (
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
	CONSTRAINT "amazon_movement_reports_identity" PRIMARY KEY("orgId","externalAccountId","marketplaceId","from")
);
--> statement-breakpoint
CREATE TABLE "amazon_product_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"sku" text NOT NULL,
	"asin" text,
	"fnsku" text,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"validFrom" timestamp with time zone NOT NULL,
	"validTo" timestamp with time zone NOT NULL,
	"evidence" text NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid,
	CONSTRAINT "amazon_product_mapping_period" CHECK ("amazon_product_mappings"."validFrom" < "amazon_product_mappings"."validTo")
);
--> statement-breakpoint
CREATE TABLE "amazon_reimbursement_reports" (
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
	CONSTRAINT "amazon_reimbursement_reports_identity" PRIMARY KEY("orgId","externalAccountId","marketplaceId","from")
);
--> statement-breakpoint
CREATE TABLE "amazon_reimbursements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"approvedAt" timestamp with time zone NOT NULL,
	"reimbursementId" text NOT NULL,
	"caseId" text,
	"orderId" text,
	"reason" text,
	"sku" text,
	"fnsku" text,
	"asin" text,
	"condition" text,
	"currency" text,
	"amountPerUnit" numeric,
	"amountTotal" numeric,
	"quantityCash" integer,
	"quantityInventory" integer,
	"quantityTotal" integer,
	"originalReimbursementId" text,
	"originalReimbursementType" text,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "amazon_removal_reports" (
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
	CONSTRAINT "amazon_removal_reports_identity" PRIMARY KEY("orgId","externalAccountId","marketplaceId","kind","from")
);
--> statement-breakpoint
CREATE TABLE "amazon_removals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"externalAccountId" text NOT NULL,
	"marketplaceId" text NOT NULL,
	"kind" text NOT NULL,
	"requestedAt" timestamp with time zone NOT NULL,
	"orderId" text NOT NULL,
	"orderType" text,
	"orderSource" text,
	"serviceSpeed" text,
	"status" text,
	"updatedAt" timestamp with time zone,
	"shippedAt" timestamp with time zone,
	"sku" text,
	"fnsku" text,
	"disposition" text,
	"requestedQuantity" integer,
	"cancelledQuantity" integer,
	"disposedQuantity" integer,
	"shippedQuantity" integer,
	"inProcessQuantity" integer,
	"removalFee" numeric,
	"currency" text,
	"carrier" text,
	"trackingNumber" text,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "analytics_cost_imports" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"createdBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"request" jsonb NOT NULL,
	"results" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_evidence" (
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"dataset" text NOT NULL,
	"sourceId" text NOT NULL,
	"data" jsonb NOT NULL,
	"observedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_evidence_orgId_source_externalAccountId_dataset_sourceId_pk" PRIMARY KEY("orgId","source","externalAccountId","dataset","sourceId")
);
--> statement-breakpoint
CREATE TABLE "analytics_feeds" (
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"dataset" text NOT NULL,
	"state" jsonb NOT NULL,
	"checkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_feeds_orgId_source_externalAccountId_dataset_pk" PRIMARY KEY("orgId","source","externalAccountId","dataset")
);
--> statement-breakpoint
CREATE TABLE "catalog_products" (
	"catalogId" uuid NOT NULL,
	"productId" uuid NOT NULL,
	"priceMinor" integer,
	"priceBreaks" jsonb,
	"quantityRules" jsonb,
	CONSTRAINT "catalog_products_catalogId_productId_pk" PRIMARY KEY("catalogId","productId")
);
--> statement-breakpoint
CREATE TABLE "catalogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"adjustmentBasisPoints" integer DEFAULT 0 NOT NULL,
	"includeNewProducts" boolean DEFAULT true NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"provider" text NOT NULL,
	"externalId" text NOT NULL,
	"encryptedToken" text NOT NULL,
	"scopes" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"address" jsonb NOT NULL,
	"shopifyLocationId" text,
	"forwarderId" uuid,
	"supplierId" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"shipmentId" uuid,
	"kind" text NOT NULL,
	"itemId" uuid,
	"cartonId" text,
	"objectKey" text NOT NULL,
	"name" text NOT NULL,
	"bytes" integer NOT NULL,
	"orderRevision" integer NOT NULL,
	"shipmentRevision" integer,
	"outdated" integer DEFAULT 0 NOT NULL,
	"uploadedBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"actor" text NOT NULL,
	"messageKey" text,
	"messageValues" jsonb,
	"message" text,
	"kind" text DEFAULT 'event' NOT NULL,
	"author" text,
	"authorOrg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "events_message" CHECK ("events"."messageKey" IS NOT NULL OR "events"."message" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"currency" text NOT NULL,
	"day" date NOT NULL,
	"perUsd" numeric(20, 10) NOT NULL,
	CONSTRAINT "exchange_rates_currency_day_pk" PRIMARY KEY("currency","day")
);
--> statement-breakpoint
CREATE TABLE "forwarders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyerOrgId" uuid NOT NULL,
	"forwarderOrgId" uuid,
	"name" text NOT NULL,
	"email" text,
	"invitationHash" text,
	"expiresAt" timestamp with time zone,
	"removedAt" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forwarders_invitationHash_unique" UNIQUE("invitationHash")
);
--> statement-breakpoint
CREATE TABLE "inventory_basis_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"kind" text NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"sourceKey" text NOT NULL,
	"quantity" integer NOT NULL,
	"piecesPerUnit" integer NOT NULL,
	"purchaseId" uuid,
	"location" text,
	"data" jsonb NOT NULL,
	"request" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid,
	CONSTRAINT "inventory_basis_quantity" CHECK ("inventory_basis_records"."quantity" >= 0 and "inventory_basis_records"."piecesPerUnit" > 0),
	CONSTRAINT "inventory_basis_receipt" CHECK (("inventory_basis_records"."kind" = 'receipt') = ("inventory_basis_records"."purchaseId" is not null))
);
--> statement-breakpoint
CREATE TABLE "inventory_import_cursors" (
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"afterOrderId" text,
	"checkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_import_cursors_orgId_source_externalAccountId_pk" PRIMARY KEY("orgId","source","externalAccountId")
);
--> statement-breakpoint
CREATE TABLE "inventory_import_results" (
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"orderId" text NOT NULL,
	"status" text NOT NULL,
	"createdCount" integer NOT NULL,
	"unchangedCount" integer NOT NULL,
	"gaps" jsonb NOT NULL,
	"checkedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventory_import_results_orgId_source_externalAccountId_orderId_pk" PRIMARY KEY("orgId","source","externalAccountId","orderId")
);
--> statement-breakpoint
CREATE TABLE "inventory_landed_charges" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"sourceKey" text NOT NULL,
	"occurredAt" timestamp with time zone NOT NULL,
	"data" jsonb NOT NULL,
	"allocations" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid
);
--> statement-breakpoint
CREATE TABLE "inventory_location_mappings" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"locationId" text NOT NULL,
	"classification" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "inventory_location_mappings_orgId_shopifyDomain_locationId_pk" PRIMARY KEY("orgId","shopifyDomain","locationId")
);
--> statement-breakpoint
CREATE TABLE "inventory_unit_mappings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"sourceProductId" text NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"piecesPerUnit" integer NOT NULL,
	"automatic" boolean NOT NULL,
	"validFrom" timestamp with time zone NOT NULL,
	"validTo" timestamp with time zone NOT NULL,
	"evidence" text NOT NULL,
	"request" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text,
	"supersedes" uuid
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"runAt" timestamp with time zone DEFAULT now() NOT NULL,
	"leaseAt" timestamp with time zone,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "landed_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"kind" text NOT NULL,
	"description" text NOT NULL,
	"amountMinor" integer NOT NULL,
	"createdBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"orgId" uuid NOT NULL,
	"userId" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"access" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "memberships_orgId_userId_pk" PRIMARY KEY("orgId","userId")
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
CREATE TABLE "oauth_states" (
	"hash" text PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"userId" text NOT NULL,
	"provider" text NOT NULL,
	"shop" text,
	"expiresAt" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "operating_costs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"orgId" uuid NOT NULL,
	"sourceReference" text NOT NULL,
	"sourceLine" text NOT NULL,
	"data" jsonb NOT NULL,
	"createdBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retiredAt" timestamp with time zone,
	"retiredBy" text
);
--> statement-breakpoint
CREATE TABLE "order_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"baseRevision" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"data" jsonb NOT NULL,
	"proposedBy" text NOT NULL,
	"decidedBy" text,
	"decidedAt" timestamp with time zone,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"revision" integer NOT NULL,
	"data" jsonb NOT NULL,
	"actor" text NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyerOrgId" uuid NOT NULL,
	"supplierId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"amazonSellerId" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"workosId" text,
	"timeZone" text,
	"excludedShopifyTags" text[] DEFAULT '{"Amazon","eBay"}' NOT NULL,
	"restockSalesDays" integer,
	"restockLeadTimeDays" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_workosId_unique" UNIQUE("workosId")
);
--> statement-breakpoint
CREATE TABLE "po_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"createdBy" text NOT NULL,
	"objectKey" text NOT NULL,
	"filename" text NOT NULL,
	"shopifyDomain" text NOT NULL,
	"amazonSellerId" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"proposal" jsonb,
	"promptVersion" integer,
	"model" text,
	"tokens" integer,
	"error" text,
	"orderId" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "po_imports_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
CREATE TABLE "product_barcodes" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"productId" text NOT NULL,
	"objectKey" text NOT NULL,
	"name" text NOT NULL,
	"bytes" integer NOT NULL,
	"uploadedBy" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_barcodes_orgId_shopifyDomain_variantId_pk" PRIMARY KEY("orgId","shopifyDomain","variantId"),
	CONSTRAINT "product_barcodes_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
CREATE TABLE "product_defaults" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"productId" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prepCategory" text,
	"casePacks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"caseQuantity" integer,
	"minimumOrder" integer,
	"supplierId" uuid,
	"productLabel" text DEFAULT 'standard' NOT NULL,
	"suffocationWarning" boolean DEFAULT false NOT NULL,
	"amazonNetwork" text DEFAULT 'fba' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_defaults_orgId_shopifyDomain_productId_pk" PRIMARY KEY("orgId","shopifyDomain","productId")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"userId" text PRIMARY KEY NOT NULL,
	"firstName" text NOT NULL,
	"lastName" text NOT NULL,
	"position" text DEFAULT '' NOT NULL,
	"company" text DEFAULT '' NOT NULL,
	"locale" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
	"stockCoveredFrom" timestamp with time zone,
	"stockCoveredTo" timestamp with time zone,
	"stockErrorCode" text,
	"customersIncluded" boolean DEFAULT false NOT NULL,
	"feesCoveredFrom" timestamp with time zone,
	"feesCoveredTo" timestamp with time zone,
	"feesErrorCode" text,
	CONSTRAINT "sales_syncs_orgId_source_pk" PRIMARY KEY("orgId","source")
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orderId" uuid NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"orderRevision" integer NOT NULL,
	"status" text DEFAULT 'packing' NOT NULL,
	"packing" jsonb,
	"packing_draft" jsonb,
	"snapshot" jsonb,
	"amazonNetwork" text,
	"linkedAmazonShipmentId" text,
	"amazonOrderId" text,
	"amazonShipmentId" text,
	"operation" text DEFAULT 'none' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"stockTaken" jsonb,
	"bookingReference" text,
	"transport" jsonb,
	"forwarderCarrier" text,
	"forwarderReference" text,
	"issue" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
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
CREATE TABLE "shopify_field_imports" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"importedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shopify_field_imports_orgId_shopifyDomain_pk" PRIMARY KEY("orgId","shopifyDomain")
);
--> statement-breakpoint
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
CREATE TABLE "stock_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"source" text NOT NULL,
	"externalAccountId" text NOT NULL,
	"scopeKey" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'idle' NOT NULL,
	"requestedAt" timestamp with time zone,
	"attemptStartedAt" timestamp with time zone,
	"attemptFinishedAt" timestamp with time zone,
	"workerToken" uuid,
	"snapshotId" uuid,
	"data" jsonb,
	"errorCode" text
);
--> statement-breakpoint
CREATE TABLE "supplier_catalog_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"objectKey" text NOT NULL,
	"filename" text NOT NULL,
	"createdBy" text NOT NULL,
	"rowCount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_catalog_imports_objectKey_unique" UNIQUE("objectKey")
);
--> statement-breakpoint
CREATE TABLE "supplier_product_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"title" text NOT NULL,
	"category" text,
	"productCode" text,
	"url" text,
	"description" text,
	"optionNames" text[] DEFAULT '{}' NOT NULL,
	"images" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"supplierOrgId" uuid NOT NULL,
	"groupId" uuid NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"supplierSku" text NOT NULL,
	"title" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"currency" text NOT NULL,
	"priceMinor" integer,
	"priceBasis" text DEFAULT 'piece' NOT NULL,
	"piecesPerSellablePack" integer DEFAULT 1 NOT NULL,
	"sellablePacksPerCase" integer,
	"notes" text,
	"trackInventory" boolean DEFAULT false NOT NULL,
	"onHand" integer DEFAULT 0 NOT NULL,
	"continueSelling" boolean DEFAULT false NOT NULL,
	"priceBreaks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"quantityRules" jsonb DEFAULT '{"increment":1,"minimum":1,"maximum":null}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "supplier_profiles" (
	"orgId" uuid PRIMARY KEY NOT NULL,
	"website" text,
	"phoneNumber" text,
	"contactName" text,
	"contactEmail" text,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"buyerOrgId" uuid NOT NULL,
	"supplierOrgId" uuid,
	"name" text NOT NULL,
	"email" text,
	"invitationHash" text,
	"expiresAt" timestamp with time zone,
	"removedAt" timestamp with time zone,
	"leadTimeDays" integer,
	"shopifySupplierName" text,
	"website" text,
	"contactName" text,
	"contactEmail" text,
	"phoneNumber" text,
	"catalogId" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suppliers_invitationHash_unique" UNIQUE("invitationHash")
);
--> statement-breakpoint
CREATE TABLE "team_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"access" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hash" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_invitations_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "variant_fields" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"variantId" text NOT NULL,
	"supplierSku" text,
	"asin" text,
	"amazonStockTarget" integer,
	"storeStockTarget" integer,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "variant_fields_orgId_shopifyDomain_variantId_pk" PRIMARY KEY("orgId","shopifyDomain","variantId")
);
--> statement-breakpoint
ALTER TABLE "amazon_ads_connections" ADD CONSTRAINT "amazon_ads_connections_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_ads_days" ADD CONSTRAINT "amazon_ads_days_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_fulfillment_shipments" ADD CONSTRAINT "amazon_fulfillment_shipments_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_inbound_shipments" ADD CONSTRAINT "amazon_inbound_shipments_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_inventory_movements" ADD CONSTRAINT "amazon_inventory_movements_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_movement_reports" ADD CONSTRAINT "amazon_movement_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_product_mappings" ADD CONSTRAINT "amazon_product_mappings_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_reimbursement_reports" ADD CONSTRAINT "amazon_reimbursement_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_reimbursements" ADD CONSTRAINT "amazon_reimbursements_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_removal_reports" ADD CONSTRAINT "amazon_removal_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_removals" ADD CONSTRAINT "amazon_removals_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_return_reports" ADD CONSTRAINT "amazon_return_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_returns" ADD CONSTRAINT "amazon_returns_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_shipment_reports" ADD CONSTRAINT "amazon_shipment_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_shipment_requests" ADD CONSTRAINT "amazon_shipment_requests_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_storage_fee_reports" ADD CONSTRAINT "amazon_storage_fee_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_storage_fees" ADD CONSTRAINT "amazon_storage_fees_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_transactions" ADD CONSTRAINT "amazon_transactions_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_cost_imports" ADD CONSTRAINT "analytics_cost_imports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_evidence" ADD CONSTRAINT "analytics_evidence_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_feeds" ADD CONSTRAINT "analytics_feeds_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_catalogId_catalogs_id_fk" FOREIGN KEY ("catalogId") REFERENCES "public"."catalogs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalog_products" ADD CONSTRAINT "catalog_products_productId_supplier_products_id_fk" FOREIGN KEY ("productId") REFERENCES "public"."supplier_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "catalogs" ADD CONSTRAINT "catalogs_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_forwarderId_forwarders_id_fk" FOREIGN KEY ("forwarderId") REFERENCES "public"."forwarders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_shipmentId_shipments_id_fk" FOREIGN KEY ("shipmentId") REFERENCES "public"."shipments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forwarders" ADD CONSTRAINT "forwarders_buyerOrgId_organizations_id_fk" FOREIGN KEY ("buyerOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forwarders" ADD CONSTRAINT "forwarders_forwarderOrgId_organizations_id_fk" FOREIGN KEY ("forwarderOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_basis_records" ADD CONSTRAINT "inventory_basis_records_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_import_cursors" ADD CONSTRAINT "inventory_import_cursors_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_import_results" ADD CONSTRAINT "inventory_import_results_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_landed_charges" ADD CONSTRAINT "inventory_landed_charges_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_location_mappings" ADD CONSTRAINT "inventory_location_mappings_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_unit_mappings" ADD CONSTRAINT "inventory_unit_mappings_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "landed_costs" ADD CONSTRAINT "landed_costs_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_costs" ADD CONSTRAINT "monthly_costs_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_states" ADD CONSTRAINT "oauth_states_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_costs" ADD CONSTRAINT "operating_costs_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_proposals" ADD CONSTRAINT "order_proposals_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_revisions" ADD CONSTRAINT "order_revisions_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_buyerOrgId_organizations_id_fk" FOREIGN KEY ("buyerOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_imports" ADD CONSTRAINT "po_imports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_imports" ADD CONSTRAINT "po_imports_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_defaults" ADD CONSTRAINT "product_defaults_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_defaults" ADD CONSTRAINT "product_defaults_supplierId_suppliers_id_fk" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_syncs" ADD CONSTRAINT "sales_syncs_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_orderId_orders_id_fk" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_balance_transactions" ADD CONSTRAINT "shopify_balance_transactions_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopify_field_imports" ADD CONSTRAINT "shopify_field_imports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_days" ADD CONSTRAINT "stock_days_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshots" ADD CONSTRAINT "stock_snapshots_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_catalog_imports" ADD CONSTRAINT "supplier_catalog_imports_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_product_groups" ADD CONSTRAINT "supplier_product_groups_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD CONSTRAINT "supplier_products_groupId_supplier_product_groups_id_fk" FOREIGN KEY ("groupId") REFERENCES "public"."supplier_product_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_profiles" ADD CONSTRAINT "supplier_profiles_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_buyerOrgId_organizations_id_fk" FOREIGN KEY ("buyerOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_supplierOrgId_organizations_id_fk" FOREIGN KEY ("supplierOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_catalogId_catalogs_id_fk" FOREIGN KEY ("catalogId") REFERENCES "public"."catalogs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD CONSTRAINT "team_invitations_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "variant_fields" ADD CONSTRAINT "variant_fields_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_fulfillment_shipments_period" ON "amazon_fulfillment_shipments" USING btree ("orgId","externalAccountId","shippedAt");--> statement-breakpoint
CREATE INDEX "amazon_movements_period" ON "amazon_inventory_movements" USING btree ("orgId","externalAccountId","marketplaceId","eventDay");--> statement-breakpoint
CREATE INDEX "amazon_movements_reference" ON "amazon_inventory_movements" USING btree ("orgId","externalAccountId","referenceId");--> statement-breakpoint
CREATE INDEX "amazon_movements_product" ON "amazon_inventory_movements" USING btree ("orgId","externalAccountId","sku","eventDay");--> statement-breakpoint
CREATE INDEX "amazon_product_mapping_scope" ON "amazon_product_mappings" USING btree ("orgId","externalAccountId","marketplaceId","sku","validFrom");--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_period" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","marketplaceId","approvedAt");--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_reference" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","reimbursementId");--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_original" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","originalReimbursementId");--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_order" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","orderId");--> statement-breakpoint
CREATE INDEX "amazon_removals_requests" ON "amazon_removals" USING btree ("orgId","externalAccountId","marketplaceId","kind","requestedAt");--> statement-breakpoint
CREATE INDEX "amazon_removals_shipments" ON "amazon_removals" USING btree ("orgId","externalAccountId","marketplaceId","kind","shippedAt");--> statement-breakpoint
CREATE INDEX "amazon_removals_orders" ON "amazon_removals" USING btree ("orgId","externalAccountId","orderId");--> statement-breakpoint
CREATE INDEX "amazon_returns_period" ON "amazon_returns" USING btree ("orgId","externalAccountId","marketplaceId","returnedAt");--> statement-breakpoint
CREATE INDEX "amazon_returns_order" ON "amazon_returns" USING btree ("orgId","externalAccountId","orderId");--> statement-breakpoint
CREATE INDEX "amazon_shipment_request_period" ON "amazon_shipment_requests" USING btree ("orgId","externalAccountId","requestedAt");--> statement-breakpoint
CREATE INDEX "amazon_storage_fees_period" ON "amazon_storage_fees" USING btree ("orgId","externalAccountId","marketplaceId","kind","periodDay");--> statement-breakpoint
CREATE INDEX "amazon_storage_fees_product" ON "amazon_storage_fees" USING btree ("orgId","externalAccountId","asin","fnsku");--> statement-breakpoint
CREATE INDEX "amazon_transaction_order" ON "amazon_transactions" USING btree ("orgId","orderId");--> statement-breakpoint
CREATE INDEX "amazon_transaction_posted" ON "amazon_transactions" USING btree ("orgId","externalAccountId","postedAt");--> statement-breakpoint
CREATE INDEX "catalog_product_product" ON "catalog_products" USING btree ("productId");--> statement-breakpoint
CREATE UNIQUE INDEX "catalog_supplier_title" ON "catalogs" USING btree ("supplierOrgId","title");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_org_provider" ON "connections" USING btree ("orgId","provider");--> statement-breakpoint
CREATE INDEX "documents_order" ON "documents" USING btree ("orderId");--> statement-breakpoint
CREATE UNIQUE INDEX "forwarder_buyer_name" ON "forwarders" USING btree ("buyerOrgId","name");--> statement-breakpoint
CREATE INDEX "inventory_basis_product" ON "inventory_basis_records" USING btree ("orgId","kind","shopifyDomain","variantId","occurredAt");--> statement-breakpoint
CREATE INDEX "inventory_basis_purchase" ON "inventory_basis_records" USING btree ("orgId","purchaseId");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_basis_active_source" ON "inventory_basis_records" USING btree ("orgId","kind","sourceKey") WHERE "inventory_basis_records"."retiredAt" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_basis_opening" ON "inventory_basis_records" USING btree ("orgId","shopifyDomain","variantId","location") WHERE "inventory_basis_records"."retiredAt" is null and "inventory_basis_records"."kind" = 'opening';--> statement-breakpoint
CREATE INDEX "inventory_import_results_scope" ON "inventory_import_results" USING btree ("orgId","source","externalAccountId","checkedAt");--> statement-breakpoint
CREATE INDEX "inventory_landed_scope" ON "inventory_landed_charges" USING btree ("orgId","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "inventory_landed_source" ON "inventory_landed_charges" USING btree ("orgId","sourceKey") WHERE "inventory_landed_charges"."retiredAt" is null;--> statement-breakpoint
CREATE INDEX "inventory_unit_mapping_scope" ON "inventory_unit_mappings" USING btree ("orgId","source","externalAccountId","sourceProductId");--> statement-breakpoint
CREATE INDEX "jobs_pending" ON "jobs" USING btree ("status","runAt");--> statement-breakpoint
CREATE INDEX "landed_cost_order" ON "landed_costs" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX "monthly_cost_org" ON "monthly_costs" USING btree ("orgId");--> statement-breakpoint
CREATE INDEX "operating_cost_scope" ON "operating_costs" USING btree ("orgId","sourceReference","sourceLine");--> statement-breakpoint
CREATE INDEX "order_proposal_order" ON "order_proposals" USING btree ("orderId");--> statement-breakpoint
CREATE UNIQUE INDEX "order_revision" ON "order_revisions" USING btree ("orderId","revision");--> statement-breakpoint
CREATE INDEX "orders_buyer" ON "orders" USING btree ("buyerOrgId");--> statement-breakpoint
CREATE INDEX "orders_supplier" ON "orders" USING btree ("supplierId");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_order_identity" ON "sales_orders" USING btree ("orgId","source","externalAccountId","orderId");--> statement-breakpoint
CREATE INDEX "sales_order_period" ON "sales_orders" USING btree ("orgId","source","orderedAt");--> statement-breakpoint
CREATE INDEX "shipments_order" ON "shipments" USING btree ("orderId");--> statement-breakpoint
CREATE INDEX "shopify_balance_processed" ON "shopify_balance_transactions" USING btree ("orgId","externalAccountId","processedAt");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_scope" ON "stock_snapshots" USING btree ("orgId","source","externalAccountId","scopeKey");--> statement-breakpoint
CREATE INDEX "supplier_product_group_org" ON "supplier_product_groups" USING btree ("supplierOrgId");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_product_sku" ON "supplier_products" USING btree ("supplierOrgId","supplierSku");--> statement-breakpoint
CREATE INDEX "supplier_product_group" ON "supplier_products" USING btree ("groupId");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_buyer_name" ON "suppliers" USING btree ("buyerOrgId","name");
--> statement-breakpoint
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
