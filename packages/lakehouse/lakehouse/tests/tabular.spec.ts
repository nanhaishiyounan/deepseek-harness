/**
 * The structured-body parsers' behavior: csv RFC-4180 decoding with column
 * type inference, json row-array decoding with first-seen column order and
 * kind-consistency refusals, xlsx first-sheet decoding over an injected
 * workbook reader, and the table-name derivation from source file names.
 */

import { describe, expect, it } from 'vitest'
import { parseCsvTabular, parseJsonTabular, parseXlsxTabular, tableNameFromFilename, type XlsxWorkbookLike } from '../src/tabular.ts'

describe('parseCsvTabular', () => {
  it('decodes a plain body with per-column type inference', () => {
    const tabular = parseCsvTabular('region,units,price,fresh,note\n中亚,120,12.5,true,\n东南亚,98,9,, N/A\n')
    expect(tabular.columns).toEqual([
      { name: 'region', sqlType: 'TEXT' },
      { name: 'units', sqlType: 'INTEGER' },
      { name: 'price', sqlType: 'DOUBLE' },
      { name: 'fresh', sqlType: 'BOOLEAN' },
      { name: 'note', sqlType: 'TEXT' },
    ])
    expect(tabular.rows).toEqual([
      ['中亚', 120, 12.5, true, null],
      ['东南亚', 98, 9, null, ' N/A'],
    ])
  })

  it('decodes quoted fields, doubled-quote escapes, embedded separators, and CRLF records', () => {
    const tabular = parseCsvTabular('"sku, code","note""quoted""","multi\nline"\r\nS-1,"a,b",x\r\n')
    expect(tabular.columns.map(column => column.name)).toEqual(['sku, code', 'note"quoted"', 'multi\nline'])
    expect(tabular.rows).toEqual([['S-1', 'a,b', 'x']])
  })

  it('strips a UTF-8 BOM from the header', () => {
    const tabular = parseCsvTabular('\uFEFFregion\n中亚')
    expect(tabular.columns.map(column => column.name)).toEqual(['region'])
  })

  it('upgrades an integer column to DOUBLE when a decimal value appears', () => {
    const tabular = parseCsvTabular('amount\n1\n2.5\n')
    expect(tabular.columns[0]?.sqlType).toBe('DOUBLE')
    expect(tabular.rows).toEqual([[1], [2.5]])
  })

  it('keeps a beyond-safe-integer column textual', () => {
    const tabular = parseCsvTabular('id\n123456789012345678901\n42\n')
    expect(tabular.columns[0]?.sqlType).toBe('TEXT')
    expect(tabular.rows).toEqual([['123456789012345678901'], ['42']])
  })

  it('suffixes an empty header name that collides with a derived one', () => {
    const tabular = parseCsvTabular('column_2,\n1,2\n')
    expect(tabular.columns.map(column => column.name)).toEqual(['column_2', 'column_2_2'])
  })

  it('disambiguates duplicate and empty header names', () => {
    const tabular = parseCsvTabular('col,,col\n1,2,3\n')
    expect(tabular.columns.map(column => column.name)).toEqual(['col', 'column_2', 'col_2'])
  })

  it('refuses a data record whose field count differs from the header', () => {
    expect(() => parseCsvTabular('a,b\n1,2,3\n')).toThrow(/record 2 has 3 fields/u)
  })

  it('refuses an empty body and accepts a header-only body as zero rows', () => {
    expect(() => parseCsvTabular('')).toThrow(/no header record/u)
    expect(() => parseCsvTabular('\n')).toThrow(/no header record/u)
    const headerOnly = parseCsvTabular('a,b\n')
    expect(headerOnly.rows).toEqual([])
    expect(headerOnly.columns.map(column => column.sqlType)).toEqual(['TEXT', 'TEXT'])
  })
})

describe('parseJsonTabular', () => {
  it('decodes a row array with first-seen column order and typed cells', () => {
    const tabular = parseJsonTabular(JSON.stringify([
      { region: '中亚', units: 120, fresh: true },
      { region: '东南亚', units: 98, fresh: null },
    ]))
    expect(tabular.columns).toEqual([
      { name: 'region', sqlType: 'TEXT' },
      { name: 'units', sqlType: 'INTEGER' },
      { name: 'fresh', sqlType: 'BOOLEAN' },
    ])
    expect(tabular.rows).toEqual([['中亚', 120, true], ['东南亚', 98, null]])
  })

  it('fills cells absent from later rows and orders columns by first appearance', () => {
    const tabular = parseJsonTabular('[{"a":1},{"b":"x","a":2}]')
    expect(tabular.columns.map(column => column.name)).toEqual(['a', 'b'])
    expect(tabular.rows).toEqual([[1, null], [2, 'x']])
  })

  it('infers DOUBLE for mixed integer/decimal columns and TEXT for string-bearing ones', () => {
    const tabular = parseJsonTabular('[{"v":1},{"v":2.5},{"n":3},{"n":"4"}]')
    expect(tabular.columns.find(column => column.name === 'v')?.sqlType).toBe('DOUBLE')
    expect(tabular.columns.find(column => column.name === 'n')?.sqlType).toBe('TEXT')
  })

  it('infers DOUBLE for a decimals-only column and TEXT for an all-null column', () => {
    const decimals = parseJsonTabular('[{"v":1.5},{"v":2.25}]')
    expect(decimals.columns[0]?.sqlType).toBe('DOUBLE')
    const nullable = parseJsonTabular('[{"a":null},{"b":3}]')
    expect(nullable.columns.find(column => column.name === 'a')?.sqlType).toBe('TEXT')
    expect(nullable.columns.find(column => column.name === 'b')?.sqlType).toBe('INTEGER')
  })

  it('refuses non-array bodies, non-object rows, nested values, and invalid JSON', () => {
    expect(() => parseJsonTabular('{"a":1}')).toThrow(/must be an array/u)
    expect(() => parseJsonTabular('[1,2]')).toThrow(/row 1 is not an object/u)
    expect(() => parseJsonTabular('[{"a":{}}]')).toThrow(/unsupported type object/u)
    expect(() => parseJsonTabular('[')).toThrow(/not valid JSON/u)
  })
})

