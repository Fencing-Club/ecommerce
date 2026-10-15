"use client"

import { AlertTriangle, Archive, Download, Ellipsis, Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
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
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { FormError } from "./actions"

// Opened from the PO's actions menu.
type Controlled = { id: string; reference: string; open: boolean; onOpenChange: (open: boolean) => void }

export function ClosePurchaseOrder({ id, reference, open, onOpenChange: setOpen }: Controlled) {
  const t = useTranslations("orders.actions")
  const errorMessage = useErrorMessage()
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
      setError(errorMessage(e, t("closeFailed", { reference })))
    } finally {
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("closeTitle", { reference })}</AlertDialogTitle>
          <AlertDialogDescription>{t("closeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction disabled={pending} aria-busy={pending} onClick={close}>
            {pending && <Spinner data-icon="inline-start" />}
            {t("close")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Deletes a draft PO the supplier hasn't seen, then returns to the list.
export function DeleteDraftOrder({ id, reference, open, onOpenChange: setOpen }: Controlled) {
  const t = useTranslations("orders.actions")
  const errorMessage = useErrorMessage()
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
      setError(errorMessage(e, t("deleteFailed", { reference })))
      setPending(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("deleteTitle", { reference })}</AlertDialogTitle>
          <AlertDialogDescription>{t("deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <FormError message={error} />
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={pending} aria-busy={pending} onClick={remove}>
            {pending && <Spinner data-icon="inline-start" />}
            {t("deleteDraft")}
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
  const t = useTranslations("orders.actions")
  const router = useRouter()
  const prices = useCan("prices")
  const [closing, setClosing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="icon" aria-label={t("moreActionsFor", { reference })} />}
        >
          <Ellipsis />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {draft && (
            <DropdownMenuItem onClick={() => router.push(`/orders/${id}/edit`)}>
              <Pencil />
              {t("edit")}
            </DropdownMenuItem>
          )}
          {/* The purchase order's document is priced. */}
          {prices && (
            <DropdownMenuItem
              render={<a href={`/api/orders/${id}/po`} download aria-label={t("downloadPurchaseOrder")} />}
            >
              <Download />
              {t("downloadPurchaseOrder")}
            </DropdownMenuItem>
          )}
          {labels && (
            <DropdownMenuItem
              render={<a href={`/api/orders/${id}/labels`} download aria-label={t("downloadLabels")} />}
            >
              <Download />
              {t("downloadLabels")}
            </DropdownMenuItem>
          )}
          {(closable || draft) && <DropdownMenuSeparator />}
          {closable && (
            <DropdownMenuItem onClick={() => setClosing(true)}>
              <Archive />
              {t("close")}
            </DropdownMenuItem>
          )}
          {draft && (
            <DropdownMenuItem variant="destructive" onClick={() => setDeleting(true)}>
              <Trash2 />
              {t("deleteDraft")}
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
  const t = useTranslations("orders.actions")
  const router = useRouter()
  const labeled = label?.state === "uploaded" || label?.state === "standard"
  return (
    <span className="inline-flex items-center">
      {label?.state === "missing" && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className="inline-flex p-1.5 text-warning"
                aria-label={t("noLabelFor", { name, problem: label.problem })}
              />
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
            render={<Button type="button" variant="ghost" size="icon-sm" aria-label={t("moreFor", { name })} />}
          >
            <Ellipsis />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {labeled && (
              <DropdownMenuItem
                render={<a href={`/api/orders/${orderId}/labels/${itemId}`} download aria-label={t("downloadLabel")} />}
              >
                <Download />
                {t("downloadLabel")}
              </DropdownMenuItem>
            )}
            {warning && (
              <DropdownMenuItem
                render={
                  <a href={`/api/orders/${orderId}/labels/warning`} download aria-label={t("downloadHazardLabel")} />
                }
              >
                <Download />
                {t("downloadHazardLabel")}
              </DropdownMenuItem>
            )}
            {editable && (
              <DropdownMenuItem onClick={() => router.push(`/orders/${orderId}/edit`)}>
                <Pencil />
                {t("edit")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </span>
  )
}
