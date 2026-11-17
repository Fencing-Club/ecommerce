import { Tabs, TabsList, TabsTrigger } from "@buildkitgg/shadcn"
import { useLocale } from "use-intl"
import { SearchField } from "./search-field"

// The tabs and search above an index table, like Shopify's: each tab with its count.
export function IndexToolbar<T extends string>({
  tabs,
  tab,
  onTabChange,
  query,
  onQueryChange,
  placeholder,
  children
}: {
  tabs: Array<{ value: T; label: string; count?: number }>
  tab: T
  onTabChange: (value: T) => void
  query: string
  onQueryChange: (value: string) => void
  placeholder: string
  children?: React.ReactNode
}) {
  const locale = useLocale()
  return (
    <div className="flex min-w-0 flex-col gap-2 @3xl:flex-row @3xl:items-center @3xl:justify-between">
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const chosen = tabs.find((option) => option.value === value)
          if (chosen) {
            onTabChange(chosen.value)
          }
        }}
        className="min-w-0"
      >
        {/* Scrolls sideways on a phone instead of wrapping, without a scrollbar. */}
        <TabsList className="max-w-full justify-start overflow-x-auto [scrollbar-width:none]">
          {tabs.map((option) => (
            <TabsTrigger key={option.value} value={option.value} className="px-2.5">
              {option.label}
              {option.count !== undefined && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {option.count.toLocaleString(locale)}
                </span>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className="flex items-center gap-2">
        <SearchField label={placeholder} value={query} onChange={onQueryChange} className="@3xl:w-72" />
        {children}
      </div>
    </div>
  )
}
