/**
 * The business view tab: the collection switcher (the nocobase.listMeta
 * roster), the ask bar (a conversation handoff, not a query box), the
 * conversation-first entity card stream with per-record "edit (in chat)" and
 * collection-level "new (in chat)" handoffs, the auxiliary table view
 * (simplePaginate semantics), and the NocoBase embed entry (the low-frequency
 * admin aid over the /nocobase proxy). No forms: every write routes through
 * the conversation's nb_* confirmation flow.
 * @module @deepseek-ai/dsh-client-ui-business/client/BizView
 */

import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BizClientState } from './bizStore.ts'
import type { BizCollectionRow } from './bizTypes.ts'
import { entityLabelOf, entityPreviewOf } from './presentation.ts'
import css from './business.module.css'

/** Registration-side business face for the business view. */
export interface BizViewInjected {
  hooks: {
    /** Shared client-session snapshot bound by the renderer as useBusiness. */
    business: SnapshotStore<BizClientState>
  }
  /** Load or reload the collection roster. */
  refresh: () => void
  /** Load the selected collection's rows (first page). */
  loadRows: (collection: string) => void
  /** Load one more row page (the hasNext pattern; a no-op without a cursor). */
  loadMore: (collection: string, page: number) => void
  /** Best-effort view switch through the header bridge. */
  requestView: (view: string) => void
}

/** Full component props: the view-seat runtime share plus the inject face and locale seat. */
export type BizViewProps =
  PropsRuntime<'conversation.view'>
    & PropsLocale<'business'>
    & InjectFace<BizViewInjected>

/**
 * NocoBase admin-plane collections the object switcher hides: listMeta does
 * not flag them (they carry no `hidden` marker), but they are the permission
 * and account tables, not business objects (02-design §3.4 "过滤 hidden/系统表").
 */
const ADMIN_COLLECTIONS: ReadonlySet<string> = new Set(['users', 'roles', 'apiKeys', 'workflows', 'flow_nodes', 'attachments'])

/**
 * Render the business view tab.
 * @param props - the standard view kit plus the page's inject face.
 * @returns the business column.
 */
