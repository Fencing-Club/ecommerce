# Design changes

Where the React ports and the hand-authored designs disagree, and which side gives way. Most of the time the port owed
the design, and the ports below now copy what their design spells out, wording included. What the designs themselves still
owe is the collapsed state of anything that can disappear, and a few decisions nobody has made yet.

## Ports brought back in line with their design

`payment-reminder` wrote one sentence for all three payment states. The design branches on the schedule and writes
three, each opening "This is a reminder that your payment of {amount} for order {name}" and closing with "is due
today", "is due on {date}", or "was due on {date}". The amount carries its currency code, because a business buyer's
schedule can be denominated in a currency the shop does not otherwise use. The port now writes the designed sentences
verbatim.

`store-credit-issued` said "You now have $110.00 in store credit" in every case. The design branches on
`company_location` and writes "This has been automatically added to {company} — {location}'s account. The store credit
balance is now {amount}." for a business buyer and "This has been automatically added to your account. Your store credit
balance is now {amount}." otherwise, both with the currency code. The port now writes both.

`contact-buyer` drew "Hi Alex, {{ custom_message }}", which reads as an empty greeting when the merchant sends nothing
and as a doubled greeting when the merchant writes their own. The design treats the message as a replacement for the
whole paragraph and falls back to a standard note greeting `customer.first_name | default: 'there'`. The port now does
the same.

`customer-account-welcome` drew the Visit our store button unconditionally. The design guards it on `shop.url`, because
a shop with no published online store has no URL to send anyone to. The port now guards it.

`local-missed-delivery` pointed its single button at a hard-coded contact page. The design points the same button at
`order_status_url`, falling back to `shop.url`. The port now follows it.

`buy-online` and `pos-send-cart` write Free where a line costs nothing. The other eleven designs that list goods print
`$0.00`. `ItemRow` now takes a `free` flag and only those two set it.

The four shipping designs and `local-out-for-delivery` print `presentment_title` with `title` as the fallback, which is
what a translated storefront depends on. The other designs print `title` alone. `ItemRow` exports a `presentedTitle`
helper and only those five call it.

## What the designs still owe

### The collapsed state of anything that can disappear

Three of the changes above make an element conditional: the store button on `customer-account-welcome`, and the two
branch sentences on `payment-reminder` and `store-credit-issued`. Every design draws only the present state. The
collapsed version is what a share of buyers will actually get, and on `customer-account-welcome` it changes the spacing
between the lead and the quick links below it, so it needs drawing rather than inferring.

### Two inconsistencies worth a decision

Twelve designs write Free for a nil line price and twelve print `$0.00`. Six read `presentment_title` and eighteen do
not. Five strike a compare-at price on `original > final` and eighteen on `original != final`, which differ only after
an edit that raised a price, where the majority spelling draws a strikethrough that reads as a discount. Each split
looks accidental rather than intended. Settling them one way would let `ItemRow` drop the flags it now carries.

### Bundles and per-measure prices, which are not built

A bundled line belongs to a group, which Shopify labels `For: {name}` when the group ships on its own and
`Part of: {name}` when it does not. A line in a shop that prices by weight or volume carries a unit price that has to be
shown beside the line price. Neither is drawn in any design and neither is built, because both add furniture to the item
card that nothing covers. The drops are typed and the `unit_price_with_measurement` filter is available, so both are a
design away. The design needs a line item drawn in all four states: plain, grouped, per-measure, and both at once.

### The delivery estimate on a delivered shipment

`shipment-delivered` shows an estimated delivery date. The port omits it: the date the carrier promised is spent once
the parcel has arrived, and repeating it invites a comparison the buyer cannot act on. This is the one place the port
deliberately disagrees with its design, and one of the two should give way.

## Decisions still open

### Branding

Every component hard-codes Fencing Club: the logo URL, the wordmark, the accent colour in `tokens.ts`, and the footer
navigation. Shopify’s stock templates hard-code the same things, so this is not a gap against them. It is a gap against
the library ever serving a second store, and it is cheaper to answer before more templates depend on it.

### A delivery estimate where none is shown

`fulfillment.estimated_delivery_at` appears in the shipping, out-for-delivery, shipping-update, and local
out-for-delivery emails. Whether an estimate belongs anywhere it is absent today, such as the order confirmation, is a
design question the stock templates never asked.

## What is deliberately not changing

Places where the stock template is wrong and the port is right. None of them should be copied back into a port.

- Stock `customer-marketing-confirmation` guards the subscribe button on `shop.url`, though the button links to
  `customer.subscribe_url`. A store with no URL would lose the button that confirms the subscription. The port renders
  it unguarded.
- Stock `gift-card-notification` resolves `recipient_name` through a nickname, name, and email chain, then never
  renders it. The port omits it.
- Stock `buy-online` renders only the first of a line’s `discount_allocations`, so a line carrying two promotions shows
  one. `ItemRow` loops the whole collection.
- Stock `order-cancelled`, `order-edited`, and `refund-notification` test `line.quantity < line.quantity`, which is
  always false. The ports compare the current or refunded quantity against the ordered one, which is what the test
  meant.
