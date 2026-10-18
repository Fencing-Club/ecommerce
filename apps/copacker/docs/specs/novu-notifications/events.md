# Concrete notification catalog

Part of the [Novu implementation spec](README.md). This is the planned event inventory, not a list of already active
Novu workflows. Channel defaults and template ownership are in [templates and settings](templates-and-settings.md).

Support labels:

- **Existing:** the business action/state exists; add transactional notification publication and delivery.
- **Derived:** underlying data exists; build comparison, scheduling, alert lifecycle or recipient-impact logic.
- **New:** build the underlying business action/state before sending this notification.

Each row is one concrete notification. A single event may notify multiple authorized parties. Never notify unrelated
workspaces, infer a milestone from a reference string, or emit a business change for an uncommitted draft save.

## Orders and supplier communication

| Notification | Recipient | Support | Phase and dependency |
| --- | --- | --- | --- |
| Supplier invitation received | Supplier contact | Existing | 2: migrate invitation email. |
| Forwarder invitation received | Forwarder contact | Existing | 2: migrate invitation email. |
| Workspace team invitation received | Invited team member | Existing | 2: migrate invitation, resend and cancellation. |
| Customer data request report available | Affected workspace owner | Existing | 2: migrate Shopify compliance report with owner-only scope. |
| New PO sent | Supplier | Existing | 2: `submitOrder`. |
| Supplier proposes price changes | Buyer | Existing | 2: saved proposal price differences. |
| Supplier proposes quantity changes | Buyer | Existing | 2: saved proposal quantity differences. |
| Supplier proposes product addition | Buyer | Existing | 2: added proposal lines. |
| Supplier proposes product removal | Buyer | Existing | 2: removed proposal lines. |
| Supplier proposes payment-term changes | Buyer | Existing | 2: proposal payment terms. |
| Supplier changes ready date | Buyer | Existing | 2: immediately committed date-only change. |
| Supplier removes ready date | Buyer | Existing | 2: date-cleared event. |
| Supplier withdraws proposal | Buyer | Existing | 2: proposal withdrawal. |
| Buyer approves price changes | Supplier | Existing | 2: approved proposal differences. |
| Buyer rejects price changes | Supplier | Existing | 2: declined proposal and reason. |
| Buyer approves quantity changes | Supplier | Existing | 2: approved proposal differences. |
| Buyer rejects quantity changes | Supplier | Existing | 2: declined proposal differences. |
| Buyer approves product addition | Supplier | Existing | 2: approved added lines. |
| Buyer rejects product addition | Supplier | Existing | 2: declined added lines. |
| Buyer approves product removal | Supplier | Existing | 2: approved removed lines. |
| Buyer rejects product removal | Supplier | Existing | 2: declined removed lines. |
| Buyer approves payment terms | Supplier | Existing | 2: proposal decision. |
| Buyer rejects payment terms | Supplier | Existing | 2: proposal decision. |
| Supplier uploads commercial invoice | Buyer | Existing | 2: successful committed upload. |
| Buyer comments on order | Relevant supplier/forwarder users | Existing | 2: `addComment` and subscriptions. |
| Supplier comments on order | Relevant buyer users | Existing | 2: actor-specific comment routing. |
| Forwarder comments on order | Relevant buyer/supplier users | Existing | 2: authorized participant routing. |
| Supplier accepts PO | Buyer | New | 5: acceptance state/action. |
| Supplier declines PO | Buyer | New | 5: decline state and reason. |
| Supplier starts production | Buyer | New | 5: production milestone. |
| Supplier reports production delay | Buyer | New | 5: reason and revised date. |
| Supplier cannot supply an item | Buyer | New | 5: shortage/substitution workflow. |
| Buyer changes sent-PO quantities | Supplier | New | 5: buyer-originated amendment. |
| Buyer changes requested ready date | Supplier | New | 5: buyer-requested date amendment. |
| Buyer changes production instructions | Supplier | New | 5: published instruction amendment. |
| Buyer requests PO cancellation | Supplier | New | 5: cancellation request/decision. |
| Buyer requests production update | Supplier | New | 5: tracked request. |
| Buyer requests invoice | Supplier | New | 5: document request. |
| Buyer requests packing list | Supplier | New | 5: document request. |
| Supplier requests information | Buyer | New | 5: tracked information request. |
| Buyer answers information request | Supplier/forwarder requester | New | 5/6: linked response. |
| Supplier answers information request | Buyer/forwarder requester | New | 5/6: linked response. |

