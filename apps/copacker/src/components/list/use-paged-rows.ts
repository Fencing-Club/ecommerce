import { usePagination } from "@mantine/hooks"

// One page of a list filtered in the browser, counting pages from 1, and what its Pager shows. A filter that leaves
// fewer pages shows the last of them; `reset` goes back to the first, as a change of tab or search does. A list that
// keeps its page itself, such as in a reducer whose filters go back to the first page, passes `page` and `onPage`.
export function usePagedRows<T>(
  rows: readonly T[],
  pageSize: number,
  controlled?: { page: number; onPage: (page: number) => void }
) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  const pagination = usePagination({
    total: pages,
    ...(controlled && { page: Math.min(controlled.page, pages), onChange: controlled.onPage })
  })
  const page = Math.min(pagination.active, pages)
  return {
    rows: rows.slice((page - 1) * pageSize, page * pageSize),
    pager: { page, pages, total: rows.length, size: pageSize, onPage: pagination.setPage },
    reset: pagination.first
  }
}
