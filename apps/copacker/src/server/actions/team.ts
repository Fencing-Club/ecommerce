import { deleteAccount, deleteWorkspace } from "@/server/deletion"
import {
  cancelInvitation,
  changeAccess,
  inviteColleague,
  removeColleague,
  resendInvitation,
  transferOwnership
} from "@/server/team"
import { defineAction, fields } from "./define"

// The workspace's team, handing it over and deleting it, and deleting one's own account. See permissions.md.
export const teamActions = {
  "team.invite": defineAction({
    guard: { admin: true },
    input: fields,
    run: (data, s) => inviteColleague(s.org, data)
  }),
  "team.resend": defineAction({
    guard: { admin: true },
    input: fields,
    run: (data, s) => resendInvitation(s.org, data)
  }),
  "team.access": defineAction({ guard: { admin: true }, input: fields, run: (data, s) => changeAccess(s, data) }),
  "team.cancel": defineAction({
    guard: { admin: true },
    input: fields,
    run: (data, s) => cancelInvitation(s.org.id, data)
  }),
  "team.remove": defineAction({ guard: { admin: true }, input: fields, run: (data, s) => removeColleague(s, data) }),
  "team.transfer": defineAction({
    guard: { owner: true },
    input: fields,
    run: (data, s) => transferOwnership(s, data)
  }),
  "workspace.delete": defineAction({
    guard: { owner: true },
    input: fields,
    run: (data, s) => deleteWorkspace(s.org, data)
  }),
  // Anyone can delete their own account, once the workspaces they own that others use have a new owner.
  "account.delete": defineAction({ input: fields, run: (data, s) => deleteAccount(s.user, data) })
}
