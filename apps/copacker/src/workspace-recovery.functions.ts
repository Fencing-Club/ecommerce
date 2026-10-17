import { createServerFn } from "@tanstack/react-start"
import { readWorkspacesData } from "@/server/workspace-recovery"

export const readWorkspaces = createServerFn().handler(() => readWorkspacesData())
