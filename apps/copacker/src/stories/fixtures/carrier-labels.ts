// Example carrier labels for the carrier labels dialog, laid out like the 4 × 6 in labels bought through Shopify: FedEx
// Home Delivery and Ground Economy, USPS Priority Mail and Ground Advantage, DHL eCommerce Parcel Direct, and UPS,
// whose labels are pictures with no text to read. Each prints its weight and size the way that carrier does. The
// tracking numbers are made up with valid check digits, and the only addresses are Amazon's and a made-up sender's.
//
// Stories use each page's text and an SVG drawing of it. scripts/carrier-label-examples.ts draws the same layouts into
// the PDFs in carrier-labels/, with real barcodes, for the story that reads PDFs as the browser does.

// The shipment the examples are for: cartons A1 to A16 are 60 × 40 × 40 cm and 12.4 kg, B1 to B8 60 × 40 × 50 cm and
// 15.2 kg.
type Configuration = "a" | "b"
const printed = {
  a: {
    pounds: "27.40 LB",
    poundsAndOunces: "27 lb 6 oz",
    roundPounds: "28 LB",
    inches: "24 X 16 X 16 IN",
    dwt: "24,16,16"
  },
  b: {
    pounds: "33.50 LB",
    poundsAndOunces: "33 lb 8 oz",
    roundPounds: "34 LB",
    inches: "24 X 16 X 20 IN",
    dwt: "24,20,16"
  }
} as const

type Carrier = "fedex-home" | "fedex-economy" | "usps-priority" | "usps-ground" | "dhl" | "ups-ground" | "ups-3-day"
export type ExampleLabel = {
  carrier: Carrier
  // The number the dialog reads, or the one printed on a picture.
  trackingNumber: string
  configuration?: Configuration
  // The USPS number for the last leg, which FedEx Ground Economy labels print below their own.
  lastLeg?: string
}

export type LayoutItem =
  | {
      kind: "text"
      text: string
      x: number
      y: number
      size: number
      bold?: boolean
      white?: boolean
      center?: boolean
    }
  | { kind: "box"; x: number; y: number; width: number; height: number }
  | {
      kind: "barcode"
      format: "Code128" | "PDF417" | "MaxiCode"
      data: string
      x: number
      y: number
      width: number
      height: number
    }

// Points on a 4 × 6 in page, from its top left. Text is placed by its baseline.
export const pageSize = { width: 288, height: 432 }

const sender = ["COPACKER TEST CO", "(541) 555-0100", "100 EXAMPLE ST", "SPRINGFIELD OR 97477"]
const amazon = ["AMAZON.COM SERVICES LLC", "ONT8", "24300 NANDINA AVE", "MORENO VALLEY CA 92551-9534"]
const grouped = (value: string, size = 4) => value.match(new RegExp(`.{1,${size}}`, "g"))?.join(" ") ?? value
const ups = (value: string) =>
  [
    value.slice(0, 2),
    value.slice(2, 5),
    value.slice(5, 8),
    value.slice(8, 10),
    value.slice(10, 14),
    value.slice(14)
  ].join(" ")
const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  options: { bold?: boolean; white?: boolean; center?: boolean } = {}
): LayoutItem => ({
  kind: "text",
  text: value,
  x,
  y,
  size,
  ...options
})
const rule = (y: number, height = 1.5): LayoutItem => ({ kind: "box", x: 0, y, width: pageSize.width, height })
const lines = (values: readonly string[], x: number, y: number, size: number, leading: number, bold = false) =>
  values.map((value, index) => text(value, x, y + index * leading, size, { bold }))
// A USPS Intelligent Mail package barcode: 420, the ZIP code, then the tracking number.
const impb = (trackingNumber: string) => `42092551${trackingNumber}`

function fedexHome({ trackingNumber, configuration = "a" }: ExampleLabel): LayoutItem[] {
  return [
    ...lines(sender, 7, 12, 6.5, 7.5),
    text("SHIP DATE: 20OCT26", 169, 12, 6.5),
    text(`ACTWGT: ${printed[configuration].pounds}`, 169, 19, 6.5),
    text("CAD: 116604391/TAAS3400", 169, 26, 6.5),
    text(`DIMMED: ${printed[configuration].inches}`, 169, 33, 6.5),
    text("BILL SENDER", 169, 46, 6.5),
    text("TO", 7, 66, 7, { bold: true }),
    ...lines(amazon, 20, 66, 9, 11, true),
    text("(800) 555-0199", 20, 110, 7),
    text("REF: PO42 SHIPMENT 1", 115, 124, 6.5),
    rule(130),
    { kind: "barcode", format: "PDF417", data: `[)>0102${trackingNumber}92551`, x: 7, y: 138, width: 150, height: 48 },
    text("FedEx", 226, 160, 18, { bold: true }),
    text("Home Delivery", 226, 169, 7),
    rule(200),
    text("TRK#", 7, 222, 8, { bold: true }),
    text(grouped(trackingNumber), 32, 224, 14, { bold: true }),
    text("[0221]", 250, 222, 8),
    text("XH MVYA", 7, 250, 16, { bold: true }),
    text("92551", 220, 250, 12, { bold: true }),
    text("CA-US ONT", 214, 262, 9),
    rule(270),
    {
      kind: "barcode",
      format: "Code128",
      data: `9622001900000${trackingNumber.padStart(21, "0")}`,
      x: 20,
      y: 282,
      width: 248,
      height: 96
    },
    rule(392)
  ]
}

