ALTER TABLE "product_defaults" ADD COLUMN "casePacks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "product_defaults" ADD COLUMN "minimumOrder" integer;