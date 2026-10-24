import { http, HttpResponse } from "msw/http"
import { delay } from "msw/utils/delay"
import { expect, fireEvent, fn, screen, userEvent, waitFor, within } from "storybook/test"
import preview from "#.storybook/preview"
import { getStoryRouter } from "#.storybook/router"
import { importId, importList } from "@/stories/fixtures/purchase-orders"
import urdu from "../../messages/ur/orders.json"
import { ImportIntake } from "./import-intake"

const listed = fn()
const changed = fn()
const started = fn()

const meta = preview.meta({
  title: "Components/Purchase orders/Import intake",
  component: ImportIntake,
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/imports", () => {
        listed()
        return HttpResponse.json({ items: importList })
      }),
      http.post("/api/imports", async ({ request }) => {
        const file = (await request.formData()).get("file")
        started(file instanceof File ? file.name : null)
        return HttpResponse.json({ id: importId })
      }),
      http.all("/api/imports/:id", ({ params, request }) => {
        changed(params.id, request.method)
        return HttpResponse.json({ ok: true })
      })
    )
  }
})

function row(canvas: ReturnType<typeof within>, file: string) {
  return within(canvas.getByText(file, { selector: "a, span" }).closest("tr")!)
}

export const Imports = meta.story({
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("lotus-po-118.pdf")).toBeVisible()
    await expect(canvas.getAllByRole("row")).toHaveLength(importList.length + 1)
    // File names read left to right in every language, with a link or without, and so do their tooltips.
    for (const file of ["lotus-po-118.pdf", "scan-0921.pdf"]) {
      await expect(canvas.getByText(file)).toHaveAttribute("dir", "ltr")
      await expect(canvas.getByText(file)).toHaveAttribute("title", file)
    }
    for (const status of ["Waiting", "Processing", "Ready for review", "Failed", "Canceled", "Saved as draft"]) {
      await expect(canvas.getByText(status)).toBeVisible()
    }
    // A review opens its review page, and a saved import its draft.
    await expect(row(canvas, "lotus-po-118.pdf").getByRole("button", { name: "Review" })).toHaveAttribute(
      "href",
      `/orders/import/${importId}`
    )
    await expect(row(canvas, "northwind-invoice.pdf").getByRole("button", { name: "Open draft" })).toBeVisible()
    await expect(row(canvas, "scan-0921.pdf").queryByRole("link")).toBeNull()
    await userEvent.click(row(canvas, "lotus-po-118.pdf").getByText("Ready for review"))
    await expect(getStoryRouter().navigate).toHaveBeenCalledWith({ href: `/orders/import/${importId}` })
  }
})

export const RetryAndCancel = meta.story({
  play: async ({ canvas }) => {
    await canvas.findByText("blurry-scan.pdf")
    await userEvent.click(row(canvas, "blurry-scan.pdf").getByRole("button", { name: "Retry" }))
    await waitFor(() => expect(changed).toHaveBeenCalledWith(importList[3]!.id, "POST"))
    // The list reloads after the change.
    await waitFor(() => expect(listed).toHaveBeenCalledTimes(2))

    await userEvent.click(canvas.getByRole("button", { name: "More for scan-0921.pdf" }))
    await expect(await screen.findByRole("menuitem", { name: "View PDF" })).toHaveAttribute(
      "href",
      `/api/imports/${importList[0]!.id}/source`
    )
    await userEvent.click(screen.getByRole("menuitem", { name: "Cancel import" }))
    await waitFor(() => expect(changed).toHaveBeenCalledWith(importList[0]!.id, "DELETE"))
    await waitFor(() => expect(screen.queryByRole("menuitem")).toBeNull())

    // A saved or cancelled import can't be cancelled.
    await userEvent.click(canvas.getByRole("button", { name: "More for northwind-invoice.pdf" }))
    await screen.findByRole("menuitem", { name: "View PDF" })
    await expect(screen.queryByRole("menuitem", { name: "Cancel import" })).toBeNull()
  }
})

