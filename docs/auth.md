# Sign-in and getting started

Copacker draws its own sign-in pages and talks to WorkOS directly (the User Management API), rather than sending people
to AuthKit's hosted page. Every way in ends in AuthKit's session cookie, so `withAuth`, the proxy's refreshes and
sign-out work as before. The code is in `src/server/sign-in.ts`, `src/server/onboarding.ts` and
`src/server/invitations.ts`; the pages are the `(auth)` route group, `app/onboarding` and `app/workspaces/new`.

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

## WorkOS settings

Local and production share the WorkOS staging environment. In its dashboard:

- **Redirects** (Applications → the application → Redirects): `/callback` on every address the app answers on
  (`APP_URL` and each of `APP_ALIAS_URLS`), each of those addresses as a sign-out redirect, and the **Password reset
  URL** `https://copacker.ai/reset-password`, so WorkOS's own reset email opens Copacker's page too. Sign-in returns
  to the address it started on, so `staging.copacker.ai` keeps its own session.
- **Password reset email** (Emails → Configuration): production now sends from the verified `copacker.ai`, so WorkOS's
  own can be turned off and only Copacker's goes out. Until then both are sent. Local and staging still send from
  `resend.dev`, so without WorkOS's email, their resets reach only the Resend account's owner.
- **Authentication:** email and password, and Google and Microsoft OAuth. Staging uses WorkOS's demo OAuth
  credentials; a production WorkOS environment needs Copacker's own Google and Microsoft apps.
- **Email verification:** required, which is what makes new accounts confirm their email with a code.

WorkOS sends the verification code emails itself. Copacker's own emails (password resets, invitations, purchase orders)
go through Resend, from `src/server/email.ts`.

## Getting started

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
