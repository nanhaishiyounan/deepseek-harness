/**
 * Pure row-model derivation for the `lakehouse_query` toolview row: the SQL
 * off the call arguments, the markdown result table and source-table
 * attribution off the settled result text (the tool package's documented
 * output), the number-card statistics of the leading numeric column, and the
 * chart plan (a temporal line when the first column reads as a period series,
 * otherwise horizontal bars over the first numeric column). Everything here
 * degrades: a result without a markdown table or without the attribution
 * line keeps whatever parsed, and the chart plan returns undefined so the row
 * renders the plain table alone.
 * @module @deepseek-ai/dsh-client-ui-tool/client/tool/models/lakehouse-card-model
 */

import type { ToolCallBlock, ToolResultNode } from '@deepseek-ai/dsh-client-runtime/client'

/** One parsed result cell: numbers stay numbers for stats and charts. */
export type LakehouseCell = string | number

/** The parsed `lakehouse_query` presentation view. */
export interface LakehouseQueryView {
  /** The executed SQL statement ('' when the arguments did not parse). */
  readonly sql: string
  /** Source tables off the `Data source: lakehouse table(s) …` line. */
  readonly tables: readonly string[]
  /** Markdown-table column names (empty when no table parsed). */
  readonly columns: readonly string[]
  /** Markdown-table body rows, numeric cells kept as numbers. */
  readonly rows: readonly LakehouseCell[][]
  /** Whether the result carried the truncation note. */
  readonly truncated: boolean
}

/** One number-card statistic. */
export interface LakehouseStatCard {
  /** Statistic id (the row maps it to locale copy). */
  readonly id: 'rows' | 'sum' | 'mean' | 'max' | 'min'
  readonly value: number
}

/** The temporal line chart plan. */
export interface LakehouseLinePlan {
  readonly kind: 'line'
  /** X labels (the first column's raw cells, in row order). */
  readonly labels: readonly string[]
  /** Y values from the plotted numeric column. */
  readonly values: readonly number[]
  /** The plotted numeric column's name. */
  readonly valueColumn: string
}

/** The horizontal bar chart plan (top rows by the numeric column). */
export interface LakehouseBarPlan {
  readonly kind: 'bar'
  /** One bar: category label and value. */
  readonly items: readonly { readonly label: string; readonly value: number }[]
  /** The plotted numeric column's name. */
  readonly valueColumn: string
}

/** Either chart shape, or undefined when the table carries no plottable pair. */
export type LakehouseChartPlan = LakehouseLinePlan | LakehouseBarPlan

const SOURCE_LINE = /^Data source: lakehouse tables? (.+)$/mu
const TRUNCATED_LINE = /\(Result truncated at \d+ rows/u
const NUMBER_CELL = /^-?\d+(?:\.\d+)?$/u

/**
 * Parse a numeric cell; anything else stays a string.
 * @param cell - the raw markdown cell text.
 * @returns the number when the cell is numeric, else the trimmed text.
 */
function parseCell(cell: string): LakehouseCell {
  const text = cell.trim()
  return NUMBER_CELL.test(text) ? Number(text) : text
}

/**
 * Derive the `lakehouse_query` view off the frozen call slice.
 * @param block - running call or settled result node.
 * @returns the view, or undefined while the call is still running.
 */
export function lakehouseQueryView(block: ToolCallBlock): LakehouseQueryView | undefined {
  if (!('kind' in block)) return undefined
  const node: ToolResultNode = block
  const text = resultText(node)
  const sql = sqlOf(node)
  const tables = SOURCE_LINE.exec(text)?.[1]?.split(', ').map(name => name.trim()).filter(name => name.length > 0) ?? []
  return {
    sql,
    tables,
    ...tableOf(text),
    truncated: TRUNCATED_LINE.test(text),
  }
}

/** Flatten a settled result's text blocks (non-text blocks join as JSON). */
function resultText(node: ToolResultNode): string {
  const parts: string[] = []
  for (const block of node.content) {
    if (block.type === 'text') parts.push(block.text)
    else parts.push(JSON.stringify(block, null, 2))
  }
  return parts.join('\n')
}

/** The SQL argument of the call ('' when absent or non-string). */
function sqlOf(node: ToolResultNode): string {
  try {
    const parsed: unknown = JSON.parse(node.call?.argsRaw ?? '')
    if (typeof parsed === 'object' && parsed !== null && typeof (parsed as { sql?: unknown }).sql === 'string') {
      return (parsed as { sql: string }).sql
    }
  } catch {
    // Malformed arguments: the result text still renders.
  }
  return ''
}

/**
 * Parse the first markdown table off the result text.
 * @param text - the model-facing result text.
 * @returns the columns and numeric-aware rows (empty when no table found).
 */
function tableOf(text: string): { columns: readonly string[]; rows: readonly LakehouseCell[][] } {
  const lines = text.split('\n').map(line => line.trim())
  const headerIndex = lines.findIndex(line => line.startsWith('|') && line.endsWith('|') && line.length > 2)
  if (headerIndex === -1) return { columns: [], rows: [] }
  const cellsOf = (line: string): string[] => line.slice(1, -1).split('|').map(cell => cell.trim())
  const columns = cellsOf(lines[headerIndex] ?? '')
  const rows: LakehouseCell[][] = []
  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.startsWith('|')) break
    if (/^\|(?:\s*:?-{2,}:?\s*\|)+$/u.test(line)) continue
    rows.push(cellsOf(line).map(parseCell))
  }
  if (rows.length === 0) return { columns: [], rows: [] }
  return { columns, rows }
}

