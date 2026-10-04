/**
 * The four-tab mobile shell (v6 IA, plans/2026-09-23-mobile-v6-uidesign B1):
 * 消息/同事/工作台/我的 as the tab-bar whitelist pages; every other route
 * (chats, chat, work-with-param, tasks, files, login) renders as a full-screen
 * layer or secondary page with the tab bar hidden. The shell dispatches all
 * nine routes, seeds the first-run demo workspace, mounts the routed view
 * behind a per-route transition key (fade between tabs, slide for the layers),
 * and owns the theme attribute the two-track token set reads.
 */

import { useEffect, type JSX } from 'react'
import { SafeArea, TabBar } from 'antd-mobile'
import { LayoutGrid, MessageSquare, User, Users } from 'lucide-react'
import { seedDemoData } from '../demoSeed.ts'
import { setPortalHost } from '../portal.ts'
import type { MobileIdentity } from '../auth.ts'
import { navigate, useRoute } from '../router.ts'
import { AgentsView } from '../agents/AgentsView.tsx'
import { AlertsView } from '../alerts/AlertsView.tsx'
import { ChatView } from '../messages/ChatView.tsx'
import { DocsView } from '../docs/DocsView.tsx'
import { TodosView } from '../todos/TodosView.tsx'
import { FilesView } from '../files/FilesView.tsx'
import { HomeView } from '../home/HomeView.tsx'
import { MessagesView } from '../messages/MessagesView.tsx'
import { ProfileView } from '../profile/ProfileView.tsx'
import { TasksView } from '../tasks/TasksView.tsx'
import { WorkDetailView } from '../work/WorkDetailView.tsx'
import { WorkView } from '../work/WorkView.tsx'
import css from './shell.module.css'

/** The whitelist of routes that render the tab bar (v6 IA: the mock's four tabs). */
export const TAB_ROUTES: readonly string[] = ['home', 'agents', 'work', 'me']

/** Shell props: the identity, the theme pair, and the logout action. */
export interface MobileShellProps {
  readonly identity: MobileIdentity
  readonly dark: boolean
  readonly onDarkChange: (dark: boolean) => void
  readonly onLogout: () => void
}

/**
 * Render the four-tab shell and the routed view.
 * @param props - identity, theme pair, and logout.
 * @returns the shell tree.
 */
export function MobileShell({ identity, dark, onDarkChange, onLogout }: MobileShellProps): JSX.Element {
  const route = useRoute()
  // The first-run demo workspace seeds once per shell mount (idempotent).
  useEffect(() => {
    seedDemoData()
  }, [])
  // #/login only names the pre-identity gate; once logged in it lands on home.
  const name = route.name === 'login' ? 'home' as const : route.name
  // The tab bar shows on the four whitelisted pages only — a work item id
  // under #/work/:id renders as a full-screen layer (02 §1.2).
  const chrome = TAB_ROUTES.includes(name) && route.param === undefined
  // The transition key: hash changes remount <main>, so the animation runs
  // once per route; tabs fade, layers slide (02 §7.1).
  const routeKey = `${name}:${route.param ?? ''}`
  return (
    <div className={css.shell}>
      <main className={css.body} key={routeKey} data-transition={chrome ? 'fade' : 'slide'} data-route={name}>
        {name === 'home' && <HomeView identityName={identity.nickname} />}
        {name === 'chats' && <MessagesView />}
        {name === 'chat' && route.param !== undefined && <ChatView sessionId={route.param} />}
        {name === 'work' && (route.param === undefined
          ? <WorkView />
          : <WorkDetailView workId={route.param} />)}
        {name === 'todos' && <TodosView />}
        {name === 'alerts' && <AlertsView />}
        {name === 'docs' && <DocsView collection={route.param} rowId={route.param2} />}
        {name === 'tasks' && <TasksView identityName={identity.nickname} />}
        {name === 'files' && <FilesView />}
        {name === 'agents' && <AgentsView />}
        {name === 'me' && (
          <ProfileView identity={identity} dark={dark} onDarkChange={onDarkChange} onLogout={onLogout} />
        )}
      </main>
      <div className={css.portalHost} ref={setPortalHost} />
      {chrome && (
        <nav className={css.tabbar} aria-label="底部导航">
          <TabBar
            activeKey={name}
            onChange={(key) => { navigate(`#/${key}`) }}
            safeArea={false}
          >
            <TabBar.Item key="home" icon={<MessageSquare size={20} strokeWidth={1.8} aria-hidden="true" />} title="消息" />
            <TabBar.Item key="agents" icon={<Users size={20} strokeWidth={1.8} aria-hidden="true" />} title="同事" />
            <TabBar.Item key="work" icon={<LayoutGrid size={20} strokeWidth={1.8} aria-hidden="true" />} title="工作台" />
            <TabBar.Item key="me" icon={<User size={20} strokeWidth={1.8} aria-hidden="true" />} title="我的" />
          </TabBar>
          <SafeArea position="bottom" />
        </nav>
      )}
    </div>
  )
}
