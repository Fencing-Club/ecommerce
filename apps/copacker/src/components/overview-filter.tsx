"use client"

import { Store } from "lucide-react"
import { useTranslations } from "use-intl"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

// Every channel together, which the URL leaves out.
const all = "all"

// Chooses the channel every card on the Overview shows: all of them, Amazon, one Shopify location, or eBay.
export function ChannelFilter({
  channels,
  value,
  onChange
}: {
  channels: { key: string; label: string }[]
  value: string | null
  onChange: (channel: string | null) => void
}) {
  const t = useTranslations("overview.channel")
  const shopifyLocations = channels.filter((channel) => channel.key.startsWith("shopify:")).length
  const items = [
    { value: all, label: t("all") },
    ...channels.map((channel) => ({
      value: channel.key,
      label: channelName(channel, shopifyLocations, (location) => t("shopifyLocation", { location }))
    }))
  ]
  return (
    <Select items={items} value={value ?? all} onValueChange={(next) => onChange(next && next !== all ? next : null)}>
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
  if (!channel.key.startsWith("shopify:")) {
    return channel.label
  }
  return shopifyLocations > 1 ? location(channel.label) : "Shopify"
}
