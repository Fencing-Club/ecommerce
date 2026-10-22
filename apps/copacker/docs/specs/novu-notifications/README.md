# Novu notification implementation spec

Status: planned. Baseline reviewed on 2026-10-15; checklist items below describe implementation work, not completed
features. Recheck the linked implementation before starting each phase because the app is changing.

Deliver relevant in-app, email and optional SMS notifications to buyers, suppliers and freight forwarders. Connect
existing actions first, add stock and catalog impact detection next, and introduce production and freight notifications
alongside the business workflows that make them reliable. The first useful release comprises phases 1 through 4.

## Scope and supporting documents

- [Concrete notification catalog](events.md): individual events, recipients, current support and dependencies.
- [Existing delivery migration inventory](migration-inventory.md): implemented triggers, recipients, templates,
  localization, attachments, retry behavior, excluded flows and cutover risks.
- [Email templates and notification settings](templates-and-settings.md): package work, preferences and defaults.
- [App header](../../app-header.md): existing Inbox placeholder.
- [Roles and page access](../../permissions.md): recipient and content authorization.
- [Supplier workspace](../../supplier-workspace.md): catalog pricing and order proposals.
- [Purchase order flow](../purchase-order-flow/README.md): current and planned operational workflows.
- [Provider notifications](../../notifications.md): inbound commerce events, distinct from these user notifications.

- [Shipment action notification contract](shipment-action-handoff.md): canonical events, recipients, templates, and actor feedback.

## Current behavior and boundaries

The app has a durable Postgres job queue, Resend email delivery, React Email templates in `@repo/copacker-emails`,
WorkOS authentication, workspace memberships, PO timeline events, supplier change proposals and restock calculations.
It does not yet have Novu delivery, notification preferences or persistent stock-alert state.

Important distinctions:

- Supplier PO acceptance and decline need new actions and states.
- A supplier's ready-date-only change applies immediately. Separate buyer approval or rejection of that date would
  change the product contract. A date included in a commercial proposal follows the proposal's single decision.
- Proposal approval is one decision for the whole proposal. Separate notification types do not introduce per-field
  approval. One message can explain all changes in that decision.
- Packing ready is workflow readiness, not physical readiness for pickup.
- Supplier shipped, forwarder forwarded and buyer received are existing actions. They do not establish pickup,
  vessel departure, customs clearance or carrier-confirmed delivery.
- Comments are existing messages, not tracked requests with due dates or completion states.
- Catalog changes affect effective assortment and future purchasing terms. Submitted PO snapshots must not be
  silently repriced or rewritten.
- Current restock calculations estimate risk against replenishment lead time. Exact warnings relative to a particular
  inbound shipment's arrival require dated inbound-arrival modeling.

## Architecture

Copacker owns business events, authorization, recipient selection, catalog impact, alert lifecycle and outstanding
actions. Novu owns notification workflows, channel preferences, digests and delivery orchestration. Email presentation
stays in the repository's emails package.

### Event publication and delivery

1. In the business transaction, save an immutable typed notification event and enqueue its delivery work. Reuse the
   existing jobs infrastructure; do not publish to Novu before the transaction commits.
2. Include an event ID, notification type, actor user/workspace, occurrence time, record IDs, business revision,
   affected workspace IDs and the minimal before/after facts needed by the template. Do not reconstruct an old change
   from mutable current data during a retry.
3. Resolve eligible recipients server-side. Store a unique delivery intent per event, recipient and workflow. Add
   workspace contact routing and optional record subscriptions; those are new functionality.
4. Before sending, recheck membership, partner linkage, record access, price access and whether a delayed action is
   still outstanding. Remove unauthorized recipients and redact restricted payload fields before sending data to Novu.
5. Trigger the matching Novu workflow with a stable idempotency key. Confirm the SDK/API's actual deduplication window
   and retry semantics during implementation. Keep local delivery state; never assume an unbounded exactly-once
   guarantee from the provider.
6. Record attempts, acceptance, provider identifiers and failures. Use bounded retries with backoff, operator-visible
   failed jobs and deliberate replay. Distinguish Novu accepting a workflow from a provider delivering the message.

