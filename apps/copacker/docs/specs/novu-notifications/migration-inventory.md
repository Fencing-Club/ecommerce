# Existing notification migration inventory

Status: implemented-delivery audit with proposed Novu mapping. The [event catalog](events.md) includes planned
notifications; an existing business action there does not imply an existing email. Audit baseline: current checkout
and packet branch `codex/awd-supplier-handoff` at `788e5f915252db071f4e1ad40e4a4de90e9c9c26` (PR 43), inspected
read-only. Recheck the merged implementation at cutover.

Current HTTP handlers are under `src/app/api`; the packet branch moves them to `src/server/http/api`. The corresponding
`action.ts`, `contact.ts` and `mailing-list.ts` handlers retain the delivery responsibilities below.

## Shared delivery and localization

[emailJob](../../../src/server/job-handlers.ts) recognizes `invite`, `forwarder`, `team`, `po`, `ready` and
`data_request`. All queued messages use [sendEmail](../../../src/server/email.ts): direct Resend HTTP delivery,
`EMAIL_API_KEY`, `EMAIL_FROM`, the supplied key as `Idempotency-Key`, and a 30-second timeout. Non-success throws.
Provider message IDs and final delivery are not persisted by this sender; acceptance is not proof of inbox delivery.

[queue.ts](../../../src/server/queue.ts) leases jobs, heartbeats every 30 seconds and reclaims running jobs after
10 minutes. Ownership is checked before sending. Ordinary email errors become `failed`; they do not automatically
retry with exponential backoff. `PollAgain` is a separate polling mechanism. The current `job.retry` action requires
buyer/admin access and an accessible `payload.orderId`, so it is not a general retry UI for invitation/compliance jobs.
A crash after provider acceptance can replay a job. Verify the provider's actual deduplication window; stable keys are
not an indefinite exactly-once guarantee.

The packet branch adds job wake/execution infrastructure, including `withJobWake` around relevant HTTP writes.
Preserve the merged runtime's dispatch mechanism; merely storing a job must not strand delivery work.

For queued emails, `readerLocale` matches memberships by recipient email and uses a valid saved profile locale.
Known recipients without a saved locale fall back to English. Unknown recipients use a valid queued request locale,
otherwise English. `emails.*` server messages provide copy to `@repo/copacker-emails`, which renders subject, HTML
and plain text. The direct-send paths below have different locale rules.

## Queued workflows to migrate in phase 2

### New purchase order

- **Trigger/source:** `submitOrder` in [orders.ts](../../../src/server/orders.ts), transaction committing PO submission.
- **Recipient:** exactly `suppliers.email`, only when both `supplierOrgId` and email exist. No automatic buyer,
  forwarder or supplier-member fan-out. For an unjoined supplier the buyer downloads/shares documents manually.
- **Channel/template:** queued Resend email, `purchaseOrderEmail`, `emails.purchaseOrder.*`, shared reader locale.
- **Links/attachments:** `/orders/{orderId}` plus one base64 PO PDF from `filedPo(orderId, revision)`. Email details
  come from the same revision as the PDF, not mutable current order data. This is not a shipment packet attachment.
- **Identity:** `po:{orderId}:{revision}`, conflict-suppressed insert in the submission transaction.
- **Novu mapping:** `purchase-order-sent`; preserve recipient eligibility and revision/PDF parity before expanding routing.

### Revised PO after supplier proposal approval

- **Trigger/source:** `approveProposal` in [order-proposals.ts](../../../src/server/order-proposals.ts), buyer approves
  the whole proposal and creates a revision. Proposal submission or decline does not send this email.
- **Recipient/channel:** same joined-supplier/email gate; queued Resend `po` job.
- **Template/localization:** `purchaseOrderEmail`, shared reader locale; revision above one selects revised copy.
- **Links/attachments:** order link and matching revised PO PDF, not the commercial invoice attachment.
- **Identity:** `po:{orderId}:{revision}`, inserted in the approval transaction with conflict suppression.
- **Novu mapping:** `purchase-order-revised`, proposal-approval reason. Avoid a redundant second approval email when
  introducing the planned price/quantity decision notifications.

### Revised PO after commercial invoice changes

- **Trigger/source:** `approveInvoice` in [orders.ts](../../../src/server/orders.ts) when commercial changes produce
  a new PO revision; not every invoice upload or packing save.
- **Recipient/channel/template:** joined supplier with email; queued `po` through Resend and `purchaseOrderEmail`,
  shared reader locale.
- **Links/attachments:** order link and revision-matched PO PDF.
- **Identity:** `po:{orderId}:{revision}` with conflict suppression; the separately queued Shopify job is not an alert.
- **Novu mapping:** `purchase-order-revised`, invoice-approval reason; retain transactional publication.

### Shipment labels sent

- **Trigger/source:** `sendLabelsWhenComplete` in `src/server/label-release.ts`, once a shipment waiting for labels has
  nothing missing: after Amazon's labels arrive, the buyer saves carrier labels or transport, or uploads a product
  barcode. There's no buyer release step.
