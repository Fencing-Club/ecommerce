import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { CircleAlert } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { expect, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthPage, AuthShell, AuthSwitch } from "@/components/auth/auth-shell"
import { SignInForm } from "@/components/auth/sign-in-form"
import { SocialSignIn } from "@/components/auth/social-sign-in"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { actionRecorder, errors, failWith, redirectTo, skipAnimations } from "@/stories/fixtures/auth"
import { serverStory } from "@/stories/server"

const actions = actionRecorder()

// The sign-in page (page.tsx) in the auth layout, for someone signed out. `next` is the query's page to return to,
// as returnPath reads it ("/" when there's none or it's not a page of the app); signed in, the page redirects there
// instead. The layout's AppProviders is the story frame's own providers.
async function Login({ next, email, error }: { next: string; email?: string; error?: string }) {
  const onward = next === "/" ? "" : `?${new URLSearchParams({ next })}`
  const t = await getTranslations("auth")
  return (
    <AuthShell>
      <AuthPage title={t("login.heading")}>
        {error && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertDescription>{t("login.failed")}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-col gap-6">
          <SocialSignIn next={next} />
          <SignInForm next={next} email={email} />
        </div>
        <AuthSwitch prompt={t("switch.newToCopacker")} href={`/signup${onward}`}>
          {t("switch.createAccount")}
        </AuthSwitch>
      </AuthPage>
    </AuthShell>
  )
}

const meta = preview.meta({
  title: "Pages/Shared/Auth/Sign in",
  ...serverStory(Login),
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/login" } } },
  args: { next: "/" },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/")))
    return skipAnimations()
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    const main = within(canvas.getByRole("main"))
    await expect(main.getByRole("heading", { level: 1, name: "Sign in to Copacker" })).toBeVisible()
    await expect(main.queryByRole("alert")).toBeNull()
    await expect(main.getByRole("button", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/login/google?next=%2F"
    )
    await expect(main.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/signup")
    await expect(main.getByLabelText("Email")).toHaveValue("")
    await userEvent.type(main.getByLabelText("Email"), "alex@example.com")
    await userEvent.type(main.getByLabelText("Password"), "correct horse battery")
    await userEvent.click(main.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/"))
    await expect(actions.sent[0]?.data).toEqual({
      email: "alex@example.com",
      password: "correct horse battery",
      next: "/"
    })
  }
})

// ?error=… from a Google or Microsoft sign-in that didn't finish.
export const OAuthFailed = meta.story({
  args: { error: "oauth" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Couldn’t sign in with that account. Try again.")
  }
})

// ?next=… comes back after signing in, and carries over to sign-up and the providers.
export const ReturnsToPage = meta.story({
  args: { next: "/orders/new" },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(redirectTo("/orders/new")))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Create an account" })).toHaveAttribute(
      "href",
      "/signup?next=%2Forders%2Fnew"
    )
    await expect(canvas.getByRole("button", { name: "Continue with Microsoft" })).toHaveAttribute(
      "href",
      "/login/microsoft?next=%2Forders%2Fnew"
    )
    await userEvent.type(canvas.getByLabelText("Email"), "alex@example.com")
    await userEvent.type(canvas.getByLabelText("Password"), "correct horse battery")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await waitFor(() => expect(getRouter().push).toHaveBeenCalledWith("/orders/new"))
    await expect(actions.sent[0]?.data).toMatchObject({ next: "/orders/new" })
  }
})

// ?email=… fills in the address, such as from the forgot-password page.
export const WithEmail = meta.story({
  args: { email: "alex@example.com" },
  beforeEach: ({ msw }) => {
    msw.use(actions.handler(failWith(errors.incorrectCredentials)))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Email")).toHaveValue("alex@example.com")
    await expect(canvas.getByLabelText("Email")).not.toHaveAttribute("readonly")
    await userEvent.type(canvas.getByLabelText("Password"), "wrong password")
    await userEvent.click(canvas.getByRole("button", { name: "Sign in" }))
    await expect(await canvas.findByRole("alert")).toHaveTextContent(errors.incorrectCredentials)
  }
})

export const Phone = meta.story({
  globals: { viewport: { value: "mobile1", isRotated: false } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvasElement.querySelector("aside")).not.toBeVisible()
    await expect(within(canvasElement.querySelector("header") ?? canvasElement).getByText("Copacker")).toBeVisible()
    await expect(canvas.getByRole("heading", { level: 1, name: "Sign in to Copacker" })).toBeVisible()
  }
})
