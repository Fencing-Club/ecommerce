# Settings and account

Part of the [app redesign spec](README.md). The single `/settings` page splits in two (F7): **Account settings** for
the person, and **Workspace settings** for the workspace. Both open in a settings layout with its own navigation.

## The settings layout

```text
┌ Top bar (unchanged) ─────────────────────────────────────────────────────────────────────┐
├──────────────────┬───────────────────────────────────────────────────────────────────────┤
│ ‹ Back to Home   │  Team                                                    [Invite]     │
│                  │  People in Harbor Goods and what they can open                        │
│ ACCOUNT          │  ─────────────────────────────────────────────────────────────────── │
│ Profile          │                                                                       │
│ Preferences      │   Section content, max 880 px                                         │
│ Sign-in          │                                                                       │
│ Workspaces       │                                                                       │
│                  │                                                                       │
│ HARBOR GOODS     │                                                                       │
│ General          │                                                                       │
│ Team             │                                                                       │
│ Integrations     │                                                                       │
│ ...              │                                                                       │
└──────────────────┴───────────────────────────────────────────────────────────────────────┘
```

- The app sidebar is replaced by the settings navigation, with **Back to Home** at the top (or back to the page settings
  were opened from). Two groups: **Account**, and the workspace's name.
- Each item is its own route, so it can be linked from anywhere (`/settings/integrations/shopify` from a reconnect
  banner, `/settings/team` from an invitation email).
