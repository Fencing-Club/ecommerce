import { cookies } from "next/headers"
import { isTimeZone, timeZoneCookie } from "@/lib/time-zone"

// The store's time zone: the one chosen in Settings, or else the viewer's computer's (which the browser reports in a
// cookie), or UTC before the browser has reported it.
export async function storeTimeZone(org: { timeZone: string | null }) {
  if (org.timeZone) {
    return org.timeZone
  }
  const reported = (await cookies()).get(timeZoneCookie)?.value
  return reported && isTimeZone(reported) ? reported : "UTC"
}
