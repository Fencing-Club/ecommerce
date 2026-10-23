import { sql, type SQLWrapper } from "drizzle-orm"

function identifiers(row: SQLWrapper) {
  return sql`case when jsonb_typeof(${row}.data->'relatedIdentifiers')='array'
    then ${row}.data->'relatedIdentifiers' else '[]'::jsonb end`
}

// This database-wide proof is shared by counting and reconciliation. A page of candidates cannot prove uniqueness.
export function sharedReleaseOriginal(row: SQLWrapper) {
  const rowIdentifiers = identifiers(row),
    originalIdentifiers = identifiers(sql.identifier("original"))
  return sql<string | null>`(select original."transactionId"
    from jsonb_array_elements(${rowIdentifiers}) ref
    join amazon_transactions original on original."orgId"=${row}."orgId"
      and original."externalAccountId"=${row}."externalAccountId"
      and original.data->'relatedIdentifiers' @> jsonb_build_array(ref)
    where ${row}.data->>'transactionStatus'='RELEASED'
      and ref->>'relatedIdentifierName'=case ${row}.type when 'Shipment' then 'SHIPMENT_ID' when 'Refund' then 'REFUND_ID' end
      and nullif(trim(ref->>'relatedIdentifierValue'), '') is not null
      and (select count(*) from jsonb_array_elements(${rowIdentifiers}) r
        where r->>'relatedIdentifierName' in ('SHIPMENT_ID','REFUND_ID'))=1
      and (select count(*) from jsonb_array_elements(${originalIdentifiers}) r
        where r->>'relatedIdentifierName' in ('SHIPMENT_ID','REFUND_ID'))=1
      and original.data->>'transactionStatus'='DEFERRED_RELEASED'
      and original."transactionId"<>${row}."transactionId"
      and original.type=${row}.type and original.currency=${row}.currency
      and original."totalMinor"=${row}."totalMinor" and original."feesMinor"=${row}."feesMinor"
      and original.data->'totalAmount'=${row}.data->'totalAmount'
      and jsonb_typeof(${row}.data->'totalAmount')='object'
      and nullif(${row}."orderId", '') is not null and original."orderId"=${row}."orderId"
      and original."postedAt"<=${row}."postedAt"
      and nullif(${row}.data->'marketplaceDetails'->>'marketplaceId','') is not null
      and original.data->'marketplaceDetails'->>'marketplaceId'=${row}.data->'marketplaceDetails'->>'marketplaceId'
      and jsonb_typeof(${row}.data->'items')='array' and ${row}.data->'items'<>'[]'::jsonb
      and original.data->'items'=${row}.data->'items'
      and not exists (select 1 from jsonb_array_elements(
        (${originalIdentifiers}) || (${rowIdentifiers})) link
        where link->>'relatedIdentifierName' in ('DEFERRED_TRANSACTION_ID','RELEASE_TRANSACTION_ID'))
      and (select count(*) from amazon_transactions collision
        where collision."orgId"=${row}."orgId" and collision."externalAccountId"=${row}."externalAccountId"
          and collision.data->'relatedIdentifiers' @> jsonb_build_array(ref))=2
      and not exists (select 1 from amazon_transactions incoming
        where incoming."orgId"=${row}."orgId" and incoming."externalAccountId"=${row}."externalAccountId"
          and (incoming.data->'relatedIdentifiers' @> jsonb_build_array(jsonb_build_object('relatedIdentifierName','RELEASE_TRANSACTION_ID','relatedIdentifierValue',original."transactionId"))
            or incoming.data->'relatedIdentifiers' @> jsonb_build_array(jsonb_build_object('relatedIdentifierName','DEFERRED_TRANSACTION_ID','relatedIdentifierValue',original."transactionId"))
            or incoming.data->'relatedIdentifiers' @> jsonb_build_array(jsonb_build_object('relatedIdentifierName','RELEASE_TRANSACTION_ID','relatedIdentifierValue',${row}."transactionId"))
            or incoming.data->'relatedIdentifiers' @> jsonb_build_array(jsonb_build_object('relatedIdentifierName','DEFERRED_TRANSACTION_ID','relatedIdentifierValue',${row}."transactionId"))))
  )`
}

export type SharedReleasePair = { originalId: string; releasedId: string }
