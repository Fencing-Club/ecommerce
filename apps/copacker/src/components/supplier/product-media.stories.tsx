import { http, HttpResponse } from "msw/http"
import { useState } from "react"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { toteProduct } from "@/stories/fixtures/supplier"
import { ProductMedia } from "./product-media"

const uploaded = fn()

// The photos holding their own list, as the product editor does.
function Media({ onChange, ...props }: React.ComponentProps<typeof ProductMedia>) {
  const [images, setImages] = useState(props.images)
  return (
    <ProductMedia
      images={images}
      onChange={(next) => {
        setImages(next)
        onChange(next)
      }}
    />
  )
}

// A product's photos: upload several at once, remove one, or make one the main photo.
const meta = preview.meta({
  title: "Components/Supplier workspace/Product media",
  component: ProductMedia,
  args: { images: toteProduct.images, onChange: fn() },
  render: (args) => <Media {...args} />,
  beforeEach: ({ msw }) => {
    uploaded.mockClear()
    msw.use(
      // A file named bad-* is refused.
      http.post("/api/product-images", async ({ request }) => {
        const file = (await request.formData()).get("file")
        const name = file instanceof File ? file.name : ""
        uploaded(name)
        return name.startsWith("bad")
          ? HttpResponse.json({ error: "Photos must be under 10 MB" }, { status: 413 })
          : HttpResponse.json({ key: `supplier-images/org_supplier/${name}`, name, contentType: "image/png" })
      })
    )
  }
})

const png = (name: string) => new File(["png"], name, { type: "image/png" })
const images = (canvas: { getAllByRole: (role: string) => HTMLElement[] }) =>
  canvas.getAllByRole("img").map((image) => image.getAttribute("alt"))

export const Arrange = meta.story({
  play: async ({ args, canvas }) => {
    await expect(images(canvas)).toEqual(["tote.png", "tote-back.png"])
    await userEvent.click(canvas.getByRole("button", { name: "Make tote-back.png the main photo" }))
    await expect(images(canvas)).toEqual(["tote-back.png", "tote.png"])
    await userEvent.click(canvas.getByRole("button", { name: "Remove tote.png" }))
    await expect(images(canvas)).toEqual(["tote-back.png"])
    await expect(args.onChange).toHaveBeenLastCalledWith([toteProduct.images[1]])
  }
})

// Every photo that uploads is kept; one that's refused says why.
export const Upload = meta.story({
  play: async ({ canvas, canvasElement }) => {
    const input = canvasElement.querySelector<HTMLInputElement>("input[type=file]")!
    await userEvent.upload(input, [png("strap.png"), png("bad-scan.png")])
    await waitFor(() => expect(images(canvas)).toEqual(["tote.png", "tote-back.png", "strap.png"]))
    await expect(uploaded).toHaveBeenCalledWith("bad-scan.png")
    await expect(canvas.getByText("bad-scan.png").parentElement).toHaveTextContent(
      "bad-scan.png: Photos must be under 10 MB"
    )
  }
})

export const Empty = meta.story({
  args: { images: [] },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Add photos" })).toBeVisible()
    await expect(canvas.queryByRole("img")).toBeNull()
  }
})
