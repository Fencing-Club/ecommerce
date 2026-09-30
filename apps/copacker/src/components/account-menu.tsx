"use client"

import { LogOut, Monitor, Moon, Palette, Sun, UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
import { useId } from "react"
import { useTheme } from "@/components/theme-provider"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { initials } from "./workspace-menu"

// Each labelled by its key under the "navigation" messages' `accountMenu.themes`.
const themeOptions = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor }
] as const

// The signed-in person's menu: who they are, their own settings, the theme, and signing out. At the end of the top bar
// it's their initials; in the sidebar's sheet on a phone, a row with their name and email.
export function AccountMenu({
  name,
  email,
  layout = "avatar"
}: {
  name: string
  email: string
  layout?: "avatar" | "row"
}) {
  const t = useTranslations("navigation.accountMenu")
  const { theme, setTheme } = useTheme()
  // Its own id, since the top bar's menu and the sheet's are both in the page on a phone.
  const signOut = useId()
  return (
    <>
      <form id={signOut} action="/logout" method="post" hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("label", { name })}
          className={cn(
            "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            layout === "avatar"
              ? "flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground hover:bg-accent"
              : "flex w-full min-w-0 items-center gap-2.5 rounded-md p-2 text-start hover:bg-muted aria-expanded:bg-muted"
          )}
        >
          {layout === "avatar" ? (
            <span aria-hidden>{initials(name)}</span>
          ) : (
            <>
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground"
              >
                {initials(name)}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium">{name}</span>
                <span className="truncate text-xs text-muted-foreground">{email}</span>
              </span>
            </>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side={layout === "row" ? "top" : "bottom"} sideOffset={6} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col font-normal">
              <span className="truncate text-sm font-medium text-foreground">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/settings" />}>
            <UserRound />
            {t("accountSettings")}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette />
              {t("theme")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(value) => {
                  const option = themeOptions.find((candidate) => candidate.value === value)
                  if (option) {
                    setTheme(option.value)
                  }
                }}
              >
                {themeOptions.map((option) => (
                  <DropdownMenuRadioItem key={option.value} value={option.value}>
                    <option.icon />
                    {t(`themes.${option.value}`)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            nativeButton
            render={<button type="submit" form={signOut} aria-label={t("signOut")} className="w-full" />}
          >
            <LogOut className="rtl:-scale-x-100" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
