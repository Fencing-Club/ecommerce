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
ALTER TABLE "contacts" ADD COLUMN "forwarderId" uuid;--> statement-breakpoint
ALTER TABLE "forwarders" ADD CONSTRAINT "forwarders_buyerOrgId_organizations_id_fk" FOREIGN KEY ("buyerOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forwarders" ADD CONSTRAINT "forwarders_forwarderOrgId_organizations_id_fk" FOREIGN KEY ("forwarderOrgId") REFERENCES "public"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "forwarder_buyer_name" ON "forwarders" USING btree ("buyerOrgId","name");--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_forwarderId_forwarders_id_fk" FOREIGN KEY ("forwarderId") REFERENCES "public"."forwarders"("id") ON DELETE no action ON UPDATE no action;
