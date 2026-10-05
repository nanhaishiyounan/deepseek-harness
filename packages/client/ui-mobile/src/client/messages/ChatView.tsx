/**
 * The AI-colleague conversation page (v6 chat surface). This module owns the
 * orchestration after the W8-B2 split: history polling + folding, the send
 * lane (idempotency key, outbox parking on transport failure), the draft-card
 * confirm/reject callbacks, the header and flow tree, and the hosted modals.
 * The rendering units live in ./chat/: FlowItem (one row's decision table),
 * QuickPanel, Composer, chips, the approval read-back, demo-typing, and
 * draft-values hooks, and the confirm payload builder. A session with no
 * business messages shows the local welcome (never a logged message); the
 * page renders as a full-screen layer: no tab bar under it, an antd-mobile
 * NavBar over it.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type JSX } from 'react'
import type { SessionSummary } from '@deepseek-ai/dsh-host-apiproxy/api'
import { Plus } from 'lucide-react'
import type { TextAreaRef } from 'antd-mobile'
import { Avatar, NoticeCard, RunningRow, SkelThread } from '../ui.tsx'
import { PageNav } from '../PageNav.tsx'
import { loadIdentity } from '../auth.ts'
import { dispatchReportAction } from '../actions.ts'
import { colleagueColor, colleagueOf, welcomeOf, type ColleagueVisual, type Welcome } from '../colleagues.ts'
import { foldHistory } from '../fold.ts'
import { goBackOr } from '../router.ts'
import { useAsync, usePageVisible, usePoll } from '../hooks.ts'
import { EMPTY_FEED, fullFeed, mergeFeed, needsFullRead, type HistoryFeed } from './chat/historyFeed.ts'
import { cancelSession, listAiEmployees, listSessions, newClientMsgId, pendingPresetOf, promptSession, readHistory, titleOf } from '../sessionsService.ts'
import { enqueueOutbox, outboxSnapshot, subscribeOutbox } from '../outboxStore.ts'
import { deriveCardStates } from '../cardState.ts'
import { clearDraftEdits, clearPendingReview, markPendingReview } from '../draftStore.ts'
import { KgEvidenceSection } from '../kg/KgEvidence.tsx'
import { buildConfirmMessage, buildRejectMessage, type FormDraftPayload, type ReportAction } from '../protocol.ts'
import { WelcomeCard } from './WelcomeCard.tsx'
import { NewChatSheet } from './NewChatSheet.tsx'
import { TaskFormModal, type TaskPrefill } from '../work/TaskFormModal.tsx'
import { contextChipsOf } from './chat/chips.ts'
import { readCollectionMeta } from './chat/meta.ts'
import { useApprovalReadback } from './chat/useApprovalReadback.ts'
import { useDemoTyping } from './chat/useDemoTyping.ts'
import { useDraftValues } from './chat/useDraftValues.ts'
import { FlowItem, renderKeyOf } from './chat/FlowItem.tsx'
import { QuickPanel } from './chat/QuickPanel.tsx'
import { Composer } from './chat/Composer.tsx'
import { confirmPayloadOf } from './chat/confirm.ts'
import css from './chat.module.css'

// The chips decision table moved to ./chat/chips.ts (W8-B2); the re-export
// keeps this module the spec-facing import surface.
export { contextChipsOf } from './chat/chips.ts'

/** The header's colleague label: the roster name, else the duty tag. */
function presetLabelOf(preset: string | undefined, rosterRow: { readonly name: string } | undefined, visual: ColleagueVisual): string {
  if (preset === undefined) return '本地会话'
  return rosterRow?.name ?? visual.duty
}

/** The conversation page props: the session id from the route. */
export interface ChatViewProps {
  readonly sessionId: string
}

/**
 * The conversation page.
 * @param props - the session id.
 * @returns the chat flow tree.
 */
