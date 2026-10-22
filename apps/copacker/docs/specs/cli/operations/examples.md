# Worked operation requests and responses

These fictional values illustrate the proposed schemas. JSON requests contain the domain `input`; HTTP wraps them
with workspaceId and bearer authentication, and mutations also require an Idempotency-Key. MCP adds workspaceId and
idempotencyKey to its tool arguments. The CLI emits the same success/error envelopes, while handling local files.

## Restock to purchase orders

Read a report, select its stable rows, inspect the plan, then create drafts. Submission remains a separate operation.
The CLI `--from-report` supplies reportId outside the selection file; that field must not also occur in the file.

```json
{
  "reportId": "10000000-0000-4000-8000-000000000001",
  "groups": [{
    "reference": "PO-1043",
    "supplierId": "10000000-0000-4000-8000-000000000002",
    "destination": "amazon",
    "currency": "USD",
    "lines": [{"rowId":"row-17","purchaseUnits":120,"receiver":"fba"}]
  }]
}
```

That is `restock.plan.create` input. Its RestockPlan result includes normalized PoDraft inputs and dependencies. Apply
with `restock.plan.create-pos` input `{id:"<plan UUID>",expectedRevision:1}`. A changed stock snapshot gives no drafts:

```json
{
  "error": {
    "code": "stale_plan",
    "message": "Inventory changed after this plan was prepared. Create a new report and plan.",
    "retryable": false,
    "details": {
      "planId": "10000000-0000-4000-8000-000000000003",
      "changedDependencies": [{
        "kind": "snapshot",
        "id": "10000000-0000-4000-8000-000000000004",
        "snapshotId": "10000000-0000-4000-8000-000000000005"
      }]
    },
    "issues": [],
    "recovery": {"operation":"report.restock","input":{}}
  },
  "meta": {
    "requestId": "10000000-0000-4000-8000-000000000006",
    "workspaceId": "10000000-0000-4000-8000-000000000007"
  }
}
```

With unchanged dependencies, the operation returns `{planId,revision,poIds,orders,replayed:false}` in data. Repeating
the accepted key returns the same IDs, with `replayed:true`; it does not send either PO. A full Po result uses the
fields in [purchasing schemas](purchasing.md), including typed source identities and permitted prices.

## Supplier catalog success

A supplier first reads its variant and customer relationship revisions. This empty-assignment catalog creation uses
the variant below at revision 3; subsequent `partners.catalog.assign` chooses a customer explicitly.

```json
{
  "clientReference": "wholesale-autumn",
  "data": {
    "title": "Wholesale autumn",
    "status": "active",
    "adjustmentBasisPoints": 0,
    "includeNewProducts": false,
    "customerIds": [],
    "products": [{
      "variantId": "20000000-0000-4000-8000-000000000001",
      "priceMinor": 450,
      "priceBreaks": null,
      "quantityRules": null
    }]
  },
  "expectedProductRevisions": [{"variantId":"20000000-0000-4000-8000-000000000001","revision":3}],
  "expectedAssignments": []
}
```

The `catalog.create` success envelope is:

```json
{
  "data": {
    "resource": {
      "id": "20000000-0000-4000-8000-000000000002",
      "revision": 1,
      "title": "Wholesale autumn",
      "status": "active",
      "adjustmentBasisPoints": 0,
      "includeNewProducts": false,
      "customerIds": [],
      "products": [{
        "variantId": "20000000-0000-4000-8000-000000000001",
        "priceMinor": 450,
        "priceBreaks": null,
        "quantityRules": null
      }],
      "allowedActions": ["catalog.update","catalog.remove","catalog.export"]
    },
    "changedDependencies": []
  },
  "meta": {
    "requestId": "20000000-0000-4000-8000-000000000003",
    "workspaceId": "20000000-0000-4000-8000-000000000004",
    "generatedAt": "2026-10-15T19:00:00Z",
    "completeness": "complete",
    "sources": [], "warnings": [], "redactedFields": []
  }
}
```

## Stock conflict

A physical-count write explicitly supplies the supplier location, units resolved by that binding, and expected values:

```json
{
  "mode": "direct",
  "variantId": "20000000-0000-4000-8000-000000000001",
  "locationId": "20000000-0000-4000-8000-000000000005",
  "quantityState": "on_hand",
  "quantity": 120,
  "expectedQuantity": 100,
  "expectedRevision": 7,
  "expectedLocationRevision": 1,
  "expectedLinkRevision": 0,
  "reason": "Physical count"
}
```

If invoice acceptance changed the stock row to revision 8, `inventory.update` returns HTTP 409/CLI exit 5:

```json
{
  "error": {
    "code": "revision_conflict",
    "message": "Stock changed after your observation. Read and review the current count.",
    "retryable": false,
    "details": {"entityId":"20000000-0000-4000-8000-000000000001","expectedRevision":7,"currentRevision":8,"dependencyKind":"stock"},
    "issues": [],
    "recovery": {"operation":"inventory.show","input":{"id":"20000000-0000-4000-8000-000000000006","locationId":"20000000-0000-4000-8000-000000000005"}}
  },
  "meta": {"requestId":"20000000-0000-4000-8000-000000000007","workspaceId":"20000000-0000-4000-8000-000000000004"}
}
```

