import { useTranslations } from "use-intl"

// What's ticked in a list, "3 selected", and the actions for it, such as Archive. Nothing while nothing is ticked.
export function SelectionBar({ count, children }: { count: number; children: React.ReactNode }) {
  const t = useTranslations("common.list")
  if (!count) {
    return null
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium">{t("selected", { count })}</span>
      <div className="ms-auto flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
