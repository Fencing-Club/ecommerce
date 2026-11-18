import { Dialog } from "@buildkitgg/shadcn"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions } from "@/stories/actions"
import { shownDialog, chooseOption } from "@/stories/play"
import { AmazonConnect } from "./amazon-connect"

const submitted = fn<(marketplace: FormDataEntryValue | null) => void>()
const meta = preview.meta({
  title: "Components/Integrations/Amazon connect",
  component: AmazonConnect,
  args: { children: "Connect Amazon" },
  beforeEach: () => {
    const submit = (event: SubmitEvent) => {
      if (event.target instanceof HTMLFormElement) {
        event.preventDefault()
        submitted(new FormData(event.target).get("marketplace"))
      }
    }
    window.addEventListener("submit", submit)
    return () => window.removeEventListener("submit", submit)
  }
})

export const Default = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await shownDialog("Connect Amazon")
    await expect(dialog.getByRole("combobox", { name: "Marketplace" })).toHaveTextContent("United States")
    await expect(dialog.queryByLabelText(/token/i)).toBeNull()
    await userEvent.click(dialog.getByRole("button", { name: "Continue to Amazon" }))
    await expect(submitted).toHaveBeenCalledWith("US")
  }
})

export const Canada = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await shownDialog()
    await chooseOption(dialog.getByRole("combobox", { name: "Marketplace" }), "Canada")
    await userEvent.click(dialog.getByRole("button", { name: "Continue to Amazon" }))
    await expect(submitted).toHaveBeenCalledWith("CA")
  }
})

const privateRequests: ActionRequest[] = []
export const PrivateAuthorization = meta.story({
  args: { selfAuth: true },
  beforeEach: ({ msw }) => {
    privateRequests.length = 0
    msw.use(recordActions(privateRequests))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await shownDialog()
    await expect(dialog.queryByLabelText(/merchant token/i)).toBeNull()
    await chooseOption(dialog.getByRole("combobox", { name: "Marketplace" }), "Canada")
    await expect(dialog.getByLabelText(/^Refresh token/)).toHaveAttribute("type", "password")
    await userEvent.type(dialog.getByLabelText(/^Refresh token/), "Atzr|exampleRefreshToken0123456789")
    await userEvent.click(dialog.getByRole("button", { name: "Connect" }))
    await waitFor(() =>
      expect(privateRequests).toEqual([
        {
          action: "connection.amazonSelfAuthorized",
          data: { marketplace: "CA", refreshToken: "Atzr|exampleRefreshToken0123456789" }
        }
      ])
    )
  }
})

// Keep preview forms open and empty so visual tests never depend on a click or submitted credentials.
export const ConnectionModal = meta.story({
  render: (args) => (
    <Dialog open>
      <AmazonConnect {...args} embedded />
    </Dialog>
  ),
  play: async () => {
    const dialog = await shownDialog("Connect Amazon")
    await waitFor(() => expect(dialog.getByRole("button", { name: "Continue to Amazon" })).toBeVisible())
    await expect(dialog.queryByLabelText(/Refresh token/)).toBeNull()
  }
})

export const SelfAuthorizationModal = meta.story({
  args: { selfAuth: true },
  render: (args) => (
    <Dialog open>
      <AmazonConnect {...args} embedded />
    </Dialog>
  ),
  play: async () => {
    const dialog = await shownDialog("Connect Amazon")
    await expect(dialog.getByLabelText(/^Refresh token/)).toHaveAttribute("type", "password")
    await expect(dialog.getByLabelText(/^Refresh token/)).toHaveValue("")
    await waitFor(() => expect(dialog.getByRole("button", { name: /^Connect$/ })).toBeVisible())
  }
})
