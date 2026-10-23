import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Field,
  FieldLabel,
  Input
} from "@buildkitgg/shadcn-baseui-kit"
import { useId, useState } from "react"
import { useTranslations } from "use-intl"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { type ActionNavigation, type ActionRequest, useAction } from "@/hooks/use-action"
import type { ActionResult } from "@/lib/api"
import type { ActionName } from "@/server/actions"

type Confirmation = {
  title: React.ReactNode
  description: React.ReactNode
  confirmLabel: string
  // A destructive confirmation, such as deleting, has a red button.
  tone: "default" | "destructive"
  // The action to run, by its /api/action name, or another request.
  action: ActionName | ActionRequest
  data: Record<string, unknown>
  // The message for a failure without one of its own.
  fallback?: string
  navigation?: ActionNavigation
  // Asks them to type something first, such as the workspace's name, matched without regard to case or the spaces
  // around it. What they typed is sent as `name`.
  confirmText?: { name: string; label: string; expected: string }
  // Runs once the action's result shows and the dialog closes.
  onDone?: (result: ActionResult) => void
  // Gets a failure's message, which the dialog also shows.
  onError?: (message: string) => void
}

// Asks before an action, such as removing someone, and runs it: the confirm button spins until the result shows, then
// the dialog closes. A failure shows above the buttons. `trigger`, an AlertDialogTrigger, opens it from a button; a
// menu item opens it through `open`.
export function ConfirmDialog({
  open,
  onOpenChange,
  trigger,
  ...confirmation
}: Confirmation & {
  open: boolean
  onOpenChange: (open: boolean) => void
  trigger?: React.ReactNode
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      {trigger}
      <AlertDialogContent>
        {/* Mounted only while the dialog is open, so each opening starts without the last one's error or typing. */}
        <ConfirmForm {...confirmation} onClose={() => onOpenChange(false)} />
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ConfirmForm({
  title,
  description,
  confirmLabel,
  tone,
  action,
  data,
  fallback,
  navigation,
  confirmText,
  onDone,
  onError,
  onClose
}: Confirmation & { onClose: () => void }) {
  const t = useTranslations("common.actions")
  const id = useId()
  const [typed, setTyped] = useState("")
  const { run, pending, error } = useAction(action, {
    fallback,
    navigation,
    onError,
    onSuccess: (result) => {
      onClose()
      onDone?.(result)
    }
  })
  const matches = !confirmText || typed.trim().toLowerCase() === confirmText.expected.trim().toLowerCase()
  return (
    <form
      className="contents"
      onSubmit={(event) => {
        event.preventDefault()
        if (matches && !pending) {
          void run(confirmText ? { ...data, [confirmText.name]: typed.trim() } : data)
        }
      }}
    >
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      {confirmText && (
        <Field>
          <FieldLabel htmlFor={id}>{confirmText.label}</FieldLabel>
          <Input
            id={id}
            value={typed}
            autoComplete="off"
            spellCheck={false}
            placeholder={confirmText.expected}
            onChange={(event) => setTyped(event.target.value)}
          />
        </Field>
      )}
      <FormError message={error} />
      <AlertDialogFooter>
        <AlertDialogCancel type="button" disabled={pending}>
          {t("cancel")}
        </AlertDialogCancel>
        <SubmitButton
          type="submit"
          variant={tone === "destructive" ? "destructive" : "default"}
          pending={pending}
          disabled={!matches}
        >
          {confirmLabel}
        </SubmitButton>
      </AlertDialogFooter>
    </form>
  )
}
