/**
 * The composer's slide-up quick panel (split from ChatView, W8-B2): the
 * colleague's own starter commands as the two-column grid plus the three
 * placeholder tools (local toasts, never real lanes). The open animation
 * rides the 220ms slide-fade (reduced-motion degrades to none); picking a
 * command closes the panel and sends through the parent's sink.
 */

import type { JSX } from 'react'
import { Toast } from 'antd-mobile'
import { BarChart3, CalendarClock, ClipboardCheck, FileText, Mic, Paperclip, PenLine, Search, Smile } from 'lucide-react'
import css from '../chat.module.css'

/** One starter command the panel lists (the colleague's welcome starters). */
export interface QuickCommand {
  readonly label: string
  readonly send: string
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

/** Quick-panel props: the starter commands, the busy gate, and the pick sink. */
export interface QuickPanelProps {
  readonly commands: readonly QuickCommand[]
  readonly sending: boolean
  /** Closes the panel and sends the picked starter's send-text. */
  readonly onPick: (text: string) => void
}

/**
 * The slide-up quick panel.
 * @param props - the commands, the busy gate, the pick sink.
 * @returns the panel dialog.
 */
export function QuickPanel({ commands, sending, onPick }: QuickPanelProps): JSX.Element {
  return (
    <div className={css.quickPanel} role="dialog" aria-label="快捷指令">
      <p className={css.qpTitle}>快捷指令</p>
      {commands.length > 0 ? (
        <div className={css.qpGrid}>
          {commands.map((command, index) => (
            <button
              key={command.send}
              type="button"
              className={css.qpItem}
              disabled={sending}
              onClick={() => { onPick(command.send) }}
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
  )
}