- **Recipient:** supplier email only when `supplierOrgId` and email exist. Otherwise the buyer shares the packet.
- **Channel/template:** queued `ready`, Resend, `labelsReadyEmail`, `emails.labelsReady.*`, shared reader locale.
- **Links/attachments:** `/shipments/{shipmentId}`, with carton count, destination, ready date and Amazon shipment IDs.
  No packet attachment: the ready branch leaves the email attachment array empty.
- **Identity:** `ready:{shipmentId}:{shipmentRevision}`, conflict-suppressed in the release transaction. The payload
  currently lacks the revision even though the key contains it; the handler reads shipment state at send time.
- **Novu mapping:** `shipment-documents-released`. Capture release revision and suppress obsolete work. Packing
  completion, generated Amazon labels and a document download are not this trigger. Preserve the completeness gate
  in `sendLabelsWhenComplete`.

### Supplier invitation and resend

- **Trigger/source:** supplier creation with invitation email, plus `supplier.invite`/`supplier.resend` in the action
  handler. Invite/resend requires a non-joined, non-removed supplier and an email; resend may change the saved address.
- **Recipient/channel:** supplied/saved supplier email, queued `invite` via Resend.
- **Template/localization:** `invitationEmail` supplier variant, `emails.invitation.*`, shared locale with queued
  request-locale fallback for unknown recipients.
- **Links/attachments:** `/invite?token={token}&kind=supplier`; none. Copacker retains token expiry and exact-email checks.
- **Identity/reliability:** `invite:{supplierId}:{randomUUID}` per intentional send. Invite/resend updates token and job
  transactionally; supplier creation writes the partner and job separately, leaving a crash gap. New tokens invalidate old ones.
- **Novu mapping:** `supplier-invited`; fix publication atomicity, preserve intentional resends as new events, suppress
  obsolete tokens and keep invitation secrets out of logs or broad Inbox payloads.

### Forwarder invitation and resend

- **Trigger/source:** `createForwarder` with email or `inviteForwarder`, through `queueInvite` in
  [forwarders.ts](../../../src/server/forwarders.ts), subject to existing relationship checks.
- **Recipient/channel:** forwarder invitation email, queued `forwarder` via Resend.
- **Template/localization:** `invitationEmail` forwarder variant and shared reader locale/request fallback.
- **Links/attachments:** `/invite?token={token}&kind=forwarder`; none; retain exact-email acceptance and expiry.
- **Identity/reliability:** `forwarder-invite:{forwarderId}:{randomUUID}`. Token update/job insert are transactional;
  partner creation occurs before that transaction. Old queued tokens can become invalid after resend.
- **Novu mapping:** `forwarder-invited`; preserve resends, close creation/publication gaps and suppress stale tokens.

### Team invitation and resend

- **Trigger/source:** invite/resend through `send` in [team.ts](../../../src/server/team.ts), under admin authorization.
- **Recipient/channel:** normalized invitee email, queued `team` via Resend. Existing members cannot be newly invited;
  the invitation retains its role/page grants.
- **Template/localization:** `invitationEmail` team variant, shared reader locale/request fallback.
- **Links/attachments:** `/invite?token={token}&kind=team`; none. Membership grants remain Copacker-owned.
- **Identity/reliability:** `team:{invitationRowId}`. Resend replaces the row/token. Withdrawal deletes pending old
  email jobs but does not ensure an already running job cannot send a stale invitation.
- **Novu mapping:** `team-member-invited`; include in phase 2. Cancellation/resend must invalidate pending Novu work
  and recheck token validity at delivery. This is application membership onboarding, not WorkOS authentication email.

### Shopify customer data request report

- **Trigger/source:** `reportCustomerData` in [shopify-compliance.ts](../../../src/server/shopify-compliance.ts), after
  processing a customer data-request event.
- **Recipients:** owners of workspaces connected to the shop or holding the requested stored orders; none if no
  workspace matches. Not the customer and not all admins/members.
- **Channel/template:** queued `data_request`, Resend, `customerDataRequestEmail`, `emails.customerDataRequest.*`.
- **Localization:** order summaries use owner locale/English when queued; outer copy uses reader locale when sent.
  Use a consistent captured locale when migrating to avoid mixed-language messages after preference changes.
- **Links/attachments:** app URL, shop, request ID and workspace-specific order summaries; no export attachment or
  customer contact details. Preserve minimal disclosure and owner-only access.
- **Identity:** `email:data-request:{requestId}:{orgId}:{ownerEmail}`, conflict-suppressed insertion.
- **Novu mapping:** `customer-data-request-received`; operational compliance delivery in phase 2, with monitored
  failures and prompt delivery, not subject to optional marketing/catalog preferences or digests.

## Direct and provider-owned messages outside this rollout

Do not remove the shared Resend sender when migrating queued business emails: the following paths still use it or
WorkOS. Their scope decisions are explicit; migrating them later needs a separate contract.

