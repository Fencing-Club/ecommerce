import type { Decorator } from "@storybook/react-vite"
import type { Loader } from "@storybook/react-vite"
import type { Args } from "@storybook/react-vite"
import { createContext, use, type ReactNode } from "react"
import { prepareIntl } from "#.storybook/intl"
import { mockRows } from "#.storybook/mocks/db"
import { getStoryRouter } from "#.storybook/router"
import { Shell } from "@/components/shell"
import type { WorkspaceKind } from "./workspace"
import { person, workspaces } from "./workspace"

// Prepare asynchronous fixture data in a loader; React renders the actual page components.
export function serverStory<A extends Args>(render: (args: A) => ReactNode | Promise<ReactNode>) {
  const loader: Loader = async ({ args, globals, parameters }) => {
    await prepareIntl(globals.locale)
    mockRows(parameters.db ?? {})
    return { server: await render(args as A) }
  }
  return {
    loaders: [loader],
    render: (_args: A, { loaded }: { loaded: Record<string, unknown> }) => <>{loaded.server as ReactNode}</>
  }
}

// Where the portal shows the story: the page area beside the sidebar.
const StoryContext = createContext<ReactNode>(null)
function StorySlot() {
  return use(StoryContext)
}

// A portal page as the portal layout shows it: the app header, the sidebar for the workspace's kind, and the page
// beside them, at the page's path so the sidebar marks it.
export function portalPage(pathname: string, kind: WorkspaceKind = "buyer", name?: string) {
  const workspace = workspaces[kind]
  const loader: Loader = async ({ globals }) => {
    await prepareIntl(globals.locale)
    const shell = (
      <Shell
        pathname={pathname}
        defaultOpen
        navigate={(href) => getStoryRouter().navigate({ href })}
        name={name ?? workspace.name}
        userName={person.name}
        email={person.email}
        kind={workspace.kind}
        active={workspace.id}
        workspaces={Object.values(workspaces)}
      >
        <StorySlot />
      </Shell>
    )
    return { shell }
  }
  const decorator: Decorator = (Story, { loaded }) => (
    <StoryContext value={<Story />}>{loaded.shell as ReactNode}</StoryContext>
  )
  return {
    loaders: [loader],
    decorators: [decorator],
    parameters: { layout: "fullscreen" as const, router: { navigation: { pathname } } }
  }
}

// A page story: the production page with fixture data, inside the portal.
export function pageStory<A extends Args>(
  pathname: string,
  render: (args: A) => ReactNode | Promise<ReactNode>,
  kind: WorkspaceKind = "buyer"
) {
  const portal = portalPage(pathname, kind)
  const server = serverStory(render)
  return { ...portal, loaders: [...portal.loaders, ...server.loaders], render: server.render }
}
