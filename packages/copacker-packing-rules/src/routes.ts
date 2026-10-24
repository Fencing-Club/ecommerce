import { isAmazonNetwork, type ReceiverId } from "./receivers"

// A place a shipment stops at on its way: the supplier's address the goods leave from, a freight forwarder's warehouse
// or Amazon Global Logistics on the way, and the receiver where they end up. A route is a chain of them: the supplier
// first, any stops on the way, and a receiver last. The rules here decide what can follow what and who moves the goods
// between two stops, so the route editor, the purchase order and anything that checks a route agree.
export type RouteStop = {
  id: string
  // Who is there, as a leg names them, such as "Bayline Freight".
  company: string
  kind: "supplier" | "forwarder" | "agl" | "receiver"
  // For a receiver: which one, such as fba or the buyer's warehouse.
  receiver?: ReceiverId
}

// Who moves the goods from one stop to the next: the one sending or the one receiving, either booking a carrier
// (arranges) or in their own vehicle (moves).
export const legArrangements = ["senderArranges", "senderMoves", "receiverArranges", "receiverMoves"] as const
export type LegArrangement = (typeof legArrangements)[number]

// A route's stops in order and, between each two, who moves the goods: one leg fewer than stops.
export type Route<Stop extends RouteStop = RouteStop> = { stops: Stop[]; legs: LegArrangement[] }

// What breaks a route: it doesn't end at a receiver yet, a stop follows a receiver, AGL takes the goods somewhere
// other than an Amazon network, or a leg is moved by someone who can't move it.
export type RouteIssue =
  | { code: "noFinalDestination" }
  | { code: "stopAfterFinalDestination"; index: number }
  | { code: "aglNotIntoAmazon"; index: number }
  | { code: "legNotAllowed"; index: number }

// A receiver ends the route: nothing follows it.
export const endsRoute = (stop: RouteStop) => stop.kind === "receiver"

// The Amazon network a stop is, if it is one.
export const stopNetwork = (stop: RouteStop) => (isAmazonNetwork(stop.receiver) ? stop.receiver : undefined)

// Who can move the goods from one stop to the next. Amazon moves them to and from AGL, so nobody chooses; only the
// sender ships into an Amazon network; between any other two, either company does, by carrier or in its own vehicle.
export function legChoices(from: RouteStop, to: RouteStop): readonly LegArrangement[] {
  if (from.kind === "agl" || to.kind === "agl") {
    return []
  }
  return stopNetwork(to) ? ["senderArranges", "senderMoves"] : legArrangements
}

// Whether a stop can come straight after another: never after a receiver, never the same place twice in a row, and
// after AGL only an Amazon network, since AGL delivers into Amazon.
function canFollow(previous: RouteStop, stop: RouteStop) {
  if (endsRoute(previous) || previous.id === stop.id || stop.kind === "supplier") {
    return false
  }
  return previous.kind !== "agl" || stopNetwork(stop) !== undefined
}

// The places that can stand at a position in the route: the supplier first; on the way, a forwarder or AGL that fits
// between its neighbors (AGL only before an Amazon network); last, what the last stop is now, a receiver or a stop on
// the way; and after the last (adding a stop), anything that can follow it.
export function stopChoices<Stop extends RouteStop>(route: Route<RouteStop>, index: number, places: readonly Stop[]) {
  const previous = route.stops[index - 1]
  const next = route.stops[index + 1]
  const current = route.stops[index]
  return places.filter((place) => {
    if (index === 0) {
      return place.kind === "supplier"
    }
    if (!previous || !canFollow(previous, place)) {
      return false
    }
    if (next) {
      return place.kind !== "receiver" && canFollow(place, next)
    }
    if (current) {
      return endsRoute(current) === endsRoute(place)
    }
    return true
  })
}

// Each leg kept when its two stops still allow it, otherwise the first arrangement they do.
function fitLegs(stops: readonly RouteStop[], legs: readonly LegArrangement[]): LegArrangement[] {
  return stops.slice(1).map((stop, index) => {
    const allowed = legChoices(stops[index]!, stop)
    const leg = legs[index]
    return leg && (allowed.length === 0 || allowed.includes(leg)) ? leg : (allowed[0] ?? "senderArranges")
  })
}

// A stop chosen in place of another. The legs on either side keep who moves them, unless the new stop doesn't allow it.
export function replaceStop<Stop extends RouteStop>(route: Route<Stop>, index: number, stop: Stop): Route<Stop> {
  const stops = route.stops.map((current, at) => (at === index ? stop : current))
  return { stops, legs: fitLegs(stops, route.legs) }
}

// A stop added after the last, reached by the first arrangement its leg allows.
export function appendStop<Stop extends RouteStop>(route: Route<Stop>, stop: Stop): Route<Stop> {
  const stops = [...route.stops, stop]
  return { stops, legs: fitLegs(stops, route.legs) }
}

// The route without its last stop and the leg into it. The supplier stays.
export function removeLastStop<Stop extends RouteStop>(route: Route<Stop>): Route<Stop> {
  if (route.stops.length < 2) {
    return route
  }
  return { stops: route.stops.slice(0, -1), legs: route.legs.slice(0, -1) }
}

// Who moves the goods on one leg, when its stops allow it.
export function setLeg<Stop extends RouteStop>(route: Route<Stop>, index: number, leg: LegArrangement): Route<Stop> {
  const from = route.stops[index]
  const to = route.stops[index + 1]
  if (!from || !to || !legChoices(from, to).includes(leg)) {
    return route
  }
  return { stops: route.stops, legs: route.legs.map((current, at) => (at === index ? leg : current)) }
}

// What's wrong with a route, in order along it. A route with no issues can be saved.
export function routeIssues(route: Route<RouteStop>): RouteIssue[] {
  const issues: RouteIssue[] = []
  route.stops.forEach((stop, index) => {
    const next = route.stops[index + 1]
    if (next && endsRoute(stop)) {
      issues.push({ code: "stopAfterFinalDestination", index: index + 1 })
    }
    if (stop.kind === "agl" && (!next || !stopNetwork(next))) {
      issues.push({ code: "aglNotIntoAmazon", index })
    }
    const leg = route.legs[index]
    if (next && leg && legChoices(stop, next).length > 0 && !legChoices(stop, next).includes(leg)) {
      issues.push({ code: "legNotAllowed", index })
    }
  })
  const last = route.stops.at(-1)
  if (!last || !endsRoute(last)) {
    issues.push({ code: "noFinalDestination" })
  }
  return issues
}

// A route ends at a receiver and breaks no rule.
export const routeComplete = (route: Route<RouteStop>) => routeIssues(route).length === 0
