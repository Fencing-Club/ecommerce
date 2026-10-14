import { redirect } from "@storybook/nextjs-vite/navigation.mock"
import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import SuppliersPage from "./page"

// Suppliers are listed with the other partners, so the page only sends the person there.
function Redirected() {
  try {
    SuppliersPage()
  } catch {
    // redirect() throws to stop rendering; the page it sends to is what it was called with.
    return <output>{String(redirect.mock.lastCall?.[0])}</output>
  }
  return null
}

const meta = preview.meta({
  title: "Pages/Buyer/Partners/Suppliers",
  render: () => <Redirected />
})

export const RedirectsToPartners = meta.story({
  play: async ({ canvas }) => {
    await expect(redirect).toHaveBeenCalledWith("/partners?type=supplier")
    await expect(canvas.getByRole("status")).toHaveTextContent("/partners?type=supplier")
  }
})
