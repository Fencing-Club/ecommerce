import { cartonList } from "@repo/copacker-packing-rules"
import { ChevronDown, ListChecks, Search } from "lucide-react"
import { useState } from "react"
import { useTranslations } from "use-intl"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import type { PalletCarton, PalletValue } from "@/lib/carton-groups"
import { cn } from "@/lib/utils"
import { useMeasure } from "./packing-fields"

// Chooses the cartons on a pallet, a row per carton configuration that opens onto its cartons, so a configuration can
// split across pallets. Each carton shows the pallet it's on now; choosing it here moves it.
export function PalletCartonsDialog({
  pallet,
  pallets,
  cartons,
  context,
  onSave
}: {
  pallet: PalletValue
  pallets: PalletValue[]
  cartons: PalletCarton[]
  context?: string
  onSave: (cartonIds: string[]) => void
}) {
  const t = useTranslations("orders.palletCartons")
  const names = useTranslations("orders.pallets")
  const units = useTranslations("orders.cartonEditor")
  const measure = useMeasure()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [expanded, setExpanded] = useState<number[]>([])
  const name = names("name", { pallet: pallet.palletId })
  const palletOf = (id: string) => pallets.find((other) => other.cartonIds.includes(id))
  const where = (id: string) => {
    const on = palletOf(id)
    if (!on) {
      return "—"
    }
    return on.palletId === pallet.palletId ? t("thisPallet") : names("name", { pallet: on.palletId })
  }
  const groups = [...Map.groupBy(cartons, (carton) => carton.group).values()]
  const search = query.trim().toLocaleLowerCase()
  const visible = groups.filter(
    (group) =>
      !search ||
      group.some((carton) => carton.id.toLocaleLowerCase().includes(search)) ||
      group[0]!.contents.some((content) => `${content.sku} ${content.name}`.toLocaleLowerCase().includes(search))
  )
  const chosen = cartons.filter((carton) => selected.includes(carton.id))
  const toggle = (ids: string[], checked: boolean) =>
    setSelected((current) => (checked ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id))))
  const size = (carton: PalletCarton) =>
    t("measure", { dimensions: measure.dimensions(carton), weight: measure.weight(carton.weight) })
  // Newly chosen cartons are tinted until saved.
  const tint = (ids: string[]) => ids.some((id) => selected.includes(id) && !pallet.cartonIds.includes(id))
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setSelected(pallet.cartonIds)
          // Configurations split across pallets open onto their cartons.
          setExpanded(
            groups.flatMap((group) =>
              group.length > 1 && new Set(group.map((carton) => palletOf(carton.id)?.palletId)).size > 1
                ? [group[0]!.group]
                : []
            )
          )
        } else {
          setQuery("")
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" aria-label={t("title", { pallet: name })} />}>
        <ListChecks aria-hidden />
        {names("chooseCartons")}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { pallet: name })}</DialogTitle>
          {context && <DialogDescription>{context}</DialogDescription>}
        </DialogHeader>
        <InputGroup>
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            aria-label={t("search")}
            placeholder={t("search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </InputGroup>
        <div className="@container/chooser overflow-hidden rounded-lg border">
          <div
            aria-hidden
            className="grid grid-cols-[1rem_minmax(0,1fr)_auto] gap-x-3 bg-muted px-4 py-2 text-xs text-muted-foreground @lg/chooser:grid-cols-[1rem_minmax(0,1fr)_11rem_6rem]"
          >
            <span className="col-start-2">{t("cartons")}</span>
            <span className="hidden @lg/chooser:block">{t("sizeAndWeight")}</span>
            <span className="text-end">{t("pallet")}</span>
          </div>
          <ul className="divide-y">
            {visible.map((group) => {
              const ids = group.map((carton) => carton.id)
              const first = group[0]!
              const count = ids.filter((id) => selected.includes(id)).length
              const label = cartonList(ids)
              const isOpen = expanded.includes(first.group)
              const on = new Set(ids.map((id) => palletOf(id)?.palletId).filter(Boolean))
              let palletText = where(first.id)
              if (on.size > 1) {
                palletText = t("palletCount", { count: on.size })
              }
              const contents = first.contents
                .map((content) =>
                  ids.length > 1
                    ? t("contentEach", { sku: content.sku, count: content.pieces })
                    : t("content", { sku: content.sku, count: content.pieces })
                )
                .join(" / ")
              return (
                <li key={first.group}>
                  <div
                    className={cn(
                      "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 px-4 py-3 @lg/chooser:grid-cols-[1rem_minmax(0,1fr)_11rem_6rem]",
                      tint(ids) && "bg-orange-50 dark:bg-orange-950"
                    )}
                  >
                    <Checkbox
                      className="mt-0.5"
                      aria-label={label}
                      checked={count === ids.length}
                      indeterminate={count > 0 && count < ids.length}
                      onCheckedChange={(checked) => toggle(ids, checked)}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-medium">{label}</span>
                        {ids.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-xs"
                            aria-expanded={isOpen}
                            aria-label={t("showCartons", { cartons: label })}
                            onClick={() =>
                              setExpanded((current) =>
                                isOpen ? current.filter((value) => value !== first.group) : [...current, first.group]
                              )
                            }
                          >
                            <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} />
                          </Button>
                        )}
                      </div>
                      <p className="mt-0.5 text-meta text-muted-foreground [overflow-wrap:anywhere]">
                        {[
                          ids.length > 1 && units("cartonCount", { count: ids.length }),
                          contents,
                          count > 0 && count < ids.length && t("onThisPallet", { count })
                        ]
                          .filter(Boolean)
                          .join(" / ")}
                      </p>
                      <p className="mt-0.5 text-meta text-muted-foreground @lg/chooser:hidden">{size(first)}</p>
                    </div>
                    <span className="hidden tabular-nums @lg/chooser:block">{size(first)}</span>
                    <span className={cn("text-end", palletText === "—" && "text-muted-foreground")}>{palletText}</span>
                  </div>
                  {isOpen && (
                    <ul className="divide-y border-t">
                      {group.map((carton) => (
                        <li
                          key={carton.id}
                          className={cn(
                            "grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 ps-11 pe-4 @lg/chooser:grid-cols-[1rem_minmax(0,1fr)_11rem_6rem]",
                            tint([carton.id]) && "bg-orange-50 dark:bg-orange-950"
                          )}
                        >
                          <Checkbox
                            aria-label={carton.id}
                            checked={selected.includes(carton.id)}
                            onCheckedChange={(checked) => toggle([carton.id], checked)}
                          />
                          <span>{carton.id}</span>
                          <span className="hidden tabular-nums @lg/chooser:block">{size(carton)}</span>
                          <span
                            className={cn(
                              "text-end",
                              palletOf(carton.id)?.palletId !== pallet.palletId && "text-muted-foreground"
                            )}
                          >
                            {where(carton.id)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
            {!visible.length && <li className="p-4 text-sm text-muted-foreground">{t("noCartons")}</li>}
          </ul>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <span className="me-auto text-sm text-muted-foreground tabular-nums">
            {t("selection", {
              count: chosen.length,
              weight: measure.weight(chosen.reduce((sum, carton) => sum + (carton.weight || 0), 0))
            })}
          </span>
          <Button type="button" variant="outline" onClick={() => setOpen(false)}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            onClick={() => {
              // Kept in packing list order, so the pallet's cartons read as runs.
              onSave(cartons.filter((carton) => selected.includes(carton.id)).map((carton) => carton.id))
              setOpen(false)
            }}
          >
            {t("save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
