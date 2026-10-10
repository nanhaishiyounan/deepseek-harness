/**
 * The nav's chat menu row: a chat-bubble glyph with the 对话 label (wide) or
 * the icon alone (rail). Active whenever the resolved screen is the chat
 * view — including the pre-resolution state, where the conversation column
 * presents the chat hero. The click rides the seat's common activation
 * channel.
 * @module @deepseek-ai/dsh-client-ui-nav/client/ChatNavItem
 */

import type { JSX } from 'react'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import clsx from 'clsx'
import css from './navItem.module.css'

/** The conversation view id this row activates (the ui-conversation chat tab). */
const CHAT_VIEW = 'chat'

/** Full component props: the sidebar.nav owner share, the seat's common inject, and the locale seat. */
export type ChatNavItemProps =
  PropsRuntime<'sidebar.nav'>
  & PropsLocale<'nav'>

/** A chat-bubble glyph drawn inline — the icon seat stays dependency-free. */
function ChatGlyph(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} aria-hidden="true" className={css.glyph}>
      <path
        d="M3 3.5h10a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H7.2l-3.1 2.4a.6.6 0 0 1-1-.5V11.5h-.1A1.5 1.5 0 0 1 1.5 10V5A1.5 1.5 0 0 1 3 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <line x1="4.5" y1="6.5" x2="11.5" y2="6.5" stroke="currentColor" strokeWidth="1.2" />
      <line x1="4.5" y1="9" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  )
}

/**
 * Render the chat nav row.
 * @param props - the nav column state, the seat's activation machinery, and copy.
 * @returns the menu row (icon + label, or the rail icon).
 */
export function ChatNavItem({ wide, useNavState, activate, t }: ChatNavItemProps): JSX.Element {
  // Pre-resolution (no session body yet) presents the chat hero, so the
  // unresolved screen counts as chat for the highlight.
  const active = useNavState(state => (state.screen?.view ?? CHAT_VIEW) === CHAT_VIEW)
  return (
    <Tooltip label={t('menu.chat.badge')} delayMs={500} disabled={wide}>
      <button
        type="button"
        className={clsx(css.item, !wide && css.rail)}
        data-active={active || undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={t('menu.chat.badge')}
        onClick={() => { activate(CHAT_VIEW) }}
      >
        <ChatGlyph />
        {wide && <span className={css.label}>{t('menu.chat')}</span>}
      </button>
    </Tooltip>
  )
}
