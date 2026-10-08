/**
 * The four-tab mobile shell (v6 IA, plans/2026-09-23-mobile-v6-uidesign B1):
 * 消息/同事/工作台/我的 as the tab-bar whitelist pages; every other route
 * (chats, chat, work-with-param, todos, alerts, docs, tasks, files, login)
 * renders as a full-screen layer or secondary page with the tab bar hidden.
 * The four tab pages mount lazily on first visit and then stay alive (W8 B1
 * 侦察 #⑧): `[hidden]` toggles the visible page, so scroll positions, list
 * filters, and half-typed state survive a tab switch, while layers keep the
 * per-route remount + slide transition. Each kept-alive page receives an
 * `active` gate — a hidden page suspends its data reads and re-reads on
 * becoming visible, so keep-alive never turns into parallel pollers. Route
 * changes land focus on the page body without scrolling (W8 §9), and the
 * shell owns the theme attribute the two-track token set reads.
 */

import { useEffect, useRef, useState, type JSX, type KeyboardEvent } from 'react'
import { SafeArea, TabBar } from 'antd-mobile'
import { LayoutGrid, MessageSquare, User, Users } from 'lucide-react'
import { usePageVisible } from '../hooks.ts'
import { syncWorkFromServer } from '../workSync.ts'
import { kickOutboxFlush } from '../outboxStore.ts'
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
  const mainRef = useRef<HTMLElement | null>(null)
  const tabbarRef = useRef<HTMLElement | null>(null)
  // Keep-alive set: every tab page that has been visited stays mounted.
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<string>>(() => new Set(['home']))
  // A (re-)login re-dispatches the parked message outbox immediately — the
  // expiry path keeps it on purpose (W8-B3's re-login backfill contract).
  useEffect(() => {
    kickOutboxFlush()
  }, [identity.username])
  // The server projection backfill (W8-B3): after sign-in, the account's
  // work items rehydrate from wfl_mobile_work and local-only rows ride up —
  // a device switch or a cleared localStorage lands on the same workspace.
  // Offline or unauthenticated deployments no-op here (the store stays the
  // local source it already was). The first-run demo seed runs after the
  // backfill settles (W23-B1): seeding before the merge is what stacked a
  // second demo report on another device's server-side rows — now the seed
  // sees the rehydrated demo rows and only latches its flag.
  useEffect(() => {
    let alive = true
    void (async () => {
      await syncWorkFromServer()
      if (alive) seedDemoData()
    })()
    return () => { alive = false }
  }, [identity.username])
  /** Document visibility gates every kept-alive tab's polls too (W8-B3). */
  const pageVisible = usePageVisible()
  // #/login only names the pre-identity gate; once logged in it lands on home.
  const name = route.name === 'login' ? 'home' as const : route.name
  // The tab bar shows on the four whitelisted pages only — a work item id
  // under #/work/:id renders as a full-screen layer (02 §1.2).
  const chrome = TAB_ROUTES.includes(name) && route.param === undefined
  // The layer transition key: layers remount per route, tabs do not.
  const routeKey = `${name}:${route.param ?? ''}`
  useEffect(() => {
    if (!chrome) return
    setVisitedTabs(current => current.has(name) ? current : new Set(current).add(name))
  }, [chrome, name])
  // Route changes land the reading cursor on the page body; preventScroll
  // keeps a kept-alive tab's restored scroll position untouched.
  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true })
  }, [routeKey])
  const tabActive = (tab: string): boolean => chrome && name === tab
  /** The data gate: the selected tab AND the document visible (a hidden page suspends its polls; `hidden` stays layout-only). */
  const tabAwake = (tab: string): boolean => tabActive(tab) && pageVisible
  // antd-mobile's TabBar.Item renders a plain div with onClick only, and its
  // NativeProps channel carries no `role` — so a keyboard Tab never reached
  // the bar (W8-R2 P1-1). tabIndex and aria-selected ride the channel React
  // manages; `role` is patched onto the mounted divs once per nav mount
  // (`chrome` re-runs the pass because the nav remounts on returning to tab
  // pages, and React never touches the unmanaged attribute afterwards).
  useEffect(() => {
    const nav = tabbarRef.current
    if (nav === null) return
    nav.querySelectorAll('.adm-tab-bar-item').forEach((item) => { item.setAttribute('role', 'tab') })
    nav.querySelectorAll('.adm-tab-bar-wrap').forEach((wrap) => { wrap.setAttribute('role', 'tablist') })
  }, [chrome])
  /** Enter/Space on a focused tab item rides the same navigate() path a click takes (TabBar onChange → navigate). */
  const onTabbarKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    const item = (event.target as HTMLElement).closest<HTMLElement>('.adm-tab-bar-item')
    if (item === null) return
    event.preventDefault()
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('.adm-tab-bar-item'))
    TAB_ROUTES.forEach((key, index) => {
      if (items[index] === item) navigate(`#/${key}`)
    })
  }
  return (
    <div className={css.shell}>
      <main className={css.body} ref={mainRef} tabIndex={-1} data-route={name}>
        {visitedTabs.has('home') && (
          <section className={css.tabPage} data-tab="home" data-active={tabActive('home')} hidden={!tabActive('home')} data-transition="fade">
            <HomeView identityName={identity.nickname} active={tabAwake('home')} />
          </section>
        )}
        {visitedTabs.has('agents') && (
          <section className={css.tabPage} data-tab="agents" data-active={tabActive('agents')} hidden={!tabActive('agents')} data-transition="fade">
            <AgentsView active={tabAwake('agents')} />
          </section>
        )}
        {visitedTabs.has('work') && (
          <section className={css.tabPage} data-tab="work" data-active={tabActive('work')} hidden={!tabActive('work')} data-transition="fade">
            <WorkView active={tabAwake('work')} />
          </section>
        )}
        {visitedTabs.has('me') && (
          <section className={css.tabPage} data-tab="me" data-active={tabActive('me')} hidden={!tabActive('me')} data-transition="fade">
            <ProfileView identity={identity} dark={dark} onDarkChange={onDarkChange} onLogout={onLogout} />
          </section>
        )}
        {!chrome && (
          <section key={routeKey} className={css.tabPage} data-transition="slide">
            {name === 'chats' && <MessagesView />}
            {name === 'chat' && route.param !== undefined && <ChatView sessionId={route.param} />}
            {name === 'work' && route.param !== undefined && <WorkDetailView workId={route.param} />}
            {name === 'todos' && <TodosView />}
            {name === 'alerts' && <AlertsView />}
            {name === 'docs' && <DocsView collection={route.param} rowId={route.param2} />}
            {name === 'tasks' && <TasksView identityName={identity.nickname} />}
            {name === 'files' && <FilesView />}
          </section>
        )}
      </main>
      <div className={css.portalHost} ref={setPortalHost} />
      {chrome && (
        <nav className={css.tabbar} aria-label="底部导航" ref={tabbarRef} onKeyDown={onTabbarKeyDown}>
          <TabBar
            activeKey={name}
            onChange={(key) => { navigate(`#/${key}`) }}
            safeArea={false}
          >
            <TabBar.Item key="home" tabIndex={0} aria-selected={name === 'home'} icon={<MessageSquare size={20} strokeWidth={1.8} aria-hidden="true" />} title="消息" />
            <TabBar.Item key="agents" tabIndex={0} aria-selected={name === 'agents'} icon={<Users size={20} strokeWidth={1.8} aria-hidden="true" />} title="同事" />
            <TabBar.Item key="work" tabIndex={0} aria-selected={name === 'work'} icon={<LayoutGrid size={20} strokeWidth={1.8} aria-hidden="true" />} title="工作台" />
            <TabBar.Item key="me" tabIndex={0} aria-selected={name === 'me'} icon={<User size={20} strokeWidth={1.8} aria-hidden="true" />} title="我的" />
          </TabBar>
          <SafeArea position="bottom" />
        </nav>
      )}
    </div>
  )
}
