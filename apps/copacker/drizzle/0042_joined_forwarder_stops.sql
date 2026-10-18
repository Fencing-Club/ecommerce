-- Joining used to leave a forwarder's POs stopping at the addresses its buyer had saved for it, which the Amazon job and
-- the PO checks stop accepting once the forwarder keeps its own. Each saved address a PO stops at becomes the
-- forwarder's own, unless it already has a copy with the same name and address (as joining made when it kept none), and
-- the POs, their revisions and their shipments move to that copy.
INSERT INTO "contacts" ("orgId", "name", "kind", "address")
SELECT "forwarders"."forwarderOrgId", "saved"."name", 'delivery', "saved"."address"
FROM "contacts" AS "saved"
JOIN "forwarders" ON "forwarders"."id" = "saved"."forwarderId" AND "forwarders"."buyerOrgId" = "saved"."orgId"
WHERE "forwarders"."forwarderOrgId" IS NOT NULL
  AND EXISTS (
    SELECT FROM "orders"
    WHERE "orders"."data"->'via'->>'forwarderId' = "forwarders"."id"::text
      AND "orders"."data"->'via'->>'addressId' = "saved"."id"::text
  )
  AND NOT EXISTS (
    SELECT FROM "contacts" AS "own"
    WHERE "own"."orgId" = "forwarders"."forwarderOrgId" AND "own"."kind" = 'delivery'
      AND "own"."name" = "saved"."name" AND "own"."address" = "saved"."address"
  );--> statement-breakpoint
WITH "moves" AS (
  SELECT DISTINCT ON ("saved"."id")
    "saved"."id"::text AS "savedId", "forwarders"."id"::text AS "forwarderId", "own"."id"::text AS "copyId"
  FROM "contacts" AS "saved"
  JOIN "forwarders" ON "forwarders"."id" = "saved"."forwarderId" AND "forwarders"."buyerOrgId" = "saved"."orgId"
  JOIN "contacts" AS "own" ON "own"."orgId" = "forwarders"."forwarderOrgId" AND "own"."kind" = 'delivery'
    AND "own"."name" = "saved"."name" AND "own"."address" = "saved"."address"
  ORDER BY "saved"."id", "own"."created_at", "own"."id"
), "moved_orders" AS (
  UPDATE "orders" SET "data" = jsonb_set("data", '{via,addressId}', to_jsonb("moves"."copyId"))
  FROM "moves"
  WHERE "data"->'via'->>'forwarderId' = "moves"."forwarderId" AND "data"->'via'->>'addressId' = "moves"."savedId"
), "moved_revisions" AS (
  UPDATE "order_revisions" SET "data" = jsonb_set("data", '{via,addressId}', to_jsonb("moves"."copyId"))
  FROM "moves"
  WHERE "data"->'via'->>'forwarderId' = "moves"."forwarderId" AND "data"->'via'->>'addressId' = "moves"."savedId"
)
UPDATE "shipments" SET "snapshot" = jsonb_set("snapshot", '{via,addressId}', to_jsonb("moves"."copyId"))
FROM "moves"
WHERE "snapshot"->'via'->>'forwarderId' = "moves"."forwarderId" AND "snapshot"->'via'->>'addressId' = "moves"."savedId";
