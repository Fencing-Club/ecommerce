import { FileText, Package, Truck } from "lucide-react"
import { useState } from "react"
import { expect, fn, screen, userEvent, waitFor } from "storybook/test"
import preview from "#.storybook/preview"
import { shownDialog } from "@/stories/play"
import { Button } from "./button"
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
  CommandShortcut
} from "./command"
import { Skeleton } from "./skeleton"

// A palette like the app's search: pages, then records.
function Palette({ onSelect }: { onSelect: (value: string) => void }) {
  return (
    <>
      <CommandInput placeholder="Search" />
      <CommandList>
        <CommandEmpty>No results</CommandEmpty>
        <CommandGroup heading="Pages">
          <CommandItem value="Purchase orders" onSelect={onSelect}>
            <FileText />
            Purchase orders
            <CommandShortcut>G O</CommandShortcut>
          </CommandItem>
          <CommandItem value="Shipments" onSelect={onSelect}>
            <Truck />
            Shipments
            <CommandShortcut>G S</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Products">
          <CommandItem value="Harbor Tote" onSelect={onSelect}>
            <Package />
            Harbor Tote
          </CommandItem>
          <CommandItem value="Harbor Duffel" onSelect={onSelect} disabled>
            <Package />
            Harbor Duffel
          </CommandItem>
          <CommandItem value="Canvas Pouch" onSelect={onSelect} data-checked="true">
            <Package />
            Canvas Pouch
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </>
  )
}

function PaletteDialog({ onSelect }: { onSelect: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Search
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} showCloseButton>
        <Command>
          <Palette
            onSelect={(value) => {
              onSelect(value)
              setOpen(false)
            }}
          />
        </Command>
      </CommandDialog>
    </>
  )
}

const meta = preview.type<{ args: { onSelect: (value: string) => void } }>().meta({
  title: "Foundations/Command",
  args: { onSelect: fn() },
  render: ({ onSelect }) => (
    <Command className="max-w-sm rounded-lg border">
      <Palette onSelect={onSelect} />
    </Command>
  )
})

export const Default = meta.story({
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("group", { name: "Pages" })).toBeVisible()
    await expect(canvas.getAllByRole("option")).toHaveLength(5)
    await expect(canvas.getByRole("option", { name: /Harbor Duffel/ })).toHaveAttribute("aria-disabled", "true")
    await expect(canvas.getByText("G O")).toHaveAttribute("data-slot", "command-shortcut")

    await userEvent.click(canvas.getByRole("option", { name: /Shipments/ }))
    await expect(args.onSelect).toHaveBeenLastCalledWith("Shipments")
  }
})

export const Filter = meta.story({
  play: async ({ canvas, args }) => {
    const input = canvas.getByRole("combobox")
    await userEvent.type(input, "harbor")
    await waitFor(() => expect(canvas.getAllByRole("option")).toHaveLength(2))
    await expect(canvas.queryByRole("group", { name: "Pages" })).not.toBeInTheDocument()

    // The first match is highlighted, and Enter picks it.
    await expect(canvas.getByRole("option", { name: /Harbor Tote/ })).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{Enter}")
    await expect(args.onSelect).toHaveBeenLastCalledWith("Harbor Tote")

    await userEvent.clear(input)
    await userEvent.type(input, "invoices")
    await expect(await canvas.findByText("No results")).toBeVisible()
    await expect(canvas.queryAllByRole("option")).toHaveLength(0)
  }
})

export const Keyboard = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("combobox"))
    await userEvent.keyboard("{ArrowDown}{ArrowDown}")
    // The disabled item is skipped.
    await expect(canvas.getByRole("option", { name: /Harbor Tote/ })).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{ArrowDown}")
    await expect(canvas.getByRole("option", { name: /Canvas Pouch/ })).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{Enter}")
    await expect(args.onSelect).toHaveBeenLastCalledWith("Canvas Pouch")
  }
})

export const Loading = meta.story({
  render: () => (
    <Command className="max-w-sm rounded-lg border" shouldFilter={false}>
      <CommandInput placeholder="Search" />
      <CommandList>
        <CommandLoading label="Searching">
          <Skeleton className="h-6" />
          <Skeleton className="mt-1 h-6" />
        </CommandLoading>
      </CommandList>
    </Command>
  ),
  play: async ({ canvas }) => {
    const progress = canvas.getByRole("progressbar", { name: "Searching" })
    await expect(progress).toHaveAttribute("data-slot", "command-loading")
    await expect(progress.querySelectorAll("[data-slot=skeleton]")).toHaveLength(2)
  }
})

export const Dialog = meta.story({
  render: ({ onSelect }) => <PaletteDialog onSelect={onSelect} />,
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Search" }))
    const dialog = await shownDialog("Command Palette")
    await expect(dialog.element).toHaveAccessibleDescription("Search for a command to run...")
    await userEvent.type(dialog.getByRole("combobox"), "purchase")
    await userEvent.keyboard("{Enter}")
    await expect(args.onSelect).toHaveBeenLastCalledWith("Purchase orders")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    // The close button closes it too.
    await userEvent.click(canvas.getByRole("button", { name: "Search" }))
    await userEvent.click(await screen.findByRole("button", { name: "Close" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  }
})
