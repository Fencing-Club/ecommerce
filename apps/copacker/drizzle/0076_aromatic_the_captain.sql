CREATE TABLE "provider_write_locks" (
	"key" text PRIMARY KEY NOT NULL,
	"executionId" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_writes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"orgId" uuid NOT NULL,
	"userId" text NOT NULL,
	"grantId" uuid NOT NULL,
	"operation" text NOT NULL,
	"variantId" text NOT NULL,
	"intent" jsonb NOT NULL,
	"targets" jsonb NOT NULL,
	"status" text NOT NULL,
	"jobId" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"startedAt" timestamp with time zone,
	"completedAt" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "provider_write_locks" ADD CONSTRAINT "provider_write_locks_executionId_provider_writes_id_fk" FOREIGN KEY ("executionId") REFERENCES "public"."provider_writes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_writes" ADD CONSTRAINT "provider_writes_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;