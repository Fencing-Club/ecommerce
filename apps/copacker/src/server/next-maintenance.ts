import { NextResponse } from "next/server"
import { maintenanceHeader } from "@/lib/maintenance"
import { maintenanceDocument, maintenanceHeaders, maintenanceUnavailable } from "./maintenance"

// Next's remaining rewrite boundary; the request policy and flag lookup are shared with Start.
export async function maintenanceResponse(request: Request) {
  if (!maintenanceDocument(request)) {
    return maintenanceUnavailable(request)
  }
  const marked = new Headers(request.headers)
  marked.set(maintenanceHeader, "1")
  return NextResponse.next({ status: 503, headers: maintenanceHeaders, request: { headers: marked } })
}
