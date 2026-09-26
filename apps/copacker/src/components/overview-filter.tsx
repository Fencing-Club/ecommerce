"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import * as styles from "./overview.css"

// Chooses the channel every card on the Overview shows: all of them, Amazon, or one Shopify location.
export function ChannelFilter({ channels, value }: { channels: { key: string; label: string }[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const shopifyLocations = channels.filter((channel) => channel.key !== "amazon").length
  return (
    <Field orientation="horizontal" className={styles.channelFilter}>
      <FieldLabel htmlFor="overview-channel">Channel</FieldLabel>
      <NativeSelect
        id="overview-channel"
        value={value}
        onChange={(event) => {
          // The period stays as chosen.
          const query = new URLSearchParams(params)
          if (event.target.value) {
            query.set("channel", event.target.value)
          } else {
            query.delete("channel")
          }
          const search = query.toString()
          router.push(search ? `${pathname}?${search}` : pathname)
        }}
      >
        <NativeSelectOption value="">All channels</NativeSelectOption>
        {channels.map((channel) => (
          <NativeSelectOption key={channel.key} value={channel.key}>
            {channelName(channel, shopifyLocations)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}

// "Shopify" for a store with one location of its own; with several, each is named.
function channelName(channel: { key: string; label: string }, shopifyLocations: number) {
  if (channel.key === "amazon") {
    return channel.label
  }
  return shopifyLocations > 1 ? `Shopify: ${channel.label}` : "Shopify"
}
