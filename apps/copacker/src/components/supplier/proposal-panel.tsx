"use client"

import { money } from "@repo/aisle"
import { ArrowRight, Clock, XCircle } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
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
import { cn } from "@/lib/utils"
import type { proposalChanges } from "@/server/order-proposals"

type Changes = ReturnType<typeof proposalChanges>

const badges = {
  added: { label: "Added", variant: "secondary" },
  removed: { label: "Removed", variant: "destructive" },
  changed: { label: "Changed", variant: "outline" }
} as const

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
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-muted-foreground line-through">{format(before)}</span>
      <ArrowRight className="size-3 text-muted-foreground" aria-label="to" />
      <span className="font-medium">{format(after)}</span>
    </span>
  )
}

function describe(proposal: { status: "pending" | "declined"; reason: string | null }, viewer: "buyer" | "supplier") {
  if (proposal.status === "declined") {
    return proposal.reason ? `Declined: ${proposal.reason}` : "Declined by the customer."
  }
  return viewer === "buyer"
    ? "Approving publishes a new purchase order revision with their commercial invoice."
    : "Waiting for the customer to approve."
}

// A supplier's proposed changes to a PO, as the buyer reviews them and the supplier waits on them: each changed line
// with its old and new quantity and price, then terms, the ready date and the new total.
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
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState("")
  const shown = changes.lines.filter((line) => line.change !== "same")
  const unchanged = changes.lines.length - shown.length
  const price = (value: number) => money(value, currency)
  const count = (value: number) => value.toLocaleString("en-US")

  async function act(body: Record<string, unknown>) {
    setPending(true)
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
      router.refresh()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't save. Try again.")
    } finally {
      setPending(false)
    }
  }

  const declined = proposal.status === "declined"
  return (
    <Card className={cn(!declined && "ring-2 ring-primary/40")}>
      <CardHeader>
        <CardTitle>{viewer === "buyer" ? `${supplierName} proposed changes` : "Your proposed changes"}</CardTitle>
        <CardDescription>{describe(proposal, viewer)}</CardDescription>
        <CardAction>
          <Badge variant={declined ? "destructive" : "secondary"}>
            {declined ? <XCircle data-icon="inline-start" /> : <Clock data-icon="inline-start" />}
            {declined ? "Declined" : "Awaiting approval"}
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="@container flex flex-col gap-3">
        {proposal.note && (
          <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-line text-muted-foreground">
            {proposal.note}
          </blockquote>
        )}
        {shown.length > 0 && (
          <Table>
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
                  <TableCell className="max-w-72 whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("font-medium", line.change === "removed" && "text-muted-foreground")}>
                        {line.name}
                      </span>
                      {line.change !== "same" && (
                        <Badge variant={badges[line.change].variant}>{badges[line.change].label}</Badge>
                      )}
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
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
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
                <span className="text-muted-foreground line-through">{changes.paymentTerms.before || "None"}</span>{" "}
                <ArrowRight className="inline size-3 text-muted-foreground" aria-label="to" />{" "}
                <span className="font-medium">{changes.paymentTerms.after || "None"}</span>
              </dd>
            </>
          )}
          {changes.readyDate && (
            <>
              <dt className="text-muted-foreground">Ready date</dt>
              <dd className="font-medium">{changes.readyDate.after ?? "Not set"}</dd>
            </>
          )}
          <dt className="text-muted-foreground">Total</dt>
          <dd>
            <Delta before={changes.total.before} after={changes.total.after} format={price} />
          </dd>
        </dl>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
      {!declined && (
        <CardFooter className="justify-end gap-2 border-t">
          {viewer === "buyer" ? (
            <>
              <Button variant="outline" disabled={pending} onClick={() => setDeclining(true)}>
                Decline
              </Button>
              <Button disabled={pending} onClick={() => void act({ action: "approve" })}>
                {pending ? "Approving" : "Approve changes"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={pending} onClick={() => void act({ action: "withdraw" })}>
                Withdraw
              </Button>
              <Button variant="outline" nativeButton={false} render={<Link href={`/orders/${orderId}/revise`} />}>
                Change
              </Button>
            </>
          )}
        </CardFooter>
      )}
      <Dialog open={declining} onOpenChange={(open) => !pending && setDeclining(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline the changes?</DialogTitle>
            <DialogDescription>The purchase order stays as it is. {supplierName} sees your reason.</DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="decline-reason">Reason</FieldLabel>
            <Textarea id="decline-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" disabled={pending} onClick={() => setDeclining(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={pending} onClick={() => void act({ action: "decline", reason })}>
              Decline changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
