# Account partner and connection schemas

Use [shared types and access profiles](shared.md). Every operation below is an explicit initial command. Authentication
and secret management use [the credential lifecycle](../credentials.md), keeping `login`/`logout` at the top level.

## Account and discovery

`Workspace = {id,name,kind:"buyer"|"supplier"|"forwarder",role:"owner"|"admin"|"member",access,
effectiveScopes:string[],capabilities:[{operation,available:boolean,reason:string|null}]}`; `access` uses the exact
[application access schema](../../../../src/lib/access.ts), never role names supplied by the caller.

| Operation or local command | Input | Result data | Access and effects |
| --- | --- | --- | --- |
| `login` (local) | CLI `{profile?:string}` | `{authenticated:true,accountId,profile}` | Browser/PKCE sign-in; protected local credentials, no workspace required. |
| `logout` (local) | CLI `{profile?:string}` | `{cleared:boolean,revoked:boolean}` | Revoke/clear selected interactive grant; report revocation failure, no automation mass-revoke. |
| `account.show` | `{}`; account context | `{id,name,email,authentication:{kind:"interactive"|"automation",credentialId:Id|null,expiresAt:Instant|null,scopes:string[]},workspaceId:Id|null}` | Account; effective local workspace is CLI metadata, server workspaceId is credential binding or null. |
| `workspace.list` | `PageInput`; account context | `Page<Workspace>` sorted name/ID | Account; automation sees only its bound workspace. |
| `workspace.show` | `{}`; workspace context | `Workspace` | Current membership; bootstrap discovery does not require every business-data scope. |
| `workspace.use` (local) | `{id}` | `{workspaceId}` | Validates accessible ID, then changes local default only. |
| `status` | `{}`; workspace context | `{connections:[{id,state,issues:Issue[]}],datasets:[{connectionId,name,observedAt:Instant|null,state}],attention:[{entityId,operationId,issues:Issue[],recovery:StatusQuery}]}` | Membership; filter each entry by its resource read permission, omit sensitive diagnostics. |
| `schema.list` | `PageInput & {prefix?:Text<100>}` | `Page<{operation,cliPath,mcpName:string|null,contractVersion:string,context,effects:Effect[]}>` | Membership; only deployed/currently discoverable capabilities. |
| `schema.show` | `{operation:Text<100>}` | `{operation,contractVersion,context,cliPath,mcpName:string|null,inputSchema:JSONSchema,outputSchema:JSONSchema,errorSchema:JSONSchema,accessPolicy,effects:Effect[],limits,asyncStatusSchema:JSONSchema|null}` | Same; JSONSchema is the schema document, not untyped business data. |

Credential list/show/create/rotate/revoke inputs, results and errors are specified in the credential page. Their command
paths begin `account credential`, but context is workspace, and issuing authority is interactive admin only.

## Partners and addresses

`Partner = {id,revision,type:"supplier"|"forwarder"|"customer",name,joined:boolean,workspaceId:Id|null,
contact:{name:string|null,email:string|null,phone:string|null,website:string|null},addressIds:Id[],
catalogId:Id|null,leadTimeDays:integer|null,shopifySupplierName:string|null,allowedActions:string[]}`.
Fields irrelevant to a type are omitted; supplier catalog assignment is only on eligible B2B customer relationships.
`PartnerInput = {type:"supplier"|"forwarder",name:Text<255>,email?:email}`. Customer creation has no enabled handler
today; discovery must not imply a supplier can create an arbitrary buyer workspace. Customers come from existing buyer
relationships. A future deployed customer creation branch would require its own explicit contract, not accept this input.

