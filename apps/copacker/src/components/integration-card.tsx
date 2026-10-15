import { StoreLogo } from "./store-logos"

// Store and advertising connections share one hierarchy: provider, account, then status and action.
export function IntegrationCard({
  store,
  title,
  description,
  status,
  action,
  children
}: {
  store: "shopify" | "amazon" | "ebay"
  title: string
  description: string
  status: React.ReactNode
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <article aria-label={title} className="flex h-full min-w-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex min-h-32 flex-1 flex-col gap-5 p-5">
        <div className="flex items-start gap-3">
          <StoreLogo store={store} className="shadow-none" />
          <div className="min-w-0 space-y-1">
            <h4 className="text-base font-semibold">{title}</h4>
            <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
        </div>
        {children && <div className="mt-auto min-w-0 space-y-1.5 text-sm">{children}</div>}
      </div>
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-t bg-muted/20 px-5 py-3">
        <div aria-live="polite">{status}</div>
        {action}
      </div>
    </article>
  )
}
