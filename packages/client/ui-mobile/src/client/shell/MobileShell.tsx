/**
 * The two-tab mobile shell (消息/我的) with antd-mobile's TabBar: the tab bar
 * hides on the chat detail route, which renders as a full-screen layer over
 * the shell body, and the shell owns the theme attribute the two-track token
 * set reads. The v2 contacts route retired onto the new-chat bottom sheet.
 */

import type { JSX } from 'react'
import { SafeArea, TabBar } from 'antd-mobile'
import { MessageSquare, User } from 'lucide-react'
import type { MobileIdentity } from '../auth.ts'
import { navigate, useRoute } from '../router.ts'
import { ChatView } from '../messages/ChatView.tsx'
import { MessagesView } from '../messages/MessagesView.tsx'
import { ProfileView } from '../profile/ProfileView.tsx'
import css from './shell.module.css'

/** Shell props: the identity, the theme pair, and the logout action. */
export interface MobileShellProps {
  readonly identity: MobileIdentity
  readonly dark: boolean
  readonly onDarkChange: (dark: boolean) => void
  readonly onLogout: () => void
}

/**
 * Render the two-tab shell and the routed view.
 * @param props - identity, theme pair, and logout.
 * @returns the shell tree.
 */
export function MobileShell({ identity, dark, onDarkChange, onLogout }: MobileShellProps): JSX.Element {
  const route = useRoute()
  // #/login only names the pre-identity gate; once logged in it lands on chats.
  const name = route.name === 'login' ? 'chats' as const : route.name
  const active = name === 'me' ? 'me' : 'chats'
  // The chat detail is a full-screen layer: no tab bar under it (T1).
  const chrome = name !== 'chat'
  return (
    <div className={css.shell}>
      <main className={css.body} data-route={name}>
        {name === 'chat' && route.param !== undefined && <ChatView sessionId={route.param} />}
        {name === 'chats' && <MessagesView />}
        {route.name === 'me' && (
          <ProfileView identity={identity} dark={dark} onDarkChange={onDarkChange} onLogout={onLogout} />
        )}
      </main>
      {chrome && (
        <nav className={css.tabbar} aria-label="底部导航">
          <TabBar
            activeKey={active}
            onChange={(key) => { navigate(key === 'me' ? '#/me' : '#/chats') }}
            safeArea={false}
          >
            <TabBar.Item key="chats" icon={<MessageSquare size={22} aria-hidden="true" />} title="消息" />
            <TabBar.Item key="me" icon={<User size={22} aria-hidden="true" />} title="我的" />
          </TabBar>
          <SafeArea position="bottom" />
        </nav>
      )}
    </div>
  )
}
