CREATE TABLE "cli_authorizations" (
	"hash" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"redirectUri" text NOT NULL,
	"challenge" text NOT NULL,
	"state" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"approvedAt" timestamp with time zone,
	"codeHash" text,
	"consumedAt" timestamp with time zone,
	CONSTRAINT "cli_authorizations_codeHash_unique" UNIQUE("codeHash")
);
--> statement-breakpoint
CREATE TABLE "cli_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"revokedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cli_tokens" (
	"hash" text PRIMARY KEY NOT NULL,
	"grantId" uuid NOT NULL,
	"kind" text NOT NULL,
	"expiresAt" timestamp with time zone NOT NULL,
	"consumedAt" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operation_receipts" (
	"userId" text NOT NULL,
	"orgId" uuid NOT NULL,
	"operation" text NOT NULL,
	"key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "operation_receipts_userId_orgId_operation_key_pk" PRIMARY KEY("userId","orgId","operation","key")
);
--> statement-breakpoint
ALTER TABLE "amazon_ads_connections" ADD COLUMN "id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "amazon_ads_connections" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "settingsRevision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cli_tokens" ADD CONSTRAINT "cli_tokens_grantId_cli_grants_id_fk" FOREIGN KEY ("grantId") REFERENCES "public"."cli_grants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_receipts" ADD CONSTRAINT "operation_receipts_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cli_grants_user" ON "cli_grants" USING btree ("userId");--> statement-breakpoint
CREATE INDEX "cli_tokens_grant" ON "cli_tokens" USING btree ("grantId");--> statement-breakpoint
ALTER TABLE "amazon_ads_connections" ADD CONSTRAINT "amazon_ads_connections_id_unique" UNIQUE("id");