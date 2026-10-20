CREATE TABLE "amazon_report_quotas" (
	"scope" text NOT NULL,
	"reportType" text NOT NULL,
	"nextRequestAt" timestamp with time zone DEFAULT now() NOT NULL,
	"intervalMs" integer DEFAULT 120000 NOT NULL,
	"throttleCount" integer DEFAULT 0 NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "amazon_report_quotas_scope_reportType_pk" PRIMARY KEY("scope","reportType")
);
