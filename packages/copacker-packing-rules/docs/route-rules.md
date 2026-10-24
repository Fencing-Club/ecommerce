# Route rules

A shipment's route is a chain of stops (`routes`): the supplier's address the goods leave from, any stops on the way, and
a receiver where they end up. A stop on the way is a freight forwarder's warehouse or Amazon Global Logistics (AGL).
Between each two stops a leg says who moves the goods: the sender or the receiver, either booking a carrier
(`senderArranges`, `receiverArranges`) or in their own vehicle (`senderMoves`, `receiverMoves`).

The rules are code here rather than in a screen, so the route editor, the purchase order and anything that checks a
route agree. The route editor offers only what they allow, and the Route section saves only a route with no issues.

| Rule | Where |
| --- | --- |
| The supplier is the first stop | `stopChoices` |
| A receiver ends the route: nothing follows it, and a route has to end at one to save | `endsRoute`, `routeIssues` (`noFinalDestination`, `stopAfterFinalDestination`) |
| Stops on the way are forwarders or AGL, and a stop never follows the same place | `stopChoices` |
| Only the sender ships into an Amazon network | `legChoices`, `routeIssues` (`legNotAllowed`) |
| Amazon moves the goods to and from AGL, and AGL delivers only into an Amazon network | `legChoices`, `stopChoices`, `routeIssues` (`aglNotIntoAmazon`) |

- `stopChoices(route, index, places)` filters the places that can stand at a position: the supplier first, a forwarder
  or AGL between two stops, the same kind of stop as now for the last one (a receiver, or a stop on the way), and
  anything that can follow the last stop when one is added after it.
- `legChoices(from, to)` lists who can move a leg. It's empty for a leg to or from AGL, which Amazon moves.
- `replaceStop`, `appendStop`, `removeLastStop` and `setLeg` change a route. Each leg keeps who moves it while its
  stops allow it, and otherwise takes the first arrangement they do.
- `routeIssues` lists what breaks a route, in order along it, and `routeComplete` says it has none.

A stop is read by the few fields the rules need (`RouteStop`: its id, company, kind and receiver). The app adds what it
shows, such as the stop's name and address. Copacker's Storybook checks each rule through the editor's interactions,
under Unused / Shipments / Route editor.
