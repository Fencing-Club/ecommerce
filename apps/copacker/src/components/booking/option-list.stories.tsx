import { useState } from "react"
import { expect, fn, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { StatusBadge } from "@/components/common"
import { OptionList } from "./option-list"

type Props = React.ComponentProps<typeof OptionList>

// The list with its parent keeping the choice, as the FBA steps do.
function Controlled({ value: initial, onValueChange, ...props }: Props) {
  const [value, setValue] = useState(initial)
  return (
    <div className="max-w-lg">
      <OptionList
        {...props}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onValueChange(next)
        }}
      />
    </div>
  )
}

const meta = preview.meta({
  component: Controlled,
  args: {
    "aria-label": "Choose how to ship",
    value: "hgr6",
    onValueChange: fn(),
    options: [
      {
        value: "hgr6",
        title: "Hagerstown, MD",
        badge: (
          <StatusBadge tone="success" icon={false}>
            Lowest total
          </StatusBadge>
        ),
        description: "HGR6, includes a $40.20 placement fee",
        price: "$144.12"
      },
      { value: "poc1", title: "Fontana, CA", description: "POC1, includes a $77.20 placement fee", price: "$155.91" },
      {
        value: "bna6",
        title: "Clarksville, TN",
        description: "BNA6, includes a $58.70 placement fee",
        price: "$167.56"
      },
      {
        value: "split",
        title: "5 warehouses",
        description: "BJC1, IAH3, RDU2, SWF2, MCC1, no placement fee",
        price: "$184.78"
      }
    ]
  }
})

// Where Amazon places the shipment: each choice a radio row named by its title and described by its badge, its line
// and its price. The whole row picks it, and the chosen row is shaded.
export const Placements = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("radiogroup", { name: "Choose how to ship" })).toBeVisible()
    await expect(canvas.getAllByRole("radio")).toHaveLength(4)
    const hagerstown = canvas.getByRole("radio", { name: "Hagerstown, MD" })
    await expect(hagerstown).toHaveAttribute("aria-checked", "true")
    await expect(hagerstown).toHaveAccessibleDescription("Lowest total HGR6, includes a $40.20 placement fee $144.12")

    await userEvent.click(canvas.getByText("POC1, includes a $77.20 placement fee"))
    await expect(args.onValueChange).toHaveBeenCalledWith("poc1")
    const fontana = canvas.getByRole("radio", { name: "Fontana, CA" })
    await expect(fontana).toHaveAttribute("aria-checked", "true")
    const shade = (radio: HTMLElement) => getComputedStyle(radio.closest("label") ?? radio).backgroundColor
    await expect(shade(fontana)).not.toBe(shade(hagerstown))
  }
})

// Arrow keys move the choice, as in any radio group.
export const Keyboard = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.tab()
    await expect(canvas.getByRole("radio", { name: "Hagerstown, MD" })).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    const fontana = canvas.getByRole("radio", { name: "Fontana, CA" })
    // The group moves focus once it has rendered the key press, and the radio checks itself as it takes focus.
    await waitFor(() => expect(fontana).toHaveAttribute("aria-checked", "true"))
    await expect(fontana).toHaveFocus()
    await expect(args.onValueChange).toHaveBeenCalledWith("poc1")
  }
})

// Who carries it: the quotes, cheapest first, and your own carrier.
export const Carriers = meta.story({
  args: {
    "aria-label": "Choose a carrier",
    value: "amass-standard",
    options: [
      {
        value: "amass-standard",
        title: "Amass",
        badge: (
          <StatusBadge tone="success" icon={false}>
            Cheapest
          </StatusBadge>
        ),
        description: "Standard truck, Ocean LCL",
        price: "$144.12"
      },
      { value: "niuku-standard", title: "Niuku", description: "Standard truck, Ocean LCL", price: "$158.37" },
      { value: "catch-standard", title: "CATCH", description: "Standard truck, Ocean LCL", price: "$164.91" },
      { value: "catch-fast", title: "CATCH", description: "Fast truck, Ocean LCL", price: "$197.02" },
      {
        value: "own",
        title: "Your own carrier",
        description: "Placement fee only, you pay your carrier directly",
        price: "$40.20"
      }
    ]
  },
  play: async ({ canvas }) => {
    await expect(canvas.getAllByRole("radio")).toHaveLength(5)
    await expect(canvas.getByRole("radio", { name: "Your own carrier" })).toHaveAccessibleDescription(
      "Placement fee only, you pay your carrier directly $40.20"
    )
    await expect(canvas.getAllByRole("radio", { name: "CATCH" })[1]).toHaveAccessibleDescription(
      "Fast truck, Ocean LCL $197.02"
    )
  }
})
