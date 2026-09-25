# Copacker implementation contract

## Agreed product

Copacker is a multi-organization buyer/supplier portal. WorkOS authenticates users; database memberships and explicit buyer/supplier relationships authorize every record. Supplier organizations can work with multiple buyers. One PO has one destination. Partial shipments reserve quantities independently. Initial route: supplier to AWD USA; AWD China, FBA, and forwarders remain destination types but cannot create Amazon shipments until their implementation is verified.

PO quantities and prices are per individual piece. Pack size explicitly converts pieces to Amazon sellable units. Suppliers may propose supplier SKU and price changes, never buyer SKU/product identity changes. Commercial changes require buyer approval, update the PO, retain previous revisions, and sync approved supplier SKU to Shopify variant custom.supplier_sku. Shopify unit cost writeback is an explicit buyer choice with currency and pack conversion checks. An official commercial invoice PDF is mandatory.

Supplier submits their carton identifiers, contents, cm/kg measurements, ship-from contact/address, and local ready-for-pickup date. Server validation and Amazon eligibility precede shipment creation. Available Amazon carton labels are retrieved and mapped to supplier carton numbers. AGL booking is performed by the buyer in Amazon; Copacker waits for buyer-uploaded shipping labels. Readiness is not a booked pickup appointment. Released supplier documents include packing list, product labels, carton/shipping labels, and Packing Checklist. Shipment corrections invalidate affected documents and use supported update/replacement paths, never silently reuse labels.

## Architecture

- Next.js App Router and shadcn components; server-authorized actions/routes.
- Railway PostgreSQL; Drizzle migrations, transactional quantity reservations and immutable PO revisions.
- Private Railway S3 bucket; all original and generated documents in one store. Authenticated downloads, no public object URLs.
- Encrypted tenant credentials, expiring single-use OAuth state, exact-email supplier invitations.
- PostgreSQL durable jobs for Amazon, notifications, and Shopify writes. Creation timeouts are uncertain outcomes requiring reconciliation, never blind create retries.
- Reuse pure Aisle packing and label identity concepts; do not reuse local selected account or Windows credential storage as SaaS authorization.

## Work and acceptance evidence

Checked tasks have local implementation and the evidence stated here. They do not imply live merchant approval or deployed end-to-end acceptance. The user approved functional UI wiring while the separate design workstream retains visual design ownership. Preserve its layouts and styles.

### Repository and infrastructure

- [x] Create `D:\ecommerce` with Copacker app and reusable Aisle library.
- [x] Copy the five Fencing Club/Shopify packages and shared tooling; compare 1,500 source/local-data files byte-for-byte against Agency before removal.
- [x] Adapt root tooling and VS Code tasks to the included packages; exclude private order fixtures and credentials from Git/deploy uploads.
- [x] Correct the saved CLI capture to valid JSON, prompt cancellation typing, and deterministic drawer animation test setup.
- [x] Provision Railway project, Postgres service, and private document bucket.
- [x] Configure local database URL and WorkOS callback; verify encrypted Postgres connection using the service-specific CA retrieved through authenticated Railway access.
- [x] Name the unreleased Drizzle baseline `0000_copacker` and verify it against the PostgreSQL-compatible test engine.
- [x] Apply the baseline migration to the new Copacker Railway Postgres service; migration command succeeded.
- [ ] Deploy web and worker services with independent startup commands and worker recovery checks.
- [ ] Remove the five original Agency packages and then prune Agency Knip, formatter, documentation links, and lockfile. Automatic approval review blocked removal; no originals have been deleted. Shared tooling and all Agency apps remain required there.

### Backend and automated checks