| Message | Trigger and eligibility | Provider, template and locale | Links, attachments and reliability | Scope |
| --- | --- | --- | --- | --- |
| Password reset | `requestPasswordReset` in [sign-in.ts](../../../src/server/sign-in.ts); WorkOS-resolved email, same UI response for unknown account | Direct Resend, `passwordResetEmail`; saved profile locale or negotiated request language | Site-specific `/reset-password?token=...`, WorkOS expiry; no attachment; `password-reset:{reset.id}`; send failure logged, no durable email job | Keep outside Novu auth scope. Code notes WorkOS also sends unless disabled in its dashboard; verify external configuration before changing either path. |
| Email verification code | WorkOS authentication flow; `resendCode` requires pending verification and resolves its user | WorkOS `sendVerificationEmail`; no repository email template | Provider-owned code, expiry and delivery; no local Resend key or email job | Keep in WorkOS. |
| Waitlist approval invitation | Operator approves entry in WorkOS; behavior documented in [mailing-list.ts](../../../src/server/mailing-list.ts) | WorkOS invitation; external template/configuration | Signup link; delivery configuration is not proven by a local send call | Keep in WorkOS; do not duplicate. |
| Contact form message | Validated/rate-limited route calls [sendContactMessage](../../../src/server/contact.ts); requires `CONTACT_EMAIL` | Direct Resend to contact address; plain text with topic/name subject, no localized React Email template | Submitter Reply-To; no attachment; random UUID per call; error returned by route, no durable retry | Keep outside partner notifications; future support-intake migration needs durable request identity. |
| Waitlist welcome | Mailing-list route sees a newly pending entry within freshness window of 60 seconds | Direct Resend to signup email; `waitlistWelcomeEmail`, negotiated signup locale | Signed unsubscribe URL and one-click headers; optional contact Reply-To; `waitlist-welcome:{hash(email)}`; no attachment; failure logged | Keep separate marketing/onboarding scope; preserve unsubscribe and consent if migrated later. |
| Waitlist signup notice | Same new-entry path, only with `CONTACT_EMAIL` | Direct Resend to contact; English plain text includes language and WorkOS approval instructions | Signup email Reply-To; `waitlist-signup:{hash(email)}`; no attachment; failure logged | Keep internal marketing operations outside rollout. |

The mailing-list route awaits welcome and notice concurrently, catches each failure and still returns success. Entries
can exist without delivered emails. Rejoining uses the same email-derived keys; any future migration must handle
rejoin identity and provider deduplication deliberately, not replay the whole waitlist.

## Existing in-app behavior

[NotificationsMenu](../../../src/components/notifications-menu.tsx) is an empty Inbox placeholder: no persistent feed,
unread state or notification settings to migrate. Novu Inbox is new functionality. Timeline events/comments, proposal
panels, reconnect prompts, sync status and action errors remain contextual business UI, not delivered notifications.
Do not backfill historical timeline events into Novu without an explicit policy. Inbound commerce notifications remain
ingestion plumbing and do not migrate to outbound Novu workflows.

## Cutover checklist

- [ ] Preserve exact producer, eligibility, recipient, revision, locale, template and attachments for every migrated flow.
- [ ] Add team invitations and owner-only customer-data reports to phase 2.
- [ ] Close partner-creation/publication gaps and preserve merged runtime job wakes.
- [ ] Before enabling Novu dispatch, pause new queued-email production and checkpoint the existing delivery owner.
  Drain pending jobs through that owner and let leased jobs finish, then reconcile completed, failed and ambiguous
  outcomes against provider evidence. If draining is not possible, transfer only confirmed unsent intents with their
  original identities after stopping the old owner and fencing its leases. Enable Novu only after every outstanding
  intent has one recorded owner; never run both delivery paths for one intent or replay completed jobs. Resume queued
  production through Novu while retaining the shared sender for excluded direct flows.
- [ ] Give each new delivery intent one persistent identity and one delivery owner.
- [ ] Test crash-after-send, lease expiry, ambiguous responses and retries beyond provider deduplication windows.
- [ ] Pin PO revision/PDF and release revision, and suppress superseded release jobs.
- [ ] Invalidate stale invitations on resend/cancel, including work already dispatched to Novu where supported.
- [ ] Preserve owner-only compliance delivery and keep sensitive payloads out of logs.
- [ ] Keep excluded direct/WorkOS flows working; verify password-reset duplicate-sender configuration separately.
- [ ] Add monitored failure/replay handling for all migrated job types, not just order-linked jobs.
- [ ] Test submit, revise and automatic label sending end to end: action, publication, eligibility, workflow and delivery.
- [ ] Keep retries on the same delivery identity. During cutover, reconcile ambiguous sends against provider evidence;
  hold late retries outside the provider's deduplication window for review instead of automatically replaying them.

## Test delivery restriction

All test email must go to **andrew@fencing.club**, never Chen or any other real supplier/customer contact. Prefer mocked
providers. For an authorized live test, enforce the allowlist or recipient override at the final send boundary,
including queued jobs and Novu workflows. A real recipient in fixture data is not authorization to send.

A manual `[TEST]` PO36 packet email was sent separately. It did not exercise `submitOrder`, `sendLabelsWhenComplete`, their
eligibility checks or Novu. Record manual template/packet checks separately from workflow-trigger acceptance. This
documentation audit sends no emails and changes no delivery behavior.
