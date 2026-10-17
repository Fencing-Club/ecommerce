import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { useDebouncedValue, useHotkeys, useOs } from "@mantine/hooks"
import { defaultFilter } from "cmdk"
import { ArrowDown, ArrowUp, ClipboardList, CornerDownLeft, Package, Receipt, Search, Truck, Users } from "lucide-react"
import { useDeferredValue, useRef, useState } from "react"
import { useTranslations } from "use-intl"
import { Status } from "@/components/common"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading
} from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { useSalesSearchQuery, useSearchQuery } from "@/lib/api"
import { navigationFor } from "@/lib/navigation"
import { cn } from "@/lib/utils"
import { useCan, usePermissions } from "./access"
import { SalesStatus } from "./sales-status"

// The most results of each kind a search lists, best first, and the newest POs shown before anything is typed.
const shown = 5
const recent = 5

// The items matching what's typed, best first. cmdk's scoring finds the letters in order but not necessarily side by
// side, so "po37" finds PO-037 (about 0.17). Letters scattered across a long text score near 0, such as "bob smith" in
// a product with many variations, so those are left out.
const weakest = 0.1

function best<T>(items: readonly T[], words: (item: T) => string[], query: string, count = items.length) {
  return items
    .map((item) => ({ item, score: defaultFilter(words(item).join(" "), query) }))
    .filter((match) => match.score >= weakest)
    .toSorted((a, b) => b.score - a.score)
    .slice(0, count)
    .map((match) => match.item)
}

// The keys the panel's hints name, placed in their translated sentences.
function moveKeys() {
  return (
    <KbdGroup>
      <Kbd>
        <ArrowUp />
      </Kbd>
      <Kbd>
        <ArrowDown />
      </Kbd>
    </KbdGroup>
  )
}

function openKey() {
  return (
    <Kbd>
      <CornerDownLeft />
    </Kbd>
  )
}

function closeKey() {
  return <Kbd>Esc</Kbd>
}

