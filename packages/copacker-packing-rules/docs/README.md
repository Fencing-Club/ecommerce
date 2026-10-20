# Copacker packing rules

`@repo/copacker-packing-rules` decides what cartons and pallets may be, by where they go. Each receiver's rules are
data, so the carton and pallet editors, readiness checks, the supplier's checklist and any CLI check packing the same
way, and another receiver (GWD, a 3PL, a special arrangement) is a new policy rather than new code.

- `carton-policies`: each receiver's carton rules (`cartonPolicies`) and `checkCarton`. See [carton rules](carton-rules.md).
- `pallet-policies`: each receiver's pallet rules (`palletPolicies`) and `checkPallet`. See [pallet rules](pallet-rules.md).
- The package root: `validatePacking`, `validatePallets` and `checkPallets`, the issues they report
  (`ValidationIssue`, `PackingRule`), what each rule that holds everywhere asks for (`packingRuleDescriptions`),
  Amazon's networks, and the carton ID runs packing lists print (`cartonList`).

Every rule describes itself (`description`) and names the page that states it (`source`), and each issue carries the
source, so an error can link to the receiver's own rule. The package reads purchase orders and packings by the few
fields it needs (`PackingOrder`, `PackingInput`) and depends on no other package; `@repo/aisle` uses it to check a
packing before building Amazon's inbound plans.

Copacker's Storybook runs the real rules on sample data in its Simulators section: every error each rule produces, and
an editable carton and pallet table (see [Storybook](../../../apps/copacker/docs/storybook.md#simulators)).
