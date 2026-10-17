import { inventoryBasisCollection } from "@/server/inventory-basis-http"
const handlers = inventoryBasisCollection("receipt")
export const GET = handlers.GET
export const POST = handlers.POST
