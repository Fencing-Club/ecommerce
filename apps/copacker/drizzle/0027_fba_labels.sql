ALTER TABLE "product_defaults" ADD COLUMN "suffocationWarning" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Carton labels keep Amazon's label number (an AWD SSCC or an FBA box ID), its warehouse and its Amazon shipment.
UPDATE "shipments" SET "labels" = (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'cartonId', label->'cartonId',
    'labelNumber', label->'sscc',
    'destinationCode', label->'destinationCode',
    'amazonShipmentId', coalesce(to_jsonb("shipments"."amazonShipmentId"), '""'::jsonb)
  )), '[]'::jsonb)
  FROM jsonb_array_elements("shipments"."labels") AS label
) WHERE jsonb_array_length("labels") > 0 AND "labels"->0 ? 'sscc';
