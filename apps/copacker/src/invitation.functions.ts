import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { invitationPage } from "@/server/invitation-page"
import { titleFor } from "@/server/page-result"

export const invitationSearch = z.object({
  token: z.string().max(1024).optional().catch(undefined),
  kind: z.string().max(30).optional().catch(undefined),
  mode: z.enum(["signin", "signup"]).optional().catch(undefined)
})
export const readInvitation = createServerFn()
  .validator(invitationSearch)
  .handler(async ({ data }) => ({ page: await invitationPage(data), title: await titleFor("auth.invite.title") }))
