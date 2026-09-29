import { delay, http, HttpResponse } from "msw"
import { expect, fn, mocked, screen, spyOn, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { member } from "@/stories/workspace"
import { ProductLabelBulk } from "./product-label-bulk"

const choices = [
  { productId: "gid://shopify/Product/501", title: "Canvas tote bag", variations: 2, productLabel: "standard" },
  { productId: "gid://shopify/Product/502", title: "Linen apron", variations: 1, productLabel: "uploaded" },
  { productId: "gid://shopify/Product/507", title: "Team jersey", variations: 6, productLabel: "none" }
]
const allIds = choices.map((choice) => choice.productId)

// What each story sent: label types set and label sheets asked for.
let sent: { url: string; body: unknown }[] = []

const labelsApi = [
  http.get("/api/inventory/product-labels", () => HttpResponse.json(choices)),
  http.patch("/api/inventory/product-labels", async ({ request }) => {
    const body = await request.json()
    sent.push({ url: "product-labels", body })
    const ids = typeof body === "object" && body !== null && "productIds" in body ? body.productIds : []
    return HttpResponse.json({ updated: Array.isArray(ids) ? ids.length : 0 })
  }),
  http.post("/api/inventory/labels", async ({ request }) => {
    sent.push({ url: "labels", body: await request.json() })
    return new HttpResponse(new Blob(["%PDF-1.7"], { type: "application/pdf" }), {
      headers: { "content-type": "application/pdf", "x-skipped-labels": "2" }
    })
  })
]

async function openSheet() {
  await userEvent.click(screen.getByRole("button", { name: "Manage labels" }))
  return within(await screen.findByRole("dialog", { name: "Manage labels" }))
}

const meta = preview.meta({
  component: ProductLabelBulk,
  args: { onChanged: fn() },
  beforeEach: ({ msw }) => {
    sent = []
    msw.use(...labelsApi)
  }
})

// Choosing products and setting their label type, such as marking uniforms as needing uploaded labels.
export const SetLabelType = meta.story({
  play: async ({ args }) => {
    const sheet = await openSheet()
    const products = await sheet.findByRole("list", { name: "Products" })
    await expect(within(products).getByText("6 variations")).toBeInTheDocument()
    await expect(within(products).getByText("Uploaded label")).toBeInTheDocument()
    await expect(sheet.getByText("0 selected")).toBeInTheDocument()
    await expect(sheet.getByRole("button", { name: /Set label type/ })).toBeDisabled()

    await userEvent.click(sheet.getByRole("checkbox", { name: "Team jersey 6 variations" }))
    await expect(sheet.getByRole("checkbox", { name: "Select all 3" })).toHaveAttribute("aria-checked", "mixed")
    await userEvent.click(sheet.getByRole("checkbox", { name: "Select all 3" }))
    await expect(sheet.getByText("3 selected")).toBeInTheDocument()

    await userEvent.click(sheet.getByRole("button", { name: /Set label type/ }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Uploaded label" }))
    await expect(await sheet.findByText("3 products set to uploaded label")).toBeInTheDocument()
    // The jersey, ticked first, then the rest in the list's order.
    const productIds = [allIds[2], allIds[0], allIds[1]]
    await expect(sent).toEqual([{ url: "product-labels", body: { productIds, productLabel: "uploaded" } }])
    await expect(args.onChanged).toHaveBeenCalledOnce()
  }
})

export const Search = meta.story({
  play: async () => {
    const sheet = await openSheet()
    await sheet.findByRole("list", { name: "Products" })
    await userEvent.type(sheet.getByRole("searchbox", { name: "Search products" }), "tote")
    await expect(sheet.getByRole("checkbox", { name: "Select all 1 matching" })).toBeInTheDocument()
    await expect(sheet.queryByText("Linen apron")).toBeNull()
    await userEvent.click(sheet.getByRole("checkbox", { name: "Select all 1 matching" }))
    await expect(sheet.getByText("1 selected")).toBeInTheDocument()

    await userEvent.clear(sheet.getByRole("searchbox", { name: "Search products" }))
    await userEvent.type(sheet.getByRole("searchbox", { name: "Search products" }), "wool")
    await expect(sheet.getByText("No products match")).toBeInTheDocument()
    await expect(sheet.getByRole("checkbox", { name: "Select all 0 matching" })).toHaveAttribute(
      "aria-disabled",
      "true"
    )
  }
})

// Labels download as one PDF; variations without a label are left out and counted.
export const Download = meta.story({
  beforeEach: () => {
    const click = spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
    return () => click.mockRestore()
  },
  play: async () => {
    const sheet = await openSheet()
    await userEvent.click(await sheet.findByRole("checkbox", { name: "Linen apron 1 variation" }))
    await userEvent.click(sheet.getByRole("button", { name: "Download labels" }))
    await expect(await sheet.findByText("Downloaded, left out 2 variations without a label")).toBeInTheDocument()
    await expect(sent).toEqual([{ url: "labels", body: { productIds: ["gid://shopify/Product/502"] } }])
    const [link] = mocked(HTMLAnchorElement.prototype.click).mock.contexts
    await expect(link instanceof HTMLAnchorElement && link.download).toBe("Product labels.pdf")
  }
})

export const DownloadFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/inventory/labels", () =>
        HttpResponse.json({ error: "No labels to make for these products" }, { status: 422 })
      )
    )
  },
  play: async () => {
    const sheet = await openSheet()
    await userEvent.click(await sheet.findByRole("checkbox", { name: "Canvas tote bag 2 variations" }))
    await userEvent.click(sheet.getByRole("button", { name: "Download labels" }))
    await expect(await sheet.findByText("No labels to make for these products")).toBeInTheDocument()
  }
})

export const SetTypeFailed = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.patch("/api/inventory/product-labels", () => new HttpResponse(null, { status: 500 })))
  },
  play: async ({ args }) => {
    const sheet = await openSheet()
    await userEvent.click(await sheet.findByRole("checkbox", { name: "Canvas tote bag 2 variations" }))
    await userEvent.click(sheet.getByRole("button", { name: /Set label type/ }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "No label" }))
    await expect(await sheet.findByText("Couldn’t save the label type. Try again.")).toBeInTheDocument()
    await expect(args.onChanged).not.toHaveBeenCalled()
  }
})

export const Loading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/inventory/product-labels", async () => {
        await delay("infinite")
        return HttpResponse.json(choices)
      })
    )
  },
  play: async () => {
    const sheet = await openSheet()
    await expect(sheet.getByText("Loading products…")).toBeInTheDocument()
    await expect(sheet.getByRole("checkbox", { name: "Select all 0" })).toHaveAttribute("aria-disabled", "true")
  }
})

// Someone who can only view products downloads labels but doesn't change their type.
export const ViewOnly = meta.story({
  parameters: { permissions: member },
  play: async () => {
    const sheet = await openSheet()
    await sheet.findByRole("list", { name: "Products" })
    await expect(sheet.queryByRole("button", { name: /Set label type/ })).toBeNull()
    await expect(sheet.getByRole("button", { name: "Download labels" })).toBeDisabled()
  }
})

// Closing the panel clears the selection.
export const CloseClears = meta.story({
  play: async () => {
    const sheet = await openSheet()
    await userEvent.click(await sheet.findByRole("checkbox", { name: "Select all 3" }))
    await expect(sheet.getByText("3 selected")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    const reopened = await openSheet()
    await expect(reopened.getByText("0 selected")).toBeInTheDocument()
  }
})
