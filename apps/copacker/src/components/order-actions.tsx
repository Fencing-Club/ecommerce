import { useRouter } from "@tanstack/react-router"
import { AlertTriangle, Archive, Download, Ellipsis, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { useCan } from "@/components/access"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

// A PO's less common actions: edit, downloads, closing and deleting. Deleting a draft returns to the list.
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
            <DropdownMenuItem onClick={() => router.navigate({ href: `/orders/${id}/edit` })}>
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
      {closable && (
        <ConfirmDialog
          open={closing}
          onOpenChange={setClosing}
          title={t("closeTitle", { reference })}
          description={t("closeDescription")}
          confirmLabel={t("close")}
          tone="default"
          action="order.close"
          data={{ id }}
          fallback={t("closeFailed", { reference })}
        />
      )}
      {draft && (
        <ConfirmDialog
          open={deleting}
          onOpenChange={setDeleting}
          title={t("deleteTitle", { reference })}
          description={t("deleteDescription")}
          confirmLabel={t("deleteDraft")}
          tone="destructive"
          action="order.delete"
          data={{ id }}
          fallback={t("deleteFailed", { reference })}
        />
      )}
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
              <DropdownMenuItem onClick={() => router.navigate({ href: `/orders/${orderId}/edit` })}>
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
