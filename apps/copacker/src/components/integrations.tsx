"use client"

import { normalizeShopDomain, shopDomainSchema } from "@repo/aisle/shopify"
import { ArrowRight, CircleCheck, CircleDashed, Clock3, Globe } from "lucide-react"
import { useTranslations } from "next-intl"
import { useId, useState } from "react"
import { StatusBadge } from "@/components/common"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"
import { AmazonAdsCard } from "./amazon-ads"
import { AmazonConnect } from "./amazon-connect"
import { DisconnectButton } from "./disconnect-button"
import { RequiredMark } from "./form-controls"
import { IntegrationCard } from "./integration-card"
import { IntegrationPanel, IntegrationPanelFooter, IntegrationSection } from "./integration-panel"
import { useStockSync } from "./inventory-sync"
import { useOrderSync } from "./sales-orders"
import { SyncedAt, SyncProgress } from "./sync-status"

type Store = "shopify" | "amazon" | "ebay"
type Connection = { account: string; externalId: string; marketplaces?: string[] | null }

// Each store's name. What connecting it brings is under settings.integrations.stores.
const storeNames = { shopify: "Shopify", amazon: "Amazon", ebay: "eBay" } as const

const cardAction = cn(buttonVariants({ variant: "outline", className: "h-11 sm:h-[34px]" }))

// Each card has an explicit Connect or Manage action. Members can inspect connection details without changing them.
export function Integrations({
  admin,
  ebayAvailable,
  amazonSelfAuth = false,
  amazonAdsAvailable = false,
  shopify,
  amazon,
  ebay,
  shopifySettings,
  amazonSettings,
  ebaySettings
}: {
  admin: boolean
  ebayAvailable: boolean
  amazonSelfAuth?: boolean
  amazonAdsAvailable?: boolean
  shopify: Connection | null
  amazon: Connection | null
  ebay: Connection | null
  shopifySettings: React.ReactNode
  amazonSettings: React.ReactNode
  ebaySettings: React.ReactNode
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
  } else if (admin) {
    amazonCard = (
      <StoreCard
        store="amazon"
        action={
          <AmazonConnect selfAuth={amazonSelfAuth} className={cardAction}>
            <ConnectLabel store="amazon" />
          </AmazonConnect>
        }
      />
    )
  }
  let ebayCard = <StoreCard store="ebay" status={<Badge variant="secondary">{t("comingSoon")}</Badge>} />
  if (ebay) {
    ebayCard = (
      <Connected store="ebay" connection={ebay} admin={admin}>
        {ebaySettings}
      </Connected>
    )
  } else if (ebayAvailable && admin) {
    // eBay's sign-in and consent page, which comes back to Settings.
    ebayCard = (
      <StoreCard
        store="ebay"
        action={
          <a href="/api/connections/ebay" className={cardAction}>
            <ConnectLabel store="ebay" />
          </a>
        }
      />
    )
  } else if (ebayAvailable) {
    ebayCard = <NotConnected store="ebay" />
  }
  return (
    <div className="@container space-y-8">
      <section className="space-y-3" aria-label={t("storeGroup")}>
        <h3 className="text-sm font-medium">{t("storeGroup")}</h3>
        <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
          {shopifyCard}
          {amazonCard}
          {ebayCard}
        </div>
      </section>
      <section className="space-y-3" aria-label={t("advertisingGroup")}>
        <h3 className="text-sm font-medium">{t("advertisingGroup")}</h3>
        <div className="grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-3">
          <AmazonAdsCard
            admin={admin}
            available={amazonAdsAvailable}
            sellerConnected={Boolean(amazon)}
            account={amazon?.account}
          />
        </div>
      </section>
    </div>
  )
}

