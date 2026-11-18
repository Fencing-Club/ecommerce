import { Table } from "@buildkitgg/shadcn"

// A table that stands on its own, inside a rounded border. A table inside a card runs edge to edge without one.
export function FramedTable(props: React.ComponentProps<typeof Table>) {
  return (
    <div data-slot="table-frame" className="overflow-hidden rounded-lg border">
      <Table {...props} />
    </div>
  )
}
