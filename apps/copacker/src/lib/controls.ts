// Classes the app adds to the kit's controls, in `className`.

// A button a finger can hit on a phone: 44px tall there, and the kit's own size from `sm` up. On a Button of the
// default size.
export const touchButton = "h-11 sm:h-9"

// A quiet destructive action, such as disconnecting: muted until it's hovered or its menu is open, then destructive. On
// a ghost Button.
export const ghostDestructive =
  "text-muted-foreground hover:bg-destructive/10 dark:hover:bg-destructive/20 hover:text-destructive focus-visible:border-destructive/40 focus-visible:ring-destructive/20 aria-expanded:bg-destructive/10 dark:aria-expanded:bg-destructive/20 aria-expanded:text-destructive dark:focus-visible:ring-destructive/40"

// A table edge to edge inside a card, its first and last columns lined up with the card's padding (its
// `--card-spacing`). On the Table.
export const insetTable =
  "[&_td:first-child]:ps-[var(--card-spacing,1rem)] [&_td:last-child]:pe-[var(--card-spacing,1rem)] [&_th:first-child]:ps-[var(--card-spacing,1rem)] [&_th:last-child]:pe-[var(--card-spacing,1rem)]"
