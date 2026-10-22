import addonA11y from "@storybook/addon-a11y"
import { definePreview } from "@storybook/react-vite"
import addonMsw from "msw-storybook-addon"
import { setupWorker } from "msw/browser"
import { NuqsTestingAdapter } from "nuqs/adapters/testing"
import { useEffect } from "react"
import { configure } from "storybook/test"
import { INITIAL_VIEWPORTS } from "storybook/viewport"
import { IntlProvider } from "use-intl"
import { getStoryRouter } from "#.storybook/router"
import { AccessProvider } from "@/components/access"
import { Providers } from "@/components/providers"
import { direction, localeNames, locales, type Locale } from "@/i18n/locales"
import type { Messages } from "@/i18n/messages"
import { type Permissions } from "@/lib/access"
import { themeStore } from "@/lib/theme"
import { owner } from "@/stories/workspace"
import { prepareIntl, storyTimeZone } from "./intl"
import { mockRows } from "./mocks/db"
import { handlers } from "./mocks/handlers"
import { prepareStoryRouter, StoryRouter } from "./router"
// The app's stylesheet, as AppProviders brings it: the reset first, then Tailwind's layers.
import "@/styles/global.css"
import "@/app/globals.css"

// findBy and waitFor give a mocked response and its render 5 seconds, not 1: under a full test run, a busy machine
// can take longer than a second, and a story then fails although nothing is wrong.
configure({ asyncUtilTimeout: 5000 })

const themes = ["light", "dark"] as const
type Theme = (typeof themes)[number]

// What each story renders in: the page's language and direction, the app's providers, the permissions of the person
// signed in (an owner unless the story's `permissions` parameter says otherwise), and the URL's query, which state kept
// in the URL reads (`parameters.router.navigation.query`). Each story gets its own, so one story's URL never leaks into
// the next.
function StoryFrame({
  locale,
  messages,
  theme,
  permissions,
  router,
  query,
  children
}: {
  locale: Locale
  messages: Messages
  theme: Theme
  router: Awaited<ReturnType<typeof prepareStoryRouter>>
  permissions: Permissions
  query: Record<string, string>
  children: React.ReactNode
}) {
  // The toolbar's theme, chosen in the app's theme store as the account menu would, so the menu shows it too. Providers
  // has started the store by now: a child's effects run before its parent's.
  useEffect(() => themeStore.setTheme(theme), [theme])
  useEffect(() => {
    // Document links are real navigation in the app. In a story, record their destination without leaving the test
    // iframe; the integrated browser separately verifies full document loads and Start transitions.
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest("a") : null
      const href = link?.getAttribute("href")
      if (
        href?.startsWith("/") &&
        !href.startsWith("//") &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.shiftKey &&
        !link?.hasAttribute("download")
      ) {
        event.preventDefault()
        getStoryRouter().navigate({ href })
      }
    }
    document.addEventListener("click", navigate, true)
    return () => document.removeEventListener("click", navigate, true)
  }, [])
  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = direction(locale)
  }, [locale])
  return (
    <IntlProvider locale={locale} messages={messages} timeZone={storyTimeZone}>
      <Providers>
        <NuqsTestingAdapter searchParams={query} hasMemory>
          <AccessProvider permissions={permissions}>
            <StoryRouter router={router}>{children}</StoryRouter>
          </AccessProvider>
        </NuqsTestingAdapter>
      </Providers>
    </IntlProvider>
  )
}

export default definePreview({
  addons: [
    addonA11y(),
    addonMsw(async () => {
      const worker = setupWorker(...handlers)
      const starting = worker.start({
        onUnhandledFrame: "bypass",
        quiet: true,
        serviceWorker: { url: new URL("mockServiceWorker.js", window.location.href).href }
      })
      await starting.catch((error: unknown) => console.warn(error))
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
    // The sidebar's sections, described in docs/storybook.md. Stories keep their file order within each component.
    options: {
      storySort: { method: "alphabetical", order: ["Foundations", "Components", "Pages", "Prototypes", "Unused"] }
    },
    router: {},
    viewport: { options: INITIAL_VIEWPORTS },
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // Accessibility checks report in the panel and in tests without failing them.
    a11y: { test: "todo" }
  },
  // The story's database rows and language, ready before it renders, for client components and the mocked server alike.
  // Each story gets only the rows its `db` parameter gives, none without one, so one story's rows never leak into the
  // next. Storybook runs these loaders before a story's own.
  loaders: [
    async ({ globals, parameters }) => {
      mockRows(parameters.db ?? {})
      const { locale, messages } = await prepareIntl(globals.locale)
      const storyRouter = await prepareStoryRouter(
        parameters.router?.navigation?.pathname ?? "/",
        parameters.router?.navigation?.query ?? {}
      )
      return { locale, messages, storyRouter }
    }
  ],
  decorators: [
    (Story, { globals, loaded, parameters, id }) => (
      <StoryFrame
        key={id}
        router={loaded.storyRouter}
        locale={loaded.locale}
        messages={loaded.messages}
        theme={themes.find((theme) => theme === globals.theme) ?? "light"}
        permissions={parameters.permissions ?? owner}
        query={parameters.router?.navigation?.query ?? {}}
      >
        <Story />
      </StoryFrame>
    )
  ]
})
