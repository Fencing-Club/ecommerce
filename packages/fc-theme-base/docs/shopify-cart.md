# Shopify Cart

The cart flyout (`snippets/cart-drawer.liquid`) and the cart page (`sections/main-cart-items.liquid`) are built from
the same snippets and follow the Cart flyout and Cart page lanes in `FencingClubWebsite.pen`. The flyout is a 520px
drawer on tablet and desktop and fills the screen on phones. Its "Your cart" title links to the cart page. The order summary is the footer at every width: it
sticks to the bottom of the flyout and, on phones, of the cart page. All cart styles live in `cart-experience.css`; the
Dawn cart stylesheets are gone.

## Parts

- `cart-lines` and `cart-line-item`: product rows with price, kit contents (`item_components`), quantity stepper
  and remove. A row's message line shows stock limits and failed changes for that row only.
- `cart-reward-progress`: free shipping and gift tier progress above the lines. `cart-free-shipping` prints the
  minimum the progress uses; `cart-gift-tiers` prints the gift tiers.
- `cart-gifts`: a gift choice panel for each reached tier without a choice.
  `cart-gift-options` draws one tier's gift radios; `cart-gift-lines` draws chosen gifts as free lines after the
  products, with Change gift.
- `cart-summary`: discount code and order note buttons (`cart-extras`), summary rows (`cart-breakdown`), the total
  with the checkout note under it on the left and the savings on the right, checkout (`cart-checkout`) and the trust
  notes (returns and secure checkout, from the theme's cart settings). The items subtotal shows only when it differs from the total, and the Shipping row only when shipping is free.
  The checkout note says shipping and taxes are calculated at checkout, or only taxes once shipping is free.
- `cart-message`: the empty cart and the load failed message. `cart-popular` shows collections chosen in the theme's
  cart settings under the empty message. `cart-skeleton` draws the loading state.

## Behavior

- Each view marks the parts that change with `data-cart-region`. After a cart request the view renders its section
  again and swaps only those regions, so an open editor, an unsaved note, open kit contents and scroll position stay.
- Every cart request goes through one queue (`CartItems.mutate`). Checkout waits while a request or the quantity
  debounce is pending, and the total shows a placeholder until it is current.
- Checkout says why it is unavailable right under the button: an unsaved note (info tone) or unavailable items
  (error tone). When Shopify sends the shopper back from a checkout that did not open, the button says so and stays
  usable.
- Quantity changes use `/cart/change.js` with the line key. A refused quantity above the stock becomes a stock limit
  message; other failures say the change failed and put the quantity back.
- Rows never jump. Whenever a render adds or removes a row, product or gift line, the shared row motion
  (`RowMotion`, see shopify-interaction-states.md) opens or closes it: an added product, a gift reached or lost, a
  removal. `CartItems.lineRows` tells it how to find and match cart rows.
- After a removal the live region says what was removed, and focus moves to the row that took its place, the row
  above, or the cart. There is no undo.
- A quantity change waits 300ms for more clicks before it is sent. The row's price shows its placeholder from the
  first click (`data-pending`), not just once the request goes, and the stepper stays usable.
- Remove stays usable while a row saves; only the price shows a placeholder. It sends a quantity change still waiting
  on the debounce first.
- The order note saves only with Save note. The editor stays open until the note is saved or the shopper closes it,
  which puts back the saved note. An unsaved note blocks checkout. There is no saved indicator. A saved note shows
  as a card with an edit button.
- Discount codes keep the other applied codes. A code Shopify does not accept is named in the message and stays in
  the field. Applied codes show as removable chips on the Discount row, right under the code field in the footer;
  codes with no amount in the cart, such as shipping codes, show on the Shipping row, which reads Free. Automatic
  discounts show without a remove button.
- A failed refresh shows the load failed message, never an empty cart. Try again is the retry; the message does not
  repeat what is already visible.
- The flyout refreshes when it opens after a failure or after the shopper returns with the back button.

## Rewards

- The reward progress shows free shipping and the gift tiers on one track, each marker at its share of the highest
  amount. The message names the next reward and the note names the last one reached. The fill moves to its new width
  after each cart change.
- Progress counts the cart total after discounts, as the Reward progress states in the Pen say. Amounts are in the
  store currency and aren't converted, so a cart in another currency shows no rewards.

### Free shipping

- The Free US shipping minimum theme setting (Cart, Rewards) turns on the free shipping marker and the Shipping row
  that reads Free once the cart reaches it. Leaving it blank turns both off.
- Free shipping is US only, and the copy says so ("free US shipping"). Shoppers whose country isn't the US see no
  free shipping marker or row, only the gifts. No item is excluded.
- The announcement bar's free shipping announcement, the collection hero's free shipping trust line and quick view
  read the same minimum through `cart-free-shipping`, so they show only to shoppers the cart gives free shipping.
- Reward amounts only appear where the theme reads them from the settings and gift entries: the progress and the gift
  panels. Fixed copy, such as the empty message, never names an amount.
- The theme only shows free shipping. Shopify gives it at checkout through an automatic discount the merchant
  creates in Shopify admin, under Discounts:
  - Type: Free shipping. Method: Automatic.
  - Minimum purchase requirement: a minimum purchase amount equal to the theme setting.
  - Countries: United States only.
  - Combinations: product discounts and order discounts, so a code like WELCOME10 keeps free shipping.
  - Nothing links the discount to the theme setting. Change both together.

### Free gifts

- Gifts aren't products. Each gift is a Cart gift metaobject entry, so it never shows in the catalog, search or
  collections, and has no inventory.
- Each gift's minimum total is its tier, and gifts with the same minimum share a tier. A tier needs at least one
  available gift, so switching off every gift at an amount removes that tier. With no entries, gifts are off.
- A tier with one gift needs no choice: when the cart reaches it, the gift shows as a free line after the products
  and the theme saves it as a cart attribute named for the tier, such as `Free gift at $175`, with the gift's name as
  the value.
- A tier with two or more gifts shows a panel above the lines with that tier's gifts, unavailable ones included. A
  pick saves right away as the tier's cart attribute, and the gift then shows as a free line with Change gift.
- When the cart drops under a chosen tier, the theme clears that tier's attribute without a notice; the reward
  progress shows how far the cart is from it again. It also clears a choice that no longer matches an available gift,
  such as after a gift is renamed or switched off, so the shopper chooses again.
- The order shows the gift under Additional details, for example `Free gift at $175: Harut point protectors`.
  Whoever packs the order adds the gift.
- Nothing at checkout enforces a gift. A shopper can check out without choosing one, and the gift doesn't show in
  Shopify's checkout summary. The theme clears a choice only when a cart view renders, so check the order total
  before packing a gift.

#### Admin setup

The merchant sets this up in Shopify admin; the theme creates nothing on the store.

1. Settings, Custom data, Metaobject definitions: add a definition named Cart gift with the type `cart_gift` and
   these fields:

   | Key             | Type                    | Use                                                                 |
   | --------------- | ----------------------- | ------------------------------------------------------------------- |
   | `name`          | Single line text        | The gift's name. Make it required.                                  |
   | `image`         | File, images only       | The photo in the choices and on the gift line.                      |
   | `description`   | Single line text        | A short line on what the gift is, such as what's in a set.          |
   | `value`         | Money                   | Shown struck through beside Free.                                   |
   | `minimum_total` | Decimal                 | The cart total, in the store currency, that earns it. Required.     |
   | `available`     | True or false           | False shows the gift as Unavailable. Blank counts as available.     |

   Turn on Storefronts access, since the theme reads the entries in Liquid (`shop.metaobjects.cart_gift`).
2. Content, Metaobjects, Cart gift: add one entry per gift. Give gifts that should be a choice the same minimum
   total.

## Boundaries

- Shipping prices and taxes are confirmed at checkout. The cart never invents a shipping price.
- There is no weapon builder contract, so a custom weapon's line properties show as plain detail lines rather than
  a build sheet.

## Component lab

`/lab/cart` in the component lab (`pnpm --filter @repo/fc-theme-base lab`) renders every cart state with the
production section, snippets and controllers in frames at tablet, phone and desktop widths. Each frame opens on its
own at `/lab/cart/frame?view=flyout|page&state=<id>`. States are listed in `tests/component-library/cart-states.mjs`;
`cart-states.js` applies the ones that only exist in the browser. Reads come from the fixture and every cart change
fails, so a click on a cart control in the lab shows that control's failure state.

## Verification

Run the theme Vitest suite, then `pnpm verify`. Check each state in the lab, then the live flows on the development
store: adding from a product page, quantity changes, removal, a real discount code, note saving, checkout,
and the back button from checkout. Gifts can only be checked live once the store has the Cart gift definition and
entries from the admin setup above.
