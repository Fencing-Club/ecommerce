import { inventoryBasisCollection } from "@/server/inventory-basis-http"
const handlers = inventoryBasisCollection("depletion")
export const GET = handlers.GET
export const POST = handlers.POST
