import { Link, useRouter } from "@tanstack/react-router"
import { ArrowRight } from "lucide-react"
import { useState, useTransition } from "react"
import { useLocale, useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { StatusBadge, type StatusTone } from "@/components/common"
import { NoValue } from "@/components/no-value"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useMoney } from "@/hooks/use-money"
import { dayDate } from "@/lib/format"
import { type ProposalReply, useAnswerProposalMutation } from "@/lib/supplier-api"
import { cn } from "@/lib/utils"
import type { proposalChanges } from "@/server/order-proposals"

type Changes = ReturnType<typeof proposalChanges>

// How an order line changes, in the shared status tones: a change waits on someone's review, an addition is new, a
// removal is lost. The supplier's edit page marks its lines the same way.
const lineChanges = {
  added: "success",
  changed: "warning",
  removed: "destructive"
} as const satisfies Record<string, StatusTone>

export type LineChange = keyof typeof lineChanges

export function ChangeBadge({ change }: { change: LineChange }) {
  const t = useTranslations("supplier.proposal.changes")
  return <StatusBadge tone={lineChanges[change]}>{t(change)}</StatusBadge>
}

// A value before and after the change: the old one struck through, then the new one.
function FromTo({ before, after }: { before: React.ReactNode; after: React.ReactNode }) {
  const t = useTranslations("supplier.proposal")
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground line-through">{before}</span>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground rtl:rotate-180" aria-hidden />
      <span className="sr-only">{t("to")}</span>
      <span className="font-medium">{after}</span>
    </span>
  )
}

function Delta({
  before,
  after,
  format
}: {
  before: number | null
  after: number | null
  format: (value: number) => string
}) {
  if (before === null) {
    return <span className="font-medium">{after === null ? <NoValue /> : format(after)}</span>
  }
  if (after === null) {
    return <span className="text-muted-foreground line-through">{format(before)}</span>
  }
  if (before === after) {
    return <span>{format(after)}</span>
  }
  return <FromTo before={format(before)} after={format(after)} />
}

// Pending changes wait on the buyer, who has to act, while the supplier waits. Declined changes need the supplier to
// choose what to do next, so they read as needing action too.
function proposalStatus(status: "pending" | "declined", viewer: "buyer" | "supplier") {
  if (status === "declined") {
    return { tone: "warning", label: "declined" } as const
  }
  return viewer === "buyer"
    ? ({ tone: "warning", label: "approvalNeeded" } as const)
    : ({ tone: "info", label: "awaitingApproval" } as const)
}

