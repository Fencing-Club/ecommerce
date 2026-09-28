import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion"

const questions = [
  { value: "suppliers", question: "Can I invite my suppliers?", answer: "Yes. They see only your purchase orders." },
  { value: "stores", question: "Which stores connect?", answer: "Shopify, Amazon and eBay." },
  { value: "units", question: "How are packs counted?", answer: "In units, so a pack of 6 counts as 6 units." }
]

const meta = preview.meta({
  component: Accordion,
  args: { onValueChange: fn() },
  render: (args) => (
    <Accordion {...args} className="max-w-md">
      {questions.map((item) => (
        <AccordionItem key={item.value} value={item.value}>
          <AccordionTrigger>{item.question}</AccordionTrigger>
          <AccordionContent>{item.answer}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    const first = canvas.getByRole("button", { name: "Can I invite my suppliers?" })
    const second = canvas.getByRole("button", { name: "Which stores connect?" })
    await expect(first).toHaveAttribute("aria-expanded", "false")
    await expect(canvas.queryByText("Shopify, Amazon and eBay.")).not.toBeInTheDocument()

    await userEvent.click(first)
    await expect(first).toHaveAttribute("aria-expanded", "true")
    await expect(await canvas.findByText("Yes. They see only your purchase orders.")).toBeVisible()
    await expect(args.onValueChange).toHaveBeenLastCalledWith(["suppliers"], expect.anything())

    // Opening another closes the first.
    await userEvent.click(second)
    await expect(second).toHaveAttribute("aria-expanded", "true")
    await expect(first).toHaveAttribute("aria-expanded", "false")
    await expect(args.onValueChange).toHaveBeenLastCalledWith(["stores"], expect.anything())

    await userEvent.click(second)
    await expect(second).toHaveAttribute("aria-expanded", "false")
    await waitFor(() => expect(canvas.queryByText("Shopify, Amazon and eBay.")).not.toBeInTheDocument())
  }
})

export const Multiple = meta.story({
  args: { multiple: true, defaultValue: ["units"] },
  play: async ({ canvas }) => {
    await expect(canvas.getByText("In units, so a pack of 6 counts as 6 units.")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Which stores connect?" }))
    await expect(canvas.getByRole("button", { name: "Which stores connect?" })).toHaveAttribute("aria-expanded", "true")
    await expect(canvas.getByRole("button", { name: "How are packs counted?" })).toHaveAttribute(
      "aria-expanded",
      "true"
    )
  }
})

export const Keyboard = meta.story({
  play: async ({ canvas }) => {
    canvas.getByRole("button", { name: "Can I invite my suppliers?" }).focus()
    await userEvent.tab()
    const second = canvas.getByRole("button", { name: "Which stores connect?" })
    await expect(second).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await expect(second).toHaveAttribute("aria-expanded", "true")
  }
})

export const Disabled = meta.story({
  args: { disabled: true },
  play: async ({ canvas }) => {
    const first = canvas.getByRole("button", { name: "Can I invite my suppliers?" })
    await expect(first).toHaveAttribute("aria-disabled", "true")
  }
})
