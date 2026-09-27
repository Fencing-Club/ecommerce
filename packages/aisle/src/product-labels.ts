import { PDFDocument, StandardFonts, type PDFFont, rgb } from "pdf-lib"

// Code 128 symbols as bar and space widths in modules, bar first. Values 0-102 are data, 103-105 start codes A-C,
// 106 stop (with its final bar).
export const code128Patterns = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112"
] as const

const startB = 104
const stop = 106

// The symbol values for text in Code 128 set B (printable ASCII), with the start code, checksum and stop.
export function code128B(text: string) {
  if (!/^[\x20-\x7e]+$/.test(text)) {
    throw new Error("A Code 128 label needs printable ASCII text")
  }
  const values = [...text].map((char) => char.charCodeAt(0) - 32)
  const checksum = values.reduce((sum, value, index) => sum + value * (index + 1), startB) % 103
  return [startB, ...values, checksum, stop]
}

// Module widths of the whole symbol, alternating bar and space, starting with a bar.
export function code128Modules(text: string) {
  return code128B(text).flatMap((value) => [...code128Patterns[value]!].map(Number))
}

// US Letter sheet of 30 labels, 2 5/8 x 1 in, as on Avery 5160 and similar stock. Points are 1/72 in.
const sheet = { width: 612, height: 792, columns: 3, rows: 10, left: 13.5, top: 36, pitch: 198, label: 189 }
const labelHeight = 72

const printable = (text: string) =>
  text
    .replace(/[^\x20-\x7e]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

// Fits a title in the width, keeping its start and end when it's too long, as Amazon's labels do.
function fitTitle(title: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(title, size) <= width) {
    return title
  }
  let keep = title.length
  while (keep > 4) {
    keep--
    const head = Math.ceil(keep / 2)
    const text = `${title.slice(0, head).trimEnd()}...${title.slice(title.length - (keep - head)).trimStart()}`
    if (font.widthOfTextAtSize(text, size) <= width) {
      return text
    }
  }
  return title.slice(0, 4)
}

// The English name of an ISO 3166 country code, such as "China" for "CN", for a label's "Made in" line.
export function countryName(code: string | null | undefined) {
  if (!code) {
    return null
  }
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? null
  } catch {
    return null
  }
}

