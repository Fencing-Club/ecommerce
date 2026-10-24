import { expect } from "storybook/test"
import preview from "#.storybook/preview"
import { lotusFactory } from "@/stories/fixtures/parties"
import { AddressText } from "./address-text"

const meta = preview.meta({
  title: "Components/Display/Address text",
  component: AddressText,
  args: { name: "Yiwu warehouse", address: lotusFactory }
})

// A line each for the place's name, its street lines, and the city, region, postal code and country.
export const Lines = meta.story({
  play: async ({ canvas }) => {
    for (const line of ["Yiwu warehouse", "1000 Siji Road", "Building 3", "Yiwu, Zhejiang 322000, CN"]) {
      await expect(canvas.getByText(line)).toBeVisible()
    }
    await expect(canvas.queryByText(/Mei Chen/)).toBeNull()
  }
})

// With who to call there: the address's name, and its phone number as a link to call.
export const WithContact = meta.story({
  args: { contact: true },
  play: async ({ canvas }) => {
    const phone = canvas.getByRole("link", { name: "+86 579 8555 1234" })
    await expect(phone).toHaveAttribute("href", "tel:+8657985551234")
    await expect(phone.parentElement).toHaveTextContent("Mei Chen, +86 579 8555 1234")
  }
})
