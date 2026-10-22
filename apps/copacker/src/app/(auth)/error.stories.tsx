import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { AuthShell } from "@/components/auth/auth-shell"
import { serverStory } from "@/stories/server"
import AuthError from "./error"

// A sign-in page whose loader failed, in the sign-in pages' layout.
const meta = preview.meta({
  title: "Pages/Errors/Sign-in error",
  ...serverStory(({ retry }: { retry: () => void }) => (
    <AuthShell>
      <AuthError retry={retry} />
    </AuthShell>
  )),
  args: { retry: fn() },
  parameters: { layout: "fullscreen", router: { navigation: { pathname: "/login" } } }
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("heading", { level: 1, name: "This page didn’t load" })).toBeVisible()
    await expect(canvas.getAllByRole("main")).toHaveLength(1)
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }))
    await expect(args.retry).toHaveBeenCalledOnce()
  }
})
