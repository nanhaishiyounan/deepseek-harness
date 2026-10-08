/**
 * One rendered flow row (split from ChatView, W8-B2; the rendering decision
 * table is unchanged): day separator + bubble / tool row / card / ask /
 * action / receipt. The v3 ```dsh``` protocol payloads render their fenced
 * card families; v2-legacy cards keep their two-step review flow; card
 * phases replay from deriveCardStates over the durable log.
 */

import type { JSX } from 'react'
import { Button, SpinLoading } from 'antd-mobile'
import { Check, X } from 'lucide-react'
import type { NocobaseFieldView } from '@deepseek-ai/dsh-host-apiproxy/api'
import { Avatar } from '../../ui.tsx'
import { colleagueColor, stampAcronymOf } from '../../colleagues.ts'
import { dayLabelOf } from '../../sessionsService.ts'
import { mergeCardValues } from '../../systemFields.ts'
import type { DerivedCardState } from '../../cardState.ts'
import { isProtocolToolRow, type ChatItem } from '../../fold.ts'
import type { ApprovalResultPayload, FormDraftPayload, ReportAction } from '../../protocol.ts'
import { copyCode } from '../RichContent.tsx'
import { DraftCard, ReceiptCard, RejectedCard, ReviewCard, type CollectionFieldMeta, type FieldMetas } from '../../forms/task-cards.tsx'
import { DraftCard as DraftCardV3 } from '../../forms/v3/DraftCard.tsx'
import { ReceiptCard as ReceiptCardV3 } from '../../forms/v3/ReceiptCard.tsx'
import { sanitizeBizText } from '../rich.ts'
import { sanitizeSubtitle } from '../../sanitize.ts'
import { ChoiceBubble } from '../ChoiceBubble.tsx'
import { FieldAskBubble } from '../FieldAskBubble.tsx'
import { ActionBadge } from '../ActionBadge.tsx'
import { ApprovalCard } from '../ApprovalCard.tsx'
import { PlanCard } from '../PlanCard.tsx'
import { ReportCard } from '../ReportCard.tsx'
import { RichContent } from '../RichContent.tsx'
import css from '../chat.module.css'

/** One flow row's props (the ChatView orchestration sinks, passed through). */
export interface FlowItemProps {
  readonly item: ChatItem
  readonly previous: ChatItem | undefined
  readonly preset: string | undefined
  /** The colleague's roster-resolved name (never the session title); the
   * stamp borrows its leading pair when the fallback acronym would repeat
   * the name's AI prefix. */
  readonly name: string
  readonly cardStates: ReadonlyMap<number, DerivedCardState>
  readonly reopened: ReadonlySet<number>
  readonly draftValues: ReadonlyMap<number, Record<string, string>>
  /** Generated system numbers keyed by draft id (the v3 cards' blank system fields). */
  readonly systemValues: ReadonlyMap<string, Record<string, string>>
  readonly meta: FieldMetas | undefined
  readonly sending: boolean
  /** Live doc_status read-backs keyed `collection:docId` (G2 他端已处理). */
  readonly approvalExternalStates: ReadonlyMap<string, ApprovalResultPayload['state']>
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
  /** The assist-input fill sink: the field-ask suggestion chips (W9-B1). */
  readonly onFill: (text: string) => void
  readonly onFreeText: () => void
  readonly onReportAction: (action: ReportAction, anchorSeq: number) => void
  readonly localPending: ReadonlyMap<number, Record<string, string>>
}

/** The stable render key of one flow item (sub-seq offsets disambiguate splits). */
export function renderKeyOf(item: ChatItem): string {
  return `${item.kind}:${String(item.seq)}`
}

/** Whether one flow item belongs to the user side (a bubble or an action badge). */
function isUserOwned(item: ChatItem): boolean {
  return (item.kind === 'text' && item.role === 'user') || item.kind === 'action'
}

/**
 * Render one flow row: day separator + bubble / tool row / card / ask / action / receipt.
 * @param props - the item, its neighbor, and the orchestration sinks.
 * @returns the row tree, or null for a hidden (superseded/submitted) card.
 */
export function FlowItem(props: FlowItemProps): JSX.Element | null {
  const { item, previous, preset, name } = props
  const showDay = previous === undefined || dayLabelOf(item.time) !== dayLabelOf(previous.time)
  const separator = showDay ? <div className={css.daySeparator}>{dayLabelOf(item.time)}</div> : null
  // Turn-level avatar (03 §4.1): only the first assistant-owned item after a
  // user message carries the avatar column; continuation segments keep the
  // column width for alignment without repeating the identity (微信范式).
  const firstOfTurn = previous === undefined || isUserOwned(previous)
  const avatarCol = firstOfTurn
    ? (
      <span className={css.assistantCol}>
        <Avatar background={colleagueColor(preset)} acronym={stampAcronymOf(preset, name)} size={32} />
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
        : <div className={`dshm-bubble-paper-user ${css.userBubble}`}>{item.text}</div>
      return <>{separator}{body}</>
    }
    return <>{separator}{aiRow(<div className={`dshm-bubble-paper-ai ${css.assistantBubble}`}><RichContent text={item.text} /></div>)}</>
  }
  if (item.kind === 'tool') {
    // A protocol-fence name the model emitted as a tool call renders as the
    // neutral status line only — no protocol name, no failure mark. The
    // shared predicate keeps the cluster split and this render site on one
    // definition (W23-R3 F3).
    if (isProtocolToolRow(item)) {
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
        {aiRow(<FieldAskBubble ask={item} onFill={props.onFill} disabled={props.sending} />)}
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
          <details className={css.degradedNotice} data-testid="degraded-notice">
            {/* W23-B2 P1-7: people-language summary; the raw text (a rejected
                report's CSV can hide here) stays one tap away with its copy
                entry, so the content is never lost to the fold. */}
            <summary>这条消息未能按卡片正常显示，点开可查看原文</summary>
            <pre className={css.degradedNoticeBody}>{item.text}</pre>
            <Button
              type="button"
              size="mini"
              fill="none"
              className={css.degradedCopy}
              aria-label="复制原文"
              onClick={() => { copyCode(item.text) }}
            >
              复制原文
            </Button>
          </details>,
        )}
      </>
    )
  }
  if (item.kind === 'report') {
    // The subtitle is the one card face with no body-layer pass of its own
    // (W23-R3 F2): a persona miss leaked `wfl_approval_todos` here live, so
    // the render site sanitizes before the card consumes the payload. A
    // fully-stripped subtitle renders as absent (the blank-as-omitted
    // equivalence W21-R4 set for optional card text).
    const raw = item.payload.subtitle
    const clean = raw === undefined ? undefined : sanitizeSubtitle(raw)
    const payload = raw === undefined ? item.payload : { ...item.payload, subtitle: clean ?? '' }
    return (
      <>
        {separator}
        {aiRow(
          <ReportCard payload={payload} onAction={(action) => { props.onReportAction(action, item.seq) }} />,
        )}
      </>
    )
  }
  if (item.kind === 'approval') {
    const external = item.payload.type === 'approval_pending'
      ? props.approvalExternalStates.get(`${item.payload.doc.collection}:${item.payload.doc.docId}`)
      : undefined
    return (
      <>
        {separator}
        {aiRow(
          <ApprovalCard payload={item.payload} onSend={props.onSend} disabled={props.sending} externalState={external} />,
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
