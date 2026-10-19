import { useState } from "react"
import { expect, fireEvent, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { FileDropzone, pdfFiles } from "./file-dropzone"

type Props = React.ComponentProps<typeof FileDropzone>

// The zone with its parent keeping the chosen file, as every page that uses it does.
function Controlled({ file: initial, onFileChange, ...props }: Props) {
  const [file, setFile] = useState(initial)
  return (
    <div className="max-w-md">
      <FileDropzone
        {...props}
        file={file}
        onFileChange={(next) => {
          setFile(next)
          onFileChange(next)
        }}
      />
    </div>
  )
}

const meta = preview.meta({
  title: "Components/Forms/File dropzone",
  component: Controlled,
  args: {
    accept: pdfFiles,
    maxBytes: 32 * 1024 * 1024,
    file: null,
    onFileChange: fn(),
    label: "Commercial invoice",
    name: "invoice"
  }
})

const pdf = (name = "lotus-invoice-8812.pdf", bytes = 240 * 1024) =>
  new File([new Uint8Array(bytes)], name, { type: "application/pdf" })

// Drops files on an element as a browser does, with the files in the drag's data.
function drop(target: Element, files: File[]) {
  const dataTransfer = new DataTransfer()
  for (const file of files) {
    dataTransfer.items.add(file)
  }
  fireEvent(target, new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }))
}

function fileInput(canvasElement: HTMLElement) {
  const input = canvasElement.querySelector("input[type=file]")
  if (!(input instanceof HTMLInputElement)) {
    throw new Error("The zone has no file input")
  }
  return input
}

export const ChooseAndRemove = meta.story({
  play: async ({ canvas, canvasElement, args }) => {
    const zone = canvas.getByRole("button", { name: "Commercial invoice Drop a PDF or browse" })
    await expect(zone).toHaveAccessibleDescription("Up to 32 MB")
    const file = pdf()
    await userEvent.upload(fileInput(canvasElement), file)
    await expect(args.onFileChange).toHaveBeenCalledWith(file)
    await expect(await canvas.findByText("lotus-invoice-8812.pdf")).toBeVisible()
    // The name reads left to right in every language, and so does its tooltip, which is on the same element.
    await expect(canvas.getByText("lotus-invoice-8812.pdf")).toHaveAttribute("dir", "ltr")
    await expect(canvas.getByText("lotus-invoice-8812.pdf")).toHaveAttribute("title", "lotus-invoice-8812.pdf")
    await expect(canvas.getByText("240 kB")).toBeVisible()
    // The row takes focus once the file shows.
    await waitFor(() => expect(canvas.getByText("lotus-invoice-8812.pdf").closest("[tabindex='-1']")).toHaveFocus())
    await expect(fileInput(canvasElement).files?.[0]).toBe(file)
    await userEvent.click(canvas.getByRole("button", { name: "Remove lotus-invoice-8812.pdf" }))
    await expect(args.onFileChange).toHaveBeenLastCalledWith(null)
    const again = await canvas.findByRole("button", { name: /Drop a PDF or browse/ })
    await waitFor(() => expect(again).toHaveFocus())
    await expect(fileInput(canvasElement)).toHaveValue("")
  }
})

export const DropFile = meta.story({
  play: async ({ canvas, args }) => {
    const file = pdf("packing-list.pdf", 3 * 1024 * 1024)
    drop(canvas.getByRole("button", { name: /Drop a PDF/ }), [file])
    await expect(await canvas.findByText("packing-list.pdf")).toBeVisible()
    await expect(canvas.getByText("3 MB")).toBeVisible()
    await expect(args.onFileChange).toHaveBeenCalledWith(file)
  }
})

export const WrongType = meta.story({
  play: async ({ canvas, args }) => {
    const zone = canvas.getByRole("button", { name: /Drop a PDF/ })
    drop(zone, [new File(["id,sku"], "catalog.csv", { type: "text/csv" })])
    await expect(await canvas.findByText("Choose a PDF")).toBeVisible()
    await expect(zone).toHaveAttribute("data-invalid", "true")
    await expect(zone).toHaveAccessibleDescription("Up to 32 MB Choose a PDF")
    await expect(args.onFileChange).not.toHaveBeenCalled()
  }
})

