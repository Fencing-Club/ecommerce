ALTER TABLE "supplier_products" ALTER COLUMN "sellablePacksPerCase" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "supplier_products" ALTER COLUMN "sellablePacksPerCase" DROP NOT NULL;