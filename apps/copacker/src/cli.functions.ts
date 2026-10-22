import { createServerFn } from "@tanstack/react-start"
import { identity } from "@/server/auth"
import { cliAuthorizationInput, prepareCliConsent } from "@/server/cli-auth"
import { serverTranslator } from "@/server/translation"

export const readCliConsent = createServerFn()
  .validator(cliAuthorizationInput)
  .handler(async ({ data }) => {
    const user = await identity(`/cli/authorize?${new URLSearchParams(data)}`)
    const t = await serverTranslator("auth.cli")
    return { email: user.email, intent: await prepareCliConsent(user.id, data), state: data.state, title: t("title") }
  })