function fedexEconomy({ trackingNumber, lastLeg = "" }: ExampleLabel): LayoutItem[] {
  return [
    ...lines(sender, 7, 12, 7, 8),
    text("CUST REF: PO42-SHIPMENT-1", 9, 60, 9),
    rule(70),
    {
      kind: "barcode",
      format: "Code128",
      data: `9612019${trackingNumber.padStart(15, "0")}`,
      x: 20,
      y: 80,
      width: 248,
      height: 70
    },
    text(`FedEx Tracking ID# ${grouped(trackingNumber)}`, 144, 166, 12, { bold: true, center: true }),
    rule(176),
    text("Parcel Select", 224, 196, 8),
    text("U.S. Postage Paid", 217, 205, 8),
    text("FedEx Ground", 222, 214, 8),
    text("USPS DELIVER TO:", 9, 196, 10, { bold: true }),
    ...lines(amazon, 9, 212, 9, 11),
    rule(262),
    text("USPS TRACKING # e-VS", 144, 280, 12, { bold: true, center: true }),
    { kind: "barcode", format: "Code128", data: impb(lastLeg), x: 30, y: 290, width: 228, height: 90 },
    text(grouped(lastLeg), 144, 398, 11, { bold: true, center: true })
  ]
}

function usps({ carrier, trackingNumber, configuration = "a" }: ExampleLabel): LayoutItem[] {
  const priority = carrier === "usps-priority"
  return [
    { kind: "box", x: 7, y: 8, width: 58, height: 58 },
    text(priority ? "P" : "G", 36, 54, 44, { bold: true, white: true, center: true }),
    text("usps.com", 76, 40, 7),
    text("US POSTAGE", 76, 58, 6),
    text("U.S. POSTAGE PAID", 175, 70, 9, { bold: true }),
    text("USPS Ship", 176, 78, 5),
    text(printed[configuration].poundsAndOunces, 76, 101, 7),
    text("Mailed from 97477", 158, 101, 7),
    rule(110, 2),
    text(priority ? "PRIORITY MAIL®" : "USPS GROUND ADVANTAGE™", 144, 126, 15, { bold: true, center: true }),
    rule(132, 2),
    ...lines(sender, 7, 146, 7, 8),
    text("SHIP TO:", 12, 196, 7),
    ...lines(amazon, 50, 196, 10, 12, true),
    rule(260, 2),
    text("USPS TRACKING # USPS Ship", 144, 278, 11, { bold: true, center: true }),
    { kind: "barcode", format: "Code128", data: impb(trackingNumber), x: 30, y: 286, width: 228, height: 82 },
    text(grouped(trackingNumber), 144, 384, 11, { bold: true, center: true }),
    rule(392, 2)
  ]
}

function dhl({ trackingNumber, configuration = "a" }: ExampleLabel): LayoutItem[] {
  return [
    { kind: "box", x: 7, y: 8, width: 58, height: 58 },
    text("G", 36, 54, 44, { bold: true, white: true, center: true }),
    text("USPS Ground", 218, 23, 7),
    text("Advantage", 223, 31, 7),
    text("US Postage Paid", 216, 38, 7),
    text("DHL eCommerce", 216, 45, 7),
    text("USPS Ship", 225, 53, 7),
    text("USPS GROUND ADVANTAGE", 144, 92, 14, { bold: true, center: true }),
    ...lines(sender, 7, 108, 6, 7),
    text("Ship Date: 2026-10-20", 223, 117, 5),
    text("Mailed From: 97477", 223, 124, 5),
    text(printed[configuration].roundPounds, 223, 132, 5),
    text("USPS DELIVER TO:", 23, 160, 11, { bold: true }),
    ...lines(amazon, 23, 176, 10, 12, true),
    rule(226, 2),
    text("USPS TRACKING # USPS Ship", 144, 242, 12, { bold: true, center: true }),
    { kind: "barcode", format: "Code128", data: impb(trackingNumber), x: 30, y: 250, width: 228, height: 80 },
    text(grouped(trackingNumber), 144, 346, 12, { bold: true, center: true }),
    rule(356, 2),
    text("DHL eCommerce", 11, 384, 14, { bold: true }),
    text(`PackageID: GM${trackingNumber.slice(-14)}`, 11, 424, 8)
  ]
}

