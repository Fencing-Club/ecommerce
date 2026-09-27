-- A supplier with only an Amazon lead time keeps it as its one lead time.
UPDATE "suppliers" SET "leadTimeDays" = "amazonLeadTimeDays" WHERE "leadTimeDays" IS NULL AND "amazonLeadTimeDays" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "suppliers" DROP COLUMN "amazonLeadTimeDays";