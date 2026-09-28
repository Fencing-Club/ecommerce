ALTER TABLE "events" ALTER COLUMN "message" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "messageKey" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "messageValues" jsonb;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "locale" text;--> statement-breakpoint
UPDATE "events" SET "message" = regexp_replace(regexp_replace(regexp_replace(regexp_replace("message", '^POs\y', 'Purchase orders'), '^PO\y(?!-)', 'Purchase order'), '\yPOs\y', 'purchase orders', 'g'), '\yPO\y(?!-)', 'purchase order', 'g') WHERE "kind" = 'event';--> statement-breakpoint
UPDATE "events" SET "messageKey" = "known"."key" FROM (VALUES
  ('Purchase order submitted to supplier', 'submittedToSupplier'),
  ('Purchase order sent; share its documents with the supplier', 'sent'),
  ('Purchase order closed', 'closed'),
  ('Shipment received', 'shipmentReceived'),
  ('Supplier shipped the goods', 'supplierShipped'),
  ('Supplier reported shipment collected', 'supplierReportedCollected'),
  ('Amazon shipment cancelled', 'amazonShipmentCancelled'),
  ('Shipping labels released to supplier', 'labelsReleased'),
  ('Supplier cleared the ready date', 'readyDateCleared'),
  ('Supplier proposed changes', 'changesProposed'),
  ('Supplier withdrew its changes', 'changesWithdrawn'),
  ('Supplier''s changes declined', 'changesDeclined'),
  ('Packing submitted; ready to ship', 'packingReady'),
  ('Invoice entered with changes to the purchase order', 'invoiceEntered'),
  ('Supplier submitted invoice changes for approval', 'invoiceChangesSubmitted')
) AS "known"("message", "key") WHERE "events"."kind" = 'event' AND "events"."message" = "known"."message";--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'readyDateSet', "messageValues" = jsonb_build_object('date', substring("message" from '(\d{4}-\d{2}-\d{2})$')) WHERE "kind" = 'event' AND "message" ~ '^Supplier set the ready date to \d{4}-\d{2}-\d{2}$';--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'changesProposedWithNote', "messageValues" = jsonb_build_object('note', substring("message" from length('Supplier proposed changes: ') + 1)) WHERE "kind" = 'event' AND starts_with("message", 'Supplier proposed changes: ');--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'changesDeclinedWithReason', "messageValues" = jsonb_build_object('reason', substring("message" from length('Supplier''s changes declined: ') + 1)) WHERE "kind" = 'event' AND starts_with("message", 'Supplier''s changes declined: ');--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'correctionRequested', "messageValues" = jsonb_build_object('reason', substring("message" from length('Correction requested: ') + 1)) WHERE "kind" = 'event' AND starts_with("message", 'Correction requested: ');--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'supplierChangesApproved', "messageValues" = jsonb_build_object('revision', substring("message" from 'revision (\d+) published$')::integer) WHERE "kind" = 'event' AND "message" ~ '^Supplier''s changes approved; purchase order revision \d+ published$';--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'invoiceChangesApproved', "messageValues" = jsonb_build_object('revision', substring("message" from 'revision (\d+) published$')::integer) WHERE "kind" = 'event' AND "message" ~ '^Invoice changes approved; purchase order revision \d+ published$';--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'packingQueued', "messageValues" = jsonb_build_object('network', substring("message" from '^Packing submitted; Amazon (.+) creation queued$')) WHERE "kind" = 'event' AND "message" ~ '^Packing submitted; Amazon .+ creation queued$';--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'packingSplit', "messageValues" = jsonb_build_object('networks', to_jsonb(string_to_array(substring("message" from '^Packing submitted; split into (.+) shipments and queued for Amazon$'), ' and '))) WHERE "kind" = 'event' AND "message" ~ '^Packing submitted; split into .+ shipments and queued for Amazon$';--> statement-breakpoint
UPDATE "events" SET "messageKey" = 'forwarderShipped', "messageValues" = jsonb_build_object('forwarder', (regexp_match("message", '^(.+) shipped the goods: (.*)$'))[1], 'tracking', (regexp_match("message", '^(.+) shipped the goods: (.*)$'))[2]) WHERE "kind" = 'event' AND "messageKey" IS NULL AND "message" ~ '^.+ shipped the goods: ';--> statement-breakpoint
UPDATE "events" SET "message" = NULL WHERE "messageKey" IS NOT NULL;--> statement-breakpoint
UPDATE "order_revisions" SET "reason" = CASE "reason"
  WHEN 'PO created' THEN 'created'
  WHEN 'Purchase order created' THEN 'created'
  WHEN 'PO edited' THEN 'edited'
  WHEN 'Purchase order edited' THEN 'edited'
  WHEN 'Approved supplier changes' THEN 'approvedSupplierChanges'
  WHEN 'Approved supplier commercial changes' THEN 'approvedCommercialChanges'
  ELSE "reason"
END;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_message" CHECK ("events"."messageKey" IS NOT NULL OR "events"."message" IS NOT NULL);
