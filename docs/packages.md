# Copacker packages: what goes where

Copacker is the app in `apps/copacker` plus the `@repo/copacker-*` packages in `packages/`. A package holds logic that
needs no database, request, React page or app configuration, so the CLI, a scheduler and tests can use it too. No tool
enforces these lines; this page and code review do.

| Where                    | Owns                                                                                                                                                                       | Must not hold                                                                                       | Depends on                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `apps/copacker`          | Pages, components, server functions and HTTP routes; the database and its migrations; sign-in and access; jobs; stored connections and secrets; translations; rendering PDFs; sending emails | Provider HTTP calls, report parsers, PO, packing or shipment rules, or a copy of a package's schema or constant | orders, shipments, packing-rules, marketplaces, emails |
| `copacker-packing-rules` | What a carton or pallet may be, per receiver: carton and pallet policies, receivers and `orderDestination`, `validatePacking`, carton IDs, units                          | Anything about a PO beyond the few fields it reads; I/O                                             | nothing                                                |
| `copacker-marketplaces`  | Amazon (SP-API, Ads), Shopify and eBay: clients, OAuth, marketplace and Shopify IDs, sales collectors, report parsers                                                     | The database, Copacker's POs and shipments, scheduling, reading the app's environment               | zod                                                    |
| `copacker-orders`        | What a PO is: its schema and lines, destination and address, currencies, price bases, supplier changes, totals and `money`, packing requirements                         | Packing, cartons, labels, documents, provider calls                                                 | packing-rules, marketplaces                            |
| `copacker-shipments`     | Packing a PO: cartons and pallets, FBA and AWD inbound plans, Amazon and carrier labels, the shipping documents' data and rules, supplier requirements, transport, countries | The PO itself (orders), provider HTTP calls (marketplaces), React                                    | orders, packing-rules, marketplaces                    |
| `copacker-emails`        | Transactional email templates, rendered to subject, HTML and text                                                                                                         | The words (the app translates them), sending, loading data                                          | React Email                                            |
| `copacker-contract`      | The operations the CLI and API share: request and result schemas, commands, the registry                                                                                  | Handlers, HTTP, Node APIs                                                                           | zod                                                    |
| `copacker-client`        | The HTTP client for the operations API: auth, retries, paging, file transfers                                                                                             | Terminal output, stored credentials                                                                 | contract                                               |
| `copacker-cli`           | The `copacker` command: login, profiles, the OS keychain, output formats, files                                                                                           | Business rules, which the app applies behind the API                                                | contract, client                                       |

The app doesn't use the CLI packages yet; they wait for the operations API. Each package's `docs/README.md` says more,
and [the engineering docs](README.md) index them.

## Where does new code go?

1. Does it read the database, handle a request, render React or read the app's environment? The app.
2. Does it call Amazon, Shopify or eBay, or read their data or reports? `copacker-marketplaces`, with keys passed in.
3. Is it about what a PO says or costs? `copacker-orders`.
4. A rule for one carton or pallet, or where a line's goods go? `copacker-packing-rules`. Packing a whole PO, labels,
   documents, Amazon inbound plans or transport? `copacker-shipments`.
5. An email's layout goes in `copacker-emails`; its words go in the app's messages.
6. Part of the CLI's contract? `copacker-contract`. Calling the API: `copacker-client`. The terminal: `copacker-cli`.
7. Search the packages before writing a helper. When two places need the same thing, it goes in the package that owns
   its domain, not a shared utilities package. If only the app uses it, it stays in the app.
8. Import a name from the package that defines it; packages don't re-export each other's code.
9. Keep Node-only code (`node:` modules, pdf-lib, file reads) in its own subpath, such as `copacker-marketplaces/amazon`
   or `copacker-shipments/labels`. The browser loads `copacker-marketplaces/shopify`,
   `copacker-marketplaces/amazon-marketplaces`, packing-rules and the orders and shipments roots.

## How a package is set up

Each one has `src/`, `tests/` and `docs/README.md`, and the same small configs: an `.oxlintrc.json` extending the shared
base, a `tsconfig.json` from `@repo/typescript-config`, and a `vitest.config.ts` whose coverage thresholds sit about a
point below the package's coverage. CI measures coverage on Linux. It exports subpaths from `package.json`.
