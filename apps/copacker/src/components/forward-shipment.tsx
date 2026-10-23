import { Button, DialogTrigger } from "@buildkitgg/shadcn-baseui-kit"
import { useTranslations } from "use-intl"
import { z } from "zod"
import { FormInput, FormMoney } from "./form-controls"
import { FormDialog } from "./form-dialog"

const schema = z.object({
  carrier: z.string().trim().min(1, "shipments.forward.enterCarrier").max(100),
  reference: z.string().trim().min(1, "shipments.forward.enterReference").max(100),
  // An empty cost asks for one; the range checks keep their own messages, which a plain `error` would replace.
  amount: z
    .number({ error: (issue) => (issue.code === "invalid_type" ? "shipments.forward.enterFreightCost" : undefined) })
    .int()
    .min(0)
    .max(100000000)
})

// The forwarder's leg: it ships the goods on and says what the freight cost and how to track it. The buyer does this
// for a forwarder that isn't on Copacker.
export function ForwardShipment({ shipmentId, currency }: { shipmentId: string; currency: string }) {
  const t = useTranslations("shipments.forward")
  return (
    <FormDialog
      trigger={<DialogTrigger render={<Button type="button" size="sm" />}>{t("markShipped")}</DialogTrigger>}
      title={t("title")}
      description={t("description")}
      size="md"
      submitLabel={t("markShipped")}
      form={{
        schema,
        action: "shipment.forward",
        defaultValues: { carrier: "", reference: "" },
        toPayload: (values) => ({
          id: shipmentId,
          carrier: values.carrier,
          reference: values.reference,
          freight: { amountMinor: values.amount, currency }
        })
      }}
    >
      <FormMoney name="amount" required label={t("freightCost")} currency={currency} />
      <FormInput name="carrier" required label={t("carrier")} placeholder="Maersk" />
      <FormInput name="reference" required label={t("reference")} />
    </FormDialog>
  )
}
