/**
 * The W6-B1 documents pages (G6): `#/docs` renders the signed-in role's
 * collection directory (the catalog's role whitelist — buyer sees the
 * procurement domain), `#/docs/:collection` the live row list
 * (pull-to-refresh over nocobase.list), and `#/docs/:collection/:id` the
 * row detail — every field the row carries plus the approval trail
 * (wfl_approval_records for the document), read straight from NocoBase with
 * no conversation round in between.
 *
 * W6-R1: every `#/docs/*` deep link re-checks the role whitelist (the
 * catalog layer was display-only — a buyer deep-linking #/docs/qm_inspections
 * now bounces back to the directory); the server's scope table is the
 * second, authoritative layer. List pages cap at fifty rows and say so; the
 * trail reads `acted_at` (the engine table's timestamp column); read
 * failures leave a client_error trace and render the error card, never a
 * silent dash; detail field names render the schema's zh titles when the
 * metadata read lands.
 */

import { useCallback, useEffect, useState, type JSX } from 'react'
import { Button, PullToRefresh, Skeleton, Toast } from 'antd-mobile'
import { FileText, ArrowLeft } from 'lucide-react'
import { loadIdentity } from '../auth.ts'
import { EmptyState, SkelCard } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import { goBackOr, navigate } from '../router.ts'
import { logClientError, messageOf } from '../hooks.ts'
import { rpc } from '../rpc.ts'
import { collectionAllowedFor, docLabelOf, docTitleFieldOf, stateWordOf, visibleCollectionsOf } from '../docsCatalog.ts'
import css from './docs.module.css'

/** One raw wire row (structural read). */
type WireRow = Record<string, unknown>

/**
 * The label engine's origin for the batch-barcode card (W6-B3): configurable
 * per deployment (W6-R3 — a deployment-varying base is never a hardcoded
 * constant). The host page may inject `window.__LABEL_ENGINE_BASE__` (the
 * gateway-served shell can point it at the `/label/*` proxy); unset keeps
 * the demo posture of the engine beside the gateway. Read per render, not
 * once at module load — the injection may land after the bundle evaluates.
 */
const labelEngineBase = (): string => {
  const injected = (globalThis as { readonly __LABEL_ENGINE_BASE__?: unknown }).__LABEL_ENGINE_BASE__
  return typeof injected === 'string' && injected !== '' ? injected : 'http://127.0.0.1:13110'
}

/** The list page's fixed page size (the truncation notice's threshold). */
const LIST_PAGE_SIZE = 50

const cell = (row: WireRow, field: string): string => {
  const value = row[field]
  if (value === null || value === undefined || value === '') return '—'
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
}

/** The state column one collection's rows actually carry (doc_status first, posting collections ride theirs). */
const stateOf = (row: WireRow): unknown => row['doc_status'] ?? row['status'] ?? row['lifecycle_status']

/** The documents surface (three faces by route param, deep-links guarded). */
export function DocsView(props: { readonly collection: string | undefined; readonly rowId: string | undefined }): JSX.Element {
  const guard = useDocsGuard(props.collection)
  if (guard !== undefined || props.collection === undefined) return <DocsIndex />
  if (props.rowId === undefined) return <DocsList collection={props.collection} />
  return <DocsDetail collection={props.collection} rowId={props.rowId} />
}

/**
 * The deep-link role guard (W6-R1 P0-2 layer 1): a configured role's
 * whitelist is re-checked on every collection route; a bounce redirects to
 * the directory once and toasts why. Unconfigured accounts stay fail-open
 * (the server's scope table owns their boundary).
 * @param collection - the routed collection name.
 * @returns true while the bounce is pending (render the directory).
 */
function useDocsGuard(collection: string | undefined): true | undefined {
  const [bounced, setBounced] = useState(false)
  useEffect(() => {
    if (collection === undefined || bounced) return
    const identity = loadIdentity()
    if (identity === undefined) return
    if (collectionAllowedFor(identity.username, collection) === false) {
      logClientError('docs.guard', `账号 ${identity.username} 深链越权集合 ${collection}，已重定向`)
      Toast.show({ content: `无权访问该单据类型（${docLabelOf(collection)}）` })
      navigate('#/docs')
      setBounced(true)
    }
  }, [collection, bounced])
  return bounced ? true : undefined
}

