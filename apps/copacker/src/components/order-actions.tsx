"use client"

import { AlertTriangle, Archive, Download, Ellipsis, Pencil, Trash2 } from "lucide-react"
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
            Nothing more will ship on this purchase order, and its remaining units leave On order. Shipments the
            supplier hasn’t packed are cancelled.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={pending} aria-busy={pending} onClick={close}>
            {pending && <Spinner data-icon="inline-start" />}
            Close purchase order
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
  // Whether the PO has product or suffocation warning labels, to download together.
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
        <DropdownMenuContent align="end" className="w-56">
          {draft && (
            <DropdownMenuItem onClick={() => router.push(`/orders/${id}/edit`)}>
              <Pencil />
              Edit
            </DropdownMenuItem>
          )}
          <DropdownMenuItem render={<a href={`/api/orders/${id}/po`} download aria-label="Download purchase order" />}>
            <Download />
            Download purchase order
          </DropdownMenuItem>
          {labels && (
            <DropdownMenuItem render={<a href={`/api/orders/${id}/labels`} download aria-label="Download labels" />}>
              <Download />
              Download labels
            </DropdownMenuItem>
          )}
          {(closable || draft) && <DropdownMenuSeparator />}
          {closable && (
            <DropdownMenuItem onClick={() => setClosing(true)}>
              <Archive />
              Close purchase order
            </DropdownMenuItem>
          )}
          {draft && (
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 />
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

// A PO line's menu, as in the PO editor: its product label, made from its product when downloaded, its suffocation
// warning labels, and editing a draft. A label that can't be made yet shows why beside it. Labels are uploaded and
// removed on the Products page.
export function LineMenu({
  orderId,
  itemId,
  name,
  label,
  warning,
  editable
}: {
  orderId: string
  itemId: string
  name: string
  label?: { state: "uploaded" | "standard" | "none" } | { state: "missing"; problem: string }
  warning: boolean
  editable: boolean
}) {
  const router = useRouter()
  const labeled = label?.state === "uploaded" || label?.state === "standard"
  return (
    <span className="inline-flex items-center">
      {label?.state === "missing" && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span className="inline-flex p-1.5 text-warning" aria-label={`No label for ${name}: ${label.problem}`} />
            }
          >
            <AlertTriangle className="size-4" />
          </TooltipTrigger>
          <TooltipContent>{label.problem}</TooltipContent>
        </Tooltip>
      )}
      {(labeled || warning || editable) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={`More for ${name}`} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {labeled && (
              <DropdownMenuItem
                render={<a href={`/api/orders/${orderId}/labels/${itemId}`} download aria-label="Download label" />}
              >
                <Download />
                Download label
              </DropdownMenuItem>
            )}
            {warning && (
              <DropdownMenuItem
                render={
                  <a href={`/api/orders/${orderId}/labels/warning`} download aria-label="Download hazard label" />
                }
              >
                <Download />
                Download hazard label
              </DropdownMenuItem>
            )}
            {editable && (
              <DropdownMenuItem onClick={() => router.push(`/orders/${orderId}/edit`)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
  )
}
