# Shopify Account Menu

`snippets/account-menu.liquid`, `assets/account-menu.js`, and `assets/component-account-menu.css` render the header's
account menu. It replaces Shopify's `<shopify-account>` component, which always shows a Sign in with Shop button that the
theme can't hide. The design lives in the Account menu area of `packages/fc-theme/FencingClubWebsite.pen`.

## Content

- Signed out: "Your account", one line on why to sign in, and a Sign in button to Shopify's sign-in page
  (`routes.account_login_url`). That page offers the email code and any social sign-in connected in admin, such as
  Google. Themes have no documented way to start Google sign-in themselves, so the menu has no Google button.
- Signed in: an initial avatar, the shopper's name and email (the email alone when there's no name), then Orders
  (`routes.account_url`), Profile (`routes.account_profile_url`) and Sign out (`routes.account_logout_url`).
- The header renders it only when `shop.customer_accounts_enabled` is true.

## Behavior

- The account icon is a real link to the sign-in or account page. A plain click opens the menu; a modified click, or
  a browser without `showModal`, follows the link.
- Wider screens show a popover 8px under the account icon, its end edge lined up with the cart icon. Phones (under
  750px) show a bottom sheet over a scrim.
- The popover fades in from 6px above; the sheet slides up as the scrim fades in. Both take the 220ms flyout timing and
  run in reverse to close. Reduced motion skips it, a hidden tab never holds it up, and a click while closing reopens
  it.
- Focus starts on Close and returns to the account icon. Close, Escape and a tap outside close it; a drag that ends
  outside does not. Page scroll is locked while it's open.

## Verification

`tests/account-menu.test.js` covers both states' markup and the controller. The component lab's Account menu section
renders both states from the production snippet. Check the popover and the sheet in the browser at desktop and phone
widths.