// Dropping several files takes none of them and says to choose one; a single file then goes in.
export const OneFileOnly = meta.story({
  play: async ({ canvas, args }) => {
    const zone = canvas.getByRole("button", { name: /Drop a PDF/ })
    drop(zone, [pdf("invoice-a.pdf"), pdf("invoice-b.pdf")])
    await expect(await canvas.findByText("Choose one PDF")).toBeVisible()
    await expect(zone).toHaveAttribute("data-invalid", "true")
    await expect(canvas.queryByText("invoice-a.pdf")).toBeNull()
    await expect(args.onFileChange).not.toHaveBeenCalled()
    // A wrong file among them doesn't change that.
    drop(zone, [new File(["id,sku"], "catalog.csv", { type: "text/csv" }), pdf("invoice-a.pdf")])
    await expect(await canvas.findByText("Choose one PDF")).toBeVisible()
    await expect(args.onFileChange).not.toHaveBeenCalled()
    const file = pdf("invoice-a.pdf")
    drop(zone, [file])
    await expect(await canvas.findByText("invoice-a.pdf")).toBeVisible()
    await expect(canvas.queryByText("Choose one PDF")).toBeNull()
    await expect(args.onFileChange).toHaveBeenCalledWith(file)
  }
})

// A CSV import that takes files up to 1 KB, without a label.
export const TooLarge = meta.story({
  args: { accept: { "text/csv": [".csv"] }, maxBytes: 1024, label: undefined },
  play: async ({ canvas, args }) => {
    const zone = canvas.getByRole("button", { name: /Drop a CSV or browse/ })
    await expect(canvas.getByText("Up to 1 kB")).toBeVisible()
    drop(zone, [new File([new Uint8Array(4096)], "catalog.csv", { type: "text/csv" })])
    await expect(await canvas.findByText("Choose a CSV up to 1 kB")).toBeVisible()
    await expect(args.onFileChange).not.toHaveBeenCalled()
    // A file that fits clears the problem.
    drop(zone, [new File(["sku,units\nTOTE-001,240"], "catalog.csv", { type: "text/csv" })])
    await expect(await canvas.findByText("catalog.csv")).toBeVisible()
    await expect(canvas.queryByText("Choose a CSV up to 1 kB")).toBeNull()
  }
})

// Any kind of file, with the zone's own hint.
export const AnyFile = meta.story({
  args: { accept: { "application/pdf": [".pdf"], "image/png": [".png"] }, hint: "A PDF or a photo of the label" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Drop a file or browse/ })).toBeVisible()
    await expect(canvas.getByText("A PDF or a photo of the label")).toBeVisible()
    await expect(canvas.queryByText("Up to 32 MB")).toBeNull()
  }
})

// A file already stored shows in place of the zone, with Replace; a new file takes its place.
export const StoredFile = meta.story({
  args: { current: { name: "lotus-invoice-8790.pdf", size: 180 * 1024, href: "/api/documents/doc-invoice" } },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByRole("link", { name: "lotus-invoice-8790.pdf" })).toHaveAttribute(
      "href",
      "/api/documents/doc-invoice"
    )
    await expect(canvas.getByText("lotus-invoice-8790.pdf")).toHaveAttribute("dir", "ltr")
    await expect(canvas.getByText("lotus-invoice-8790.pdf")).toHaveAttribute("title", "lotus-invoice-8790.pdf")
    await expect(canvas.getByText("180 kB")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Replace lotus-invoice-8790.pdf" })).toBeEnabled()
    await expect(canvas.queryByRole("button", { name: /Drop a PDF/ })).toBeNull()
    await userEvent.upload(fileInput(canvasElement), pdf("lotus-invoice-8812.pdf"))
    await expect(await canvas.findByText("lotus-invoice-8812.pdf")).toBeVisible()
    await expect(canvas.queryByRole("link", { name: "lotus-invoice-8790.pdf" })).toBeNull()
  }
})

export const StoredWithoutLink = meta.story({
  args: { current: { name: "carton-labels.pdf" } },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("carton-labels.pdf")).toBeVisible()
    await expect(canvas.getByText("carton-labels.pdf")).toHaveAttribute("dir", "ltr")
    await expect(canvas.getByText("carton-labels.pdf")).toHaveAttribute("title", "carton-labels.pdf")
    await expect(canvas.queryByRole("link")).toBeNull()
  }
})

// The parent's own problem, such as a required invoice that's missing.
export const ParentError = meta.story({
  args: { error: "Upload the commercial invoice" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("alert")).toHaveTextContent("Upload the commercial invoice")
    await expect(canvas.getByRole("button", { name: /Drop a PDF/ })).toHaveAttribute("data-invalid", "true")
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas, args }) => {
    const zone = canvas.getByRole("button", { name: /Drop a PDF/ })
    await expect(zone).toBeDisabled()
    drop(zone, [pdf()])
    await expect(args.onFileChange).not.toHaveBeenCalled()
  }
})

// What the parent shows in the file's row, such as an upload's progress.
export const WithRowContent = meta.story({
  args: { file: pdf(), children: <span>Uploading</span> },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Uploading")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Remove lotus-invoice-8812.pdf" })).toBeEnabled()
  }
})
