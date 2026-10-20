// One quoted CSV cell. Spreadsheets run a cell that starts like a formula, so text that does, such as a partner's name,
// leads with a quote. Numbers, negative ones included, stay numbers.
export function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) && !/^-?\d+(\.\d+)?$/.test(value) ? `'${value}` : value
  return `"${safe.replaceAll('"', '""')}"`
}
