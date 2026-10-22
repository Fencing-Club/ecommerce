import { Factory, Warehouse } from "lucide-react"
import { useTranslations } from "use-intl"
import { OptionSelect } from "@/components/option-select"
import { InputGroup, InputGroupAddon, InputGroupNumberInput, InputGroupText } from "@/components/ui/input-group"
import type { SupplierOption } from "@/lib/api"
import { wholeDays } from "@/lib/restock-selection"
import type { RestockChannelOption } from "@/server/restock-page"
import { dayRange } from "@/server/restock-report"

// A number of days in the toolbar: its label, the number, then "days".
function DaysField({
  id,
  label,
  hint,
  value,
  onChange
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (value: string) => void
}) {
  const t = useTranslations("restock")
  return (
    <InputGroup className="w-auto">
      <InputGroupAddon>
        <label htmlFor={id} title={hint}>
          {label}
        </label>
      </InputGroupAddon>
      <InputGroupNumberInput
        id={id}
        inputMode="numeric"
        min={dayRange.min}
        max={dayRange.max}
        value={value}
        aria-invalid={wholeDays(value) === null}
        onChange={(event) => onChange(event.target.value)}
        className="w-10 flex-none text-center"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{t("daysUnit")}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  )
}

// What Restock calculates for: a location, a supplier or all of them, the sales period and the default lead time. The
// days are kept as typed, so a field can be cleared while editing; one that isn't a whole number in range is marked.
export function RestockToolbar({
  channels,
  channelsLoading,
  channel,
  onChannelChange,
  suppliers,
  supplier,
  onSupplierChange,
  days,
  onDaysChange,
  leadTimeDays,
  onLeadTimeDaysChange
}: {
  channels: RestockChannelOption[]
  channelsLoading: boolean
  // The chosen channel's key, or null before there's one.
  channel: string | null
  onChannelChange: (key: string) => void
  suppliers: SupplierOption[]
  // "all", or a supplier's id.
  supplier: string
  onSupplierChange: (supplier: string) => void
  days: string
  onDaysChange: (days: string) => void
  leadTimeDays: string
  onLeadTimeDaysChange: (days: string) => void
}) {
  const t = useTranslations("restock")
  return (
    <div className="flex flex-wrap items-center gap-2">
      <OptionSelect
        options={channels.map((item) => ({ value: item.key, label: item.label }))}
        value={channel}
        onChange={onChannelChange}
        disabled={!channels.length}
        label={t("location")}
        icon={<Warehouse className="text-muted-foreground" />}
        placeholder={channelsLoading ? t("loading") : t("syncFirst")}
        className="min-w-40"
      />
      <OptionSelect
        options={[
          { value: "all", label: t("allSuppliers") },
          ...suppliers.map((row) => ({ value: row.id, label: row.name }))
        ]}
        value={supplier}
        onChange={onSupplierChange}
        label={t("supplier")}
        icon={<Factory className="text-muted-foreground" />}
        className="min-w-40"
      />
      <DaysField id="restock-days" label={t("salesPeriod")} value={days} onChange={onDaysChange} />
      <DaysField
        id="restock-lead-time"
        label={t("leadTimeLabel")}
        hint={t("leadTimeHint")}
        value={leadTimeDays}
        onChange={onLeadTimeDaysChange}
      />
    </div>
  )
}