Proposal decisions apply to the entire proposal. Separate field-level notification types may be rendered in one
message. Date-only changes do not require approval today; separate date acceptance/rejection is new product behavior,
not an existing notification hook. A date embedded in a commercial proposal follows its decision.

## Shipments and freight

| Notification | Recipient | Support | Phase and dependency |
| --- | --- | --- | --- |
| Packing submitted | Buyer | Existing | 2: successful packing submission. |
| Commercial changes require approval | Buyer | Existing | 2: shipment enters approval. |
| Shipping labels required | Buyer | Existing | 2: enters waiting-labels state. |
| Shipment documents ready | Supplier | Existing | 2: existing release/email path. |
| Packing correction requested | Supplier | Existing | 2: `correctShipment` and reason. |
| Supplier marks goods shipped | Buyer | Existing | 2: `shipShipment`. |
| Supplier ships toward forwarder | Assigned forwarder | Existing | 2: shipped event on a routed order. |
| Forwarder marks goods forwarded | Buyer | Existing | 2: `forwardShipment`, carrier/reference. |
| Buyer confirms shipment receipt | Supplier | Existing | 2: `receiveShipment`. |
| Buyer confirms shipment receipt | Assigned forwarder | Existing | 2: same receipt event. |
| Packing list becomes available | Buyer/assigned forwarder | Existing | 2: current generated document stored. |
| Ready date changes on routed order | Assigned forwarder | Existing | 2: committed date change. |
| Sent order names forwarder | Forwarder | Derived | 2: route announcement, not acceptance. |
| Shipment processing needs attention | Responsible buyer users | Existing | 2: state transition, not every retry. |
| Supplier confirms physically ready for pickup | Buyer/assigned forwarder | New | 5: physical readiness action. |
| Forwarder accepts assignment | Buyer | New | 6: assignment acceptance. |
| Forwarder declines assignment | Buyer | New | 6: assignment decline. |
| Buyer removes/replaces forwarder | Affected forwarder | New | 6: reassignment and access revocation. |
| Buyer requests freight quote | Forwarder | New | 6: quote request. |
| Forwarder submits freight quote | Buyer | New | 6: quote submission. |
| Buyer approves freight quote | Forwarder | New | 6: quote approval. |
| Buyer rejects freight quote | Forwarder | New | 6: quote rejection. |
| Buyer requests booking | Forwarder | New | 6: booking request. |
| Forwarder confirms booking | Buyer | New | 6: booking confirmation. |
| Forwarder schedules pickup | Buyer/supplier | New | 6: pickup appointment. |
| Forwarder reschedules pickup | Buyer/supplier | New | 6: previous/new appointment. |
| Forwarder cancels pickup | Buyer/supplier | New | 6: cancellation and reason. |
| Forwarder reports failed pickup | Buyer/supplier | New | 6: pickup exception. |
| Forwarder confirms collection | Buyer/supplier | New | 6: collection confirmation. |
| Forwarder confirms departure | Buyer | New | 6: departure milestone. |
| Forwarder changes ETA | Buyer | New | 6: ETA history and material-change policy. |
| Forwarder reports transit delay | Buyer | New | 6: transit exception. |
| Forwarder reports customs hold | Buyer | New | 6: customs status/action. |
| Forwarder confirms customs clearance | Buyer | New | 6: customs clearance. |
| Forwarder confirms port arrival | Buyer | New | 6: destination-port milestone. |
| Forwarder schedules final delivery | Buyer | New | 6: delivery appointment. |
| Forwarder confirms delivery | Buyer | New | 6: independent delivery confirmation. |
| Forwarder uploads proof of delivery | Buyer | New | 6: supported document type/upload. |
| Forwarder reports damage | Buyer | New | 6: damage report and evidence. |
| Forwarder reports missing cargo | Buyer | New | 6: shortage report and quantities. |
| Buyer changes sent-shipment destination | Forwarder | New | 6: shipment amendment. |
| Buyer changes delivery instructions | Forwarder | New | 6: published instruction change. |
| Buyer changes requested delivery date | Forwarder | New | 6: delivery-date amendment. |
| Buyer adds cargo to booked shipment | Forwarder | New | 6: booking-aware amendment. |
| Buyer removes cargo from booked shipment | Forwarder | New | 6: booking-aware amendment. |
| Supplier changes submitted cargo quantity | Forwarder | Derived | 2: compare committed packing revisions. |
| Supplier changes submitted cargo dimensions | Forwarder | Derived | 2: compare committed packing revisions. |
| Supplier changes submitted cargo weight | Forwarder | Derived | 2: compare committed packing revisions. |
| Supplier changes pickup address | Forwarder | Derived | 2: compare committed packing revisions. |
| Forwarder requests cargo dimensions | Supplier | New | 6: tracked information request. |
| Forwarder requests cargo weight | Supplier | New | 6: tracked information request. |
| Forwarder requests shipping document | Buyer/supplier | New | 6: typed document request. |
| Forwarder requests delivery instructions | Buyer | New | 6: tracked request. |
| Buyer supplies requested document | Forwarder | New | 6: upload linked to request. |
| Supplier supplies requested document | Forwarder | New | 6: upload linked to request. |
| Buyer requests shipment cancellation | Forwarder | New | 6: commercial cancellation workflow. |