- Every page uses the [action bar](design-spec.md#action-bar): fields change in place, and the bar appears with **Discard** and **Save**. No card
  footers with their own Save.
- A member sees admin-only pages read-only, with a note naming who can change them ("Only owners and admins change
  this. Priya Shah and Alex Rivera are admins."). Pages with nothing to show a member are left out.
- `/settings` opens Profile. The old anchors (`/settings#integrations`, `#team`, `#addresses`, `#delete`) redirect to
  their pages.

## Account

| Page        | Route                         | Holds                                                                                              | Who      |
| ----------- | ----------------------------- | -------------------------------------------------------------------------------------------------- | -------- |
| Profile     | `/settings/profile`           | First and last name, position, company as shown on comments, email (read-only)                     | Everyone |
| Preferences | `/settings/preferences`       | Language (System or a locale), theme (Light, Dark, System)                                         | Everyone |
| Sign-in     | `/settings/sign-in`           | Email and password, **Change password** (a WorkOS password reset), Google and Microsoft sign-in in use, **Delete account** at the end | Everyone |
| Workspaces  | `/settings/workspaces`        | Every workspace the person is in, with kind and role; Open, **New workspace**                       | Everyone |
| Notifications (later) | `/settings/notifications` | Email and in-app preferences per update kind, once Novu delivers them                  | Everyone |

**Delete account** keeps its rules: typed email, transfer ownership first, what closes with the account. It moves
from the shared Delete section to the end of Sign-in, as a destructive zone.

## Workspace

| Page             | Route                               | Buyer | Supplier | Forwarder | Holds                                                                                          |
| ---------------- | ----------------------------------- | ----- | -------- | --------- | ---------------------------------------------------------------------------------------------- |
| General          | `/settings/general`                 | Yes   | Yes      | Yes       | Workspace name (renaming is new) and kind; buyer: company website, store time zone; supplier: the supplier profile (contact name, email, phone, website) |
| Team             | `/settings/team`                    | Yes   | Yes      | Yes       | People and invitations, roles, access                                                          |
| Member           | `/settings/team/[memberId]`         | Yes   | Yes      | Yes       | One person's role, page access and prices; transfer ownership; remove                          |
| Integrations     | `/settings/integrations`            | Yes   | Yes      |           | Buyer: Shopify, Amazon and eBay cards with status and last sync. Supplier: eBay, with Shopify and Amazon coming later |
| Store            | `/settings/integrations/[provider]` | Yes   | Yes      |           | The store's account, connect or disconnect, and its settings (below)                           |
| Stock flow       | `/settings/stock-flow`              | Yes   | Yes      |           | The [inventory sync spec](../inventory-sync/README.md)'s Stock flow page (below)               |
| Customs          | `/settings/customs`                 | Yes   |          |           | Importer of record (legal name, EIN or CBP-assigned number, continuous bond) and customs broker |
| Restock          | `/settings/restock`                 | Yes   |          |           | Sales period and lead time defaults                                                            |
| Monthly costs    | `/settings/costs`                   | Yes   |          |           | Costs no platform reports, with channel and dates                                              |
| Addresses        | `/settings/addresses`               | Yes   | Yes      |           | Buyer: delivery addresses and their Shopify locations. Supplier: pickup addresses              |
| Warehouses       | `/settings/warehouses`              |       |          | Yes       | The forwarder's warehouse addresses                                                            |
| Danger zone      | `/settings/danger`                  | Yes   | Yes      | Yes       | Delete workspace (the owner)                                                                   |

### Team `/settings/team`

- **Header:** **Invite** (admins).
- **Table:** person (avatar, name, email, "You"), role, pages ("All pages", or "4 pages, prices"), last active (new,
  optional), ⋯ (Change access, Resend or Cancel invitation, Remove, Transfer ownership for the owner).
- Invitations show in the same table with Invited or Invitation expired and the expiry date.
- The row opens the member page.

### Member `/settings/team/[memberId]`

Replaces the access dialog, since the page list is long enough to need room.

- **Role:** Owner, Admin, Member as three choices with what each can do (the role descriptions).
- **Page access** for a member: a table of the workspace kind's pages, each No access, View or Edit, following
  `highestLevel` (Restock's Reorder needs Purchase orders Edit; the Overviews are View only; without prices, Purchase
  orders and a supplier's Products clamp to View, and Analytics closes).
- **See prices and costs** switch, not offered in a forwarder's workspace.
- Action bar with **Save access**. Nobody changes their own access or the owner's; the page says so.

### Integrations `/settings/integrations` and `/settings/integrations/[provider]`

- The index shows a card per store: logo, name, what it syncs ("Products, inventory, orders, expenses"), status
  (Connected, Needs reconnecting, Not connected, Coming soon), account and last sync, and **Connect** or **Manage**.
- **Shopify:** account, Orders sync row, Inventory sync row, Locations (a summary that opens Stock flow, where locations
  are counted or not), Excluded order tags, **Disconnect**.
- **Amazon:** account (or self-authorization when the app is a draft), Orders sync, Inventory sync, marketplaces,
  **Disconnect**.
- **eBay:** account, Orders sync, **Disconnect**. A supplier connects eBay here first; its sync activity shows eBay sales
  and quantities.

### Stock flow `/settings/stock-flow`

As the [inventory sync spec's Stock flow page](../inventory-sync/stock-flow-ux.md) describes.

- **Header:** the problems count, a **Map** and **List** switch, and **Pause all syncing**. A chip names the master.
- **Map:** lanes for sources, purchase orders, stock and channels. Lines show their owner: Copacker in the accent
  color, another app in gray with its name, the platform thin, and off dashed. A channel with listings to link shows
  the count.
- **Panel:** a node or line opens beside the map, with Settings, History and Preview for a line. A line whose scope
  isn't granted shows **Reconnect eBay** in place of the Copacker option, and the confirm dialog for moving a line
  from Marketplace Connect lists what to turn off there first. History lists each write and its cause, such as
  "Changed in eBay from 7 to 12, set back to 7".
- **Phone:** the list form, one card per channel with its lines as rows (kind, owner, state).

### Customs `/settings/customs`

For a buyer that imports. The importer of record (legal name, EIN or CBP-assigned number, continuous bond number and
expiry) prints on commercial invoices, ISF data and Global Logistics booking sheets. The customs broker (name, email,
filer code, phone) is who files the ISF and entries.

### Addresses and Warehouses

One table: name, kind (Delivery, Pickup, Warehouse), address, contact, the Shopify location it's linked to. A delivery
address with no Shopify location is flagged, since sending a PO to it is refused. **Add
address** opens a sheet with the address fields. Forwarder addresses saved here before forwarders had their own records
show with "Move to Partners" and the existing copy-and-delete note.

### Danger zone `/settings/danger`

**Delete workspace** for the owner, typed name, and what it deletes, as [Roles and page access](../../permissions.md#deleting)
describes. Others see who the owner is.
