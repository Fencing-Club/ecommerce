import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { type ActionRequest, recordActions } from "@/stories/fixtures/logistics"
import { ExcludedOrderTags } from "./excluded-order-tags"

const sent: ActionRequest[] = []

const meta = preview.meta({
  component: ExcludedOrderTags,
  args: {
    tags: ["Amazon", "wholesale"],
    suggestions: ["Amazon", "wholesale", "sample", "replacement"],
    copying: false
  },
  beforeEach: ({ msw }) => {
    sent.length = 0
    msw.use(recordActions(sent))
  }
})

export const Tags = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: "Excluded order tags" })).toBeVisible()
    await expect(canvas.getAllByRole("listitem").map((item) => item.textContent)).toEqual(["Amazon", "wholesale"])
    await expect(canvas.queryByRole("status")).toBeNull()
  }
})

export const None = meta.story({
  args: { tags: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("None")).toBeVisible()
  }
})

// Some orders were copied before their tags were read; the next Shopify sync reads them.
export const ReadingTags = meta.story({
  args: { copying: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("status")).toHaveAttribute("title", "Syncing tags from Shopify")
  }
})

// Tags are added by typing, a comma or a suggestion, and removed from their chips; Save sends the whole list.
export const Edit = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit excluded order tags" }))
    const dialog = await screen.findByRole("dialog", { name: "Excluded order tags" })
    const input = within(dialog).getByRole("textbox", { name: "Tags" })
    await waitFor(() => expect(input).toHaveFocus())
    await expect(dialog).toHaveTextContent("Use * as a wildcard, like amazon*")
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove wholesale" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "sample" }))
    await userEvent.type(input, "b2b*{Enter}")
    await userEvent.type(input, "gift,AMAZON,")
    await waitFor(() =>
      expect(
        within(dialog)
          .getAllByRole("button", { name: /^Remove / })
          .map((chip) => chip.ariaLabel)
      ).toEqual(["Remove Amazon", "Remove sample", "Remove b2b*", "Remove gift"])
    )
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await waitFor(() =>
      expect(sent).toEqual([
        { action: "workspace.excludedShopifyTags", data: { tags: ["Amazon", "sample", "b2b*", "gift"] } }
      ])
    )
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await waitFor(() => expect(getStoryRouter().invalidate).toHaveBeenCalled())
  }
})

// Cancel keeps the saved tags, and the next opening starts from them.
export const Cancel = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit excluded order tags" }))
    let dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove Amazon" }))
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    await userEvent.click(canvas.getByRole("button", { name: "Edit excluded order tags" }))
    dialog = await screen.findByRole("dialog")
    await expect(within(dialog).getByRole("button", { name: "Remove Amazon" })).toBeInTheDocument()
    await expect(sent).toHaveLength(0)
  }
})

// Without the server's reason, saving says it failed and the dialog stays open.
export const SaveFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(recordActions(sent, () => new Response(null, { status: 500 })))
  },
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Edit excluded order tags" }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }))
    await expect(await within(dialog).findByText("Couldn’t save the tags. Try again.")).toBeInTheDocument()
  }
})