A generated packing list is available today; a supplier-uploaded packing list is not the same operation and needs
upload support. Invoice availability can be routed to an assigned forwarder only under the existing document access
rules. Saved addresses or references alone do not represent physical shipment events.

## Connected accounts

These notifications concern external store/service connections, not signing out of Copacker or deleting a user account.
Apply them to supported integrations such as Shopify, Amazon, eBay and Amazon Ads. Provider detection differs; confirm
each integration's authoritative signals rather than assuming every provider exposes the same events.

| Notification | Recipient | Support | Phase and dependency |
| --- | --- | --- | --- |
| Account disconnected by a workspace member | Other workspace owners/admins | Existing | 2: publish from explicit disconnect; capture actor/account before removal. |
| Provider revokes account access | Workspace owners/admins | Derived | 2: normalize confirmed revocation into a connection incident. |
| Provider app uninstalled | Workspace owners/admins | Derived | 2: validated uninstall/disconnect event; respect reinstall races. |
| Authorization expires and reconnection is required | Workspace owners/admins | Derived | 2: confirmed refresh/authorization failure requiring user action. |
| Required account permissions are missing | Workspace owners/admins | Derived | 2: confirmed scope/permission failure and affected capabilities. |
| Connection problem remains unresolved | Responsible admins | New | 2: incident state, reminder interval and scheduled recheck. |
| Account successfully reconnects | Previously alerted admins who remain authorized | Derived | 2: successful authorization and validation resolve the incident. |

Default: immediate in-app and email for disconnection or action required; email for unresolved reminders; in-app and
optional email for restoration. SMS is off. Each alert names the provider and account, the known cause, affected syncs
or features, and an authorized Settings link. Never expose credentials, raw provider errors or OAuth tokens.

Maintain one incident per workspace and logical connected account, with reason transitions and deduplication across
stock, sales and other workers. Repeated failed syncs must not repeat the initial warning. An expiring short-lived access
token that refreshes normally is not a disconnection. Timeouts, rate limits and provider outages are separate transient
failures, not proof that authorization has been revoked. Use neutral reconnect-required copy when the cause is unknown.

