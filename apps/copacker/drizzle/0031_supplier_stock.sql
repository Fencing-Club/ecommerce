ALTER TABLE "shipments" ADD COLUMN "stockTaken" jsonb;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "trackInventory" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "onHand" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier_products" ADD COLUMN "continueSelling" boolean DEFAULT false NOT NULL;