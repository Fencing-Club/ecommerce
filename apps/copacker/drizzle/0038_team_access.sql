ALTER TABLE "memberships" ADD COLUMN "access" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "team_invitations" ADD COLUMN "access" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Members could change everything but the team, the settings and the partners. They keep that, page by page, and so do
-- the colleagues already invited.
UPDATE "memberships" SET "access" = CASE "organizations"."kind"
  WHEN 'buyer' THEN '{"overview":"view","sales":"view","products":"edit","restock":"view","orders":"edit","shipments":"edit","partners":"view"}'::jsonb
  WHEN 'supplier' THEN '{"overview":"view","orders":"edit","shipments":"edit","customers":"edit","products":"edit","inventory":"edit","catalogs":"edit"}'::jsonb
  ELSE '{"orders":"edit"}'::jsonb
END FROM "organizations" WHERE "organizations"."id" = "memberships"."orgId" AND "memberships"."role" = 'member';--> statement-breakpoint
UPDATE "team_invitations" SET "access" = CASE "organizations"."kind"
  WHEN 'buyer' THEN '{"overview":"view","sales":"view","products":"edit","restock":"view","orders":"edit","shipments":"edit","partners":"view"}'::jsonb
  WHEN 'supplier' THEN '{"overview":"view","orders":"edit","shipments":"edit","customers":"edit","products":"edit","inventory":"edit","catalogs":"edit"}'::jsonb
  ELSE '{"orders":"edit"}'::jsonb
END FROM "organizations" WHERE "organizations"."id" = "team_invitations"."orgId";
