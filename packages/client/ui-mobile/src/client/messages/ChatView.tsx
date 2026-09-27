/**
 * The AI-colleague conversation page (v6 chat surface): the folded flow
 * renders the item kinds — narrative bubbles (the rich-content seam with deep
 * code plates), tool rows, the v3 three-tier draft cards with fenced
 * 确认写入/驳回 actions, the ask/field-ask interaction bubbles, action badges,
 * and receipt cards. A session with no business messages shows the local
 * welcome (never a logged message); the composer rides the v6 input bar — the
 * + entry over the slide-up quick panel (the colleague's own starters plus
 * the three placeholder tools), the rounded textarea, and the gradient send
 * button. v2-legacy cards keep their two-step review flow. Edits persist to
 * localStorage until the confirm consumes them; card phases replay from the
 * durable log. The page renders as a full-screen layer: no tab bar under it,
 * an antd-mobile NavBar over it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { Button, SpinLoading, TextArea, Toast, type TextAreaRef } from 'antd-mobile'
import { BarChart3, CalendarClock, Check, ClipboardCheck, FileText, Mic, Paperclip, PenLine, Plus, Search, Send, Smile, Square, X } from 'lucide-react'
import type { NocobaseFieldView, SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { Avatar, NoticeCard, RunningRow } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import { loadIdentity } from '../auth.ts'
import { dispatchReportAction } from '../actions.ts'
import { colleagueColor, colleagueOf, welcomeOf, type ColleagueVisual, type Welcome } from '../colleagues.ts'
import { foldHistory, type ChatItem } from '../fold.ts'
import { goBackOr } from '../router.ts'
import { currentRunMode } from '../runMode.ts'
import { rpc } from '../rpc.ts'
import { useAsync, usePoll } from '../hooks.ts'
import { cancelSession, listAiEmployees, listSessions, pendingPresetOf, promptSession, readHistory, titleOf } from '../sessionsService.ts'
import { dayLabelOf } from '../sessionsService.ts'
import { mergeCardValues, nextSystemNumber } from '../systemFields.ts'
import { deriveCardStates, type CardPhase, type DerivedCardState } from '../cardState.ts'
import { clearDraftEdits, clearPendingReview, loadDraftEdits, markPendingReview, saveDraftEdits } from '../draftStore.ts'
import { KgEvidenceSection } from '../kg/KgEvidence.tsx'
import { DraftCard, ReceiptCard, RejectedCard, ReviewCard, type CollectionFieldMeta, type FieldMetas } from '../forms/task-cards.tsx'
import { DraftCard as DraftCardV3 } from '../forms/v3/DraftCard.tsx'
import { ReceiptCard as ReceiptCardV3 } from '../forms/v3/ReceiptCard.tsx'
import { buildConfirmMessage, buildRejectMessage, type FormConfirmPayload, type FormDraftPayload } from '../protocol.ts'
import { sanitizeBizText } from './rich.ts'
import { WelcomeCard } from './WelcomeCard.tsx'
import { ChoiceBubble } from './ChoiceBubble.tsx'
import { FieldAskBubble } from './FieldAskBubble.tsx'
import { ActionBadge } from './ActionBadge.tsx'
import { ApprovalCard } from './ApprovalCard.tsx'
import { PlanCard } from './PlanCard.tsx'
import { ReportCard } from './ReportCard.tsx'
import { RichContent } from './RichContent.tsx'
import { NewChatSheet } from './NewChatSheet.tsx'
import { TaskFormModal, type TaskPrefill } from '../work/TaskFormModal.tsx'
import type { ReportAction } from '../protocol.ts'
import css from './chat.module.css'

/** The header's colleague label: the roster name, else the duty tag. */
function presetLabelOf(preset: string | undefined, rosterRow: { readonly name: string } | undefined, visual: ColleagueVisual): string {
  if (preset === undefined) return '本地会话'
  return rosterRow?.name ?? visual.duty
}

/** The quick panel's icon pool: one glyph per command slot (17px brand). */
const QP_ICONS: readonly JSX.Element[] = [
  <PenLine key="pen" size={17} strokeWidth={1.8} aria-hidden="true" />,
  <BarChart3 key="chart" size={17} strokeWidth={1.8} aria-hidden="true" />,
  <Search key="search" size={17} strokeWidth={1.8} aria-hidden="true" />,
  <FileText key="file" size={17} strokeWidth={1.8} aria-hidden="true" />,
  <ClipboardCheck key="clipboard" size={17} strokeWidth={1.8} aria-hidden="true" />,
  <CalendarClock key="calendar" size={17} strokeWidth={1.8} aria-hidden="true" />,
]

