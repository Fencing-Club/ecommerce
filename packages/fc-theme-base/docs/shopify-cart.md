# Shopify Cart

The cart flyout (`snippets/cart-drawer.liquid`) and the cart page (`sections/main-cart-items.liquid`) are built from
the same snippets and follow the Cart flyout and Cart page lanes in `FencingClubWebsite.pen`. The flyout is a 520px
drawer on tablet and desktop and fills the screen on phones. On phones both views move the total and checkout into a
fixed checkout bar, and tapping Total opens the order breakdown. All cart styles live in `cart-experience.css`; the
Dawn cart stylesheets are gone.

## Parts

- `cart-lines` and `cart-line-item`: product rows with price, savings badge, kit contents (`item_components`),
  quantity stepper, edit and remove. A row's message line shows stock limits and failed changes for that row only.
- `cart-reward-progress`: free shipping and gift tier progress above the lines. `cart-free-shipping` prints the
  minimum that the progress, the Shipping row and the empty message share; `cart-gift-tiers` prints the gift tiers.
- `cart-gifts`: a gift choice panel for each reached tier without a choice, and the gift removed notice.
  `cart-gift-options` draws one tier's gift radios; `cart-gift-lines` draws chosen gifts as free lines after the
  products, with Change gift.
- `cart-summary`: discount code and order note (`cart-extras`), summary rows (`cart-breakdown`), total, savings,
  checkout (`cart-checkout`) and the reassurance row. `cart-checkout-bar` is the phone version.
- `cart-message`: the empty cart and the load failed message. `cart-popular` shows collections chosen in the theme's
  cart settings under the empty message. `cart-skeleton` draws the loading state.
- `sections/cart-suggestions.liquid`: "Complete your order", rendered through Shopify's complementary product
  recommendations for the newest line. It shows nothing when there are none or the request fails.

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
- Removing a line leaves a row with Undo until the next cart change. Undo adds the same variant, quantity, properties
  and selling plan back.
- The order note saves only with Save note. The editor stays open until the note is saved or the shopper closes it,
  which puts back the saved note. An unsaved note blocks checkout. There is no saved indicator. A saved note shows
  as a card with an edit button.
- Discount codes keep the other applied codes. A code Shopify does not accept is named in the message and stays in
  the field. Applied codes show as removable chips; codes with no amount in the cart, such as shipping codes, show on
  the Shipping row, which then reads Free. Automatic discounts show without a remove button.
- A failed refresh shows the load failed message, never an empty cart. Try again is the retry; the message does not
  repeat what is already visible.
- The flyout refreshes when it opens after a failure or after the shopper returns with the back button.

## Rewards

- The reward progress shows free shipping and the gift tiers on one track, each marker at its share of the highest
  amount. The message names the next reward and the note names the last one reached.
- Progress counts the cart total after discounts, as the Reward progress states in the Pen say. Amounts are in the
  store currency and aren't converted, so a cart in another currency shows no rewards.

### Free shipping

- The Free shipping minimum theme setting (Cart, Rewards) turns on the free shipping marker, the Free reading on the
  Shipping row and the free shipping sentence in the empty message. Leaving it blank turns all three off.
- The theme only shows free shipping. Shopify gives it at checkout through an automatic discount the merchant
  creates in Shopify admin, under Discounts:
  - Type: Free shipping. Method: Automatic.
  - Minimum purchase requirement: a minimum purchase amount equal to the theme setting.
  - Countries: the countries that ship free.
  - Combinations: product discounts and order discounts, so a code like WELCOME10 keeps free shipping.
  - Nothing links the discount to the theme setting. Change both together.

### Free gifts

- Gifts aren't products. Each gift is a Cart gift metaobject entry, so it never shows in the catalog, search or
  collections, and has no inventory.
- The First gift minimum and Second gift minimum theme settings (Cart, Rewards) set the tiers. The second only counts
  when it's above the first. Leaving both blank turns gifts off.
- A tier offers every gift whose minimum total is at or below the tier. When the cart reaches a tier, a panel above
  the lines offers that tier's gifts. A pick saves right away as a cart attribute named for the tier, such as
  `Free gift at $600`, with the gift's name and details as the value. The gift then shows as a free line after the
  products, with Change gift.
- When the cart drops under a chosen tier, the theme clears that tier's attribute and says the gift came out. It also
  clears a choice that no longer matches an available gift, such as after a gift is renamed or switched off, so the
  shopper chooses again.
- The order shows the choice under Additional details, for example `Free gift at $600: Club socks, One size`. Whoever
  packs the order adds the gift.
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
   | `details`       | Single line text        | A size, color or similar, shown under the name.                     |
   | `value`         | Money                   | Shown struck through beside Free.                                   |
   | `minimum_total` | Decimal                 | The lowest cart total, in the store currency, that offers the gift. |
   | `available`     | True or false           | False shows the gift as Unavailable. Blank counts as available.     |

   Turn on Storefronts access, since the theme reads the entries in Liquid (`shop.metaobjects.cart_gift`).
2. Content, Metaobjects, Cart gift: add one entry per gift.
3. Online Store, Themes, Customize, Theme settings, Cart: set the First gift minimum and, for a second tier, the
   Second gift minimum. A gift's minimum total decides the lowest tier that offers it, so set each gift's minimum to
   one of the tier amounts.

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
store: adding from a product page, quantity changes, removal and undo, a real discount code, note saving, checkout,
and the back button from checkout. Gifts can only be checked live once the store has the Cart gift definition and
entries from the admin setup above.
