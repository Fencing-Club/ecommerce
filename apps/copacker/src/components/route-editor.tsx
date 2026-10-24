import {
  Button,
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@buildkitgg/shadcn-baseui-kit"
import {
  type AmazonNetwork,
  appendStop,
  endsRoute,
  type LegArrangement,
  legChoices,
  receivers,
  removeLastStop,
  replaceStop,
  type Route,
  type RouteStop as RuleStop,
  setLeg,
  stopChoices,
  stopNetwork
} from "@repo/copacker-packing-rules"
import {
  Building2,
  CalendarDays,
  Check,
  ExternalLink,
  Info,
  MapPin,
  Plus,
  Trash2,
  Truck,
  Warehouse
} from "lucide-react"
import { Fragment, type ReactNode, useState } from "react"
import { useFormatter, useTranslations } from "use-intl"
import { cn } from "@/lib/utils"

// A stop as the route rules read it (`@repo/copacker-packing-rules/routes`), with what its line shows: its name, such as
// "Northwind Textiles / Main factory", and its address or what happens there.
export type RouteStop = RuleStop & { name: string; detail?: string }

// The places a stop can be chosen from, in its menu's groups, such as Forwarders and Amazon. The route rules pick which
// fit each position.
export type RouteChoices = { label: string; stops: RouteStop[] }[]

// The route as a timeline: each stop with its node on a rail, and between two stops, who moves the goods there. Read
// only, it lists them, and a leg nobody has chosen yet is just the rail, apart from Amazon's to and from AGL. While editing (`editing`), each stop after the first is chosen from the `choices` the route rules
// allow there, the last can be removed and a stop added after it, and each leg is chosen from who can move it; changes
// go to `onChange`. Ship from is the packing's own field: `shipFrom` replaces its line while packing, with the packing's
// ready date and pallets (`packing`) under it. Read only, `readyDate` says when the cartons are ready.
export function RouteEditor({
  route,
  buyer,
  editing = false,
  choices = [],
  onChange,
  shipFrom,
  packing,
  readyDate
}: {
  route: Route<RouteStop>
  // The buyer, who books AGL in Seller Central.
  buyer: string
  editing?: boolean
  choices?: RouteChoices
  onChange?: (route: Route<RouteStop>) => void
  shipFrom?: ReactNode
  packing?: ReactNode
  readyDate?: string
}) {
  const t = useTranslations("shipments.route")
  const format = useFormatter()
  const [adding, setAdding] = useState(false)
  // A stop being added goes when editing ends, so it isn't back the next time.
  if (!editing && adding) {
    setAdding(false)
  }
  const { stops, legs } = route
  const last = stops.at(-1)
  const change = (next: Route<RouteStop>) => onChange?.(next)
  // Each group's places that fit the position, leaving out groups with none.
  const fitting = (index: number) =>
    choices
      .map((group) => ({ ...group, stops: stopChoices(route, index, group.stops) }))
      .filter((group) => group.stops.length > 0)
  const label = (stop: RouteStop, index: number) => {
    if (index === 0) {
      return t("shipFrom")
    }
    return endsRoute(stop) ? t("finalDestination") : t("shipTo")
  }
  return (
    <ol aria-label={t("title")} className="flex flex-col">
      {stops.map((stop, index) => {
        const isLast = index === stops.length - 1
        const network = stopNetwork(stop)
        const from = stops[index - 1]
        const leg = legs[index - 1]
        return (
          <Fragment key={`${index}-${stop.id}`}>
            {from &&
              (leg || legChoices(from, stop).length === 0 ? (
                <Leg
                  from={from}
                  to={stop}
                  leg={leg}
                  buyer={buyer}
                  editing={editing}
                  onChange={(next) => change(setLeg(route, index - 1, next))}
                />
              ) : (
                <li aria-hidden className="flex h-4 gap-3">
                  <Rail line />
                </li>
              ))}
            <li className="flex gap-3">
              <Rail line={!isLast || editing}>
                <StopIcon index={index} stop={stop} />
              </Rail>
              <div className={cn("flex min-w-0 flex-1 flex-col gap-2 pt-1", (!isLast || editing) && "pb-1")}>
                {index === 0 && shipFrom ? (
                  shipFrom
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-medium">{label(stop, index)}</span>
                      {editing && isLast && index > 0 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          className="text-muted-foreground"
                          aria-label={t("removeStop", { name: stop.name })}
                          onClick={() => change(removeLastStop(route))}
                        >
                          <Trash2 />
                          {t("remove")}
                        </Button>
                      )}
                    </div>
                    {editing && index > 0 ? (
                      <StopSelect
                        label={label(stop, index)}
                        value={stop}
                        choices={fitting(index)}
                        onChange={(next) => change(replaceStop(route, index, next))}
                      />
                    ) : (
                      <StopLines stop={stop} />
                    )}
                  </>
                )}
                {index === 0 && packing}
                {index === 0 && !packing && readyDate && (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays aria-hidden className="size-3.5" />
                    {t("ready", {
                      date: format.dateTime(new Date(`${readyDate}T00:00:00Z`), {
                        month: "short",
                        day: "numeric",
                        timeZone: "UTC"
                      })
                    })}
                  </p>
                )}
                {network && <NetworkInfo network={network} />}
              </div>
            </li>
          </Fragment>
        )
      })}
      {/* The stop being added: its leg's arrangement is chosen once the stop is. */}
      {editing && adding && (
        <>
          <li aria-hidden className="flex h-6 gap-3">
            <Rail line />
          </li>
          <li className="flex gap-3">
            <Rail line={false}>
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
                <Plus aria-hidden className="size-3.5" />
              </span>
            </Rail>
            <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
              <span className="text-sm font-medium">{t("newStop")}</span>
              <StopSelect
                label={t("newStop")}
                choices={fitting(stops.length)}
                onChange={(next) => {
                  setAdding(false)
                  change(appendStop(route, next))
                }}
              />
            </div>
          </li>
        </>
      )}
      {editing && !adding && last && (
        <li className="flex items-end gap-3">
          <AddStop
            label={t("addStop")}
            reason={endsRoute(last) ? t("endsRoute", { name: last.name }) : undefined}
            onAdd={() => setAdding(true)}
          />
        </li>
      )}
    </ol>
  )
}

