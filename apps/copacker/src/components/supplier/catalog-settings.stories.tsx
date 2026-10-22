import { useState } from "react"
import { expect, fn, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { newCatalog, wholesaleCatalog } from "@/stories/fixtures/supplier"
import { chooseOption } from "@/stories/play"
import { type CatalogSettingsDraft, CatalogSettings, initialSettings } from "./catalog-settings"

// The settings holding their own draft, as the catalog editor does.
function Settings({ onChange, ...props }: React.ComponentProps<typeof CatalogSettings>) {
  const [settings, setSettings] = useState(props.settings)
  return (
    <CatalogSettings
      {...props}
      settings={settings}
      onChange={(next: Partial<CatalogSettingsDraft>) => {
        setSettings({ ...settings, ...next })
        onChange(next)
      }}
    />
  )
}

// A catalog's title, status and customers, and the adjustment for every price it doesn't fix.
const meta = preview.meta({
  title: "Components/Supplier workspace/Catalog settings",
  component: CatalogSettings,
  args: {
    settings: initialSettings(wholesaleCatalog.catalog, wholesaleCatalog.customers),
    customers: wholesaleCatalog.customers,
    readOnly: false,
    onChange: fn()
  },
  render: (args) => <Settings {...args} />
})

export const Existing = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toHaveValue("Wholesale 2026")
    await expect(canvas.getByText("14/255")).toBeVisible()
    await expect(canvas.getByRole("combobox", { name: "Status" })).toHaveTextContent("Active")
    await expect(canvas.getByText("Harbor Goods")).toBeVisible()
    await expect(canvas.getByRole("textbox", { name: "Price adjustment" })).toHaveValue("10")
    await expect(canvas.getByText("Applies to every price you don’t fix below. $100 becomes $90.")).toBeVisible()
  }
})

// Choosing a status hands back its own value; an inactive catalog's customers see list prices.
export const ChangeStatus = meta.story({
  play: async ({ args, canvas }) => {
    await chooseOption(canvas.getByRole("combobox", { name: "Status" }), "Draft")
    await expect(args.onChange).toHaveBeenCalledWith({ status: "draft" })
    await expect(
      canvas.getByText("Customers see every active product at its own price until the catalog is active.")
    ).toBeVisible()
  }
})

export const Adjustment = meta.story({
  play: async ({ args, canvas }) => {
    await chooseOption(canvas.getByRole("combobox", { name: "Adjustment direction" }), "Increase by")
    await expect(args.onChange).toHaveBeenCalledWith({ direction: "increase" })
    await expect(canvas.getByText(/\$100 becomes \$110/)).toBeVisible()
    const percent = canvas.getByRole("textbox", { name: "Price adjustment" })
    await userEvent.clear(percent)
    await userEvent.type(percent, "1001")
    await expect(percent).toHaveAttribute("aria-invalid", "true")
    await expect(canvas.getByText("Enter 0 to 1,000.")).toBeVisible()
  }
})

export const New = meta.story({
  args: { settings: initialSettings(newCatalog.catalog, newCatalog.customers), customers: newCatalog.customers },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toHaveValue("")
    await expect(canvas.getByRole("combobox", { name: "Add customers" })).toHaveAttribute(
      "placeholder",
      "Add customers"
    )
    await expect(canvas.getByText("Applies to every price you don’t fix below.")).toBeVisible()
  }
})

export const NoCustomers = meta.story({
  args: { customers: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Customers appear once a buyer adds you as their supplier.")).toBeVisible()
  }
})

export const ReadOnly = meta.story({
  args: { readOnly: true },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: /Title/ })).toBeDisabled()
    await expect(canvas.getByRole("textbox", { name: "Price adjustment" })).toBeDisabled()
  }
})
