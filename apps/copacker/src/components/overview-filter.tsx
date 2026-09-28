"use client"

import { Store } from "lucide-react"
import { useTranslations } from "next-intl"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Every channel together, which the URL leaves out.
const all = "all"

// Chooses the channel every card on the Overview shows: all of them, Amazon, or one Shopify location.
export function ChannelFilter({
  channels,
  value
}: {
  channels: { key: string; label: string }[]
  value: string | null
}) {
  const t = useTranslations("overview.channel")
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const shopifyLocations = channels.filter((channel) => !channel.key.startsWith("amazon")).length
  const items = [
    { value: all, label: t("all") },
    ...channels.map((channel) => ({
      value: channel.key,
      label: channelName(channel, shopifyLocations, (location) => t("shopifyLocation", { location }))
    }))
  ]
  return (
    <Select
      items={items}
      value={value ?? all}
      onValueChange={(next) => {
        // The period stays as chosen.
        const query = new URLSearchParams(params)
        if (next && next !== all) {
          query.set("channel", next)
        } else {
          query.delete("channel")
        }
        const search = query.toString()
        router.push(search ? `${pathname}?${search}` : pathname)
      }}
    >
      <SelectTrigger
        aria-label={t("label")}
        className="max-w-56 bg-background hover:bg-muted *:data-[slot=select-value]:block *:data-[slot=select-value]:truncate"
      >
        <Store className="text-muted-foreground" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false}>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// "Shopify" for a store with one location of its own; with several, each is named.
function channelName(
  channel: { key: string; label: string },
  shopifyLocations: number,
  location: (name: string) => string
) {
  if (channel.key.startsWith("amazon")) {
    return channel.label
  }
  return shopifyLocations > 1 ? location(channel.label) : "Shopify"
}
