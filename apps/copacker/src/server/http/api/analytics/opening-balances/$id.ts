import { inventoryBasisResource } from "@/server/inventory-basis-http"
const handlers = inventoryBasisResource("opening")
export const GET = handlers.GET
export const DELETE = handlers.DELETE
