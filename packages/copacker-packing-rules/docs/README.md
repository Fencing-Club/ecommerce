# Copacker packing rules

`@repo/copacker-packing-rules` decides what cartons and pallets may be, by where they go. Each receiver's rules are
data, so the carton and pallet editors, readiness checks, the supplier's checklist and any CLI check packing the same
way, and another receiver (GWD, a 3PL, a special arrangement) is a new policy rather than new code.

- `carton-policies`: each receiver's carton rules (`cartonPolicies`) and `checkCarton`. See [carton rules](carton-rules.md).
- `pallet-policies`: each receiver's pallet rules (`palletPolicies`) and `checkPallet`. See [pallet rules](pallet-rules.md).
- `receivers`: where a PO line's goods end up (see [Receivers](#receivers)).
- The package root: `validatePacking`, `validatePallets` and `checkPallets`, the issues they report
  (`ValidationIssue`, `PackingRule`), what each rule that holds everywhere asks for (`packingRuleDescriptions`),
  the receivers, the carton ID runs packing lists print (`cartonList`, `cartonRuns`) and read back (`readCartonIds`),
  and the inch and pound conversion factors (`centimetresPerInch`, `kilogramsPerPound`).

Every rule describes itself (`description`) and names the page that states it (`source`), and each issue carries the
source, so an error can link to the receiver's own rule. The package reads purchase orders and packings by the few
fields it needs (`PackingOrder`, `PackingInput`) and depends on no other package; `@repo/copacker-shipments` uses it to check a
packing before building Amazon's inbound plans.

## Receivers

A receiver is where a PO line's goods end up: `fba`, `awd_us` or `warehouse` (the buyer's own location). Each PO line
names one (`receiver`), and each receiver in `receivers` has a name, a group and, when it has rules of its own, its
carton and pallet policies. Lines of one group can share a PO: FBA and AWD are both `amazon`. `orderDestination` reads
a PO's group from its lines, and `receiverFor` picks a new line's receiver in a group, keeping the product's own when it
is there.

A carton or pallet goes to one receiver. One that mixes them is an issue, and follows the strictest of their policies:
the receivers are listed from the most lenient to the strictest. A receiver without policies, such as the buyer's own
location, takes any carton or pallet.

Adding a receiver, such as ShipBob or Shopify's fulfillment network, is an entry in `receivers` with its group and
policies. A rule its policies need that no other receiver has is a new rule type in `carton-policies` or
`pallet-policies`. Booking a receiver's shipments is the app's: copacker books FBA and AWD with Amazon. A freight
forwarder is never a receiver; it is a stop on the way (`via`).

Copacker's Storybook runs the real rules on sample data in its Simulators section: every error each rule produces, and
an editable carton and pallet table (see [Storybook](../../../apps/copacker/docs/storybook.md#simulators)).
