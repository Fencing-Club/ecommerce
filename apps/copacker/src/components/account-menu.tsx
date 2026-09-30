"use client"

import { LogOut, Monitor, Moon, Palette, Sun, UserRound } from "lucide-react"
import { useTranslations } from "next-intl"
import Link from "next/link"
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
import { initials } from "./workspace-menu"

// Each labelled by its key under the "navigation" messages' `accountMenu.themes`.
const themeOptions = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor }
] as const

// The signed-in person's menu at the end of the top bar: who they are, their own settings, the theme, and signing out.
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations("navigation.accountMenu")
  const { theme, setTheme } = useTheme()
  return (
    <>
      <form id="sign-out" action="/logout" method="post" hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("label", { name })}
          className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span aria-hidden>{initials(name)}</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" sideOffset={6} className="w-64">
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
            render={<button type="submit" form="sign-out" aria-label={t("signOut")} className="w-full" />}
          >
            <LogOut className="rtl:-scale-x-100" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}
