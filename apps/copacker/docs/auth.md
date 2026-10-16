# Sign-in and getting started

Copacker draws its own sign-in pages and talks to WorkOS directly (the User Management API), rather than sending people
to AuthKit's hosted page. Every way in ends in AuthKit's session cookie, which the public WorkOS session toolkit
refreshes and clears through `src/server/auth-session.ts`. The code is in `src/server/sign-in.ts`, `src/server/onboarding.ts` and
`src/server/invitations.ts`; the pages are the `(auth)` route group, `app/onboarding` and `app/workspaces/new`.

The sign-in operations receive an explicit request with headers, cookie access and a session writer; they no longer
use TanStack Start's request boundary. `server/auth-session.ts` supplies the same password, verification,
organization-selection, reset and OAuth logic to the app and the protected compatibility fixture.
Only the pending email address is returned to the verification page; its authentication token and redirect stay in the
encrypted cookie. Start takes the client address from Cloudflare's `CF-Connecting-IP`, not a supplied forwarding chain.
The five password/verification/recovery screens share `AuthScreen` and `loadAuthPage` with the protected
Start fixture. Successful authentication opens a fresh document to discard the old
session's route and API caches, including when WorkOS returns an external SSO URL. Recovery confirmation stays on the
page. The Start routes preserve `/api/action` for the six auth operations, validate server input and enforce CSRF before
executing an operation. Start serves the main application in this branch. See the
[compatibility evidence](specs/platform-migration/compatibility.md) for deployed checks and remaining provider flows.

## Ways in

- **Email and password.** Sign-up creates the WorkOS user, then signs in. WorkOS requires a confirmed email, so the
  first sign-in answers `email_verification_required` and emails a six-digit code; the pending sign-in waits in an
  encrypted, ten-minute cookie (`copacker-verify`) while `/verify-email` asks for the code. The same happens when an
  unconfirmed account signs in.
- **Google and Microsoft.** `/login/google` and `/login/microsoft` start an OAuth round trip with PKCE; the state and
  verifier wait in an encrypted cookie (`copacker-oauth`) until WorkOS returns to `/callback`.
- **Single sign-on.** An email whose company requires SSO is sent to its connection instead of signing in with a
  password.
- **Password reset.** `/forgot-password` creates a WorkOS password reset and emails Copacker's own link,
  `/reset-password?token=…`, through Resend. It answers the same whether or not the email has an account. The page saves
  the new password and signs straight in.

A person belongs to one WorkOS organization per workspace, so WorkOS asks which one a session is for
(`organization_selection_required`). Copacker picks its workspaces itself: the session takes the workspace this
browser had open, or else the first. `next` survives every step, and only ever points at a Copacker page
(`returnPath`).

Workspace lookup and permissions are independent of the web framework: `src/server/workspace-session.ts` resolves the
person's current database memberships, and `src/server/authorization.ts` checks role, page and price grants. The active
workspace cookie can choose only an existing membership. Missing, stale or foreign selections fall back to the oldest
authorized workspace (ID breaks creation-time ties); no memberships sends the person to onboarding. The workspace
switcher receives only ID, name and kind. Full workspace settings stay on the server and page loaders return explicit
rendering data. Start loaders and server functions call these authorization helpers for every request; browser caches
never authorize an operation. See [migration evidence](specs/platform-migration/compatibility.md).

## WorkOS settings

The [domain and provider inventory](domains.md) is the cross-environment checklist for redirects, sign-out destinations,
Google/Microsoft upstream callbacks, browser API restrictions, and adding or replacing authentication providers.
Local Portless launchers supply the exact worktree `APP_URL` and callback; never share a parent-domain session cookie.

Local development, staging and production share the WorkOS staging environment. In its dashboard:

- **Redirects** (Applications → the application → Redirects): `/callback` on every address the app answers on (`APP_URL`
  and each of `APP_ALIAS_URLS`), each of those addresses as a sign-out redirect, `<APP_URL>/login` as the Initiate login
  URI, and the **Password reset URL** `https://copacker.ai/reset-password`, so WorkOS's own reset email opens Copacker's
  page too. Sign-in returns to the address it started on, so `staging.copacker.ai` keeps its own session. The **User
  invitation URL** is `https://copacker.ai/signup`, so WorkOS's invitations, such as approving a waitlist entry, open
  Copacker's sign-up with `invitation_token`; WorkOS's default, its hosted page, would pass them on to the Initiate
  login URI.
- **Waitlist** (Authentication → Features): on. It holds the landing page's waitlist ([Landing page](landing-page.md)).
  WorkOS says it disables the sign-ups it hosts while it's on; whether that stops a first sign-in with Google or
  Microsoft isn't documented. Copacker's own password sign-up creates users with the API key, which the waitlist doesn't
  gate, so `/signup` stays open to anyone with the link.