// The countries a label's "Made in" line names, such as "China" or "China and Pakistan"; null when none is known.
export function madeIn(codes: string | readonly string[] | null | undefined) {
  const names = [
    ...new Set((typeof codes === "string" ? [codes] : (codes ?? [])).map((code) => countryName(code)).filter(Boolean))
  ] as string[]
  if (names.length <= 1) {
    return names[0] ?? null
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}

// A sheet of 30 identical product labels in the layout of Fencing Club's glove labels: the code as a Code 128
// barcode with the code centered under it, then the product's title and "Made in" its country of origin when known,
// left-aligned with the barcode. The code is Amazon's FNSKU, or else the Shopify SKU.
export async function standardProductLabels({
  code: raw,
  title,
  countryOfOrigin
}: {
  code: string
  title: string
  // ISO 3166 code, as Shopify records it on the inventory item.
  // ISO 3166 codes: the item's own, or a bundle's components' in order. Several print as "Made in China and Pakistan".
  countryOfOrigin?: string | readonly string[] | null
}) {
  const code = printable(raw)
  const modules = code128Modules(code)
  const moduleCount = modules.reduce((sum, width) => sum + width, 0)
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  pdf.setTitle(`${code} product labels`)
  const page = pdf.addPage([sheet.width, sheet.height])
  const inset = 8
  const width = sheet.label - inset * 2
  const moduleWidth = Math.min(1, width / moduleCount)
  const barWidth = moduleCount * moduleWidth
  const name = fitTitle(printable(title), regular, 8, width)
  const country = madeIn(countryOfOrigin)
  const origin = country ? printable(`Made in ${country}`) : null
  const black = rgb(0, 0, 0)
  const text = (value: string, size: number, x: number, y: number) =>
    page.drawText(value, { x, y, size, font: regular, color: black })
  for (let row = 0; row < sheet.rows; row++) {
    for (let column = 0; column < sheet.columns; column++) {
      const left = sheet.left + column * sheet.pitch + inset
      const top = sheet.height - sheet.top - row * labelHeight
      const barTop = top - 14
      const barHeight = 14.5
      let bar = left
      modules.forEach((module, index) => {
        if (index % 2 === 0) {
          page.drawRectangle({
            x: bar,
            y: barTop - barHeight,
            width: module * moduleWidth,
            height: barHeight,
            color: black
          })
        }
        bar += module * moduleWidth
      })
      text(code, 6.5, left + (barWidth - regular.widthOfTextAtSize(code, 6.5)) / 2, barTop - barHeight - 8.5)
      text(name, 8, left, barTop - barHeight - 19)
      if (origin) {
        text(origin, 8, left, barTop - barHeight - 29)
      }
    }
  }
  return pdf.save()
}

// The warning US law and Amazon require on a polybag whose opening is 5 in (12.7 cm) or wider.
export const suffocationWarning =
  "To avoid danger of suffocation, keep plastic bags away from babies and children. Do not use this bag in cribs, beds, carriages or play pens. This bag is not a toy."

// Breaks words into lines no wider than width. The first word is set in the bold font.
function wrapWords(words: string[], width: number, size: number, regular: PDFFont, bold: PDFFont) {
  const lines: string[][] = [[]]
  let used = 0
  for (const [index, word] of words.entries()) {
    const font = index === 0 ? bold : regular
    const wordWidth = font.widthOfTextAtSize(word, size)
    const line = lines.at(-1)!
    const space = line.length ? regular.widthOfTextAtSize(" ", size) : 0
    if (line.length && used + space + wordWidth > width) {
      lines.push([word])
      used = wordWidth
    } else {
      line.push(word)
      used += space + wordWidth
    }
  }
  return lines
}

// A sheet of 30 suffocation warning labels on the same stock as the product labels: a warning triangle, then
// "WARNING:" in bold and the warning, as on the rectangular polybag warning stickers Amazon sellers use.
export async function suffocationWarningLabels() {
  const pdf = await PDFDocument.create()
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  pdf.setTitle("Suffocation warning labels")
  const page = pdf.addPage([sheet.width, sheet.height])
  const inset = 6
  const triangle = { width: 30, height: 26 }
  const textLeft = inset + triangle.width + 5
  const textWidth = sheet.label - textLeft - inset
  const words = ["WARNING:", ...suffocationWarning.split(" ")]
  // The largest size whose lines fit the label's height.
  let size = 10
  let lines = wrapWords(words, textWidth, size, regular, bold)
  while (size > 5 && lines.length * size * 1.15 > labelHeight - inset * 2) {
    size -= 0.25
    lines = wrapWords(words, textWidth, size, regular, bold)
  }
  const leading = size * 1.15
  const black = rgb(0, 0, 0)
  const white = rgb(1, 1, 1)
  const mark = bold.widthOfTextAtSize("!", 16)
  for (let row = 0; row < sheet.rows; row++) {
    for (let column = 0; column < sheet.columns; column++) {
      const left = sheet.left + column * sheet.pitch
      const top = sheet.height - sheet.top - row * labelHeight
      const middle = top - labelHeight / 2
      // An SVG path's y axis points down, from the point given.
      page.drawSvgPath(`M ${triangle.width / 2} 0 L ${triangle.width} ${triangle.height} L 0 ${triangle.height} Z`, {
        x: left + inset,
        y: middle + triangle.height / 2,
        color: black
      })
      page.drawText("!", {
        x: left + inset + (triangle.width - mark) / 2,
        y: middle - triangle.height / 2 + 3,
        size: 16,
        font: bold,
        color: white
      })
      // The block of lines is centered on the label, each line on its baseline.
      let y = middle + (lines.length * leading) / 2 - size
      let first = true
      for (const line of lines) {
        let x = left + textLeft
        for (const word of line) {
          const font = first ? bold : regular
          first = false
          page.drawText(word, { x, y, size, font, color: black })
          x += font.widthOfTextAtSize(word, size) + regular.widthOfTextAtSize(" ", size)
        }
        y -= leading
      }
    }
  }
  return pdf.save()
}

// The title printed on a label: the product's Shopify title, with its variant's options in parentheses unless it's the
// only variant, such as "Pro-Grip Fencing Glove (10, Left)".
export function labelTitle(product: string, variant: string | null) {
  if (!variant || variant === "Default Title") {
    return product
  }
  return `${product} (${variant.split(" / ").join(", ")})`
}