// On a phone, Retry is in the row's menu, so file names keep room to be read, even with Urdu's longer labels.
export const Phone = meta.story({
  globals: { locale: "ur", viewport: { value: "mobile", isRotated: false } },
  play: async ({ canvas }) => {
    const name = await canvas.findByText("blurry-scan.pdf")
    await expect(name.parentElement!.clientWidth).toBeGreaterThan(100)
    // The date under the name stays in its cell.
    const cell = name.closest("td")!
    await expect(cell.scrollWidth).toBeLessThanOrEqual(cell.clientWidth)
    await expect(canvas.queryByRole("button", { name: urdu.intake.retry })).toBeNull()
    await userEvent.click(canvas.getByRole("button", { name: /^blurry-scan\.pdf/ }))
    await userEvent.click(await screen.findByRole("menuitem", { name: urdu.intake.retry }))
    await waitFor(() => expect(changed).toHaveBeenCalledWith(importList[3]!.id, "POST"))
  }
})

export const ChangeFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/imports/:id", () => HttpResponse.json({ error: "This import already finished" }, { status: 409 }))
    )
  },
  play: async ({ canvas }) => {
    await userEvent.click(await canvas.findByRole("button", { name: "Retry" }))
    await expect(await canvas.findByText("This import already finished")).toBeVisible()
  }
})

export const Upload = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const start = canvas.getByRole("button", { name: "Import" })
    await expect(start).toBeDisabled()
    const input = canvasElement.querySelector<HTMLInputElement>("input[type=file]")!
    await userEvent.upload(input, new File(["%PDF-1.7"], "juniper-po.pdf", { type: "application/pdf" }))
    await expect(canvas.getByText("juniper-po.pdf")).toBeVisible()
    await expect(started).not.toHaveBeenCalled()
    await userEvent.click(start)
    await waitFor(() => expect(started).toHaveBeenCalledWith("juniper-po.pdf"))
    // The dropzone clears for the next file, and the list reloads with the new import.
    await waitFor(() => expect(canvas.queryByText("juniper-po.pdf")).toBeNull())
    await waitFor(() => expect(listed).toHaveBeenCalledTimes(2))
  }
})

export const UploadFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.post("/api/imports", () =>
        HttpResponse.json({ error: "Choose a PDF of 50 pages or fewer" }, { status: 413 })
      )
    )
  },
  play: async ({ canvas, canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>("input[type=file]")!
    await userEvent.upload(input, new File(["%PDF-1.7"], "catalog.pdf", { type: "application/pdf" }))
    await userEvent.click(canvas.getByRole("button", { name: "Import" }))
    await expect(await canvas.findByText("Choose a PDF of 50 pages or fewer")).toBeVisible()
    // The file stays chosen, to try again.
    await expect(canvas.getByText("catalog.pdf")).toBeVisible()
  }
})

export const Empty = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/imports", () => HttpResponse.json({ items: [] })))
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Drop a PDF or browse/ })).toBeVisible()
    await expect(canvas.queryByRole("table")).toBeNull()
  }
})

export const AttachBeforeImport = meta.story({
  play: async ({ canvas, canvasElement }) => {
    await canvas.findByText("lotus-po-118.pdf")
    const zone = canvas.getByRole("button", { name: /Drop a PDF or browse/ })
    const card = zone.closest('[data-slot="card"]')
    const dataTransfer = new DataTransfer()
    dataTransfer.items.add(new File(["%PDF-1.7"], "supplier-order.pdf", { type: "application/pdf" }))
    fireEvent(zone, new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }))
    const attached = await canvas.findByText("supplier-order.pdf")
    await expect(attached.closest('[data-slot="card"]')).toBe(card)
    await expect(canvas.getByRole("table").closest('[data-slot="card"]')).toBe(card)
    await expect(canvasElement.querySelectorAll('[data-slot="card"]')).toHaveLength(1)
    await expect(started).not.toHaveBeenCalled()
    await expect(canvas.getByRole("button", { name: /^Import$/ })).toBeEnabled()
    await userEvent.click(canvas.getByRole("button", { name: "Remove supplier-order.pdf" }))
    await expect(canvas.queryByText("supplier-order.pdf")).toBeNull()
    await expect(canvas.getByRole("button", { name: /^Import$/ })).toBeDisabled()
    await expect(started).not.toHaveBeenCalled()
  }
})

export const Loading = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(
      http.get("/api/imports", async () => {
        await delay("infinite")
        return HttpResponse.json({ items: [] })
      })
    )
  },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Loading imports…")).toBeVisible()
  }
})

export const ListFails = meta.story({
  beforeEach: ({ msw }) => {
    msw.use(http.get("/api/imports", () => HttpResponse.json({ error: "Imports are unavailable" }, { status: 503 })))
  },
  play: async ({ canvas }) => {
    await expect(await canvas.findByText("Imports are unavailable")).toBeVisible()
  }
})
