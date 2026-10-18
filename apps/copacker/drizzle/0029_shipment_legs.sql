ALTER TABLE "shipments" ADD COLUMN "forwarderCarrier" text;--> statement-breakpoint
ALTER TABLE "shipments" ADD COLUMN "forwarderReference" text;--> statement-breakpoint
-- "Collected" is now "shipped": the supplier handed the goods over.
UPDATE "shipments" SET "status" = 'shipped' WHERE "status" = 'collected';
