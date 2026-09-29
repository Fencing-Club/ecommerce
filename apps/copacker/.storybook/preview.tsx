import addonA11y from "@storybook/addon-a11y"
import { definePreview } from "@storybook/nextjs-vite"
import addonMsw from "msw-storybook-addon"
import { setupWorker } from "msw/browser"
import { NextIntlClientProvider } from "next-intl"
import { useEffect } from "react"
import { configure } from "storybook/test"
import { INITIAL_VIEWPORTS } from "storybook/viewport"
import { AccessProvider } from "@/components/access"
import { Providers } from "@/components/providers"
import { direction, localeNames, locales, type Locale } from "@/i18n/locales"
import type { Messages } from "@/i18n/messages"
import { type Permissions } from "@/lib/access"
import { owner } from "@/stories/workspace"
import { prepareIntl, storyTimeZone } from "./intl"
import { handlers } from "./mocks/handlers"
// The app's stylesheet, as AppProviders brings it: the reset first, then Tailwind's layers.
import "@/styles/global.css"
import "@/app/globals.css"

// findBy and waitFor give a mocked response and its render 5 seconds, not 1: under a full test run, a busy machine
// can take longer than a second, and a story then fails although nothing is wrong.
configure({ asyncUtilTimeout: 5000 })

const themes = ["light", "dark"] as const
type Theme = (typeof themes)[number]

// Shows the story in the toolbar's theme: the class the app's theme script sets, and the choice the ThemeProvider
// reads, so the account menu's Appearance shows it too.
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark")
  try {
    localStorage.setItem("theme", theme)
  } catch {
    // Without storage the class alone shows the theme.
  }
  window.dispatchEvent(new StorageEvent("storage", { key: "theme" }))
}

// What each story renders in: the page's language and direction, the app's providers, and the permissions of the
// person signed in (an owner unless the story's `permissions` parameter says otherwise).
function StoryFrame({
  locale,
  messages,
  theme,
  permissions,
  children
}: {
  locale: Locale
  messages: Messages
  theme: Theme
  permissions: Permissions
  children: React.ReactNode
}) {
  useEffect(() => applyTheme(theme), [theme])
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = direction(locale)
  }, [locale])
  return (
    <NextIntlClientProvider locale={locale} messages={messages} timeZone={storyTimeZone}>
      <Providers>
        <AccessProvider permissions={permissions}>{children}</AccessProvider>
      </Providers>
    </NextIntlClientProvider>
  )
}

export default definePreview({
  addons: [
    addonA11y(),
    addonMsw(async () => {
      const worker = setupWorker(...handlers)
      await worker.start({ onUnhandledRequest: "bypass", quiet: true })
      return worker
    })
  ],
  globalTypes: {
    theme: {
      description: "Color theme",
      toolbar: {
        title: "Theme",
        icon: "mirror",
        items: [
          { value: "light", title: "Light", icon: "sun" },
          { value: "dark", title: "Dark", icon: "moon" }
        ],
        dynamicTitle: true
      }
    },
    locale: {
      description: "Language",
      toolbar: {
        title: "Language",
        icon: "globe",
        items: locales.map((locale) => ({ value: locale, title: localeNames[locale], right: locale })),
        dynamicTitle: true
      }
    }
  },
  initialGlobals: { theme: "light", locale: "en" },
  parameters: {
    layout: "padded",
    nextjs: { appDirectory: true },
    viewport: { options: INITIAL_VIEWPORTS },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Accessibility checks report in the panel and in tests without failing them.
    a11y: { test: "todo" }
  },
  // The story's language, loaded before it renders, for client components and the mocked server alike.
  loaders: [
    async ({ globals }) => {
      const { locale, messages } = await prepareIntl(globals.locale)
      return { locale, messages }
    }
  ],
  decorators: [
    (Story, { globals, loaded, parameters }) => (
      <StoryFrame
        locale={loaded.locale}
        messages={loaded.messages}
        theme={themes.find((theme) => theme === globals.theme) ?? "light"}
        permissions={parameters.permissions ?? owner}
      >
        <Story />
      </StoryFrame>
    )
  ]
})