The recovery ID is the parent product, not the variant. The CLI never replaces revision 7 with 8 and resends a stale count.

## Linked price partial failure

Previewing a single-unit $12 source and a six-pack $68 Amazon offer uses explicit target pricing:

```json
{
  "mode": "preview",
  "variantId": "30000000-0000-4000-8000-000000000001",
  "amountMinor": 1200,
  "currency": "USD",
  "targetPrices": [{"listingId":"30000000-0000-4000-8000-000000000002","amountMinor":6800,"currency":"USD"}]
}
```

The preview returns both account/offer destinations, before/after values and pinned revisions. Apply with
`{mode:"apply",previewId:"<preview UUID>"}`. If Shopify confirms and Amazon rejects the known submission without an
effect, the error response retains both targets:

```json
{
  "error": {
    "code": "partial_write",
    "message": "Shopify confirmed the price. Amazon has not applied its price.",
    "retryable": true,
    "issues": [],
    "recovery": {"operation":"product.show","input":{"id":"30000000-0000-4000-8000-000000000003","operationId":"30000000-0000-4000-8000-000000000007"}},
    "details": {
      "result": {
        "entityId": "30000000-0000-4000-8000-000000000001",
        "operation": {
          "id": "30000000-0000-4000-8000-000000000007",
          "name": "product.price.update", "status": "partially_succeeded", "stage": "destinations",
          "startedAt": "2026-10-15T19:00:00Z", "completedAt": "2026-10-15T19:00:10Z",
          "error": {"code":"provider_unavailable","message":"Amazon request failed before dispatch.","retryable":true,"issues":[],"recovery":null},
          "recovery": {"operation":"product.show","input":{"id":"30000000-0000-4000-8000-000000000003","operationId":"30000000-0000-4000-8000-000000000007"}}
        },
        "statusQuery": {"operation":"product.show","input":{"id":"30000000-0000-4000-8000-000000000003","operationId":"30000000-0000-4000-8000-000000000007"}},
        "targets": [
          {
            "target": {
              "id":"30000000-0000-4000-8000-000000000004", "provider":"shopify",
              "connectionId":"30000000-0000-4000-8000-000000000005", "accountId":"example-store", "marketplaceId":null,
              "listingId":null, "locationId":null, "displayName":"Shopify Main / Single unit",
              "sourceRef":{"provider":"shopify","connectionId":"30000000-0000-4000-8000-000000000005","accountId":"example-store","kind":"variant","externalId":"gid://shopify/ProductVariant/123"}
            },
            "field":"selling_price",
            "desired":{"kind":"money","amountMinor":1200,"currency":"USD"},
            "observed":{"kind":"money","amountMinor":1200,"currency":"USD"},
            "status":"confirmed", "providerRequestId":"example-shopify-request",
            "confirmedAt":"2026-10-15T19:00:05Z", "revision":8, "error":null
          },
          {
            "target": {
              "id":"30000000-0000-4000-8000-000000000002", "provider":"amazon",
              "connectionId":"30000000-0000-4000-8000-000000000006", "accountId":"example-seller", "marketplaceId":"US",
              "listingId":"30000000-0000-4000-8000-000000000002", "locationId":null, "displayName":"Amazon US / Six pack",
              "sourceRef":{"provider":"amazon","connectionId":"30000000-0000-4000-8000-000000000006","accountId":"example-seller","kind":"listing","externalId":"PACK-6","marketplaceId":"US"}
            },
            "field":"selling_price",
            "desired":{"kind":"money","amountMinor":6800,"currency":"USD"},
            "observed":{"kind":"money","amountMinor":6500,"currency":"USD"},
            "status":"failed", "providerRequestId":null, "confirmedAt":null, "revision":4,
            "error":{"code":"provider_unavailable","message":"Amazon request failed before dispatch.","retryable":true,"issues":[],"recovery":null}
          }
        ]
      }
    }
  },
  "meta":{"requestId":"30000000-0000-4000-8000-000000000008","workspaceId":"30000000-0000-4000-8000-000000000009"}
}
```

The failed target's observed amount is the last known preflight value, not a new confirmation.
HTTP returns 409, CLI exits 9, and MCP sets `isError:true` while retaining the same error envelope in structuredContent.
Repeating the original apply input/key resumes only the eligible Amazon stage. A timeout with an uncertain Amazon
outcome instead uses `outcome_unknown`/`needs_attention` until reconciled. Neither path reapplies the Shopify price.

## Batch input and recovery

For two products, use one parent key and rows such as `{rowId:"red",change:PriceChange}` and
`{rowId:"blue",change:PriceChange}`. Initial preview reports both rows, all targets and one canApply value. A terminal
partial result retains every row; polling uses `product.price.update` with `{mode:"read",batchId}`. Changed values
cannot be substituted under the original key. See [bulk execution](../bulk.md) for full result and resumption rules.