/** The quick panel's placeholder tools: local toasts, never real lanes. */
const QP_TOOLS: ReadonlyArray<{ readonly label: string; readonly icon: JSX.Element }> = [
  { label: '语音', icon: <Mic size={16} strokeWidth={1.8} aria-hidden="true" /> },
  { label: '文件', icon: <Paperclip size={16} strokeWidth={1.8} aria-hidden="true" /> },
  { label: '表情', icon: <Smile size={16} strokeWidth={1.8} aria-hidden="true" /> },
]

/** The conversation page props: the session id from the route. */
export interface ChatViewProps {
  readonly sessionId: string
}

/**
 * The composer chips for the conversation phase (the 02 §4.4 matrix): none on
 * the welcome state (starters live in the welcome card) or an open ask; the
 * draft/rejected phases carry the re-phrase shortcuts; a landed receipt
 * carries the next-register shortcuts.
 * @param items - the folded chat items in seq order.
 * @param cardStates - the derived card phases.
 * @returns the chip texts (empty renders no chip row).
 */
export function contextChipsOf(
  items: readonly ChatItem[],
  cardStates: ReadonlyMap<number, DerivedCardState>,
): string[] {
  if (items.length === 0) return []
  for (const item of [...items].reverse()) {
    if (item.kind === 'ask' || item.kind === 'field-ask') {
      if (item.answered === undefined) return []
      break
    }
    if (item.kind === 'text' || item.kind === 'task-card' || item.kind === 'receipt' || item.kind === 'degraded') break
  }
  let latestPhase: CardPhase | undefined
  let landed = false
  for (const item of items) {
    if (item.kind === 'task-card') {
      const state = cardStates.get(item.seq)
      if (state === undefined || state.superseded === true) continue
      latestPhase = state.phase
    }
    if (item.kind === 'receipt') landed = true
  }
  if (latestPhase === 'submitted' || (latestPhase === undefined && landed)) return ['再来一单', '查这条记录']
  if (latestPhase !== undefined) return ['再补一句说明', '换一种单据']
  return []
}

/**
 * The conversation page.
 * @param props - the session id.
 * @returns the chat flow tree.
 */
