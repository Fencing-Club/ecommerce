import { headers } from "next/headers"
import { siteUrlFor } from "./security"

// The app's address the current request came in on; see siteUrlFor.
export async function siteUrl() {
  return siteUrlFor(await headers())
}
