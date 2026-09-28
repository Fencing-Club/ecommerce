"use client"

import { normalizeShopDomain, shopDomainSchema } from "@repo/aisle/shopify"
import { ArrowRight, CircleCheck, CircleDashed } from "lucide-react"
import { useTranslations } from "next-intl"
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
import { useStockSync } from "./inventory-sync"
import { useOrderSync } from "./sales-orders"
import { StoreLogo } from "./store-logos"
import { SyncedAt, SyncProgress } from "./sync-menu"

type Store = "shopify" | "amazon" | "ebay"
type Connection = { account: string; externalId: string }

// Each store's name. What connecting it brings is under settings.integrations.stores.
const storeNames = { shopify: "Shopify", amazon: "Amazon", ebay: "eBay" } as const

const tile = "flex h-full w-full flex-col items-start gap-4 rounded-xl border bg-card p-4 text-start shadow-xs"
const clickable =
  "cursor-pointer transition-colors outline-none hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"

// Every store as a card. Connecting starts from its card: Amazon's consent page, or Shopify's store address in a
// dialog. A connected store's card opens its settings and Disconnect; eBay is coming.
export function Integrations({
  admin,
  amazonDraft,
  shopify,
  amazon,
  shopifySettings,
  amazonSettings
}: {
  admin: boolean
  // While Copacker's Amazon app is a draft, Amazon connects with a self-authorization token instead.
  amazonDraft: boolean
  shopify: Connection | null
  amazon: Connection | null
  shopifySettings: React.ReactNode
  amazonSettings: React.ReactNode
}) {
  const t = useTranslations("settings.integrations")
  let shopifyCard = <NotConnected store="shopify" />
  if (shopify) {
    shopifyCard = (
      <Connected store="shopify" connection={shopify} admin={admin}>
        {shopifySettings}
      </Connected>
    )
  } else if (admin) {
    shopifyCard = <ConnectShopify />
  }
  let amazonCard = <NotConnected store="amazon" />
  if (amazon) {
    amazonCard = (
      <Connected store="amazon" connection={amazon} admin={admin}>
        {amazonSettings}
      </Connected>
    )
  } else if (admin && amazonDraft) {
    amazonCard = (
      <AmazonSelfAuthorize className={cn(tile, clickable)}>
        <TileBody store="amazon" footer={<ConnectLabel />} />
      </AmazonSelfAuthorize>
    )
  } else if (admin) {
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
          <TileBody store="ebay" badge={<Badge variant="secondary">{t("comingSoon")}</Badge>} />
        </div>
      </div>
    </div>
  )
}

// A card's logo and status on top, then the store's name and what it brings, and a footer line.
function TileBody({ store, badge, footer }: { store: Store; badge?: React.ReactNode; footer?: React.ReactNode }) {
  const t = useTranslations("settings.integrations.stores")
  return (
    <>
      <span className="flex w-full items-start justify-between gap-3">
        <StoreLogo store={store} />
        {badge}
      </span>
      <span className="flex flex-col gap-1">
        <span className="font-medium">{storeNames[store]}</span>
        <span className="text-sm text-muted-foreground">{t(store)}</span>
      </span>
      {footer && <span className="mt-auto flex w-full min-w-0 items-center gap-1.5 text-sm">{footer}</span>}
    </>
  )
}

function ConnectLabel() {
  const t = useTranslations("settings.integrations")
  return (
    <span className="inline-flex items-center gap-1 font-medium">
      {t("connect")}
      <ArrowRight className="size-4 rtl:rotate-180" />
    </span>
  )
}

// Members see the stores the owner and admins haven't connected.
function NotConnected({ store }: { store: Store }) {
  const t = useTranslations("settings.integrations")
  return (
    <div className={tile}>
      <TileBody
        store={store}
        badge={
          <Badge variant="outline">
            <CircleDashed data-icon="inline-start" />
            {t("notConnected")}
          </Badge>
        }
      />
    </div>
  )
}

// A connected store's card, which opens its settings for the owner and admins.
function Connected({
  store,
  connection,
  admin,
  children
}: {
  store: "shopify" | "amazon"
  connection: Connection
  admin: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("settings.integrations")
  const body = (
    <TileBody
      store={store}
      badge={
        <Badge variant="outline">
          <CircleCheck data-icon="inline-start" className="text-success" />
          {t("connected")}
        </Badge>
      }
      footer={
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-muted-foreground">{connection.account}</span>
          <StoreSync store={store} />
        </span>
      }
    />
  )
  if (!admin) {
    return <div className={tile}>{body}</div>
  }
  return (
    <Sheet>
      <SheetTrigger className={cn(tile, clickable)} aria-label={t("storeSettings", { store: storeNames[store] })}>
        {body}
      </SheetTrigger>
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="flex-row items-center gap-3 border-b">
          <StoreLogo store={store} />
          <div className="flex min-w-0 flex-col gap-0.5">
            <SheetTitle>{storeNames[store]}</SheetTitle>
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

// A connected store's sync under its account: orders first (with how much history is copied), then inventory, then
// when it last synced or that the last sync failed. Its Settings rows say why and have Sync now.
function StoreSync({ store }: { store: "shopify" | "amazon" }) {
  const t = useTranslations("settings.integrations.sync")
  const orders = useOrderSync(store)
  const stock = useStockSync(store)
  const ordersActive = orders?.status === "queued" || orders?.status === "running"
  const syncedAt = orders?.finishedAt ?? orders?.coveredTo
  let text: React.ReactNode = null
  if (ordersActive) {
    text = (
      <SyncProgress>
        {typeof orders.progress === "number" ? t("ordersProgress", { progress: orders.progress }) : t("orders")}
      </SyncProgress>
    )
  } else if (stock.active) {
    text = <SyncProgress>{t("stock")}</SyncProgress>
  } else if (orders?.status === "failed" || stock.problem) {
    text = <span className="text-destructive">{t("failed")}</span>
  } else if (syncedAt) {
    text = <SyncedAt at={syncedAt} />
  }
  return text ? (
    <span className="truncate text-xs text-muted-foreground" aria-live="polite">
      {text}
    </span>
  ) : null
}

// Shopify's card asks for the store's address in a dialog, then goes to Shopify to approve Copacker.
function ConnectShopify() {
  const t = useTranslations("settings.integrations")
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
              setError(t("shopify.enterStore"))
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("shopify.title")}</DialogTitle>
            <DialogDescription>{t("shopify.description")}</DialogDescription>
          </DialogHeader>
          <Field data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={id}>
              <span>
                {t("shopify.store")}
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
              <FieldDescription>{t("shopify.storeDescription")}</FieldDescription>
            )}
          </Field>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>{t("cancel")}</DialogClose>
            <Button type="submit">{t("connect")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
