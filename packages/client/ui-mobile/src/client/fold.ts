/**
 * Session-event fold for the mobile chat surface: a pure projection from raw
 * `session.history` events onto chat items — narrative bubbles (never
 * protocol fences), tool-call rows with their running/done state, the v3
 * structured items (ask / field-ask / action / receipt / report; each carried
 * by either a ```dsh fence or a `present_card` tool call — the two render
 * sources share one payload mapping), the form-assistant task cards, the
 * collapsed notices for unvalidatable dsh fences and present_card payloads,
 * and the KG evidence descriptors the answer cited. v3 fences (```dsh) split
 * out of the narrative; v2 drafts (```json) keep their legacy parse with the
 * recognized fence stripped from the bubble. Deterministic by seq; no React
 * imports.
 */

import { parseConfirmPush, splitDraftMessage, type ConfirmPush, type FormDraft } from './form-draft.ts'
import { applyDeterministicWidgets } from './widget.ts'
import {
  answerTextOf,
  parseDshPayloadObject,
  splitMessage,
  type DshPayload,
  type MessageSegment,
  type ApprovalConfirmPayload,
  type ApprovalPendingPayload,
  type ApprovalResultPayload,
  type AskChoicePayload,
  type AskFieldPayload,
  type FormConfirmPayload,
  type FormDraftPayload,
  type RejectFlowPayload,
  type PlanConfirmPayload,
  type PlanResultPayload,
  type PlanSuggestPayload,
  type ReportPayload,
  type SubmitReceiptPayload,
} from './protocol.ts'

/** The tool-call name carrying the structured-card payloads (the P2 output channel). */
const PRESENT_CARD_TOOL = 'present_card'

/** One folded text bubble. */
export interface ChatTextMessage {
  readonly kind: 'text'
  readonly seq: number
  readonly time: number
  readonly role: 'user' | 'assistant'
  readonly text: string
  /** Derived: this user bubble answered the preceding ask (renders as the small pick capsule). */
  choiceReply?: boolean
}

/** One tool-call row; `state` flips to done/error when its result lands. */
export interface ChatToolRow {
  readonly kind: 'tool'
  readonly seq: number
  readonly time: number
  readonly name: string
  readonly label: string
  state: 'running' | 'done' | 'error'
  /**
   * A protocol-fence name the model emitted as a tool call (ask_* /
   * form_draft / …): the row renders as the neutral status line, never the
   * protocol name and never the failure mark.
   */
  readonly protocol?: true
}

/** One AI-prefilled form draft rendered as the task card (v3 payload when one rode the message). */
export interface ChatTaskCard {
  readonly kind: 'task-card'
  readonly seq: number
  readonly time: number
  readonly draft: FormDraft
  /** The v3 three-tier payload; absent on v2-legacy drafts. */
  readonly payload?: FormDraftPayload
}

/** One ask_choice interaction: the question and its pickable options. */
export interface ChatAsk {
  readonly kind: 'ask'
  readonly seq: number
  readonly time: number
  readonly payload: AskChoicePayload
  /** Derived: set when the following user message answered this ask (selected = the picked value). */
  answered?: { selected?: string }
}

/** One ask_field interaction: a single missing required field. */
export interface ChatFieldAsk {
  readonly kind: 'field-ask'
  readonly seq: number
  readonly time: number
  readonly payload: AskFieldPayload
  /** Derived: set when the following user message answered this ask. */
  answered?: { selected?: string }
}

/** One user action message (确认写入 / 驳回 / 同意·驳回审批), fenced in v3 or prefix-parsed in v2. */
export interface ChatAction {
  readonly kind: 'action'
  readonly seq: number
  readonly time: number
  readonly action: 'confirm' | 'reject'
  /** The human-readable line ("确认写入" / "驳回" / "同意" / the v2 protocol text). */
  readonly text: string
  /** The v3 fence payload when the action rode one. */
  readonly payload?: FormConfirmPayload | RejectFlowPayload | ApprovalConfirmPayload | PlanConfirmPayload
  /** The v2 confirm-push parse when the action rode the legacy prefix. */
  readonly legacy?: ConfirmPush
}

