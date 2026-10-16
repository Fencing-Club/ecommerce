import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { createContext, use, useLayoutEffect } from "react"
import { fn } from "storybook/test"
import { parseUrlSearch, stringifyUrlSearch } from "@/lib/url-search"

const Content = createContext<React.ReactNode>(null)
function StoryContent() {
  return use(Content)
}

function createStoryRouter(href: string) {
  const root = createRootRoute({ component: StoryContent, notFoundComponent: StoryContent })
  const route = createRoute({ getParentRoute: () => root, path: "$" })
  const router = createRouter({
    routeTree: root.addChildren([route]),
    history: createMemoryHistory({ initialEntries: [href] }),
    parseSearch: parseUrlSearch,
    stringifySearch: stringifyUrlSearch
  })
  // Exercise the actual router and record its public operations for interaction assertions.
  return Object.assign(router, { navigate: fn(router.navigate), invalidate: fn(router.invalidate) })
}
let current = createStoryRouter("/")
export function getStoryRouter() {
  return current
}

// Complete the initial match in Storybook's loader. Otherwise the production preview commits an empty router before
// its first asynchronous load, and Storybook starts play functions before the story exists.
export async function prepareStoryRouter(pathname: string, query: Record<string, string>) {
  const router = createStoryRouter(pathname + stringifyUrlSearch(query))
  await router.load()
  return router
}

export function StoryRouter({
  router,
  children
}: {
  router: ReturnType<typeof createStoryRouter>
  children: React.ReactNode
}) {
  useLayoutEffect(() => {
    current = router
  }, [router])
  return (
    <Content value={children}>
      <RouterProvider router={router} />
    </Content>
  )
}
