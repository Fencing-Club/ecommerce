# Email templates and notification settings

Part of the [Novu implementation spec](README.md). All work is planned. Each event in the
[notification catalog](events.md) has its own type and preferences even when presentation components are shared.

## Email package contract

Keep presentation in `@repo/copacker-emails`, using its React Email layout, shared parts and renderer. Return subject,
HTML and plain text. The app supplies translated copy in the recipient's language. Render through the authenticated
Novu Framework endpoint and avoid separate dashboard-owned copies of the templates.

Preserve existing attachments, invitation tokens, reply behavior and authorized download links during migration.
Include workspace, actor, record reference, relevant change, action and a notification-settings link when appropriate.
Never include restricted prices in an email to a user without access. Comments and names remain escaped content.

| Phase | Template | Work |
| --- | --- | --- |
| 2 | Invitation | Update existing supplier, forwarder and team variants for Novu delivery. |
| 2 | Customer data request | Migrate existing owner-only compliance report; preserve disclosure and localization. |
| 2 | Purchase order | Update existing new-PO and approved-revision delivery. |
| 2 | Labels ready | Update existing released-document delivery. |
| 2 | Order change request | Add before/after proposal values and approval link. |
| 2 | Order change decision | Add approval/rejection and decision reason. |
| 2 | Ready date change | Add previous/new date and date-cleared variants. |
| 2 | Document available | Add invoice and packing-list variants. |
| 2 | Order comment | Add author, organization, excerpt and reply link. |
| 2 | Shipment update | Add supplier-shipped, forwarder-forwarded and buyer-received variants. |
| 2 | Action required | Add packing corrections, labels required and processing exceptions. |
| 2 | Connection attention | Add deliberate disconnect, revoked access, uninstall, reconnect-required, missing-permission and unresolved-reminder variants. |
| 2 | Connection restored | Add validated reconnection, without implying data sync has completed. |
| 3 | Stock warning | Add item, location, available stock, risk and action. |
| 3 | Stock recovery | Add resolution of a previously active warning. |
| 3 | Stock digest | Add multiple current warnings, separated by workspace. |
| 4 | Catalog change | Add buyer-specific terms, availability and before/after details. |
| 4 | Catalog digest | Add summarized changes per supplier and affected products. |
| 5 | Acceptance | Add PO decision variants; extend for forwarder decisions in phase 6. |
| 5 | Request | Add information/document requests; extend for freight requests in phase 6. |
| 5 | Reminder | Add outstanding action, owner and due date; extend in phase 6. |
| 5 | Production update | Add started, delayed, cannot-supply and physically-ready copy using shared components. |
| 6 | Quote | Add request, submission, approval and rejection variants. |
| 6 | Pickup | Add appointment and pickup-exception variants. |
| 6 | Logistics exception | Add transit delay, customs hold, damage and shortage variants. |
| 6 | Shipment update extensions | Add departure, clearance, arrival, delivery and proof-of-delivery copy. |

Checklist for every template:

- [ ] Typed props and exported subject/HTML/plain-text renderer.
- [ ] Translated subject and body copy with realistic previews.
- [ ] Price-visible and price-redacted variants where applicable.
- [ ] Correct currency, units, dates and recipient time zone.
- [ ] Valid authorized action/document links, with workspace context.
- [ ] Long names, large change sets, empty optional values and escaping covered.
- [ ] Desktop/mobile visual preview and meaningful rendering tests.

Add `packages/copacker-emails/docs/README.md` and template usage documentation as part of implementation; that package
does not currently have the required docs index. Authentication emails remain outside this migration's scope.

## Personal settings

Add a Notifications section to Settings with workspace context. Show only applicable categories, but expose distinct
event controls rather than one all-or-nothing switch per category. New event defaults must be deterministic.

