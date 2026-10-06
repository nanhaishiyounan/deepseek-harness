/**
 * The chat composer (split from ChatView, W8-B2; re-skinned W9-B5): the
 * context chip row (the conversation-phase shortcuts as capsule-seal chips; a
 * chip pick fills the draft for the user to edit, W9-B1), the draft
 * attachment strip (W11-B2: one chip per picked image/document — thumbnail,
 * name, uploading breath / failed rim with the human hint, a remove ×), the
 * input row with the + entry over the slide-up quick panel, the capsule
 * paper textarea (Enter sends, Shift+Enter breaks, composition is never
 * split), the listening card that covers the input slot's box while voice
 * recognition runs (the persimmon pulse dot plus the live interim text; the
 * textarea itself stays mounted and untouched), and the 46px round persimmon
 * send stamp (the global .dshm-stamp-solid hook) that becomes the stop
 * control while a turn runs. A transient send failure toasts once.
 */

import { useEffect, useRef, useState, type JSX, type ReactNode, type RefObject } from 'react'
import { TextArea, Toast, type TextAreaRef } from 'antd-mobile'
import { FileWarning, Image as ImageIcon, Loader2, Plus, Send, Square, X } from 'lucide-react'
import type { DraftAttachment } from './attachments.ts'
import css from '../chat.module.css'

/** Composer props: the chip/draft/running state and the orchestration sinks. */
export interface ComposerProps {
  /** The conversation-phase chip texts (empty renders no chip row). */
  readonly chips: readonly string[]
  /** The chip gate (sending or a running turn). */
  readonly chipsDisabled: boolean
  readonly draft: string
  readonly onDraftChange: (next: string) => void
  readonly sending: boolean
  readonly running: boolean
  readonly onSend: (text: string) => void
  /** The assist-input fill sink: a context-chip pick fills the draft (W9-B1). */
  readonly onFill: (text: string) => void
  /** Timestamp of the last fill (drives the one-shot data-fill flash). */
  readonly filledAt: number
  readonly onStop: () => void
  /** The transient send-failure text (undefined toasts nothing). */
  readonly error: string | undefined
  /** The quick panel's open flag (the + entry's face). */
  readonly panelOpen: boolean
  /** The quick panel node (rendered above the chip row while open). */
  readonly panel: ReactNode
  readonly onTogglePanel: () => void
  /** The shared textarea ref (the free-text entry focuses it). */
  readonly inputRef: RefObject<TextAreaRef>
  /** The draft attachment rows (W11-B2); empty renders no strip. */
  readonly attachments: readonly DraftAttachment[]
  /** Removes one draft attachment chip (the ×). */
  readonly onRemoveAttachment: (id: string) => void
  /** The voice lane's listening flag: true covers the input slot with the listening card. */
  readonly listening: boolean
  /** The voice lane's live interim text (the listening card's body). */
  readonly interim: string
  /** Ends the listening stretch (the card's own tap target). */
  readonly onStopListening: () => void
}

/**
 * The chat composer bar.
 * @param props - the chip/draft/running state and the sinks.
 * @returns the chip row, the attachment strip, and the input bar.
 */