function StoreCard({
  store,
  status,
  action,
  children
}: {
  store: Store
  status?: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  const t = useTranslations("settings.integrations")
  return (
    <IntegrationCard
      store={store}
      title={storeNames[store]}
      description={t(`stores.${store}`)}
      status={
        status ?? (
          <StatusBadge tone="neutral" icon={<CircleDashed aria-hidden />}>
            {t("notConnected")}
          </StatusBadge>
        )
      }
      action={action}
    >
      {children}
    </IntegrationCard>
  )
}

function ConnectLabel({ store }: { store: Store }) {
  const t = useTranslations("settings.integrations")
  return (
    <>
      {t("connect")}
      <span className="sr-only"> {storeNames[store]}</span>
      <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
    </>
  )
}

// Members see the stores the owner and admins haven't connected.
function NotConnected({ store }: { store: Store }) {
  return <StoreCard store={store} />
}

// A connected store's card, which opens its settings for the owner and admins.
function Connected({
  store,
  connection,
  admin,
  children
}: {
  store: Store
  connection: Connection
  admin: boolean
  children: React.ReactNode
}) {
  const t = useTranslations("settings.integrations")
  const card = (
    <StoreCard
      store={store}
      status={
        <StatusBadge tone="success" icon={<CircleCheck aria-hidden />}>
          {t("connected")}
        </StatusBadge>
      }
      action={
        admin && (
          <DialogTrigger render={<Button variant="outline" className="h-11 sm:h-[34px]" />}>
            {t("manage")}
            <span className="sr-only"> {storeNames[store]}</span>
            <ArrowRight className="size-4 rtl:rotate-180" aria-hidden />
          </DialogTrigger>
        )
      }
    >
      <p className="truncate font-medium" title={connection.account}>
        {connection.account}
      </p>
      {store === "shopify" && connection.account !== connection.externalId && (
        <p className="truncate text-xs text-muted-foreground" title={connection.externalId}>
          {connection.externalId}
        </p>
      )}
      {store === "amazon" && (
        <p
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          title={connection.marketplaces?.join(", ")}
        >
          <Globe className="size-3.5 shrink-0" aria-hidden />
          {connection.marketplaces?.length
            ? t("marketplaceCount", { count: connection.marketplaces.length })
            : t(connection.marketplaces ? "noMarketplaces" : "marketplacesUnavailable")}
        </p>
      )}
      {store === "amazon" && !admin && Boolean(connection.marketplaces?.length) && (
        <p className="text-xs leading-relaxed text-muted-foreground">{connection.marketplaces?.join(", ")}</p>
      )}
      <div className="pt-1">
        <StoreSync store={store} />
      </div>
    </StoreCard>
  )
  if (!admin) {
    return card
  }
  return (
    <Dialog>
      {card}
      <IntegrationPanel
        store={store}
        title={storeNames[store]}
        account={connection.account}
        domain={store === "shopify" && connection.account !== connection.externalId ? connection.externalId : undefined}
      >
        <div className="min-h-0 space-y-6 overflow-y-auto bg-muted/20 p-5 sm:p-6">
          {children}
          {store === "amazon" && (
            <IntegrationSection title={t("marketplaces")}>
              {connection.marketplaces?.length ? (
                <ul className="flex flex-wrap gap-2">
                  {connection.marketplaces.map((marketplace) => (
                    <li key={marketplace} className="rounded-md border bg-card px-3 py-2 text-xs">
                      {marketplace}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  {t(connection.marketplaces ? "noMarketplaces" : "marketplacesUnavailable")}
                </p>
              )}
            </IntegrationSection>
          )}
        </div>
        <IntegrationPanelFooter>
          <DisconnectButton provider={store} account={connection.account} />
        </IntegrationPanelFooter>
      </IntegrationPanel>
    </Dialog>
  )
}

// A connected store's sync under its account: orders first (with how much history is copied), then inventory, then
// when it last synced or that the last sync failed. Its Settings rows say why and have Sync now.
function StoreSync({ store }: { store: Store }) {
  return store === "ebay" ? <SyncLine store={store} stock={noStock} /> : <StockSync store={store} />
}
// eBay sells from the stock Shopify tracks, so it has no inventory sync of its own.
const noStock = { active: false, queued: false, problem: null }
function StockSync({ store }: { store: "shopify" | "amazon" }) {
  return <SyncLine store={store} stock={useStockSync(store)} />
}
function SyncLine({ store, stock }: { store: Store; stock: { active: boolean; queued: boolean; problem: unknown } }) {
  const t = useTranslations("settings.integrations.sync")
  const panel = useTranslations("settings.integrations.panel")
  const orders = useOrderSync(store)
  const ordersActive = orders?.status === "queued" || orders?.status === "running"
  const syncedAt = orders?.finishedAt ?? orders?.coveredTo
  let text: React.ReactNode = null
  if (orders?.status === "queued" || (!ordersActive && stock.queued)) {
    text = (
      <span className="inline-flex items-center gap-1.5">
        <Clock3 className="size-3.5" aria-hidden />
        {panel("status.queued")}
      </span>
    )
  } else if (ordersActive) {
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
      <StoreCard
        store="shopify"
        action={
          <DialogTrigger className={cardAction}>
            <ConnectLabel store="shopify" />
          </DialogTrigger>
        }
      />
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
