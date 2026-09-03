/**
 * Document-to-text extraction for the extended ingest channels. PDF bytes go
 * through unpdf (a serverless pdf.js build), docx bytes through mammoth's
 * HTML projection, and every HTML source — mammoth output or a fetched page —
 * through the structured text extractor, which keeps heading levels and list
 * items so the seam's structure-aware chunker still sees a document outline.
 * The parsing libraries load lazily: compositions that never ingest PDF or
 * docx files never pay for pdf.js.
 * @module @deepseek-ai/dsh-tool-kb/extract
 */

import { Buffer } from 'node:buffer'
import { parse, TextNode, type Node } from 'node-html-parser'

/** Elements whose entire subtree carries no document text. */
const SKIP_TAGS = new Set(['script', 'style', 'head', 'title', 'noscript', 'template'])
/** Heading tags mapped to their markdown-style level. */
const HEADING_LEVELS: ReadonlyMap<string, number> = new Map([
  ['h1', 1], ['h2', 2], ['h3', 3], ['h4', 4], ['h5', 5], ['h6', 6],
])
/** Inline elements whose text joins its siblings on one line. */
const INLINE_TAGS = new Set([
  'span', 'a', 'b', 'i', 'em', 'strong', 'u', 's', 'code', 'small', 'mark', 'sub', 'sup', 'abbr', 'time',
])

function tagName(node: Node): string | undefined {
  // The declared type says non-null, but parse() hands out nodes whose
  // rawTagName is null at runtime; the cast restores the honest domain.
  /* v8 ignore next -- only reachable on a parser-internal null tag; every real node names its tag. */
  return 'rawTagName' in node ? (node.rawTagName as string | null)?.toLowerCase() : undefined
}

function isTextNode(node: Node): node is TextNode {
  return node instanceof TextNode
}

/** Concatenate the inline text under one node without introducing block breaks. */
function collectInline(node: Node): string {
  if (isTextNode(node)) return node.text
  const tag = tagName(node)
  if (tag !== undefined && SKIP_TAGS.has(tag)) return ''
  return node.childNodes.map(collectInline).join('')
}

/** Render one node's subtree into structured text lines. */
function renderLines(node: Node): string[] {
  const tag = tagName(node)
  if (tag !== undefined && SKIP_TAGS.has(tag)) return []
  // node-html-parser keeps doctype and stray declarations as text nodes.
  if (isTextNode(node)) {
    const text = node.text.replace(/\s+/gu, ' ').trim()
    return text.startsWith('<!') || text.length === 0 ? [] : [text]
  }
  if (tag !== undefined) {
    const level = HEADING_LEVELS.get(tag)
    if (level !== undefined) {
      const text = collectInline(node).replace(/\s+/gu, ' ').trim()
      return text.length > 0 ? [`${'#'.repeat(level)} ${text}`] : []
    }
    if (tag === 'li') {
      const text = collectInline(node).replace(/\s+/gu, ' ').trim()
      return text.length > 0 ? [`- ${text}`] : []
    }
    if (INLINE_TAGS.has(tag)) {
      const text = collectInline(node).replace(/\s+/gu, ' ').trim()
      return text.length > 0 ? [text] : []
    }
  }
  return node.childNodes.flatMap(renderLines)
}

/**
 * Convert one HTML document into structured plain text: headings become
 * markdown-style `#` prefix lines (preserving the outline the chunker splits
 * on), list items become `- ` lines, script/style subtrees drop out, and
 * entities decode to their characters.
 * @param html - the raw HTML document.
 * @returns the structured text, one block per line.
 */
export function htmlToStructuredText(html: string): string {
  // node-html-parser re-parses decoded "&lt;"/"&gt;" as tags, swallowing the
  // text between them; park those two entities in the private-use area for
  // the parse and restore them in the output.
  const parked = html.replaceAll('&lt;', '\uE000').replaceAll('&gt;', '\uE001')
  return renderLines(parse(parked)).filter(line => line.length > 0).join('\n').replaceAll('\uE000', '<').replaceAll('\uE001', '>')
}

/**
 * Extract the text layer of one PDF document.
 * @param bytes - the raw PDF file bytes.
 * @returns the concatenated page text.
 * @throws when the bytes are not a parseable PDF or carry no text layer.
 */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf')
  try {
    // unpdf rejects Buffer instances (a Uint8Array subclass) at its boundary;
    // copy into a plain Uint8Array so every caller-visible type works.
    const pdf = await getDocumentProxy(new Uint8Array(bytes))
    const { text } = await extractText(pdf, { mergePages: true })
    return text
  } catch (cause: unknown) {
    throw new Error(`kb_ingest: PDF text extraction failed: ${String(cause)}`, { cause })
  }
}

/**
 * Extract the text of one Word document through mammoth's HTML projection,
 * keeping heading structure for the chunker.
 * @param bytes - the raw .docx package bytes.
 * @returns the structured document text.
 * @throws when the bytes are not a parseable docx package.
 */
export async function extractDocxText(bytes: Uint8Array): Promise<string> {
  const mammoth = (await import('mammoth')).default
  try {
    const { value } = await mammoth.convertToHtml({ buffer: Buffer.from(bytes) })
    return htmlToStructuredText(value)
  } catch (cause: unknown) {
    throw new Error(`kb_ingest: docx text extraction failed: ${String(cause)}`, { cause })
  }
}
