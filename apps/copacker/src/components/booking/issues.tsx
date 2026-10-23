import {
  Button,
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
  Spinner
} from "@buildkitgg/shadcn-baseui-kit"
import { RefreshCw, TriangleAlert } from "lucide-react"
import { useId } from "react"
import { useTranslations } from "use-intl"
import { cn } from "@/lib/utils"
import { BookingStep, type BookingStepCount } from "./booking-dialog"

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

// A problem where it is, and its one action: the fix, Review for several, or trying again (`retry`, which shows the
// refresh icon). `action` is the action's label, and `onAction` does it.
export type IssueSummaryProps = {
  title: React.ReactNode
  description: React.ReactNode
  action: string
  retry?: boolean
  onAction: () => void
  className?: string
}

// An IssueSummary, in the warning tone.
export function IssueSummary({ title, description, action, retry = false, onAction, className }: IssueSummaryProps) {
  const id = useId()
  return (
    <Item
      variant="outline"
      data-slot="issue-summary"
      className={cn("border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950", className)}
    >
      <ItemMedia variant="icon" className="text-amber-800 dark:text-amber-300">
        <TriangleAlert aria-hidden />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle id={`${id}-title`}>{title}</ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Button variant="outline" size="sm" aria-describedby={`${id}-title`} onClick={onAction}>
          {retry && <RefreshCw data-icon="inline-start" aria-hidden />}
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
  step?: BookingStepCount
  onBack?: () => void
  onCheckAgain: () => void
  checking?: boolean
}) {
  const t = useTranslations("booking")
  const id = useId()
  return (
    <BookingStep
      title={title}
      description={description}
      step={step}
      actions={
        <>
          {onBack && (
            <Button variant="outline" onClick={onBack}>
              {t("back")}
            </Button>
          )}
          <Button onClick={onCheckAgain} disabled={checking} focusableWhenDisabled>
            {checking ? (
              <Spinner aria-hidden data-icon="inline-start" />
            ) : (
              <RefreshCw data-icon="inline-start" aria-hidden />
            )}
            {t("checkAgain")}
          </Button>
        </>
      }
    >
      <ul data-slot="issues-view" className="shrink-0 divide-y rounded-lg border">
        {/* The rows' element ids go by position: an issue's id can hold spaces, which would split a reference. */}
        {issues.map((issue, index) => (
          <li key={issue.id} className="flex items-center gap-3 px-3 py-2.5">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span id={`${id}-${index}-where`} className="text-sm font-medium">
                {issue.where}
              </span>
              <span id={`${id}-${index}-what`} className="text-meta text-muted-foreground">
                {issue.what}
              </span>
            </div>
            {issue.fix && (
              <Button
                variant="outline"
                size="sm"
                aria-describedby={`${id}-${index}-where ${id}-${index}-what`}
                onClick={issue.fix.onFix}
              >
                {issue.fix.label}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </BookingStep>
  )
}
