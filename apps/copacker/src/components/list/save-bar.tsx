import { Button } from "@buildkitgg/shadcn-baseui-kit"
import { useWindowEvent } from "@mantine/hooks"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"

// Shopify's contextual save bar: while a form has unsaved changes, a bar floats at the bottom with Discard and
// Save, and leaving the page asks first.
export function SaveBar({
  dirty,
  pending,
  onDiscard,
  onSave,
  error,
  message,
  canSave = true
}: {
  dirty: boolean
  pending: boolean
  onDiscard: () => void
  onSave: () => void
  error?: string
  // What's unsaved, such as "3 unsaved changes".
  message?: string
  // False while a change can't be saved yet, such as a count that isn't a number.
  canSave?: boolean
}) {
  const t = useTranslations("common.list.saveBar")
  useWindowEvent("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault()
    }
  })
  if (!dirty && !error) {
    return null
  }
  return (
    <section
      aria-label={t("unsaved")}
      className="sticky bottom-4 z-30 mx-auto flex w-full max-w-xl flex-wrap items-center gap-3 rounded-xl border bg-popover px-4 py-2.5 text-popover-foreground shadow-action-bar"
    >
      <span className={cn("text-sm font-medium", error && "text-destructive")}>{error || message || t("unsaved")}</span>
      <div className="ms-auto flex gap-2">
        <Button size="sm" variant="outline" disabled={pending || !dirty} onClick={onDiscard}>
          {t("discard")}
        </Button>
        <Button size="sm" disabled={pending || !dirty || !canSave} onClick={onSave}>
          {pending ? t("saving") : t("save")}
        </Button>
      </div>
    </section>
  )
}