- [x] Implement organization membership and buyer/supplier order authorization; test unrelated-workspace and draft-order access denial.
- [x] Implement transactional partial-shipment reservations and repeat-submission protection; test over-allocation and duplicate jobs.
- [x] Create the first packing draft during PO submission and resume it on repeated shipment creation; reject a new shipment when all PO quantities are assigned.
- [x] Save incomplete supplier packing independently from submitted packing, with revision conflicts and PO item ownership checks; saving has no Amazon, email or quantity-reservation side effects.
- [x] Share readiness checks between preflight and final submission; report missing fields/invoice and available partial-shipment quantities. Require review after a PO revision changes.
- [x] Expose an authenticated workflow read endpoint with the next responsible party, missing documents, remaining quantities and safe download links. Use the same release requirements in the read endpoint and release mutation.
- [x] Add the packing draft column to the Copacker Railway database and original Drizzle baseline; verify the live column and matching schema snapshot.
- [x] Wire draft save/resume, preflight feedback, remaining quantities and workflow next steps into the existing UI; wire reconciliation and label-release readiness without redesigning it.
- [ ] Verify refresh recovery, revision conflicts and partial-shipment handoff in the browser with a real buyer/supplier pair.
- [x] Require official invoice and buyer approval for commercial changes; test PO revision history and preservation of buyer product identity.
- [x] Implement correction invalidation of documents and pending shipment jobs; verify with database tests.
- [x] Validate pieces-to-sets conversion, unique carton identifiers, AWD dimensions/weight, one SKU per carton and remaining quantities; verify domain tests.
- [x] Parse SSCC labels, reject invalid checksums/layouts, preserve PDF page dimensions, split and combine PDFs; verify label tests.
- [x] Encrypt credentials with organization/provider binding and validate Shopify callback signatures; verify tamper tests.
- [x] Reject invalid and active-content PDF uploads; verify security tests.
- [ ] Verify WorkOS sign-in, exact-email invitations, workspace switching, team removal, and supplier order access with real sessions.
- [x] Test Shopify expiring token renewal, concurrent refresh serialization, expired/rejected grants, encrypted tenant isolation, and merchant-account binding after reconnect.
- [x] Complete Shopify OAuth in the signed-in Fencing Club buyer workspace and read the live catalog with the resulting app token.
- [ ] Verify public distribution onboarding for an unrelated merchant and a live expiring-token refresh.
- [x] Verify FNSKU availability against Amazon's current Listings API model; batch up to 20 SKUs, follow pagination, and validate returned seller SKU/marketplace identities. Re-fetch ASIN/FNSKU server-side when creating a PO and reject Shopify ASIN mismatches.
- [x] Verify body cord and mask wire SKU/ASIN/FNSKU identities with the authorized Fencing Club seller. Imported its existing private grant into the buyer's encrypted connection.
- [ ] Verify public Amazon app onboarding separately; the private seller grant does not prove other sellers can connect.
- [x] Test lost create responses, overlapping create attempts, stale/replaced worker ownership, polling limits, and mismatched reconciled carton/reference data. Refresh leases while active and preserve uncertain-create revisions for reconciliation.
- [ ] Exercise crash recovery against a deployed worker and an approved live Amazon shipment.
- [ ] Verify approved supplier SKU writes and optional currency-checked unit cost updates against Shopify.
- [x] Test current document requirements and revision checks at packet release, supplier release denial, cross-workspace upload denial, unknown carton assignments, one-page product labels, invoice replacement, and released-label replacement blocking.
- [ ] Test authenticated download and mid-upload correction races with deployed sessions.
- [x] Configure a sending-only Resend key locally and on web/worker services; verify Delivered status for the authorized Gmail configuration-test email.
- [x] Preserve the invitation URL through WorkOS sign-in and require selection of an owned supplier workspace on acceptance; test exact-email, ownership and one-time use checks.
- [ ] Verify lifecycle invitation/PO/label-ready emails and idempotent retries through the deployed worker to the authorized test recipient.
- [ ] Verify an owned sender domain before external supplier invitations. Deferred at the user's request; Gmail owner-only testing remains available.

### End-to-end shipment acceptance

- [ ] Complete design-owned UI wiring against [api-contract.md](api-contract.md) and exercise browser flows.
- [ ] Authorize a merchant account, check AWD eligibility, create and confirm an approved test shipment, retrieve labels, and verify SSCC/carton assignments.
- [ ] Upload buyer-booked carrier labels, reject missing/duplicate assignments, and release the complete supplier packet.
- [ ] Review generated packing list/checklist and all label page sizes; ensure actual supplier carton numbers are printed.
- [ ] Exercise correction, cancellation verification, and replacement without duplicate Amazon shipments or reused labels.
- [x] Verify live Railway private bucket upload/download using the app storage functions; anonymous access returned denial and the temporary PDF was removed.
- [ ] Verify cross-organization document download denial with deployed WorkOS sessions.
- [x] Build the Next.js production app successfully after correcting source imports in the shared Aisle package.
- [x] Pass full repository verification after functional UI integration and invitation fixes: formatting, lint, types, Knip and 918 tests across six packages.
- [ ] Complete design-owned desktop/mobile browser acceptance before release.

## Constraints and blockers

