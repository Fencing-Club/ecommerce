import { useTranslations } from "use-intl"

// The one mark for a value that's missing or doesn't apply: a muted dash on screen. Screen readers hear the reason
// instead, or "None", and the reason shows on hover when there is one.
export function NoValue({ reason }: { reason?: string }) {
  const t = useTranslations("common")
  return (
    <span className="text-muted-foreground" title={reason}>
      <span aria-hidden>—</span>
      <span className="sr-only">{reason ?? t("noValue")}</span>
    </span>
  )
}
