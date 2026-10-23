import { sql, type SQL } from "drizzle-orm"

// Explicit non-order fee types from eBay's Finances API. Never infer a cost from an ID or free-text memo.
// AD_FEE (sale-based advertising), final-value/processing fees and tax withholding are deliberately absent.
const accountFees = [
  "INSERTION_FEE",
  "INTERNATIONAL_LISTING_FEE",
  "BOLD_FEE",
  "BUY_IT_NOW_FEE",
  "CATEGORY_FEATURED_FEE",
  "FEATURED_GALLERY_FEE",
  "GALLERY_FEE",
  "GALLERY_PLUS_FEE",
  "IPIXPHOTO_FEE",
  "LARGE_PICTURE_FEE",
  "PRIVATE_LISTING_FEE",
  "PRO_PACK_BUNDLE_FEE",
  "PRO_PACK_PLUS_BUNDLE_FEE",
  "RESERVE_PRICE_FEE",
  "SUBTITLE_FEE",
  "VALUE_PACK_BUNDLE_FEE",
  "VEHICLE_LOCAL_INSERTION_FEE",
  "VEHICLES_BASIC_PACKAGE_FEE",
  "VEHICLES_PLUS_PACKAGE_FEE",
  "VEHICLES_PREMIUM_PACKAGE_FEE",
  "EBAY_MOTORS_PRO_FEE",
  "EBAY_STORE_SUBSCRIPTION_FEE",
  "MARKETPLACE_RESEARCH_PRO_SUBSCRIPTION_FEE",
  "STORE_SUBSCRIPTION_EARLY_TERMINATION_FEE",
  "VEHICLE_LOCAL_SUBSCRIPTION_FEE",
  "VEHICLE_SUBSCRIPTION_FEE",
  "PREMIUM_AD_FEES",
  "FINANCE_FEE",
  "NSFCHECK_FEE"
]

// Shared by the profit query and the evidence API, so every saved record has the same accounting decision.
export function ebayProfitTreatment(data: SQL) {
  return sql<string>`case
    when ${data}->>'transactionType' in ('SALE', 'REFUND') then 'order_transaction_not_added'
    when ${data}->>'transactionType' in ('TRANSFER', 'PAYOUT') then 'transfer_not_profit'
    when coalesce(${data}->>'bookingEntry', '') not in ('CREDIT', 'DEBIT') then 'requires_review'
    when coalesce(${data}->>'transactionStatus', '') not in
      ('', 'PAYOUT', 'FUNDS_AVAILABLE_FOR_PAYOUT', 'FUNDS_ON_HOLD', 'FUNDS_PROCESSING') then 'requires_review'
    when ${data}->>'transactionType' = 'SHIPPING_LABEL' then 'additional_charge'
    when ${data}->>'transactionType' = 'NON_SALE_CHARGE'
      and ${data}->>'feeType' in (${sql.join(
        accountFees.map((fee) => sql`${fee}`),
        sql`, `
      )})
      and nullif(trim(${data}->>'orderId'), '') is null
      and jsonb_array_length(coalesce(${data}->'orderLineItems', '[]'::jsonb)) = 0
      and not exists (select 1 from jsonb_array_elements(coalesce(${data}->'references', '[]'::jsonb)) reference
        where coalesce(reference->>'referenceType', '') <> 'ITEM_ID')
      then 'additional_charge'
    else 'requires_review' end`
}
