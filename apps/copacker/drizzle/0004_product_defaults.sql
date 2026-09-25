CREATE TABLE "product_defaults" (
	"orgId" uuid NOT NULL,
	"shopifyDomain" text NOT NULL,
	"productId" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"prepCategory" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_defaults_orgId_shopifyDomain_productId_pk" PRIMARY KEY("orgId","shopifyDomain","productId")
);
--> statement-breakpoint
ALTER TABLE "product_defaults" ADD CONSTRAINT "product_defaults_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;