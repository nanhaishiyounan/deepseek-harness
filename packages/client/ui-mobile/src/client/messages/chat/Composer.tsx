/**
 * The chat composer (split from ChatView, W8-B2; re-skinned W9-B5): the
 * context chip row (the conversation-phase shortcuts as capsule-seal chips; a
 * chip pick fills the draft for the user to edit, W9-B1), the input row with
 * the + entry over the slide-up quick panel, the capsule paper textarea
 * (Enter sends, Shift+Enter breaks, composition is never split), and the 46px
 * round persimmon send stamp (the global .dshm-stamp-solid hook) that becomes
 * the stop control while a turn runs. A transient send failure toasts once.
 */

import { useEffect, useState, type JSX, type ReactNode, type RefObject } from 'react'
import { TextArea, Toast, type TextAreaRef } from 'antd-mobile'
import { Plus, Send, Square } from 'lucide-react'
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
}

/**
 * The chat composer bar.
 * @param props - the chip/draft/running state and the sinks.
 * @returns the chip row plus the input bar.
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
        <TextArea
          ref={props.inputRef}
          className={css.input}
          placeholder="问我任何经营问题..."
          aria-label="消息输入"
          value={draft}
          autoSize={{ minRows: 1, maxRows: 4 }}
          onChange={props.onDraftChange}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault()
              props.onSend(draft)
            }
          }}
        />
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
              disabled={draft.trim() === '' || sending}
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

/** One transient composer failure: a toast, retriable by sending again. */
function ErrorToast({ error }: { readonly error: string }): JSX.Element | null {
  useEffect(() => {
    Toast.show({ content: error, position: 'bottom' })
  }, [error])
  return null
}