// A supplier's proposed changes to a purchase order, as the buyer reviews them and the supplier waits on them: each
// changed line with its old and new quantity and price, then terms, the ready date and the new total.
export function ProposalPanel({
  proposal,
  changes,
  currency,
  viewer,
  supplierName,
  orderId
}: {
  proposal: { id: string; status: "pending" | "declined"; note: string; reason: string | null }
  changes: Changes
  currency: string
  viewer: "buyer" | "supplier"
  supplierName: string
  orderId: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState<"approve" | "decline" | "withdraw" | null>(null)
  // The page reloading after an answer, so the buttons stay off until the panel goes.
  const [refreshing, startTransition] = useTransition()
  const [error, setError] = useState("")
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState("")
  const shown = changes.lines.filter((line) => line.change !== "same")
  const unchanged = changes.lines.length - shown.length
  const t = useTranslations("supplier.proposal")
  const shared = useTranslations("supplier.shared")
  const errorMessage = useErrorMessage()
  const [answer] = useAnswerProposalMutation()
  const locale = useLocale()
  const money = useMoney()
  const price = (value: number) => money(value, currency)
  const count = (value: number) => value.toLocaleString(locale)
  const day = (value: string | null) => (value ? dayDate(value, locale) : t("notSet"))
  const busy = pending !== null || refreshing
  // Answering or withdrawing changes the purchase order, which needs Edit access to it.
  const editable = useCan("orders", "edit")
  // Someone who doesn't see prices gets the changes without them.
  const prices = useCan("prices")

  async function act(reply: ProposalReply) {
    setPending(reply.action)
    setError("")
    try {
      await answer({ id: proposal.id, ...reply }).unwrap()
      setDeclining(false)
      startTransition(() => router.invalidate())
    } catch (caught) {
      setError(errorMessage(caught, shared("couldNotSave")))
    } finally {
      setPending(null)
    }
  }

  const declined = proposal.status === "declined"
  const status = proposalStatus(proposal.status, viewer)
  return (
    // Small, like the purchase order page's other cards.
    <Card size="sm" flush className="@container">
      <CardHeader>
        <CardTitle>{viewer === "buyer" ? t("theirChanges", { supplier: supplierName }) : t("yourChanges")}</CardTitle>
        {declined && proposal.reason && (
          <CardDescription className="whitespace-pre-line">{t("reason", { reason: proposal.reason })}</CardDescription>
        )}
        <CardAction>
          <StatusBadge tone={status.tone}>{t(status.label)}</StatusBadge>
        </CardAction>
      </CardHeader>
      <div className="divide-y">
        {proposal.note && (
          <div className="p-3">
            <blockquote className="border-s-2 ps-3 text-sm whitespace-pre-line text-muted-foreground">
              {proposal.note}
            </blockquote>
          </div>
        )}
        {shown.length > 0 && (
          <Table framed={false} inset>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.product")}</TableHead>
                <TableHead className="text-end">{t("columns.quantity")}</TableHead>
                {prices && <TableHead className="text-end">{t("columns.unitPrice")}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((line) => (
                <TableRow key={line.key}>
                  <TableCell className="w-full max-w-0 whitespace-normal">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className={cn("font-medium", line.change === "removed" && "text-muted-foreground line-through")}
                      >
                        {line.name}
                      </span>
                      {line.change !== "same" && <ChangeBadge change={line.change} />}
                    </div>
                    {line.supplierSku && <p className="text-xs text-muted-foreground">{line.supplierSku}</p>}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    <Delta before={line.before?.pieces ?? null} after={line.after?.pieces ?? null} format={count} />
                  </TableCell>
                  {prices && (
                    <TableCell className="text-end tabular-nums">
                      <Delta
                        before={line.before?.unitPrice ?? null}
                        after={line.after?.unitPrice ?? null}
                        format={price}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <dl className="grid gap-x-4 gap-y-2 p-3 text-sm @sm:grid-cols-[10rem_minmax(0,1fr)]">
          {unchanged > 0 && (
            <>
              <dt className="text-muted-foreground">{t("otherProducts")}</dt>
              <dd>{t("unchanged", { count: unchanged })}</dd>
            </>
          )}
          {changes.paymentTerms && (
            <>
              <dt className="text-muted-foreground">{t("paymentTerms")}</dt>
              <dd>
                <FromTo
                  before={changes.paymentTerms.before || shared("none")}
                  after={changes.paymentTerms.after || shared("none")}
                />
              </dd>
            </>
          )}
          {changes.readyDate && (
            <>
              <dt className="text-muted-foreground">{t("readyDate")}</dt>
              <dd className="tabular-nums">
                <FromTo before={day(changes.readyDate.before)} after={day(changes.readyDate.after)} />
              </dd>
            </>
          )}
          {prices && (
            <>
              <dt className="text-muted-foreground">{t("total")}</dt>
              <dd className="tabular-nums">
                <Delta before={changes.total.before} after={changes.total.after} format={price} />
              </dd>
            </>
          )}
        </dl>
      </div>
      {!declined && editable && (
        <CardFooter className="flex-wrap justify-end gap-2">
          {error && !declining && (
            <p role="alert" className="me-auto text-sm text-destructive">
              {error}
            </p>
          )}
          {viewer === "buyer" ? (
            <>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setError("")
                  setDeclining(true)
                }}
              >
                {t("decline")}
              </Button>
              <Button disabled={busy} onClick={() => void act({ action: "approve" })}>
                {pending === "approve" ? t("approving") : t("approve")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => void act({ action: "withdraw" })}>
                {pending === "withdraw" ? t("withdrawing") : t("withdraw")}
              </Button>
              <Button
                variant="outline"
                nativeButton={false}
                render={<Link to="/orders/$id/revise" params={{ id: orderId }} />}
              >
                {t("edit")}
              </Button>
            </>
          )}
        </CardFooter>
      )}
      <Dialog open={declining} onOpenChange={(open) => !busy && setDeclining(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("declineTitle")}</DialogTitle>
            <DialogDescription>{t("declineDescription", { supplier: supplierName })}</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="decline-reason">{t("reasonLabel")}</FieldLabel>
            <Textarea id="decline-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDeclining(false)}>
              {shared("cancel")}
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void act({ action: "decline", reason })}>
              {pending === "decline" ? t("declining") : t("declineChanges")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