/** One approval card: an open todo (pending, actionable) or the post-act outcome (read-only). */
export interface ChatApproval {
  readonly kind: 'approval'
  readonly seq: number
  readonly time: number
  readonly payload: ApprovalPendingPayload | ApprovalResultPayload
}

/** One submit_receipt fence: the landing-row receipt card. */
export interface ChatReceipt {
  readonly kind: 'receipt'
  readonly seq: number
  readonly time: number
  readonly payload: SubmitReceiptPayload
}

/** One report fence: the structured report card (metrics/rows/table/actions). */
export interface ChatReport {
  readonly kind: 'report'
  readonly seq: number
  readonly time: number
  readonly payload: ReportPayload
}

/** One dsh fence that failed validation: the collapsed summary row, never the raw JSON bubble. */
export interface ChatDegradedNotice {
  readonly kind: 'degraded'
  readonly seq: number
  readonly time: number
  /** The original fenced text, kept for the expandable原文 view. */
  readonly text: string
}

/** One MRP plan card: a pending suggestion or its post-confirm outcome (B7). */
export interface ChatPlanCard {
  readonly kind: 'plan'
  readonly seq: number
  readonly time: number
  readonly payload: PlanSuggestPayload | PlanResultPayload
}

/** The chat surface's item union in seq order. */
export type ChatItem =
  | ChatTextMessage | ChatToolRow | ChatTaskCard | ChatAsk | ChatFieldAsk
  | ChatAction | ChatReceipt | ChatReport | ChatApproval | ChatPlanCard | ChatDegradedNotice

/** A KG walk the assistant performed, kept for the evidence cards. */
export type KgEvidenceQuery =
  | { readonly kind: 'subgraph'; readonly seeds: readonly string[] }
  | { readonly kind: 'phrase'; readonly phrase: string }

/** The whole fold output for one history window. */
export interface FoldedTurn {
  readonly items: readonly ChatItem[]
  /** True when the newest turn opened but has not ended. */
  readonly running: boolean
  /** KG queries in event order (deduplicated, last occurrence wins position). */
  readonly kgQueries: readonly KgEvidenceQuery[]
  /** Degraded cards: fences that failed validation plus tool-rejected present_card calls, collapsed to notice rows. */
  readonly degradedCards: number
}

/**
 * The neutral status-line labels for protocol-fence names arriving as tool
 * calls (a contract violation the surface still renders people-language).
 */
const PROTOCOL_TOOL_LABELS: Readonly<Record<string, string>> = {
  form_draft: '正在整理草稿…',
  form_confirm: '正在确认…',
  reject_flow: '正在处理驳回…',
  submit_receipt: '正在登记…',
}

/** Ask-shaped protocol names share one label (`ask_choice`, `ask_field_pricing`, …). */
const ASK_TOOL_LABEL = '补充信息…'

/**
 * Whether a tool-call name belongs to the structured-message protocol: those
 * payloads are fences, not tools, so a call under one folds to the neutral
 * status line instead of a tool row.
 */
function protocolToolLabel(name: string): string | undefined {
  if (name.startsWith('ask_')) return ASK_TOOL_LABEL
  return PROTOCOL_TOOL_LABELS[name]
}

/**
 * The KPI-lookup projection (B9): an nb_list aimed at kpi_snapshots renders
 * as the 看板指标 status line — the dashboard's mobile cockpit entry reads
 * the same materialized rows the admin charts draw from.
 * @param name - the tool-call name.
 * @param rawArguments - the call's raw argument string.
 * @returns the override label, or undefined when the call is not a KPI lookup.
 */
function kpiLookupLabel(name: string, rawArguments: unknown): string | undefined {
  if (name !== 'nb_list' || typeof rawArguments !== 'string') return undefined
  try {
    const args = JSON.parse(rawArguments) as { collection?: unknown }
    return args.collection === 'kpi_snapshots' ? '查询看板指标' : undefined
  } catch {
    // Swallows only JSON.parse's SyntaxError on a non-JSON argument string:
    // the string came from the untyped tool-call wire, so malformed JSON is
    // an expected shape and the only correct reading is "not a KPI lookup".
    return undefined
  }
}

