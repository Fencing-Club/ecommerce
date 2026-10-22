import { awdShipmentIdPattern, fbaInboundPlanIdPattern } from "@repo/copacker-shipments/amazon-inbound"
import { ChevronDown } from "lucide-react"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { FormError, SubmitButton } from "@/components/form-feedback"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useAction } from "@/hooks/use-action"
import { useActionForm } from "@/hooks/use-action-form"
import { ActionForm } from "./action-form"
import { FormCheckbox, FormInput, FormTextarea } from "./form-controls"

const approveSchema = z.object({ updateCost: z.boolean() })

export function ApproveInvoice({ id, revision }: { id: string; revision: number }) {
  const t = useTranslations("shipments.actions.approve")
  const { form, submit } = useActionForm({
    schema: approveSchema,
    action: "shipment.approve",
    defaultValues: { updateCost: false },
    toPayload: (values) => ({ id, revision, ...values })
  })
  // Approving needs no change first.
  return (
    <ActionForm form={form} onSubmit={submit} label={t("submit")}>
      <FormCheckbox name="updateCost" label={t("updateCost")} description={t("updateCostDescription")} />
    </ActionForm>
  )
}

const correctionSchema = z.object({ reason: z.string().trim().min(3).max(2000) })

export function CorrectionForm({ id }: { id: string }) {
  const t = useTranslations("shipments.actions.correction")
  const { form, submit } = useActionForm({
    schema: correctionSchema,
    action: "shipment.correct",
    defaultValues: { reason: "" },
    toPayload: (values) => ({ id, ...values })
  })
  return (
    <Collapsible render={<Card />}>
      <CardHeader>
        <CollapsibleTrigger render={<Button variant="ghost" className="-mx-2.5 w-fit" />}>
          {t("trigger")}
          <ChevronDown
            data-icon="inline-end"
            className="transition-transform group-data-panel-open/button:rotate-180"
          />
        </CollapsibleTrigger>
      </CardHeader>
      <CollapsibleContent>
        <CardContent>
          <ActionForm form={form} onSubmit={submit} label={t("submit")} requireChange>
            <FormTextarea name="reason" required label={t("reason")} description={t("reasonDescription")} />
          </ActionForm>
        </CardContent>
      </CollapsibleContent>
    </Collapsible>
  )
}

const awdReconcileSchema = z.object({
  amazonOrderId: z.string().trim().toUpperCase().regex(awdShipmentIdPattern, "shipments.actions.reconcile.awdInvalid")
})
const fbaReconcileSchema = z.object({
  amazonOrderId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(fbaInboundPlanIdPattern, "shipments.actions.reconcile.fbaInvalid")
})

const linkSchema = z.object({
  amazonShipmentId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(awdShipmentIdPattern, "shipments.actions.linkExisting.invalid")
})

export function LinkExistingShipment({
  linkedId,
  onLink
}: {
  linkedId: string | null
  onLink: (shipmentId: string | null) => Promise<void>
}) {
  const t = useTranslations("shipments.actions.linkExisting")
  const { form, submit } = useActionForm({
    schema: linkSchema,
    defaultValues: { amazonShipmentId: "" },
    // The packing form saves its draft first, then links, and refreshes the page.
    run: (_, { amazonShipmentId }) => onLink(amazonShipmentId)
  })
  const unlink = useAction(() => onLink(null))
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{linkedId ? t("linked", { shipmentId: linkedId }) : t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {linkedId ? (
          <div>
            <SubmitButton type="button" variant="outline" pending={unlink.pending} onClick={() => void unlink.run()}>
              {t("unlink")}
            </SubmitButton>
            <FormError message={unlink.error} />
          </div>
        ) : (
          <ActionForm form={form} onSubmit={submit} label={t("submit")} requireChange>
            <FormInput name="amazonShipmentId" required label={t("label")} placeholder="STAR-" />
          </ActionForm>
        )}
      </CardContent>
    </Card>
  )
}

// Links a shipment to the AWD order or FBA inbound plan Amazon made when Copacker lost its reply.
export function ReconcileShipment({ id, fba }: { id: string; fba: boolean }) {
  const t = useTranslations("shipments.actions.reconcile")
  const { form, submit } = useActionForm({
    schema: fba ? fbaReconcileSchema : awdReconcileSchema,
    action: "shipment.reconcile",
    defaultValues: { amazonOrderId: "" },
    toPayload: (values) => ({ id, ...values })
  })
  return (
    <ActionForm form={form} onSubmit={submit} label={t("submit")} requireChange>
      <FormInput
        name="amazonOrderId"
        required
        label={fba ? t("fbaLabel") : t("awdLabel")}
        placeholder={fba ? "wf" : "STAR-"}
      />
    </ActionForm>
  )
}
