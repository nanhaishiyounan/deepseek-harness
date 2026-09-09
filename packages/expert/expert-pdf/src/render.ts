/**
 * Pure-function typesetting: {@link renderPdf} turns one {@link DraftSpec}
 * into proposal PDF bytes — a cover page (title, client, expert byline, date,
 * order number), one body page flow per section (heading, wrapped CJK/latin
 * paragraphs, reference lines), a closing disclaimer, and a page header
 * (order number + title) and footer (page x of y) on every body page. The
 * Noto Sans SC font is subset-embedded at save time, so the output stays
 * proportional to the glyphs actually used. No LLM, filesystem writes, or
 * plugin services here: bytes in, bytes out.
 * @module @deepseek-ai/dsh-expert-pdf/render
 */

import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fontkit from '@pdf-lib/fontkit'
import { PDFDocument, rgb } from 'pdf-lib'
import type { PDFFont, PDFPage } from 'pdf-lib'
import { DEFAULT_DISCLAIMER } from './constants.ts'
import type { DraftSpec } from './types.ts'

export { DEFAULT_DISCLAIMER } from './constants.ts'

/** The embedded CJK font face's PostScript name prefix (asserted in round-trips). */
export const FONT_NAME = 'NotoSansSC'

/** Page geometry: A4 with a comfortable reading column. */
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN_X = 56
const MARGIN_TOP = 64
const MARGIN_BOTTOM = 72
const COLUMN_WIDTH = PAGE_WIDTH - MARGIN_X * 2

/** Body typography (points). */
const HEADING_SIZE = 14
const BODY_SIZE = 10.5
const BODY_LINE_HEIGHT = 18
const REF_SIZE = 9
const REF_LINE_HEIGHT = 13
const HEADING_GAP_BEFORE = 18
const HEADING_GAP_AFTER = 10
const PARAGRAPH_GAP = 8
const REF_GAP_BEFORE = 6

/** Ink palette: near-black body, gray chrome. */
const INK = rgb(0.11, 0.13, 0.16)
const CHROME = rgb(0.45, 0.48, 0.52)

/**
 * The bundled Noto Sans SC Regular (SIL OFL 1.1, see
 * resources/fonts/LICENSE), located relative to this module so both the
 * `src/` and built `lib/` placements resolve the package copy.
 */
const FONT_PATH = join(dirname(fileURLToPath(import.meta.url)), '../resources/fonts/NotoSansSC-Regular.otf')

/**
 * Wrap one text block for a column of `maxWidth` at one font size. Explicit
 * newlines are hard breaks; CJK code units wrap per character while runs of
 * latin word characters stay atomic, and no character is dropped or replaced
 * (the wrapped lines join back to the input exactly).
 * @param text - the text block, possibly containing newlines.
 * @param font - the measuring font.
 * @param size - the font size both wrapping and the caller's draw use.
 * @param maxWidth - the column width budget in points.
 * @returns the wrapped lines; an empty input yields one empty line.
 */
export function wrapCjkText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph.length === 0) {
      lines.push('')
      continue
    }
    // One wrap unit: a single non-word code unit, or a maximal run of latin
    // word characters (letters, digits, and in-word punctuation).
    const units = paragraph.match(/[\p{L}\p{N}@._-]+|[^\p{L}\p{N}]/gu) ?? []
    let current = ''
    let currentWidth = 0
    for (const unit of units) {
      const unitWidth = font.widthOfTextAtSize(unit, size)
      if (currentWidth > 0 && currentWidth + unitWidth > maxWidth) {
        lines.push(current)
        current = unit
        currentWidth = unitWidth
        continue
      }
      current += unit
      currentWidth += unitWidth
    }
    lines.push(current)
  }
  return lines
}

/** One running body page: draws text downward, opening pages as the column fills. */
class BodyFlow {
  private page: PDFPage
  private y = PAGE_HEIGHT - MARGIN_TOP

  constructor(
    private readonly doc: PDFDocument,
    private readonly font: PDFFont,
    private readonly spec: DraftSpec,
  ) {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.drawHeader(this.page)
  }

  /** Open a new page with the running header. */
  private breakPage(): void {
    this.page = this.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
    this.y = PAGE_HEIGHT - MARGIN_TOP
    this.drawHeader(this.page)
  }

  /** The running header: order number and title, small and gray. */
  private drawHeader(page: PDFPage): void {
    const left = this.spec.orderNo
    page.drawText(left, { x: MARGIN_X, y: PAGE_HEIGHT - 40, size: 8, font: this.font, color: CHROME })
    const title = this.spec.title
    const width = this.font.widthOfTextAtSize(title, 8)
    page.drawText(title, { x: PAGE_WIDTH - MARGIN_X - width, y: PAGE_HEIGHT - 40, size: 8, font: this.font, color: CHROME })
  }

