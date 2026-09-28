import { eq } from "drizzle-orm"
import { getRequestConfig } from "next-intl/server"
import { cookies, headers } from "next/headers"
import { cache } from "react"
import { db } from "@/db"
import { profiles } from "@/db/schema"
import { maintenanceHeader } from "@/lib/maintenance"
import { isTimeZone, timeZoneCookie } from "@/lib/time-zone"
import { signedInUser } from "@/server/auth"
import { isLocale, negotiateLocale } from "./locales"
import { loadMessages } from "./messages"

// The language the browser asks for, which follows the computer's language settings.
export async function systemLocale() {
  return negotiateLocale((await headers()).get("accept-language"))
}

// The language the signed-in person chose in Settings, or null to follow their computer. The maintenance page skips
// sign-in and the database, which may be down, so it follows the computer.
export const chosenLocale = cache(async () => {
  if ((await headers()).has(maintenanceHeader)) {
    return null
  }
  const user = await signedInUser()
  if (!user) {
    return null
  }
  const [profile] = await db().select({ locale: profiles.locale }).from(profiles).where(eq(profiles.userId, user.id))
  return isLocale(profile?.locale) ? profile.locale : null
})

// Every page and route renders in the chosen language, or else the computer's. Dates and times format in the
// computer's time zone as the browser last reported it, so the server and the browser render the same text.
export default getRequestConfig(async () => {
  const locale = (await chosenLocale()) ?? (await systemLocale())
  const zone = (await cookies()).get(timeZoneCookie)?.value
  return {
    locale,
    messages: await loadMessages(locale),
    timeZone: zone && isTimeZone(zone) ? zone : "UTC"
  }
})
