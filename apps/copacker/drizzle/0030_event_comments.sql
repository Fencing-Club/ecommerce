ALTER TABLE "events" ADD COLUMN "kind" text DEFAULT 'event' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "author" text;