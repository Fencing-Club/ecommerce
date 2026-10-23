import {
  defineOperation,
  jsonObject,
  providerWriteInput,
  providerWriteResult,
  readMetadata
} from "@repo/copacker-contract"
import { z } from "zod"
import { inventoryUpdateDefinition } from "./operation-inventory-writes"
import { productWriteDefinitions } from "./operation-product-writes"

function metadata(name: string) {
  return {
    ...readMetadata(name, ["products:write-channel"], ["buyer"]),
    effects: [
      {
        kind: "provider_write" as const,
        description: "Retain and dispatch a guarded change to resolved provider destinations."
      }
    ],
    execution: {
      kind: "mutation" as const,
      idempotent: true,
      confirmation: true,
      readBranches: [{ field: "mode" as const, value: "read" as const }]
    },
    asyncStatusSchema: jsonObject.parse(z.toJSONSchema(providerWriteResult))
  }
}
export const providerWriteOperations = {
  "product.price.update": defineOperation(metadata("product.price.update"), providerWriteInput, providerWriteResult),
  "product.cost.update": defineOperation(metadata("product.cost.update"), providerWriteInput, providerWriteResult),
  "product.variant.update": defineOperation(
    metadata("product.variant.update"),
    z.union([productWriteDefinitions["product.variant.update"].input, providerWriteInput]),
    z.union([productWriteDefinitions["product.variant.update"].output, providerWriteResult])
  ),
  "inventory.update": defineOperation(
    {
      ...metadata("inventory.update"),
      accessPolicy: {
        ...metadata("inventory.update").accessPolicy,
        scopes: ["inventory:write"],
        workspaceKinds: ["buyer", "supplier"]
      }
    },
    z.union([inventoryUpdateDefinition.input, providerWriteInput]),
    z.union([inventoryUpdateDefinition.output, providerWriteResult])
  )
}
