import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { getTranslations } from "next-intl/server"
import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthPage, AuthShell, AuthSwitch } from "@/components/auth/auth-shell"
import { SignUpForm } from "@/components/auth/sign-up-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { actionRecorder, redirectTo, skipAnimations } from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"

const actions = actionRecorder()

// The sign-up page (page.tsx) in the auth layout, for someone signed out. `next` is the query's page to return to, as
// returnPath reads it; signed in, the page redirects there instead. The layout's AppProviders is the story frame's
// own providers.
async function SignUp({ next, email }: { next: string; email?: string }) {
  const onward = next === "/" ? "" : `?${new URLSearchParams({ next })}`
  const t = await getTranslations("auth")
  return (
    <AuthShell>
      <AuthPage title={t("signup.title")}>
        <div className="flex flex-col gap-6">
          <SocialSignIn next={next} />
          <SignUpForm next={next} email={email} />
        </div>
        <AuthSwitch prompt={t("switch.haveAccount")} href={`/login${onward}`}>
          {t("switch.signIn")}
        </AuthSwitch>
      </AuthPage>
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Auth/Sign up",
  ...serverStory(SignUp),
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/signup" } } },
  args: { next: "/" },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/verify-email")))
    return skipAnimations()
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const main = within(canvas.getByRole("main"))
    await expect(main.getByRole("heading", { level: 1, name: "Create your account" })).toBeVisible()
    await expect(main.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login")
    await expect(main.getByRole("button", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/login/google?next=%2F"
    )
    await userEvent.click(main.getByRole("button", { name: "Create account" }))
    await expect(await main.findByText("Enter an email address")).toBeVisible()
    await userEvent.type(main.getByLabelText("Work email"), "alex@example.com")
    await userEvent.type(main.getByLabelText("Password"), "a long enough password")
    await userEvent.click(main.getByRole("button", { name: "Create account" }))
    // A code to the email confirms it next.
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/verify-email"))
    await expect(actions.sent).toEqual([
      { action: "auth.signUp", data: { email: "alex@example.com", password: "a long enough password", next: "/" } }
    ])
  }
})

export const ReturnsToPage = meta.story({
  args: { next: "/restock" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login?next=%2Frestock")
    await expect(canvas.getByRole("button", { name: "Continue with Microsoft" })).toHaveAttribute(
      "href",
      "/login/microsoft?next=%2Frestock"
    )
    await userEvent.type(canvas.getByLabelText("Work email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "a long enough password")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await waitFor(() => expect(actions.sent).toHaveLength(1))
    await expect(actions.sent[0]?.data).toMatchObject({ next: "/restock" })
  }
})

export const WithEmail = meta.story({
  args: { email: "alex@example.com" },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Work email")).toHaveValue("alex@example.com")
    await expect(canvas.getByLabelText("Work email")).not.toHaveAttribute("readonly")
    await userEvent.type(canvas.getByLabelText("Password"), "short")
    await userEvent.click(canvas.getByRole("button", { name: "Create account" }))
    await expect(await canvas.findByText("Use at least 10 characters")).toBeVisible()
    await expect(actions.sent).toHaveLength(0)
  }
})