function upsLabel({ carrier, trackingNumber, configuration = "a" }: ExampleLabel): LayoutItem[] {
  return [
    ...lines(sender, 7, 12, 7, 8),
    text(printed[configuration].roundPounds.replace("LB", "LBS"), 196, 14, 10, { bold: true }),
    text("1 OF 1", 246, 14, 10, { bold: true }),
    text(`DWT: ${printed[configuration].dwt}`, 196, 26, 7),
    text("SHIP TO:", 7, 56, 7),
    ...lines(amazon, 20, 68, 10, 12, true),
    rule(116, 2),
    {
      kind: "barcode",
      format: "MaxiCode",
      data: `[)>\u001e01\u001d96925519534\u001d840\u001d003\u001d${trackingNumber}`,
      x: 7,
      y: 122,
      width: 86,
      height: 82
    },
    text("CA 925 9-01", 112, 152, 22, { bold: true }),
    { kind: "barcode", format: "Code128", data: "42092551", x: 112, y: 160, width: 150, height: 40 },
    rule(208, 3),
    text(carrier === "ups-3-day" ? "UPS 3 DAY SELECT" : "UPS GROUND", 7, 232, 18, { bold: true }),
    text(`TRACKING #: ${ups(trackingNumber)}`, 7, 248, 9, { bold: true }),
    rule(256, 1.5),
    { kind: "barcode", format: "Code128", data: trackingNumber, x: 30, y: 266, width: 228, height: 92 },
    rule(366, 3),
    text("BILLING: P/P", 7, 382, 8, { bold: true }),
    text("REF 1: PO42 SHIPMENT 1", 7, 394, 8)
  ]
}

// How each kind of label is laid out.
export function exampleLayout(label: ExampleLabel): LayoutItem[] {
  switch (label.carrier) {
    case "fedex-home":
      return fedexHome(label)
    case "fedex-economy":
      return fedexEconomy(label)
    case "usps-priority":
    case "usps-ground":
      return usps(label)
    case "dhl":
      return dhl(label)
    case "ups-ground":
    case "ups-3-day":
      return upsLabel(label)
  }
}

// Whether a label is only a picture, as UPS labels bought through Shopify are.
export const isPicture = ({ carrier }: ExampleLabel) => carrier === "ups-ground" || carrier === "ups-3-day"

// What reading the page's text gives: a line for each run of text, and nothing for a picture.
export function exampleText(label: ExampleLabel) {
  return isPicture(label)
    ? ""
    : exampleLayout(label)
        .flatMap((item) => (item.kind === "text" ? [item.text] : []))
        .join("\n")
}

// The values of the page's Code 128 barcodes, as reading them gives.
export function exampleBarcodes(label: ExampleLabel) {
  return exampleLayout(label).flatMap((item) =>
    item.kind === "barcode" && item.format === "Code128" ? [item.data] : []
  )
}

const escape = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
// Stand-in bars for a barcode in a drawing: the stories never decode them. The PDFs have real ones.
function stripes(item: Extract<LayoutItem, { kind: "barcode" }>) {
  const codes = [...item.data].map((char) => char.charCodeAt(0))
  if (item.format !== "Code128") {
    const cells = 18
    const size = Math.min(item.width, item.height) / cells
    return Array.from({ length: cells * cells }, (_, cell) =>
      (codes[cell % codes.length]! + cell * 7) % 3 === 0
        ? `<rect x="${item.x + (cell % cells) * size}" y="${item.y + Math.floor(cell / cells) * size}" width="${size}" height="${size}"/>`
        : ""
    ).join("")
  }
  const widths = codes.flatMap((code) => [1, 2, 4, 8].map((step) => 1 + (Math.floor(code / step) % 3)))
  const total = widths.reduce((sum, width) => sum + width, 0)
  let x = 0
  return widths
    .map((width, index) => {
      const bar =
        index % 2
          ? ""
          : `<rect x="${item.x + (x * item.width) / total}" y="${item.y}" width="${(width * item.width) / total}" height="${item.height}"/>`
      x += width
      return bar
    })
    .join("")
}