export function Composer(props: ComposerProps): JSX.Element {
  const { chips, chipsDisabled, draft, sending, running, panelOpen } = props
  // The one-shot fill flash (W9-B1): data-fill rides the input row briefly
  // after each fill; the visual layer is B5's to redesign.
  const [fillLive, setFillLive] = useState(false)
  useEffect(() => {
    if (props.filledAt === 0) return
    setFillLive(true)
    const timer = setTimeout(() => { setFillLive(false) }, 650)
    return () => { clearTimeout(timer) }
  }, [props.filledAt])
  // The send gate's single source (W11-R1): a ready attachment alone arms the
  // send — an uploading or failed row never reaches the wire, so it never arms
  // the send either. The stamp and the Enter path bind the same flag.
  const hasReadyAttachment = props.attachments.some(row => row.status === 'ready')
  const canSend = (draft.trim() !== '' || hasReadyAttachment) && !sending
  // The one-shot failed-attachment toast (W11-R1, aggregated W11-R2): picks
  // that land failed name themselves once — together in one toast when a
  // batch fails, so three failed picks read as one sentence, not three
  // toasts stacked over each other; the chips' own error lines carry the
  // detail for as long as they stay, so a repeat toast would nag. The toast
  // lifts clear of the strip (W11-R3): the failed rows live on the strip,
  // and the strip rides the same bottom band the bottom toast anchors to.
  const toasted = useRef<ReadonlySet<string>>(new Set())
  useEffect(() => {
    const fresh = props.attachments.filter(row =>
      row.status === 'failed' && row.error !== undefined && !toasted.current.has(row.id))
    if (fresh.length === 0) return
    const seen = new Set(toasted.current)
    for (const row of fresh) seen.add(row.id)
    toasted.current = seen
    const reasons = fresh.map(row => `「${row.name}」${row.error}`).join('；')
    Toast.show({
      content: `${fresh.length}项附件上传失败：${reasons}`,
      position: 'bottom',
      ...(css.toastLift === undefined ? {} : { maskClassName: css.toastLift }),
    })
  }, [props.attachments])
  return (
    <div className={css.composer}>
      {panelOpen && props.panel}
      {chips.length > 0 && (
        <div className={css.chipRow}>
          {chips.map(text => (
            <button
              key={text}
              type="button"
              className={`dshm-seal-chip ${css.chip}`}
              disabled={chipsDisabled}
              onClick={() => { props.onFill(text) }}
            >
              {text}
            </button>
          ))}
        </div>
      )}
      {props.attachments.length > 0 && (
        <div className={css.attachRow} role="list" aria-label="待发送附件">
          {props.attachments.map(attachment => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              onRemove={() => { props.onRemoveAttachment(attachment.id) }}
            />
          ))}
        </div>
      )}
      <div className={css.inputRow} data-fill={fillLive ? 'true' : undefined}>
        <button
          type="button"
          className={`${css.plusBtn} ${panelOpen ? css.plusBtnOn : ''}`}
          aria-label={panelOpen ? '收起快捷面板' : '打开快捷面板'}
          aria-expanded={panelOpen}
          onClick={props.onTogglePanel}
        >
          <Plus size={22} strokeWidth={1.8} aria-hidden="true" />
        </button>
        <div className={css.inputShell}>
          <TextArea
            ref={props.inputRef}
            className={css.input}
            placeholder="问我任何经营问题..."
            aria-label="消息输入"
            value={draft}
            rows={1}
            autoSize={{ minRows: 1, maxRows: 4 }}
            onChange={props.onDraftChange}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                if (canSend) props.onSend(draft)
              }
            }}
          />
          {props.listening && (
            <button
              type="button"
              className={css.listeningCard}
              aria-label="正在聆听，点击结束"
              onClick={props.onStopListening}
            >
              <span className={css.listenPulse} aria-hidden="true" />
              <span className={css.listenText}>{props.interim === '' ? '正在聆听，点击结束' : props.interim}</span>
            </button>
          )}
        </div>
        {running
          ? (
            <button type="button" className={css.stop} aria-label="停止生成" onClick={props.onStop}>
              <Square size={12} aria-hidden="true" />
              停止
            </button>
          )
          : (
            <button
              type="button"
              className={`dshm-stamp-solid ${css.send}`}
              aria-label="发送"
              disabled={!canSend}
              onClick={() => { props.onSend(draft) }}
            >
              <Send size={19} aria-hidden="true" />
            </button>
          )}
      </div>
      {props.error !== undefined && <ErrorToast error={props.error} />}
    </div>
  )
}

/** One draft attachment chip: the three statuses a pick goes through. */
function AttachmentChip({ attachment, onRemove }: {
  readonly attachment: DraftAttachment
  readonly onRemove: () => void
}): JSX.Element {
  return (
    <div
      className={`${css.attachChip} ${attachment.status === 'failed' ? css.attachChipFailed : ''}`}
      role="listitem"
      aria-label={`附件 ${attachment.name}`}
      data-status={attachment.status}
    >
      {attachment.kind === 'image' && attachment.thumbUrl !== undefined
        ? <img className={css.attachThumb} src={attachment.thumbUrl} alt="" />
        : (
          <span className={css.attachGlyph} aria-hidden="true">
            {attachment.status === 'failed' ? <FileWarning size={15} /> : <ImageIcon size={15} />}
          </span>
        )}
      {attachment.status === 'uploading' && (
        <Loader2 className={css.attachSpinner} size={13} aria-hidden="true" />
      )}
      <span className={css.attachName}>{attachment.name}</span>
      <button
        type="button"
        className={css.attachRemove}
        aria-label={`移除 ${attachment.name}`}
        onClick={onRemove}
      >
        <X size={12} aria-hidden="true" />
      </button>
      {attachment.status === 'failed' && attachment.error !== undefined && (
        <span className={css.attachError}>{attachment.error}</span>
      )}
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
