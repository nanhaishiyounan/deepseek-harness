/**
 * The business view tab, task-first over the tool shapes: the grouped
 * collection navigator (domain buckets + live search + the frecency 常用
 * rail), the in-page ask bar (a conversation draft hand-off with an inline
 * hop-link, never a forced view jump), the conversation-first entity card
 * stream with per-record inline edits on the low-risk field whitelist
 * (备注/数量/日期 over `nocobase.update`; higher-risk changes keep the
 * nb_update confirmation flow), the SRM supplier-360 zone and the order
 * status badges, the auxiliary table view, and the NocoBase external entry.
 * @module @deepseek-ai/dsh-client-ui-business/client/BizView
 */

import { useEffect, useMemo, useState } from 'react'
import type { JSX } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import {
  Button, EmptyState, ErrorStrip, IconDataOutline16, PageHero, PageSkeleton,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the ui-conversation SlotMap merge (the view seat).
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { BizClientState } from './bizStore.ts'
import type { BizCollectionRow } from './bizTypes.ts'
import { entityLabelOf, entityPreviewOf } from './presentation.ts'
import {
  daysUntil, frecentCollections, groupRoster, isInlineEditable,
  isOrderCollection, isSupplierCollection, noteCollectionUsed, orderStatusCell, supplierCertCells,
  type BizDomain,
} from './bizNav.ts'
import css from './business.module.css'
import type { BusinessKey } from './locales.ts'

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
  /**
   * Patch one row's whitelisted low-risk fields inline (the gateway's
   * `nocobase.update`); rejects with the structured refusal when the
   * deployment has not opted in through `nocobaseWriteEnabled`.
   */
  updateRow: (collection: string, id: number, values: Record<string, string | number | null>) => Promise<Record<string, unknown>>
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

/** One navigator bucket's display label (locale copy). */
const DOMAIN_LABEL_KEYS: Record<BizDomain, BusinessKey> = {
  frequent: 'nav.frequent',
  crm: 'nav.crm',
  srm: 'nav.srm',
  wms: 'nav.wms',
  orders: 'nav.orders',
  helpdesk: 'nav.helpdesk',
  finance: 'nav.finance',
  food: 'nav.food',
  other: 'nav.other',
}

/**
 * Render the business view tab.
 * @param props - the standard view kit plus the page's inject face.
 * @returns the business column.
 */
export function BizView(
  { inputActions, useBusiness, refresh, loadRows, loadMore, requestView, updateRow, t }: BizViewProps,
): JSX.Element {
  const state = useBusiness(snapshot => snapshot)
  const [ask, setAsk] = useState('')
  const [tableView, setTableView] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [navQuery, setNavQuery] = useState('')
  const [frecent, setFrecent] = useState<string[]>(() => frecentCollections())
  const [askedInline, setAskedInline] = useState<string | undefined>(undefined)

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
    if (collections?.status === 'ready' && state.selected === undefined && first !== undefined) {
      loadRows(first.name)
      setFrecent(noteCollectionUsed(first.name))
    }
  }, [collections?.status, state.selected, roster, loadRows])
  const selectedRow = roster.find(entry => entry.name === state.selected)
  const rows = state.rows
  const selectedLabel = selectedRow?.title ?? state.selected ?? ''

  /** Open one collection: load its rows and record the frecency use. */
  const openCollection = (name: string): void => {
    loadRows(name)
    setFrecent(noteCollectionUsed(name))
    setNavOpen(false)
  }

  /**
   * Hand any drafted question to the conversation WITHOUT leaving the
   * business page: the draft fills, an inline hop-link appears, and the
   * view switch stays the user's click.
   */
  const askInPlace = (prefix: string, detail: string): void => {
    inputActions.setDraft(`${prefix}${detail}`)
    setAskedInline(`${prefix}${detail}`)
  }

  const buckets = useMemo(() => groupRoster(roster, navQuery.trim()), [roster, navQuery, frecent])

  return (
    <div className={css.page}>
      {collections !== undefined && collections.status === 'error' && (
        <ErrorStrip
          message={<>{t('error.unavailable')} — {collections.error}</>}
          action={<Button variant="ghost" size="sm" onClick={refresh}>{t('error.retry')}</Button>}
        />
      )}

      <PageHero eyebrow={t('view.business')} title={t('page.title')} tagline={t('page.tagline')} />

      <section className={css.toolbar} data-testid="biz-toolbar">
        <div className={css.navBox}>
          <button type="button" className={css.navToggle} data-testid="biz-nav-toggle" aria-expanded={navOpen} onClick={() => { setNavOpen(open => !open) }}>
            <IconDataOutline16 size={14} />
            <span className={css.navToggleLabel}>{selectedLabel === '' ? t('nav.placeholder') : selectedLabel}</span>
            <span className={css.navToggleCount}>{`${String(roster.length)} ${t('nav.objects')}`}</span>
          </button>
          {navOpen && (
            <div className={css.navPanel} data-testid="biz-nav-panel">
              <input
                className={css.navSearch}
                type="search"
                value={navQuery}
                placeholder={t('nav.searchPlaceholder')}
                aria-label={t('nav.searchPlaceholder')}
                onChange={(event) => { setNavQuery(event.target.value) }}
              />
              {buckets.map(bucket => (
                <div key={bucket.domain} className={css.navGroup}>
                  <span className={css.navGroupLabel}>{t(DOMAIN_LABEL_KEYS[bucket.domain])}</span>
                  <div className={css.navGroupItems}>
                    {bucket.entries.map(entry => (
                      <button
                        key={entry.name}
                        type="button"
                        className={css.navItem}
                        data-selected={entry.name === state.selected || undefined}
                        onClick={() => { openCollection(entry.name) }}
                      >
                        {entry.title ?? entry.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {buckets.length === 0 && <p className={css.navEmpty}>{t('nav.noHits')}</p>}
            </div>
          )}
        </div>
        <div className={css.askBox}>
          <input
            className={css.askInput}
            value={ask}
            placeholder={t('roster.askPlaceholder')}
            aria-label={t('roster.askAction')}
            onChange={(event) => { setAsk(event.target.value) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && ask.trim().length > 0) askInPlace(`${ask.trim()}\n`, '')
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { if (ask.trim().length > 0) askInPlace(`${ask.trim()}\n`, '') }}
          >{t('roster.askAction')}</Button>
        </div>
      </section>

      {askedInline !== undefined && (
        <p className={css.askedInline} data-testid="biz-asked-inline">
          {t('ask.sent')}
          <button type="button" className={css.askedLink} onClick={() => { requestView('chat') }}>{t('ask.viewAnswer')}</button>
        </p>
      )}

      {collections === undefined || collections.status === 'loading' ? (
        <PageSkeleton variant="list" rows={3} />
      ) : collections.status === 'ready' && roster.length === 0 ? (
        <EmptyState title={t('roster.empty')} hint={t('roster.emptyHint')} icon={<IconDataOutline16 />} />
      ) : state.selected !== undefined && selectedRow !== undefined && (
        <section className={css.zone}>
          {isSupplierCollection(selectedRow) && rows?.status === 'ready' && rows.value.rows.length > 0 && (
            <Supplier360 rows={rows.value.rows} t={t} />
          )}
          <div className={css.zoneHead}>
            <h3 className={css.zoneTitle}>{selectedLabel} · {t('cards.title')}</h3>
            <div className={css.zoneActions}>
              <Button variant="ghost" size="sm" onClick={() => { setTableView(!tableView) }}>
                {tableView ? t('table.showAsCards') : t('table.showAsTable')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { askInPlace(t('cards.newPromptPrefix'), `（${selectedLabel}）`) }}
              >{t('cards.newRecord')}</Button>
            </div>
          </div>

          {rows === undefined || rows.status === 'loading' ? (
            <PageSkeleton variant="list" rows={4} />
          ) : rows.status === 'error' ? (
            <ErrorStrip
              message={<>{t('error.unavailable')} — {rows.error}</>}
              /* v8 ignore next -- narrowing guard: the zone renders only under the
                 selected/selectedRow guard at its head, so the closure's re-read
                 never finds undefined. */
              action={<Button variant="ghost" size="sm" onClick={() => { const selected = state.selected; if (selected !== undefined) loadRows(selected) }}>{t('error.retry')}</Button>}
            />
          ) : rows.value.rows.length === 0 ? (
            <EmptyState title={t('cards.empty')} hint={t('cards.emptyHint')} />
          ) : tableView ? (
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  {/* v8 ignore start -- the empty-rows ternary above guarantees
                     rows[0] exists; the ?? arm only satisfies the index type. */}
                  <tr>{entityPreviewOf(rows.value.rows[0] ?? {}, 6).map(([key]) => <th key={key}>{key}</th>)}</tr>
                  {/* v8 ignore stop */}
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
                  /* v8 ignore next -- narrowing guard: the zone renders only under the
                     selected/selectedRow guard at its head, so the closure's re-read
                     never finds undefined. */
                  <Button variant="ghost" size="sm" onClick={() => { const selected = state.selected; if (selected !== undefined) loadMore(selected, rows.value.page + 1) }}>{t('table.more')}</Button>
                ) : (
                  <span className={css.tableEnd}>{t('table.end')}</span>
                )}
              </div>
            </div>
          ) : (
            <ul className={css.cardStream}>
              {rows.value.rows.map((row, index) => (
                <EntityCard
                  key={typeof row.id === 'number' ? row.id : index}
                  row={row}
                  /* v8 ignore next -- narrowing guard: the card stream renders only
                     under the selected/selectedRow guard at the zone head; the ''
                     arm only satisfies the optional type. */
                  collection={state.selected ?? ''}
                  selectedLabel={selectedLabel}
                  orderLike={isOrderCollection(selectedRow)}
                  askInPlace={askInPlace}
                  updateRow={updateRow}
                  /* v8 ignore next -- narrowing guard: the zone renders only under the
                     selected/selectedRow guard at its head, so the closure's re-read
                     never finds undefined. */
                  reload={() => { const selected = state.selected; if (selected !== undefined) loadRows(selected) }}
                  t={t}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <section className={css.embedZone}>
        <a className={css.embedCard} href="/nocobase/" target="_blank" rel="noopener noreferrer">
          <span className={css.zoneTitle}>{t('embed.title')}</span>
          <p className={css.embedHint}>{t('embed.openHint')}</p>
          <span className={css.embedCardMeta}>
            <code className={css.embedUrl}>/nocobase/</code>
            <span className={css.embedOpen}>{t('embed.open')}</span>
          </span>
        </a>
      </section>
    </div>
  )
}

/** EntityCard props: the frozen row plus the page's actions. */
interface EntityCardProps {
  readonly row: Record<string, unknown>
  readonly collection: string
  readonly selectedLabel: string
  readonly orderLike: boolean
  readonly askInPlace: (prefix: string, detail: string) => void
  readonly updateRow: BizViewInjected['updateRow']
  readonly reload: () => void
  readonly t: PropsLocale<'business'>['t']
}

/** One entity card: preview cells, order status badge, ask/edit hand-offs, inline-edit fields. */
function EntityCard({ row, collection, selectedLabel, orderLike, askInPlace, updateRow, reload, t }: EntityCardProps): JSX.Element {
  const preview = entityPreviewOf(row, 3)
  const inlineFields = Object.keys(row).filter(isInlineEditable).slice(0, 3)
  const [editing, setEditing] = useState<string | undefined>(undefined)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  const status = orderLike ? orderStatusCell(row) : undefined
  const rowId = typeof row.id === 'number' ? row.id : undefined

  /** One field's inline-edit cell text: primitives render, objects read blank. */
  const cellTextOf = (field: string): string => {
    const value: unknown = row[field]
    if (value === null || value === undefined || typeof value === 'object') return ''
    if (typeof value === 'string') return value
    return typeof value === 'number' || typeof value === 'boolean' ? String(value) : ''
  }

  /** Commit one inline field edit through the gateway fast path. */
  const save = (field: string): void => {
    if (rowId === undefined || busy) return
    setBusy(true)
    setError(undefined)
    const value = typeof row[field] === 'number' && draft.trim() !== '' && !Number.isNaN(Number(draft))
      ? Number(draft)
      : draft
    updateRow(collection, rowId, { [field]: value }).then(() => {
      setEditing(undefined)
      setBusy(false)
      reload()
    }).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : String(cause))
      setBusy(false)
    })
  }

  return (
    <li className={css.entityCard}>
      <p className={css.entityLabel}>{entityLabelOf(row, selectedLabel)}</p>
      {status !== undefined && (
        <p className={css.orderStatus} data-testid="biz-order-status">{`${status[0]}：${status[1]}`}</p>
      )}
      <dl className={css.entityRows}>
        {preview.map(([key, value]) => (
          <div key={key} className={css.entityRow}><dt>{key}</dt><dd>{value}</dd></div>
        ))}
        {inlineFields.map(field => (
          <div key={field} className={css.entityRow}>
            <dt>{field}</dt>
            <dd className={css.inlineCell}>
              {editing === field
                ? (
                  <>
                    <input
                      className={css.inlineInput}
                      value={draft}
                      aria-label={field}
                      onChange={(event) => { setDraft(event.target.value) }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') save(field)
                        if (event.key === 'Escape') setEditing(undefined)
                      }}
                    />
                    <button type="button" className={css.inlineAction} disabled={busy} onClick={() => { save(field) }}>{t('inline.save')}</button>
                    <button type="button" className={css.inlineAction} onClick={() => { setEditing(undefined) }}>{t('inline.cancel')}</button>
                  </>
                )
                : (
                  <>
                    <span>{cellTextOf(field) === '' ? '—' : cellTextOf(field)}</span>
                    {rowId !== undefined && (
                      <button
                        type="button"
                        className={css.inlineEdit}
                        data-testid="biz-inline-edit"
                        onClick={() => {
                          setEditing(field)
                          setDraft(cellTextOf(field))
                          setError(undefined)
                        }}
                      >{t('inline.edit')}</button>
                    )}
                  </>
                )}
            </dd>
          </div>
        ))}
      </dl>
      {error !== undefined && <p className={css.inlineError} role="alert">{error}</p>}
      <div className={css.entityActions}>
        <Button variant="ghost" size="sm" onClick={() => { askInPlace(`${t('cards.askPromptPrefix')} `, JSON.stringify(preview)) }}>{t('cards.ask')}</Button>
        <Button variant="ghost" size="sm" onClick={() => { askInPlace(`${t('cards.editPromptPrefix')} `, `${selectedLabel} ${JSON.stringify(preview)}`) }}>{t('cards.edit')}</Button>
      </div>
    </li>
  )
}

/** Supplier360 props: the supplier rows plus the locale seat. */
interface Supplier360Props {
  readonly rows: readonly Record<string, unknown>[]
  readonly t: PropsLocale<'business'>['t']
}

/** The SRM supplier-360 zone: certificate and audit cells with expiry warnings. */
function Supplier360({ rows, t }: Supplier360Props): JSX.Element {
  const cards = rows.slice(0, 6).map(row => ({
    label: entityLabelOf(row, ''),
    certs: supplierCertCells(row),
  })).filter(card => card.certs.length > 0)
  if (cards.length === 0) return <></>
  return (
    <section className={css.supplierZone} data-testid="biz-supplier-360">
      <h3 className={css.zoneTitle}>{t('supplier.title')}</h3>
      <ul className={css.supplierList}>
        {cards.map(card => (
          <li key={card.label} className={css.supplierRow}>
            <span className={css.supplierName}>{card.label}</span>
            <span className={css.supplierCerts}>
              {card.certs.map(([field, value]) => {
                const days = daysUntil(value)
                return (
                  <span key={field} className={css.certChip} data-expiring={!Number.isNaN(days) && days <= 90 || undefined} title={value}>
                    {`${field}：${value.slice(0, 18)}${value.length > 18 ? '…' : ''}`}
                    {Number.isNaN(days) || days > 90 ? '' : days < 0 ? t('supplier.expired') : t('supplier.expiring', { days: String(days) })}
                  </span>
                )
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
