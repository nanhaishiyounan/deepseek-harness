/**
 * The lakehouse workbench's copy, Chinese-first with an English mirror.
 * Business language only: tables, schemas, rows, and queries.
 * @module @deepseek-ai/dsh-client-ui-lakehouse/client/locales
 */

/** Dictionary keys owned by this plugin's `lakehouse` locale namespace. */
export type LakehouseKey =
  | 'entry.label'
  | 'entry.tablesBadge'
  | 'view.lakehouse'
  | 'page.title'
  | 'page.tagline'
  | 'page.catalogTitle'
  | 'page.catalogHint'
  | 'page.queryTitle'
  | 'page.queryPlaceholder'
  | 'page.queryRun'
  | 'page.queryRunning'
  | 'page.resultTitle'
  | 'page.resultTruncated'
  | 'page.empty'
  | 'page.errorTitle'
  | 'page.schemaColumns'
  | 'page.schemaSample'

/** The Chinese dictionary (product copy; the canonical voice). */
export const zh: Record<LakehouseKey, string> = {
  'entry.label': '湖仓',
  'entry.tablesBadge': '张表',
  'view.lakehouse': '湖仓',
  'page.title': '湖仓工作台',
  'page.tagline': '湖仓表目录与只读查询（DuckLake · DuckDB）',
  'page.catalogTitle': '表目录',
  'page.catalogHint': '按 schema 分层，行数为实时计数；点击表名查看列结构与样本行。',
  'page.queryTitle': '只读查询',
  'page.queryPlaceholder': 'SELECT … FROM lake.<schema>.<table> （仅 SELECT / PRAGMA / DESCRIBE）',
  'page.queryRun': '运行查询',
  'page.queryRunning': '查询中…',
  'page.resultTitle': '查询结果',
  'page.resultTruncated': '结果已按行数上限截断，请聚合或过滤后重查。',
  'page.empty': '暂无数据',
  'page.errorTitle': '查询被拒绝',
  'page.schemaColumns': '列结构',
  'page.schemaSample': '样本行',
}

/** The English mirror. */
export const en: Record<LakehouseKey, string> = {
  'entry.label': 'Lakehouse',
  'entry.tablesBadge': 'tables',
  'view.lakehouse': 'Lakehouse',
  'page.title': 'Lakehouse workbench',
  'page.tagline': 'Table catalog and read-only queries (DuckLake · DuckDB)',
  'page.catalogTitle': 'Table catalog',
  'page.catalogHint': 'Grouped by schema with live row counts; click a table for its columns and sample rows.',
  'page.queryTitle': 'Read-only query',
  'page.queryPlaceholder': 'SELECT … FROM lake.<schema>.<table> (SELECT / PRAGMA / DESCRIBE only)',
  'page.queryRun': 'Run query',
  'page.queryRunning': 'Running…',
  'page.resultTitle': 'Result',
  'page.resultTruncated': 'Result truncated at the row cap; aggregate or filter for exact totals.',
  'page.empty': 'No data',
  'page.errorTitle': 'Query rejected',
  'page.schemaColumns': 'Columns',
  'page.schemaSample': 'Sample rows',
}
