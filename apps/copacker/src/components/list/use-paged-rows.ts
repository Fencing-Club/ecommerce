import { usePagination } from "@mantine/hooks"

// One page of a list filtered in the browser, counting pages from 1, and what its Pager shows. A filter that leaves
// fewer pages shows the last of them; `reset` goes back to the first, as a change of tab or search does.
export function usePagedRows<T>(rows: readonly T[], pageSize: number) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pagination = usePagination({ total: pages })
  const page = Math.min(pagination.active, pages)
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pager: { page, pages, total: rows.length, size: pageSize, onPage: pagination.setPage },
    reset: pagination.first
  }
}