- **Password reset email** (Emails → Configuration): off, so only Copacker's goes out, from the verified `copacker.ai`
  in production. Local and staging send from `resend.dev`, so their resets reach only the Resend account's owner.
- **Authentication:** email and password, and Google and Microsoft OAuth. The shared WorkOS staging environment uses
  Copacker's own Google OAuth client from the `copacker` Google Cloud project. Microsoft still uses demo credentials.
  Google branding is configured with Copacker's name, cube logo, home page, privacy policy and terms; the Google app
  remains in Testing pending publication and brand verification. Google can display the WorkOS callback domain until
  branding is verified. A separate production WorkOS environment needs its own provider configuration.
- **Email verification:** required, which is what makes new accounts confirm their email with a code.

WorkOS sends the verification code emails itself. Copacker's own emails (password resets, invitations, purchase orders)
go through Resend, from `src/server/email.ts`.

## Getting started

Address search uses Google's Places Autocomplete Data API (New). Set `VITE_GOOGLE_MAPS_API_KEY` before building
the app, with website restrictions for each deployment origin and API restrictions for Maps JavaScript API and
Places API (New), and enable both APIs in the Google Cloud project. The combobox displays Google Maps attribution;
each search session keeps its token until a result is selected. Selecting a result fills the street, city,
region, postal code and country, clears any previous unit, and leaves all fields editable. Manual entry remains
available without a key or if Google is unavailable. Address text typed into the search field is sent to Google.
Phone numbers are formatted when leaving the field using `libphonenumber-js`; address country supplies the default
for national numbers, while an explicit international calling code takes precedence. Unrecognized input stays editable.

State/province options use a bundled snapshot of [Google libaddressinput address metadata](https://github.com/google/libaddressinput),
licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The snapshot is adapted to region keys,
local and Latin names, and language only. Refresh it with `pnpm --filter copacker exec tsx scripts/update-address-regions.ts`
and format the generated JSON. Countries without a region list retain manual entry. Changing country clears the
region; existing and Google-filled names remain visible even when absent from the list. Address email starts with
the signed-in email when no address email was supplied, and remains editable.

`/onboarding` asks only what's missing, one step at a time beside a preview of the workspace taking shape, and saves
everything in one request at the end:

| Arrived by                                   | Steps                                                              |
| -------------------------------------------- | ------------------------------------------------------------------ |
| Signing up                                   | About you, what the company does, company, first address           |
| A buyer's supplier or forwarder invitation   | About you, company (from the buyer's details), address             |
| A colleague's invitation                     | About you, then joining the workspace                              |
| Joining a workspace without a full profile   | About you (the portal sends people here until their profile is set) |

The address step is a delivery address for a buyer, a pickup address for a supplier (Amazon needs its phone number)
and a warehouse address for a forwarder; it can be skipped. Finishing opens the new workspace at its home: the
Overview for a buyer, Purchase orders otherwise.

**New workspace** in the workspace menu runs the same steps from what the company does onwards, for someone who runs
another company or works as both a buyer and a supplier.

## Invitations

An invitation link is `/invite?token=…&kind=…`, where `kind` is `invite` (a supplier), `forwarder` or `team`. The page
names the workspace that sent it before anyone signs in, then signs up or signs in with the invited email. Someone
signed in with another email is asked to sign out, and comes back to the invitation: WorkOS only returns to the sign-out
redirects in its dashboard, so `/logout` keeps the page in a ten-minute cookie (`copacker-resume`) and the proxy opens it
when WorkOS returns to `/`. A supplier or forwarder who already runs a workspace of that kind, as its owner or an admin, can link
it instead of making a new one. Accepting always needs the invited, confirmed email.

The owner and admins invite colleagues in **Settings → Team** (`src/server/team.ts`), as admins or as members with
the pages chosen for them ([Roles and page access](permissions.md)). Invitations last seven days. Sending one again
replaces the link and drops the old email if it hasn't gone out yet; cancelling does the same. The owner and admins
change anyone's access and remove people, but not the owner or themselves. The owner can hand the workspace to a
colleague, and stays on as an admin.

## Deleting an account

**Settings → Delete** deletes someone's account: the WorkOS user first (`userManagement.deleteUser`), so nothing else
changes if WorkOS refuses, then their memberships, OAuth states and profile, and then AuthKit's cookie and the open
workspace's, which signs them out. Someone who owns a workspace others use transfers ownership first. The owner can
also delete the workspace, which deletes its WorkOS organization once its records are gone. See
[Roles and page access](permissions.md#deleting).

## Testing sign-up locally

Test inboxes can't receive codes. WorkOS records each code it sends: list the environment's
`email_verification.created` events, then `getEmailVerification(id)` returns the code (and `password_reset.created`
with `getPasswordReset(id)`, the reset token). Use `example.net` addresses: staging's test SSO organization claims
`example.com`, which answers every password sign-in with `sso_required`.
