import { inventoryBasisResource } from "@/server/inventory-basis-http"
const handlers = inventoryBasisResource("depletion")
export const GET = handlers.GET
export const DELETE = handlers.DELETE
