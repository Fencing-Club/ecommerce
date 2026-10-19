import { RefreshCw, TriangleAlert } from "lucide-react"
import { useId } from "react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"
import { BookingDialogBody, BookingDialogFooter, BookingDialogHeader } from "./booking-dialog"

// The booking flows' one way of showing a problem. A single problem shows where it is, as an IssueSummary with the one
// action that fixes it. Several collapse into one IssueSummary that counts them, whose action, Review, opens them all in
// the IssuesView: where each is, what's wrong, and its fix when Copacker has one.

// A problem in the IssuesView. `where` is what it's about, such as a carton or a product; `what` says what's wrong.
export type Issue = {
  id: string
  where: React.ReactNode
  what: React.ReactNode
  fix?: { label: string; onFix: () => void }
}

// A problem where it is, in the warning tone, with its one action: the fix, Review for several, or Try again. `action`
// is the action's label, and `onAction` does it.
export function IssueSummary({
  title,
  description,
  action,
  actionIcon,
  onAction,
  className
}: {
  title: React.ReactNode
  description: React.ReactNode
  action: string
  actionIcon?: React.ReactNode
  onAction: () => void
  className?: string
}) {
  const id = useId()
  return (
    <Item
      variant="outline"
      data-slot="issue-summary"
      className={cn("border-warning-border bg-warning-tint", className)}
    >
      <ItemMedia variant="icon" className="text-warning-foreground">
        <TriangleAlert aria-hidden />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle id={`${id}-title`}>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" aria-describedby={`${id}-title`} onClick={onAction}>
          {actionIcon}
          {action}
        </Button>
      </ItemActions>
    </Item>
  )
}

// Every problem a check found, as a step of its own: where each is, what's wrong, and its fix. The list scrolls within
// the dialog, so any number fits. Back returns to the step the problems came from, when there is one; Check again asks
// for the check once they're fixed.
export function IssuesView({
  title,
  description,
  issues,
  step,
  onBack,
  onCheckAgain,
  checking = false
}: {
  title: React.ReactNode
  description: React.ReactNode
  issues: Issue[]
  step?: { current: number; total: number }
  onBack?: () => void
  onCheckAgain: () => void
  checking?: boolean
}) {
  const t = useTranslations("shipments.booking")
  const id = useId()
  return (
    <>
      <BookingDialogHeader title={title} description={description} />
      <BookingDialogBody>
        <ul data-slot="issues-view" className="shrink-0 divide-y rounded-lg border">
          {issues.map((issue) => (
            <li key={issue.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span id={`${id}-${issue.id}-where`} className="text-sm font-medium">
                  {issue.where}
                </span>
                <span id={`${id}-${issue.id}-what`} className="text-[13px] text-muted-foreground">
                  {issue.what}
                </span>
              </div>
              {issue.fix && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-describedby={`${id}-${issue.id}-where ${id}-${issue.id}-what`}
                  onClick={issue.fix.onFix}
                >
                  {issue.fix.label}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </BookingDialogBody>
      <BookingDialogFooter step={step}>
        {onBack && (
          <Button variant="outline" onClick={onBack}>
            {t("back")}
          </Button>
        )}
        <Button onClick={onCheckAgain} disabled={checking} focusableWhenDisabled>
          {checking ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" aria-hidden />}
          {t("checkAgain")}
        </Button>
      </BookingDialogFooter>
    </>
  )
}
