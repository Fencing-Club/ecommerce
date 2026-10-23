import { sql, type SQLWrapper } from "drizzle-orm"
import { sharedReleaseOriginal } from "./amazon-shared-release"

// Accrual-style totals retain the original posting date, excluding its later released copy.
// Amazon may provide the link on either copy; never join across sellers or workspaces.
export function countedAmazonTransaction(row: SQLWrapper) {
  return sql`not coalesce(${row}.data->'relatedIdentifiers', '[]'::jsonb)
      @> '[{"relatedIdentifierName": "DEFERRED_TRANSACTION_ID"}]'
    and not exists (
      select 1 from amazon_transactions original
      where original."orgId" = ${row}."orgId"
        and original."externalAccountId" = ${row}."externalAccountId"
        and original."transactionId" <> ${row}."transactionId"
        and original.data->'relatedIdentifiers' @> jsonb_build_array(jsonb_build_object(
          'relatedIdentifierName', 'RELEASE_TRANSACTION_ID', 'relatedIdentifierValue', ${row}."transactionId"))
        and original.data->>'transactionStatus' = 'DEFERRED_RELEASED'
        and ${row}.data->>'transactionStatus' = 'RELEASED'
        and original.type = ${row}.type and original.currency = ${row}.currency
        and original."totalMinor" = ${row}."totalMinor"
        and (original."orderId" is null or ${row}."orderId" is null or original."orderId" = ${row}."orderId")
        and original.data->'marketplaceDetails'->>'marketplaceId'
          is not distinct from ${row}.data->'marketplaceDetails'->>'marketplaceId'
    ) and ${sharedReleaseOriginal(row)} is null`
}
