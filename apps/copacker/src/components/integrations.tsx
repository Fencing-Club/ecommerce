"use client"

import { normalizeShopDomain, shopDomainSchema } from "@repo/aisle/shopify"
import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react"
import { useId, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger
} from "@/components/ui/sheet"
import { cn } from "@/lib/utils"
import { AmazonSelfAuthorize } from "./amazon-self-authorize"
import { DisconnectButton } from "./disconnect-button"
import { RequiredMark } from "./form-controls"
import { StoreLogo } from "./store-logos"

type Store = "shopify" | "amazon" | "ebay"
type Connection = { account: string; externalId: string }

// What connecting each store brings.
const stores = {
  shopify: { name: "Shopify", description: "Products, inventory, orders, expenses" },
  amazon: { name: "Amazon", description: "Orders, inventory, expenses, shipments" },
  ebay: { name: "eBay", description: "Orders, inventory" }
} as const

const tile = "flex h-full w-full flex-col items-start gap-4 rounded-xl border bg-card p-4 text-left shadow-xs"
const clickable =
  "cursor-pointer transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// Every store as a card. Connecting starts from its card: Amazon's consent page, or Shopify's store address in a
// dialog. A connected store's card opens its settings and Disconnect; eBay is coming.
export function Integrations({
  owner,
  amazonDraft,
  shopify,
  amazon,
  shopifySettings,
  amazonSettings
}: {
  owner: boolean
  // While Copacker's Amazon app is a draft, Amazon connects with a self-authorization token instead.
  amazonDraft: boolean
  shopify: Connection | null
  amazon: Connection | null
  shopifySettings: React.ReactNode
  amazonSettings: React.ReactNode
}) {
  let shopifyCard = <NotConnected store="shopify" />
  if (shopify) {
    shopifyCard = (
      <Connected store="shopify" connection={shopify} owner={owner}>
        {shopifySettings}
      </Connected>
    )
  } else if (owner) {
    shopifyCard = <ConnectShopify />
  }
  let amazonCard = <NotConnected store="amazon" />
  if (amazon) {
    amazonCard = (
      <Connected store="amazon" connection={amazon} owner={owner}>
        {amazonSettings}
      </Connected>
    )
  } else if (owner && amazonDraft) {
    amazonCard = (
      <AmazonSelfAuthorize className={cn(tile, clickable)}>
        <TileBody store="amazon" footer={<ConnectLabel />} />
      </AmazonSelfAuthorize>
    )
  } else if (owner) {
    // Amazon's consent page, which comes back to Settings.
    amazonCard = (
      <a href="/api/connections/amazon" className={cn(tile, clickable)}>
        <TileBody store="amazon" footer={<ConnectLabel />} />
      </a>
    )
  }
  return (
    <div className="@container">
      <div className="grid gap-4 @lg:grid-cols-2 @3xl:grid-cols-3">
        {shopifyCard}
        {amazonCard}
        <div className={tile}>
          <TileBody store="ebay" badge={<Badge variant="secondary">Coming soon</Badge>} />
        </div>
      </div>
    </div>
  )
}

// A card's logo and status on top, then the store's name and what it brings, and a footer line.
function TileBody({ store, badge, footer }: { store: Store; badge?: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <>
      <span className="flex w-full items-start justify-between gap-3">
        <StoreLogo store={store} />
        {badge}
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-medium">{stores[store].name}</span>
        <span className="text-sm text-muted-foreground">{stores[store].description}</span>
      </span>
      {footer && <span className="mt-auto flex w-full min-w-0 items-center gap-1.5 text-sm">{footer}</span>}
    </>
  )
}

function ConnectLabel() {
  return (
    <span className="inline-flex items-center gap-1 font-medium">
      Connect
      <ArrowRight className="size-4" />
    </span>
  )
}

// Everyone but the owner sees the stores the owner hasn't connected.
function NotConnected({ store }: { store: Store }) {
  return (
    <div className={tile}>
      <TileBody
        store={store}
        badge={
          <Badge variant="outline">
            <CircleDashed data-icon="inline-start" />
            Not connected
          </Badge>
        }
      />
    </div>
  )
}

// A connected store's card, which opens its settings for the owner.
function Connected({
  store,
  connection,
  owner,
  children
}: {
  store: "shopify" | "amazon"
  connection: Connection
  owner: boolean
  children: React.ReactNode
}) {
  const body = (
    <TileBody
      store={store}
      badge={
        <Badge variant="outline">
          <CircleCheck data-icon="inline-start" className="text-success" />
          Connected
        </Badge>
      }
      footer={<span className="truncate text-muted-foreground">{connection.account}</span>}
    />
  )
  if (!owner) {
    return <div className={tile}>{body}</div>
  }
  return (
    <Sheet>
      <SheetTrigger className={cn(tile, clickable)} aria-label={`${stores[store].name} settings`}>
        {body}
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="flex-row items-center gap-3 border-b">
          <StoreLogo store={store} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle>{stores[store].name}</SheetTitle>
            <SheetDescription className="truncate">{connection.account}</SheetDescription>
          </div>
        </SheetHeader>
        <div className="flex flex-col divide-y overflow-y-auto px-4">{children}</div>
        <SheetFooter className="flex-row justify-end border-t">
          <DisconnectButton provider={store} account={connection.externalId} />
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// Shopify's card asks for the store's address in a dialog, then goes to Shopify to approve Copacker.
function ConnectShopify() {
  const id = useId()
  const [error, setError] = useState<string>()
  return (
    <Dialog onOpenChange={() => setError(undefined)}>
      <DialogTrigger className={cn(tile, clickable)}>
        <TileBody store="shopify" footer={<ConnectLabel />} />
      </DialogTrigger>
      <DialogContent>
        <form
          action="/api/connections/shopify"
          className="grid gap-4"
          noValidate
          onSubmit={(event) => {
            const input = event.currentTarget.elements.namedItem("shop")
            const shop = input instanceof HTMLInputElement ? normalizeShopDomain(input.value) : ""
            if (!shopDomainSchema.safeParse(shop).success) {
              event.preventDefault()
              setError("Enter your store’s admin link or myshopify.com domain")
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Connect Shopify</DialogTitle>
            <DialogDescription>You’ll approve Copacker in Shopify</DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={id}>
              <span>
                Store
                <RequiredMark />
              </span>
            </FieldLabel>
            <Input
              id={id}
              name="shop"
              required
              placeholder="your-store.myshopify.com"
              inputMode="url"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={Boolean(error)}
              onChange={() => setError(undefined)}
            />
            {error ? (
              <FieldError>{error}</FieldError>
            ) : (
              <FieldDescription>Admin link or myshopify.com domain</FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button type="submit">Connect</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
