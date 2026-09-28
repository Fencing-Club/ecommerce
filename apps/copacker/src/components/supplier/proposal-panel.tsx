"use client"

import { money } from "@repo/aisle"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { StatusBadge, type StatusTone } from "@/components/common"
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
import { shortDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { proposalChanges } from "@/server/order-proposals"

type Changes = ReturnType<typeof proposalChanges>

// How an order line changes, in the shared status tones. The supplier's edit page marks its lines the same way.
const lineChanges = {
  added: { label: "Added", tone: "success" },
  changed: { label: "Changed", tone: "info" },
  removed: { label: "Removed", tone: "destructive" }
} as const satisfies Record<string, { label: string; tone: StatusTone }>

export type LineChange = keyof typeof lineChanges

export function ChangeBadge({ change }: { change: LineChange }) {
  const { label, tone } = lineChanges[change]
  return <StatusBadge tone={tone}>{label}</StatusBadge>
}

// A table that runs edge to edge inside the card: the first and last columns line up with the card's padding.
const edgeTable = "[&_td:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:first-child]:pl-4 [&_th:last-child]:pr-4"

// A value before and after the change: the old one struck through, then the new one.
function FromTo({ before, after }: { before: React.ReactNode; after: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground line-through">{before}</span>
      <ArrowRight className="size-3 shrink-0 text-muted-foreground" aria-hidden />
      <span className="sr-only">to</span>
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
    return <span className="font-medium">{after === null ? "—" : format(after)}</span>
  }
  if (after === null) {
    return <span className="text-muted-foreground line-through">{format(before)}</span>
  }
  if (before === after) {
    return <span>{format(after)}</span>
  }
  return <FromTo before={format(before)} after={format(after)} />
}

// Pending changes wait on the buyer, who has to act, while the supplier waits; declined ones read as failed.
function proposalStatus(status: "pending" | "declined", viewer: "buyer" | "supplier") {
  if (status === "declined") {
    return { tone: "destructive", label: "Declined" } as const
  }
  return viewer === "buyer"
    ? ({ tone: "warning", label: "Approval needed" } as const)
    : ({ tone: "info", label: "Awaiting approval" } as const)
}

const day = (value: string | null) => (value ? shortDate(value) : "Not set")

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
  const price = (value: number) => money(value, currency)
  const count = (value: number) => value.toLocaleString("en-US")
  const busy = pending !== null || refreshing

  async function act(action: "approve" | "decline" | "withdraw", body: Record<string, unknown>) {
    setPending(action)
    setError("")
    try {
      const response = await fetch(`/api/proposals/${proposal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      if (!response.ok) {
        throw new Error((await response.json()).error ?? "Couldn't save. Try again.")
      }
      setDeclining(false)
      startTransition(() => router.refresh())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.")
    } finally {
      setPending(null)
    }
  }

  const declined = proposal.status === "declined"
  const status = proposalStatus(proposal.status, viewer)
  return (
    <Card className="@container gap-0 py-0">
      <CardHeader className="border-b pt-4">
        <CardTitle>{viewer === "buyer" ? `${supplierName} proposed changes` : "Your proposed changes"}</CardTitle>
        {declined && proposal.reason && (
          <CardDescription className="whitespace-pre-line">Reason: {proposal.reason}</CardDescription>
        )}
        <CardAction>
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        </CardAction>
      </CardHeader>
      <div className="divide-y">
        {proposal.note && (
          <div className="px-4 py-3">
            <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-line text-muted-foreground">
              {proposal.note}
            </blockquote>
          </div>
        )}
        {shown.length > 0 && (
          <Table framed={false} className={edgeTable}>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Quantity</TableHead>
                <TableHead className="text-right">Unit price</TableHead>
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
                  <TableCell className="text-right tabular-nums">
                    <Delta before={line.before?.pieces ?? null} after={line.after?.pieces ?? null} format={count} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    <Delta
                      before={line.before?.unitPrice ?? null}
                      after={line.after?.unitPrice ?? null}
                      format={price}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <dl className="grid gap-x-4 gap-y-2 px-4 py-3 text-sm @sm:grid-cols-[10rem_minmax(0,1fr)]">
          {unchanged > 0 && (
            <>
              <dt className="text-muted-foreground">Other products</dt>
              <dd>{unchanged} unchanged</dd>
            </>
          )}
          {changes.paymentTerms && (
            <>
              <dt className="text-muted-foreground">Payment terms</dt>
              <dd>
                <FromTo before={changes.paymentTerms.before || "None"} after={changes.paymentTerms.after || "None"} />
              </dd>
            </>
          )}
          {changes.readyDate && (
            <>
              <dt className="text-muted-foreground">Ready date</dt>
              <dd className="tabular-nums">
                <FromTo before={day(changes.readyDate.before)} after={day(changes.readyDate.after)} />
              </dd>
            </>
          )}
          <dt className="text-muted-foreground">Total</dt>
          <dd className="tabular-nums">
            <Delta before={changes.total.before} after={changes.total.after} format={price} />
          </dd>
        </dl>
      </div>
      {!declined && (
        <CardFooter className="flex-wrap justify-end gap-2">
          {error && !declining && (
            <p role="alert" className="mr-auto text-sm text-destructive">
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
                Decline
              </Button>
              <Button disabled={busy} onClick={() => void act("approve", { action: "approve" })}>
                {pending === "approve" ? "Approving" : "Approve changes"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => void act("withdraw", { action: "withdraw" })}>
                {pending === "withdraw" ? "Withdrawing" : "Withdraw"}
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={`/orders/${orderId}/revise`} />}>
                Edit
              </Button>
            </>
          )}
        </CardFooter>
      )}
      <Dialog open={declining} onOpenChange={(open) => !busy && setDeclining(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline the changes?</DialogTitle>
            <DialogDescription>The purchase order stays as it is. {supplierName} sees your reason.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="decline-reason">Reason</FieldLabel>
            <Textarea id="decline-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void act("decline", { action: "decline", reason })}
            >
              {pending === "decline" ? "Declining" : "Decline changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