// A drawing of the label, as an SVG data URL, for the lists and the preview.
export function examplePicture(label: ExampleLabel) {
  const drawn = exampleLayout(label).map((item) => {
    if (item.kind === "text") {
      const anchor = item.center ? ' text-anchor="middle"' : ""
      const weight = item.bold ? ' font-weight="700"' : ""
      const fill = item.white ? ' fill="#fff"' : ""
      return `<text x="${item.x}" y="${item.y}" font-size="${item.size}"${anchor}${weight}${fill}>${escape(item.text)}</text>`
    }
    if (item.kind === "box") {
      return `<rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}"/>`
    }
    return stripes(item)
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageSize.width} ${pageSize.height}"><rect width="100%" height="100%" fill="#fff"/><g font-family="Arial, sans-serif">${drawn.join("")}</g></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

const fedex = [
  "778899011012",
  "778899011023",
  "778899011034",
  "778899011045",
  "778899011056",
  "778899011067",
  "778899011078",
  "778899011089",
  "778899011090"
]
const usps94 = [
  "9400111899561200030016",
  "9400111899561200030023",
  "9400111899561200030030",
  "9400111899561200030047",
  "9400111899561200030054",
  "9400111899561200030061",
  "9400111899561200030078",
  "9400111899561200030085",
  "9400111899561200030092",
  "9400111899561200030108",
  "9400111899561200030115",
  "9400111899561200030122",
  "9400111899561200030139",
  "9400111899561200030146",
  "9400111899561200030153"
]
const upsNumbers = [
  "1Z8W2A1E0303760148",
  "1Z8W2A1E0303770146",
  "1Z8W2A1E0303780144",
  "1Z8W2A1E1203790143",
  "1Z8W2A1E1203800140"
]

// The large shipment's labels: two PDFs from Shopify with a page for each label, and two UPS 3 Day Select labels in a
// file each. Twelve of the A cartons' labels and six of the B cartons' print a weight or size that fits only their
// configuration. The UPS pictures and the FedEx Ground Economy label print neither, so they wait in Not placed.
export const shipmentLabels: Record<string, ExampleLabel[]> = {
  "shopify-labels-1.pdf": [
    { carrier: "fedex-home", trackingNumber: fedex[0]!, configuration: "a" },
    { carrier: "usps-ground", trackingNumber: usps94[0]!, configuration: "a" },
    { carrier: "dhl", trackingNumber: usps94[1]!, configuration: "a" },
    { carrier: "ups-ground", trackingNumber: upsNumbers[0]!, configuration: "a" },
    { carrier: "fedex-home", trackingNumber: fedex[1]!, configuration: "a" },
    { carrier: "usps-priority", trackingNumber: usps94[2]!, configuration: "a" },
    { carrier: "fedex-home", trackingNumber: fedex[2]!, configuration: "a" },
    { carrier: "dhl", trackingNumber: usps94[3]!, configuration: "a" },
    { carrier: "ups-ground", trackingNumber: upsNumbers[1]!, configuration: "a" },
    { carrier: "fedex-economy", trackingNumber: fedex[3]!, lastLeg: usps94[4]! },
    { carrier: "usps-ground", trackingNumber: usps94[5]!, configuration: "a" },
    { carrier: "fedex-home", trackingNumber: fedex[4]!, configuration: "a" },
    { carrier: "dhl", trackingNumber: usps94[6]!, configuration: "a" },
    { carrier: "ups-ground", trackingNumber: upsNumbers[2]!, configuration: "a" },
    { carrier: "usps-priority", trackingNumber: usps94[7]!, configuration: "a" },
    { carrier: "fedex-home", trackingNumber: fedex[5]!, configuration: "a" }
  ],
  "shopify-labels-2.pdf": [
    { carrier: "fedex-home", trackingNumber: fedex[6]!, configuration: "b" },
    { carrier: "usps-priority", trackingNumber: usps94[8]!, configuration: "b" },
    { carrier: "dhl", trackingNumber: usps94[9]!, configuration: "b" },
    { carrier: "fedex-home", trackingNumber: fedex[7]!, configuration: "b" },
    { carrier: "usps-priority", trackingNumber: usps94[10]!, configuration: "b" },
    { carrier: "usps-ground", trackingNumber: usps94[11]!, configuration: "b" }
  ],
  "ups-3-day-select-1.pdf": [{ carrier: "ups-3-day", trackingNumber: upsNumbers[3]!, configuration: "b" }],
  "ups-3-day-select-2.pdf": [{ carrier: "ups-3-day", trackingNumber: upsNumbers[4]!, configuration: "b" }]
}

// A small shipment's labels, a file each from three carriers, all fitting one configuration.
export const fewLabels: Record<string, ExampleLabel[]> = {
  "fedex-home-delivery.pdf": [{ carrier: "fedex-home", trackingNumber: fedex[8]!, configuration: "a" }],
  "usps-priority-mail.pdf": [{ carrier: "usps-priority", trackingNumber: usps94[12]!, configuration: "a" }],
  "dhl-ecommerce.pdf": [{ carrier: "dhl", trackingNumber: usps94[13]!, configuration: "b" }]
}
