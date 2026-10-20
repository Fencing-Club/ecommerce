import { CircleCheck } from "lucide-react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { StatusBadge } from "./common"
import { IntegrationCard } from "./integration-card"
import { Button } from "./ui/button"

const manage = fn()
const meta = preview.meta({
  title: "Components/Integrations/Integration card",
  component: IntegrationCard,
  args: {
    store: "shopify" as const,
    title: "Shopify",
    description: "Products, inventory, orders, expenses",
    status: (
      <StatusBadge tone="success" icon={<CircleCheck />}>
        Connected
      </StatusBadge>
    ),
    action: (
      <Button variant="outline" onClick={manage}>
        Manage
      </Button>
    ),
    children: (
      <>
        <p className="font-medium">Harbor Goods</p>
        <p className="text-xs text-muted-foreground">harbor-goods.myshopify.com</p>
      </>
    )
  }
})

export const Connected = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("article", { name: "Shopify" })).toBeVisible()
    await expect(canvas.getByText("Harbor Goods")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Manage" }))
    await expect(manage).toHaveBeenCalled()
  }
})
