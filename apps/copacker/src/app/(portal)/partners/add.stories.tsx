import { expect, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { PartnerCreation } from "./add"
const meta = preview.meta({ title: "Pages/Partners/Add partner", component: PartnerCreation })
export const Menu = meta.story({
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add partner" }))
    await waitFor(() => expect(screen.getByRole("menuitem", { name: "Supplier" })).toBeVisible())
  }
})
