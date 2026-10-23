import { useShadcnLocalization } from "@buildkitgg/shadcn-baseui-kit"

// The reading direction's start or end edge as the side a Sidebar or Sheet takes. shadcn's sides are screen edges, so in
// Urdu the start is the right.
export function useEdge(edge: "start" | "end"): "left" | "right" {
  const rtl = useShadcnLocalization().direction === "rtl"
  return (edge === "start") !== rtl ? "left" : "right"
}