| Setting | Phase | Behavior |
| --- | --- | --- |
| Per-event in-app preference | 1 | Enable or disable optional events. |
| Per-event email preference | 1 | Off, immediate or digest for eligible workflows. |
| Digest timing | 1 | Recipient time zone and supported daily/weekly delivery schedules. |
| Order subscriptions | 2 | Follow/unfollow authorized records without broadening access. |
| Integrations preferences | 2 | Separate disconnect, revocation, uninstall, reconnect-required, missing-permission, reminder and restoration controls for authorized admins. |
| Stock preferences | 3 | Separate warning, zero-stock, projected-risk and recovery controls. |
| Supplier catalog subscriptions | 4 | Select relevant suppliers and watched products. |
| Catalog scope | 4 | Purchased/matched products by default; optionally all available products. |
| Catalog event preferences | 4 | Separate price, quantity-rule, packaging, assortment and availability controls. |
| New workflow preferences | 5 and 6 | Add controls alongside the corresponding business features. |
| Verified phone | 7 | Verification, replacement and removal. |
| SMS consent | 7 | Explicit opt-in and opt-out, with recorded consent state. |
| Per-event SMS preference | 7 | Off by default, limited to eligible events. |
| Quiet hours | 7 | User time zone; any urgent override requires explicit user selection. |
| Language | Reuse existing | Use the existing language setting, not a conflicting notification-only language. |

## Workspace settings

Owners/admins manage routing and operational policy; individuals control their delivery preferences.

| Setting | Phase | Behavior |
| --- | --- | --- |
| Operational recipients | 1 | Authorized users responsible for new order/shipment updates. |
| Integration recipients | 2 | Owners/admins by default; select responsible admins for unresolved connection reminders. |
| Connection reminder timing | 2 | Reminder interval for actionable incidents; never remind after deliberate disconnect or removal. |
| Approval recipients | 1 | Users with the required edit and price permissions. |
| Stock recipients | 1 and 3 | Inventory responsibility and alert routing. |
| Catalog recipients | 1 and 4 | Purchasing responsibility and catalog-change routing. |
| External partner contacts | 1 and 2 | Email recipients before a partner joins; no inbox access. |
| Buyer stock thresholds | 3 | Warning days/levels alongside existing restock defaults. |
| Supplier stock thresholds | 3 | Low stock and commitment-shortage rules. |
| Cooldown and recovery | 3 | Repeated-warning suppression and recovery criteria. |
| Catalog email policy | 4 | Digest defaults and immediate purchasing-blocker exceptions. |
| Reminder timing | 5 and 6 | Per-workflow deadlines/cadence where supported. |
| Escalation recipients | 5 and 6 | Authorized backup users and timing. |
| Material ETA threshold | 6 | When a changed ETA warrants immediate notification. |

Novu is authoritative for per-subscriber channel/workflow preferences. Copacker is authoritative for routing, watched
records, business thresholds, consent evidence and reminder lifecycle. If values are mirrored for delivery, define the
sync direction and failure behavior. Never keep two independently editable sources for the same preference.

## Default channel policy

| Event class | In-app | Email | SMS |
| --- | --- | --- | --- |
| Invitation to an external contact | After joining only | Immediate invitation | Off |
| Approval/action required | Immediate | Immediate | Eligible only when urgent and opted in |
| Routine order/shipment milestone | Immediate | Optional or digest | Off |
| Document available | Immediate | Immediate for invoices; otherwise optional | Off |
| Order comment | Immediate for subscribed recipients | Configurable | Off |
| Account disconnected or reconnect required | Immediate for authorized admins | Immediate | Off |
| Required connection permissions missing | Immediate for authorized admins | Immediate | Off |
| Unresolved connection reminder | Optional | Scheduled reminder | Off |
| Connection restored | Immediate for previously alerted authorized admins | Optional | Off |
| Low stock/reorder needed | Immediate | Digest | Off |
| Zero stock/critical shortage | Immediate | Immediate | Optional after phase 7 |
| Warning recovery | Immediate | Optional | Off |
| Routine catalog change | Immediate | Digest | Off |
| Catalog change blocking a purchasing task | Immediate | Immediate | Off |
| Production/freight exception | Immediate | Immediate | Optional after phase 7 |

Suppress self-notifications and stale reminders. Recheck preferences and outstanding state before delayed delivery.
Workspace settings cannot opt someone into SMS, and selecting a recipient never grants record or price access.
