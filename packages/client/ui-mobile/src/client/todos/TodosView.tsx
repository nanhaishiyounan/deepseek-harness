/**
 * The W6-B1 todos page (`#/todos`, G2): the signed-in user's open approval
 * todos read live from wfl_approval_todos over the gateway's realtime
 * nocobase forward — segmented counts by document type, pull-to-refresh plus
 * a 5s poll (a document approved on the PC side disappears here within one
 * poll), and per-row 同意/驳回 actions that open a fill-assistant session
 * carrying the acting-user gate. No fabricated state: every chip and row is
 * a server row.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Button, Input, Modal, PullToRefresh, Toast } from 'antd-mobile'
import { Inbox } from 'lucide-react'
import { portalContainer } from '../portal.ts'
import { loadIdentity } from '../auth.ts'
import { EmptyState, SkelCard } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import { goBackOr, navigate } from '../router.ts'
import { logClientError, messageOf } from '../hooks.ts'
import { stateWordOf } from '../docsCatalog.ts'
import { actOnTodo, enrichTodoRows, listMyTodos, type TodoRow } from '../ledgerService.ts'
import css from './todos.module.css'

/** The page's load state (one shape for the first read and every refresh). */
type TodosRead = { readonly rows: readonly TodoRow[] } | { readonly error: string }

/** The todos page. */
export function TodosView(): JSX.Element {
  const identity = loadIdentity()
  const [read, setRead] = useState<TodosRead | undefined>(undefined)
  const [acting, setActing] = useState(false)
  /** The same-frame double-tap lock: the confirm dialog's action must not double-fire inside one render frame (state lags a frame). */
  const actingRef = useRef(false)
  /** The row an action dialog is open on, with its typed-in comment. */
  const [pending, setPending] = useState<{ row: TodoRow; action: 'approve' | 'reject'; comment: string } | undefined>(undefined)

  const refresh = useCallback(async (): Promise<void> => {
    if (identity === undefined) return
    try {
      setRead({ rows: await enrichTodoRows(await listMyTodos(identity.username)) })
    } catch (cause) {
      logClientError('todos.list', cause)
      setRead({ error: messageOf(cause) })
    }
  }, [identity])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The 5s poll (G2): another surface's act closes the todo server-side;
  // the next poll drops the row here — no push channel needed at this scale.
  useEffect(() => {
    const timer = window.setInterval(() => { void refresh() }, 5000)
    return () => { window.clearInterval(timer) }
  }, [refresh])

  const segments = useMemo(() => {
    if (read === undefined || 'error' in read) return []
    const counts = new Map<string, number>()
    for (const row of read.rows) counts.set(row.docLabel, (counts.get(row.docLabel) ?? 0) + 1)
    return [...counts.entries()]
  }, [read])

  const act = async (): Promise<void> => {
    if (pending === undefined || identity === undefined) return
    if (actingRef.current) return
    actingRef.current = true
    setActing(true)
    try {
      const sessionId = await actOnTodo(pending.row, pending.action, pending.comment)
      setPending(undefined)
      Toast.show({ content: '已交由 AI 同事执行审批' })
      navigate(`#/chat/${sessionId}`)
    } catch (cause) {
      logClientError('todos.act', cause)
      Toast.show({ content: messageOf(cause) })
    } finally {
      actingRef.current = false
      setActing(false)
    }
  }

  return (
    <div className={css.page}>
      <PageNav title="我的待办" onBack={() => { goBackOr('#/') }} />
      <PullToRefresh onRefresh={async () => { await refresh() }}>
        <div className={css.body}>
          <section className={css.segRow} aria-label="按单据类型">
            {segments.length > 0
              ? segments.map(([label, count]) => (
                <span key={label} className={css.segChip}>
                  <span className={css.segCount}>{String(count)}</span>
                  {label}
                </span>
              ))
              : <span className={css.segHint}>{read === undefined ? '加载中…' : '待办'}</span>}
          </section>

          {read === undefined && (
            <div className={css.skelGroup} role="status" aria-label="正在加载待办">
              <SkelCard />
              <SkelCard />
              <SkelCard />
            </div>
          )}
          {'error' in (read ?? {}) && read !== undefined && 'error' in read && (
            <div className={css.errorCard} role="alert">
              待办加载失败：{read.error}
              <Button type="button" fill="none" size="small" className={css.retryLink} onClick={() => { void refresh() }}>重试</Button>
            </div>
          )}
          {read !== undefined && !('error' in read) && read.rows.length === 0 && (
            <EmptyState
              icon={<Inbox size={22} strokeWidth={1.8} />}
              title="当前没有待办"
              description="PC 端或 AI 同事提交的单据会出现在这里"
              action={{ label: '看看已登记的单据', onClick: () => { navigate('#/docs') } }}
            />
          )}
          {read !== undefined && !('error' in read) && read.rows.map(row => (
            <article key={row.id} className={css.todoCard} data-testid="todo-row">
              <header className={css.todoHead}>
                <span className={css.todoLabel}>{row.docLabel}{row.kind === 'cc' ? ' · 抄送' : ''}</span>
                <span className={css.todoState}>{stateWordOf(row.docType, row.state)}</span>
              </header>
              <div className={css.todoTitle}>{row.docTitle ?? `#${String(row.docId)}`}</div>
              <footer className={css.todoFoot}>
                <Button
                  type="button" fill="none" size="small"
                  className={css.docLink}
                  onClick={() => { navigate(`#/docs/${row.docType}/${String(row.docId)}`) }}
                >
                  查看单据
                </Button>
                {row.kind === 'cc' ? (
                  <span className={css.ccNote}>抄送只读</span>
                ) : (
                  <span className={css.todoActions}>
                    <Button
                      type="button" size="small"
                      disabled={acting}
                      onClick={() => { setPending({ row, action: 'reject', comment: '' }) }}
                    >
                      驳回
                    </Button>
                    <Button
                      type="button" color="primary" size="small"
                      disabled={acting}
                      onClick={() => { setPending({ row, action: 'approve', comment: '' }) }}
                    >
                      同意
                    </Button>
                  </span>
                )}
              </footer>
            </article>
          ))}
        </div>
      </PullToRefresh>

      {pending !== undefined && (
        <Modal
          visible
          getContainer={portalContainer}
          title={pending.action === 'approve' ? `同意 · ${pending.row.docLabel}` : `驳回 · ${pending.row.docLabel}`}
          content={(
            <div className={css.dialogBody}>
              <p className={css.dialogDoc}>{pending.row.docTitle ?? `#${String(pending.row.docId)}`}</p>
              <Input
                placeholder="审批意见（可选）"
                value={pending.comment}
                onChange={(comment) => { setPending({ ...pending, comment }) }}
                aria-label="审批意见"
              />
              <p className={css.dialogHint}>将由 AI 同事以当前登录身份执行，服务端校验待办归属</p>
            </div>
          )}
          closeOnAction
          actions={[
            { key: 'cancel', text: '取消' },
            { key: 'confirm', text: pending.action === 'approve' ? '同意' : '驳回', danger: pending.action === 'reject', onClick: () => { void act() } },
          ]}
          onClose={() => { setPending(undefined) }}
        />
      )}
    </div>
  )
}
