/**
 * Structured-body parsers shared by the upload and connector-transfer
 * lakehouse routes: decode csv, json row arrays, and xlsx bytes into the
 * seam's `TabularData`, with the column SQL types inferred from the decoded
 * values and the table name derived from a source file name. Fail-loud
 * throughout: a malformed body refuses instead of silently storing a partial
 * table.
 * @module @deepseek-ai/dsh-lakehouse/tabular
 */

import type { LakehouseColumn, TabularData } from './types.ts'

/**
 * Parse one RFC-4180 CSV body (quoted fields, doubled-quote escapes, CR/LF
 * record separators, UTF-8 BOM) into rows of string cells. The first record
 * is the header; a data record with a different field count refuses.
 * @param text - the decoded UTF-8 CSV text.
 * @returns the header names and the raw string rows.
 */
function parseCsvRecords(text: string): { header: string[]; rows: string[][] } {
  let body = text
  if (body.startsWith('\uFEFF')) body = body.slice(1)
  const records: string[][] = []
  let field = ''
  let record: string[] = []
  let inQuotes = false
  let started = false
  const pushField = (): void => {
    record.push(field)
    field = ''
  }
  const pushRecord = (): void => {
    // A record separator outside quotes ends the current record; a trailing
    // separator (the common final newline) must not mint an empty record.
    pushField()
    const isTrailingEmpty = record.every(cell => cell.length === 0)
    if (!isTrailingEmpty || started) records.push(record)
    record = []
    started = false
  }
  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index)
    if (inQuotes) {
      if (char === '"') {
        if (body.charAt(index + 1) === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
    } else if (char === '"') {
      inQuotes = true
      started = true
    } else if (char === ',') {
      pushField()
      started = true
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && body.charAt(index + 1) === '\n') index += 1
      pushRecord()
    } else {
      field += char
      started = true
    }
  }
  if (field.length > 0 || record.length > 0) pushRecord()
  const [header, ...rows] = records
  if (header === undefined) throw new Error('csv body has no header record')
  for (const [index, row] of rows.entries()) {
    if (row.length !== header.length) {
      throw new Error(`csv record ${index + 2} has ${row.length} fields; the header declares ${header.length}`)
    }
  }
  return { header, rows }
}

/** Integer literal (safe range checked by the caller through Number). */
const INTEGER_PATTERN = /^[-+]?\d+$/u

/** Numeric literal (integer or decimal/exponent form). */
const NUMBER_PATTERN = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/u

/** Boolean literal, case-insensitive. */
const BOOLEAN_PATTERN = /^(?:true|false)$/iu

/**
 * Infer one column's SQL type from its decoded string cells: every non-empty
 * cell must agree. Empty cells read as NULL and sit out of the decision; an
 * all-empty (or integer-beyond-safe-range) column reads as TEXT.
 * @param cells - the column's raw string cells across every data row.
 * @returns the column's SQL type name.
 */
function inferTextColumnType(cells: readonly string[]): LakehouseColumn['sqlType'] {
  let sawInteger = false
  let sawNumber = false
  let sawBoolean = false
  let sawOther = false
  for (const cell of cells) {
    if (cell.length === 0) continue
    if (INTEGER_PATTERN.test(cell)) {
      sawInteger = true
    } else if (NUMBER_PATTERN.test(cell)) {
      sawNumber = true
    } else if (BOOLEAN_PATTERN.test(cell)) {
      sawBoolean = true
    } else {
      sawOther = true
    }
  }
  if (sawOther || (!sawInteger && !sawNumber && !sawBoolean)) return 'TEXT'
  if (sawBoolean && !sawInteger && !sawNumber) return 'BOOLEAN'
  if (sawInteger && !sawNumber) {
    // Integers beyond the JS safe range stay textual: the JSON-shaped cell
    // vocabulary cannot carry them losslessly.
    return cells.every(cell => cell.length === 0 || !INTEGER_PATTERN.test(cell) || Number.isSafeInteger(Number(cell))) ? 'INTEGER' : 'TEXT'
  }
  return 'DOUBLE'
}

/** Convert one raw string cell to the typed cell its column demands. */
function textCellOf(cell: string, sqlType: string): null | boolean | number | string {
  if (cell.length === 0) return null
  if (sqlType === 'BOOLEAN') return cell.toLowerCase() === 'true'
  if (sqlType === 'INTEGER' || sqlType === 'DOUBLE') return Number(cell)
  return cell
}

