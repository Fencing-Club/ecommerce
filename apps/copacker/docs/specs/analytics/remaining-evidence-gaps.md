# Remaining evidence gaps

Scope: analytics reconciliation using saved records. This is not the app-wide readiness backlog. No new provider
requests, backfill, UI, cost inputs or confirmed payment allocations are part of this work.

| Gap | What saved records establish | What is still required |
| --- | --- | --- |
| Shared shipment/refund IDs | Compatible unique deferred/released pairs can be counted once without explicit release links. Ambiguous or conflicting groups stay unresolved. | For rejected groups: an authoritative release reference or reviewed source evidence explaining the conflict. |
| Warehouse reimbursements | Positive loss/damage reports can expose balanced product/amount payment candidates and competing reports across dates. | A payment-to-reimbursement identifier or reviewed allocation before confirming a payment. Matching dates and amounts are insufficient. |
| Missing original reimbursements | Seven original IDs were absent in the October 22 saved-data audit. Saved report coverage starts October 1, 2025. | The originals or authoritative evidence of their dates and amounts. Their dates are unknown; do not assume they predate coverage. Request more history only after separate authorization and checking source availability. |
| Blank inventory quantities | Four reversal rows have a supplied cash/total quantity but blank inventory quantity. | Source confirmation of inventory quantity. A blank stays unknown; arithmetic does not authorize replacing it with zero. |
| Repeated original report | One original has two identical saved report rows. | Source-line identity or reviewed evidence showing whether it is repeated delivery or separate activity. Do not delete or sum it as independent recovery. |
| Historical cost basis | Imported receipt quantities and product mappings do not establish purchase costs. | Merchant-supplied actual costs and opening balances with dates and supporting evidence. No ordered Copacker PO history was available for this audit. |

The unresolved reimbursement groups overlap; counts in the table are not additive. These are dated account findings,
not hardcoded application rules. Saved transaction/report IDs remain available through reconciliation diagnostics.

## Next acceptance

Verify shared-reference counting against all saved account records, including collisions and rejected pairs. Review
warehouse candidate and competition counts separately from confirmed payments. Keep any unresolved amounts visibly
unknown in the API. Review and deploy code through normal PR checks before calling these changes live.

## October 22 implementation audit (not deployed)

A read-only check with the new shared-reference rule qualified all 907 US pairs from the earlier audit: 879 Shipment
pairs with USD6,162.24 in repeated fees and 28 Refund pairs with USD679.40 in repeated net deductions. It also
qualified 16 CAD Shipment pairs with CAD315.10 in repeated fees; currencies must not be added without conversion.
The full saved-account pair query took approximately 0.54 seconds. These are raw saved amounts, not a prediction of
an overview period's displayed change, which also depends on dates, FX and existing cost-coverage rules.

All 39 positive warehouse reports have candidates: 17 have one candidate and 22 have several. Twenty-five reports
share at least one candidate with another saved report under the matching criteria. All remain unconfirmed. This
check queried saved records in a read-only transaction and scheduled no acquisition or writes.
