import type { Args, Decorator, Loader } from "@storybook/nextjs-vite"
import { getRouter } from "@storybook/nextjs-vite/navigation.mock"
import { Children, cloneElement, createContext, Fragment, isValidElement, use, type ReactNode } from "react"
import { prepareIntl } from "#.storybook/intl"
import { mockRows } from "#.storybook/mocks/db"
import { Shell } from "@/components/shell"
import { person, type WorkspaceKind, workspaces } from "./workspace"

// React renders async server components only on the server. A story renders them first, in a loader, into the client
// components they return; the story then shows that tree.

function isAsync(type: unknown): type is (props: unknown) => Promise<ReactNode> {
  return typeof type === "function" && type.constructor.name === "AsyncFunction"
}

// Resolves every async component in the tree, and in the elements passed as props (such as a card's `actions`), to
// what it renders. Other components render as usual once the story shows the tree.
export async function renderServer(node: ReactNode | Promise<ReactNode>): Promise<ReactNode> {
  const resolved = await node
  if (Array.isArray(resolved)) {
    return Promise.all(resolved.map((child: ReactNode) => renderServer(child)))
  }
  if (!isValidElement<Record<string, unknown>>(resolved)) {
    return resolved
  }
  if (isAsync(resolved.type)) {
    // What it renders keeps its key, so a list of them stays keyed.
    const rendered = await renderServer(resolved.type(resolved.props))
    return resolved.key === null ? rendered : <Fragment key={resolved.key}>{rendered}</Fragment>
  }
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(resolved.props)) {
    if (isValidElement(value) || (Array.isArray(value) && value.some((child) => isValidElement(child)))) {
      props[key] = await renderServer(key === "children" ? Children.toArray(value as ReactNode) : (value as ReactNode))
    }
  }
  return Object.keys(props).length ? cloneElement(resolved, props) : resolved
}

// A story of a server component: it renders the component (or a page's server render) with the story's args. The
// database answers with the story's `db` parameter, rows by table name, such as { contacts: [...] }.
export function serverStory<A extends Args>(render: (args: A) => ReactNode | Promise<ReactNode>) {
  const loader: Loader = async ({ args, globals, parameters }) => {
    await prepareIntl(globals.locale)
    mockRows(parameters.db ?? {})
    return { server: await renderServer(render(args as A)) }
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
export function portalPage(pathname: string, kind: WorkspaceKind = "buyer") {
  const workspace = workspaces[kind]
  const loader: Loader = async ({ globals }) => {
    await prepareIntl(globals.locale)
    const shell = await Shell({
      pathname,
      defaultOpen: true,
      navigate: getRouter().push,
      name: workspace.name,
      userName: person.name,
      email: person.email,
      kind: workspace.kind,
      active: workspace.id,
      workspaces: Object.values(workspaces),
      children: <StorySlot />
    })
    return { shell }
  }
  const decorator: Decorator = (Story, { loaded }) => (
    <StoryContext value={<Story />}>{loaded.shell as ReactNode}</StoryContext>
  )
  return {
    loaders: [loader],
    decorators: [decorator],
    parameters: { layout: "fullscreen" as const, nextjs: { appDirectory: true, navigation: { pathname } } }
  }
}

// A page story: the page's server render, inside the portal.
export function pageStory<A extends Args>(
  pathname: string,
  render: (args: A) => ReactNode | Promise<ReactNode>,
  kind: WorkspaceKind = "buyer"
) {
  const portal = portalPage(pathname, kind)
  const server = serverStory(render)
  return { ...portal, loaders: [...portal.loaders, ...server.loaders], render: server.render }
}
