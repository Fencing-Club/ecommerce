import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@buildkitgg/shadcn-baseui-kit"
import { useUncontrolled } from "@mantine/hooks"
import { useState } from "react"
import { type ActionFormOptions, type FormSchema, useActionForm } from "@/hooks/use-action-form"
import { cn } from "@/lib/utils"
import { ActionForm } from "./action-form"

// The dialog's width from small screens up: the kit's default, a little wider, or wide enough for an address in two
// columns.
const sizes = { default: "", md: "sm:max-w-md", lg: "sm:max-w-2xl" }

// A form in a dialog: its fields, Cancel, and a button that submits through useActionForm and closes the dialog once
// the result shows. The form mounts inside the open dialog, so every opening starts from `form.defaultValues`, without
// the last one's typing or error. `trigger`, a DialogTrigger, opens it from a button; a menu item or a parent opens it
// through `open`.
export function FormDialog<S extends FormSchema>({
  trigger,
  open,
  onOpenChange,
  title,
  description,
  size = "default",
  submitLabel,
  requireChange,
  form,
  initialFocus,
  finalFocus,
  children
}: {
  trigger?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  size?: keyof typeof sizes
  submitLabel: string
  // Keeps the button disabled until a field changes.
  requireChange?: boolean
  form: ActionFormOptions<S>
  // Where focus goes as it opens, such as a field that takes typing first, and as it closes.
  initialFocus?: React.RefObject<HTMLElement | null>
  finalFocus?: React.RefObject<HTMLElement | null>
  // The fields, bound to the form by name.
  children: React.ReactNode
}) {
  const [isOpen, setOpen] = useUncontrolled({
    value: open,
    defaultValue: false,
    finalValue: false,
    onChange: onOpenChange
  })
  // Each opening gets a new form, even one that comes while the dialog is still closing and its form still mounted.
  const [openings, setOpenings] = useState(0)
  const [wasOpen, setWasOpen] = useState(isOpen)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setOpenings(openings + 1)
    }
  }
  return (
    <Dialog open={isOpen} onOpenChange={(next) => setOpen(next)}>
      {trigger}
      <DialogContent
        initialFocus={initialFocus}
        finalFocus={finalFocus}
        // A tall form scrolls on a short screen.
        className={cn("max-h-[calc(100svh-2rem)] overflow-y-auto", sizes[size])}
      >
        <DialogHeader>
          {/* A title with a long name, such as an invitation's email, wraps clear of the close button. */}
          <DialogTitle className="pe-6 leading-snug [overflow-wrap:anywhere]">{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogForm
          key={openings}
          options={form}
          label={submitLabel}
          requireChange={requireChange}
          onDone={() => setOpen(false)}
        >
          {children}
        </DialogForm>
      </DialogContent>
    </Dialog>
  )
}

function DialogForm<S extends FormSchema>({
  options,
  label,
  requireChange,
  onDone,
  children
}: {
  options: ActionFormOptions<S>
  label: string
  requireChange?: boolean
  onDone: () => void
  children: React.ReactNode
}) {
  const { form, submit } = useActionForm({
    ...options,
    onSuccess: async (result, values) => {
      onDone()
      await options.onSuccess?.(result, values)
    }
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={label} layout="dialog" requireChange={requireChange}>
      {children}
    </ActionForm>
  )
}
