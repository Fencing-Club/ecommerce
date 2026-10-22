// Whether a list's search matches a row: any of its values contains the query, ignoring case and the spaces around the
// query. An empty search matches everything.
export function matches(query: string, ...values: Array<string | null | undefined>) {
  const needle = query.trim().toLocaleLowerCase()
  return !needle || values.some((value) => value?.toLocaleLowerCase().includes(needle))
}