`PartnerPatch` is discriminated by the existing type: supplier permits name, shopifySupplierName, leadTimeDays
(integer 1..730|null) and nullable contact fields; forwarder permits local relationship name. Joined supplier contact
fields belong to that supplier and are rejected here. No update changes relationship type.
`PostalAddress` reuses [addressSchema](../../../../../../packages/copacker-shipments/src/index.ts).
`Address = {id,revision,name,kind:"delivery"|"forwarder"|"pickup",owner:{kind:"workspace"|"partner",id},
address:PostalAddress,shopifyLocation:SourceRef|null}`. A Shopify location link is valid only on buyer delivery addresses.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `partners.list` | `PageInput & {type?:Partner.type,query?:Text<255>,joined?:boolean}` | `Page<Partner>` sorted name/ID | PartnersRead; workspace-specific relationships only. |
| `partners.show` | `{id,type?:Partner.type}` | `Partner` | Same; optional type assertion must match. |
| `partners.create` | `{clientReference,data:PartnerInput}` | `Saved<Partner> & {restored:boolean}` | B PartnersWrite; create/restore relationship, no email even if email supplied. |
| `partners.update` | `Guard & {patch:PartnerPatch}` | `Saved<Partner>` | B PartnersWrite; local fields only, `field_owned_elsewhere`. |
| `partners.remove` | `Guard` | `Removed` | B PartnersWrite; preserve historical references, reject open-PO restrictions. |
| `partners.invite` | `Guard & {email:email,type:"supplier"|"forwarder"}` | `{partner:Partner,invitation:{id,state:"queued"|"sent",expiresAt},operation?:Operation,statusQuery?:StatusQuery}` | B PartnersWrite; explicit recipient invitation, joined relationships reject; replay sends no second email. |
| `partners.catalog.assign` | `Guard & {catalogId,expectedCatalogRevision,expectedPreviousCatalogId:Id|null,expectedPreviousCatalogRevision:Revision|null}` | `{partner:Partner,changedDependencies:Dependency[]}` | S PartnersWrite + CatalogWrite; active owned catalog, atomic reassignment. |
| `partners.catalog.remove` | `Guard & {expectedCatalogId,expectedCatalogRevision}` | Same | Same; clear one assignment, no sent-PO price rewrite. |
| `address.list` | `PageInput & {owner?:Address.owner,kind?:Address.kind}` | `Page<Address>` sorted name/ID | PartnersRead for partner addresses; membership for accessible own addresses. |
| `address.show` | `{id}` | `Address` | Same with ownership/relationship checks. |
| `address.create` | `{clientReference,data:Address without id/revision}` | `Saved<Address>` | Own address: Admin(partners:write); unjoined partner address: B PartnersWrite. |
| `address.update` | `Guard & {data:Address without id/revision/owner}` | `Saved<Address>` | Same; owner cannot change. |
| `address.remove` | `Guard` | `Removed` | Same; preserve historical/active PO references, `address_in_use` if removal breaks them. |

## Connections

`Connection = {id,revision,provider:"shopify"|"amazon"|"ebay"|"amazon_ads",accountId:string|null,name,
state:"connected"|"authorization_required"|"disconnected"|"error",grantedScopes:string[],
capabilities:[{operation,available:boolean,reason:string|null}],datasets:DatasetStatus[],issues:Issue[]}`.
`DatasetStatus = {name:"products"|"inventory"|"orders"|"financial_transactions"|"stock_history"|"ad_spend",
state:"not_started"|"queued"|"running"|"complete"|"failed",collectedWith:string[],observedAt:Instant|null,
coveredFrom:Instant|null,coveredTo:Instant|null,issues:Issue[]}`. Server capabilities declare supported datasets/groups;
requesting a grouped dataset does not promise an independent worker.
`SyncRun = {connectionId,runId,requestedDatasets:string[],datasets:DatasetStatus[],operation:Operation,statusQuery:StatusQuery}`.

`ConnectionSettings` initially has the supported Shopify branch `{provider:"shopify",excludedOrderTags:string[]}`.
Tags use current wildcard/case normalization. Other providers return `{provider,editableFields:[]}` and reject settings
updates until a named deployed field exists; this is not arbitrary provider configuration or a source-ownership editor.

| Operation | Input | Result data | Access and effects; specific errors |
| --- | --- | --- | --- |
| `connection.list` | `PageInput & {provider?:Connection.provider}` | `Page<Connection>` sorted provider/account/ID | B membership + connections:read; provider secrets omitted. |
| `connection.show` | `{id}` | `Connection` | Same. |
| `connection.connect` | `{provider,expectedAccountId?:string,shopDomain?:string}` | `{authorizationId,url,expiresAt,statusQuery}` | B Admin(connections:manage); create browser consent intent; Shopify requires shopDomain, never arbitrary callback URLs. |
| `connection.reconnect` | `Guard & {expectedAccountId:string}` | Same authorization receipt | Same; bind intent to existing connection/account, mismatch fails. |
| `connection.disconnect` | `Guard` | `{connection:Connection,localDisconnected:boolean,providerRevocation:"confirmed"|"unsupported"|"failed"}` | B Admin(connections:manage); disconnect locally and report provider result honestly. |
| `connection.sync` | `{id,dataset:DatasetStatus.name|"all"}` | `SyncRun` | B products V + sync:run for product/inventory/stock history, sales V + sync:run for orders; overview V + P + sync:run for finance/Ads, or admin. `all` requires all selected dataset permissions. |
| `connection.sync.show` | `{id,runId?:Id,operationId?:Id}` | `SyncRun` | Corresponding read permissions + connections:read; exact run or latest; never provider tokens. |
| `connection.settings.show` | `{id}` | `{connectionId,revision,settings:ConnectionSettings}` | B Admin(connections:read). |
| `connection.settings.update` | `Guard & {settings:{provider:"shopify",excludedOrderTags:string[]}}` | Same | B Admin(connections:manage); local ingestion settings, no upstream write. |

Authorization status uses `connection.show` with `{authorizationId}` as an alternative selector until a connection
exists; its input union therefore also permits `{authorizationId:Id}` and returns
`{authorizationId,state:"pending"|"completed"|"expired"|"failed",connection:Connection|null,issues:Issue[]}`.
The server-provided statusQuery uses this branch. OAuth callbacks bind principal/workspace/account and cannot accept
an arbitrary new account under a reconnect intent. Schema discovery returns provider requirements and current limits.
