/**
 * The composer's slide-up quick panel (split from ChatView, W8-B2): the
 * colleague's own starter commands as the two-column grid plus the tool grid
 * (W11-B2: the three placeholder toasts became the real lanes — voice,
 * camera, album, files — as a 2×2 capsule-tile grid). The open animation
 * rides the 220ms slide-fade (reduced-motion degrades to none); picking a
 * command closes the panel and fills the composer draft through the parent's
 * sink (W9-B1); picking a tool hands the lane to the parent's onToolPick
 * (the picker inputs and the voice lifecycle live in ChatView).
 */

import type { JSX } from 'react'
import { BarChart3, CalendarClock, Camera, ClipboardCheck, FileText, Image, Mic, PenLine, Search } from 'lucide-react'
import css from '../chat.module.css'
import { hoistToast } from './toast.ts'

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

/** One composer tool lane the panel's tool grid offers. */
export type ComposerTool = 'voice' | 'camera' | 'album' | 'file'

/** One tool tile: its lane id, glyph, and label. */
interface ToolTile {
  readonly tool: ComposerTool
  readonly label: string
  readonly icon: JSX.Element
}

/** Quick-panel props: the starter commands, the gates, and the pick sinks. */
export interface QuickPanelProps {
  readonly commands: readonly QuickCommand[]
  readonly sending: boolean
  /** Carries the picked starter's send-text to the parent (fill + panel close). */
  readonly onPick: (text: string) => void
  /**
   * Hands a tool-lane pick to the parent (the pickers and the voice toggle
   * live in ChatView). `voice` and `album` are rendered only when the lane
   * can run — see `voiceSupported`.
   */
  readonly onToolPick: (tool: ComposerTool) => void
  /**
   * The voice lane's detect verdict: 'no' hides the voice tile (the WeChat
   * webview never exposes the engine), 'broken' renders it inert with a
   * hint, 'yes' runs it.
   */
  readonly voiceSupported: 'yes' | 'no' | 'broken'
}

/**
 * The slide-up quick panel.
 * @param props - the commands, the gates, and the pick sinks.
 * @returns the panel dialog.
 */
export function QuickPanel({ commands, sending, onPick, onToolPick, voiceSupported }: QuickPanelProps): JSX.Element {
  const tools: readonly ToolTile[] = voiceSupported === 'no'
    ? [
      { tool: 'camera', label: '拍照', icon: <Camera size={16} strokeWidth={1.8} aria-hidden="true" /> },
      { tool: 'album', label: '相册', icon: <Image size={16} strokeWidth={1.8} aria-hidden="true" /> },
      { tool: 'file', label: '文件', icon: <FileText size={16} strokeWidth={1.8} aria-hidden="true" /> },
    ]
    : [
      { tool: 'voice', label: '语音', icon: <Mic size={16} strokeWidth={1.8} aria-hidden="true" /> },
      { tool: 'camera', label: '拍照', icon: <Camera size={16} strokeWidth={1.8} aria-hidden="true" /> },
      { tool: 'album', label: '相册', icon: <Image size={16} strokeWidth={1.8} aria-hidden="true" /> },
      { tool: 'file', label: '文件', icon: <FileText size={16} strokeWidth={1.8} aria-hidden="true" /> },
    ]
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
      <div className={css.qpTools} role="toolbar" aria-label="工具">
        {tools.map(tool => (
          <button
            key={tool.tool}
            type="button"
            className={css.qpTool}
            aria-disabled={voiceSupported === 'broken' && tool.tool === 'voice' ? true : undefined}
            onClick={() => {
              if (voiceSupported === 'broken' && tool.tool === 'voice') {
                hoistToast({ content: '当前环境不支持语音，试试拍照或打字' })
                return
              }
              onToolPick(tool.tool)
            }}
          >
            {tool.icon}
            {tool.label}
          </button>
        ))}
      </div>
    </div>
  )
}
