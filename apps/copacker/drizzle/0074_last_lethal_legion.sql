CREATE TABLE "connection_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"connectionId" uuid NOT NULL,
	"accountId" text NOT NULL,
	"requestedDatasets" jsonb NOT NULL,
	"jobIds" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "connection_sync_runs" ADD CONSTRAINT "connection_sync_runs_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;