/** `#/docs`: the role-filtered collection directory. */
function DocsIndex(): JSX.Element {
  const identity = loadIdentity()
  const collections = visibleCollectionsOf(identity?.username ?? '')
  return (
    <div className={css.page}>
      <PageNav title="单据" onBack={() => { goBackOr('#/') }} />
      <div className={css.body}>
        <p className={css.indexHint}>{identity === undefined ? '未登录，仅展示通用目录' : `${identity.nickname} · 常用单据`}</p>
        <div className={css.indexGrid}>
          {collections.map(entry => (
            <button
              key={entry.collection}
              type="button"
              className={css.indexCard}
              data-testid="docs-collection"
              onClick={() => { navigate(`#/docs/${entry.collection}`) }}
            >
              <FileText size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className={css.indexLabel}>{entry.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

/** `#/docs/:collection`: the live row list. */
function DocsList({ collection }: { readonly collection: string }): JSX.Element {
  const [read, setRead] = useState<{ rows: WireRow[] } | { error: string } | undefined>(undefined)
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const page = await rpc('nocobase.list', { collection, page: 1, page_size: LIST_PAGE_SIZE, sort: ['-id'] })
      setRead({ rows: page.rows as WireRow[] })
    } catch (cause) {
      logClientError('docs.list', cause)
      setRead({ error: messageOf(cause) })
    }
  }, [collection])
  useEffect(() => { void refresh() }, [refresh])

  return (
    <div className={css.page}>
      <PageNav
        title={docLabelOf(collection)}
        onBack={() => { goBackOr('#/docs') }}
        right={(
          <button type="button" className={css.headBtn} aria-label="返回目录" onClick={() => { navigate('#/docs') }}>
            <ArrowLeft size={16} aria-hidden="true" />
            目录
          </button>
        )}
      />
      <PullToRefresh onRefresh={async () => { await refresh() }}>
        <div className={css.body}>
          {read === undefined && (
            <div className={css.skelGroup} role="status" aria-label="正在加载单据">
              <SkelCard />
              <SkelCard />
              <SkelCard />
            </div>
          )}
          {read !== undefined && 'error' in read && (
            <div className={css.errorCard} role="alert">
              单据加载失败：{read.error}
              <Button type="button" fill="none" size="small" className={css.retryLink} onClick={() => { void refresh() }}>重试</Button>
            </div>
          )}
          {read !== undefined && !('error' in read) && read.rows.length === 0 && (
            <EmptyState
              icon={<FileText size={22} strokeWidth={1.8} />}
              title="还没有单据"
              description="去对话登记第一条吧"
              action={{ label: '找 AI 同事登记', onClick: () => { navigate('#/agents') } }}
            />
          )}
          {read !== undefined && !('error' in read) && read.rows.length === LIST_PAGE_SIZE && (
            <div className={css.truncateNote} role="status">仅显示最新 {String(LIST_PAGE_SIZE)} 条，更早的单据请缩小范围或到 PC 端查询</div>
          )}
          {read !== undefined && !('error' in read) && read.rows.map((row) => {
            const id = Number(row['id'] ?? 0)
            const state = stateOf(row)
            return (
              <button
                key={id}
                type="button"
                className={css.listRow}
                data-testid="docs-row"
                onClick={() => { navigate(`#/docs/${collection}/${String(id)}`) }}
              >
                <span className={css.rowTitle}>{cell(row, docTitleFieldOf(collection))}</span>
                <span className={css.rowMeta}>
                  {typeof state === 'string' && <span className={css.rowState}>{stateWordOf(collection, state)}</span>}
                  <span className={css.rowId}>#{String(id)}</span>
                </span>
              </button>
            )
          })}
        </div>
      </PullToRefresh>
    </div>
  )
}

/** One approval-trail row (the detail's timeline). */
interface TrailRow {
  readonly action: string
  readonly approver: string
  readonly fromState: string
  readonly toState: string
  readonly comment: string
  readonly at: string
}

/** `#/docs/:collection/:id`: the row detail (fields + approval trail). */
function DocsDetail({ collection, rowId }: { readonly collection: string; readonly rowId: string }): JSX.Element {
  const id = Number(rowId)
  const [doc, setDoc] = useState<{ row: WireRow } | { error: string } | undefined>(undefined)
  const [trail, setTrail] = useState<readonly TrailRow[]>([])
  /** The collection's field titles (zh names over snake_case), once loaded. */
  const [fieldTitles, setFieldTitles] = useState<ReadonlyMap<string, string>>(new Map())

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const value = await rpc('nocobase.get', { collection, id })
      setDoc({ row: value.row as WireRow })
    } catch (cause) {
      logClientError('docs.detail', cause)
      setDoc({ error: messageOf(cause) })
    }
    try {
      const records = await rpc('nocobase.list', {
        collection: 'wfl_approval_records',
        filter: [
          { field: 'doc_type', op: 'eq', value: collection },
          { field: 'doc_id', op: 'eq', value: id },
        ],
        page: 1,
        page_size: 30,
        sort: ['id'],
      })
      setTrail((records.rows as WireRow[]).map(row => ({
        action: cell(row, 'action'),
        approver: cell(row, 'approver'),
        fromState: cell(row, 'from_state'),
        toState: cell(row, 'to_state'),
        comment: cell(row, 'comment'),
        at: cell(row, 'acted_at'),
      })))
    } catch (cause) {
      // The trail is supplementary: a read failure leaves it empty and
      // traced, the fields above still render.
      logClientError('docs.trail', cause)
      setTrail([])
    }
  }, [collection, id])
  useEffect(() => { void refresh() }, [refresh])

  // One metadata read for the row's zh field titles (schema names beat
  // snake_case when the titles land; the raw name stays the fallback).
  useEffect(() => {
    let alive = true
    void rpc('nocobase.listMeta', {}).then((meta) => {
      if (!alive) return
      const fields = meta.collections.find(entry => entry.name === collection)?.fields ?? []
      setFieldTitles(new Map(fields.flatMap(field => field.title === undefined ? [] : [[field.name, field.title] as const])))
    }, () => {
      // A failed metadata read keeps the raw field names; the fields still render.
    })
    return () => { alive = false }
  }, [collection])

  const state = doc !== undefined && 'row' in doc ? stateOf(doc.row) : undefined
  return (
    <div className={css.page}>
      <PageNav title={docLabelOf(collection)} onBack={() => { goBackOr(`#/docs/${collection}`) }} />
      <PullToRefresh onRefresh={async () => { await refresh() }}>
        <div className={css.body}>
          <section className={css.detailCard} aria-label="单据字段">
            <header className={css.detailHead}>
              <span className={css.detailTitle}>{doc !== undefined && 'row' in doc ? cell(doc.row, docTitleFieldOf(collection)) : '…'}</span>
              {typeof state === 'string' && <span className={css.detailState}>{stateWordOf(collection, state)}</span>}
            </header>
            {doc === undefined && <Skeleton.Paragraph lineCount={4} animated />}
            {doc !== undefined && 'error' in doc && (
              <div className={css.errorCard} role="alert">
                单据读取失败：{doc.error}
                <Button type="button" fill="none" size="small" className={css.retryLink} onClick={() => { void refresh() }}>重试</Button>
              </div>
            )}
            {doc !== undefined && 'row' in doc && (
              <dl className={css.fieldList}>
                {Object.entries(doc.row).map(([field, value]) => (
                  <div key={field} className={css.fieldRow}>
                    <dt className={css.fieldName}>{fieldTitles.get(field) ?? field}</dt>
                    <dd className={css.fieldValue}>{value === null || value === undefined || value === '' ? '—' : cell(doc.row, field)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {doc !== undefined && 'row' in doc && typeof doc.row['lot_no'] === 'string' && doc.row['lot_no'] !== '' && (
            <section className={css.detailCard} aria-label="批次条码">
              <h2 className={css.trailTitle}>批次条码</h2>
              <p className={css.barcodeHint}>GS1-128（01 GTIN / 10 批号 / 11 生产 / 17 到期）——可供他机扫描（打印中心：条码打印页）</p>
              <img
                className={css.barcodeImg}
                src={`${labelEngineBase()}/label/lot.svg?lot_no=${encodeURIComponent(doc.row['lot_no'])}&code=gs1&size=100x50`}
                alt={`批次 ${doc.row['lot_no']} 条码标签`}
                onError={(event) => {
                  logClientError('docs.barcode', `批次 ${doc.row['lot_no']} 条码图加载失败`)
                  event.currentTarget.replaceWith(Object.assign(document.createElement('p'), { textContent: '条码引擎未响应（引擎服务需与本机网关同启）', className: css.barcodeFallback }))
                }}
              />
            </section>
          )}

          <section className={css.detailCard} aria-label="审批轨迹">
            <h2 className={css.trailTitle}>审批轨迹</h2>
            {trail.length === 0 && <p className={css.trailEmpty}>无审批记录（未送审或非审批类单据）</p>}
            {trail.length > 0 && (
              <ol className={css.trailList}>
                {trail.map((row, index) => (
                  <li key={index} className={css.trailRow}>
                    <span className={css.trailDot} aria-hidden="true" />
                    <span className={css.trailTexts}>
                      <span className={css.trailLine}>
                        {row.action === 'submit' ? '提交送审' : row.action === 'approve' ? '同意' : row.action === 'reject' ? '驳回' : row.action === 'void' ? '作废' : row.action}
                        {' · '}
                        {stateWordOf(collection, row.fromState)} → {stateWordOf(collection, row.toState)}
                      </span>
                      <span className={css.trailMeta}>{row.approver}{row.comment !== '—' ? ` · ${row.comment}` : ''}{row.at !== '—' ? ` · ${row.at}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </PullToRefresh>
    </div>
  )
}
