import { z } from "zod"
import { setWorkspace } from "@/server/auth"
import { joinWorkspace, setUpWorkspace } from "@/server/onboarding"
import { requireMembership } from "@/server/workspace-session"
import { fields, signedInAction } from "./define"

// Getting started, signed in but maybe without a workspace yet, and switching workspace, which mustn't depend on a
// workspace that has disappeared. See auth.md.
export const gettingStartedActions = {
  "onboarding.workspace": signedInAction({ input: fields, run: (data, user) => setUpWorkspace(user, data) }),
  "onboarding.join": signedInAction({ input: fields, run: (data, user) => joinWorkspace(user, data) }),
  "workspace.switch": signedInAction({
    input: z.object({ id: z.uuid() }),
    returnTo: "/workspaces",
    run: async ({ id }, user) => {
      await requireMembership(user.id, id)
      setWorkspace(id)
      return { redirect: "/" }
    }
  })
}