export function BizView(
  { inputActions, useBusiness, refresh, loadRows, loadMore, requestView, t }: BizViewProps,
): JSX.Element {
  const state = useBusiness(snapshot => snapshot)
  const [ask, setAsk] = useState('')
  const [tableView, setTableView] = useState(false)
  const [embedOpen, setEmbedOpen] = useState(false)

  useEffect(() => {
    if (state.collections === undefined) refresh()
  }, [state.collections, refresh])

  const collections = state.collections
  const roster: readonly BizCollectionRow[] = collections?.status === 'ready'
    ? collections.value.filter(entry => entry.hidden !== true && !ADMIN_COLLECTIONS.has(entry.name))
    : []
  // Opening the tab should land on real data, not a placeholder option: pick
  // the first business object the moment the roster arrives.
  useEffect(() => {
    const first = roster[0]
    if (collections?.status === 'ready' && state.selected === undefined && first !== undefined) loadRows(first.name)
  }, [collections?.status, state.selected, roster, loadRows])
  const selectedRow = roster.find(entry => entry.name === state.selected)
  const rows = state.rows
  const selectedLabel = selectedRow?.title ?? state.selected ?? ''

  /** Hand any drafted question to the conversation. */
  const askInChat = (prefix: string, detail: string): void => {
    inputActions.setDraft(`${prefix}${detail}`)
    requestView('chat')
  }

  return (
    <div className={css.page}>
      {collections !== undefined && collections.status === 'error' && (
        <div className={css.errorStrip} role="alert">
          <span>{t('error.unavailable')} — {collections.error}</span>
          <Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>
        </div>
      )}

      <section className={css.hero}>
        <h2 className={css.heroTitle}>{t('page.title')}</h2>
        <p className={css.heroTagline}>{t('page.tagline')}</p>
      </section>

      <section className={css.toolbar}>
        <label className={css.switchLabel}>
          {t('roster.title')}
          <select
            className={css.switchSelect}
            value={state.selected ?? ''}
            aria-label={t('roster.title')}
            onChange={(event) => {
              const next = event.target.value
              if (next === state.selected) return
              if (next === '') return
              loadRows(next)
            }}
          >
            {(state.selected === undefined || roster.length === 0) && <option value="">{t('roster.title')}</option>}
            {roster.map(entry => (
              <option key={entry.name} value={entry.name}>{entry.title ?? entry.name}</option>
            ))}
          </select>
        </label>
        <div className={css.askBox}>
          <input
            className={css.askInput}
            value={ask}
            placeholder={t('roster.askPlaceholder')}
            aria-label={t('roster.askAction')}
            onChange={(event) => { setAsk(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ask.trim().length > 0) askInChat(`${ask.trim()}\n`, '')
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { if (ask.trim().length > 0) askInChat(`${ask.trim()}\n`, '') }}
          >{t('roster.askAction')}</Button>
        </div>
      </section>

      {collections === undefined || collections.status === 'loading' ? (
        <div className={css.rowSkeleton} aria-hidden="true" />
      ) : collections.status === 'ready' && roster.length === 0 ? (
        <div className={css.emptyState}>
          <p className={css.emptyTitle}>{t('roster.empty')}</p>
          <p className={css.emptyHint}>{t('roster.emptyHint')}</p>
        </div>
      ) : state.selected !== undefined && (
        <section className={css.zone}>
          <div className={css.zoneHead}>
            <h3 className={css.zoneTitle}>{selectedLabel} · {t('cards.title')}</h3>
            <div className={css.zoneActions}>
              <Button variant="ghost" size="sm" onClick={() => { setTableView(!tableView) }}>
                {tableView ? t('table.showAsCards') : t('table.showAsTable')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { askInChat(t('cards.newPromptPrefix'), `（${selectedLabel}）`) }}
              >{t('cards.newRecord')}</Button>
            </div>
          </div>

          {rows === undefined || rows.status === 'loading' ? (
            <div className={css.rowSkeleton} aria-hidden="true" />
          ) : rows.status === 'error' ? (
            <div className={css.errorStrip} role="alert">
              <span>{t('error.unavailable')} — {rows.error}</span>
              <Button variant="ghost" size="sm" onClick={() => { const selected = state.selected; if (selected !== undefined) loadRows(selected) }}>{t('error.retry')}</Button>
            </div>
          ) : rows.value.rows.length === 0 ? (
            <div className={css.emptyState}>
              <p className={css.emptyTitle}>{t('cards.empty')}</p>
              <p className={css.emptyHint}>{t('cards.emptyHint')}</p>
            </div>
          ) : tableView ? (
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>{entityPreviewOf(rows.value.rows[0] ?? {}, 6).map(([key]) => <th key={key}>{key}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.value.rows.map((row, index) => (
                    <tr key={typeof row.id === 'number' ? row.id : index}>
                      {entityPreviewOf(row, 6).map(([key, value]) => <td key={key}>{value}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={css.tableFoot}>
                {rows.value.page * rows.value.page_size < rows.value.count ? (
                  <Button variant="ghost" size="sm" onClick={() => { const selected = state.selected; if (selected !== undefined) loadMore(selected, rows.value.page + 1) }}>{t('table.more')}</Button>
                ) : (
                  <span className={css.tableEnd}>{t('table.end')}</span>
                )}
              </div>
            </div>
          ) : (
            <ul className={css.cardStream}>
              {rows.value.rows.map((row, index) => (
                <li key={typeof row.id === 'number' ? row.id : index} className={css.entityCard}>
                  <p className={css.entityLabel}>{entityLabelOf(row, selectedLabel)}</p>
                  <dl className={css.entityRows}>
                    {entityPreviewOf(row, 3).map(([key, value]) => (
                      <div key={key} className={css.entityRow}><dt>{key}</dt><dd>{value}</dd></div>
                    ))}
                  </dl>
                  <div className={css.entityActions}>
                    <Button variant="ghost" size="sm" onClick={() => { askInChat(`${t('cards.askPromptPrefix')} `, JSON.stringify(entityPreviewOf(row, 3))) }}>{t('cards.ask')}</Button>
                    <Button variant="ghost" size="sm" onClick={() => { askInChat(`${t('cards.editPromptPrefix')} `, `${selectedLabel} ${JSON.stringify(entityPreviewOf(row, 3))}`) }}>{t('cards.edit')}</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={css.embedZone}>
        <div className={css.zoneHead}>
          <h3 className={css.zoneTitle}>{t('embed.title')}</h3>
          <Button variant="ghost" size="sm" onClick={() => { setEmbedOpen(!embedOpen) }}>{t('embed.open')}</Button>
        </div>
        <p className={css.embedHint}>{t('embed.openHint')}</p>
        {embedOpen && (
          <iframe className={css.embedFrame} src="/nocobase/" title={t('embed.frameTitle')} />
        )}
      </section>
    </div>
  )
}
