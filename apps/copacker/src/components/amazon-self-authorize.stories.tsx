import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { type ActionRequest, recordActions, serverError } from "@/stories/fixtures/logistics"
import { AmazonSelfAuthorize } from "./amazon-self-authorize"

const sent: ActionRequest[] = []
const token = "Atzr|IwEBIExampleRefreshTokenForStories0123456789"

const meta = preview.meta({
  component: AmazonSelfAuthorize,
  args: { children: "Connect Amazon" },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

// The merchant token is read in capitals.
export const Connect = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await screen.findByRole("dialog", { name: "Connect Amazon" })
    await expect(within(dialog).getByLabelText(/^Refresh token/)).toHaveAttribute("type", "password")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Merchant token" }), "a2ciyiv0e1fhu3")
    await userEvent.type(within(dialog).getByLabelText(/^Refresh token/), token)
    await userEvent.click(within(dialog).getByRole("button", { name: "Connect" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "connection.amazonSelfAuthorized", data: { sellerId: "A2CIYIV0E1FHU3", refreshToken: token } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(getRouter().refresh).toHaveBeenCalled())
  }
})

export const Validation = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Merchant token" }), "seller 1")
    await userEvent.type(within(dialog).getByLabelText(/^Refresh token/), "IwEBI-not-a-token")
    await userEvent.click(within(dialog).getByRole("button", { name: "Connect" }))
    await expect(
      await within(dialog).findByText("Enter the seller's merchant token, such as A2CIYIV0E1FHU3")
    ).toBeInTheDocument()
    await expect(within(dialog).getByText("Paste the full refresh token, which starts with Atzr|")).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
  }
})

export const AmazonRefuses = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => serverError("Amazon didn’t accept this refresh token.")))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Connect Amazon" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByRole("textbox", { name: "Merchant token" }), "A2CIYIV0E1FHU3")
    await userEvent.type(within(dialog).getByLabelText(/^Refresh token/), token)
    await userEvent.click(within(dialog).getByRole("button", { name: "Connect" }))
    await expect(await within(dialog).findByText("Amazon didn’t accept this refresh token.")).toBeInTheDocument()
    await expect(screen.getByRole("dialog")).toBeInTheDocument()
  }
})
