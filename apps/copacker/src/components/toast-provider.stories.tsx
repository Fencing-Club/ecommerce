import { Toast } from "@base-ui/react/toast"
import { expect, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { ToastProvider } from "./toast-provider"
import { Button } from "./ui/button"
function Example() {
  const toast = Toast.useToastManager()
  return <Button onClick={() => toast.add({ title: "Draft saved" })}>Save draft</Button>
}
const meta = preview.meta({ component: ToastProvider, args: { children: <Example /> } })
export const Saved = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(await screen.findByText("Draft saved")).toBeVisible()
  }
})
