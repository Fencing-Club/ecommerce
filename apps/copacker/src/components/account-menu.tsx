import { useTheme } from "@buildkitgg/react-theme"
import { LogOut, Monitor, Moon, Palette, Sun, UserRound } from "lucide-react"
import { useId } from "react"
import { useTranslations } from "use-intl"
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
import { themeStore } from "@/lib/theme"
import { initials } from "./workspace-menu"

// Each labelled by its key under the "navigation" messages' `accountMenu.themes`.
const themeOptions = [
  { value: "light", icon: Sun },
  { value: "dark", icon: Moon },
  { value: "system", icon: Monitor }
] as const

// The signed-in person's menu: who they are, their own settings, the theme, and signing out. At the bottom of the
// sidebar it's a row with their initials, name and email, just the initials when the sidebar is collapsed.
export function AccountMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations("navigation.accountMenu")
  const { theme, setTheme, reset } = useTheme(themeStore)
  const signOut = useId()
  return (
    <>
      <form id={signOut} action="/logout" method="post" hidden />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("label", { name })}
          className="focus-ring flex w-full min-w-0 items-center gap-2.5 rounded-md p-2 text-start hover:bg-muted aria-expanded:bg-muted group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0"
        >
          <span
            aria-hidden
            className="flex size-8 shrink-0 items-center justify-center rounded-full border bg-muted text-xs font-semibold text-muted-foreground"
          >
            {initials(name)}
          </span>
          <span className="flex min-w-0 flex-col group-data-[collapsible=icon]:hidden">
            <span className="truncate text-sm font-medium">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{email}</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" sideOffset={6} className="w-64">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="flex flex-col font-normal">
              <span className="truncate text-sm font-medium text-foreground">{name}</span>
              <span className="truncate text-xs text-muted-foreground">{email}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<a href="/settings" aria-label={t("accountSettings")} />}>
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
                  // System keeps no choice, so the page follows the computer.
                  if (option?.value === "system") {
                    reset()
                  } else if (option) {
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
