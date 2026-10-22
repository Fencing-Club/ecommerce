ALTER TABLE "documents" ALTER COLUMN "outdated" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "outdated" SET DATA TYPE boolean USING "outdated" <> 0;--> statement-breakpoint
ALTER TABLE "documents" ALTER COLUMN "outdated" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "supplier_products" ALTER COLUMN "active" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "supplier_products" ALTER COLUMN "active" SET DATA TYPE boolean USING "active" <> 0;--> statement-breakpoint
ALTER TABLE "supplier_products" ALTER COLUMN "active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "sales_syncs" DROP COLUMN "dataVersion";
