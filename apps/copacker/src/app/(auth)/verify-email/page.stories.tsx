import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { getTranslations } from "next-intl/server"
import { expect, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthPage, AuthShell, AuthSwitch } from "@/components/auth/auth-shell"
import { VerifyEmailForm } from "@/components/auth/verify-email-form"
import { actionRecorder, errors, failWith, redirectTo, skipAnimations } from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"

const actions = actionRecorder()

// Bold text inside a translated sentence, such as an email address.
function strong(chunks: React.ReactNode) {
  return <span className="font-medium text-foreground">{chunks}</span>
}

// The verify-email page (page.tsx) in the auth layout, with the sign-up or sign-in waiting on the code. Without one,
// the page redirects to sign-in. The layout's AppProviders is the story frame's own providers.
async function VerifyEmail({ email }: { email: string }) {
  const t = await getTranslations("auth")
  return (
    <AuthShell>
      <AuthPage
        title={t("verifyEmail.title")}
        description={t.rich("verifyEmail.description", {
          email,
          strong
        })}
      >
        <VerifyEmailForm />
        <AuthSwitch prompt={t("verifyEmail.wrongEmail")} href="/signup">
          {t("verifyEmail.startAgain")}
        </AuthSwitch>
      </AuthPage>
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Auth/Verify email",
  ...serverStory(VerifyEmail),
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/verify-email" } } },
  args: { email: "alex@example.com" },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/onboarding")))
    return skipAnimations()
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "Check your email" })).toBeVisible()
    await expect(canvas.getByText("alex@example.com")).toHaveClass("font-medium")
    await expect(canvas.getByText(/Enter the code we sent to/)).toBeVisible()
    await expect(canvas.getByRole("link", { name: "Start again" })).toHaveAttribute("href", "/signup")
    await expect(canvas.getByRole("button", { name: /Send again in \d+s/ })).toBeDisabled()
    await userEvent.type(canvas.getByLabelText("Verification code"), "482913")
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/onboarding"))
    await expect(actions.sent).toEqual([{ action: "auth.verifyEmail", data: { code: "482913" } }])
  }
})

export const WrongCode = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(failWith(errors.wrongCode)))
  },
  play: async ({ canvas }) => {
    await userEvent.type(canvas.getByLabelText("Verification code"), "000000")
    await expect(await canvas.findByText(errors.wrongCode)).toBeVisible()
    await waitFor(() => expect(canvas.getByLabelText("Verification code")).toHaveValue(""))
  }
})
