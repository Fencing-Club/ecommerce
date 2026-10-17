import { transportProfiles, transportSchema, transportServices, type ShipmentTransport } from "@repo/aisle/transport"
import { useId } from "react"
import { FormProvider } from "react-hook-form"
import { useTranslations } from "use-intl"
import { useActionForm } from "@/hooks/useActionForm"
import { FormLabel, FormTextarea } from "./form-controls"
import { FormError, SubmitButton } from "./form-feedback"
import { FormSelect, SelectControl } from "./form-select"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Field } from "./ui/field"

export function ShipmentTransportSettings({
  id,
  revision,
  initial,
  hasForwarder,
  editable = true
}: {
  id: string
  revision: number
  initial: ShipmentTransport | null
  hasForwarder: boolean
  editable?: boolean
}) {
  const t = useTranslations("shipments.transport")
  const serviceId = useId()
  const { form, submit } = useActionForm({
    schema: transportSchema,
    action: "shipment.transport",
    defaultValues: initial ?? { service: "parcel", handoff: "supplier", ...transportProfiles.parcel, instructions: "" },
    keepSaved: true,
    toPayload: (transport) => ({ id, revision, expected: initial, transport })
  })
  const service = form.watch("service")
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent>
        {editable ? (
          <FormProvider {...form}>
            <form onSubmit={submit} className="space-y-4" noValidate>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FormLabel htmlFor={serviceId} label={t("service")} required />
                  <SelectControl
                    id={serviceId}
                    value={service}
                    required
                    options={transportServices.map((value) => ({ value, label: t(value) }))}
                    onValueChange={(value) => {
                      const selected = transportServices.find((entry) => entry === value)
                      if (!selected) {
                        return
                      }
                      form.setValue("service", selected, { shouldDirty: true })
                      form.setValue("carrierLabels", transportProfiles[selected].carrierLabels, { shouldDirty: true })
                      form.setValue("collection", transportProfiles[selected].collection, { shouldDirty: true })
                    }}
                  />
                </Field>
                <FormSelect
                  name="handoff"
                  label={t("handoff")}
                  required
                  options={[
                    { value: "supplier", label: t("supplier") },
                    ...(hasForwarder ? [{ value: "forwarder", label: t("forwarder") }] : [])
                  ]}
                />
                <FormSelect
                  name="collection"
                  label={t("collection")}
                  required
                  options={[
                    { value: "pickup", label: t("pickup") },
                    { value: "dropoff", label: t("dropoff") }
                  ]}
                />
                <FormSelect
                  name="carrierLabels"
                  label={t("carrierLabels")}
                  required
                  options={[
                    { value: "per_carton", label: t("perCarton") },
                    { value: "none", label: t("none") }
                  ]}
                />
              </div>
              <FormTextarea name="instructions" label={t("instructions")} />
              <FormError message={form.formState.errors.root?.server?.message} />
              <SubmitButton
                type="submit"
                pending={form.formState.isSubmitting}
                disabled={!!initial && !form.formState.isDirty}
              >
                {t("save")}
              </SubmitButton>
            </form>
          </FormProvider>
        ) : (
          <>
            {initial && (
              <div className="space-y-2 text-sm">
                <p>
                  {t(initial.service)} / {t(initial.handoff)} / {t(initial.collection)}
                </p>
                <p>
                  {t("carrierLabels")}: {t(initial.carrierLabels === "per_carton" ? "perCarton" : "none")}
                </p>
                {initial.instructions && <p className="whitespace-pre-line">{initial.instructions}</p>}
              </div>
            )}
            {!initial && <p className="text-sm text-muted-foreground">{t("unconfirmed")}</p>}
          </>
        )}
      </CardContent>
    </Card>
  )
}
