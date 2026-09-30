"use client"

import { Bell, Inbox } from "lucide-react"
import { useTranslations } from "next-intl"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

// The top bar's Inbox and its dropdown. Its tasks and updates come with the Inbox; until then it's empty, built like
// EmptyState with the bell in place of its box.
export function NotificationsMenu() {
  const t = useTranslations("navigation.notifications")
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("title")}
        className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-md px-2.5 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:bg-muted max-md:size-11 max-md:justify-center max-md:px-0"
      >
        <Inbox className="size-[18px] max-md:size-5" aria-hidden />
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