export function ChatView({ sessionId }: ChatViewProps): JSX.Element {
  const [pollInterval, setPollInterval] = useState(5000)
  /** The document-visible gate: a hidden page suspends every poll here (W8-B3). */
  const pageVisible = usePageVisible()
  /**
   * The incremental history feed (W8-B3): the accumulated window + its
   * afterSeq cursor. The first read pages the tail; later polls send only
   * the cursor and append what arrived — the fold still runs over the whole
   * accumulated window, so replay semantics are the polling model's own.
   */
  const feed = useRef<HistoryFeed>(EMPTY_FEED)
  /** The task-form modal: open flag, the report action's prefill, its anchor seq. */
  const [taskForm, setTaskForm] = useState<{ open: boolean; prefill: TaskPrefill | undefined; anchor: string | undefined }>({
    open: false, prefill: undefined, anchor: undefined,
  })
  const producer = useCallback(async () => {
    if (needsFullRead(feed.current)) {
      feed.current = fullFeed(await readHistory(sessionId))
    } else {
      feed.current = mergeFeed(feed.current, await readHistory(sessionId, 200, feed.current.cursor))
    }
    return feed.current.events
  }, [sessionId])
  const history = usePoll(producer, pollInterval, pageVisible)
  // Becoming visible again re-bases the window: background time may have
  // compacted the log, and the full read also answers immediately (the poll
  // hook re-runs its producer on a false→true gate transition).
  useEffect(() => {
    if (pageVisible) feed.current = EMPTY_FEED
  }, [pageVisible])
  /** The demo-mode typing indicator cell (render state, never a logged message). */
  const typingCell = useDemoTyping((history.value ?? []).length)
  const sessionsPoll = usePoll(listSessions, 8000, true)
  const roster = useAsync(listAiEmployees)

  const folded = useMemo(() => foldHistory(history.value ?? []), [history.value])
  const cardStates = useMemo(() => deriveCardStates(folded.items), [folded.items])
  // Tighten the poll while a turn runs (进行时状态 comes from the durable log).
  useEffect(() => {
    setPollInterval(folded.running ? 800 : 5000)
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
  /** Timestamp of the last assist-input fill (drives the box's data-fill flash). */
  const [filledAt, setFilledAt] = useState(0)
  const [sending, setSending] = useState(false)
  const [newChatOpen, setNewChatOpen] = useState(false)
  /** The quick panel's open flag (local view state; a send or route change closes it). */
  const [panelOpen, setPanelOpen] = useState(false)
  const [error, setError] = useState<string | undefined>(undefined)
  /** Seqs the user locally reopened for editing (rejected → draft). */
  const [reopened, setReopened] = useState<ReadonlySet<number>>(new Set())
  /** Seqs the user locally submitted for review (draft → pending, pre-log; v2 cards only). */
  const [localPending, setLocalPending] = useState<ReadonlyMap<number, Record<string, string>>>(new Map())
  const flowRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<TextAreaRef>(null)
  const stickToBottom = useRef(true)
  const rosterRow = useMemo(
    () => roster.value?.find(row => row.id === preset),
    [roster.value, preset],
  )
  const { draftValues, systemValues, onEdit: onDraftEdit } = useDraftValues(folded.items, cardStates, sessionId)
  // W6-B1 G2: the pending approval cards' live document read-back.
  const approvalExternalStates = useApprovalReadback(folded.items, folded.running)
  // The outbox strip: queued sends for this session surface under the flow
  // (G5 degradation notice); recovery clears it automatically.
  const outbox = useSyncExternalStore(subscribeOutbox, outboxSnapshot)
  const sessionOutbox = outbox.entries.filter(entry => entry.sessionId === sessionId)

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (trimmed === '' || sending) return
    setSending(true)
    setError(undefined)
    // One idempotency key per composed message: the server collapses a
    // repeated session.prompt carrying the same id (the offline outbox's
    // retry and the response-lost double-send window both ride it).
    const clientMsgId = newClientMsgId(loadIdentity()?.username ?? '', trimmed)
    try {
      await promptSession(sessionId, trimmed, clientMsgId)
      setDraft('')
      setPollInterval(800)
      // The demo typing window (04 §4.2) arms inside the cell; live mode no-ops.
      typingCell.armAfterSend()
    } catch (cause) {
      // A failed send must not leave the simulated typing dots breathing
      // forever: retire the pending timer and the indicator, then route the
      // failure by kind. Only a transport-level TypeError (the request never
      // reached the server — or the response was lost mid-flight, where the
      // server-side clientMsgId dedup keeps the retry harmless) parks the
      // message in the outbox; a server refusal (any rpc Error) never
      // re-sends — the retry cannot fix it and a duplicate could double-execute.
      typingCell.retire()
      if (cause instanceof TypeError) {
        enqueueOutbox(sessionId, trimmed, clientMsgId)
        setDraft('')
        setError('网络不可用，消息已存入待发队列，恢复后自动发送')
        return
      }
      console.warn(JSON.stringify({
        type: 'client_error', scope: 'chat.send-refused', clientMsgId,
        message: cause instanceof Error ? cause.message : String(cause), at: new Date().toISOString(),
      }))
      // the rpc seam only rejects with Error.
      /* v8 ignore next -- the rpc seam never rejects with a non-Error value. */
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setSending(false)
    }
  }, [sessionId, sending, typingCell])

  /**
   * The assist-input fill (W9-B1): a picked starter/quick command/chip/
   * suggestion replaces the whole draft (the tag is a complete intent; a
   * half-typed draft is a fragment), then the composer takes focus with the
   * caret at the end. Nothing goes out until the user's own send tap.
   * @param text - the picked tag's full send-text.
   */
  const fillDraft = useCallback((text: string) => {
    setDraft(text)
    setFilledAt(Date.now())
  }, [])

  // The fill's focus pass runs after the new draft commits to the box, so
  // the caret lands at the end of the filled text.
  useEffect(() => {
    if (filledAt === 0) return
    const box = inputRef.current?.nativeElement
    if (box === null || box === undefined) return
    box.focus()
    const end = box.value.length
    box.setSelectionRange(end, end)
  }, [filledAt])

  // Keep the flow pinned to the newest item while the user is at the bottom.
  useEffect(() => {
    const flow = flowRef.current
    if (flow === null || !stickToBottom.current) return
    flow.scrollTop = flow.scrollHeight
  }, [folded.items])

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
          <div role="status" aria-label="正在加载会话">
            <SkelThread />
          </div>
        )}
        {history.error !== undefined && <NoticeCard kind="error" text={history.error} />}
        {showWelcome && (
          <div className={css.welcomeStage}>
            <WelcomeCard welcome={welcome} onFill={fillDraft} disabled={sending} />
          </div>
        )}
        {sessionOutbox.length > 0 && (
          <div className={css.outboxStrip} role="status" aria-label="待发队列">
            网络恢复后将自动发送 {String(sessionOutbox.length)} 条待发消息
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
            approvalExternalStates={approvalExternalStates}
            onDraftEdit={onDraftEdit}
            onSubmitReview={onSubmitReview}
            onConfirm={onConfirm}
            onReject={onReject}
            onConfirmV3={onConfirmV3}
            onRejectV3={onRejectV3}
            onRedraft={onRedraft}
            onSend={(text) => { void send(text) }}
            onFill={fillDraft}
            onFreeText={() => { inputRef.current?.nativeElement?.focus() }}
            onReportAction={onReportAction}
            localPending={localPending}
          />
        ))}
        {folded.running && <RunningRow text="AI 同事正在处理…" />}
        {typingCell.typing && !folded.running && (
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

      <Composer
        chips={chips}
        chipsDisabled={sending || folded.running}
        draft={draft}
        onDraftChange={setDraft}
        sending={sending}
        running={folded.running}
        onSend={(text) => { void send(text) }}
        onStop={onStop}
        error={error}
        panelOpen={panelOpen}
        onTogglePanel={() => { setPanelOpen(open => !open) }}
        inputRef={inputRef}
        onFill={fillDraft}
        filledAt={filledAt}
        panel={(
          <QuickPanel
            commands={quickCommands}
            sending={sending}
            onPick={(text) => {
              setPanelOpen(false)
              fillDraft(text)
            }}
          />
        )}
      />
      <NewChatSheet visible={newChatOpen} onClose={() => { setNewChatOpen(false) }} />
      <TaskFormModal
        visible={taskForm.open}
        onClose={() => { setTaskForm(current => ({ ...current, open: false })) }}
        identityName={loadIdentity()?.nickname ?? '我'}
        prefill={taskForm.prefill}
        sourceSessionId={sessionId}
        sourceAnchor={taskForm.anchor}
      />
    </div>
  )
}