An intentional disconnect informs other admins but does not start reconnect reminders. Stop reminders on successful
reconnection, deliberate removal, workspace deletion or loss of recipient access. Persist minimal incident identity
across connection-row replacement so reconnecting the same account resolves the original warning. Do not claim data
sync has caught up merely because authorization is restored. Do not fan out account-deletion cleanup as disconnect alerts.

## Inventory and reminders

| Notification | Recipient | Support | Phase and dependency |
| --- | --- | --- | --- |
| Stock below warning threshold | Buyer | Derived | 3: thresholds and persistent alert state. |
| Reorder threshold crossed | Buyer | Derived | 3: transition into reorder need. |
| Stockout risk within replenishment lead time | Buyer | Derived | 3: days remaining/lead time. |
| Available stock reaches zero | Buyer | Derived | 3: distinct zero-stock transition. |
| Stock warning clears | Buyer | Derived | 3: recovery of active alert. |
| Supplier stock below warning threshold | Supplier | Derived | 3: supplier threshold/state. |
| Supplier stock insufficient for commitments | Supplier | Derived | 3: on-hand versus commitments. |
| Supplier commitment shortage clears | Supplier | Derived | 3: recovery transition. |
| PO acceptance overdue | Supplier | New | 5: acceptance deadline. |
| Production update overdue | Supplier | New | 5: outstanding request/deadline. |
| Goods-ready date passes without confirmation | Supplier | New | 5: physical readiness state. |
| Forwarder acceptance overdue | Forwarder | New | 6: assignment deadline. |
| Freight quote deadline approaches | Forwarder | New | 6: quote deadline. |
| Pickup overdue | Forwarder | New | 6: scheduled/completed pickup. |
| Document deadline approaches | Responsible user | New | 5/6: request and deadline. |
| Shipment update overdue | Forwarder | New | 6: cadence and qualifying update. |
| Shipment exception unresolved past deadline | Responsible user | New | 6: owner, resolution and escalation. |

## Supplier catalog impact on buyers

Every row below targets affected buyer users only. Effective changes must account for catalog assignment, overrides,
price tiers, currency, price basis, inventory policy and assortment visibility. Supplier draft edits without effective
buyer impact produce no notification.

| Notification | Support | Phase and trigger |
| --- | --- | --- |
| Effective price increased | Derived | 4: applicable price rises. |
| Effective price decreased | Derived | 4: applicable price falls. |
| Volume-price tiers changed | Derived | 4: applicable breaks/tier prices change. |
| Minimum quantity changed | Derived | 4: effective minimum changes. |
| Maximum quantity changed | Derived | 4: effective maximum changes. |
| Quantity increment changed | Derived | 4: required order multiple changes. |
| Pricing basis changed | Derived | 4: piece, pack or case basis changes. |
| Currency changed | Derived | 4: currency changes, not a percentage comparison. |
| Units per sellable pack changed | Derived | 4: packaging changes. |
| Packs per case changed | Derived | 4: case configuration changes. |
| Supplier SKU changed | Derived | 4: previously matched variant changes SKU. |
| Purchased product archived | Derived | 4: applicable product becomes inactive. |
| Purchased product restored | Derived | 4: applicable product becomes active. |
| Product removed from available assortment | Derived | 4: effective product access is lost. |
| New product available | Derived | 4: effective assortment expands. |
| Catalog assignment changed | Derived | 4: buyer moves to different catalog. |
| Assigned catalog deactivated | Derived | 4: status changes effective terms. |
| Assigned catalog deleted | Derived | 4: deletion changes effective terms. |
| Assigned catalog activated | Derived | 4: activation changes effective terms. |
| Watched product unavailable to order | Derived | 4: stock/policy transition plus new subscriptions. |
| Watched product available again | Derived | 4: ordering availability recovers. |
| Future price change announced | New | Follow-up: scheduled prices/effective dates. |
| Advance discontinuation announced | New | Follow-up: discontinuation date/replacement. |

Do not imply catalog deactivation always removes access: current behavior falls back to base assortment/prices when
there is no active catalog. Existing PO snapshots remain unchanged. Email summaries can combine many concrete events
from one bulk change while keeping their event types and personal preferences distinct.
