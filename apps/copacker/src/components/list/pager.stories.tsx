import { useState } from "react"
import { expect, fn, screen, userEvent } from "storybook/test"
import preview from "#.storybook/preview"
import { PageButtons, Pager } from "./pager"
import { usePagedRows } from "./use-paged-rows"

const rows = Array.from({ length: 60 }, (_, index) => `Row ${index + 1}`)

// A list paged in the browser: usePagedRows gives the Pager its props.
function PagedList({ total }: { total: number }) {
  const paged = usePagedRows(rows.slice(0, total), 25)
  return (
    <div className="flex flex-col gap-2">
      <p data-testid="page">
        Page {paged.pager.page}: {paged.rows.at(0)} to {paged.rows.at(-1)}
      </p>
      <button type="button" onClick={paged.reset}>
        First page
      </button>
      <Pager {...paged.pager} />
    </div>
  )
}

// Pages of a long table: which rows show, and previous and next.
const meta = preview.meta({
  title: "Components/Display/Pager",
  component: Pager,
  args: { page: 2, pages: 3, total: 60, size: 25, onPage: fn() }
})

export const Middle = meta.story({
  play: async ({ args, canvas }) => {
    await expect(canvas.getByText("26–50 of 60")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(args.onPage).toHaveBeenCalledWith(3)
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }))
    await expect(args.onPage).toHaveBeenCalledWith(1)
  }
})

export const Pages = meta.story({
  render: () => <PagedList total={60} />,
  play: async ({ canvas }) => {
    await expect(canvas.getByText("1–25 of 60")).toBeVisible()
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByText("51–60 of 60")).toBeVisible()
    await expect(canvas.getByTestId("page")).toHaveTextContent("Page 3: Row 51 to Row 60")
    await expect(canvas.getByRole("button", { name: "Next page" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Previous page" }))
    await expect(canvas.getByTestId("page")).toHaveTextContent("Page 2")
    // A change of tab or search goes back to the first page.
    await userEvent.click(canvas.getByRole("button", { name: "First page" }))
    await expect(canvas.getByTestId("page")).toHaveTextContent("Page 1: Row 1 to Row 25")
  }
})

export const OnePage = meta.story({
  render: () => <PagedList total={10} />,
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("button", { name: "Next page" })).toBeNull()
    await expect(screen.queryByText(/of 10/)).toBeNull()
  }
})

// Previous and next on their own, for a list paged by the server, as words or arrows.
function Buttons({ words }: { words?: boolean }) {
  const [page, setPage] = useState(1)
  return (
    <nav aria-label="Order pages" className="flex items-center gap-2">
      <span data-testid="page">Page {page} of 3</span>
      <PageButtons page={page} pages={3} onPage={setPage} words={words} />
    </nav>
  )
}

export const Words = meta.story({
  render: () => <Buttons words />,
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("button", { name: "Previous" })).toBeDisabled()
    await userEvent.click(canvas.getByRole("button", { name: "Next" }))
    await userEvent.click(canvas.getByRole("button", { name: "Next" }))
    await expect(canvas.getByTestId("page")).toHaveTextContent("Page 3 of 3")
    await expect(canvas.getByRole("button", { name: "Next" })).toBeDisabled()
  }
})

export const Arrows = meta.story({
  render: () => <Buttons />,
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Next page" }))
    await expect(canvas.getByTestId("page")).toHaveTextContent("Page 2 of 3")
    await expect(canvas.getByRole("button", { name: "Previous page" })).toBeEnabled()
  }
})
