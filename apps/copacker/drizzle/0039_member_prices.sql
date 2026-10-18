-- Members saw prices and costs before they could be hidden. They keep seeing them, and so do colleagues already invited.
UPDATE "memberships" SET "access" = "access" || '{"prices":"view"}'::jsonb WHERE "role" = 'member';--> statement-breakpoint
UPDATE "team_invitations" SET "access" = "access" || '{"prices":"view"}'::jsonb WHERE "role" = 'member';
