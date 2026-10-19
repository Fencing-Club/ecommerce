import { expect, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { IntegrationPanel, IntegrationPanelFooter, IntegrationSection } from "./integration-panel"
import { Button } from "./ui/button"
import { Dialog, DialogTrigger } from "./ui/dialog"

const meta = preview.meta({
  title: "Components/Integrations/Integration panel",
  component: IntegrationPanel,
  args: {
    children: null,
    store: "shopify" as const,
    title: "Shopify",
    account: "Harbor Goods",
    domain: "harbor-goods.myshopify.com"
  },
  render: (args) => (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>Manage Shopify</DialogTrigger>
      <IntegrationPanel {...args}>
        <div className="p-6">
          <IntegrationSection title="Import preferences">
            <p>All locations</p>
          </IntegrationSection>
        </div>
        <IntegrationPanelFooter>
          <Button variant="ghost">Disconnect</Button>
        </IntegrationPanelFooter>
      </IntegrationPanel>
    </Dialog>
  )
})

export const Manage = meta.story({
  play: async ({ canvas }) => {
    const trigger = canvas.getByRole("button", { name: "Manage Shopify" })
    trigger.focus()
    await userEvent.keyboard("{Enter}")
    const panel = await screen.findByRole("dialog", { name: "Shopify" })
    await waitFor(() => expect(within(panel).getByText("Harbor Goods")).toBeVisible())
    await expect(within(panel).getByText("harbor-goods.myshopify.com")).toBeVisible()
    await expect(within(panel).getByRole("region", { name: "Import preferences" })).toBeVisible()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(trigger).toHaveFocus())
    await userEvent.click(trigger)
    await userEvent.click(within(await screen.findByRole("dialog")).getAllByRole("button", { name: "Close" })[0]!)
    await waitFor(() => expect(trigger).toHaveFocus())
  }
})
