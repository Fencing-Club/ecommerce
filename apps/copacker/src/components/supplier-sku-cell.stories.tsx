import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { Input } from "@/components/ui/input"
import { SupplierSkuCell } from "./supplier-sku-cell"

const meta = preview.meta({
  title: "Components/Purchase orders/Supplier SKU cell",
  component: SupplierSkuCell,
  args: { item: { supplierSku: "LM-TOTE-NAT" } }
})

export const OwnSku = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("LM-TOTE-NAT")).toBeVisible()
  }
})

// A line without one says so.
export const NotSet = meta.story({
  args: { item: { supplierSku: "" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Not set")).toBeVisible()
  }
})

// A bundle lists each component with how many go in it: by its supplier SKU, or the buyer's when it has none.
export const Bundle = meta.story({
  args: {
    item: {
      supplierSku: "",
      components: [
        { variantId: "gid://shopify/ProductVariant/901", buyerSku: "TOTE", supplierSku: "LM-TOTE", quantity: 2 },
        { variantId: "gid://shopify/ProductVariant/902", buyerSku: "POUCH", supplierSku: null, quantity: 1 },
        { variantId: "gid://shopify/ProductVariant/903", buyerSku: null, supplierSku: null, quantity: 1 }
      ]
    },
    children: <Input aria-label="Supplier SKU" />
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("2 × LM-TOTE", { exact: true })).toBeVisible()
    await expect(canvas.getByText("1 × POUCH", { exact: true })).toBeVisible()
    await expect(canvas.getByText("1 × Not set", { exact: true })).toBeVisible()
    // Its SKUs come from the components, so there's no field for one.
    await expect(canvas.queryByRole("textbox", { name: "Supplier SKU" })).toBeNull()
  }
})

// The editor's field in place of the SKU.
export const InTheEditor = meta.story({
  args: { children: <Input aria-label="Supplier SKU" defaultValue="LM-TOTE-NAT" /> },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("textbox", { name: "Supplier SKU" })).toHaveValue("LM-TOTE-NAT")
  }
})
