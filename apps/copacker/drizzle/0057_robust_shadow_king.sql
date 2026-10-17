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
ALTER TABLE "analytics_cost_imports" ADD CONSTRAINT "analytics_cost_imports_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_evidence" ADD CONSTRAINT "analytics_evidence_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_feeds" ADD CONSTRAINT "analytics_feeds_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operating_costs" ADD CONSTRAINT "operating_costs_orgId_organizations_id_fk" FOREIGN KEY ("orgId") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "operating_cost_scope" ON "operating_costs" USING btree ("orgId","sourceReference","sourceLine");