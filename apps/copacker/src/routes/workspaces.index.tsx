import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"
import { AppProviders } from "@/components/app-providers"
import { WorkspacePicker } from "@/components/workspace-picker"
import { readWorkspaces } from "@/workspace-recovery.functions"

export const Route = createFileRoute("/workspaces/")({
  validateSearch: z.object({ unavailable: z.literal("1").optional().catch(undefined) }),
  loader: () => readWorkspaces(),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.title }] }),
  component: Screen
})

function Screen() {
  const { workspaces } = Route.useLoaderData()
  const { unavailable } = Route.useSearch()
  return (
    <AppProviders>
      <WorkspacePicker workspaces={workspaces} unavailable={unavailable === "1"} />
    </AppProviders>
  )
}
