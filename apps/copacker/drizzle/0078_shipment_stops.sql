CREATE TABLE "shipment_stops" (
	"shipmentId" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" text NOT NULL,
	"forwarderId" uuid,
	"addressId" uuid,
	"leg" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shipment_stops_shipmentId_position_pk" PRIMARY KEY("shipmentId","position"),
	CONSTRAINT "shipment_stops_position" CHECK ("shipment_stops"."position" >= 0),
	CONSTRAINT "shipment_stops_forwarder_address" CHECK (("shipment_stops"."kind" = 'forwarder') = ("shipment_stops"."forwarderId" is not null) and ("shipment_stops"."forwarderId" is null) = ("shipment_stops"."addressId" is null))
);
--> statement-breakpoint
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_shipmentId_shipments_id_fk" FOREIGN KEY ("shipmentId") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_forwarderId_forwarders_id_fk" FOREIGN KEY ("forwarderId") REFERENCES "public"."forwarders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_stops" ADD CONSTRAINT "shipment_stops_addressId_contacts_id_fk" FOREIGN KEY ("addressId") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "shipment_stops_address" ON "shipment_stops" USING btree ("addressId");--> statement-breakpoint
CREATE INDEX "shipment_stops_forwarder" ON "shipment_stops" USING btree ("forwarderId");--> statement-breakpoint
-- Each shipment's saved transport becomes its route: from the supplier by way of its PO's forwarder and AGL, when it
-- went by them, to where its goods end up. The supplier ships to the forwarder. The last leg follows the transport: the
-- stop before it delivers when it dropped the cartons off; with a carrier label on each carton, the buyer arranges a
-- warehouse shipment and the sender an Amazon one; and without, the sender arranges a warehouse shipment. An Amazon
-- shipment without labels that it didn't drop off has no leg that says so, so the buyer chooses its last leg again. A
-- forwarder address that's no longer kept isn't a stop.
WITH saved AS (
	SELECT
		s."id",
		s."transport",
		coalesce(s."snapshot", o."data") AS data
	FROM "shipments" s
	JOIN "orders" o ON o."id" = s."orderId"
	WHERE s."transport" IS NOT NULL
), routed AS (
	SELECT
		saved."id",
		saved."transport",
		CASE WHEN EXISTS (
			SELECT 1 FROM "contacts" c JOIN "forwarders" f ON f."id" = (saved.data->'via'->>'forwarderId')::uuid
			WHERE c."id" = (saved.data->'via'->>'addressId')::uuid
		) THEN saved.data->'via' END AS via,
		coalesce(saved.data->'items'->0->>'receiver', 'warehouse') = 'warehouse' AS warehouse
	FROM saved
), legs AS (
	SELECT
		routed.*,
		CASE
			WHEN "transport"->>'collection' = 'dropoff' THEN 'senderMoves'
			WHEN "transport"->>'carrierLabels' = 'per_carton' THEN
				CASE WHEN warehouse THEN 'receiverArranges' ELSE 'senderArranges' END
			WHEN warehouse THEN 'senderArranges'
		END AS last_leg,
		"transport"->>'service' = 'agl' AS agl
	FROM routed
), stops AS (
	SELECT "id", 0 AS place, 'supplier' AS kind, NULL::uuid AS forwarder, NULL::uuid AS address,
		CASE WHEN via IS NOT NULL THEN 'senderArranges' WHEN agl THEN NULL ELSE last_leg END AS leg
	FROM legs
	UNION ALL
	SELECT "id", 1, 'forwarder', (via->>'forwarderId')::uuid, (via->>'addressId')::uuid,
		CASE WHEN agl THEN NULL ELSE last_leg END
	FROM legs WHERE via IS NOT NULL
	UNION ALL
	SELECT "id", CASE WHEN via IS NOT NULL THEN 2 ELSE 1 END, 'agl', NULL, NULL, NULL
	FROM legs WHERE agl
	UNION ALL
	SELECT "id", 1 + (via IS NOT NULL)::int + agl::int, 'receiver', NULL, NULL, NULL
	FROM legs
)
INSERT INTO "shipment_stops" ("shipmentId", "position", "kind", "forwarderId", "addressId", "leg")
SELECT "id", place, kind, forwarder, address, leg FROM stops;
--> statement-breakpoint
ALTER TABLE "shipments" DROP COLUMN "transport";