Some actions already write timeline events; others, such as document uploads and catalog edits, need a publication
hook. Publish typed facts from the committing action, not by parsing translated timeline text. Generated-document
notifications fire only after the current document is stored successfully, not when generation is queued.

### Identity and authorization

Use a workspace-specific subscriber identity for each authenticated user. Derive it server-side from the session and
authorized membership, and sign Inbox access. External invitation contacts have email-only identities until they join;
do not grant them an authenticated inbox or merge identities merely because an address matches.

Resolve recipients using the buyer/supplier/forwarder relationship on the order. Exclude the actor by default. A
forwarder's commercial-invoice access follows the existing explicit authorization rules; generic price notifications
must not accidentally broaden that exception. Document links point to authorized app routes, not public bucket URLs.

Handle membership removal, permission changes, partner unlinking, account deletion and workspace deletion. Previously
delivered email cannot be recalled; minimize sensitive content. Define and test cleanup of old Novu inbox items when
access is revoked, not just prevention of future sends. Links always reauthorize and select the correct workspace.

### Workflow and provider setup

Use separate development and production Novu environments. Keep secret keys on the server and worker; expose only
the public application identifier and authenticated Inbox parameters. Connect Resend for email and an SMS provider
when phase 7 is ready. Validate sender configuration and provider/plan support before activation.

Render repository templates through a Novu Framework endpoint, with authenticated provider requests and a documented
deployment/sync procedure. Confirm runtime and SDK compatibility with the app's platform migration before choosing the
adapter. Keep the domain publisher independent of Next.js so it can move with the app. Do not duplicate template
implementations in the Novu dashboard.

Migrate existing invitation, PO and labels-ready emails one workflow at a time. For each business event, exactly one
path owns delivery: either the current email handler or Novu. Preserve localization, attachments, reply behavior and
existing invitation security. Authentication emails are outside this rollout unless separately scoped.

## Phase 1 Foundation and settings

- [ ] Define the typed event registry, payload schemas, recipient rules, severity and channel defaults for the catalog.
- [ ] Select compatible Novu server, Inbox and Framework packages and record their versions and environment needs.
- [ ] Configure development and production environments, Resend and authenticated Framework access.
- [ ] Add transactional event/delivery persistence and a notification job handler using new database migrations.
- [ ] Implement stable deduplication, bounded retry/backoff, failure visibility and replay behavior.
- [ ] Implement recipient resolution, actor exclusion, current-access checks and price-redacted payloads.
- [ ] Implement workspace-specific subscriber synchronization and external invitation-contact identities.
- [ ] Implement membership, permission, partner-removal and deletion lifecycle handling, including Inbox cleanup.
- [ ] Replace the Inbox placeholder with unread counts, read/archive actions and authorized record links.
- [ ] Add personal per-type in-app and email preferences and basic digest settings.
- [ ] Add admin routing for operational, approval, stock and catalog recipients.
- [ ] Keep Novu authoritative for channel preferences and Copacker authoritative for business rules and routing.
- [ ] Add Framework rendering backed by `@repo/copacker-emails`; retain subject, HTML and plain-text output.
- [ ] Update the provider inventory, environment example, operations docs and app-header docs.
- [ ] Add stories with play tests for Inbox/settings and exercise desktop, mobile, keyboard and workspace switching.
- [ ] Test rollback, retry, duplicate publication, ambiguous API responses and cross-workspace access.
- [ ] Run focused checks and `pnpm verify`; record completion evidence before checking off the phase.

Exit: a committed development event reaches only authorized recipients once under the tested retry conditions,
preferences persist, revoked access is handled and a failure is diagnosable without exposing secrets.

## Phase 2 Existing business events and email migration

- [ ] Connect supplier invitations and forwarder invitations, preserving token and recipient behavior.
- [ ] Migrate team invitations including resend/cancellation, and owner-only customer-data-request reports.
- [ ] Complete the migration inventory cutover checklist; preserve excluded auth, contact and waitlist delivery.
- [ ] Connect PO submission and migrate the existing purchase-order email without duplicate delivery.
- [ ] Connect each proposal difference type, withdrawal, approval and rejection from the event catalog.
- [ ] Connect immediate ready-date changes and date removal with accurate copy.
- [ ] Connect invoice uploads, comments and generated packing-list availability.
- [ ] Connect packing submitted, commercial approval required, correction requested and labels required.
- [ ] Connect released shipment documents and migrate labels-ready email delivery.
- [ ] Keep `sendLabelsWhenComplete` (labels sent once the packet is complete) as the ready-email trigger; packing
  completion alone does not send it.
