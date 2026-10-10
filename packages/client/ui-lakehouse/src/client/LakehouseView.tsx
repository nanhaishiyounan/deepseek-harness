/**
 * The lakehouse conversation view: the table catalog grouped by schema with
 * live row counts, the selected table's columns and sample rows, and the
 * read-only SQL editor with its result table. All data rides the
 * connection's `api.lakehouse` face; a deployment without the engine shows
 * the structured refusal inline.
 * @module @deepseek-ai/dsh-client-ui-lakehouse/client/LakehouseView
 */

import { useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import type { LakehouseClientState } from './lakehouseStore.ts'
import type { LakehouseTableRow } from './lakehouseStore.ts'
import css from './view.module.css'

/** Registration-side business face for the conversation view. */
export interface LakehouseViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useLakehouse. */
    lakehouse: SnapshotStore<LakehouseClientState>
  }
  /** Load or reload the catalog cache. */
  refresh: () => void
  /** Load one table's schema card (columns + sample rows). */
  loadSchema: (schema: string, table: string) => void
  /** Run one read-only SQL statement. */
  runQuery: (sql: string) => void
  /** The table-count unit label (locale copy, resolved at registration). */
  badgeUnit: string
}

/** View props: the conversation-view seat's locale share plus the inject face. */
export type LakehouseViewProps =
  PropsLocale<'lakehouse'>
  & InjectFace<LakehouseViewInjected>

/** One cell's display text (nulls stay explicit). */
function cellText(value: null | boolean | number | string): string {
  if (value === null) return 'NULL'
  return String(value)
}

/**
 * Render the lakehouse workbench page.
 * @param props - the locale seat plus the store hook and the data actions.
 * @returns the catalog + query workbench.
 */
export function LakehouseView({ useLakehouse, refresh, loadSchema, runQuery, badgeUnit, t }: LakehouseViewProps): JSX.Element {
  const state = useLakehouse(snapshot => snapshot)
  const [sql, setSql] = useState('')
  const tables = state.tables

  const catalog = tables === undefined || tables.status === 'loading'
    ? <p className={css.hint}>{t('page.queryRunning')}</p>
    : tables.status === 'error'
      ? <p className={css.error}>{tables.message}</p>
      : tables.value.length === 0
        ? <p className={css.hint}>{t('page.empty')}</p>
        : <CatalogList rows={tables.value} onSelect={loadSchema} badgeUnit={badgeUnit} />

  const schema = state.schema === undefined ? undefined : (
    <section className={css.card}>
      <h3 className={css.cardTitle}>{state.schema.ref}</h3>
      <p className={css.hint}>{String(state.schema.rowCount)} 行 · {t('page.schemaColumns')} {String(state.schema.columns.length)}</p>
      <SchemaTable columns={state.schema.columns} rows={state.schema.sampleRows} />
    </section>
  )

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h2 className={css.title}>{t('page.title')}</h2>
        <p className={css.tagline}>{t('page.tagline')}</p>
      </header>
      <div className={css.columns}>
        <section className={css.card}>
          <h3 className={css.cardTitle}>{t('page.catalogTitle')}</h3>
          <p className={css.hint}>{t('page.catalogHint')}</p>
          {catalog}
        </section>
        <section className={css.card}>
          <h3 className={css.cardTitle}>{t('page.queryTitle')}</h3>
          <textarea
            className={css.sqlInput}
            value={sql}
            rows={4}
            spellCheck={false}
            placeholder={t('page.queryPlaceholder')}
            onChange={(event) => { setSql(event.target.value) }}
          />
          <div className={css.actions}>
            <button
              type="button"
              className={css.run}
              disabled={state.queryLoading || sql.trim().length === 0}
              onClick={() => { runQuery(sql) }}
            >
              {state.queryLoading ? t('page.queryRunning') : t('page.queryRun')}
            </button>
            <button type="button" className={clsx(css.run, css.ghost)} onClick={refresh}>↻</button>
          </div>
          {state.queryError !== undefined && (
            <p className={css.error}>{t('page.errorTitle')}：{state.queryError}</p>
          )}
          {state.query !== undefined && (
            <>
              <h4 className={css.cardTitle}>{t('page.resultTitle')}（{String(state.query.rowCount)} 行）</h4>
              <ResultTable columns={state.query.columns} rows={state.query.rows} />
              {state.query.truncated && <p className={css.hint}>{t('page.resultTruncated')}</p>}
            </>
          )}
        </section>
      </div>
      {schema}
    </div>
  )
}

/** The catalog listing grouped by schema. */
function CatalogList({ rows, onSelect, badgeUnit }: {
  rows: readonly LakehouseTableRow[]
  onSelect: (schema: string, table: string) => void
  badgeUnit: string
}): JSX.Element {
  const groups = new Map<string, LakehouseTableRow[]>()
  for (const row of rows) {
    const bucket = groups.get(row.schema) ?? []
    bucket.push(row)
    groups.set(row.schema, bucket)
  }
  return (
    <ul className={css.catalog}>
      {[...groups.entries()].map(([schema, tables]) => (
        <li key={schema}>
          <p className={css.schema}>{schema}<span className={css.count}>{String(tables.length)} {badgeUnit}</span></p>
          <ul className={css.tableList}>
            {tables.map(row => (
              <li key={row.ref}>
                <button type="button" className={css.tableRow} onClick={() => { onSelect(row.schema, row.table) }}>
                  <span className={css.tableName}>{row.table}</span>
                  <span className={css.count}>{String(row.rowCount)}</span>
                </button>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  )
}

/** A small data table shared by schema samples and query results. */
function SchemaTable({ columns, rows }: {
  columns: readonly { name: string; type: string }[]
  rows: (null | boolean | number | string)[][]
}): JSX.Element {
  if (columns.length === 0) return <p className={css.hint}>—</p>
  return (
    <div className={css.tableScroll}>
      <table className={css.table}>
        <thead>
          <tr>{columns.map(column => <th key={column.name}>{column.name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellText(cell)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** The query result table (column names only; types stay in the schema card). */
function ResultTable({ columns, rows }: {
  columns: readonly { name: string }[]
  rows: (null | boolean | number | string)[][]
}): JSX.Element {
  return (
    <div className={css.tableScroll}>
      <table className={css.table}>
        <thead>
          <tr>{columns.map(column => <th key={column.name}>{column.name}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cellText(cell)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
