import { Toast } from "@base-ui/react/toast"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import {
  purchaseOrderFeedback,
  shipmentActionFeedback,
  shipmentFailureFeedback
} from "@/stories/fixtures/shipment-action-feedback"
import { ToastItem, ToastProvider } from "./toast-provider"

const retry = fn()

const failures = [
  shipmentFailureFeedback,

  { actor: "Buyer", title: "We couldn’t release documents for Shipment 1." },

  { actor: "Buyer, Supplier or Forwarder", title: "We couldn’t download labels for Shipment 1." }
]

function emphasizeReference(title: string) {
  const reference = title.includes("PO36") ? "PO36" : "Shipment 1"
  const [before, after] = title.split(reference)
  return (
    <>
      {before}
      <strong className="whitespace-nowrap">{reference}</strong>
      {after}
    </>
  )
}
function Gallery({
  failure = false,
  single = false,
  purchaseOrder = false
}: {
  failure?: boolean
  single?: boolean
  purchaseOrder?: boolean
}) {
  const successes = Object.values(shipmentActionFeedback).flatMap(({ toast, actor }) =>
    toast ? [{ title: toast, actor }] : []
  )

  let examples: { title: string; actor: string; description?: string; error?: boolean }[] = [
    ...successes,
    { actor: "Buyer", title: "Documents for Shipment 1 are ready to share." },
    ...failures
  ]
  if (purchaseOrder) {
    examples = purchaseOrderFeedback
  } else if (failure) {
    examples = failures
  } else if (single) {
    examples = successes.slice(0, 1)
  }
  return (
    <Toast.Provider>
      <Toast.Viewport className="grid max-w-5xl grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))] items-start gap-4 p-4">
        {examples.map((example) => (
          <div key={example.title} className="space-y-2">
            <p className="text-xs text-muted-foreground">{example.actor}</p>
            <ToastItem
              toast={{
                ...example,

                id: example.title,
                title: emphasizeReference(example.title),

                type: example.error || failures.some(({ title }) => title === example.title) ? "error" : "success",

                timeout: 0,

                ...(example.error || failures.some(({ title }) => title === example.title)
                  ? { actionProps: { children: "Try again", onClick: retry } }
                  : {})
              }}
            />
          </div>
        ))}
      </Toast.Viewport>
    </Toast.Provider>
  )
}

const meta = preview.meta({
  title: "Components/Display/Toast provider",
  component: ToastProvider,
  args: { children: null },
  render: () => <Gallery />
})

export const Saved = meta.story({
  render: () => <Gallery single />,

  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: shipmentActionFeedback["Save draft"].toast })).toBeVisible()
  }
})

export const ShipmentActions = meta.story({
  play: async ({ canvas }) => {
    for (const { toast } of Object.values(shipmentActionFeedback)) {
      if (toast) {
        await expect(canvas.getByRole("heading", { name: toast })).toBeVisible()
      }
    }
  }
})

export const SaveFailure = meta.story({
  render: () => <Gallery failure />,

  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: shipmentFailureFeedback.title })).toBeVisible()

    await expect(canvas.getByText(shipmentFailureFeedback.description)).toBeVisible()

    retry.mockClear()

    for (const button of canvas.getAllByRole("button", { name: "Try again" })) {
      await userEvent.click(button)
    }

    await expect(retry).toHaveBeenCalledTimes(3)
  }
})

export const PurchaseOrderActions = meta.story({
  render: () => <Gallery purchaseOrder />,
  play: async ({ canvas }) => {
    for (const { title } of purchaseOrderFeedback) {
      await expect(canvas.getByRole("heading", { name: title })).toBeVisible()
    }
  }
})

export const Narrow = meta.story({
  render: () => (
    <div className="w-80 max-w-full">
      <Gallery />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("heading", { name: shipmentFailureFeedback.title })).toBeVisible()
  }
})