/** Chinese label for a tool name (the fold's presentation vocabulary). */
const TOOL_LABELS: Readonly<Record<string, string>> = {
  nb_collections: '读取业务表结构',
  nb_list: '查询业务记录',
  nb_get: '读取业务行',
  nb_create: '写入业务记录',
  nb_update: '更新业务记录',
  nb_approve: '审批操作',
  kb_search: '检索知识库',
  lakehouse_tables: '数仓表清单',
  lakehouse_query: '数仓查询',
  kg_schema: '读取图谱本体',
  kg_subgraph: '图谱走查',
  kg_query: '图谱短语查询',
  connector_discover: '连接器发现',
  connector_fetch: '连接器预览',
  connector_transfer: '连接器落库',
  order_create: '下单',
  order_status: '订单状态',
}

/** The raw session-event shape the fold consumes (structural wire read). */
export interface FoldEvent {
  readonly type: string
  readonly seq: number
  readonly time: number
  readonly data: unknown
}

/** Text blocks of an event's message content array (absent when not one). */
function textBlocksOf(content: unknown): string[] {
  if (!Array.isArray(content)) return []
  return content
    .filter((block): block is { type: string; text?: unknown } =>
      typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text')
    .map(block => typeof block.text === 'string' ? block.text : '')
}

/** The content array of a message-shaped event data field. */
function contentOf(data: unknown): unknown {
  return (data as { content?: unknown } | undefined)?.content
}

/**
 * The tool-use id a tool/result event answers: the result message's first
 * block carries the provider-neutral `toolCallId` (the event data itself has
 * no callId field). `isError` on the same block marks the failed calls.
 */
function resultCallOf(data: unknown): { callId?: string; failed?: boolean } {
  const content = (data as { message?: { content?: unknown } } | undefined)?.message?.content
  if (!Array.isArray(content) || content.length === 0) return {}
  const block = content[0] as { toolCallId?: unknown; tool_use_id?: unknown; isError?: unknown }
  const id = typeof block.toolCallId === 'string' ? block.toolCallId
    : typeof block.tool_use_id === 'string' ? block.tool_use_id
      : undefined
  return id === undefined ? {} : { callId: id, failed: block.isError === true }
}

/**
 * The result block's text content (nb_create's landing receipt parses from
 * it) — the first text block of the tool result's content array.
 */
function resultTextOf(data: unknown): string {
  const content = (data as { message?: { content?: unknown } } | undefined)?.message?.content
  if (!Array.isArray(content) || content.length === 0) return ''
  const blocks = (content[0] as { content?: unknown }).content
  if (!Array.isArray(blocks)) return ''
  for (const block of blocks) {
    const text = (block as { type?: unknown; text?: unknown }).text
    if ((block as { type?: unknown }).type === 'text' && typeof text === 'string') return text
  }
  return ''
}

/** The v2 flat-draft projection of a v3 payload (the legacy render path's data). */
function legacyDraftOf(payload: FormDraftPayload): FormDraft {
  const fields: Record<string, string> = {}
  for (const field of payload.fields) {
    if (field.value !== null) fields[field.name] = field.value
  }
  return { collection: payload.form.collection, title: payload.title, fields }
}

/**
 * The receipt verification ledger (W6-B1 leftover ①): collection:id pairs
 * every successful nb_create tool result landed in this history window. A
 * submit_receipt fence may only render as the receipt card when its rowId
 * matches one of these — the model's narrative is no longer a receipt
 * source (a pathological confirm+reject round used to bait a fabricated
 * submit_receipt out of the model with no nb_create behind it).
 */
export interface ReceiptVerification {
  /** `collection:id` pairs of successful nb_create results, in event order. */
  readonly landedCreates: ReadonlySet<string>
}

/** One nb_create landing line as its tool result text opens (`已在 X 创建第 N 行：`). */
const CREATE_LINE = /^已在 (\S+) 创建第 (\d+) 行：/u

/**
 * Append one validated dsh payload's chat item — the shared mapping both
 * render sources ride (the ```dsh fence source and the `present_card`
 * tool-call source), so a card renders identically whichever channel carried
 * it. A submit_receipt renders only against a matching successful nb_create
 * result (W6-B1 leftover ①) — anything else folds to the collapsed notice
 * with the cause spelled out (the model narrative is not a receipt source).
 * @param payload - the validated protocol payload.
 * @param seq - the item's seq (the fence path sub-sequences inside one message).
 * @param time - the carrying event's time.
 * @param items - the fold's item sink, in order.
 * @param degradedOut - the degraded-count accumulator.
 * @param verification - the receipt verification ledger for this window.
 */
function appendPayloadItem(
  payload: DshPayload, seq: number, time: number, items: ChatItem[], degradedOut: { count: number }, verification: ReceiptVerification,
): void {
  // W22-R2: the render-side deterministic widget rewrite — both payload
  // channels (present_card tool calls and legacy ```dsh fences) ride this
  // shared mapping, so a model-declared `text` on `quantity` renders the
  // number keypad whichever route carried the card. The log keeps the
  // declaration; only the rendered control follows the classification.
  const classified = applyDeterministicWidgets(payload)
  if (classified.type === 'submit_receipt'
    && !verification.landedCreates.has(`${classified.form.collection}:${classified.rowId}`)) {
    degradedOut.count += 1
    items.push({
      kind: 'degraded',
      seq,
      time,
      text: `回执未经落库核实（没有对应的写入结果落库 ${classified.form.collection} 第 ${classified.rowId} 行），该回执不可信，请以单据页为准`,
    })
    return
  }
  switch (classified.type) {
    case 'ask_choice':
      items.push({ kind: 'ask', seq, time, payload: classified })
      break
    case 'ask_field':
      items.push({ kind: 'field-ask', seq, time, payload: classified })
      break
    case 'form_draft':
      items.push({ kind: 'task-card', seq, time, draft: legacyDraftOf(classified), payload: classified })
      break
    case 'submit_receipt':
      items.push({ kind: 'receipt', seq, time, payload: classified })
      break
    case 'report':
      items.push({ kind: 'report', seq, time, payload: classified })
      break
    case 'form_confirm':
    case 'reject_flow':
    case 'approval_confirm':
    case 'plan_confirm':
      // User-action fences never render from an assistant message; a model
      // emitting one is violating the contract, and dropping the payload
      // keeps the replay honest.
      break
    case 'approval_pending':
    case 'approval_result':
      items.push({ kind: 'approval', seq, time, payload: classified })
      break
    case 'plan_suggest':
    case 'plan_result':
      items.push({ kind: 'plan', seq, time, payload: classified })
      break
  }
}

/** Fold one assistant message's text through the v3 splitter into items. */
function foldAssistantText(
  text: string, seq: number, time: number, items: ChatItem[], degradedOut: { count: number }, verification: ReceiptVerification,
): void {
  const { segments, degraded } = splitMessage(text)
  degradedOut.count += degraded
  // A degraded dsh fence still marks the message as v3: its payload failed
  // validation, but the fence itself must never fall into the v2 narrative.
  const hasV3 = segments.some(segment => segment.kind === 'dsh' || segment.kind === 'degraded')
  if (!hasV3) {
    // v2 legacy: the recognized ```json draft fences leave the narrative.
    const { narrative, drafts } = splitDraftMessage(text)
    if (narrative !== '') items.push({ kind: 'text', seq, time, role: 'assistant', text: narrative })
    drafts.forEach((draft, index) => {
      items.push({ kind: 'task-card', seq: seq + 0.5 + index * 0.1, time, draft })
    })
    return
  }
  segments.forEach((segment, index) => {
    const itemSeq = seq + index * 0.01
    if (segment.kind === 'text') {
      items.push({ kind: 'text', seq: itemSeq, time, role: 'assistant', text: segment.text })
      return
    }
    if (segment.kind === 'degraded') {
      items.push({ kind: 'degraded', seq: itemSeq, time, text: segment.text })
      return
    }
    appendPayloadItem(segment.payload, itemSeq, time, items, degradedOut, verification)
  })
}

/**
 * Fold one `present_card` tool call into its chat card — the structured-card
 * output channel that replaced the ```dsh fence as the model's authoritative
 * route. The raw arguments string parses and validates against the same
 * payload validators the fence path rides; a violation folds to the collapsed
 * notice instead of a tool row (the card IS the tool's presentation, so no
 * neutral row ever appears and the tool/result finds no row to flip). A call
 * whose tool/result landed `isError` (W22-R2) never renders the interactive
 * card either — the rejected payload folds to the collapsed notice so a stale
 * card cannot be confirmed against a corrected retry.
 * @param rawArguments - the call's raw argument string.
 * @param seq - the call event's seq.
 * @param time - the call event's time.
 * @param rejected - whether the call's tool/result landed as an error.
 * @param items - the fold's item sink, in order.
 * @param degradedOut - the degraded-count accumulator.
 * @param verification - the receipt verification ledger for this window.
 */
function foldPresentCard(
  rawArguments: unknown,
  seq: number,
  time: number,
  rejected: boolean,
  items: ChatItem[],
  degradedOut: { count: number },
  verification: ReceiptVerification,
): void {
  if (rejected) {
    degradedOut.count += 1
    items.push({
      kind: 'degraded',
      seq,
      time,
      // Cause-neutral: isError also covers timeouts and internal tool
      // failures, not only payload validation.
      text: '这张卡片未通过校验已被系统退回，不可交互；请以后续修正后的卡片为准',
    })
    return
  }
  let payload: DshPayload | undefined
  if (typeof rawArguments === 'string') {
    try {
      payload = parseDshPayloadObject((JSON.parse(rawArguments) as { payload?: unknown } | null)?.payload)
    } catch {
      // Swallows only JSON.parse's SyntaxError on a non-JSON argument string:
      // the string came from the untyped tool-call wire, so malformed JSON
      // lands in the degraded notice below.
      payload = undefined
    }
  }
  if (payload === undefined) {
    degradedOut.count += 1
    items.push({
      kind: 'degraded',
      seq,
      time,
      text: 'present_card 载荷未通过校验，已折叠；如需该内容请让助手重新呈现',
    })
    return
  }
  appendPayloadItem(payload, seq, time, items, degradedOut, verification)
}

/** The action message's display line: its narrative text or the fixed default. */
function actionLineOf(action: 'confirm' | 'reject', segments: readonly MessageSegment[]): string {
  const line = segments.find(segment => segment.kind === 'text')
  if (line !== undefined) return line.text
  return action === 'confirm' ? '确认写入' : '驳回'
}

/**
 * The legacy session-opening identity stamp line (W6-B0 through W8; the
 * gateway retired it in W9-B2 — identity now rides the system prompt): the
 * durable logs of old sessions keep the line, so display folding strips a
 * first-line stamp and keeps the prose underneath. The match requires the
 * full server-stamped sentence — the `——本行由系统注入` tail is the
 * injection marker a hand-typed `【登录身份】…` line never carries, so a
 * user's own first-line mention keeps its bubble.
 */
const LEGACY_IDENTITY_STAMP_LINE = /^【登录身份】[^\n]*——本行由系统注入/

/** Strip a first-line legacy identity stamp; any later occurrence stays (only the server wrote it first). */
function stripLegacyIdentityStamp(text: string): string {
  if (!LEGACY_IDENTITY_STAMP_LINE.test(text)) return text
  return text.split('\n').slice(1).join('\n')
}

/** Fold one user message: fenced/prefixed actions collapse, the rest bubbles. */
function foldUserText(text: string, seq: number, time: number, items: ChatItem[]): void {
  const { segments } = splitMessage(text)
  const fence = segments.find((segment): segment is { kind: 'dsh'; payload: FormConfirmPayload | RejectFlowPayload | ApprovalConfirmPayload | PlanConfirmPayload } =>
    segment.kind === 'dsh' && (segment.payload.type === 'form_confirm' || segment.payload.type === 'reject_flow' || segment.payload.type === 'approval_confirm' || segment.payload.type === 'plan_confirm'))
  if (fence !== undefined) {
    const action = fence.payload.type === 'reject_flow' || fence.payload.type === 'approval_confirm' && fence.payload.action === 'reject' || fence.payload.type === 'plan_confirm' && fence.payload.action === 'dismiss' ? 'reject' : 'confirm'
    items.push({
      kind: 'action',
      seq,
      time,
      action,
      text: actionLineOf(action, segments),
      payload: fence.payload,
    })
    return
  }
  const legacyConfirm = parseConfirmPush(text)
  if (legacyConfirm !== undefined) {
    items.push({ kind: 'action', seq, time, action: 'confirm', text, legacy: legacyConfirm })
    return
  }
  if (text.startsWith('驳回：')) {
    items.push({ kind: 'action', seq, time, action: 'reject', text })
    return
  }
  const display = stripLegacyIdentityStamp(text)
  if (display.length > 0) {
    items.push({ kind: 'text', seq, time, role: 'user', text: display })
  }
}

/**
 * Derive the answered state of every ask/field-ask: the first user text item
 * after an ask answers it (picked option highlighted on an exact send-text
 * match; free text answers it without a highlight); any assistant-owned item
 * before that retires the ask. Tool rows do not retire an ask.
 */
function deriveAnswered(items: ChatItem[]): void {
  let pending: ChatAsk | ChatFieldAsk | undefined
  for (const item of items) {
    if (item.kind === 'ask' || item.kind === 'field-ask') {
      pending = item
      continue
    }
    if (item.kind === 'tool') continue
    if (item.kind === 'text' && item.role === 'user' && pending !== undefined) {
      let selected: string | undefined
      if (pending.kind === 'ask') {
        selected = pending.payload.options.find(option => answerTextOf(option) === item.text)?.value
      } else {
        selected = pending.payload.field.suggestions.find(
          suggestion => suggestion.label === item.text || suggestion.value === item.text,
        )?.value
      }
      pending.answered = selected === undefined ? {} : { selected }
      item.choiceReply = selected !== undefined
      pending = undefined
      continue
    }
    if (item.kind === 'text' && item.role === 'user') continue
    // Assistant narrative, cards, asks, receipts, notices, and actions all
    // mean the conversation moved on; a stale ask renders unanswered.
    pending = undefined
  }
}

/**
 * Fold one history window into chat items.
 * @param events - raw session events (envelope + data), any order tolerated.
 * @returns the folded surface plus running state and KG queries.
 */
export function foldHistory(events: readonly FoldEvent[]): FoldedTurn {
  const sorted = [...events].sort((a, b) => a.seq - b.seq)
  const items: ChatItem[] = []
  const toolRows = new Map<string, ChatToolRow>()
  const kgQueries: KgEvidenceQuery[] = []
  const degraded = { count: 0 }
  // Turn bookkeeping: an open turn/start without its turn/end means running.
  const openTurns = new Set<number>()
  let sawAnyTurn = false
  // Receipt verification (W6-B1 ①): callIds of open nb_create calls and the
  // collection:id pairs their successful results landed.
  const nbCreateCalls = new Set<string>()
  const landedCreates = new Set<string>()
  const verification: ReceiptVerification = { landedCreates }
  // Rejected present_card calls (W22-R2): a tool/result with `isError` marks
  // the card's payload as bounced; the fold is a full replay, so collecting
  // the failed callIds up front lets each call know its outcome.
  const rejectedPresentCards = rejectedPresentCardIds(sorted)

  for (const event of sorted) {
    switch (event.type) {
      case 'turn/start': {
        sawAnyTurn = true
        openTurns.add((event.data as { turn?: unknown }).turn as number)
        break
      }
      case 'turn/end': {
        openTurns.delete((event.data as { turn?: unknown }).turn as number)
        break
      }
      case 'user/message': {
        const data = event.data as { source?: { kind?: unknown } } | undefined
        if (data?.source?.kind !== 'user') break
        const text = textBlocksOf(contentOf(data)).join('')
        if (text === '') break
        foldUserText(text, event.seq, event.time, items)
        break
      }
      case 'assistant/message': {
        // The event data wraps the message: {turn, step, message}.
        const text = textBlocksOf((event.data as { message?: { content?: unknown } }).message?.content).join('')
        if (text === '') break
        foldAssistantText(text, event.seq, event.time, items, degraded, verification)
        break
      }
      case 'tool/call': {
        const data = event.data as { callId?: unknown; name?: unknown; arguments?: unknown }
        const name = typeof data.name === 'string' ? data.name : 'tool'
        if (name === PRESENT_CARD_TOOL) {
          // The structured-card channel renders its payload, never a tool row;
          // its callId stays unregistered so the tool/result stays inert.
          foldPresentCard(
            data.arguments, event.seq, event.time,
            typeof data.callId === 'string' && rejectedPresentCards.has(data.callId),
            items, degraded, verification,
          )
          break
        }
        const protocolLabel = protocolToolLabel(name)
        const kpiLabel = kpiLookupLabel(name, data.arguments)
        const row: ChatToolRow = {
          kind: 'tool',
          seq: event.seq,
          time: event.time,
          name,
          label: protocolLabel ?? kpiLabel ?? TOOL_LABELS[name] ?? name,
          state: 'running',
          ...(protocolLabel !== undefined ? { protocol: true } : {}),
        }
        items.push(row)
        if (typeof data.callId === 'string') toolRows.set(data.callId, row)
        if (name === 'nb_create' && typeof data.callId === 'string') nbCreateCalls.add(data.callId)
        collectKgQuery(name, data.arguments, kgQueries)
        break
      }
      case 'tool/result': {
        const { callId, failed } = resultCallOf(event.data)
        if (callId !== undefined) {
          const row = toolRows.get(callId)
          if (row !== undefined) row.state = failed === true ? 'error' : 'done'
          // A successful nb_create result's landing line joins the receipt
          // verification ledger (W6-B1 ①) — seq order guarantees the result
          // precedes any receipt fence that cites it.
          if (failed !== true && nbCreateCalls.has(callId)) {
            const landed = CREATE_LINE.exec(resultTextOf(event.data))
            if (landed !== null) landedCreates.add(`${landed[1]}:${landed[2]}`)
          }
        }
        break
      }
      default:
        break
    }
  }
  deriveAnswered(items)
  const running = sawAnyTurn && openTurns.size > 0
  return { items, running, kgQueries, degradedCards: degraded.count }
}

/**
 * Collect the callIds whose `present_card` tool/result landed `isError`
 * (W22-R2): the fold replays a whole window at once, so one pre-pass pairs
 * each rejected result with its originating call before any item renders.
 * Only present_card callIds are consulted at the call sites, so the set may
 * conservatively hold other tools' failed ids without effect.
 * @param events - the seq-sorted events of one history window.
 * @returns the failed tool/result callIds.
 */
function rejectedPresentCardIds(events: readonly FoldEvent[]): ReadonlySet<string> {
  const rejected = new Set<string>()
  for (const event of events) {
    if (event.type !== 'tool/result') continue
    const { callId, failed } = resultCallOf(event.data)
    if (callId !== undefined && failed === true) rejected.add(callId)
  }
  return rejected
}

/** Record one KG walk descriptor from a tool call's raw arguments string. */
function collectKgQuery(name: string, rawArguments: unknown, sink: KgEvidenceQuery[]): void {
  if (typeof rawArguments !== 'string') return
  if (name !== 'kg_subgraph' && name !== 'kg_query') return
  let parsed: unknown
  try {
    parsed = JSON.parse(rawArguments)
  } catch {
    return
  }
  const args = parsed as { seeds?: unknown; phrase?: unknown } | null
  if (args === null || typeof args !== 'object') return
  if (name === 'kg_subgraph' && Array.isArray(args.seeds) && args.seeds.every(s => typeof s === 'string')) {
    pushDedup(sink, { kind: 'subgraph', seeds: args.seeds })
  }
  if (name === 'kg_query' && typeof args.phrase === 'string' && args.phrase !== '') {
    pushDedup(sink, { kind: 'phrase', phrase: args.phrase })
  }
}

/** Append unless an equal descriptor is already present. */
function pushDedup(sink: KgEvidenceQuery[], query: KgEvidenceQuery): void {
  const equal = sink.some(existing => JSON.stringify(existing) === JSON.stringify(query))
  if (!equal) sink.push(query)
}
