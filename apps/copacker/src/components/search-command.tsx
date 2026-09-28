"use client"

import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { useDebouncedValue, useHotkeys, useOs } from "@mantine/hooks"
import { defaultFilter } from "cmdk"
import { ClipboardList, Package, Receipt, Search, Truck, Users } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useDeferredValue, useRef, useState } from "react"
import { Status } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Spinner } from "@/components/ui/spinner"
import { useSalesSearchQuery, useSearchQuery } from "@/lib/api"
import { hrefFor, navigationFor } from "@/lib/navigation"

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

// The search in the app header, like Shopify's: clicking it, or Ctrl+K (⌘K on a Mac) from anywhere, opens a panel over
// the bar with the text box where the bar was and results under it. The bar shrinks with the window and becomes a
// button on a phone.
export function SearchCommand({ kind, preview }: { kind: string; preview: boolean }) {
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const os = useOs()
  const mac = os === "macos" || os === "ios"
  useHotkeys([["mod+K", () => setOpen((current) => !current)]], [])

  function go(href: string) {
    setOpen(false)
    router.push(href)
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen} modal>
      <PopoverPrimitive.Trigger
        render={
          <Button
            variant="outline"
            aria-keyshortcuts={mac ? "Meta+K" : "Control+K"}
            className="w-full justify-start gap-1.5 bg-muted/50 px-2 font-normal text-muted-foreground shadow-none max-[30rem]:size-8 max-[30rem]:justify-center max-[30rem]:border-transparent max-[30rem]:bg-transparent max-[30rem]:px-0 max-[30rem]:text-foreground"
          />
        }
      >
        <Search />
        <span className="max-[30rem]:sr-only">Search</span>
        <KbdGroup aria-hidden="true" className="ml-auto max-sm:hidden">
          <Kbd>{mac ? "⌘" : "Ctrl"}</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        {/* The panel's padding is 8px around its text box, so it starts 8px above the bar and is 16px wider. */}
        <PopoverPrimitive.Positioner
          side="bottom"
          sideOffset={({ anchor }) => -anchor.height - 8}
          collisionAvoidance={{ side: "none", align: "shift", fallbackAxisSide: "none" }}
          className="isolate z-50"
        >
          <PopoverPrimitive.Popup
            aria-label="Search"
            initialFocus={input}
            className="w-[calc(var(--anchor-width)+1rem)] min-w-[min(24rem,calc(100vw-1rem))] rounded-xl shadow-lg ring-1 ring-foreground/10 outline-none duration-100 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
          >
            <SearchResults kind={kind} preview={preview} input={input} onSelect={go} />
            {/* A modal popover only keeps focus inside when it has a close button. */}
            <PopoverPrimitive.Close className="sr-only">Close</PopoverPrimitive.Close>
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
  preview,
  input,
  onSelect
}: {
  kind: string
  preview: boolean
  input: React.RefObject<HTMLInputElement | null>
  onSelect: (href: string) => void
}) {
  const [text, setText] = useState("")
  const query = useDeferredValue(text.trim())
  const [typed] = useDebouncedValue(query.slice(0, 100), 250)
  // The highlighted result and the search it was picked in; a new search highlights its best result.
  const [picked, setPicked] = useState({ value: "", query: "" })
  // The design preview has no workspace to search.
  const index = useSearchQuery(undefined, { skip: preview, refetchOnMountOrArgChange: 30 })
  const sales = useSalesSearchQuery(typed, { skip: preview || kind !== "buyer" || typed.length < 2 })
  const data = index.data
  const pages = query ? best(navigationFor(kind), (page) => [page.label], query) : navigationFor(kind)
  const salesOrders = query && typed === query ? (sales.data?.orders ?? []).slice(0, shown) : []
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
  const searchingSales = kind === "buyer" && !preview && query.length >= 2 && (typed !== query || sales.isFetching)
  const loading = index.isLoading || searchingSales

  return (
    <Command shouldFilter={false} loop value={highlighted} onValueChange={(value) => setPicked({ value, query })}>
      <CommandInput ref={input} value={text} onValueChange={setText} placeholder="Search" />
      <CommandList className="max-h-[min(28rem,calc(100svh-6rem))]">
        {!loading && <CommandEmpty>No results</CommandEmpty>}
        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((page) => (
              <CommandItem
                key={page.view}
                value={`page:${page.view}`}
                onSelect={() => onSelect(hrefFor(page.view, preview))}
              >
                <page.icon />
                {page.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {salesOrders.length > 0 && (
          <CommandGroup heading="Orders">
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
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{order.status}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {products.length > 0 && (
          <CommandGroup heading="Products">
            {products.map((product) => (
              <CommandItem
                key={product.id}
                value={`product:${product.id}`}
                onSelect={() => onSelect(`/products?q=${encodeURIComponent(product.title)}`)}
              >
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt=""
                    width={20}
                    height={20}
                    unoptimized
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
          <CommandGroup heading={query ? "Purchase orders" : "Recent purchase orders"}>
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
                <span className="ml-auto shrink-0">
                  <Status status={order.status} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {shipments.length > 0 && (
          <CommandGroup heading="Shipments">
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
                <span className="ml-auto shrink-0">
                  <Status status={shipment.status} />
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {partners.length > 0 && (
          <CommandGroup heading="Partners">
            {partners.map((partner) => (
              <CommandItem
                key={partner.id}
                value={`partner:${partner.id}`}
                onSelect={() => onSelect(`/partners?q=${encodeURIComponent(partner.name)}`)}
                className="[&>svg:last-child]:hidden"
              >
                <Users />
                <span className="min-w-0 truncate">{partner.name}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {partner.type === "supplier" ? "Supplier" : "Forwarder"}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {loading && (
          <output className="flex justify-center py-3 text-muted-foreground">
            <Spinner />
            <span className="sr-only">Loading</span>
          </output>
        )}
        {(index.isError || sales.isError) && (
          <p className="px-3 py-2 text-sm text-destructive">Couldn&apos;t search everything. Try again.</p>
        )}
      </CommandList>
    </Command>
  )
}
