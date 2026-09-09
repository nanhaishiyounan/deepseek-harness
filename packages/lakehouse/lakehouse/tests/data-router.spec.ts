/**
 * The data router's classification matrix: the lakehouse/kb destination for
 * every whitelisted extension, the magic-number conflicts, the mime fallback
 * for extension-less files, and the loud refusals (unknown type, empty body).
 */

import { describe, expect, it } from 'vitest'
import { DataRouterError, resolveDataRoute } from '../src/data-router.ts'

/** Latin-1 bytes for a text fixture. */
function textBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

/** A minimal ZIP local-file header (`PK\x03\x04`), the xlsx/docx magic. */
const ZIP_MAGIC = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00])

/** The PDF leading signature. */
const PDF_MAGIC = textBytes('%PDF-1.7\n')

describe('resolveDataRoute destinations', () => {
  it('routes the structured trio to the lakehouse with its format', () => {
    expect(resolveDataRoute('orders.csv', textBytes('id,amount\n1,2\n'))).toEqual({ destination: 'lakehouse', format: 'csv' })
    expect(resolveDataRoute('orders.CSV', textBytes('id,amount\n1,2\n'))).toEqual({ destination: 'lakehouse', format: 'csv' })
    expect(resolveDataRoute('orders.xlsx', ZIP_MAGIC)).toEqual({ destination: 'lakehouse', format: 'xlsx' })
    expect(resolveDataRoute('orders.json', textBytes('[{"id":1}]'))).toEqual({ destination: 'lakehouse', format: 'json' })
  })

  it('routes the document kinds to the kb with their extension', () => {
    expect(resolveDataRoute('note.md', textBytes('# note'))).toEqual({ destination: 'kb', extension: '.md' })
    expect(resolveDataRoute('note.txt', textBytes('plain'))).toEqual({ destination: 'kb', extension: '.txt' })
    expect(resolveDataRoute('report.pdf', PDF_MAGIC)).toEqual({ destination: 'kb', extension: '.pdf' })
    expect(resolveDataRoute('report.docx', ZIP_MAGIC)).toEqual({ destination: 'kb', extension: '.docx' })
  })

  it('is case-insensitive on the extension', () => {
    expect(resolveDataRoute('REPORT.PDF', PDF_MAGIC)).toEqual({ destination: 'kb', extension: '.pdf' })
    expect(resolveDataRoute('ORDERS.JSON', textBytes(' [] '))).toEqual({ destination: 'lakehouse', format: 'json' })
  })
})

describe('resolveDataRoute mime fallback', () => {
  it('classifies an extension-less file from its declared mime type', () => {
    expect(resolveDataRoute('orders', textBytes('id\n1\n'), 'text/csv')).toEqual({ destination: 'lakehouse', format: 'csv' })
    expect(resolveDataRoute('orders', textBytes('[{"id":1}]'), 'application/json')).toEqual({ destination: 'lakehouse', format: 'json' })
    expect(
      resolveDataRoute('orders', ZIP_MAGIC, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toEqual({ destination: 'lakehouse', format: 'xlsx' })
    expect(resolveDataRoute('report', PDF_MAGIC, 'application/pdf')).toEqual({ destination: 'kb', extension: '.pdf' })
    expect(resolveDataRoute('note', textBytes('hello'), 'text/plain')).toEqual({ destination: 'kb', extension: '.txt' })
    expect(resolveDataRoute('note', textBytes('hello'), 'text/markdown')).toEqual({ destination: 'kb', extension: '.md' })
  })

  it('still runs the magic-number gate on mime-classified files', () => {
    expect(() => resolveDataRoute('report', textBytes('not a pdf'), 'application/pdf')).toThrow(DataRouterError)
  })

  it('refuses an extension-less file with no recognized mime type', () => {
    expect(() => resolveDataRoute('blob', textBytes('whatever'), 'application/octet-stream')).toThrow(DataRouterError)
  })
})

describe('resolveDataRoute refusals', () => {
  it('refuses an empty body loudly regardless of the extension', () => {
    for (const filename of ['orders.csv', 'note.md', 'orders.json', 'no-ext']) {
      const failure = (() => {
        try {
          resolveDataRoute(filename, new Uint8Array(0))
        } catch (error: unknown) {
          return error as DataRouterError
        }
        expect.unreachable()
      })()
      expect(failure.reason).toBe('empty-file')
      expect(failure.filename).toBe(filename)
    }
  })

  it('refuses an extension outside the whitelist, naming the supported set', () => {
    for (const filename of ['archive.zip', 'photo.png', 'video.mp4', 'data.parquet', 'no-extension']) {
      let failure: DataRouterError | undefined
      try {
        resolveDataRoute(filename, textBytes('x'.repeat(16)))
      } catch (error: unknown) {
        failure = error as DataRouterError
      }
      expect(failure?.reason).toBe('unsupported-type')
      expect(failure?.message).toContain('.csv')
      expect(failure?.message).toContain('.md')
    }
  })

  it('refuses a magic number that contradicts the extension', () => {
    // A .pdf whose bytes are not a PDF.
    let pdfCase: DataRouterError | undefined
    try {
      resolveDataRoute('report.pdf', textBytes('<html>not a pdf</html>'))
    } catch (error: unknown) {
      pdfCase = error as DataRouterError
    }
    expect(pdfCase?.reason).toBe('type-mismatch')

    // An .xlsx that is not a ZIP container.
    let xlsxCase: DataRouterError | undefined
    try {
      resolveDataRoute('orders.xlsx', textBytes('id,amount\n'))
    } catch (error: unknown) {
      xlsxCase = error as DataRouterError
    }
    expect(xlsxCase?.reason).toBe('type-mismatch')

    // A .docx that is not a ZIP container.
    expect(() => resolveDataRoute('report.docx', PDF_MAGIC)).toThrow(DataRouterError)

    // A body shorter than the magic number itself.
    expect(() => resolveDataRoute('tiny.pdf', textBytes('PD'))).toThrow(DataRouterError)

    // A .json that holds a single object instead of a row array.
    let jsonCase: DataRouterError | undefined
    try {
      resolveDataRoute('orders.json', textBytes('{"id":1}'))
    } catch (error: unknown) {
      jsonCase = error as DataRouterError
    }
    expect(jsonCase?.reason).toBe('type-mismatch')
  })

  it('accepts a json body with leading whitespace before the array bracket', () => {
    expect(resolveDataRoute('orders.json', textBytes('\n\t [{"id":1}]'))).toEqual({ destination: 'lakehouse', format: 'json' })
  })
})
