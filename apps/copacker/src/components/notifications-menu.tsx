"use client"

import { Bell } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

// The bell in the app header and its dropdown. Nothing sends notifications yet; Novu will fill this list. Until then
// it's empty, built like EmptyState with the bell in place of its box.
export function NotificationsMenu() {
  const t = useTranslations("navigation.notifications")
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label={t("title")} />}>
        <Bell />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle>{t("title")}</PopoverTitle>
        </PopoverHeader>
        <Empty className="px-6 py-10">
          <EmptyHeader className="gap-1">
            <EmptyMedia variant="icon" className="size-10 text-muted-foreground">
              <Bell aria-hidden className="size-5" />
            </EmptyMedia>
            <EmptyTitle>{t("empty")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      </PopoverContent>
    </Popover>
  )
}
