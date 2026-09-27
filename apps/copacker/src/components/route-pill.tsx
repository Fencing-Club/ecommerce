// A stop in a PO's route from the supplier to the destination, as the PO editor shows it.
export function RoutePill({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="flex h-7 max-w-md min-w-0 items-center gap-1.5 rounded-full bg-muted px-3 font-medium [&_svg]:size-4 [&_svg]:shrink-0">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}