// The search in the top bar, like Shopify's: clicking it, or Ctrl+K (⌘K on a Mac) from anywhere, opens a panel over the
// bar with the text box where the bar was and results under it. The bar says what it finds in this kind of workspace,
// and becomes a button on a phone.
export function SearchCommand({ kind, navigate }: { kind: string; navigate: (href: string) => void }) {
  const t = useTranslations("navigation.search")
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const os = useOs()
  const mac = os === "macos" || os === "ios"
  useHotkeys([["mod+K", () => setOpen((current) => !current)]], [])
  const placeholder = kind === "supplier" || kind === "forwarder" ? kind : "buyer"

  function go(href: string) {
    setOpen(false)
    navigate(href)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal>
      <PopoverPrimitive.Trigger
        render={
          <Button
            variant="outline"
            aria-label={t("search")}
            aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
            className="h-9 w-full justify-start gap-2 rounded-md bg-muted px-3 font-normal text-muted-foreground shadow-none hover:bg-muted dark:bg-muted max-md:size-11 max-md:justify-center max-md:border-transparent max-md:bg-transparent max-md:px-0 max-md:text-foreground max-md:[&_svg:not([class*='size-'])]:size-5"
          />
        }
      >
        <Search />
        <span className="truncate max-md:hidden" aria-hidden>
          {t(`placeholder.${placeholder}`)}
        </span>
        <Kbd
          aria-hidden="true"
          className="ms-auto h-auto rounded-[4px] border bg-background px-1.5 py-px text-[11px] font-medium text-muted-foreground max-md:hidden"
        >
          {mac ? "⌘K" : t("ctrlK")}
        </Kbd>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Backdrop className="fixed inset-0 z-50 bg-scrim duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        {/* The panel's padding is 8px around its text box, so it starts 8px above the bar and is 16px wider. */}
        <PopoverPrimitive.Positioner
          side="bottom"
          sideOffset={({ anchor }) => -anchor.height - 8}
          collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            aria-label={t("search")}
            initialFocus={input}
            className="w-[calc(var(--anchor-width)+1rem)] min-w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-xl bg-popover shadow-command ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          >
            <SearchResults kind={kind} input={input} onSelect={go} />
            {/* Keyboard hints, in line with the results' icons. Screen readers skip them, as they announce the results as
                a list, and phones, which have no keyboard, don't show them. */}
            <div
              aria-hidden="true"
              className="flex items-center gap-4 border-t px-4 py-1.5 text-xs text-muted-foreground max-sm:hidden"
            >
              <span className="flex items-center gap-1.5">{t.rich("toMove", { keys: moveKeys })}</span>
              <span className="flex items-center gap-1.5">{t.rich("toOpen", { keys: openKey })}</span>
              <span className="flex items-center gap-1.5">{t.rich("toClose", { keys: closeKey })}</span>
            </div>
            {/* A modal popover only keeps focus inside when it has a close button. */}
            <PopoverPrimitive.Close className="sr-only">{t("close")}</PopoverPrimitive.Close>
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

// Pages, and what matches what's typed, in the sidebar's order: a buyer's sales orders and products, the workspace's
// POs and shipments, and a buyer's partners. Before anything is typed, the pages and the newest POs show. Everything but
// sales orders is fetched when the panel opens, again once it's 30 seconds old, and matched here; sales orders are
// searched on the server as the Orders page searches them, once typing pauses.
function SearchResults({
  kind,
  input,
  onSelect
}: {
  kind: string
  input: React.RefObject<HTMLInputElement | null>
  onSelect: (href: string) => void
}) {
  const t = useTranslations("navigation")
  const [text, setText] = useState("")
  const query = useDeferredValue(text.trim())
  const [typed] = useDebouncedValue(query.slice(0, 100), 250)
  // The highlighted result and the search it was picked in; a new search highlights its best result.
  const [picked, setPicked] = useState({ value: "", query: "" })
  const index = useSearchQuery(undefined, { refetchOnMountOrArgChange: 30 })
  // Sales orders are searched for someone who can open the Orders page.
  const searchesSales = useCan("sales") && kind === "buyer"
  const sales = useSalesSearchQuery(typed, { skip: !searchesSales || typed.length < 2 })
  const data = index.data
  const navigation = navigationFor(kind, usePermissions())
  const pages = query ? best(navigation, (page) => [t(`pages.${page.labelKey}`)], query) : navigation
  // Only this search's orders: an earlier search's stay out while this one is on its way.
  const salesOrders = query && typed === query ? (sales.currentData?.orders ?? []).slice(0, shown) : []
  const products = query
    ? best(data?.products ?? [], (product) => [product.title, ...product.keywords], query, shown)
    : []
  const orders = query
    ? best(data?.orders ?? [], (order) => [order.reference, order.supplier, ...order.amazonIds], query, shown)
    : (data?.orders ?? []).slice(0, recent)
  const shipments = query ? best(data?.shipments ?? [], (shipment) => shipment.keywords, query, shown) : []
  const partners = query
    ? best(data?.partners ?? [], (partner) => [partner.name, ...partner.keywords], query, shown)
    : []
  const values = [
    ...pages.map((page) => `page:${page.view}`),
    ...salesOrders.map((order) => `sale:${order.source}:${order.orderId}`),
    ...products.map((product) => `product:${product.id}`),
    ...orders.map((order) => `order:${order.id}`),
    ...shipments.map((shipment) => `shipment:${shipment.id}`),
    ...partners.map((partner) => `partner:${partner.id}`)
  ]
  const highlighted = picked.query === query && values.includes(picked.value) ? picked.value : (values[0] ?? "")
  // Sales orders are on their way until typing pauses and the server answers.
  const searchingSales = searchesSales && query.length >= 2 && (typed !== query || sales.isFetching)
  const loading = index.isLoading || searchingSales

  return (
    <Command shouldFilter={false} loop value={highlighted} onValueChange={(value) => setPicked({ value, query })}>
      <CommandInput ref={input} value={text} onValueChange={setText} placeholder={t("search.search")} />
      <CommandList className="max-h-[min(28rem,calc(100svh-6rem))]">
        {/* Nothing matches only once something is typed; before that, the pages show. */}
        {!loading && <CommandEmpty className="px-4 break-words">{t("search.noResults", { query })}</CommandEmpty>}
        {pages.length > 0 && (
          <CommandGroup heading={t("search.pages")}>
            {pages.map((page) => (
              <CommandItem key={page.view} value={`page:${page.view}`} onSelect={() => onSelect(`/${page.view}`)}>
                <page.icon />
                {t(`pages.${page.labelKey}`)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {searchingSales && !salesOrders.length && (
          <CommandLoading label={t("search.loadingOrders")}>
            <Placeholder heading={t("search.orders")} rows={2} badge />
          </CommandLoading>
        )}
        {salesOrders.length > 0 && (
          <CommandGroup heading={t("search.orders")}>
            {salesOrders.map((order) => (
              <CommandItem
                key={`${order.source}:${order.orderId}`}
                value={`sale:${order.source}:${order.orderId}`}
                onSelect={() => onSelect(`/sales?q=${encodeURIComponent(order.number)}`)}
                // The status ends the row, so the item's check mark isn't needed.
                className="[&>svg:last-child]:hidden"
              >
                <Receipt />
                <span className="shrink-0 font-medium">{order.number}</span>
                <span className="min-w-0 truncate text-muted-foreground">{order.channel}</span>
                <span className="ms-auto flex shrink-0">
                  <SalesStatus status={order.status} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {/* Until the first load arrives, which groups will match is unknown, except for the newest purchase orders. */}
        {index.isLoading && (
          <CommandLoading label={t("search.loadingResults")}>
            {query ? (
              <Placeholder rows={3} />
            ) : (
              <Placeholder heading={t("search.recentPurchaseOrders")} rows={3} badge />
            )}
          </CommandLoading>
        )}
        {products.length > 0 && (
          <CommandGroup heading={t("search.products")}>
            {products.map((product) => (
              <CommandItem
                key={product.id}
                value={`product:${product.id}`}
                onSelect={() => onSelect(`/products?q=${encodeURIComponent(product.title)}`)}
              >
                {product.imageUrl ? (
                  <img
                    loading="lazy"
                    decoding="async"
                    src={product.imageUrl}
                    alt=""
                    width={20}
                    height={20}
                    className="size-5 shrink-0 rounded-sm object-cover"
                  />
                ) : (
                  <Package />
                )}
                <span className="truncate">{product.title}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {orders.length > 0 && (
          <CommandGroup heading={query ? t("search.purchaseOrders") : t("search.recentPurchaseOrders")}>
            {orders.map((order) => (
              <CommandItem
                key={order.id}
                value={`order:${order.id}`}
                onSelect={() => onSelect(`/orders/${order.id}`)}
                className="[&>svg:last-child]:hidden"
              >
                <ClipboardList />
                <span className="shrink-0 font-medium">{order.reference}</span>
                <span className="min-w-0 truncate text-muted-foreground">{order.supplier}</span>
                <span className="ms-auto flex shrink-0">
                  <Status status={order.status} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {shipments.length > 0 && (
          <CommandGroup heading={t("search.shipments")}>
            {shipments.map((shipment) => (
              <CommandItem
                key={shipment.id}
                value={`shipment:${shipment.id}`}
                onSelect={() => onSelect(`/shipments/${shipment.id}`)}
                className="[&>svg:last-child]:hidden"
              >
                <Truck />
                <span className="shrink-0 font-medium">{shipment.title}</span>
                <span className="min-w-0 truncate text-muted-foreground">{shipment.reference}</span>
                <span className="ms-auto flex shrink-0">
                  <Status status={shipment.status} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {partners.length > 0 && (
          <CommandGroup heading={t("search.partners")}>
            {partners.map((partner) => (
              <CommandItem
                key={partner.id}
                value={`partner:${partner.id}`}
                onSelect={() => onSelect(`/partners?q=${encodeURIComponent(partner.name)}`)}
                className="[&>svg:last-child]:hidden"
              >
                <Users />
                <span className="min-w-0 truncate">{partner.name}</span>
                <span className="ms-auto shrink-0 text-xs text-muted-foreground">
                  {partner.type === "supplier" ? t("search.supplier") : t("search.forwarder")}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {(index.isError || sales.isError) && <p className="px-3 py-2 text-sm text-destructive">{t("search.failed")}</p>}
      </CommandList>
    </Command>
  )
}

const placeholderWidths = ["w-2/5", "w-1/2", "w-1/3"]

// Rows shaped like the results they stand in for, under their group's heading when it's known, and as tall as real
// rows so nothing moves when the results arrive. Purchase orders and sales orders end in a status badge.
function Placeholder({ heading, rows, badge }: { heading?: string; rows: number; badge?: boolean }) {
  return (
    <>
      {heading ? (
        <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">{heading}</div>
      ) : (
        <div className="flex h-7 items-center px-2">
          <Skeleton className="h-3 w-24" />
        </div>
      )}
      {placeholderWidths.slice(0, rows).map((width) => (
        <div key={width} className="flex h-8 items-center gap-2 px-2">
          <Skeleton className="size-4 shrink-0 rounded-sm" />
          <Skeleton className={cn("h-3.5", width)} />
          {badge && <Skeleton className="ms-auto h-5 w-20 rounded-full" />}
        </div>
      ))}
    </>
  )
}
