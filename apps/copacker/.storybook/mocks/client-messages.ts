// ClientMessages for the browser. The app's is an async server component, which the marketing pages render inside
// their own sync components, where a story can't resolve it first. In a story every component is a client component
// reading the story's full messages, so there's nothing to pick: it passes its children through.
export function ClientMessages({ children }: { namespaces: readonly string[]; children: React.ReactNode }) {
  return children
}
