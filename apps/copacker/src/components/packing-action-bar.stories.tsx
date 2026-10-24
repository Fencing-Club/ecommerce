import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { PackingActionBar } from "./packing-action-bar"

// The bar beside the form it submits, which records what it's sent.
function WithForm(props: React.ComponentProps<typeof PackingActionBar> & { onSubmit: () => void }) {
  const { onSubmit, ...bar } = props
  return (
    <>
      <form
        id={bar.formId}
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
      />
      <PackingActionBar {...bar} />
    </>
  )
}

const meta = preview.meta({
  title: "Components/Shipments/Packing action bar",
  component: WithForm,
  args: {
    formId: "packing",
    placement: "header" as const,
    finishing: true,
    ready: true,
    canSave: true,
    working: null,
    onSaveDraft: fn(),
    onSubmit: fn()
  }
})

// Every unit is packed and nothing stops it: Finish packing submits the form, and Save draft is under Actions.
export const ReadyToFinish = meta.story({
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Finish packing" }))
    await expect(args.onSubmit).toHaveBeenCalledOnce()
    await userEvent.click(canvas.getByRole("button", { name: "Actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save draft" }))
    await expect(args.onSaveDraft).toHaveBeenCalledOnce()
  }
})

// Packing can't finish while the checks find something, but the draft still saves from the menu.
export const NotReady = meta.story({
  args: { ready: false },
  play: async ({ canvas, args }) => {
    await expect(canvas.getByRole("button", { name: "Finish packing" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Actions" }))
    await userEvent.click(await screen.findByRole("menuitem", { name: "Save draft" }))
    await expect(args.onSaveDraft).toHaveBeenCalledOnce()
  }
})

// Units are left to pack, so the button saves the draft as it is.
export const UnitsLeft = meta.story({
  args: { finishing: false, ready: false },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Save draft" }))
    await expect(args.onSubmit).toHaveBeenCalledOnce()
  }
})

// Past 1,000 cartons nothing saves.
export const TooManyCartons = meta.story({
  args: { finishing: false, canSave: false },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Save draft" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Actions" }))
    await expect(await screen.findByRole("menuitem", { name: "Save draft" })).toHaveAttribute("aria-disabled", "true")
  }
})

// While packing finishes, the button shows it's working and the menu waits.
export const Finishing = meta.story({
  args: { working: "submit" },
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: /Finish packing/ })).toBeDisabled()
    await expect(canvas.getByRole("button", { name: "Actions" })).toBeDisabled()
  }
})
