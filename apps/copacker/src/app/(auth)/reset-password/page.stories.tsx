import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { getTranslations } from "next-intl/server"
import Link from "next/link"
import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthPage, AuthShell } from "@/components/auth/auth-shell"
import { ResetPasswordForm } from "@/components/auth/password-reset"
import { Button } from "@/components/ui/button"
import { actionRecorder, errors, failWith, redirectTo, skipAnimations } from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"

const actions = actionRecorder()
const token = "reset_9fK2mQ7xLp3Zt8Wn"

// The reset-password page (page.tsx) in the auth layout, with the emailed link's `token`. The layout's AppProviders
// is the story frame's own providers.
async function ResetPassword({ token }: { token?: string }) {
  const t = await getTranslations("auth.resetPassword")
  if (!token) {
    return (
      <AuthShell>
        <AuthPage title={t("incompleteTitle")} description={t("incompleteDescription")}>
          <Button className="h-10 w-full" nativeButton={false} render={<Link href="/forgot-password" />}>
            {t("sendNewLink")}
          </Button>
        </AuthPage>
      </AuthShell>
    )
  }
  return (
    <AuthShell>
      <AuthPage title={t("title")}>
        <ResetPasswordForm token={token} />
      </AuthPage>
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Auth/Reset password",
  ...serverStory(ResetPassword),
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/reset-password" } } },
  args: { token },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/")))
    return skipAnimations()
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Choose a new password" })).toBeVisible()
    await userEvent.type(canvas.getByLabelText("New password"), "a brand new password")
    await userEvent.click(canvas.getByRole("button", { name: "Save and sign in" }))
    // Saving signs straight in.
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"))
    await expect(actions.sent).toEqual([
      { action: "auth.resetPassword", data: { password: "a brand new password", token } }
    ])
  }
})

export const LinkExpired = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(failWith(errors.linkExpired)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("New password"), "a brand new password")
    await userEvent.click(canvas.getByRole("button", { name: "Save and sign in" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.linkExpired)
  }
})

// A link without its token.
export const Incomplete = meta.story({
  args: { token: undefined },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "This link is incomplete" })).toBeVisible()
    await expect(canvas.getByText("Open the link from the email again, or ask for a new one.")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Send a new link" })).toHaveAttribute("href", "/forgot-password")
    await expect(canvas.queryByLabelText("New password")).toBeNull()
  }
})
