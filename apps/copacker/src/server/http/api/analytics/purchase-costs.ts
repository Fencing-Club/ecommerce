import { inventoryBasisCollection } from "@/server/inventory-basis-http"
const handlers = inventoryBasisCollection("purchase")
export const GET = handlers.GET
export const POST = handlers.POST
