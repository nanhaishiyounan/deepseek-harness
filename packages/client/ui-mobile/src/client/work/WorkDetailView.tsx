/**
 * The work detail page (02 §2.5, 03 §6.3): the ticket head (work number +
 * 44px work stamp), the context card (the read-only suggestion quote and the
 * source-chat back-link), the agent execution timeline (the TimelineDataSource
 * two-mode abstraction — live polls the exec session, demo advances the
 * simulated script and never touches the durable log), the result card
 * (review onward), and the bottom action row that switches by status. The
 * timeline settling under a doing item flips it to review, records the result,
 * and posts the M3 notice to the source chat (the「模型可见⟺日志可重建」red
 * line); the rework path posts M4 to the exec session.
 */

import { useEffect, useMemo, useState, useSyncExternalStore, type JSX } from 'react'
import { Button, Modal, ProgressBar, TextArea, Toast } from 'antd-mobile'
import { Check } from 'lucide-react'
import { portalContainer } from '../portal.ts'
import { buildExecDirectiveMessage, buildReworkMessage, buildWorkDoneMessage, startWorkExecution } from '../actions.ts'
import { PageNav } from '../PageNav.tsx'
import { messageOf } from '../hooks.ts'
import { goBackOr, navigate } from '../router.ts'
import { currentRunMode } from '../runMode.ts'
import { createSession, promptSession } from '../sessionsService.ts'
import {
  registerExecSession, subscribeWork, transitionWorkItem, updateWorkItem, workOf, workSnapshot, type WorkItem,
} from '../workStore.ts'
import { ReportCard } from '../messages/ReportCard.tsx'
import { demoTimeline, liveTimeline, type TimelineDataSource, type TimelineSnapshot, type TimelineStep } from './workTimeline.ts'
import { WorkStamp } from './WorkStamp.tsx'
import css from './work.module.css'

/** Detail-page props: the work item id from the route. */
export interface WorkDetailViewProps {
  readonly workId: string
}

/** The idle snapshot a not-yet-started item renders. */
const EMPTY_TIMELINE: TimelineSnapshot = { steps: [], finished: false, resultSummary: undefined }

/** The unsubscribe no-op for the timeline-less case. */
const UNSUBSCRIBE_NEVER = (): (() => void) => () => {}

/**
 * The display work number: WK-{year}-{rank} with the rank being the item's
 * creation ordinal (its position in the store's item list; a display-only
 * projection).
 * @param item - the work item.
 * @param items - the whole store items.
 * @returns the ticket-number string.
 */
export function workNumberOf(item: WorkItem, items: readonly WorkItem[]): string {
  const rank = items.findIndex(entry => entry.id === item.id) + 1
  return `WK-${String(new Date(item.createdAt).getFullYear())}-${String(rank).padStart(4, '0')}`
}

/**
 * The work detail page.
 * @param props - the work item id.
 * @returns the page tree.
 */
