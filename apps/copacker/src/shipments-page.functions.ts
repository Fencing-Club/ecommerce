import { createServerFn } from "@tanstack/react-start"
import { pageResult } from "@/server/page-result"
import { shipmentsPage } from "@/server/shipments-page"
export const readShipments = createServerFn().handler(() => pageResult(shipmentsPage, "shipments.list.title"))
