import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { createTranslator } from "use-intl"
import { z } from "zod"
import { authPageKinds, authSearch, authTitle } from "@/lib/auth-pages"
import { signedInUser } from "@/server/auth"
import { loadAuthPage } from "@/server/auth-pages"
import { signInRequest } from "@/server/auth-session"
import { localization } from "@/server/localization"

export const readAuthPage = createServerFn()
  .validator(z.object({ kind: z.enum(authPageKinds), query: authSearch }))
  .handler(async ({ data }) => {
    const result = await loadAuthPage(data.kind, data.query, {
      signedIn: async () => Boolean(await signedInUser()),
      signInRequest
    })
    if ("redirect" in result) {
      throw redirect({ href: result.redirect })
    }
    const t = createTranslator({ ...(await localization()), namespace: "auth" })
    return { page: result.page, title: t(authTitle[data.kind]) }
  })