export function WorkDetailView({ workId }: WorkDetailViewProps): JSX.Element {
  const store = useSyncExternalStore(subscribeWork, workSnapshot)
  const item = workOf(store.items, workId)
  const [mode, setMode] = useState<'live' | 'demo' | undefined>(undefined)
  const [reworkOpen, setReworkOpen] = useState(false)
  const [reworkReason, setReworkReason] = useState('')
  const [artifactOpen, setArtifactOpen] = useState(false)

  // The run mode resolves once (the explicit switch is synchronous in tests).
  useEffect(() => {
    let alive = true
    void currentRunMode().then((value) => { if (alive) setMode(value) })
    return () => { alive = false }
  }, [])

  const source = useMemo<TimelineDataSource | undefined>(() => {
    if (item === undefined || item.status === 'todo') return undefined
    if (mode === 'live' && item.execSessionId !== undefined) return liveTimeline(item.execSessionId)
    if (mode === 'live') return undefined
    return demoTimeline(item.title, 1000, item.status !== 'doing')
  }, [item, mode])

  const timeline = useSyncExternalStore(
    source?.subscribe ?? UNSUBSCRIBE_NEVER,
    () => source?.snapshot ?? EMPTY_TIMELINE,
  )

  // A settled timeline under a doing item completes the work: record the
  // result, flip to review, and notify the source chat (M3). The store read
  // guards the double-run (StrictMode and the broadcast re-entry).
  useEffect(() => {
    if (!timeline.finished) return
    const current = workOf(workSnapshot().items, workId)
    if (current === undefined || current.status !== 'doing') return
    /* v8 ignore next -- both timeline sources mark finished only with a summary in hand. */
    const summary = timeline.resultSummary ?? ''
    updateWorkItem(workId, { result: { summary, finishedAt: Date.now() } })
    transitionWorkItem(workId, 'review')
    if (current.sourceSessionId !== undefined) {
      void promptSession(current.sourceSessionId, buildWorkDoneMessage(current, summary)).catch((cause: unknown) => {
        Toast.show({ content: messageOf(cause) })
      })
    }
  }, [timeline.finished, timeline.resultSummary, workId])

  if (item === undefined) {
    return (
      <div className={css.detailPage}>
        <PageNav title="工作详情" onBack={() => { goBackOr('#/work') }} />
        <div className={css.detailBody}>
          <p className={css.timelineEmpty}>该工作不存在或已删除</p>
        </div>
      </div>
    )
  }

  const onStart = (): void => {
    void startWorkExecution(item).then((outcome) => { Toast.show({ content: outcome.message }) })
  }

  // The doing escape hatch (a hung LLM run must never trap the item): a
  // requeue re-sends the M2 directive to the exec session (creating one when
  // the item never got it); a manual completion records the timeline's tail
  // (or the manual fallback line), flips to review, and posts M3 — the same
  // durable-log lane the auto completion rides.
  const onRequeue = (): void => {
    void (async () => {
      let execSessionId = item.execSessionId
      if (execSessionId === undefined) {
        execSessionId = await createSession()
        registerExecSession(item.id, execSessionId)
      }
      await promptSession(execSessionId, buildExecDirectiveMessage(item))
      Toast.show({ content: '已重新下发执行指令' })
    })().catch((cause: unknown) => {
      Toast.show({ content: messageOf(cause) })
    })
  }

  const onManualDone = (): void => {
    const summary = timeline.resultSummary ?? '人工确认完成（执行会话未产出摘要）'
    updateWorkItem(workId, { result: { summary, finishedAt: Date.now() } })
    transitionWorkItem(workId, 'review')
    const current = workOf(workSnapshot().items, workId)
    if (current !== undefined && current.sourceSessionId !== undefined) {
      void promptSession(current.sourceSessionId, buildWorkDoneMessage(current, summary)).catch((cause: unknown) => {
        Toast.show({ content: messageOf(cause) })
      })
    }
    Toast.show({ content: '已手动完成，进入待确认' })
  }

  const onConfirm = (): void => {
    transitionWorkItem(workId, 'done')
    Toast.show({ content: '已确认完成' })
  }

  const onRework = (): void => {
    const directive = buildReworkMessage(reworkReason)
    if (item.execSessionId !== undefined) {
      void promptSession(item.execSessionId, directive).catch((cause: unknown) => {
        Toast.show({ content: messageOf(cause) })
      })
    }
    transitionWorkItem(workId, 'doing')
    setReworkOpen(false)
    setReworkReason('')
    Toast.show({ content: '已打回，AI 同事将返工' })
  }

  /**
   * The dialog's close arm: no mask-click or close-button path exists on this
   * dialog (the actions own closing), so the slot only satisfies the Modal
   * protocol.
   */
  /* v8 ignore next 3 -- the actions own closing; nothing triggers onClose. */
  const closeReworkDialog = (): void => {
    setReworkOpen(false)
  }

  const dueSoon = item.due !== undefined && new Date(`${item.due}T23:59:59`).getTime() - Date.now() < 2 * 86_400_000
  // Route-ready ids: const extraction keeps the JSX callbacks on the
  // narrow type (no undefined under a rendered guard).
  const execChatId = item.execSessionId
  const sourceChatId = item.sourceSessionId

  return (
    <div className={css.detailPage}>
      <PageNav title={item.title} onBack={() => { goBackOr('#/work') }} />
      {item.demo && <div className={css.demoBanner}>演示数据 · 可在「我的 · 设置」清除</div>}
      <div className={css.detailBody}>
        <section className={css.ticketHead} aria-label="工作票头">
          <div className={css.ticketMain}>
            <span className={css.ticketNo}>{workNumberOf(item, store.items)}</span>
            <span className={css.ticketStatus}>
              <span>创建 {new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span>负责人 <span className={css.ticketStatusValue}>{item.owner}</span></span>
              <span>
                截止{' '}
                <span className={`${css.ticketStatusValue} ${dueSoon ? css.dueSoon : ''}`}>
                  {item.due ?? '未定'}
                </span>
              </span>
            </span>
          </div>
          <WorkStamp status={item.status} />
        </section>

        <section className={css.detailCard} aria-label="工作上下文">
          <h2 className={css.tierHead}>上下文</h2>
          {item.suggestion !== undefined && item.suggestion.trim() !== ''
            ? <blockquote className={css.quote}>{item.suggestion}</blockquote>
            : <p className={css.quoteEmpty}>创建时未附 AI 建议</p>}
          {item.sourceSessionId !== undefined && (
            <Button
              type="button"
              color="primary"
              fill="none"
              size="small"
              className={css.sourceLink}
              onClick={() => { navigate(`#/chat/${item.sourceSessionId}`) }}
            >
              回到源对话 ›
            </Button>
          )}
        </section>

        <section className={css.detailCard} aria-label="执行时间线">
          <h2 className={css.tierHead}>执行时间线</h2>
          {timeline.steps.length === 0 && (
            <p className={css.timelineEmpty}>
              {item.status === 'todo' ? '尚未开始执行' : mode === 'live' && item.execSessionId === undefined ? '执行会话未建立' : '正在准备…'}
            </p>
          )}
          {timeline.steps.length > 0 && (
            <div className={css.progressBox} aria-label="执行进度">
              <span className={css.progressLabel}>
                执行进度
                <em className={css.progressNum}>{`${String(timeline.steps.filter(step => step.state === 'done').length)}/${String(timeline.steps.length)}`}</em>
              </span>
              <ProgressBar
                percent={Math.round(timeline.steps.filter(step => step.state === 'done').length / timeline.steps.length * 100)}
                className={css.progressTrack as string}
                style={{ '--fill-color': 'var(--dshm-user-grad)' }}
              />
            </div>
          )}
          <div className={css.timeline}>
            {timeline.steps.map((step, index) => (
              <div key={`${index}-${step.label}`} className={css.stepRow}>
                {step.time !== undefined && <span className={css.stepTime}>{step.time}</span>}
                <span className={css.stepAxis} aria-hidden="true">
                  <span
                    className={`${css.stepDot} ${step.state === 'done'
                      ? css.stepDone
                      : step.state === 'running'
                        ? css.stepRunning
                        : css.stepError}`}
                  />
                  <span className={css.stepLine} aria-hidden="true" />
                </span>
                <span className={css.stepMain}>
                  <span className={css.stepLabel}>{step.label}</span>
                  {stepDetailOf(step)}
                </span>
              </div>
            ))}
          </div>
        </section>

        {(item.status === 'review' || item.status === 'done') && item.result !== undefined && (
          <section className={`${css.detailCard} ${css.resultCard}`} aria-label="执行结果">
            <div className={css.cardHeadRow}>
              <span className={css.resultSeal}><Check size={12} strokeWidth={3} aria-hidden="true" /></span>
              <span className={css.resultTitle}>结果</span>
            </div>
            <p className={css.resultSummary}>{item.result.summary}</p>
            <span className={css.resultMeta}>
              完成于 {new Date(item.result.finishedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            {item.artifact !== undefined && (
              <>
                <Button
                  type="button"
                  color="primary"
                  fill="none"
                  size="small"
                  className={css.resultLink}
                  onClick={() => { setArtifactOpen(open => !open) }}
                >
                  {artifactOpen ? '收起报告' : '查看完整报告 ›'}
                </Button>
                {artifactOpen && <ReportCard payload={item.artifact} />}
              </>
            )}
          </section>
        )}
      </div>

      <div className={css.detailActions}>
        {item.status === 'todo' && (
          <Button type="button" color="primary" size="small" className={css.actionPrimary} onClick={onStart}>开始执行</Button>
        )}
        {item.status === 'doing' && (
          <>
            <span className={css.doingNote}>AI 同事执行中…</span>
            {execChatId !== undefined && (
              <Button
                type="button"
                fill="outline"
                size="small"
                className={css.actionSecondary}
                style={{ '--border-color': 'var(--dshm-line)' }}
                onClick={() => { navigate(`#/chat/${execChatId}`) }}
              >
                查看执行会话
              </Button>
            )}
            <Button type="button" fill="outline" size="small" className={css.actionSecondary} style={{ '--border-color': 'var(--dshm-line)' }} onClick={onRequeue}>重新执行</Button>
            <Button type="button" color="primary" size="small" className={css.actionPrimary} onClick={onManualDone}>手动完成</Button>
          </>
        )}
        {item.status === 'review' && (
          <>
            <Button type="button" fill="outline" size="small" className={css.actionSecondary} style={{ '--border-color': 'var(--dshm-line)' }} onClick={() => { setReworkOpen(true) }}>打回修改</Button>
            <Button type="button" color="primary" size="small" className={css.actionPrimary} onClick={onConfirm}>确认完成</Button>
          </>
        )}
        {item.status === 'done' && sourceChatId !== undefined && (
          <Button
            type="button"
            color="primary"
            size="small"
            className={css.actionPrimary}
            onClick={() => { navigate(`#/chat/${sourceChatId}`) }}
          >
            回到聊天
          </Button>
        )}
      </div>

      <Modal
        visible={reworkOpen}
        title="打回该工作"
        getContainer={portalContainer}
        onClose={closeReworkDialog}
        content={(
          <TextArea
            placeholder="补充返工原因（可选）"
            value={reworkReason}
            onChange={setReworkReason}
            rows={2}
            maxLength={100}
            showCount
          />
        )}
        actions={[
          { key: 'cancel', text: '取消', onClick: () => { setReworkOpen(false) } },
          { key: 'confirm', text: '确认打回', onClick: onRework },
        ]}
      />
    </div>
  )
}

/** The detail line's node; no current timeline source emits one yet (the slot stays for the source that will). */
/* v8 ignore next 4 -- no current timeline source sets step.detail. */
function stepDetailOf(step: TimelineStep): JSX.Element | null {
  if (step.detail === undefined) return null
  return <span className={css.stepDetail}>{step.detail}</span>
}
