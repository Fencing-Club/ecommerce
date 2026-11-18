# Shopify Cart

The cart flyout (`snippets/cart-drawer.liquid`) and the cart page (`sections/main-cart-items.liquid`) are built from
the same snippets and follow the Cart flyout and Cart page lanes in `FencingClubWebsite.pen`. The flyout is a 520px
drawer on tablet and desktop and fills the screen on phones. On phones both views move the total and checkout into a
fixed checkout bar, and tapping Total opens the order breakdown. All cart styles live in `cart-experience.css`; the
Dawn cart stylesheets are gone.

## Parts

- `cart-lines` and `cart-line-item`: product rows with price, savings badge, kit contents (`item_components`),
  quantity stepper, edit and remove. A row's message line shows stock limits and failed changes for that row only.
- `cart-reward-progress`: free shipping progress above the lines. `cart-free-shipping` prints the minimum that the
  progress, the Shipping row and the empty message share.
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
- The order note saves only with Save note. The editor stays open until the note is saved or cleared, and an unsaved
  note blocks checkout. There is no saved indicator. A saved note shows as a card with an edit button.
- Discount codes keep the other applied codes. A code Shopify does not accept is named in the message and stays in
  the field. Applied codes show as removable chips; codes with no amount in the cart, such as shipping codes, show on
  the Shipping row, which then reads Free. Automatic discounts show without a remove button.
- A failed refresh shows the load failed message, never an empty cart. Try again is the retry; the message does not
  repeat what is already visible.
- The flyout refreshes when it opens after a failure or after the shopper returns with the back button.

## Rewards

- Free shipping is the only reward built so far. The Free shipping minimum theme setting (Cart, Rewards) turns on
  the reward progress above the lines, the Free reading on the Shipping row and the free shipping sentence in the
  empty message. Leaving it blank turns all three off.
- Progress counts the cart total after discounts, as the Reward progress states in the Pen say. The amount is in the
  store currency and isn't converted, so a cart in another currency shows no free shipping.
- The theme only shows free shipping. Shopify gives it at checkout through an automatic discount the merchant
  creates in Shopify admin, under Discounts:
  - Type: Free shipping. Method: Automatic.
  - Minimum purchase requirement: a minimum purchase amount equal to the theme setting.
  - Countries: the countries that ship free.
  - Combinations: product discounts and order discounts, so a code like WELCOME10 keeps free shipping.
  - Nothing links the discount to the theme setting. Change both together.
- Gift tiers aren't built. They wait on how gifts are stored, since the gifts aren't sold as products.

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
and the back button from checkout.
