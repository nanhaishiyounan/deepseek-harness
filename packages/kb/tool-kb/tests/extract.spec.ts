/**
 * Document-to-text extraction for the extended ingest channels: PDF bytes
 * through unpdf, docx bytes through mammoth, and HTML through the structured
 * text extractor. Fixtures are deterministic generated files under
 * tests/fixtures/docs.
 */
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { extractDocxText, extractPdfText, htmlToStructuredText } from '../src/extract.ts'

const here = dirname(fileURLToPath(import.meta.url))

async function fixtureBytes(name: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(here, 'fixtures/docs', name)))
}

async function fixtureText(name: string): Promise<string> {
  return readFile(join(here, 'fixtures/docs', name), 'utf8')
}

describe('htmlToStructuredText', () => {
  it('renders headings as markdown-style prefix lines and keeps paragraph text', async () => {
    const out = htmlToStructuredText(await fixtureText('page.html'))
    expect(out).toContain('# GB 2760 food additive standard')
    expect(out).toContain('Food additives must not mask spoilage of the final product.')
  })

  it('drops script and style content', async () => {
    const out = htmlToStructuredText(await fixtureText('page.html'))
    expect(out).not.toContain('should never appear')
    expect(out).not.toContain('color: red')
  })

  it('renders list items as dash lines', async () => {
    const out = htmlToStructuredText(await fixtureText('page.html'))
    expect(out).toContain('- Minimize usage to achieve the intended effect.')
    expect(out).toContain('- Carry-over principle applies to compound ingredients.')
  })

  it('decodes entities and collapses blank runs', () => {
    const out = htmlToStructuredText('<body><p>rock &amp; roll</p><p>soy &lt;sauce&gt;</p></body>')
    expect(out).toContain('rock & roll')
    expect(out).toContain('soy <sauce>')
    expect(out).not.toMatch(/\n{3,}/u)
  })

  it('nests subheadings under deeper prefix levels', () => {
    const out = htmlToStructuredText('<h1>标准</h1><h2>使用原则</h2><p>正文。</p>')
    expect(out).toContain('# 标准')
    expect(out).toContain('## 使用原则')
  })

  it('drops the doctype declaration', () => {
    expect(htmlToStructuredText('<!doctype html><html><body><p>正文。</p></body></html>')).not.toContain('doctype')
  })

  it('drops empty inline, heading, and list elements', () => {
    expect(htmlToStructuredText('<p><span>  </span></p><h2></h2><ul><li> </li></ul>')).toBe('')
  })

  it('drops script subtrees nested inside headings', () => {
    expect(htmlToStructuredText('<h1>title<script>evil()</script></h1>')).toBe('# title')
  })

  it('keeps non-empty inline elements as one line', () => {
    expect(htmlToStructuredText('<p><b>bold</b> and <i>italic</i></p>')).toBe('bold\nand\nitalic')
  })

  it('returns an empty string for bodyless markup', () => {
    expect(htmlToStructuredText('<html><head><title>t</title></head></html>').trim()).toBe('')
  })
})

describe('extractPdfText', () => {
  it('extracts the text layer of the deterministic sample', async () => {
    const out = await extractPdfText(await fixtureBytes('sample.pdf'))
    expect(out).toContain('Hongfa Food supplier visit summary.')
    expect(out).toContain('White sugar procurement price is rising monthly.')
  })

  it('fails loud on bytes that are not a PDF', async () => {
    await expect(extractPdfText(new TextEncoder().encode('not a pdf at all'))).rejects.toThrow(/pdf/iu)
  })
})

describe('extractDocxText', () => {
  it('extracts headings and paragraphs from the deterministic sample', async () => {
    const out = await extractDocxText(await fixtureBytes('sample.docx'))
    expect(out).toContain('Lvyuan Ingredients quality audit')
    expect(out).toContain('Sorghum protein content reached 9.2 percent this season.')
  })

  it('fails loud on bytes that are not a docx package', async () => {
    await expect(extractDocxText(new TextEncoder().encode('not a zip'))).rejects.toThrow()
  })
})