export function ChatView({ sessionId }: ChatViewProps): JSX.Element {
  const [pollInterval, setPollInterval] = useState(5000)
  /** The demo run mode (drives the simulated typing indicator, render-only). */
  const [demoMode, setDemoMode] = useState(false)
  /** The simulated typing indicator state (never a logged message). */
  const [typing, setTyping] = useState(false)
  /** The task-form modal: open flag, the report action's prefill, its anchor seq. */
  const [taskForm, setTaskForm] = useState<{ open: boolean; prefill: TaskPrefill | undefined; anchor: string | undefined }>({
    open: false, prefill: undefined, anchor: undefined,
  })
  const typingTimer = useRef<number | undefined>(undefined)
  /** The raw event count at the last prompt (the typing trigger's baseline). */
  const typingBaseline = useRef(0)
  /** The newest raw event count (kept fresh every render for the typing timer). */
  const eventCount = useRef(0)
  const producer = useCallback(() => readHistory(sessionId), [sessionId])
  const history = usePoll(producer, pollInterval, true)
  eventCount.current = (history.value ?? []).length
  const sessionsPoll = usePoll(listSessions, 8000, true)
  const roster = useAsync(listAiEmployees)

  const folded = useMemo(() => foldHistory(history.value ?? []), [history.value])
  const cardStates = useMemo(() => deriveCardStates(folded.items), [folded.items])
  // Tighten the poll while a turn runs (进行时状态 comes from the durable log).
  useEffect(() => {
    setPollInterval(folded.running ? 1200 : 5000)
  }, [folded.running])

  const summary = useMemo<SessionSummary | undefined>(
    () => sessionsPoll.value?.find(row => row.sessionId === sessionId),
    [sessionsPoll.value, sessionId],
  )
  // A freshly created session paints its colleague identity from the create
  // echo until the first list read carries the row (the no-refresh first screen).
  const preset = summary?.agentPreset ?? pendingPresetOf(sessionId)
  const colleague = colleagueOf(preset)
  const wireWelcome = useMemo<Welcome | undefined>(
    () => roster.value?.find(row => row.id === preset)?.welcome,
    [roster.value, preset],
  )
  const welcome = useMemo(() => welcomeOf(preset, wireWelcome), [preset, wireWelcome])
  const chips = useMemo(() => contextChipsOf(folded.items, cardStates), [folded.items, cardStates])
  /** The quick panel's commands: the colleague's own starters (the welcome card's source, capped at six). */
  const quickCommands = useMemo(() => welcome.starters.slice(0, 6), [welcome])

  const meta = useAsync(readCollectionMeta)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  /** The quick panel's open flag (local view state; a send or route change closes it). */
  const [panelOpen, setPanelOpen] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  /** Seqs the user locally reopened for editing (rejected → draft). */
  const [reopened, setReopened] = useState<ReadonlySet<number>>(new Set())
  /** Seqs the user locally submitted for review (draft → pending, pre-log; v2 cards only). */
  const [localPending, setLocalPending] = useState<ReadonlyMap<number, Record<string, string>>>(new Map())
  /** Generated system numbers keyed by draft id (the N2 landing guarantee). */
  const [systemValues, setSystemValues] = useState<ReadonlyMap<string, Record<string, string>>>(new Map())
  const flowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<TextAreaRef>(null)
  const stickToBottom = useRef(true)
  const rosterRow = useMemo(
    () => roster.value?.find(row => row.id === preset),
    [roster.value, preset],
  )

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (trimmed === '' || sending) return
    setSending(true)
    setError(undefined)
    try {
      await promptSession(sessionId, trimmed)
      setDraft('')
      setPollInterval(1200)
      if (demoMode) {
        // The demo typing window (04 §4.2): 2.5s without a new event shows
        // the breathing dots; the next event clears them. Render state only.
        typingBaseline.current = eventCount.current
        if (typingTimer.current !== undefined) window.clearTimeout(typingTimer.current)
        typingTimer.current = window.setTimeout(() => {
          // Still-silent flow breathes; an already-moved count stays quiet.
          setTyping(eventCount.current === typingBaseline.current)
        }, 2500)
      }
    } catch (cause) {
      // A failed send must not leave the simulated typing dots breathing
      // forever: retire the pending timer and the indicator, then surface the
      // error so the composer is clearly usable again.
      if (typingTimer.current !== undefined) window.clearTimeout(typingTimer.current)
      setTyping(false)
      // the rpc seam only rejects with Error.
      /* v8 ignore next -- the rpc seam never rejects with a non-Error value. */
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSending(false)
    }
  }, [sessionId, sending, demoMode])

  // Resolve the run mode once; clear the typing indicator's timer on unmount.
  useEffect(() => {
    let alive = true
    void currentRunMode().then((mode) => { if (alive && mode === 'demo') setDemoMode(true) })
    return () => {
      alive = false
      if (typingTimer.current !== undefined) window.clearTimeout(typingTimer.current)
    }
  }, [])

  // A new event after a prompt retires the simulated typing indicator. The
  // baseline and this check both count raw events: the fold merges events
  // into fewer items, so an item-count comparison would almost never clear
  // the dots.
  useEffect(() => {
    if (typing && eventCount.current > typingBaseline.current) setTyping(false)
  }, [history.value, typing])

  // Keep the flow pinned to the newest item while the user is at the bottom.
  useEffect(() => {
    const flow = flowRef.current
    if (flow === null || !stickToBottom.current) return
    flow.scrollTop = flow.scrollHeight
  }, [folded.items])

  /** One draft card's edit values, hydrated from localStorage on mount. */
  const [draftValues, setDraftValues] = useState<ReadonlyMap<number, Record<string, string>>>(new Map())
  useEffect(() => {
    setDraftValues((current) => {
      const next = new Map(current)
      for (const item of folded.items) {
        if (item.kind !== 'task-card') continue
        if (next.has(item.seq)) continue
        const saved = loadDraftEdits(sessionId, item.draft)
        next.set(item.seq, saved === undefined ? { ...item.draft.fields } : { ...item.draft.fields, ...saved })
      }
      return next
    })
  }, [folded.items, sessionId])

  // Draw the predictable number for every live v3 draft's blank system field
  // (po_number & co.): one read per draft, cached by draft id so revisions
  // keep the same number and a fresh draft takes the next.
  useEffect(() => {
    for (const item of folded.items) {
      if (item.kind !== 'task-card' || item.payload === undefined) continue
      if (cardStates.get(item.seq)?.superseded === true) continue
      for (const field of item.payload.fields) {
        if (field.tier !== 'system' || (field.value !== null && field.value.trim() !== '')) continue
        const draftId = item.payload.draftId
        if (systemValues.get(draftId)?.[field.name] !== undefined) continue
        void nextSystemNumber(draftId, item.payload.form.collection, field.name).then((number) => {
          // A field the registry does not generate answers empty and stays blank.
          if (number === '') return
          setSystemValues((current) => {
            const drawn = current.get(draftId) ?? {}
            return new Map(current).set(draftId, { ...drawn, [field.name]: number })
          })
        })
      }
    }
  }, [folded.items, cardStates, systemValues])

  const onDraftEdit = useCallback((seq: number) => (name: string, value: string) => {
    setDraftValues((current) => {
      const row = current.get(seq)
      // The mount hydration below seeds every folded card before any user
      // edit can arrive, so the missing-row arm is unreachable.
      /* v8 ignore next -- hydration always precedes the first edit. */
      if (row === undefined) return current
      const next = { ...row, [name]: value }
      for (const item of folded.items) {
        if (item.kind === 'task-card' && item.seq === seq) saveDraftEdits(sessionId, item.draft, next)
      }
      return new Map(current).set(seq, next)
    })
  }, [folded.items, sessionId])

  /** v2 draft → pending: lock the fields locally and mark the chats filter. */
  const onSubmitReview = useCallback((seq: number) => () => {
    setReopened((current) => {
      const next = new Set(current)
      next.delete(seq)
      return next
    })
    const locked = draftValues.get(seq)
    // The mount hydration seeds every folded card before a submit can arrive,
    // so the missing-values arm is unreachable.
    /* v8 ignore next -- hydration always precedes the submit click. */
    if (locked !== undefined) setLocalPending(pending => new Map(pending).set(seq, locked))
    markPendingReview(sessionId)
    // The locked values ride draftStore until the confirm message lands.
  }, [sessionId, draftValues])

  /**
   * v3 draft → pending: the fenced 确认写入 action message. `values` is the
   * card's merged state (user edits over the generated system numbers and
   * client-calendar 今天 dates), built where the card renders.
   */
  const onConfirmV3 = useCallback((seq: number, payload: FormDraftPayload, values: Readonly<Record<string, string>>) => () => {
    clearPendingReview(sessionId)
    for (const item of folded.items) {
      if (item.kind === 'task-card' && item.seq === seq) clearDraftEdits(sessionId, item.draft)
    }
    void send(buildConfirmMessage(confirmPayloadOf(payload, values)))
  }, [folded.items, send, sessionId])

  /** v3 draft → rejected: the fenced 驳回 action message. */
  const onRejectV3 = useCallback((seq: number, draftId: string) => () => {
    clearPendingReview(sessionId)
    for (const item of folded.items) {
      if (item.kind === 'task-card' && item.seq === seq) clearDraftEdits(sessionId, item.draft)
    }
    void send(buildRejectMessage({ v: 3, type: 'reject_flow', draftId }))
  }, [folded.items, send, sessionId])

  /** v2 pending → the confirm message (agent nb_create) — the write handoff. */
  const onConfirm = useCallback((seq: number, fields: Record<string, string>, collection: string) => () => {
    const payload = JSON.stringify({ collection, fields }, null, 2)
    clearPendingReview(sessionId)
    for (const item of folded.items) {
      if (item.kind === 'task-card' && item.seq === seq) clearDraftEdits(sessionId, item.draft)
    }
    void send(`确认推送：请按以下最终字段值调用 nb_create 写入业务表，完成后给出回执（业务表 ${collection} 行 id）。\n${payload}`)
  }, [folded.items, send, sessionId])

  /** v2 pending → rejected: the discard message, edits kept for the re-edit. */
  const onReject = useCallback((seq: number) => () => {
    setLocalPending((current) => {
      if (!current.has(seq)) return current
      const next = new Map(current)
      next.delete(seq)
      return next
    })
    clearPendingReview(sessionId)
    void send('驳回：本表单草稿作废，不要写库。')
  }, [send, sessionId])

  const onRedraft = useCallback((seq: number) => () => {
    setReopened(current => new Set(current).add(seq))
  }, [])

  const onStop = useCallback(() => {
    void cancelSession(sessionId).catch((cause: unknown) => {
      // cancel races turn completion; a lost race is not user-facing.
      /* v8 ignore next -- the race window is one poll tick. */
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }, [sessionId])

  const focusComposer = useCallback(() => {
    inputRef.current?.nativeElement?.focus()
  }, [])

  const title = summary === undefined ? colleague.duty : titleOf(summary)
  const showWelcome = history.status === 'ready' && folded.items.length === 0

  /** One report-card action: dispatch through the shared executor; create-task opens the hosted modal. */
  const onReportAction = useCallback((action: ReportAction, anchorSeq: number) => {
    void dispatchReportAction(action, {
      sessionId,
      onCreateTask: (prefill) => {
        setTaskForm({ open: true, prefill, anchor: String(anchorSeq) })
      },
    })
  }, [sessionId])

  return (
    <div className={css.page}>
      <PageNav
        title={(
          <span className={css.headerMain}>
            <Avatar background={colleagueColor(preset)} acronym={colleague.acronym} size={30} />
            <span className={css.headerTexts}>
              <span className={css.headerTitle}>{title}</span>
              <span className={css.headerHint}>
                {presetLabelOf(preset, rosterRow, colleague)}
                {summary?.running === true ? ' · 处理中' : ''}
              </span>
            </span>
          </span>
        )}
        onBack={() => { goBackOr('#/chats') }}
        right={(
          <button
            type="button"
            className={css.headerPlus}
            aria-label="新建会话"
            onClick={() => { setNewChatOpen(true) }}
          >
            <Plus size={18} aria-hidden="true" />
          </button>
        )}
      />

      <div
        className={panelOpen ? `${css.flow} ${css.flowPanelOpen}` : css.flow}
        ref={flowRef}
        onScroll={(event) => {
          const flow = event.currentTarget
          stickToBottom.current = flow.scrollHeight - flow.scrollTop - flow.clientHeight < 40
        }}
      >
        {history.value === undefined && history.error === undefined && (
          <div className={css.loadingRow} role="status">
            <SpinLoading color="currentColor" style={{ '--size': '16px' }} />
            <span>会话加载中…</span>
          </div>
        )}
        {history.error !== undefined && <NoticeCard kind="error" text={history.error} />}
        {showWelcome && (
          <div className={css.welcomeStage}>
            <WelcomeCard welcome={welcome} onSend={(text) => { void send(text) }} disabled={sending} />
          </div>
        )}
        {folded.items.map((item, index) => (
          <FlowItem
            key={renderKeyOf(item)}
            item={item}
            previous={folded.items[index - 1]}
            preset={preset}
            cardStates={cardStates}
            reopened={reopened}
            draftValues={draftValues}
            systemValues={systemValues}
            meta={meta.value}
            sending={sending}
            onDraftEdit={onDraftEdit}
            onSubmitReview={onSubmitReview}
            onConfirm={onConfirm}
            onReject={onReject}
            onConfirmV3={onConfirmV3}
            onRejectV3={onRejectV3}
            onRedraft={onRedraft}
            onSend={(text) => { void send(text) }}
            onFreeText={focusComposer}
            onReportAction={onReportAction}
            localPending={localPending}
          />
        ))}
        {folded.running && <RunningRow text="AI 同事正在处理…" />}
        {typing && !folded.running && (
          <div className={css.typingRow} role="status" aria-label="正在处理">
            <span className={css.typingBubble} aria-hidden="true">
              <span className={css.typingDot} />
              <span className={css.typingDot} />
              <span className={css.typingDot} />
            </span>
          </div>
        )}
        <KgEvidenceSection queries={folded.kgQueries} />
      </div>

      <div className={css.composer}>
        {panelOpen && (
          <div className={css.quickPanel} role="dialog" aria-label="快捷指令">
            <p className={css.qpTitle}>快捷指令</p>
            {quickCommands.length > 0 ? (
              <div className={css.qpGrid}>
                {quickCommands.map((command, index) => (
                  <button
                    key={command.send}
                    type="button"
                    className={css.qpItem}
                    disabled={sending}
                    onClick={() => {
                      setPanelOpen(false)
                      void send(command.send)
                    }}
                  >
                    {QP_ICONS[index % QP_ICONS.length]}
                    {command.label}
                  </button>
                ))}
              </div>
            ) : (
              <p className={css.qpEmpty}>当前同事没有预置指令，直接打字聊聊吧</p>
            )}
            <div className={css.qpTools}>
              {QP_TOOLS.map(tool => (
                <button
                  key={tool.label}
                  type="button"
                  className={css.qpTool}
                  onClick={() => { Toast.show({ content: '演示版暂未开放，先用文字试试吧' }) }}
                >
                  {tool.icon}
                  {tool.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {chips.length > 0 && (
          <div className={css.chipRow}>
            {chips.map(text => (
              <Button
                key={text}
                type="button"
                color="primary"
                fill="outline"
                size="small"
                className={css.chip}
                style={{ '--background-color': 'var(--dshm-card)', '--border-color': 'rgba(46, 124, 246, 0.35)' }}
                disabled={sending || folded.running}
                onClick={() => { void send(text) }}
              >
                {text}
              </Button>
            ))}
          </div>
        )}
        <div className={css.inputRow}>
          <button
            type="button"
            className={`${css.plusBtn} ${panelOpen ? css.plusBtnOn : ''}`}
            aria-label={panelOpen ? '收起快捷面板' : '打开快捷面板'}
            aria-expanded={panelOpen}
            onClick={() => { setPanelOpen(open => !open) }}
          >
            <Plus size={22} strokeWidth={1.8} aria-hidden="true" />
          </button>
          <TextArea
            ref={inputRef}
            className={css.input}
            placeholder="问我任何经营问题..."
            value={draft}
            autoSize={{ minRows: 1, maxRows: 4 }}
            onChange={(next) => { setDraft(next) }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void send(draft)
              }
            }}
          />
          {folded.running
            ? (
              <button type="button" className={css.stop} aria-label="停止生成" onClick={onStop}>
                <Square size={12} aria-hidden="true" />
                停止
              </button>
            )
            : (
              <button
                type="button"
                className={css.send}
                aria-label="发送"
                disabled={draft.trim() === '' || sending}
                onClick={() => { void send(draft) }}
              >
                <Send size={18} aria-hidden="true" />
              </button>
            )}
        </div>
        {error !== undefined && <ErrorToast error={error} />}
      </div>
      <NewChatSheet visible={newChatOpen} onClose={() => { setNewChatOpen(false) }} />
      <TaskFormModal
        visible={taskForm.open}
        onClose={() => { setTaskForm(current => ({ ...current, open: false })) }}
        identityName={loadIdentity()?.name ?? '我'}
        prefill={taskForm.prefill}
        sourceSessionId={sessionId}
        sourceAnchor={taskForm.anchor}
      />
    </div>
  )
}

/** One transient composer failure: a toast, retriable by sending again. */
function ErrorToast({ error }: { readonly error: string }): JSX.Element | null {
  useEffect(() => {
    Toast.show({ content: error, position: 'bottom' })
  }, [error])
  return null
}

/** The stable render key of one flow item (sub-seq offsets disambiguate splits). */
function renderKeyOf(item: ChatItem): string {
  return `${item.kind}:${String(item.seq)}`
}

/** One rendered flow row: day separator + bubble / tool row / card / ask / action / receipt. */
function FlowItem(
  props: {
    readonly item: ChatItem
    readonly previous: ChatItem | undefined
    readonly preset: string | undefined
    readonly cardStates: ReadonlyMap<number, DerivedCardState>
    readonly reopened: ReadonlySet<number>
    readonly draftValues: ReadonlyMap<number, Record<string, string>>
    /** Generated system numbers keyed by draft id (the v3 cards' blank system fields). */
    readonly systemValues: ReadonlyMap<string, Record<string, string>>
    readonly meta: FieldMetas | undefined
    readonly sending: boolean
    readonly onDraftEdit: (seq: number) => (name: string, value: string) => void
    readonly onSubmitReview: (seq: number) => () => void
    readonly onConfirm: (seq: number, fields: Record<string, string>, collection: string) => () => void
    readonly onReject: (seq: number) => () => void
    readonly onConfirmV3: (
      seq: number,
      payload: FormDraftPayload,
      values: Readonly<Record<string, string>>,
    ) => () => void
    readonly onRejectV3: (seq: number, draftId: string) => () => void
    readonly onRedraft: (seq: number) => () => void
    readonly onSend: (text: string) => void
    readonly onFreeText: () => void
    readonly onReportAction: (action: ReportAction, anchorSeq: number) => void
    readonly localPending: ReadonlyMap<number, Record<string, string>>
  },
): JSX.Element | null {
  const { item, previous, preset } = props
  const showDay = previous === undefined || dayLabelOf(item.time) !== dayLabelOf(previous.time)
  const separator = showDay ? <div className={css.daySeparator}>{dayLabelOf(item.time)}</div> : null
  // Turn-level avatar (03 §4.1): only the first assistant-owned item after a
  // user message carries the avatar column; continuation segments keep the
  // column width for alignment without repeating the identity (微信范式).
  const firstOfTurn = previous === undefined || isUserOwned(previous)
  const avatarCol = firstOfTurn
    ? (
      <span className={css.assistantCol}>
        <Avatar background={colleagueColor(preset)} acronym={colleagueOf(preset).acronym} size={32} />
        <span className={css.aiSeal} aria-hidden="true">AI</span>
      </span>
    )
    : <span className={css.assistantColGhost} aria-hidden="true" />
  const aiRow = (content: JSX.Element): JSX.Element => (
    <div className={css.assistantBlock}>
      {avatarCol}
      {content}
    </div>
  )
  if (item.kind === 'text') {
    if (item.role === 'user') {
      const body = item.choiceReply === true
        ? (
          <div className={css.choiceCapsule} aria-label="选择回执">
            <Check size={12} aria-hidden="true" />
            {sanitizeBizText(item.text)}
          </div>
        )
        : <div className={css.userBubble}>{item.text}</div>
      return <>{separator}{body}</>
    }
    return <>{separator}{aiRow(<div className={css.assistantBubble}><RichContent text={item.text} /></div>)}</>
  }
  if (item.kind === 'tool') {
    // A protocol-fence name the model emitted as a tool call renders as the
    // neutral status line only — no protocol name, no failure mark.
    if (item.protocol === true) {
      return (
        <>
          {separator}
          <div className={css.toolRow}>
            <span className={css.toolLabel}>{item.label}</span>
          </div>
        </>
      )
    }
    const dot = item.state === 'running' ? css.toolDotRunning : item.state === 'error' ? css.toolDotError : css.toolDot
    return (
      <>
        {separator}
        <div className={css.toolRow}>
          <span className={dot}>
            {item.state === 'running'
              ? <SpinLoading color="currentColor" style={{ '--size': '10px' }} />
              : item.state === 'error'
                ? <X size={10} strokeWidth={3} aria-hidden="true" />
                : <Check size={10} strokeWidth={3} aria-hidden="true" />}
          </span>
          <span className={css.toolLabel}>
            {item.state === 'running' ? `正在调用：${item.label}…` : item.label}
          </span>
        </div>
      </>
    )
  }
  if (item.kind === 'ask') {
    return (
      <>
        {separator}
        {aiRow(
          <ChoiceBubble
            ask={item}
            onSend={props.onSend}
            onFreeText={props.onFreeText}
            disabled={props.sending}
          />,
        )}
      </>
    )
  }
  if (item.kind === 'field-ask') {
    return (
      <>
        {separator}
        {aiRow(<FieldAskBubble ask={item} onSend={props.onSend} disabled={props.sending} />)}
      </>
    )
  }
  if (item.kind === 'action') {
    const formLabel = item.payload?.type === 'form_confirm' ? item.payload.form.label : undefined
    const approvalText = item.payload?.type === 'approval_confirm'
      ? `${item.payload.action === 'approve' ? '你同意了' : '你驳回了'}这张${item.payload.doc.label}`
      : undefined
    return (
      <>
        {separator}
        <ActionBadge action={item.action} formLabel={formLabel} text={approvalText} />
      </>
    )
  }
  if (item.kind === 'receipt') {
    return (
      <>
        {separator}
        {aiRow(<ReceiptCardV3 payload={item.payload} onView={() => { props.onSend('查这条记录') }} />)}
      </>
    )
  }
  if (item.kind === 'degraded') {
    return (
      <>
        {separator}
        {aiRow(
          <details className={css.degradedNotice}>
            <summary>结构化消息（格式异常，已折叠）</summary>
            <pre className={css.degradedNoticeBody}>{item.text}</pre>
          </details>,
        )}
      </>
    )
  }
  if (item.kind === 'report') {
    return (
      <>
        {separator}
        {aiRow(
          <ReportCard payload={item.payload} onAction={(action) => { props.onReportAction(action, item.seq) }} />,
        )}
      </>
    )
  }
  if (item.kind === 'approval') {
    return (
      <>
        {separator}
        {aiRow(
          <ApprovalCard payload={item.payload} onSend={props.onSend} disabled={props.sending} />,
        )}
      </>
    )
  }
  if (item.kind === 'plan') {
    return (
      <>
        {separator}
        {aiRow(
          <PlanCard payload={item.payload} onSend={props.onSend} disabled={props.sending} />,
        )}
      </>
    )
  }
  // Task cards: v3 payloads render the three-tier card; a superseded revision
  // or a landed card hides (the receipt item owns the submitted rendering).
  // deriveCardStates seeds an entry for every card in the same fold, so the
  // fallback arm exists for the type, not a reachable miss.
  /* v8 ignore next line -- every task-card seq carries a derived state. */
  const state = props.cardStates.get(item.seq) ?? { phase: 'draft' as const }
  if (item.payload !== undefined) {
    if (state.superseded === true) return null
    if (state.phase === 'submitted') return null
    const phase = props.reopened.has(item.seq) ? 'draft' as const : state.phase
    // User edits win; unedited system blanks take the generated number and
    // unedited 今天 dates take the client calendar (the landing guarantees).
    const values = mergeCardValues(
      item.payload,
      props.draftValues.get(item.seq) ?? {},
      props.systemValues.get(item.payload.draftId) ?? {},
    )
    return (
      <>
        {separator}
        <div className={css.cardRow}>
          {avatarCol}
          <DraftCardV3
            payload={item.payload}
            values={values}
            phase={phase}
            meta={props.meta?.get(item.payload.form.collection)}
            onEdit={props.onDraftEdit(item.seq)}
            onConfirm={props.onConfirmV3(item.seq, item.payload, values)}
            onReject={props.onRejectV3(item.seq, item.payload.draftId)}
            onRedraft={props.onRedraft(item.seq)}
            disabled={props.sending}
          />
        </div>
      </>
    )
  }
  const meta: CollectionFieldMeta = props.meta?.get(item.draft.collection) ?? new Map<string, NocobaseFieldView>()
  const values = props.draftValues.get(item.seq) ?? { ...item.draft.fields }
  const card = (() => {
    if (props.reopened.has(item.seq)) {
      return (
        <DraftCard
          draft={item.draft}
          meta={meta}
          values={values}
          onEdit={props.onDraftEdit(item.seq)}
          onSubmitReview={props.onSubmitReview(item.seq)}
          disabled={props.sending}
        />
      )
    }
    if (state.phase === 'submitted' && state.receipt !== undefined) {
      /* v8 ignore next -- a submitted card always carries its confirmedFields. */
      const finals = state.confirmedFields ?? item.draft.fields
      return <ReceiptCard draft={item.draft} meta={meta} finalFields={finals} receipt={state.receipt} />
    }
    if (state.phase === 'pending') {
      const finals = { ...item.draft.fields, ...state.confirmedFields }
      return (
        <ReviewCard
          draft={item.draft}
          meta={meta}
          confirmedFields={finals}
          onConfirm={props.onConfirm(item.seq, finals, item.draft.collection)}
          onReject={props.onReject(item.seq)}
          disabled={props.sending}
        />
      )
    }
    const locked = props.localPending.get(item.seq)
    if (locked !== undefined) {
      return (
        <ReviewCard
          draft={item.draft}
          meta={meta}
          confirmedFields={locked}
          onConfirm={props.onConfirm(item.seq, locked, item.draft.collection)}
          onReject={props.onReject(item.seq)}
          disabled={props.sending}
        />
      )
    }
    if (state.phase === 'rejected') {
      return <RejectedCard draft={item.draft} onRedraft={props.onRedraft(item.seq)} disabled={props.sending} />
    }
    return (
      <DraftCard
        draft={item.draft}
        meta={meta}
        values={values}
        onEdit={props.onDraftEdit(item.seq)}
        onSubmitReview={props.onSubmitReview(item.seq)}
        disabled={props.sending}
      />
    )
  })()
  return (
    <>
      {separator}
      <div className={css.cardRow}>
        {avatarCol}
        {card}
      </div>
    </>
  )
}

/** Whether one flow item belongs to the user side (a bubble or an action badge). */
function isUserOwned(item: ChatItem): boolean {
  return (item.kind === 'text' && item.role === 'user') || item.kind === 'action'
}

/** The confirm payload a v3 card's 确认写入 sends (edits folded over the draft). */
function confirmPayloadOf(
  payload: FormDraftPayload,
  values: Readonly<Record<string, string>>,
): FormConfirmPayload {
  return {
    v: 3,
    type: 'form_confirm',
    draftId: payload.draftId,
    revision: payload.revision,
    form: payload.form,
    fields: payload.fields.map(field => ({
      name: field.name,
      label: field.label,
      /* v8 ignore next -- mergeCardValues seeds every payload field; the arm satisfies the unchecked-index type. */
      value: values[field.name] ?? (field.value ?? ''),
    })),
  }
}

/**
 * Read every collection's field metadata for the draft cards (the v2 cards'
 * widget mapping; failures degrade to the raw-name fallback).
 */
async function readCollectionMeta(): Promise<FieldMetas> {
  const value = await rpc('nocobase.listMeta', {})
  const metas = new Map<string, CollectionFieldMeta>()
  for (const collection of value.collections) {
    const fields = new Map<string, NocobaseFieldView>()
    for (const field of collection.fields) fields.set(field.name, field)
    metas.set(collection.name, fields)
  }
  return metas
}