- [ ] Preserve joined-supplier/email eligibility, PO revision/PDF attachment parity and release revision identity.
- [ ] Connect supplier shipped, forwarder forwarded and buyer-confirmed receipt.
- [ ] Notify an assigned forwarder of goods shipped toward it and relevant ready-date changes.
- [ ] Add a notification when a submitted route names a forwarder, without implying acceptance.
- [ ] Compare committed packing revisions for quantity, dimensions, weight and pickup-address changes; suppress draft edits.
- [ ] Connect transitions into shipment processing needs-attention without retry spam.
- [ ] Publish explicit connected-account disconnection to other workspace owners/admins, retaining actor and account identity.
- [ ] Normalize confirmed revocation, uninstall, reconnect-required authorization failure and missing permissions per provider.
- [ ] Add persistent connection incidents and deduplication across sync workers; distinguish transient provider failures.
- [ ] Add unresolved-connection reminders with configurable timing and current-access rechecks; exclude intentional disconnects.
- [ ] Resolve incidents on validated reconnection and notify previously alerted admins who remain authorized.
- [ ] Cancel reminders on restoration, deliberate removal or workspace deletion; handle reinstall races and connection-row replacement.
- [ ] Add connection-attention and connection-restored email templates with account, impact and authorized Settings links.
- [ ] Add the Integrations settings category, per-event preferences, responsible admins and connection reminder timing.
- [ ] Test repeated sync failures, transient outages, missing scopes, manual removal, reconnection and revoked recipient access.
- [ ] Update invitation, purchase-order and labels-ready templates.
- [ ] Add order-change-request, order-change-decision and ready-date-change templates.
- [ ] Add document-available, order-comment, shipment-update and action-required templates.
- [ ] Add event-specific subjects, translated copy, channel preferences and appropriate record links.
- [ ] Test multi-change proposals, unauthorized prices, removed partners, failed document generation and obsolete revisions.
- [ ] Preview HTML/plain-text templates and verify the end-to-end Inbox/settings experience in the integrated browser.
- [ ] Run focused checks and `pnpm verify`.

Exit: each existing event has tested routing and templates, and migrated emails have one active delivery owner.

## Phase 3 Inventory alerts

- [ ] Reuse restock calculations and supplier on-hand/committed-stock calculations rather than duplicating formulas.
- [ ] Add persistent alert state scoped by workspace, item and relevant location/channel.
- [ ] Evaluate after successful relevant syncs and stock/commitment mutations, plus a scheduled reconciliation.
- [ ] Add buyer low-stock, reorder-needed, projected-risk and zero-stock transitions as distinct events.
- [ ] Add buyer stock-warning recovery, supplier low-stock and supplier commitment-shortage/recovery events.
- [ ] Suppress decisions based on stale, unknown, blocked or incomplete data; never interpret unknown stock as zero.
- [ ] Add cooldown, escalation and recovery rules so repeated syncs and threshold oscillation do not flood recipients.
- [ ] Add admin thresholds and recipients, personal stock preferences and digest schedule controls.
- [ ] Add stock-warning, stock-recovery and stock-digest templates with authorized, current action links.
- [ ] Exclude warnings already resolved before a scheduled digest or delayed send.
- [ ] Test first evaluation, repeated sync, escalation, recovery, partial sync and multi-location isolation.
- [ ] Verify settings and alert UX in the integrated browser; run focused checks and `pnpm verify`.

Exit: valid state transitions produce alerts; unchanged or unreliable data produces none. Supplier internal shortages
do not expose other buyers' commitments. Buyer inventory is not shared with suppliers without a separate sharing policy.

## Phase 4 Supplier catalog impact

### Impact rules