/**
 * Whether a column name reads as a temporal period axis.
 * @param column - the candidate x column name.
 * @returns true for month/quarter/date/year/period/时间-style names.
 */
export function isTemporalColumn(column: string): boolean {
  return /月|季|年|周|日|时|month|quarter|year|week|date|period|time/iu.test(column)
}

/**
 * Index of the first column whose cells are (mostly) numeric.
 * @param view - the parsed query view.
 * @returns the column index, or -1 when no column is numeric enough.
 */
export function numericColumnOf(view: LakehouseQueryView): number {
  if (view.rows.length === 0) return -1
  for (let column = 0; column < view.columns.length; column++) {
    const numeric = view.rows.filter(row => typeof row[column] === 'number').length
    if (numeric >= Math.ceil(view.rows.length / 2)) return column
  }
  return -1
}

/**
 * The number-card statistics of one numeric column.
 * @param view - the parsed query view.
 * @param column - the numeric column index.
 * @returns the stat cards (rows always; the rest only when values exist).
 */
export function statCardsOf(view: LakehouseQueryView, column: number): readonly LakehouseStatCard[] {
  const values = view.rows.map(row => row[column]).filter((cell): cell is number => typeof cell === 'number')
  const cards: LakehouseStatCard[] = [{ id: 'rows', value: view.rows.length }]
  if (values.length === 0) return cards
  const sum = values.reduce((total, value) => total + value, 0)
  cards.push(
    { id: 'sum', value: sum },
    { id: 'mean', value: sum / values.length },
    { id: 'max', value: Math.max(...values) },
    { id: 'min', value: Math.min(...values) },
  )
  return cards
}

/**
 * Choose the chart plan for a parsed view: a line when the x column reads
 * temporal and a distinct numeric column exists; otherwise bars over the
 * first numeric column grouped by the first text column.
 * @param view - the parsed query view.
 * @returns the plan, or undefined when nothing is plottable.
 */
export function chartPlanOf(view: LakehouseQueryView): LakehouseChartPlan | undefined {
  const numeric = numericColumnOf(view)
  if (numeric === -1 || view.rows.length < 2) return undefined
  const labelColumn = numeric === 0
    ? view.columns.findIndex((_, index) => index !== numeric)
    : 0
  if (labelColumn === -1) return undefined
  const firstColumnName = view.columns[labelColumn] ?? ''
  const valueColumn = view.columns[numeric] ?? ''
  if (isTemporalColumn(firstColumnName)) {
    return {
      kind: 'line',
      labels: view.rows.map(row => String(row[labelColumn] ?? '')),
      values: view.rows.map(row => row[numeric]).filter((cell): cell is number => typeof cell === 'number'),
      valueColumn,
    }
  }
  const items = view.rows
    .map(row => ({ label: String(row[labelColumn] ?? ''), value: row[numeric] }))
    .filter((item): item is { label: string; value: number } => typeof item.value === 'number')
    .sort((left, right) => right.value - left.value)
    .slice(0, 8)
  if (items.length < 2) return undefined
  return { kind: 'bar', items, valueColumn }
}

/**
 * Render the parsed view as CSV for the export button.
 * @param view - the parsed query view.
 * @returns the CSV text (header row plus body rows).
 */
export function csvOf(view: LakehouseQueryView): string {
  const escape = (cell: LakehouseCell | string): string => {
    const text = String(cell)
    return /[",\n]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const lines = [view.columns.map(escape).join(',')]
  for (const row of view.rows) lines.push(row.map(escape).join(','))
  return lines.join('\n')
}
