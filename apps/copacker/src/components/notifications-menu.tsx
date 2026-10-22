import { Bell, Inbox } from "lucide-react"
import { useTranslations } from "use-intl"
import { EmptyState } from "@/components/common"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

// The top bar's Inbox and its dropdown. Its tasks and updates come with the Inbox; until then it's empty, with the bell
// in place of the empty box. Like the top bar's other buttons it's 44px on a phone.
export function NotificationsMenu() {
  const t = useTranslations("navigation.notifications")
  return (
    <Popover>
      <PopoverTrigger
        aria-label={t("title")}
        render={<Button variant="ghost" size="icon" className="max-md:size-11" />}
      >
        <Inbox className="size-[18px] max-md:size-5" aria-hidden />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle>{t("title")}</PopoverTitle>
        </PopoverHeader>
        <EmptyState icon={<Bell aria-hidden />} title={t("empty")} description={t("emptyDescription")} />
      </PopoverContent>
    </Popover>
  )
}
