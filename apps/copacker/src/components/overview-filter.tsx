"use client"

import { usePathname, useRouter } from "next/navigation"
import { Field, FieldLabel } from "@/components/ui/field"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import * as styles from "./overview.css"

// Chooses the channel every card on the Overview shows: all of them, Amazon, or one Shopify location.
export function ChannelFilter({ channels, value }: { channels: { key: string; label: string }[]; value: string }) {
  const router = useRouter()
  const pathname = usePathname()
  return (
    <Field orientation="horizontal" className={styles.channelFilter}>
      <FieldLabel htmlFor="overview-channel">Channel</FieldLabel>
      <NativeSelect
        id="overview-channel"
        value={value}
        onChange={(event) => {
          const next = event.target.value
          router.push(next ? `${pathname}?channel=${encodeURIComponent(next)}` : pathname)
        }}
      >
        <NativeSelectOption value="">All channels</NativeSelectOption>
        {channels.map((channel) => (
          <NativeSelectOption key={channel.key} value={channel.key}>
            {channel.key === "amazon" ? channel.label : `Shopify: ${channel.label}`}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </Field>
  )
}
