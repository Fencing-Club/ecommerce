ALTER TABLE "provider_write_locks" DROP CONSTRAINT "provider_write_locks_executionId_provider_writes_id_fk";
--> statement-breakpoint
ALTER TABLE "provider_write_locks" ADD CONSTRAINT "provider_write_locks_executionId_provider_writes_id_fk" FOREIGN KEY ("executionId") REFERENCES "public"."provider_writes"("id") ON DELETE cascade ON UPDATE no action;