/** Ensure a column name is non-empty and unique within its header. */
function uniqueColumnName(raw: string, index: number, seen: Set<string>): string {
  let name = raw.length === 0 ? `column_${index + 1}` : raw
  let suffix = 2
  while (seen.has(name)) {
    name = `${raw.length === 0 ? `column_${index + 1}` : raw}_${suffix}`
    suffix += 1
  }
  seen.add(name)
  return name
}

/**
 * Parse one CSV body into tabular data: the header names the columns and
 * every column's SQL type is inferred from its data cells.
 * @param text - the decoded UTF-8 CSV text.
 * @returns the tabular dataset.
 */
export function parseCsvTabular(text: string): TabularData {
  const { header, rows } = parseCsvRecords(text)
  const seen = new Set<string>()
  const columns: LakehouseColumn[] = header.map((raw, index) => ({ name: uniqueColumnName(raw, index, seen), sqlType: 'TEXT' as string }))
  const inferred = header.map((_, index) => inferTextColumnType(rows.map(row => row[index] as string)))
  const typedColumns = columns.map((column, index) => ({ ...column, sqlType: inferred[index] as string }))
  const typedRows = rows.map(row => row.map((cell, index) => textCellOf(cell, inferred[index] as string)))
  return { columns: typedColumns, rows: typedRows }
}

/** The JSON-shaped scalar vocabulary a tabular cell may carry. */
type JsonScalar = null | boolean | number | string

/**
 * Narrow one decoded JSON value to the cell vocabulary, refusing shapes the
 * lakehouse write path cannot store (nested objects, arrays, undefined).
 */
function jsonScalarOf(value: unknown, path: string): JsonScalar {
  if (value === null) return null
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value
  throw new Error(`json row field "${path}" has unsupported type ${typeof value}; supported: null, boolean, number, string`)
}

/** Infer one column's SQL type from its decoded scalar cells (null sits out). */
function inferScalarColumnType(cells: readonly JsonScalar[]): LakehouseColumn['sqlType'] {
  let sawInteger = false
  let sawNumber = false
  let sawBoolean = false
  let sawString = false
  for (const cell of cells) {
    if (cell === null) continue
    if (typeof cell === 'boolean') sawBoolean = true
    else if (typeof cell === 'string') sawString = true
    else if (Number.isInteger(cell)) sawInteger = true
    else sawNumber = true
  }
  if (sawString) return 'TEXT'
  if (sawBoolean && !sawInteger && !sawNumber) return 'BOOLEAN'
  if (sawInteger && !sawNumber) return 'INTEGER'
  if (sawInteger || sawNumber) return 'DOUBLE'
  return 'TEXT'
}

/**
 * Parse one JSON row-array body into tabular data. The union of the rows'
 * keys (first-seen order) names the columns; a column mixing value kinds
 * refuses, and a non-object row refuses.
 * @param text - the decoded JSON text.
 * @returns the tabular dataset.
 */
export function parseJsonTabular(text: string): TabularData {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error: unknown) {
    throw new Error(`json body is not valid JSON: ${String(error)}`)
  }
  if (!Array.isArray(parsed)) throw new Error('json body must be an array of row objects')
  const names: string[] = []
  const seen = new Set<string>()
  const scalarRows: JsonScalar[][] = []
  for (const [rowIndex, entry] of parsed.entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new Error(`json row ${rowIndex + 1} is not an object`)
    }
    const row: JsonScalar[] = []
    for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
      if (!seen.has(key)) {
        seen.add(key)
        names.push(key)
      }
      row[names.indexOf(key)] = jsonScalarOf(value, key)
    }
    scalarRows.push(row)
  }
  const columns = names.map(name => ({ name, sqlType: 'TEXT' as string }))
  const inferred = names.map((_, index) => inferScalarColumnType(scalarRows.map(row => row[index] ?? null)))
  const typedColumns = columns.map((column, index) => ({ ...column, sqlType: inferred[index] as string }))
  const typedRows = scalarRows.map(row => names.map((_, index) => row[index] ?? null))
  return { columns: typedColumns, rows: typedRows }
}