Compare each affected buyer's effective product assortment and purchasing terms before and after a committed change,
using `customerProducts` and the canonical catalog pricing rules. A supplier's base-price change may have no effect
on a buyer with a fixed override. Do not send an alert simply because a catalog row was updated.

Catalog assignment, activation, deactivation and deletion can change many effective terms. Currently, no active catalog
means fallback to the supplier's base products and prices; deactivation does not inherently revoke product access.
Capture the before-state before destructive edits and queue durable impact work with enough versioned facts to compare
accurately even when another edit follows immediately. Bound large fan-outs and make processing resumable.

Keep currency, price basis, pack size and quantity-tier context with every comparison. Never label a currency or basis
change as a percentage price increase without a valid like-for-like comparison. Notification text must distinguish an
effective catalog change from a proposed change to a submitted PO.

- [ ] Add buyer-specific before/after impact calculation for every catalog event in the event catalog.
- [ ] Cover catalog save, assignment, activation, deactivation and deletion.
- [ ] Cover product save, bulk archive/restore, imports and automatic inclusion of new products.
- [ ] Cover stock edits and continued-selling rules for watched-product ordering availability.
- [ ] Persist change/version IDs, affected buyer IDs and immutable comparison facts; make impact jobs resumable.
- [ ] Emit separate price increase, price decrease, volume-tier, minimum, maximum and increment changes.
- [ ] Emit separate currency, price-basis, units-per-pack, packs-per-case and supplier-SKU changes.
- [ ] Emit product archived/restored, assortment removal/addition and catalog assignment/status changes.
- [ ] Add product availability recovery and loss for explicitly watched products.
- [ ] Define relevant products from existing purchase history/mappings and add explicit supplier/product subscriptions.
- [ ] Add catalog recipients, notification scope, channel preferences and digest settings.
- [ ] Add catalog-change and catalog-digest email templates with before/after values and a review link.
- [ ] Keep distinct events but summarize bulk edits per buyer and supplier; do not send one email per imported row.
- [ ] Send immediate email only for a detected purchasing-task blocker; use digest defaults for routine changes.
- [ ] Do not notify buyers about draft-only catalog edits that have no effective impact.
- [ ] Preserve submitted PO snapshots and show draft/future-purchase impact without silently applying changed terms.
- [ ] Test overrides, reassignment, catalog fallback, imports, automatic inclusion, price restrictions and concurrent edits.
- [ ] Verify catalog notification/settings UX in the integrated browser; run focused checks and `pnpm verify`.

Exit: affected buyers see only their own changed terms, unaffected buyers receive nothing, and bulk changes are readable.
Scheduled price announcements and advance discontinuation notices require new effective-date functionality and are
follow-up product work, not part of basic catalog impact detection.

## Phase 5 Supplier workflow extensions

- [ ] Implement supplier PO acceptance and decline, including reasons and response deadlines.
- [ ] Implement production started and production delay reporting.
- [ ] Implement explicit inability to supply an item and any substitution decision.
- [ ] Implement physical goods-ready confirmation separately from packing readiness.
- [ ] Implement buyer-originated sent-PO amendments for quantity, requested date and instructions.
- [ ] Implement PO cancellation request and decision states.
- [ ] Implement tracked information, invoice, packing-list and production-update requests with owners and deadlines.
- [ ] Link responses/uploads to requests and close fulfilled actions.
- [ ] Implement acceptance, production-update and physical-ready-date reminders.
- [ ] Cancel obsolete reminders on completion, withdrawal, reassignment or cancellation; recheck before sending.
- [ ] Add acceptance, request and reminder email templates and production-specific copy.
- [ ] Add deadline/escalation admin settings and each new event's personal preferences.
- [ ] If ready dates should require separate approval, explicitly revise the existing product contract before adding it.
- [ ] Test state transitions, authorization and reminder cancellation; verify new UI/stories and run `pnpm verify`.

Exit: each supplier notification corresponds to an explicit committed action or an outstanding deadline.

## Phase 6 Freight workflow extensions

