import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { readNewWorkspaceData } from "@/server/new-workspace-page"
import { readOnboardingData } from "@/server/onboarding-page"
import { titleFor } from "@/server/page-result"

export const onboardingSearch = z.object({
  next: z.string().max(4096).optional().catch(undefined),
  invite: z.string().max(1024).optional().catch(undefined),
  kind: z.string().max(30).optional().catch(undefined)
})
export const readOnboarding = createServerFn()
  .validator(onboardingSearch)
  .handler(async ({ data }) => ({ page: await readOnboardingData(data), title: await titleFor("onboarding.title") }))
export const readNewWorkspace = createServerFn().handler(async () => ({
  page: await readNewWorkspaceData(),
  title: await titleFor("onboarding.newWorkspaceTitle")
}))
