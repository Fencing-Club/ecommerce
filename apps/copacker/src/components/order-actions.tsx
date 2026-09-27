"use client"

import { AlertTriangle, Download, Ellipsis } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Spinner } from "@/components/ui/spinner"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { errorMessage, useActionMutation } from "@/lib/api"
import { FormError } from "./actions"

// Opened from the PO's actions menu.
type Controlled = { id: string; reference: string; open: boolean; onOpenChange: (open: boolean) => void }

export function ClosePurchaseOrder({ id, reference, open, onOpenChange: setOpen }: Controlled) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function close() {
    setPending(true)
    setError("")
    try {
      await run({ action: "order.close", data: { id } }).unwrap()
      setOpen(false)
      router.refresh()
    } catch (e) {
      setError(errorMessage(e, `Couldn’t close ${reference}`))
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close {reference}?</AlertDialogTitle>
          <AlertDialogDescription>
            Nothing more will ship on this PO, and its remaining units leave On order. Shipments the supplier hasn’t
            packed are cancelled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} aria-busy={pending} onClick={close}>
            {pending && <Spinner data-icon="inline-start" />}
            Close PO
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Deletes a draft PO the supplier hasn't seen, then returns to the list.
export function DeleteDraftOrder({ id, reference, open, onOpenChange: setOpen }: Controlled) {
  const router = useRouter()
  const [run] = useActionMutation()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")

  async function remove() {
    setPending(true)
    setError("")
    try {
      const result = await run({ action: "order.delete", data: { id } }).unwrap()
      setOpen(false)
      router.push(result.redirect ?? "/orders")
    } catch (e) {
      setError(errorMessage(e, `Couldn’t delete ${reference}`))
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {reference}?</AlertDialogTitle>
          <AlertDialogDescription>
            This draft, its product labels and its landed costs are deleted. Your supplier hasn’t seen it. You can’t
            undo this.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} aria-busy={pending} onClick={remove}>
            {pending && <Spinner data-icon="inline-start" />}
            Delete draft
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// A PO's less common actions: edit, downloads, closing and deleting.
export function OrderMenu({
  id,
  reference,
  draft,
  closable,
  labels
}: {
  id: string
  reference: string
  draft: boolean
  // Buyers can close a sent PO.
  closable: boolean
  // Whether any product labels are attached, to download together.
  labels: boolean
}) {
  const router = useRouter()
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" aria-label={`More actions for ${reference}`} />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          {draft && <DropdownMenuItem onClick={() => router.push(`/orders/${id}/edit`)}>Edit</DropdownMenuItem>}
          <DropdownMenuItem render={<a href={`/api/orders/${id}/po`} download aria-label="Download PO" />}>
            Download PO
          </DropdownMenuItem>
          {labels && (
            <DropdownMenuItem render={<a href={`/api/orders/${id}/labels`} download aria-label="Download labels" />}>
              Download labels
            </DropdownMenuItem>
          )}
          {(closable || draft) && <DropdownMenuSeparator />}
          {closable && <DropdownMenuItem onClick={() => setClosing(true)}>Close PO</DropdownMenuItem>}
          {draft && (
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              Delete draft
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {closable && <ClosePurchaseOrder id={id} reference={reference} open={closing} onOpenChange={setClosing} />}
      {draft && <DeleteDraftOrder id={id} reference={reference} open={deleting} onOpenChange={setDeleting} />}
    </>
  )
}

// A PO line's product label, made from its product when downloaded, or why it has none. Labels are uploaded and
// removed on the Products page.
export function LineLabel({
  orderId,
  itemId,
  name,
  label
}: {
  orderId: string
  itemId: string
  name: string
  label?: { state: "uploaded" | "standard" | "none" } | { state: "missing"; problem: string }
}) {
  if (label?.state === "uploaded" || label?.state === "standard") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              nativeButton={false}
              render={
                <a
                  href={`/api/orders/${orderId}/labels/${itemId}`}
                  download
                  aria-label={`Download the label for ${name}`}
                />
              }
            />
          }
        >
          <Download />
        </TooltipTrigger>
        <TooltipContent>{label.state === "uploaded" ? "Download uploaded label" : "Download label"}</TooltipContent>
      </Tooltip>
    )
  }
  if (label?.state !== "missing") {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex p-1.5 text-amber-600" aria-label={`No label for ${name}: ${label.problem}`} />
        }
      >
        <AlertTriangle className="size-4" />
      </TooltipTrigger>
      <TooltipContent>{label.problem}</TooltipContent>
    </Tooltip>
  )
}
