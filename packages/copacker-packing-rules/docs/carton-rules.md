# Carton rules

Where cartons go decides what they may be: their size and weight, how many units of a product they hold, and whether
they may mix products. `@repo/copacker-packing-rules/carton-policies` keeps those rules as data, so Copacker checks every receiver's
cartons the same way and every message, checklist and requirement states the same limits.

## How it works

- **A rule** is one typed entry, such as `{ type: "maxSize", sides: [36, 25, 25], unit: "in", description, source }`.
  Its `description` states the rule as the receiver does, so a policy reads as its own documentation, and `source` is
  the page where the receiver states it: each issue carries it, and the editor's error links to it. A test fails when
  a limit changes and its description doesn't say so. Limits are kept in
  the units the receiver states them in and converted where they're shown. A converted weight is rounded down to the
  hundredth, so the limit shown is one a carton can meet, and cartons are checked against it: 50 lb is 22.6796185 kg,
  shown and checked as 22.67 kg, because 22.68 kg is over 50 lb. Sizes convert exactly (36 in is 91.44 cm).
- **A policy** is a receiver's name and its list of rules (`cartonPolicies`, one per Amazon network today).
- **`checkCarton`** runs each of a policy's rules against one carton, with the cartons checked before it under the same
  policy for rules across cartons. Each rule type has one case there, and TypeScript requires a case for every type.
- **`validatePacking`** (in `@repo/copacker-packing-rules`) picks each carton's policy from where it goes, then adds the rules that hold
  everywhere: unique carton numbers, one network per carton, products on the PO, complete multi-packs and quantities
  within the PO. `packingRuleDescriptions` describes each of those, and a new code fails type checks until it has one.

| Rule type     | What it checks                                                                 | Issue code         |
| ------------- | ------------------------------------------------------------------------------ | ------------------ |
| `maxSize`     | The carton fits the largest size in any orientation (sides sorted, compared)   | `cartonSize`       |
| `maxWeight`   | The packed carton's weight                                                     | `cartonWeight`     |
| `maxUnits`    | Sellable units of one product in a carton                                      | `unitsPerCarton`   |
| `oneSku`      | A carton holds one product                                                     | `oneSku`           |
| `samePacking` | Every carton of a SKU has the same units, size and weight as its first carton  | `samePacking`      |
| `asin`        | Every product has its ASIN                                                     | `missingAsin`      |
| `fnsku`       | Every product has its FNSKU                                                    | `missingFnsku`     |

`maxSize` and `maxWeight` take `exceptOneUnit`: a carton holding one sellable unit may be larger or heavier. Each issue
carries the values its message names (the receiver, the limit in both units, the SKU), and the app writes every message
from them: the carton editor (`orders.cartonEditor.rules`), readiness checks (`server.readiness.packing`), PO
requirements (`shipments.requirements`) and the supplier's checklist (`shippingCopy`).

### Adding a receiver or a rule

- **A receiver with existing kinds of rules**, such as GWD or a 3PL: add a policy, each rule with its description
  and source, and resolve cartons to it in `cartonPolicy` (in `index.ts`). No other code changes. A policy is plain data, so a 3PL's rules could later be saved
  per account.
- **A new kind of rule**: add its type to `CartonRule`, its case to `checkCarton` and its issue to `CartonRuleIssue`,
  then its message in every locale and its checklist line in `apps/copacker/src/documents/shipping-rules.ts`. Type
  checks point to each place.

## Amazon's US rules

Checked against Amazon's Seller Central help on October 19, 2026. Recheck them before changing a limit: product and
carrier rules can be stricter, and Amazon changes these pages without notice.

### FBA (`cartonPolicies.fba`)

Copacker sends every FBA carton as individual units (see [case packs](../../../apps/copacker/docs/amazon-case-packs.md)),
so cartons may mix SKUs and hold any number of units.

| Rule                                | Limit                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------- |
| Size (`maxSize`, `exceptOneUnit`)   | 36 × 25 × 25 in (91.44 × 63.5 × 63.5 cm), unless one unit is larger    |
| Weight (`maxWeight`, `exceptOneUnit`) | 50 lb (22.67 kg), unless one unit is heavier                         |
| ASIN (`asin`)                       | Every product has its ASIN                                             |
| FNSKU (`fnsku`)                     | Every product has its FNSKU                                            |

- [Shipping and routing requirements](https://sellercentral.amazon.com/help/hub/reference/external/200141510?locale=en-US):
  a box may be up to 36 in long, 25 in wide and 25 in high, and weigh up to 50 lb. Only a box holding one oversize unit
  may be larger, and only a single item over 50 lb may make it heavier. Copacker used to hold FBA cartons to 25 in on
  every side, as older guides still do.
- Not checked: boxes of jewelry or watches are limited to 40 lb, and a box over 50 lb needs Team Lift labels. Amazon's
  packing options also put some SKUs in separate packing groups, which the FBA booking job handles
  ([Amazon inbound](../../../apps/copacker/docs/amazon-inbound.md)).

### AWD US (`cartonPolicies.awd_us`)

AWD only takes case packs: it has no individual-units packing.

| Rule                       | Limit                                                                    |
| -------------------------- | ------------------------------------------------------------------------ |
| One SKU (`oneSku`)         | Each box holds one SKU                                                   |
| Units (`maxUnits`)         | 150 sellable units per box                                               |
| Same packing (`samePacking`) | One packing template per SKU in a shipment: same units, size and weight |
| Size (`maxSize`)           | 25 in (63.5 cm) on every side, with no single-unit exception             |
| Weight (`maxWeight`)       | 50 lb (22.67 kg), with no single-unit exception                          |
| ASIN (`asin`)              | Every product has its ASIN                                               |
| FNSKU (`fnsku`)            | Every product has its FNSKU                                              |

- [AWD shipping requirements](https://sellercentral.amazon.com/help/hub/reference/GVEPW8A7PZ3YGPJE?locale=en-US):
  boxes may be at most 25 in on any side and 50 lb.
- [Send shipments to AWD: Choose inventory to send](https://sellercentral.amazon.com/help/hub/reference/GZLL7RYU2FJRN9BU?locale=en-US):
  each box holds at most 150 units of one SKU, mixed-SKU boxes aren't allowed, and each SKU uses exactly one packing
  template in a shipment. A shipment holds at most 150 SKUs, as many as a PO.
- [AWD inbound process guide (PDF)](https://m.media-amazon.com/images/G/01/awd-files/inbound/AWD_Inbound_Process.pdf):
  the same size, weight and one-SKU rules.
- An Amazon reply on the seller forums
  ([stranded AWD inventory](https://sellercentral.amazon.com/seller-forums/discussions/t/34197638-01f4-4446-bea1-bd2c05ea71d7))
  explains why the 150-unit cap matters: AWD moves whole cartons to FBA, and FBA refuses case packs over 150 units, so
  a larger carton was accepted into AWD and then couldn't leave.

### Sellable units

Limits count sellable units: what a customer buys. A six-piece retail pack sold as one listing is one unit, not six.
Copacker counts a line's `pieces / piecesPerSet`.
