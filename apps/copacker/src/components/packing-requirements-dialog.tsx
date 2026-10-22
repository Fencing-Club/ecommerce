import { countriesIn } from "@repo/copacker-shipments/countries"
import { useController, useFormContext, useWatch } from "react-hook-form"
import { useLocale, useTranslations } from "use-intl"
import { FormTextarea } from "@/components/form-controls"
import { FormSelect } from "@/components/form-select"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import type { OrderForm } from "@/lib/order-form"

// The labels a line's units can get, each with its message under orders.builder.
const labelChoices = [
  ["sku", "skuLabel"],
  ["fnsku", "fnskuLabel"],
  ["suffocation", "suffocationWarning"],
  ["choking", "chokingHazard"],
  ["countryOfOrigin", "countryOfOriginLabel"]
] as const

// A purchase order line's packing details in its editor: how the supplier prepares each unit, the labels it gets, and
// instructions. They're the form's own, so Done only closes the dialog.
export function PackingRequirementsDialog({
  index,
  name,
  open,
  onOpenChange
}: {
  index: number
  // The line's product, under the title.
  name: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("orders.builder")
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("packingDetails")}</DialogTitle>
          <DialogDescription>{name}</DialogDescription>
        </DialogHeader>
        <FieldGroup className="gap-4">
          <PackingRequirementsFields index={index} />
        </FieldGroup>
        <DialogFooter>
          <DialogClose render={<Button type="button" />}>{t("done")}</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PackingRequirementsFields({ index }: { index: number }) {
  const countries = countriesIn(useLocale())
  const t = useTranslations("orders.builder")
  const { control } = useFormContext<OrderForm>()
  const { field } = useController({ control, name: `items.${index}.packingRequirements.labels` })
  const labels = field.value ?? []
  const fnsku = useWatch({ control, name: `items.${index}.fnsku` })
  return (
    <>
      <FormSelect
        name={`items.${index}.packingRequirements.preparation`}
        label={t("preparation")}
        options={[
          { value: "none", label: t("prepNone") },
          { value: "polybag", label: t("polybag") },
          { value: "sealedPolybag", label: t("sealedPolybag") }
        ]}
      />
      {labelChoices.map(([value, key]) => (
        <Field key={value} orientation="horizontal">
          <Checkbox
            id={`packing-${index}-${value}`}
            checked={labels.includes(value)}
            onCheckedChange={(checked) =>
              field.onChange(checked ? [...labels, value] : labels.filter((label) => label !== value))
            }
          />
          <FieldContent>
            <FieldLabel htmlFor={`packing-${index}-${value}`}>{t(key)}</FieldLabel>
            {value === "fnsku" && fnsku && <FieldDescription className="font-mono break-all">{fnsku}</FieldDescription>}
          </FieldContent>
        </Field>
      ))}
      {labels.includes("countryOfOrigin") && (
        <FormSelect
          name={`items.${index}.packingRequirements.countryCode`}
          label={t("countryOfOriginCode")}
          options={countries}
        />
      )}
      <FormTextarea
        name={`items.${index}.packingRequirements.instructions`}
        label={t("instructions")}
        description={t("markdownHint")}
      />
    </>
  )
}
