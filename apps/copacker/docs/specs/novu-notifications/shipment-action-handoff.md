# Shipment action notification contract

Status: proposed canonical Novu identifiers and actor feedback, reviewed 2026-10-18 against
`shipment-packet-polish/apps/copacker/src/stories/shipment-state-map.tsx` and its current server actions. These identifiers
are implementation targets, not deployed Novu workflows. The [migration inventory](migration-inventory.md) remains the
source for existing email delivery. Storybook's required state map includes behavior not yet implemented by its server.

## Action mapping

Email defaults below apply to eligible recipients with the corresponding preference enabled. In-app delivery is on
for these events by default; SMS is off. Exclude the acting user. Actor toasts acknowledge a successful committed action,
not email delivery. The names in the Template column are the canonical planned families from
[templates and settings](templates-and-settings.md); existing renderer exports are identified explicitly.

| Committed action | Canonical event/workflow ID | Template family | Recipients | Email default | Actor success toast | Implementation status |
| --- | --- | --- | --- | --- | --- | --- |
| Submit packing or resubmit corrections | `shipment-packing-submitted` | Action required, packing-review variant | Buyer users authorized to review the shipment; price-aware content only for authorized approvers | Immediate when review is required; otherwise optional | Packing submitted. | Submission exists; Novu notification is new. Emit once per accepted packing revision, not on draft save. |
| Approve invoice | `shipment-invoice-approved` | Order change decision, invoice-approved variant | Responsible supplier users | Immediate | Invoice approved. | Approval exists; standalone decision notification is new. Preserve existing revised-PO email when approval creates a PO revision. |
| Request packing changes | `shipment-correction-requested` | Action required, packing-correction variant | Responsible supplier users | Immediate | Changes requested. | Correction action exists; delivery is new. Include reason and superseded packing revision. |
| Labels sent to supplier | `shipment-documents-released` | Labels ready, existing `labelsReadyEmail` | Existing parity: saved email of joined supplier; planned in-app routing to responsible authorized supplier users | Immediate | Carrier labels sent to the supplier. | `sendLabelsWhenComplete` queues `ready` once the packet is complete, with no buyer step; migrate it. No packet attachment today; link opens shipment. |
| Supplier confirms dispatch | `shipment-supplier-dispatched` | Shipment update, supplier-dispatched variant | Buyer and assigned forwarder when this leg goes to that forwarder | Optional for buyer; immediate for forwarder responsible for receiving the inbound leg | Dispatch confirmed. | `shipShipment` records `supplierShipped`; delivery is new. This is not a confirmed physical pickup or destination receipt. |
| Supplier or authorized carrier confirms physical pickup | `shipment-pickup-confirmed` | Pickup, pickup-confirmed variant | Buyer and assigned forwarder; supplier contacts other than actor where applicable | Immediate | Pickup confirmed. | Missing authoritative pickup-specific action/evidence. Do not emit merely because status becomes `shipped` or the button says Confirm pickup. |
| Forwarder confirms receipt at its facility | `shipment-forwarder-received` | Shipment update, forwarder-received variant | Buyer and responsible supplier users | Immediate | Receipt at forwarder confirmed. | Missing receipt action/state in reviewed server; Storybook proposes `at_forwarder`. Requires actual received quantities/discrepancy evidence. |
| Forwarder confirms onward dispatch | `shipment-forwarder-dispatched` | Shipment update, forwarder-dispatched variant | Buyer; supplier users may subscribe | Immediate for buyer; optional for supplier | Onward dispatch confirmed. | `forwardShipment` exists and records `forwarderShipped`; new notification. Current gate is `shipped`, not Storybook's proposed `at_forwarder` plus onward release. |
| Buyer confirms destination receipt | `shipment-destination-received` | Shipment update, destination-received variant | Responsible supplier and assigned forwarder users | Immediate | Receipt at destination confirmed. | `receiveShipment` exists; delivery is new. Current evidence is buyer confirmation, not independently verified carrier or Amazon receipt. |

