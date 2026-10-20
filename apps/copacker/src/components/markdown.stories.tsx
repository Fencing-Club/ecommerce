import { expect, within } from "storybook/test"
import preview from "#.storybook/preview"
import { Markdown } from "./markdown"

const instructions = `Keep the products in **separate cartons**.

- Seal each polybag completely.
- Record each carton's:
  - Weight and dimensions
  - Quantity of each SKU

3. Match each carton to its label.
4. Keep the cartons at the pickup address.

Contact [the buyer](mailto:buyer@example.com) if quantities differ.`

const meta = preview.meta({
  title: "Components/Display/Markdown",
  component: Markdown,
  args: { children: instructions }
})

export const Instructions = meta.story({
  play: async ({ canvas }) => {
    await expect(canvas.getByText("separate cartons", { selector: "strong" })).toBeVisible()
    const ordered = canvas.getAllByRole("list").find((list) => list.tagName === "OL")
    await expect(ordered).toHaveAttribute("start", "3")
    await expect(canvas.getByRole("link", { name: "the buyer" })).toHaveAttribute("href", "mailto:buyer@example.com")
    const carton = canvas.getByText(/Record each carton's/).closest("li")
    if (!carton) {
      throw new Error("Missing carton list item")
    }
    await expect(within(carton).getByRole("list")).toHaveTextContent("Weight and dimensions")
  }
})

export const Narrow = meta.story({
  render: (args) => (
    <div className="w-64">
      <Markdown {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    await expect(canvas.getByText("Quantity of each SKU")).toBeVisible()
  }
})

export const UntrustedContent = meta.story({
  args: {
    children:
      'Use **sealed bags**.\n\n<script>alert("unsafe")</script>\n\n[Unsafe link](javascript:alert%281%29)\n\n![Label example](https://example.com/label.png)'
  },
  play: async ({ canvas, canvasElement }) => {
    await expect(canvas.getByText("sealed bags", { selector: "strong" })).toBeVisible()
    await expect(canvasElement.querySelector("script")).toBeNull()
    await expect(canvas.queryByRole("img")).toBeNull()
    await expect(canvas.getByText("Label example")).toBeVisible()
    await expect(canvas.getByText("Unsafe link")).not.toHaveAttribute("href", expect.stringContaining("javascript:"))
  }
})