- AGL public booking API not verified. Buyer booking and upload is the agreed product behavior, not a missing implementation.
- No live supplier emails, shipping purchases, or real Amazon shipment creation during development.
- The user authorized tests to their Gmail address. Resend configuration test delivered; external supplier notifications remain outside that test scope. Sender domain verification is deferred by user choice.
- WorkOS credentials, merchant app distribution and callback registrations, and verified email sender must be established before live acceptance. Record actual checks and outcomes below.

## Service references

- https://developer-docs.amazon/sp-api/docs/create-an-inbound-order
- https://workos.com/docs/authkit/nextjs
- https://shopify.dev/docs/apps/build/authentication-authorization/authenticate-standalone-apps
- https://docs.railway.com/storage-buckets

## Execution notes

- 2026-09-25: Resend is configured with a sending-only key in ignored local configuration and Railway web/worker variables. Test email `01a0d788-5683-7e52-b9bb-e6438bbe6f84` was visibly Delivered in Resend. Hosted invitation still awaits working deployment. Web and worker builds fail before application build output; deployment IDs and recovery context are in operations.md. Root verify now passes all checks and 918 tests (47 Copacker). Invitation landing and keyboard focus were checked locally; full multi-user and mobile acceptance remain open. Fluent Agent MCP was unavailable.

- 2026-09-25: Read the existing paid AWD shipment `STAR-WBSAXKQKBYMYS`, associated order `STAR-WVEWTEVTWMA5E`, directly from Amazon. The desktop PO's body-cord shipment already exists; do not duplicate it to satisfy a test. New-shipment acceptance requires an approved new shipment or sandbox scenario. The existing shipment is suitable for read/label verification.

- 2026-09-24: Requirements approved. App lives at D:\ecommerce\apps\copacker; shared commerce code lives at packages/aisle. Railway project d8195bc8-1e6d-4fd6-b7bc-8ecf9852acd6; production environment 3fdd8f47-c9ad-44c5-b554-78b64818b4e5; web service 79da7d29-d1d6-4aa7-9fef-709dbf2b9619; private documents bucket 868f3e53-a9fe-4b2b-9eeb-e69926c2b1d2.

- 2026-09-25: Copacker/Aisle focused suite: 23 tests passed. Migrated package verification exposed prompt inference and test-environment animation changes; fixes are local to Ecommerce. Database SELECT 1 passed using encrypted TLS and a pinned service CA. No UI design files changed by this workstream.

- 2026-09-25: Repository formatting, lint, and all package typechecks pass. Full verify currently stops at Knip: `ReconcileShipment` in the design-owned `src/components/shipment-actions.tsx` is not wired into a page. Leave its integration to the design workstream; do not remove or suppress it.

- 2026-09-25: All six test/coverage tasks passed (875 tests total). Root verify still awaits design-owned ReconcileShipment wiring; no test suite was skipped to claim a pass.

- 2026-09-25: Added 24 regression tests across worker recovery, server-side PO identity, Amazon batched listing lookup, and merchant token renewal. Focused Copacker suite now passes 28 tests; Aisle suite passes 19 tests. Both package typechecks and lints pass. Real private-bucket PDF round trip and anonymous-access denial passed. Merchant shipment writes and supplier email delivery remain unexecuted.

- 2026-09-25: Document release now requires the current packing list, checklist, each Amazon carton PDF and SSCC assignment, each carrier label and each shipped product label. Product-label uploads enforce one sheet per variation; invoice replacement makes the prior invoice outdated. Production build passed.

- 2026-09-25: Final coverage run passed all six tasks (903 tests). Updated production build passed. Formatting, lint, and types passed; full verify remains blocked only by the design-owned unused ReconcileShipment export. No supplier notifications or Amazon shipment writes were performed.

- 2026-09-25: Implemented resumable packing drafts, first-shipment creation on PO submission, read-only preflight and order workflow guidance. Added eight database regression tests covering partial quantities, stale saves, PO revisions, corrections and workspace isolation. All six coverage tasks pass (911 tests total, including 40 Copacker and 19 Aisle); repository lint/types and production Next.js build pass. Drizzle reports no difference from the updated baseline snapshot; the additive packing_draft column was applied and read back from the Copacker Railway database. No Amazon shipments or supplier emails were created.

- 2026-09-25: Root verify currently stops on formatting in the separately edited design-owned packing-form.tsx. An independent Knip check also reports its existing unused ReconcileShipment export. Both remain with the design workstream; backend API integration and browser acceptance are explicitly pending. New API copy was reviewed directly; Fluent Agent MCP was unavailable, so no Fluent validation is claimed.
