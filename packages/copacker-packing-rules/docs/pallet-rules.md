# Pallet rules

Where pallets go decides what they may be: their footprint, height and weight, and how they're built.
`@repo/copacker-packing-rules/pallet-policies` keeps those rules as data, as [carton rules](carton-rules.md) does for
cartons, so the pallet editor, readiness checks and the supplier's checklist state the same limits.

## How it works

- **A rule** is one typed entry with its `description` and `source`, such as
  `{ type: "maxHeight", height: 72, stackable: 50, unit: "in", description, source }`. Limits are kept in the units the
  receiver states them in. Sizes convert to a tenth of a centimetre (48 in is 121.9 cm); a weight is shown in whole
  kilograms (1,500 lb is 680 kg) but checked against the exact conversion, so 680.38 kg passes and 681 kg doesn't.
- **A policy** is a receiver's name and its rules (`palletPolicies`, one per Amazon network today).
- **`checkPallet`** runs the rules the editor can measure against one pallet. Sides not entered yet are `NaN` and break
  nothing.
- **`checkPallets`** (in the package root) picks each pallet's policy from where its cartons go: AWD's when any go
  there, otherwise FBA's. Pallets to the buyer's own warehouse, and pallets with no cartons yet, aren't checked.
  `validatePacking` runs it, with `validatePallets`, when the cartons are packed on pallets.

| Rule type      | What it checks or asks for                                                    | Issue code                        |
| -------------- | ----------------------------------------------------------------------------- | --------------------------------- |
| `footprint`    | The load fits the pallet either way round, longer side against the longer limit | `palletFootprint`               |
| `maxHeight`    | Height with the pallet; a stackable pallet against `stackable`                | `palletHeight`, `stackableHeight` |
| `maxWeight`    | Gross weight with the pallet                                                  | `palletWeight`                    |
| `stacking`     | Checklist only: cartons flush and stable, heaviest at the bottom, labels out  |                                   |
| `stretchWrap`  | Checklist only: clear stretch wrap, marked for the carrier not to break it    |                                   |
| `palletLabels` | Checklist only: one of the four pallet labels on each side                    |                                   |

Rules nothing measures still belong in the policy: the supplier's checklist states each one
(`palletPolicyChecks` in `@repo/copacker-shipments/shipping-rules`), and a rule type without a checklist line
fails type checks.

The rules every pallet follows wherever it goes are `validatePallets`': each carton on exactly one pallet, every pallet
holding cartons of this shipment, and a unique number for each (`noPallets`, `emptyPallet`, `duplicatePallet`,
`unknownPalletCarton`, `palletCartonTwice`, `cartonsOffPallets`). A pallet to Amazon also goes to one network, so
`checkPallets` refuses one holding both FBA and AWD cartons (`palletMixedNetworks`), as `validatePacking` refuses a
carton mixing their products (`mixedNetworks`). Booking splits a shipment's cartons and pallets by network
(`splitByNetwork` in `@repo/copacker-shipments`), and a mixed pallet would go to both networks at its full size and weight.

### Adding a receiver or a rule

- **A receiver**, such as a 3PL or AWD's West Coast palletizable region (40 × 48 in pallets up to 60 in and under
  1,450 lb, one SKU a pallet): add a policy, each rule with its description and source, and resolve pallets to it in
  `palletPolicy` (in `index.ts`).
- **A new kind of rule**: add its type to `PalletRule`, its case to `checkPallet` (an empty list if nothing measures
  it), its issue to `PalletRuleIssue` and its code to `palletRuleCodes`, then its messages in every locale and its
  checklist line. Type checks point to each place, including the Storybook simulators.

## Amazon's US rules

Checked against Amazon's Seller Central help on October 20, 2026, and AWD's pallet labels on October 23, 2026. FBA and
AWD share them.

| Rule                     | Limit                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------- |
| Footprint (`footprint`)  | 48 × 40 in (121.9 × 101.6 cm) wooden pallets with four-way entry, GMA grade B or better |
| Stacking (`stacking`)    | Cartons flush and stable, heaviest at the bottom, labels facing out, nothing overhanging |
| Height (`maxHeight`)     | 72 in (182.9 cm) with the pallet; 50 in (127 cm) for a pallet another may stand on      |
| Weight (`maxWeight`)     | 1,500 lb (680 kg) with the pallet                                                       |
| Wrap (`stretchWrap`)     | Clear stretch wrap, marked “Do not break stretch wrap”                                  |
| Labels (`palletLabels`)  | One of each pallet's four labels on each side, top center, outside the wrap             |

- [Seller requirements for LTL, FTL and FCL deliveries](https://sellercentral.amazon.com/help/hub/reference/external/G200978400):
  the pallet, stacking, height, weight and wrap rules, and the four pallet labels. Every pallet rule links here.
- [AWD shipping requirements](https://sellercentral.amazon.com/help/hub/reference/external/GVEPW8A7PZ3YGPJE): sends
  AWD sellers to the same LTL and FTL rules, asks for four AWD pallet labels on each pallet, one on each side, and
  describes the West Coast palletizable region, which copacker doesn't model yet. AWD's `palletLabels` rule links here.
- AWD's pallet labels come from Seller Central: Amazon's AWD API issues box labels only. The buyer will upload them to
  the shipment, which isn't built yet, so for now the supplier's checklist asks for them and the packet doesn't carry
  them.
- [Shipping and routing requirements](https://sellercentral.amazon.com/help/hub/reference/external/G200141510): FBA's
  carton rules, which every carton on a pallet still follows, each keeping its own label.
