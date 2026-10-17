import type { Nodes, PhrasingContent, Root } from "mdast"
import remarkParse from "remark-parse"
import { unified } from "unified"

type Run = { text: string; bold?: boolean; italic?: boolean }
type MarkdownBlock = { runs: Run[]; indent: number; marker?: string }
const parser = unified().use(remarkParse)

// Both react-markdown and this PDF adapter use remark's CommonMark parser. This adapter
// only lays out its syntax tree; it does not parse Markdown or evaluate HTML.
export function markdownBlocks(source: string): MarkdownBlock[] {
  const tree: Root = parser.parse(source)
  const definitions = new Map(
    tree.children.filter((node) => node.type === "definition").map((node) => [node.identifier, node.url])
  )
  const runs = (nodes: PhrasingContent[], style: Omit<Run, "text"> = {}): Run[] =>
    nodes.flatMap((node): Run[] => {
      switch (node.type) {
        case "text":
          return [{ ...style, text: node.value.replace(/\s+/g, " ") }]
        case "inlineCode":
          return [{ ...style, text: node.value }]
        case "break":
          return [{ ...style, text: "\n" }]
        case "strong":
          return runs(node.children, { ...style, bold: true })
        case "emphasis":
          return runs(node.children, { ...style, italic: true })
        case "link":
        case "linkReference": {
          const text = runs(node.children, style)
          const url = node.type === "link" ? node.url : definitions.get(node.identifier)
          return url && /^(https?:|mailto:)/i.test(url) ? [...text, { ...style, text: ` (${url})` }] : text
        }
        case "image":
        case "imageReference":
          return [{ ...style, text: node.alt ?? "" }]
        case "html":
          return []
        default:
          return "children" in node ? runs(node.children, style) : []
      }
    })
  const blocks = (nodes: Nodes[], indent = 0): MarkdownBlock[] =>
    nodes.flatMap((node): MarkdownBlock[] => {
      switch (node.type) {
        case "paragraph":
          return [{ runs: runs(node.children), indent }]
        case "heading":
          return [{ runs: runs(node.children, { bold: true }), indent }]
        case "code":
          return [{ runs: [{ text: node.value }], indent }]
        case "blockquote":
          return blocks(node.children, indent + 1)
        case "list":
          return node.children.flatMap((item, index) => {
            const contents = blocks(item.children, indent + 1)
            const marker = node.ordered ? `${(node.start ?? 1) + index}.` : "\u2022"
            const first = contents[0]
            return first && first.indent === indent + 1
              ? [{ ...first, marker }, ...contents.slice(1)]
              : [{ runs: [], indent: indent + 1, marker }, ...contents]
          })
        default:
          return []
      }
    })
  return blocks(tree.children)
}
