import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
  Field,
  FieldDescription,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText
} from "@buildkitgg/shadcn"
import { useTranslations } from "use-intl"
import { RequiredMark } from "@/components/form-controls"
import { OptionSelect } from "@/components/option-select"
import { useMoney } from "@/hooks/use-money"
import { adjustPrice } from "@/lib/catalog-pricing"
import type { CatalogEditorData } from "@/server/catalogs"

// A catalog's own fields, as the form holds them: the percentage is kept as typed.
export type CatalogSettingsDraft = {
  title: string
  status: "active" | "draft" | "archived"
  direction: "decrease" | "increase"
  percent: string
  includeNewProducts: boolean
  customerIds: string[]
}

const statuses = ["active", "draft", "archived"] as const
// Read with the percentage after it, as one phrase: Decrease by 10%.
const directions = ["decrease", "increase"] as const

export function initialSettings(
  catalog: CatalogEditorData["catalog"],
  customers: CatalogEditorData["customers"]
): CatalogSettingsDraft {
  const bps = catalog?.adjustmentBasisPoints ?? 0
  return {
    title: catalog?.title ?? "",
    status: catalog?.status ?? "active",
    direction: bps > 0 ? "increase" : "decrease",
    percent: bps ? String(Math.abs(bps) / 100) : "0",
    includeNewProducts: catalog?.includeNewProducts ?? true,
    customerIds: customers.filter((customer) => customer.assigned).map((customer) => customer.id)
  }
}

// The adjustment in basis points, or null when it isn't a valid percentage.
export function basisPoints(settings: Pick<CatalogSettingsDraft, "direction" | "percent">) {
  const percent = Number(settings.percent.trim() || "0")
  if (
    !/^\d{0,4}(?:\.\d{0,2})?$/.test(settings.percent.trim()) ||
    percent > (settings.direction === "decrease" ? 100 : 1000)
  ) {
    return null
  }
  return Math.round(percent * 100) * (settings.direction === "decrease" ? -1 : 1)
}

function AdjustmentHelp({ bps, direction }: { bps: number | null; direction: CatalogSettingsDraft["direction"] }) {
  const t = useTranslations("supplier.catalogEditor")
  const money = useMoney()
  if (bps === null) {
    return t("enterRange", { max: direction === "decrease" ? 100 : 1000 })
  }
  return bps
    ? t("adjustmentExample", { before: money(10_000), after: money(adjustPrice(10_000, bps)) })
    : t("adjustmentRule")
}

// A catalog's title, status and customers, then its pricing: one adjustment for every price it doesn't fix.
export function CatalogSettings({
  settings,
  onChange,
  customers,
  readOnly
}: {
  settings: CatalogSettingsDraft
  onChange: (next: Partial<CatalogSettingsDraft>) => void
  customers: CatalogEditorData["customers"]
  // Shows the settings with every field turned off.
  readOnly: boolean
}) {
  const anchor = useComboboxAnchor()
  const t = useTranslations("supplier.catalogEditor")
  const shared = useTranslations("supplier.shared")
  const bps = basisPoints(settings)
  return (
    <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-4">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <Field>
              <FieldLabel htmlFor="catalog-title">
                <span>
                  {t("title")}
                  <RequiredMark />
                </span>
              </FieldLabel>
              <InputGroup>
                <InputGroupInput
                  id="catalog-title"
                  required
                  maxLength={255}
                  value={settings.title}
                  onChange={(event) => onChange({ title: event.target.value })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText className="tabular-nums">{settings.title.length}/255</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <FieldLabel htmlFor="catalog-status">{t("status")}</FieldLabel>
              <OptionSelect
                id="catalog-status"
                options={statuses.map((value) => ({ value, label: shared(`status.${value}`) }))}
                value={settings.status}
                onValueChange={(status) => onChange({ status })}
                className="w-full"
              />
            </Field>
          </div>
          <Field>
            <FieldLabel>{t("customers")}</FieldLabel>
            {customers.length ? (
              <Combobox
                items={customers}
                multiple
                value={customers.filter((customer) => settings.customerIds.includes(customer.id))}
                onValueChange={(value) => onChange({ customerIds: value.map((customer) => customer.id) })}
                itemToStringLabel={(customer) => customer.name}
                isItemEqualToValue={(item, value) => item.id === value.id}
              >
                <ComboboxChips ref={anchor}>
                  <ComboboxValue>
                    {(value: typeof customers) => (
                      <>
                        {value.map((customer) => (
                          <ComboboxChip key={customer.id}>{customer.name}</ComboboxChip>
                        ))}
                        <ComboboxChipsInput
                          placeholder={value.length ? "" : t("addCustomers")}
                          aria-label={t("addCustomers")}
                        />
                      </>
                    )}
                  </ComboboxValue>
                </ComboboxChips>
                <ComboboxContent anchor={anchor}>
                  <ComboboxEmpty>{t("noCustomersFound")}</ComboboxEmpty>
                  <ComboboxList>
                    {(customer: (typeof customers)[number]) => (
                      <ComboboxItem key={customer.id} value={customer}>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate">{customer.name}</span>
                          {customer.otherCatalog && (
                            <span className="truncate text-xs text-muted-foreground">
                              {t("movesFrom", { catalog: customer.otherCatalog })}
                            </span>
                          )}
                        </span>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
            ) : (
              <FieldDescription>{t("customersAppear")}</FieldDescription>
            )}
            {settings.status !== "active" && settings.customerIds.length > 0 && (
              <FieldDescription>{t("inactiveNote")}</FieldDescription>
            )}
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pricing")}</CardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel htmlFor="catalog-adjustment">{t("priceAdjustment")}</FieldLabel>
            {/* One phrase: Decrease by 10%. */}
            <div className="flex flex-wrap items-center gap-2">
              <OptionSelect
                options={directions.map((value) => ({
                  value,
                  label: value === "decrease" ? t("decreaseBy") : t("increaseBy")
                }))}
                value={settings.direction}
                onValueChange={(direction) => onChange({ direction })}
                label={t("adjustmentDirection")}
                className="w-32"
              />
              <InputGroup className="w-24">
                <InputGroupInput
                  id="catalog-adjustment"
                  inputMode="decimal"
                  value={settings.percent}
                  aria-invalid={bps === null || undefined}
                  className="text-end tabular-nums"
                  onChange={(event) => onChange({ percent: event.target.value })}
                />
                <InputGroupAddon align="inline-end">
                  <InputGroupText>%</InputGroupText>
                </InputGroupAddon>
              </InputGroup>
            </div>
            <FieldDescription>
              <AdjustmentHelp bps={bps} direction={settings.direction} />
            </FieldDescription>
          </Field>
        </CardContent>
      </Card>
    </fieldset>
  )
}