- [ ] Implement forwarder assignment acceptance, decline, replacement and removal, including revoked access.
- [ ] Implement quote requests, submissions, approval and rejection with deadlines.
- [ ] Implement booking requests and confirmations independently of stored reference strings.
- [ ] Implement pickup scheduling, rescheduling, cancellation, failure and confirmed collection.
- [ ] Implement departure, ETA history and a material ETA-change threshold.
- [ ] Implement transit delay, customs hold, customs clearance and destination-port arrival.
- [ ] Implement delivery appointments, forwarder/carrier delivery confirmation and proof-of-delivery uploads.
- [ ] Implement damage and missing-cargo reports with quantities, evidence, owners and resolution state.
- [ ] Implement booking-aware destination, requested-date, instructions and cargo amendments.
- [ ] Implement shipment cancellation requests, distinct from provider processing cancellation.
- [ ] Extend tracked requests to cargo dimensions, cargo weight, shipping documents and delivery instructions.
- [ ] Add quote, pickup and logistics-exception email templates and milestone-specific shipment copy.
- [ ] Add assignment, quote, pickup, document, update-cadence and unresolved-exception reminders.
- [ ] Add each new event's preferences and admin reminder/escalation settings.
- [ ] Identify the authoritative source for each milestone; do not infer logistics events from unrelated status fields.
- [ ] Test each event's permissions, routing and stale reminders; verify new UI/stories and run `pnpm verify`.

Exit: freight notifications correspond to explicit actions or validated integration events, and every request/exception
has a defined completion condition.

## Phase 7 SMS activation

- [ ] Configure the chosen SMS provider and required sender setup for supported destinations.
- [ ] Add verified phone onboarding, replacement and removal; do not reuse an address contact phone as consent.
- [ ] Record explicit opt-in and enforce opt-out across all SMS workflows.
- [ ] Add personal SMS preferences, quiet hours and time zone; admins cannot opt users in.
- [ ] Enable only eligible urgent stock, production and freight exceptions by default policy.
- [ ] Add short, localized SMS copy with authorized app links and no unnecessary sensitive details.
- [ ] Respect quiet hours unless the user explicitly enables a supported urgent exception.
- [ ] Track provider failures and delivery state; test opt-out, retries, suppression and escalation end to end.
- [ ] Verify phone/preferences UX in the integrated browser; run focused checks and `pnpm verify`.

Exit: an eligible event sends SMS only to a verified, opted-in recipient within their configured policy.

## Validation and rollout

For each phase, finish the coherent implementation before running checks. Add focused runtime tests, sibling stories
with play tests for new pages/components, email rendering checks and integrated-browser acceptance for UX changes.
Finish with `pnpm verify`. Do not add tests for the prose checklist itself.

Use local development data and new migrations. Release behind workspace/workflow controls, begin with test recipients,
then enable a small cohort. Observe failures, duplicate sends, delivery volume and opt-outs before broad activation.
All test emails must go to `andrew@fencing.club`, never Chen or another real partner. Enforce the restriction at the
delivery boundary. Manual packet emails do not establish workflow-trigger or Novu acceptance coverage.
Replace the queued business-email delivery path directly. Password resets and other direct flows retain the shared
Resend sender. Keep replay scoped to original event IDs and use one delivery path per notification.

Update this checklist only when acceptance evidence exists. Record unresolved provider limits and current SDK behavior
in implementation docs rather than assuming this plan verifies an external integration.

## Implementation references

- [Orders](../../../src/server/orders.ts), [proposals](../../../src/server/order-proposals.ts),
  [shipment legs](../../../src/server/shipment-legs.ts), [comments](../../../src/server/comments.ts).
- [Queue](../../../src/server/queue.ts), [worker](../../../src/server/worker.ts),
  [email handler](../../../src/server/job-handlers.ts), [schema](../../../src/db/schema.ts).
- [Catalogs](../../../src/server/catalogs.ts), [products](../../../src/server/supplier-products.ts),
  [supplier stock](../../../src/server/supplier-stock.ts), [restock plan](../../../src/server/restock-plan.ts).
- [Emails package](../../../../../packages/copacker-emails/src/index.ts).
- [Novu workflows](https://docs.novu.co/platform/workflow/overview),
  [Inbox security](https://docs.novu.co/inbox/react/production),
  [Framework endpoint](https://docs.novu.co/platform/concepts/endpoint).
