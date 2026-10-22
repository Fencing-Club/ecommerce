import { Toast } from "@base-ui/react/toast"
import { packingSchema } from "@repo/copacker-shipments"
import { useRouter } from "@tanstack/react-router"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { useErrorMessage } from "@/hooks/use-error-text"
import { useActionMutation } from "@/lib/api"
import { cartonTotals, maxCartons, packingDraft, type PackingValues } from "@/lib/carton-groups"

export type PackingWork = "save" | "submit" | "link"

const saved = z.object({ revision: z.number() })
const checkResult = z.object({
  canSubmit: z.boolean(),
  requiresApproval: z.boolean(),
  issues: z.array(z.object({ message: z.string(), field: z.string().optional(), cartonId: z.string().optional() }))
})

// Saving a shipment's packing as a draft, finishing it, and linking an existing AWD shipment, with what's in progress
// and the server's error. Each draft save moves the shipment to its next revision, and the page reads the shipment
// again before the save is done, so the next save, a link and the buyer's transport settings beside the form all send
// the new one.
export function usePackingDraft({
  shipmentId,
  revision,
  orderRevision
}: {
  shipmentId: string
  revision: number
  orderRevision: number
}) {
  const t = useTranslations("orders.packing")
  const importText = useTranslations("orders.cartonImport")
  const errorMessage = useErrorMessage()
  const router = useRouter()
  const toast = Toast.useToastManager()
  const [run] = useActionMutation()
  const [working, setWorking] = useState<PackingWork | null>(null)
  const [error, setError] = useState("")

  // Drafts save incomplete values. Resolves to the revision the save moved the shipment to.
  async function saveDraft(values: PackingValues) {
    if (cartonTotals(values.cartons).cartons > maxCartons) {
      throw new Error(importText("errors.limit"))
    }
    const { revision: next } = saved.parse(
      await run({
        action: "shipment.save",
        data: { id: shipmentId, revision, orderRevision, draft: packingDraft(values) }
      }).unwrap()
    )
    await router.invalidate({ sync: true })
    return next
  }

  // The server checks the saved draft before it submits it; its issues show as the error. Resolves to the finished
  // packing, or undefined when the checks stop it.
  async function finish(values: PackingValues) {
    const next = await saveDraft(values)
    const checked = checkResult.parse(await run({ action: "shipment.check", data: { id: shipmentId } }).unwrap())
    if (!checked.canSubmit) {
      setError(
        checked.issues
          .map((issue) =>
            issue.cartonId ? t("cartonIssue", { carton: issue.cartonId, message: issue.message }) : issue.message
          )
          .join("\n")
      )
      return undefined
    }
    await run({ action: "shipment.submit", data: { id: shipmentId, revision: next } }).unwrap()
    void router.invalidate()
    return packingSchema.parse(packingDraft(values))
  }

  // No finally clauses: the React Compiler can't compile a hook with one.
  async function save(values: PackingValues) {
    setWorking("save")
    setError("")
    try {
      await saveDraft(values)
      toast.add({ title: t("draftSaved") })
    } catch (caught) {
      setError(errorMessage(caught, t("saveFailed")))
    }
    setWorking(null)
  }

  async function submit(values: PackingValues) {
    setWorking("submit")
    setError("")
    try {
      const packing = await finish(values)
      setWorking(null)
      return packing
    } catch (caught) {
      setError(errorMessage(caught, t("saveFailed")))
      setWorking(null)
      return undefined
    }
  }

  // Any packing not yet saved is saved before the link changes, and both send the latest revision. A failure is the
  // link form's to show.
  async function link(values: PackingValues, amazonShipmentId: string | null) {
    setWorking("link")
    setError("")
    try {
      const next = await saveDraft(values)
      await run({
        action: "shipment.linkExisting",
        data: { id: shipmentId, revision: next, amazonShipmentId }
      }).unwrap()
      // The link shows once the page has read it, with the revision linking moved the shipment to.
      await router.invalidate({ sync: true })
    } catch (caught) {
      setWorking(null)
      throw caught
    }
    setWorking(null)
  }

  return { save, submit, link, working, error, clearError: () => setError("") }
}
