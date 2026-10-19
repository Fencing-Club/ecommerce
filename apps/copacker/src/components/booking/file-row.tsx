import { Download, ExternalLink } from "lucide-react"
import { createContext, use, useId } from "react"
import { useTranslations } from "use-intl"
import { Button, buttonVariants } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

// The id of the row's title, which finishes its action's name for screen readers: "Download Carton labels", "Open
// Seller Central".
const RowTitle = createContext<string | undefined>(undefined)

// A file to download, or a place to go such as Seller Central, as a row in a booking step: its icon, what it is, a line
// about it, and its one action: a DownloadAction, an OpenAction, or the status the row has reached, such as Linked.
export function FileRow({
  icon,
  title,
  description,
  children
}: {
  icon: React.ReactNode
  title: React.ReactNode
  description: React.ReactNode
  children?: React.ReactNode
}) {
  const id = useId()
  return (
    <Item variant="outline" data-slot="file-row">
      <ItemMedia variant="icon" className="text-muted-foreground">
        {icon}
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle id={`${id}-title`} className="max-w-full">
          {title}
        </ItemTitle>
        <ItemDescription>{description}</ItemDescription>
      </ItemContent>
      {children && (
        <ItemActions>
          <RowTitle value={`${id}-title`}>{children}</RowTitle>
        </ItemActions>
      )}
    </Item>
  )
}

// Downloads the row's file. Until the file is ready it holds the same place as a disabled button with a spinner that
// says what it's waiting for, such as "Getting labels", so nothing moves when the file lands.
export function DownloadAction(props: { href: string } | { pending: string }) {
  const t = useTranslations("shipments.booking")
  const title = use(RowTitle)
  const id = useId()
  if ("pending" in props) {
    return (
      <Button variant="outline" size="sm" disabled>
        <Spinner data-icon="inline-start" />
        {props.pending}
      </Button>
    )
  }
  // A link styled as a button, not a Button rendering a link, which would announce it as a button.
  return (
    <a
      href={props.href}
      download
      aria-labelledby={`${id} ${title ?? ""}`.trim()}
      data-slot="button"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <Download data-icon="inline-start" aria-hidden />
      <span id={id}>{t("download")}</span>
    </a>
  )
}

// Opens the row's place, such as Seller Central, in a new tab.
export function OpenAction({ href }: { href: string }) {
  const t = useTranslations("shipments.booking")
  const title = use(RowTitle)
  const id = useId()
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-labelledby={`${id} ${title ?? ""}`.trim()}
      aria-describedby={`${id}-new-tab`}
      data-slot="button"
      className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
    >
      <ExternalLink data-icon="inline-start" aria-hidden />
      <span id={id}>{t("open")}</span>
      <span id={`${id}-new-tab`} className="sr-only">
        {t("newTab")}
      </span>
    </a>
  )
}
