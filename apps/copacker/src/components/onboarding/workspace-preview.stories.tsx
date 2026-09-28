import { FormProvider, useForm } from "react-hook-form"
import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import type { WizardValues } from "@/components/onboarding/onboarding-wizard"
import type { WorkspaceKind } from "@/lib/onboarding"
import { blankWizard, filledWizard } from "@/stories/fixtures/auth"
import type { WizardStep } from "./wizard-steps"
import { WorkspacePreview } from "./workspace-preview"

// The preview reads getting started's answers from the form around it.
function Preview({ step, kind, values }: { step: WizardStep; kind: WorkspaceKind | ""; values: WizardValues }) {
  const form = useForm<WizardValues>({ defaultValues: values })
  return (
    <FormProvider {...form}>
      <div className="dark rounded-3xl bg-[oklch(0.17_0.01_55)] p-10">
        <WorkspacePreview step={step} kind={kind} />
      </div>
    </FormProvider>
  )
}

// The outlined part of the preview, which the current step fills in.
function spots(canvasElement: HTMLElement) {
  return [...canvasElement.querySelectorAll("[class*='shadow-[0_0_0_2px']")]
}

const blank: React.ComponentProps<typeof Preview> = { step: "about", kind: "", values: blankWizard() }

const meta = preview.meta({
  component: Preview,
  args: blank
})

// Nothing typed yet: placeholders where the answers will go.
export const Blank = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Workspace")).toBeInTheDocument()
    await expect(canvas.getByText("Address")).toBeInTheDocument()
    await expect(canvas.queryByText("Overview")).toBeNull()
    await expect(canvas.queryByText("Settings")).toBeNull()
    // Decorative: the form beside it says everything.
    await expect(canvasElement.querySelector(".select-none")).toHaveAttribute("aria-hidden", "true")
    // The person's corner is the one being filled in.
    const [spot] = spots(canvasElement)
    await expect(spots(canvasElement)).toHaveLength(1)
    await expect(spot?.querySelector(".rounded-full")).not.toBeNull()
  }
})

export const Buyer = meta.story({
  args: { step: "address", kind: "buyer", values: filledWizard },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("HG")).toBeInTheDocument()
    await expect(canvas.getByText("Harbor Goods")).toBeInTheDocument()
    await expect(canvas.getByText("Buyer workspace")).toBeInTheDocument()
    await expect(canvas.getByText("AR")).toBeInTheDocument()
    await expect(canvas.getByText("Alex Rivera")).toBeInTheDocument()
    await expect(canvas.getByText("Operations manager")).toBeInTheDocument()
    for (const page of ["Store", "Purchasing", "Orders", "Products", "Restock", "Purchase orders", "Shipments"]) {
      await expect(canvas.getByText(page)).toBeInTheDocument()
    }
    // The first page is open, and titles the page area.
    await expect(canvas.getAllByText("Overview")).toHaveLength(2)
    await expect(canvas.getByText("Settings")).toBeInTheDocument()
    await expect(canvas.getByText("Delivery address")).toBeInTheDocument()
    await expect(canvas.getByText("Warehouse")).toBeInTheDocument()
    await expect(canvas.getByText("12 Harbor Way, Oakland, CA, 94607, United States")).toBeInTheDocument()
    const [spot] = spots(canvasElement)
    await expect(spots(canvasElement)).toHaveLength(1)
    await expect(within(spot instanceof HTMLElement ? spot : canvasElement).getByText("Warehouse")).toBeInTheDocument()
  }
})

export const Supplier = meta.story({
  args: {
    step: "role",
    kind: "supplier",
    values: { ...filledWizard, kind: "supplier", company: { name: "Lotus Manufacturing", website: "", phone: "" } }
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("LM")).toBeInTheDocument()
    await expect(canvas.getByText("Supplier workspace")).toBeInTheDocument()
    for (const page of ["Sales", "Customers", "Inventory", "Catalogs", "Pickup address"]) {
      await expect(canvas.getByText(page)).toBeInTheDocument()
    }
    await expect(canvas.queryByText("Restock")).toBeNull()
    // Choosing a kind outlines both the workspace and its pages.
    await expect(spots(canvasElement)).toHaveLength(2)
  }
})

export const Forwarder = meta.story({
  args: {
    step: "company",
    kind: "forwarder",
    values: { ...filledWizard, kind: "forwarder", company: { name: "Bayline Freight", website: "", phone: "" } }
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("Forwarder workspace")).toBeInTheDocument()
    // A forwarder's only page opens first.
    await expect(canvas.getAllByText("Purchase orders")).toHaveLength(2)
    await expect(canvas.queryByText("Overview")).toBeNull()
    await expect(canvas.getByText("Warehouse address")).toBeInTheDocument()
    const [spot] = spots(canvasElement)
    await expect(spots(canvasElement)).toHaveLength(1)
    await expect(spot).toHaveTextContent("Bayline Freight")
  }
})

// A position typed before the list of positions shows as typed.
export const CustomPosition = meta.story({
  args: { values: blankWizard({ firstName: "Mei", lastName: "Chen", position: "Head of sourcing" }) },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("MC")).toBeInTheDocument()
    await expect(canvas.getByText("Head of sourcing")).toBeInTheDocument()
  }
})