For an unjoined supplier, explicit release retains the existing manual-share behavior: actor toast
"Documents ready to share." Do not claim the supplier was notified. For every row, a toast appears only after the
server confirms success; a failed action shows its actionable error and produces neither success toast nor notification.
Saving a draft may say "Draft saved." but sends no notification. Downloads send no notification. System processing
has persistent status feedback rather than a toast falsely attributed to a user action.

## Trigger distinctions and missing contracts

- **Invoice approval and packet release are separate facts.** Non-Amazon paths may currently reach `ready` during
  approval without passing through `sendLabelsWhenComplete`. Do not infer a release email from `ready`. Before enabling that
  route's packet notification, define a committed explicit release event and its document/transport gates.
- **One approval must not produce redundant emails.** Existing approval that changes PO terms sends
  `purchase-order-revised` with `purchaseOrderEmail` and its revision PDF. Carry invoice approval in that message or
  suppress the standalone invoice-approved email for the same recipient/decision. Keep distinct domain facts for audit.
- **Packing review requirements differ from the draft Storybook map.** The map requires explicit approval after every
  submission; existing packing code has conditional paths. Emit action-required copy only when the committed state
  actually requires review. Implement mandatory approval before documenting it as universal current behavior.
- **Dispatch is not pickup.** A pickup-specific action must capture who confirmed physical handover, occurrence time,
  leg and evidence/source. Changing the visible action label or selecting a pickup transport profile is insufficient.
  A physical pickup may advance the shipment to `shipped`, but should not also send a duplicate dispatch email.
- **Forwarder receipt is not destination receipt.** Add `at_forwarder`, received quantities and discrepancy state before
  emitting `shipment-forwarder-received`. Never resolve a destination-receipt task on forwarder arrival.
- **Onward release is a missing contract.** If the buyer must release goods from the forwarder, add a separate committed
  action and `shipment-onward-release-approved` event (Action required template, immediate email/in-app to responsible
  forwarder users; buyer toast "Onward shipment released."). Do not reuse the supplier packet-release event.
- **Discrepancies need their own action-required event.** Proposed `shipment-receipt-discrepancy-reported` uses Logistics
  exception, immediate email/in-app to buyer and responsible origin party. Do not hide unresolved shortages in a normal
  receipt email or permit onward dispatch contrary to the agreed gate.

## Payload and delivery requirements

Every event carries immutable event ID, workspace relationships, actor, order/shipment IDs, leg, revision, occurrence
time and evidence source where applicable. Include correction reason, current authorized action link and relevant
quantities only when allowed. Deduplicate per event, recipient and workflow. Do not send stale corrections/releases
after a newer revision supersedes them. Recheck current partner membership, record access and preferences at delivery.

Forwarders receive only notifications about their assigned legs. Existing contact-only email eligibility must be
explicitly expanded before member-based routing is presented as live behavior. Invoice/pricing copy respects price
permissions. Links reauthorize access; toasts must never say "Email sent" when only a job was queued.

## Documentation and implementation checklist

- [ ] Use these canonical identifiers in the event registry, Storybook action rows and workflow configuration.
- [ ] Add typed template variants and translated actor-toast copy; do not hardcode English in runtime UI.
- [ ] Mark existing action/new notification separately from missing business action in Storybook documentation.
- [ ] Resolve non-Amazon release and mandatory invoice-approval contracts before treating them as universal behavior.
- [ ] Add pickup confirmation, forwarder receipt, onward release and discrepancy contracts before publishing their events.
- [ ] Test approval/revised-PO suppression and pickup/dispatch suppression to avoid duplicate emails.
- [ ] Verify success/error actor feedback separately from background delivery acceptance and provider delivery.
- [ ] Send all authorized test email only to `andrew@fencing.club`, never Chen. No email is sent by this documentation task.