describe('parseXlsxTabular', () => {
  /** Build one minimal workbook-like fixture from plain rows. */
  function workbookOf(rows: unknown[][]): XlsxWorkbookLike {
    return {
      worksheets: [{
        rowCount: rows.length,
        getRow(rowIndex: number) {
          const values = rows[rowIndex - 1] ?? []
          return {
            eachCell(_options, callback) {
              values.forEach((value, index) => {
                callback({ value: value ?? null }, index + 1)
              })
            },
          }
        },
      }],
    }
  }

  it('decodes the first sheet with typed cells and null-filled gaps', async () => {
    const tabular = await parseXlsxTabular(new Uint8Array(0), async () => workbookOf([
      ['region', 'units'],
      ['中亚', 120],
      [null, 7],
    ]))
    expect(tabular.columns).toEqual([
      { name: 'region', sqlType: 'TEXT' },
      { name: 'units', sqlType: 'INTEGER' },
    ])
    expect(tabular.rows).toEqual([['中亚', 120], [null, 7]])
  })

  it('converges date, rich-text, and formula-shaped cells', async () => {
    const tabular = await parseXlsxTabular(new Uint8Array(0), async () => workbookOf([
      ['when', 'label', 'computed'],
      [new Date('2026-09-03T00:00:00Z'), { richText: [{ text: '宏' }, { text: '发' }] }, { formula: 'SUM(1)', result: 3 }],
    ]))
    expect(tabular.rows).toEqual([['2026-09-03T00:00:00.000Z', '宏发', 3]])
    expect(tabular.columns.map(column => column.sqlType)).toEqual(['TEXT', 'TEXT', 'INTEGER'])
  })

  it('reads an error cell, a hyperlink-shaped cell, and a null header cell', async () => {
    const tabular = await parseXlsxTabular(new Uint8Array(0), async () => workbookOf([
      ['h', null],
      [{ error: 'VALUE!' }, { text: '宏发' }],
    ]))
    expect(tabular.columns.map(column => column.name)).toEqual(['h', 'column_2'])
    expect(tabular.rows).toEqual([['#VALUE!', '宏发']])
  })

  it('joins rich-text parts without string text as empty and refuses a function-shaped cell', async () => {
    const joined = await parseXlsxTabular(new Uint8Array(0), async () => workbookOf([
      ['h'],
      [{ richText: [{ text: '宏' }, { text: 7 }] }],
    ]))
    expect(joined.rows).toEqual([['宏']])
    await expect(parseXlsxTabular(new Uint8Array(0), async () => workbookOf([
      ['h'],
      [() => 'nope'],
    ]))).rejects.toThrow(/unsupported value shape/u)
  })

  it('refuses a workbook with no worksheet or an empty header row', async () => {
    const noSheets = async () => ({ worksheets: [] }) as unknown as XlsxWorkbookLike
    await expect(parseXlsxTabular(new Uint8Array(0), noSheets)).rejects.toThrow(/no worksheet/u)
    await expect(parseXlsxTabular(new Uint8Array(0), async () => workbookOf([]))).rejects.toThrow(/no cells to name/u)
  })

  it('refuses an unrecognized cell value shape', async () => {
    await expect(parseXlsxTabular(new Uint8Array(0), async () => workbookOf([
      ['h'],
      [{ mysterious: true }],
    ]))).rejects.toThrow(/unsupported value shape/u)
  })
})

describe('tableNameFromFilename', () => {
  it('reduces upload names to plain SQL identifiers', () => {
    expect(tableNameFromFilename('orders.csv')).toBe('orders')
    expect(tableNameFromFilename('customs-2026 export.xlsx')).toBe('customs_2026_export')
    expect(tableNameFromFilename('2024sales.json')).toBe('t_2024sales')
    expect(tableNameFromFilename('___ .csv')).toBe('uploaded_table')
    expect(tableNameFromFilename('no-extension')).toBe('no_extension')
    expect(tableNameFromFilename('.csv')).toBe('uploaded_table')
  })
})