// A timeline's left column: the stop's node, and the rail on down to the next stop.
function Rail({ line, children }: { line: boolean; children?: ReactNode }) {
  return (
    <div className="flex w-7 shrink-0 flex-col items-center">
      {children}
      {line && <span aria-hidden className="w-px flex-1 bg-border" />}
    </div>
  )
}

function StopIcon({ index, stop }: { index: number; stop: RouteStop }) {
  let Icon = Warehouse
  if (index === 0) {
    Icon = Building2
  } else if (endsRoute(stop)) {
    Icon = MapPin
  }
  return (
    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
      <Icon aria-hidden className="size-3.5" />
    </span>
  )
}

function StopLines({ stop }: { stop: RouteStop }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-sm">{stop.name}</span>
      {stop.detail && (
        <span className="text-xs text-muted-foreground">
          <bdi>{stop.detail}</bdi>
        </span>
      )}
    </div>
  )
}

// A stop's menu: each place it can be, under its group's name, with its address or what happens there.
function StopSelect({
  label,
  value,
  choices,
  onChange
}: {
  label: string
  value?: RouteStop
  choices: RouteChoices
  onChange: (stop: RouteStop) => void
}) {
  const t = useTranslations("shipments.route")
  const all = choices.flatMap((group) => group.stops)
  return (
    <Select
      value={value?.id ?? null}
      items={all.map((stop) => ({ value: stop.id, label: stop.name }))}
      onValueChange={(id) => {
        const next = all.find((stop) => stop.id === id)
        if (next) {
          onChange(next)
        }
      }}
    >
      <SelectTrigger aria-label={label} className="w-full items-start py-2 data-[size=default]:h-auto [&>svg]:mt-1">
        <SelectValue className="min-w-0 !line-clamp-none">
          {(id: string | null) => {
            const chosen = all.find((stop) => stop.id === id)
            return chosen ? (
              <span className="flex min-w-0 flex-col gap-0.5 text-start whitespace-normal">
                <span>{chosen.name}</span>
                {chosen.detail && (
                  <span className="text-xs text-muted-foreground">
                    <bdi>{chosen.detail}</bdi>
                  </span>
                )}
              </span>
            ) : (
              <span className="text-muted-foreground">{t("chooseStop")}</span>
            )
          }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {choices.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel>{group.label}</SelectLabel>
            {group.stops.map((stop) => (
              <SelectItem key={stop.id} value={stop.id} className="items-start py-2">
                <span className="flex min-w-0 flex-col gap-0.5 whitespace-normal">
                  <span>{stop.name}</span>
                  {stop.detail && (
                    <span className="text-xs text-muted-foreground">
                      <bdi>{stop.detail}</bdi>
                    </span>
                  )}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}

// How the goods get from one stop to the next: who moves them, and what that means. While editing it's a menu of who
// can, unless Amazon moves them, which needs no choice (`leg`).
function Leg({
  from,
  to,
  leg,
  buyer,
  editing,
  onChange
}: {
  from: RouteStop
  to: RouteStop
  leg?: LegArrangement
  buyer: string
  editing: boolean
  onChange: (leg: LegArrangement) => void
}) {
  const t = useTranslations("shipments.route.legs")
  const allowed = legChoices(from, to)
  const company = (arrangement: LegArrangement) => (arrangement.startsWith("sender") ? from.company : to.company)
  const title = (arrangement: LegArrangement) => t(arrangement, { company: company(arrangement) })
  const arranges = (arrangement: LegArrangement) => arrangement.endsWith("Arranges")
  let heading = leg && title(leg)
  let note = leg && (arranges(leg) ? t("arrangesNote", { company: company(leg) }) : t("movesNote"))
  if (to.kind === "agl") {
    heading = t("amazon")
    note = t("aglCollects", { company: from.company, buyer })
  } else if (from.kind === "agl") {
    heading = t("amazon")
    note = t("aglShips", { name: to.name })
  }
  return (
    <li className="flex gap-3">
      <Rail line />
      <div className="flex min-w-0 flex-1 gap-2 py-3">
        <Truck aria-hidden className="mt-1.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col items-start gap-1">
          {editing && leg && allowed.length > 0 ? (
            <Select
              value={leg}
              items={allowed.map((value) => ({ value, label: title(value) }))}
              onValueChange={(value) => {
                const next = allowed.find((option) => option === value)
                if (next) {
                  onChange(next)
                }
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label={t("label", { from: from.company, to: to.company })}
                className="border-transparent bg-muted font-medium hover:bg-muted/80 dark:bg-muted"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent alignItemWithTrigger={false} align="start">
                <SelectGroup>
                  {allowed.map((value) => (
                    <SelectItem key={value} value={value} className="items-start py-2">
                      <span className="flex flex-col gap-0.5">
                        <span>{title(value)}</span>
                        <span className="text-xs text-muted-foreground">
                          {arranges(value) ? t("booksCarrier") : t("ownVehicle")}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          ) : (
            <span className="py-1 text-sm font-medium">{heading}</span>
          )}
          <p className="text-xs text-muted-foreground">{note}</p>
        </div>
      </div>
    </li>
  )
}

// Adds a stop after the last one. When that one ends the route, it's off, and its tooltip says why: it stays focusable
// (aria-disabled), since a disabled button would show no tooltip.
function AddStop({ label, reason, onAdd }: { label: string; reason?: string; onAdd: () => void }) {
  const button = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ms-2 aria-disabled:opacity-50"
      aria-disabled={!!reason || undefined}
      onClick={reason ? undefined : onAdd}
    >
      {label}
    </Button>
  )
  return (
    <>
      <div className="flex w-7 shrink-0 flex-col items-center">
        <span aria-hidden className="h-4 w-px bg-border" />
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full border bg-background",
            reason && "opacity-50"
          )}
        >
          <Plus aria-hidden className="size-3.5" />
        </span>
      </div>
      {reason ? (
        <Tooltip>
          <TooltipTrigger render={button} />
          <TooltipContent>{reason}</TooltipContent>
        </Tooltip>
      ) : (
        button
      )}
    </>
  )
}

// An Amazon network's requirements, behind its About link: what it is, the rules its cartons and pallets follow, and
// its own pages.
function NetworkInfo({ network }: { network: AmazonNetwork }) {
  const t = useTranslations("shipments.route")
  const receiver = receivers[network]
  const name = t(`networks.${network}.name`)
  const pages = [
    { label: t("documentation"), href: receiver.documentation },
    { label: t("website"), href: receiver.website }
  ]
  return (
    <Popover>
      <PopoverTrigger
        render={<Button type="button" variant="link" size="sm" className="h-auto self-start p-0 text-foreground" />}
      >
        <Info aria-hidden />
        {t("about", { name })}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(25rem,calc(100vw-2rem))] gap-3">
        <PopoverHeader>
          <PopoverTitle>{name}</PopoverTitle>
          <PopoverDescription>{t(`networks.${network}.about`)}</PopoverDescription>
        </PopoverHeader>
        <Tabs defaultValue="cartons">
          <TabsList aria-label={t("requirements", { name })}>
            <TabsTrigger value="cartons">{t("cartons")}</TabsTrigger>
            <TabsTrigger value="pallets">{t("pallets")}</TabsTrigger>
          </TabsList>
          {(
            [
              ["cartons", receiver.cartonPolicy.rules],
              ["pallets", receiver.palletPolicy.rules]
            ] as const
          ).map(([tab, rules]) => (
            <TabsContent key={tab} value={tab}>
              <ul className="flex flex-col gap-2 pt-1 text-sm">
                {rules.map((rule) => (
                  <li key={rule.summary} className="flex items-start gap-2">
                    <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    {rule.summary}
                  </li>
                ))}
              </ul>
            </TabsContent>
          ))}
        </Tabs>
        <div className="flex flex-wrap gap-4 border-t pt-3">
          {pages.map((page) => (
            <a
              key={page.label}
              href={page.href}
              target="_blank"
              rel="noreferrer"
              className="focus-ring inline-flex items-center gap-1 rounded-sm text-sm font-medium underline-offset-4 hover:underline"
            >
              {page.label}
              <ExternalLink aria-hidden className="size-3.5 text-muted-foreground" />
              <span className="sr-only"> ({t("opensInNewTab")})</span>
            </a>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
