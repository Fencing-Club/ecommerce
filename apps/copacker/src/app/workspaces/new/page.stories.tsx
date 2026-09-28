import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { Button } from "@/components/ui/button"
import type { profiles } from "@/db/schema"
import { blankPlace } from "@/lib/onboarding"
import { actionRecorder, redirectTo, savedProfile, skipAnimations } from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"

const actions = actionRecorder()

// A new workspace from the workspace menu (page.tsx), with the person's saved profile. The layout is only
// AppProviders, the story frame's own providers.
async function NewWorkspace({
  profile,
  complete
}: {
  profile: typeof profiles.$inferSelect | null
  complete: boolean
}) {
  const t = await getTranslations("onboarding.wizard")
  return (
    <OnboardingWizard
      steps={complete ? ["role", "company", "address"] : ["about", "role", "company", "address"]}
      finish={{ type: "workspace", invitation: null }}
      kind={null}
      initial={{
        person: {
          firstName: profile?.firstName ?? "",
          lastName: profile?.lastName ?? "",
          position: profile?.position ?? ""
        },
        kind: "",
        company: { name: "", website: "", phone: "" },
        address: blankPlace
      }}
      invitedBy={null}
      account={
        <Button variant="ghost" size="sm" nativeButton={false} render={<Link href="/" />}>
          {t("cancel")}
        </Button>
      }
    />
  )
}

const meta = preview.meta({
  title: "Pages/Workspaces/New",
  ...serverStory(NewWorkspace),
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/workspaces/new" } } },
  args: { profile: savedProfile, complete: true },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/overview")))
    return skipAnimations()
  }
})

// Another company, or the same company in another role: the company's steps only.
export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 3")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "What does your company do?" })).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Cancel" })).toHaveAttribute("href", "/")
    await expect(canvas.queryByRole("button", { name: "Sign out" })).toBeNull()
    await userEvent.click(canvas.getByText("Supplier"))
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await userEvent.type(await canvas.findByLabelText(/Company name/), "Harbor Goods Supply")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByRole("heading", { level: 1, name: "Pickup address" })).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Skip for now" }))
    // The new workspace opens once it's made.
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/overview"))
    await expect(actions.sent[0]).toMatchObject({
      action: "onboarding.workspace",
      data: {
        person: { firstName: "Alex", lastName: "Rivera", position: "Operations manager" },
        kind: "supplier",
        company: { name: "Harbor Goods Supply", phone: "" },
        address: null,
        invitation: null
      }
    })
  }
})

// Without a full profile, the person's step comes first.
export const IncompleteProfile = meta.story({
  args: { profile: null, complete: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Step 1 of 4")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "About you" })).toBeVisible()
    await expect(canvas.getByLabelText(/First name/)).toHaveValue("")
    await userEvent.click(canvas.getByRole("button", { name: "Continue" }))
    await expect(await canvas.findByText("Enter your first name")).toBeVisible()
  }
})