/**
 * Narrow one decoded xlsx cell value to the cell vocabulary: dates read as
 * ISO strings, rich text concatenates, formulas read their result, and an
 * error cell reads back its error code.
 */
function xlsxScalarOf(value: unknown): JsonScalar {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') return value
  if (typeof value === 'object') {
    const cell = value as Record<string, unknown>
    if (Array.isArray(cell.richText)) {
      return cell.richText.map((part) => {
        const text = (part as Record<string, unknown>).text
        return typeof text === 'string' ? text : ''
      }).join('')
    }
    if ('result' in cell) return xlsxScalarOf(cell.result)
    if ('error' in cell) return `#${String(cell.error)}`
    if (typeof cell.text === 'string' || typeof cell.text === 'number') return cell.text
  }
  throw new Error(`xlsx cell has unsupported value shape: ${JSON.stringify(value)}`)
}

/** The xlsx reader's injected type surface (exceljs Workbook, import-time hidden). */
export interface XlsxWorkbookLike {
  readonly worksheets: ReadonlyArray<{
    readonly rowCount: number
    getRow(rowIndex: number): {
      eachCell(options: { includeEmpty: true }, callback: (cell: { readonly value: unknown }, colNumber: number) => void): void
    }
  }>
}

/**
 * Parse one xlsx body's first worksheet into tabular data. The first row
 * names the columns; every cell converges to the JSON-scalar vocabulary and
 * each column's SQL type is inferred from its cells.
 * @param bytes - the xlsx (ZIP) bytes.
 * @param loadWorkbook - the workbook loader (exceljs's `Workbook.xlsx`).
 * @returns the tabular dataset.
 */
export async function parseXlsxTabular(bytes: Uint8Array, loadWorkbook: (data: Buffer) => Promise<XlsxWorkbookLike>): Promise<TabularData> {
  const workbook = await loadWorkbook(Buffer.from(bytes))
  const sheet = workbook.worksheets[0]
  if (sheet === undefined) throw new Error('xlsx workbook has no worksheet')
  const headerRow = sheet.getRow(1)
  const header: string[] = []
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const raw = xlsxScalarOf(cell.value)
    header[colNumber - 1] = raw === null ? '' : String(raw)
  })
  if (header.length === 0) throw new Error('xlsx first row has no cells to name the columns')
  const seen = new Set<string>()
  const columns = header.map((raw, index) => ({ name: uniqueColumnName(raw, index, seen), sqlType: 'TEXT' as string }))
  const scalarRows: JsonScalar[][] = []
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row: JsonScalar[] = []
    sheet.getRow(rowIndex).eachCell({ includeEmpty: true }, (cell, colNumber) => {
      row[colNumber - 1] = xlsxScalarOf(cell.value)
    })
    // Skip fully-empty trailing rows exceljs still counts (no callback ran).
    if (row.length > 0) scalarRows.push(row)
  }
  const width = header.length
  const inferred = columns.map((_, index) => inferScalarColumnType(scalarRows.map(row => row[index] ?? null)))
  const typedColumns = columns.map((column, index) => ({ ...column, sqlType: inferred[index] as string }))
  const typedRows = scalarRows.map((row) => {
    const filled: JsonScalar[] = Array.from({ length: width })
    for (let index = 0; index < width; index += 1) filled[index] = row[index] ?? null
    return filled
  })
  return { columns: typedColumns, rows: typedRows }
}

/** Table-name characters that survive the lakehouse's SQL-identifier rule. */
const TABLE_NAME_FORBIDDEN = /[^A-Za-z0-9_]/gu

/**
 * Derive one lakehouse table name from an upload's file name: the base name
 * reduced to `[A-Za-z0-9_]`, prefixed when it would start with a digit, and
 * falling back to a stable generic name when nothing survives.
 * @param filename - the sanitized upload file name (with its extension).
 * @returns a plain SQL identifier.
 */
export function tableNameFromFilename(filename: string): string {
  const dot = filename.lastIndexOf('.')
  const base = dot === -1 ? filename : filename.slice(0, dot)
  const cleaned = base.replaceAll(TABLE_NAME_FORBIDDEN, '_').slice(0, 100)
  if (cleaned.replaceAll('_', '').length === 0) return 'uploaded_table'
  return /^[0-9]/u.test(cleaned) ? `t_${cleaned}` : cleaned
}