  /** Ensure `needed` points of column remain, breaking the page otherwise. */
  private ensure(needed: number): void {
    if (this.y - needed < MARGIN_BOTTOM) this.breakPage()
  }

  /** Draw one wrapped text block at a size/line-height, returning after vertical gap. */
  private drawWrapped(text: string, size: number, lineHeight: number, color = INK, gapAfter: number, indentX = 0): void {
    const lines = wrapCjkText(text, this.font, size, COLUMN_WIDTH - indentX)
    for (const line of lines) {
      this.ensure(lineHeight)
      if (line.length > 0) {
        this.page.drawText(line, { x: MARGIN_X + indentX, y: this.y - size, size, font: this.font, color })
      }
      this.y -= lineHeight
    }
    this.y -= gapAfter
  }

  /** Typeset one section: heading, paragraphs, then the reference list. */
  section(heading: string, paragraphs: readonly string[], refs: readonly string[]): void {
    this.ensure(BODY_SIZE + HEADING_GAP_BEFORE + HEADING_GAP_AFTER)
    this.y -= HEADING_GAP_BEFORE
    this.page.drawText(heading, { x: MARGIN_X, y: this.y - HEADING_SIZE, size: HEADING_SIZE, font: this.font, color: INK })
    this.y -= HEADING_SIZE + HEADING_GAP_AFTER
    for (const paragraph of paragraphs) {
      if (paragraph.length === 0) {
        this.y -= PARAGRAPH_GAP
        continue
      }
      this.drawWrapped(paragraph, BODY_SIZE, BODY_LINE_HEIGHT, INK, PARAGRAPH_GAP)
    }
    if (refs.length > 0) {
      this.y -= REF_GAP_BEFORE
      for (const ref of refs) {
        this.drawWrapped(`· ${ref}`, REF_SIZE, REF_LINE_HEIGHT, CHROME, 2)
      }
    }
  }

  /** Typeset the closing disclaimer at the foot of the last body page. */
  disclaimer(text: string): void {
    this.ensure(REF_SIZE * 2 + REF_LINE_HEIGHT * 2)
    this.y -= 12
    this.page.drawLine({
      start: { x: MARGIN_X, y: this.y },
      end: { x: PAGE_WIDTH - MARGIN_X, y: this.y },
      thickness: 0.5,
      color: CHROME,
    })
    this.y -= 6
    this.drawWrapped(text, REF_SIZE, REF_LINE_HEIGHT, CHROME, 0)
  }
}

/**
 * Typeset one proposal into PDF bytes.
 * @param spec - the complete typesetting input.
 * @returns the saved PDF bytes (subset-embedded Noto Sans SC).
 */
export async function renderPdf(spec: DraftSpec): Promise<Uint8Array> {
  const fontBytes = await readFile(FONT_PATH)
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(fontBytes, { subset: true })

  // Cover page: title, client, expert byline, date, order number.
  const cover = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const drawCentered = (text: string, y: number, size: number, color = INK): void => {
    const width = font.widthOfTextAtSize(text, size)
    cover.drawText(text, { x: (PAGE_WIDTH - width) / 2, y, size, font, color })
  }
  drawCentered(spec.title, PAGE_HEIGHT - 260, 22)
  drawCentered(spec.client, PAGE_HEIGHT - 320, 13)
  drawCentered(`${spec.expert.name}${spec.expert.org === undefined ? '' : ` · ${spec.expert.org}`}`, PAGE_HEIGHT - 360, 12, CHROME)
  drawCentered(spec.date, PAGE_HEIGHT - 392, 11, CHROME)
  drawCentered(`订单编号：${spec.orderNo}`, PAGE_HEIGHT - 424, 10, CHROME)

  // Body flow: sections in order, then the closing disclaimer.
  const flow = new BodyFlow(doc, font, spec)
  for (const section of spec.sections) {
    flow.section(section.heading, section.paragraphs, section.refs ?? [])
  }
  flow.disclaimer(spec.disclaimer ?? DEFAULT_DISCLAIMER)

  // Footer chrome: page x of y over the body pages (cover uncounted).
  const pages = doc.getPages()
  const bodyPages = pages.slice(1)
  for (const [index, page] of bodyPages.entries()) {
    const label = `第 ${index + 1} 页 / 共 ${bodyPages.length} 页`
    const width = font.widthOfTextAtSize(label, REF_SIZE)
    page.drawText(label, { x: (PAGE_WIDTH - width) / 2, y: 36, size: REF_SIZE, font, color: CHROME })
  }

  return doc.save()
}
