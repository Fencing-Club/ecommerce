"use client"

import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"

// The bell in the app header and its dropdown. Nothing sends notifications yet; Novu will fill this list.
export function NotificationsMenu() {
  return (
    <Popover>
      <PopoverTrigger render={<Button variant="ghost" size="icon" aria-label="Notifications" />}>
        <Bell />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,calc(100vw-2rem))] gap-0 p-0">
        <PopoverHeader className="border-b px-4 py-3">
          <PopoverTitle>Notifications</PopoverTitle>
        </PopoverHeader>
        <p className="px-4 py-8 text-center text-muted-foreground">No notifications</p>
      </PopoverContent>
    </Popover>
  )
}
