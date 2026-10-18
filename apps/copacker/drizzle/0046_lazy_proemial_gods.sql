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
ALTER TABLE "amazon_reimbursement_reports" ADD CONSTRAINT "amazon_reimbursement_reports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "amazon_reimbursements" ADD CONSTRAINT "amazon_reimbursements_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_period" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","marketplaceId","approvedAt");--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_reference" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","reimbursementId");--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_original" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","originalReimbursementId");--> statement-breakpoint
CREATE INDEX "amazon_reimbursements_order" ON "amazon_reimbursements" USING btree ("orgId","externalAccountId","orderId");