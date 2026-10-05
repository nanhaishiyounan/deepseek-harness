// @vitest-environment jsdom
/**
 * The mobile v3 view tree over a stubbed /api gateway: the shared UI atoms,
 * the login gate (countdown, error clearing, demo handshake), the app shell
 * with its hash router (two tabs, chat param, legacy redirects), the chats
 * tab (64px rows, filters, search, unread dot, kind badges), the new-chat
 * bottom sheet, the me tab (theme switch, ledger metrics, logout), the chat
 * view (bubbles, day separators, tool rows, draft/review/rejected/receipt
 * cards, composer, stop), the collapsed KG evidence entry, and the
 * standalone entry's mount/unmount cycle.
 */

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { Toast } from 'antd-mobile'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChatAsk, ChatItem, FoldEvent } from '../src/client/fold.ts'
import type { DerivedCardState } from '../src/client/cardState.ts'
import { ChatView, contextChipsOf } from '../src/client/messages/ChatView.tsx'
import { NewChatSheet } from '../src/client/messages/NewChatSheet.tsx'
import { KgEvidenceSection } from '../src/client/kg/KgEvidence.tsx'
import { LoginView } from '../src/client/login/LoginView.tsx'
import { MessagesView } from '../src/client/messages/MessagesView.tsx'
import { MobileShell } from '../src/client/shell/MobileShell.tsx'
import { ProfileView } from '../src/client/profile/ProfileView.tsx'
import { App } from '../src/client/App.tsx'
import { AppMobileEntry } from '../src/client/entry.tsx'
import { navigate } from '../src/client/router.ts'
import { saveDraftEdits } from '../src/client/draftStore.ts'
import { createWorkItem, deleteWorkItem, registerExecSession, workSnapshot } from '../src/client/workStore.ts'
import { createSession } from '../src/client/sessionsService.ts'
import { todayOf } from '../src/client/systemFields.ts'
import { Avatar, Badge, NoticeCard, RunningRow, SkelCard } from '../src/client/ui.tsx'

/** One recorded gateway call. */
interface RecordedCall {
  readonly url: string
  readonly payload: Record<string, unknown>
}

let calls: RecordedCall[]

/**
 * Install the gateway fetch stub. `routes` maps `session.list`-style method
 * names to a value or a per-call producer; an unmapped method answers ok:false.
 */
function stubGateway(routes: Record<string, unknown>): void {
  calls = []
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const body = JSON.parse((init?.body ?? '{}') as string) as {
      rpcId?: string
      payload?: Record<string, unknown>
    }
    calls.push({ url, payload: body.payload ?? {} })
    const method = url.replace('/api/', '')
    const route = routes[method]
    if (route === undefined) {
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: `no stub for ${method}` } } }), { status: 200 })
    }
    const produced = typeof route === 'function'
      ? await (route as (payload: Record<string, unknown>) => Promise<unknown>)(body.payload ?? {})
      : route
    if (produced instanceof Error) {
      const refusal = JSON.stringify({ rpcId: body.rpcId, result: { ok: false, error: { message: produced.message } } })
      return new Response(refusal, { status: 200 })
    }
    const value = produced
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/**
 * The visible keep-alive tab page for `tab`. The shell keeps visited tab
 * pages mounted behind [hidden], so text queries that predate keep-alive
 * (when a route change unmounted the previous page) scope to the visible
 * page host instead of the whole document.
 */
function visibleTabPage(tab: string): HTMLElement {
  const page = document.querySelector(`section[data-tab="${tab}"]:not([hidden])`)
  if (page === null) throw new Error(`the ${tab} tab page is not the visible page`)
  return page as HTMLElement
}

/** One user message event (agent-kind source renders nothing). */
function userMessage(seq: number, text: string, sourceKind = 'user'): FoldEvent {
  return { type: 'user/message', seq, time: 1, data: { source: { kind: sourceKind }, content: [{ type: 'text', text }] } }
}

/** One assistant message event wrapping the message content. */
function assistantMessage(seq: number, text: string, time = 1): FoldEvent {
  return { type: 'assistant/message', seq, time, data: { message: { content: [{ type: 'text', text }] } } }
}

/** The nb_create call+result pair a submit_receipt fence verifies against (W6-B1 ①). */
function nbCreateLanded(seq: number, collection: string, rowId: string | number): { event: FoldEvent }[] {
  const callId = `nc-${String(seq)}`
  return [
    { event: { type: 'tool/call', seq, time: 1, data: { callId, name: 'nb_create', arguments: JSON.stringify({ collection }) } } },
    { event: { type: 'tool/result', seq: seq + 0.5, time: 1, data: { message: { content: [{ toolCallId: callId, isError: false, content: [{ type: 'text', text: `已在 ${collection} 创建第 ${String(rowId)} 行：\n- id: ${String(rowId)}` }] }] } } } },
  ]
}

const EMPTY_HISTORY = { events: [] as { event: FoldEvent }[] }

beforeEach(() => {
  localStorage.clear()
  location.hash = ''
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.useRealTimers()
  cleanup()
  // The work store is a module singleton; clear its items between cases.
  for (const item of workSnapshot().items) deleteWorkItem(item.id)
})

describe('mobile UI atoms', () => {
  it('renders the stamp avatar, badge tones, running row, notices, and the skeleton card', () => {
    const { container } = render(
      <>
        <Avatar background="#2e7cf6" acronym="表单" size={40} />
        <Badge tone="primary">在线</Badge>
        <RunningRow text="AI 同事正在处理…" />
        <NoticeCard kind="empty" text="加载中" />
        <NoticeCard kind="error" text="失败了" />
        <SkelCard />
      </>,
    )
    expect(screen.getByText('在线')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('AI 同事正在处理…')
    expect(screen.getByText('失败了')).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('表单')).toBeTruthy()
    // The skeleton card paints its aria-hidden silhouette.
    expect(container.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0)
  })
})

describe('mobile login gate', () => {
  /** Fill the account + password card. */
  const fill = (view: ReturnType<typeof render>, account: string, password: string): void => {
    fireEvent.change(view.container.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: account } })
    fireEvent.change(view.container.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: password } })
  }

  it('renders the brand defaults and toasts on an empty submit without dialing the gateway', async () => {
    stubGateway({ 'nocobase.signIn': { username: 'buyer', nickname: '采购员·蔡俊' } })
    const view = render(<LoginView onLoggedIn={() => {}} />)
    expect(screen.getByText('食链通 · AI 员工')).toBeTruthy()
    expect(screen.getByText('食品企业移动端 · 单据与问答')).toBeTruthy()
    const submit = screen.getByRole('button', { name: '登录' }) as HTMLButtonElement
    expect(submit.disabled).toBe(false)
    fireEvent.click(submit)
    await waitFor(() => { expect(screen.getAllByText('请输入账号和密码').length).toBeGreaterThan(0) })
    expect(calls).toEqual([])
    fill(view, 'buyer', '')
    fireEvent.click(submit)
    await waitFor(() => { expect(screen.getAllByText('请输入账号和密码').length).toBeGreaterThan(0) })
    expect(calls).toEqual([])
    fill(view, 'buyer', 'Buyer#2026')
    expect(submit.disabled).toBe(false)
  })

  it('shows the server refusal, clears it on edit, and logs the signed-in profile in', async () => {
    stubGateway({
      'nocobase.signIn': (payload: Record<string, unknown>) => payload['password'] === 'wrong'
        ? Promise.reject(new Error('用户名/邮箱或密码有误，请重新输入'))
        : Promise.resolve({ username: 'buyer', nickname: '采购员·蔡俊' }),
    })
    const loggedIn = vi.fn()
    const view = render(<LoginView onLoggedIn={loggedIn} />)
    fill(view, 'buyer', 'wrong')
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('密码有误') })
    expect(loggedIn).not.toHaveBeenCalled()
    const pass = view.container.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(pass, { target: { value: 'Buyer#2026' } })
    await waitFor(() => { expect(screen.queryByRole('alert')).toBeNull() })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => { expect(loggedIn).toHaveBeenCalledWith(expect.objectContaining({ username: 'buyer', nickname: '采购员·蔡俊' })) })
    expect(loadIdentityName()).toBe('采购员·蔡俊')
  })
})

function loadIdentityName(): string | undefined {
  const raw = localStorage.getItem('dsh-mobile-auth')
  return raw === null ? undefined : (JSON.parse(raw) as { nickname?: string }).nickname
}

describe('mobile app shell', () => {
  it('logs in through the gate onto the home tab from a cold identity', async () => {
    stubGateway({
      'nocobase.signIn': { username: 'buyer', nickname: '采购员·蔡俊' },
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
    })
    render(<App />)
    fireEvent.change(document.querySelector('input[autocomplete="username"]') as HTMLInputElement, { target: { value: 'buyer' } })
    fireEvent.change(document.querySelector('input[type="password"]') as HTMLInputElement, { target: { value: 'Buyer#2026' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => { expect(screen.getAllByText(/今日台账|待处理/).length).toBeGreaterThan(0) })
    expect(localStorage.getItem('dsh-mobile-auth')).toContain('采购员·蔡俊')
  })

  it('renders the login page inside the themed root in both tracks', () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    const { container } = render(<App />)
    expect(container.querySelector('.dshm-root')).toBeTruthy()
    expect(container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('light')
    cleanup()
    localStorage.setItem('dsh-mobile-theme', 'dark')
    const dark = render(<App />)
    expect(dark.container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('dark')
  })

  it('gates on the stored identity and logs out back to the login page', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
    })
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }))
    render(<App />)
    expect(screen.getAllByText(/今日台账|待处理/).length).toBeGreaterThan(0)
    navigate('#/me')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => screen.getByRole('button', { name: /退出登录/ }))
    fireEvent.click(screen.getByRole('button', { name: /退出登录/ }))
    // Logout confirms first; the dialog's destructive button performs it.
    await waitFor(() => screen.getByRole('button', { name: '退出' }))
    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    await waitFor(() => { expect(screen.getByText('食链通 · AI 员工')).toBeTruthy() })
    expect(localStorage.getItem('dsh-mobile-auth')).toBeNull()
    cleanup()
    render(<App />)
    await waitFor(() => { expect(screen.getByText('食链通 · AI 员工')).toBeTruthy() })
  })

  it('routes the four tabs and redirects the v1 heads onto their views', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    // The empty hash lands on home; walk the tab bar and the folded heads.
    location.hash = '#/'
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    await waitFor(() => { expect(screen.getAllByText(/今日台账|待处理/).length).toBeGreaterThan(0) })
    fireEvent.click(screen.getByText('我的'))
    await waitFor(() => { expect(screen.getByText('本月登记')).toBeTruthy() })
    navigate('#/profile')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(within(visibleTabPage('me')).getByText('待审核')).toBeTruthy() })
    // contacts folds onto the agents directory (02 §1.3): the view renders,
    // and the keep-alive home page stays mounted behind it, hidden.
    navigate('#/contacts')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(within(visibleTabPage('agents')).getByText('AI 同事')).toBeTruthy() })
    const homePage = document.querySelector('section[data-tab="home"]')
    expect(homePage).not.toBeNull()
    expect(homePage?.hasAttribute('hidden')).toBe(true)
    // workbench folds onto the work page: its header and status tabs render.
    navigate('#/workbench')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(within(visibleTabPage('work')).getAllByText('工作').length).toBeGreaterThan(0) })
    expect(within(visibleTabPage('work')).getByText('待处理 0')).toBeTruthy()
  })

  it('persists the dark theme through the me-tab switch', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }))
    const { container } = render(<App />)
    await waitFor(() => { expect(screen.getAllByText(/今日台账|待处理/).length).toBeGreaterThan(0) })
    expect(container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('light')
    navigate('#/me')
    fireEvent(window, new HashChangeEvent('hashchange'))
    fireEvent.click(await screen.findByRole('switch', { name: '深色模式' }))
    await waitFor(() => { expect(container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('dark') })
    expect(localStorage.getItem('dsh-mobile-theme')).toBe('dark')
  })

  it('routes the tasks and files layers under the shell', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    await waitFor(() => { expect(screen.getAllByText(/今日台账|待处理/).length).toBeGreaterThan(0) })
    navigate('#/tasks')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByText('我的任务')).toBeTruthy() })
    navigate('#/files')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByRole('region', { name: '文件' })).toBeTruthy() })
  })

  it('renders the chat route as a full-screen layer over the shell', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/chat/session-abc')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByRole('button', { name: '新建会话' })).toBeTruthy() })
    // The tab bar hides under the full-screen chat layer (T1).
    expect(screen.queryByText('消息')).toBeNull()
    expect(screen.queryByText('我的')).toBeNull()
    expect(screen.getByRole('button', { name: '返回' })).toBeTruthy()
  })
})

describe('mobile chats tab', () => {
  it('filters the registered work sessions out of the row list', async () => {
    const now = Date.now()
    const work = createWorkItem({ title: '跟进事项', owner: '业务员' })
    registerExecSession(work.id, 'exec-1')
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 'plain-1', updatedAt: now, projections: { values: { title: '普通会话' } } },
        { sessionId: 'exec-1', updatedAt: now - 1000, projections: { values: { title: '执行会话' } } },
      ] },
    })
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('普通会话')).toBeTruthy() })
    // The exec session registered in the isolation set never surfaces (02 §9).
    expect(screen.queryByText('执行会话')).toBeNull()
  })

  it('renders the six-element rows with filters, search, and the unread dot', async () => {
    const now = Date.now()
    const receiptFence = '```dsh\n{"v":3,"type":"submit_receipt","draftId":"d_1","form":{"collection":"hub_po_purchase_orders","label":"采购单"},"rowId":"1042","summary":[{"label":"合计金额","value":"¥4,500","kind":"money"}]}\n```'
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'purchase-assistant', name: '采购助理', description: '采购登记', isDefault: false },
      ] },
      'session.list': { items: [
        { sessionId: 's1', updatedAt: now, running: true, agentPreset: 'purchase-assistant', projections: { values: { title: '采购会话' } } },
        { sessionId: 's2', updatedAt: now - 10_000, blank: true },
      ] },
      'session.history': { events: [
        ...nbCreateLanded(1, 'hub_po_purchase_orders', '1042'),
        { event: assistantMessage(2, receiptFence) },
      ] },
    })
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('采购会话')).toBeTruthy() })
    // The subtitle is the last-message projection (C1), not the roster description.
    await waitFor(() => { expect(screen.getAllByText('已登记 №1042 · 采购单').length).toBeGreaterThan(0) })
    expect(screen.getAllByText('刚刚').length).toBeGreaterThan(0)
    expect(screen.getByText('处理中')).toBeTruthy()
    expect(screen.getAllByLabelText('有新消息').length).toBeGreaterThan(0)
    // The AI-colleague filter drops the local session.
    fireEvent.click(screen.getByText('AI 同事'))
    await waitFor(() => { expect(screen.queryByText('新会话')).toBeNull() })
    // Search narrows by title.
    fireEvent.click(screen.getByText('全部'))
    const search = screen.getByPlaceholderText('搜索会话/同事') as HTMLInputElement
    fireEvent.change(search, { target: { value: '采购会话' } })
    expect(screen.getByText('采购会话')).toBeTruthy()
    fireEvent.change(search, { target: { value: '不存在' } })
    await waitFor(() => { expect(screen.getByText('没有匹配的会话')).toBeTruthy() })
    expect(screen.getByText('换个筛选或关键词，右上角 + 开个新会话')).toBeTruthy()
    fireEvent.change(search, { target: { value: '' } })
    fireEvent.click(screen.getByText('新会话'))
    expect(location.hash).toBe('#/chat/s2')
    // Opening marked the session read: the unread dot disappears on remount.
    expect(localStorage.getItem('dsh-mobile-read')).toContain('s2')
  })

  it('shows the poll failure card when the session list read fails', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': () => { throw new Error('会话目录 503') },
    })
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('会话目录 503')).toBeTruthy() })
    expect(screen.queryByText('会话加载中…')).toBeNull()
  })

  it('marks pending-review sessions through the local filter set', async () => {
    const now = Date.now()
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 'pending-1', updatedAt: now },
        { sessionId: 'plain-1', updatedAt: now },
      ] },
    })
    localStorage.setItem('dsh-mobile-pending', JSON.stringify(['pending-1']))
    localStorage.setItem('dsh-mobile-read', JSON.stringify({ 'pending-1': 0, 'plain-1': 0 }))
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('待审').textContent).toBe('待审') })
    fireEvent.click(screen.getByText('待审核'))
    await waitFor(() => { expect(screen.queryByText('plain-1')).toBeNull() })
  })

  it('carries the kind badge on the form-assistant row', async () => {
    const now = Date.now()
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 's1', updatedAt: now, agentPreset: 'mobile-form-assistant' },
        { sessionId: 's2', updatedAt: now, agentPreset: 'business-advisor' },
      ] },
    })
    localStorage.setItem('dsh-mobile-read', JSON.stringify({ s1: now, s2: now }))
    render(<MessagesView />)
    // The avatar acronym carries the same word; the badge row adds the kind.
    await waitFor(() => { expect(screen.getAllByText('表单').length).toBeGreaterThan(1) })
    expect(screen.getAllByText('参谋').length).toBeGreaterThan(1)
  })

  it('sources the chats row stamp from the roster name, never the session title', async () => {
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'ghost-safety', name: 'AI食安合规官', description: '', isDefault: false },
      ] },
      'session.list': { items: [
        // A question-text title would loan its leading pair (GB) under the
        // retired titleOf stamp; the roster-sourced stamp keeps the
        // colleague's own word.
        { sessionId: 'stamp-row', updatedAt: 1, agentPreset: 'ghost-safety', projections: { values: { title: 'GB2760防腐剂限量怎么查' } } },
      ] },
    })
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('GB2760防腐剂限量怎么查')).toBeTruthy() })
    const rowStamp = (): string => document.querySelector('[class*="sessionRow_"] [class*="avatar_"]')?.textContent ?? ''
    // The row's avatar acronym is the roster name's own pair (食安); a
    // titleOf regression flips it to the title's leading pair (GB) and this
    // assertion red.
    expect(rowStamp()).toBe('食安')
  })

  it('pins a session above the rest, unpins, and marks read through the swipe row', async () => {
    const now = Date.now()
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 'newer', updatedAt: now, projections: { values: { title: '较新会话' } } },
        { sessionId: 'older', updatedAt: now - 60_000, projections: { values: { title: '较旧会话' } } },
      ] },
    })
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('较新会话')).toBeTruthy() })
    // Newest first by default.
    expect(screen.getAllByText(/会话$/)[0]?.textContent).toBe('较新会话')
    // Swipe-pin the older row: it orders above the newer one.
    const pins = screen.getAllByText('置顶')
    fireEvent.click(pins[pins.length - 1] as HTMLButtonElement)
    await waitFor(() => { expect(screen.getAllByText(/会话$/)[0]?.textContent).toBe('较旧会话') })
    expect(localStorage.getItem('dsh-mobile-pins')).toContain('older')
    // Unpin restores the recency order.
    fireEvent.click(screen.getByText('取消置顶'))
    await waitFor(() => { expect(screen.getAllByText(/会话$/)[0]?.textContent).toBe('较新会话') })
    // Pinning the already-first row exercises the lead-row comparison arm.
    fireEvent.click(screen.getAllByText('置顶')[0] as HTMLButtonElement)
    await waitFor(() => { expect(screen.getAllByText(/会话$/)[0]?.textContent).toBe('较新会话') })
    fireEvent.click(screen.getByText('取消置顶'))
    // Marking read retires the unread badge on every row.
    expect(screen.getAllByLabelText('有新消息').length).toBeGreaterThan(0)
    for (const read of screen.getAllByText('标记已读')) fireEvent.click(read)
    await waitFor(() => { expect(screen.queryByLabelText('有新消息')).toBeNull() })
  })

  it('ignores a projection tail that lands after unmount', async () => {
    const now = Date.now()
    let release: (value: { events: unknown[] }) => void = () => {}
    const gate = new Promise<{ events: unknown[] }>((resolve) => { release = resolve })
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [{ sessionId: 'late-tail', updatedAt: now, projections: { values: { title: '迟到投影' } } }] },
      'session.history': () => gate,
    })
    const view = render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('迟到投影')).toBeTruthy() })
    view.unmount()
    // The tail resolving after unmount must not touch retired component state.
    release({ events: [] })
    await act(async () => { await Promise.resolve() })
  })

  it('loads the next page when the list overflows the first page', async () => {
    const now = Date.now()
    // The sentinel's visibility check reads element.offsetParent, which jsdom
    // never computes; surface it so the check reaches the geometry branch.
    const proto = HTMLElement.prototype as unknown as { offsetParent?: Element }
    const hadOffsetParent = Object.prototype.hasOwnProperty.call(proto, 'offsetParent')
    Object.defineProperty(proto, 'offsetParent', { configurable: true, get: () => document.body })
    try {
      stubGateway({
        'agentPreset.list': { presets: [] },
        'session.list': { items: Array.from({ length: 22 }, (_, index) => ({
          sessionId: `row-${String(index)}`,
          updatedAt: now - index,
          projections: { values: { title: `第${String(index)}行` } },
        })) },
      })
      render(<MessagesView />)
      // The first page renders twenty rows; the sentinel fires loadMore for the tail.
      await waitFor(() => { expect(screen.getByText('第19行')).toBeTruthy() })
      await waitFor(() => { expect(screen.getByText('第21行')).toBeTruthy() }, { timeout: 3000 })
    } finally {
      if (hadOffsetParent) delete proto.offsetParent
    }
  })

  it('opens the new-chat sheet from the plus button', async () => {
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true }] },
      'session.list': { items: [] },
    })
    render(<MessagesView />)
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    await waitFor(() => { expect(screen.getByRole('heading', { name: '新建会话' })).toBeTruthy() })
    expect(screen.getByText('智能填表助手')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(location.hash).toBe('')
  })
})

describe('mobile new-chat sheet', () => {
  it('lists the roster with the fill assistant first, its form chips, and starts without a user message', async () => {
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'raw-helper', name: '裸岗', description: '答疑', isDefault: true },
        { id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: false },
      ] },
      'session.list': { items: [] },
      'session.create': (payload: Record<string, unknown>) => ({ sessionId: `bound:${payload.agentPreset as string}` }),
      'session.prompt': {},
    })
    render(<NewChatSheet visible onClose={() => {}} />)
    await waitFor(() => { expect(screen.getByText('智能填表助手')).toBeTruthy() })
    // The fill assistant leads the sheet and carries the first three form chips.
    const rosterRows = screen.getAllByRole('button').map(row => row.textContent)
    expect(rosterRows.findIndex(text => text?.includes('智能填表助手'))).toBeLessThan(
      rosterRows.findIndex(text => text?.includes('裸岗')),
    )
    expect(screen.getByText('采购单')).toBeTruthy()
    expect(screen.getByText('请购单')).toBeTruthy()
    expect(screen.getByText('收货单')).toBeTruthy()
    expect(screen.getByText('单据登记与任务执行')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /智能填表助手/ }))
    await waitFor(() => { expect(location.hash).toBe('#/chat/bound:mobile-form-assistant') })
    // v3 (01 ⑤A3): starting a session never sends a message as the user.
    expect(calls.find(call => call.url === '/api/session.prompt')).toBeUndefined()
  })

  it('offers the three most recent sessions as direct entries', async () => {
    const now = Date.now()
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 's1', updatedAt: now, projections: { values: { title: '宏发冷链箱采购' } } },
        { sessionId: 's2', updatedAt: now - 1000, projections: { values: { title: '三味食品建档' } } },
        { sessionId: 's3', updatedAt: now - 2000, projections: { values: { title: '更早的一单' } } },
        { sessionId: 's4', updatedAt: now - 3000, projections: { values: { title: '最早的备询' } } },
      ] },
    })
    render(<NewChatSheet visible onClose={() => {}} />)
    await waitFor(() => { expect(screen.getByText('宏发冷链箱采购')).toBeTruthy() })
    expect(screen.getByText('三味食品建档')).toBeTruthy()
    expect(screen.queryByText('最早的备询')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /宏发冷链箱采购/ }))
    await waitFor(() => { expect(location.hash).toBe('#/chat/s1') })
  })

  it('shows the empty-roster notice and the roster failure', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    render(<NewChatSheet visible onClose={() => {}} />)
    await waitFor(() => { expect(screen.getByText('部署未配置 AI 同事预设')).toBeTruthy() })
    stubGateway({ 'agentPreset.list': () => { throw new Error('通讯录服务 502') }, 'session.list': { items: [] } })
    cleanup()
    render(<NewChatSheet visible onClose={() => {}} />)
    await waitFor(() => { expect(screen.getByText('通讯录服务 502')).toBeTruthy() })
  })

  it('names a create failure without navigating', async () => {
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '洞察', isDefault: false }] },
      'session.list': { items: [] },
      'session.create': () => { throw new Error('会话创建通道关闭') },
    })
    render(<NewChatSheet visible onClose={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: /经营参谋/ }))
    await waitFor(() => { expect(screen.getByText('会话创建通道关闭')).toBeTruthy() })
    expect(location.hash).toBe('')
  })
})

describe('mobile me tab', () => {
  it('names a failed ledger read on the metric instead of a silent dash', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      // The server projection leg fails (no stub): the strip leg still settles.
      'nocobase.list': () => { throw new Error('台账 503') },
    })
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    // W6-R1: the failed metric reads 读取失败 (never a bare —), the failure
    // leaves a client_error trace, and 待审核 (local) still renders.
    await waitFor(() => { expect(screen.getByText('读取失败')).toBeTruthy() })
    expect(screen.getByText('0 条')).toBeTruthy()
    expect(warnSpy.mock.calls.some(call => String(call[0]).includes('ledger.monthly'))).toBe(true)
    warnSpy.mockRestore()
  })

  it('opens the data and about dialogs', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    await waitFor(() => { expect(screen.getByText('本月登记')).toBeTruthy() })
    fireEvent.click(screen.getByText('数据'))
    // The description renders on the row and again in the opened dialog.
    await waitFor(() => { expect(screen.getAllByText('会话与业务数据存储于服务端，与 PC 工作台同库；本机仅保留主题与输入中的草稿。').length).toBeGreaterThan(1) })
    fireEvent.click(screen.getByText('v6'))
  })

  it('ignores a ledger rejection that lands after unmount', async () => {
    let rejectRead: () => void = () => {}
    const gate = new Promise<never>((_, reject) => { rejectRead = reject })
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': () => gate,
    })
    const view = render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    view.unmount()
    rejectRead()
    await act(async () => { await Promise.resolve() })
  })

  it('ignores a ledger read that lands after unmount', async () => {
    let release: (value: { items: [] }) => void = () => {}
    const gate = new Promise<{ items: [] }>((resolve) => { release = resolve })
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': () => gate,
    })
    const view = render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {} }
      />,
    )
    view.unmount()
    release({ items: [] })
    await act(async () => { await Promise.resolve() })
  })

  it('renders the identity card, ledger metrics, and toggles the dark theme', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
    })
    const onDark = vi.fn()
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={onDark}
        onLogout={() => {}}
      />,
    )
    expect(screen.getByText('采购员·蔡俊')).toBeTruthy()
    expect(screen.getByText('buyer · 真实账号 · NocoBase 账号体系')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('本月登记').textContent).toBe('本月登记') })
    expect(screen.getByText('待审核')).toBeTruthy()
    const toggle = screen.getByRole('switch', { name: '深色模式' })
    fireEvent.click(toggle)
    expect(onDark).toHaveBeenCalledWith(true)
  })

  it('counts this month\'s registered receipts and leads the recent strip with the newest', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 'm1', updatedAt: Date.now() - 10_000, agentPreset: 'mobile-form-assistant' },
        { sessionId: 'm2', updatedAt: Date.now() - 20_000, agentPreset: 'mobile-form-assistant' },
        { sessionId: 'm3', updatedAt: Date.now() - 30_000, agentPreset: 'mobile-form-assistant' },
        { sessionId: 'm4', updatedAt: Date.now() - 40_000, agentPreset: 'mobile-form-assistant' },
        { sessionId: 'local-1', updatedAt: Date.now() },
      ] },
      'session.history': (payload: Record<string, unknown>) => {
        if (payload.sessionId === 'local-1') throw new Error('窗口 503')
        const rowId = { m1: '1044', m2: '1043', m3: '1042', m4: '1041' }[payload.sessionId as string] ?? '9999'
        const amount = { m1: '¥9,900', m2: '¥7,700', m3: '¥6,400', m4: '¥4,400' }[payload.sessionId as string] ?? '¥0'
        return { events: [
          ...nbCreateLanded(1, 'hub_po_purchase_orders', rowId),
          { event: assistantMessage(2, `已登记。\n\`\`\`dsh\n{"v":3,"type":"submit_receipt","draftId":"d_${rowId}","form":{"collection":"hub_po_purchase_orders","label":"采购单"},"rowId":"${rowId}","summary":[{"label":"合计金额","value":"${amount}","kind":"money"}]}\n\`\`\``, Date.now()) },
        ] }
      },
      // W6-B1 G3: 本月登记 reads the server projection (wfl submit records).
      'nocobase.list': { count: 4, page: 1, page_size: 1, rows: [] },
    })
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    // All four landings count into this month's ledger.
    await waitFor(() => { expect(screen.getByText('4 条')).toBeTruthy() })
    // The strip leads with the newest receipts (sessions list newest-first):
    // the first three in order, the fourth dropped.
    await waitFor(() => { expect(screen.getByText('№1044')).toBeTruthy() })
    expect(screen.getAllByText(/^№/).map(node => node.textContent)).toEqual(['№1044', '№1043', '№1042'])
    expect(screen.queryByText('№1041')).toBeNull()
    // The strip row routes back into its receipt session.
    fireEvent.click(screen.getByText('№1044'))
    expect(location.hash).toBe('#/chat/m1')
    location.hash = ''
  })

  it('runs the quick-start shortcuts, restoring the button on failure', async () => {
    let createFails = false
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.create': () => {
        if (createFails) throw new Error('会话服务不可用')
        return { sessionId: 'shortcut-1' }
      },
    })
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '登记采购单' }))
    await waitFor(() => { expect(location.hash).toBe('#/chat/shortcut-1') })
    location.hash = ''
    // A failed create leaves the shortcut usable again.
    createFails = true
    fireEvent.click(screen.getByRole('button', { name: '问经营参谋' }))
    await waitFor(() => { expect(screen.getByRole('button', { name: '问经营参谋' }).getAttribute('disabled')).toBeNull() })
    expect(location.hash).toBe('')
  })

  it('renders the live-mode switch on, a text-only receipt hero, and the demo flip back', async () => {
    localStorage.setItem('dsh-mobile-runmode', 'live')
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [{ sessionId: 'm2', updatedAt: Date.now(), agentPreset: 'mobile-form-assistant' }] },
      'session.history': { events: [
        ...nbCreateLanded(1, 'hub_wms_outbound', '1043'),
        // A last-month receipt still leads the strip; the server projection
        // counts zero this month (W6-B1 G3).
        { event: assistantMessage(2, '已登记。\n```dsh\n{"v":3,"type":"submit_receipt","draftId":"d_2","form":{"collection":"hub_wms_outbound","label":"出库单"},"rowId":"1043","summary":[{"label":"经手人","value":"林小满","kind":"text"}]}\n```', new Date(new Date().getFullYear(), new Date().getMonth() - 1, 15).getTime()) },
      ] },
      'nocobase.list': { count: 0, page: 1, page_size: 1, rows: [] },
    })
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    // The persisted live mode paints the switch on…
    await waitFor(() => { expect(screen.getByRole('switch', { name: '真实模式' }).getAttribute('aria-checked')).toBe('true') })
    // …a receipt without a money row falls back to the landing copy…
    await waitFor(() => { expect(screen.getByText('已登记')).toBeTruthy() })
    // …and flipping back to demo persists and toasts the other way.
    fireEvent.click(screen.getByRole('switch', { name: '真实模式' }))
    await waitFor(() => { expect(localStorage.getItem('dsh-mobile-runmode')).toBe('demo') })
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('已切换为演示模式') })
  })

  it('logs out through the confirm dialog', async () => {
    const onLogout = vi.fn()
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={onLogout}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    await waitFor(() => screen.getByRole('button', { name: '退出' }))
    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    await waitFor(() => { expect(onLogout).toHaveBeenCalledTimes(1) })
  })
})

const chatDraftText = '已为你预填草稿。\n```json\n{"collection":"hub_po_orders","title":"采购单","fields":{"po_number":"PO-1","total":"100"}}\n```\n'

/** A busy turn: user asks, tool runs, assistant answers with the draft. */
function busyHistory(): { events: { event: FoldEvent }[] } {
  return { events: [
    { event: userMessage(1, '帮我登记采购单') },
    { event: { type: 'tool/call', seq: 2, time: 1, data: { callId: 'c1', name: 'nb_collections', arguments: '{}' } } },
    { event: { type: 'turn/start', seq: 3, time: 1, data: { turn: 1 } } },
  ] }
}

const metaRoutes = {
  'nocobase.listMeta': { collections: [
    { name: 'hub_po_orders', title: '采购单', fields: [
      { name: 'po_number', type: 'string', title: '单号' },
      { name: 'total', type: 'float', title: '金额' },
    ] },
  ] },
  'nocobase.list': { rows: [{ id: 42, po_number: 'PO-1' }] },
}

/** A settled turn carrying the draft, its confirm, and the receipt. */
function settledHistory(): { events: { event: FoldEvent }[] } {
  return { events: [
    { event: userMessage(1, '帮我登记采购单') },
    { event: assistantMessage(2, chatDraftText) },
    { event: userMessage(3, '确认推送：请按以下最终字段值调用 nb_create 写入业务表。\n{"collection":"hub_po_orders","fields":{"po_number":"PO-1","total":"800"}}') },
    { event: assistantMessage(4, '业务表 hub_po_orders 行 id=42 已创建') },
    { event: { type: 'turn/start', seq: 5, time: 1, data: { turn: 1 } } },
    { event: { type: 'turn/end', seq: 6, time: 1, data: { turn: 1 } } },
  ] }
}

describe('mobile chat view', () => {
  it('shows the loading notice and the folded flow once the window lands', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': settledHistory(),
      'kg.search': { nodes: [] },
      'kg.subgraph': { nodes: [], edges: [], truncated: false, seeds_resolved: [] },
      ...metaRoutes,
    })
    render(<ChatView sessionId="session-12" />)
    expect(screen.getByRole('status', { name: '正在加载会话' })).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('帮我登记采购单')).toBeTruthy() })
    expect(screen.getByText(/已为你预填草稿/)).toBeTruthy()
    await waitFor(() => { expect(screen.getByTestId('receipt-card')).toBeTruthy() })
    expect(screen.getByTestId('receipt-card').textContent).toContain('行 id=42')
    expect(screen.getByText('对话补槽')).toBeTruthy()
    await waitFor(() => { expect(screen.getByTestId('receipt-row').textContent).toContain('PO-1') })
  })

  it('keeps the composer disabled while a turn runs and offers stop', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': busyHistory(),
      'nocobase.listMeta': { collections: [] },
      'session.cancel': { accepted: true },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByRole('status').textContent).toContain('AI 同事正在处理') })
    expect(screen.getByRole('button', { name: '停止生成' })).toBeTruthy()
    expect(screen.getByText('正在调用：读取业务表结构…')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
    await waitFor(() => {
      expect(calls.some(call => call.url === '/api/session.cancel')).toBe(true)
    })
  })

  it('the composer textarea rides rows=1 so the autoSize sizer lands single-line on the 46px capsule (W11-B1)', async () => {
    stubGateway({
      'session.list': { items: [{ sessionId: 'session-12', updatedAt: 1, agentPreset: 'mobile-form-assistant' }] },
      'session.history': EMPTY_HISTORY,
      'agentPreset.list': { presets: [{ id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': () => ({}),
    })
    render(<ChatView sessionId="session-12" />)
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    // antd-mobile defaults rows=2; its hidden sizer then floors the single-line
    // height at two rows, stranding the text off-center inside the capsule.
    expect(box.getAttribute('rows')).toBe('1')
  })

  it('sends drafts through the composer and chips, failing loud on rejection', async () => {
    let prompts = 0
    stubGateway({
      'session.list': { items: [{ sessionId: 'session-12', updatedAt: 1, agentPreset: 'mobile-form-assistant' }] },
      'session.history': EMPTY_HISTORY,
      'agentPreset.list': { presets: [{ id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': () => {
        prompts += 1
        if (prompts === 2) throw new Error('推送通道拒绝')
        return {}
      },
    })
    render(<ChatView sessionId="session-12" />)
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '  ' } })
    expect(screen.getByRole('button', { name: '发送' }).hasAttribute('disabled')).toBe(true)
    fireEvent.change(box, { target: { value: '帮我盘点库存' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => { expect(box.value).toBe('') })
    expect(calls.find(call => call.url === '/api/session.prompt')?.payload).toMatchObject({ sessionId: 'session-12', mode: 'queue' })
    fireEvent.change(box, { target: { value: '再来一次' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    expect(prompts).toBe(1)
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('推送通道拒绝') })
    // The empty session renders the welcome card; picking a starter fills
    // the composer draft — replacing the failed send's residue — and sends
    // nothing until the user taps send (W9-B1: a tag assists input, it does
    // not speak for the user).
    fireEvent.click(screen.getByRole('button', { name: '登记一条采购单' }))
    expect(box.value).toBe('帮我登记一条采购单')
    expect(prompts).toBe(2)
    expect(screen.getByTestId('welcome-card')).toBeTruthy()
    // The one-tap follow-through stays: send carries the box text as typed.
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => { expect(prompts).toBe(3) })
    expect(JSON.stringify(calls.filter(call => call.url === '/api/session.prompt').at(-1)?.payload)).toContain('帮我登记一条采购单')
  })

  it('opens and closes the new-chat sheet from the header plus', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'agentPreset.list': { presets: [] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByTestId('welcome-card')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '新建会话' }))
    await waitFor(() => { expect(screen.getByRole('heading', { name: '新建会话' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  })

  it('runs the quick panel: picks fill the draft, placeholders toast, empty falls back', async () => {
    stubGateway({
      'session.list': { items: [{ sessionId: 'session-12', updatedAt: 1, agentPreset: 'business-advisor' }] },
      'session.history': EMPTY_HISTORY,
      'agentPreset.list': { presets: [{ id: 'business-advisor', name: '经营参谋', description: '', isDefault: false }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByTestId('welcome-card')).toBeTruthy() })
    // Opening the panel lists the colleague's starters as commands.
    fireEvent.click(screen.getByRole('button', { name: '打开快捷面板' }))
    await waitFor(() => { expect(screen.getByRole('dialog', { name: '快捷指令' })).toBeTruthy() })
    // The starter also lives on the welcome card; the panel adds the second copy.
    expect(screen.getAllByText('问经营').length).toBe(2)
    // The tool lanes are real now (W11-B2): jsdom exposes no speech engine,
    // so the voice tile is hidden outright (the WeChat webview steady state)
    // and the three picker lanes answer.
    expect(screen.queryByRole('button', { name: '语音' })).toBeNull()
    for (const lane of ['拍照', '相册', '文件']) {
      expect(screen.getByRole('button', { name: lane })).toBeTruthy()
    }
    // Picking a command closes the panel and fills the draft (W9-B1): the
    // picked send-text replaces a half-typed draft, focuses the box with the
    // caret parked at the end, and sends nothing on its own.
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '半句话' } })
    fireEvent.click(screen.getAllByRole('button', { name: '问经营' })[1] as HTMLButtonElement)
    expect(box.value).toBe('本月经营概览和风险提示')
    expect(screen.queryByRole('dialog', { name: '快捷指令' })).toBeNull()
    expect(calls.some(call => call.url === '/api/session.prompt')).toBe(false)
    expect(document.activeElement).toBe(box)
    expect(box.selectionStart).toBe('本月经营概览和风险提示'.length)
    expect(box.selectionEnd).toBe('本月经营概览和风险提示'.length)
    // The fill is not a message, so the welcome card stays; the user's own
    // send tap then carries the filled text (the one-tap path).
    expect(screen.getByTestId('welcome-card')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => {
      expect(JSON.stringify(calls.find(call => call.url === '/api/session.prompt')?.payload)).toContain('本月经营概览和风险提示')
    })
    // A starter-less colleague (the local fallback) shows the empty note.
    cleanup()
    stubGateway({
      'session.list': { items: [{ sessionId: 'session-13', updatedAt: 1 }] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-13" />)
    await waitFor(() => { expect(screen.getByTestId('welcome-card')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '打开快捷面板' }))
    await waitFor(() => { expect(screen.getByText('当前同事没有预置指令，直接打字聊聊吧')).toBeTruthy() })
  })

  it('keeps the welcome card through a fill and retires it once the first send lands', async () => {
    let history = EMPTY_HISTORY
    stubGateway({
      'session.list': { items: [{ sessionId: 'session-12', updatedAt: 1, agentPreset: 'mobile-form-assistant' }] },
      'session.history': () => history,
      'nocobase.listMeta': { collections: [] },
      'session.prompt': () => {
        history = { events: [{ event: userMessage(1, '帮我登记一条采购单') }] }
        return {}
      },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByTestId('welcome-card')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '登记一条采购单' }))
    // The fill is not a message: the welcome card stays until the send lands.
    expect(screen.getByTestId('welcome-card')).toBeTruthy()
    expect(screen.getByPlaceholderText<HTMLTextAreaElement>('问我任何经营问题...').value).toBe('帮我登记一条采购单')
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await waitFor(() => { expect(screen.queryByTestId('welcome-card')).toBeNull() }, { timeout: 4000 })
  })

  it('renders fenced assistant code as the deep plate and copies it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.assign(navigator, { clipboard: { writeText } })
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, '示例如下：\n```sql\nSELECT * FROM orders\n```\n完毕。', Date.now()) },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByTestId('code-box')).toBeTruthy() })
    // The plate carries the fence's language label and the verbatim body.
    expect(screen.getByText('sql')).toBeTruthy()
    expect(screen.getByText('SELECT * FROM orders')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '复制代码' }))
    await waitFor(() => { expect(writeText).toHaveBeenCalledWith('SELECT * FROM orders') })
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('已复制') })
  })

  it('falls back to execCommand when the clipboard api is absent and toasts the miss', async () => {
    const nav = navigator as Partial<Navigator> & { clipboard?: unknown }
    delete nav.clipboard
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, '```js\nlet a = 1\n```', Date.now()) }] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-13" />)
    // No async clipboard in the jsdom host and no execCommand either: the
    // legacy lane itself fails and the toast names the manual fallback.
    fireEvent.click(await screen.findByRole('button', { name: '复制代码' }))
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('复制失败，请长按选择复制') })
  })

  it('copies through the execCommand lane when the async clipboard write rejects', async () => {
    Object.assign(navigator, { clipboard: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) } })
    const exec = vi.fn(() => true)
    // execCommand is the legacy copy lane under test (the production source keeps the same waiver).
    document.execCommand = exec
    try {
      stubGateway({
        'session.list': { items: [] },
        'session.history': { events: [{ event: assistantMessage(1, '```sh\npwd\n```', Date.now()) }] },
        'nocobase.listMeta': { collections: [] },
      })
      render(<ChatView sessionId="session-14" />)
      fireEvent.click(await screen.findByRole('button', { name: '复制代码' }))
      await waitFor(() => { expect(exec).toHaveBeenCalledWith('copy') })
      await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('已复制') })
    } finally {
      delete (document as Partial<Document> & { execCommand?: unknown }).execCommand
    }
  })

  it('arms the viewer state from a markdown image tap', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, '示意图：\n\n![流程图](https://example.com/flow.png)', Date.now()) }] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-15" />)
    await waitFor(() => { expect(document.querySelector('img[src="https://example.com/flow.png"]')).not.toBeNull() })
    const image = document.querySelector('img[src="https://example.com/flow.png"]') as HTMLImageElement
    // The tap runs the in-flow collect over the container's images and arms
    // the viewer state without disturbing the flow; the fullscreen slide
    // engine itself needs real layout and never mounts under jsdom.
    fireEvent.click(image)
    await act(async () => { await Promise.resolve() })
    expect(document.querySelector('img[src="https://example.com/flow.png"]')).toBeTruthy()
  })

  it('navigates back and skips non-receipt answers', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, '普通回答，没有回执') }] },
      'nocobase.listMeta': { collections: [] },
      'nocobase.list': {},
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('普通回答，没有回执')).toBeTruthy() })
    expect(calls.filter(call => call.url === '/api/nocobase.list')).toHaveLength(0)
    // Back rides history.back with the domain fallback; jsdom's shared session
    // history makes the landing hash nondeterministic here, so the routing
    // spec pins goBackOr's semantics instead of this view-level assertion.
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
  })

  it('stays quiet when the history read fails', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': () => { throw new Error('会话服务 502') },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('会话服务 502')).toBeTruthy() })
  })
})

describe('mobile draft → review → receipt card loop', () => {
  /** Read the confirmed fields back out of a confirm-push message text. */
  const confirmedFieldsOf = (text: string): Record<string, string> => {
    const payload: unknown = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
    const fields = (payload as { fields?: unknown }).fields
    return typeof fields === 'object' && fields !== null ? fields as Record<string, string> : {}
  }

  it('edits fields, submits for review, confirms, and sends the final payload', async () => {
    const history = (): { events: { event: FoldEvent }[] } => ({
      events: [
        { event: userMessage(1, '帮我登记采购单') },
        {
          event: {
            type: 'assistant/message', seq: 2, time: 1,
            data: { message: { content: [{ type: 'text', text: '预填草稿。\n```json\n{"collection":"hub_po_orders","title":"采购单","fields":{"po_number":"PO-1","total":"100"}}\n```\n' }] } },
          },
        },
        { event: { type: 'turn/start', seq: 3, time: 1, data: { turn: 1 } } },
        { event: { type: 'turn/end', seq: 4, time: 1, data: { turn: 1 } } },
      ],
    })
    stubGateway({
      'session.list': { items: [] },
      'session.history': history(),
      'nocobase.listMeta': { collections: [
        { name: 'hub_po_orders', fields: [
          { name: 'po_number', type: 'string', title: '单号' },
          { name: 'total', type: 'float', title: '金额' },
        ] },
      ] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="loop-1" />)
    const card = await screen.findByTestId('draft-card')
    expect(card.textContent).toContain('目标业务表 hub_po_orders')
    // Edit the number field then submit for review (draft → pending).
    const numberInput = card.querySelector('input') as HTMLInputElement
    fireEvent.change(numberInput, { target: { value: 'PO-2' } })
    fireEvent.click(screen.getByRole('button', { name: '提交审核' }))
    const review = await screen.findByTestId('review-card')
    expect(review.textContent).toContain('待人工审核')
    // The diff highlights the changed value against the AI prefill.
    expect(screen.getByText('PO-1')).toBeTruthy()
    expect(screen.getByText('PO-2')).toBeTruthy()
    // Confirm (dialog) sends the confirm-push message with the final fields.
    fireEvent.click(screen.getByRole('button', { name: '确认提交' }))
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    await waitFor(() => {
      const sent = calls.find(call => call.url === '/api/session.prompt' && JSON.stringify(call.payload).includes('确认推送'))
      expect(sent).toBeTruthy()
      const text = (sent?.payload?.['content'] as { text: string }[])?.[0]?.text ?? ''
      expect(confirmedFieldsOf(text)).toMatchObject({ po_number: 'PO-2', total: '100' })
    })
  })

  it('rejects from the review card and re-edits from the rejected card', async () => {
    const events: { event: FoldEvent }[] = [
      { event: userMessage(1, '帮我登记采购单') },
      {
        event: {
          type: 'assistant/message', seq: 2, time: 1,
          data: { message: { content: [{ type: 'text', text: '预填。\n```json\n{"collection":"hub_po_orders","title":"采购单","fields":{"po_number":"PO-1"}}\n```\n' }] } },
        },
      },
      { event: { type: 'turn/start', seq: 3, time: 1, data: { turn: 1 } } },
      { event: { type: 'turn/end', seq: 4, time: 1, data: { turn: 1 } } },
    ]
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events },
      'nocobase.listMeta': { collections: [{ name: 'hub_po_orders', fields: [{ name: 'po_number', type: 'string' }] }] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="loop-2" />)
    await screen.findByTestId('draft-card')
    fireEvent.click(screen.getByRole('button', { name: '提交审核' }))
    // The explicit timeout absorbs the under-load paint jitter the default
    // 1s intermittently tripped over (W10-R4 flake hardening; 8s held under
    // a cold-cache full-suite run with a dev server co-resident).
    await screen.findByTestId('review-card', {}, { timeout: 8000 })
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    await waitFor(() => {
      const sent = calls.find(call => call.url === '/api/session.prompt' && JSON.stringify(call.payload).includes('驳回'))
      expect(sent).toBeTruthy()
    })
    // The reject message lands in the log: the replay flips the card.
    events.push({ event: userMessage(5, '驳回：本表单草稿作废，不要写库。') })
    await waitFor(() => { expect(screen.getByTestId('rejected-card')).toBeTruthy() }, { timeout: 4000 })
    fireEvent.click(screen.getByRole('button', { name: '重新编辑' }))
    await waitFor(() => { expect(screen.getByTestId('draft-card')).toBeTruthy() })
  })
})

describe('mobile KG evidence cards', () => {
  it('renders nothing without KG usage', () => {
    const { container } = render(<KgEvidenceSection queries={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the subgraph card walk with provenance tones', async () => {
    stubGateway({
      'kg.subgraph': {
        nodes: [
          { id: 'n1', type: 'company', name: '宏发食品', depth: 0 },
          { id: 'n2', type: 'product', name: '酱油', depth: 1 },
        ],
        edges: [{ id: 'e1', relation: 'produces', source: 'n1', target: 'n2', asserted_by: 'nocobase' }],
        truncated: false,
        seeds_resolved: ['n1'],
      },
    })
    render(<KgEvidenceSection queries={[{ kind: 'subgraph', seeds: ['宏发食品'] }]} />)
    // The collapsed entry opens the evidence sheet (02 §4.5).
    expect(screen.getByLabelText('KG 证据入口').textContent).toContain('依据 · 知识图谱 1 条')
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    await waitFor(() => { expect(screen.getByText('实体走查')).toBeTruthy() })
    expect(screen.getAllByText('宏发食品').length).toBeGreaterThan(0)
    expect(screen.getByText('nocobase')).toBeTruthy()
  })

  it('names a failed seed walk', async () => {
    stubGateway({ 'kg.subgraph': () => { throw new Error('走查超时') } })
    render(<KgEvidenceSection queries={[{ kind: 'subgraph', seeds: ['宏发食品'] }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    await waitFor(() => { expect(screen.getByText('走查超时')).toBeTruthy() })
  })

  it('closes the evidence sheet through the mask', async () => {
    stubGateway({ 'kg.subgraph': { nodes: [], edges: [], truncated: false, seeds_resolved: [] } })
    render(<KgEvidenceSection queries={[{ kind: 'subgraph', seeds: ['宏发食品'] }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    await waitFor(() => { expect(screen.getByText('实体走查')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '关闭证据' }))
  })
})

describe('mobile entry mount', () => {
  it('mounts the app root and unmounts it on dispose', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    const container = document.createElement('div')
    document.body.append(container)
    const entry = new AppMobileEntry(container)
    entry.run()
    await waitFor(() => { expect(screen.getByText('食链通 · AI 员工')).toBeTruthy() })
    entry.dispose()
    expect(container.textContent).toBe('')
    container.remove()
  })
})

describe('mobile chat view durable states', () => {
  /** A settled draft plus the confirm-push message, with no receipt yet. */
  const pendingHistory = (): { events: { event: FoldEvent }[] } => ({
    events: [
      { event: userMessage(1, '帮我登记采购单') },
      { event: assistantMessage(2, '预填。\n```json\n{"collection":"hub_po_orders","title":"采购单","fields":{"po_number":"PO-1"}}\n```\n') },
      { event: userMessage(3, '确认推送：请按以下最终字段值调用 nb_create 写入业务表，完成后给出回执（业务表 hub_po_orders 行 id）。\n{"collection":"hub_po_orders","fields":{"po_number":"PO-9"}}') },
      { event: { type: 'turn/start', seq: 4, time: 1, data: { turn: 1 } } },
      { event: { type: 'turn/end', seq: 5, time: 1, data: { turn: 1 } } },
    ],
  })

  it('renders the review card from the durable pending and rejects it', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': pendingHistory(),
      'nocobase.listMeta': { collections: [{ name: 'hub_po_orders', fields: [{ name: 'po_number', type: 'string' }] }] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="durable-1" />)
    const review = await screen.findByTestId('review-card')
    expect(review.textContent).toContain('待人工审核')
    expect(screen.getByText('PO-9')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    await waitFor(() => {
      const sent = calls.find(call => call.url === '/api/session.prompt' && JSON.stringify(call.payload).includes('驳回'))
      expect(sent).toBeTruthy()
    })
  })

  it('names the preset, the running state, and settled tool rows', async () => {
    const now = Date.now()
    stubGateway({
      'session.list': { items: [
        { sessionId: 'named-1', updatedAt: now, running: true, agentPreset: 'purchase-assistant', projections: { values: { title: '采购专线' } } },
      ] },
      'session.history': { events: [
        { event: userMessage(1, '帮我登记采购单') },
        { event: { type: 'tool/call', seq: 2, time: 1, data: { callId: 'done-1', name: 'nb_list', arguments: '{}' } } },
        { event: { type: 'tool/result', seq: 3, time: 1, data: { message: { content: [{ toolCallId: 'done-1' }] } } } },
        { event: { type: 'tool/call', seq: 4, time: 1, data: { callId: 'bad-1', name: 'nb_get', arguments: '{}' } } },
        { event: { type: 'tool/result', seq: 5, time: 1, data: { message: { content: [{ toolCallId: 'bad-1', isError: true }] } } } },
        { event: { type: 'turn/start', seq: 6, time: 1, data: { turn: 1 } } },
        { event: { type: 'turn/end', seq: 7, time: 1, data: { turn: 1 } } },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="named-1" />)
    await waitFor(() => { expect(screen.getByText('采购专线')).toBeTruthy() })
    // The header names the colleague in people language, never the preset id.
    expect(screen.getByText('AI 同事 · 处理中')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('查询业务记录')).toBeTruthy() })
    expect(screen.getByText('读取业务行')).toBeTruthy()
  })

  it('sources the header and turn stamps from the roster name across title kinds', async () => {
    // One user→assistant turn renders the header stamp, the turn stamp, and
    // the turn seal; every scenario below reuses it.
    const history = { events: [
      { event: userMessage(1, '帮我看一下') },
      { event: assistantMessage(2, '收到，这就去查。') },
    ] }
    const renderChat = (item: Record<string, unknown>, presets: Record<string, unknown>[]): void => {
      stubGateway({
        'session.list': { items: [item] },
        'session.history': history,
        'agentPreset.list': { presets },
        'nocobase.listMeta': { collections: [] },
      })
      render(<ChatView sessionId="stamp-1" />)
    }
    const headerStamp = (): string => document.querySelector('[class*="headerMain_"] [class*="avatar_"]')?.textContent ?? ''
    const turnStamp = (): string => document.querySelector('[class*="assistantCol_"] [class*="avatar_"]')?.textContent ?? ''

    // An AI-prefixed roster name borrows its leading pair (食安) into both
    // stamps; a question-text title never reaches the stamp.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'ghost-safety', projections: { values: { title: 'GB2760防腐剂限量怎么查' } } },
      [{ id: 'ghost-safety', name: 'AI食安合规官', description: '', isDefault: false }],
    )
    await waitFor(() => { expect(headerStamp()).toBe('食安') })
    expect(turnStamp()).toBe('食安')
    expect(document.querySelector('[class*="aiSeal_"]')?.textContent).toBe('AI')
    cleanup()

    // A 新会话 title: the stamps stay roster-sourced.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'ghost-safety', projections: { values: { title: '新会话' } } },
      [{ id: 'ghost-safety', name: 'AI食安合规官', description: '', isDefault: false }],
    )
    await waitFor(() => { expect(screen.getByText('新会话')).toBeTruthy() })
    expect(headerStamp()).toBe('食安')
    expect(turnStamp()).toBe('食安')
    cleanup()

    // A roster name without the AI prefix keeps the fallback stamp word
    // (AI) — the same stamp the roster page shows for that name.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'ghost-master', projections: { values: { title: '帮我看一下到货' } } },
      [{ id: 'ghost-master', name: '张师傅', description: '', isDefault: false }],
    )
    await waitFor(() => { expect(headerStamp()).toBe('AI') })
    expect(turnStamp()).toBe('AI')
    cleanup()

    // A preset the roster does not carry falls back to the visual's duty
    // tag (AI 同事 → 同事), never the title.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'ghost-any', projections: { values: { title: '随便问点什么' } } },
      [],
    )
    await waitFor(() => { expect(headerStamp()).toBe('同事') })
    expect(turnStamp()).toBe('同事')
    cleanup()

    // A preset the visual table names keeps its own stamp word (合规) —
    // the roster page's own stamp for the same row.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'food-compliance-officer', projections: { values: { title: '审一下供应商资质' } } },
      [{ id: 'food-compliance-officer', name: 'AI食安合规官', description: '', isDefault: false }],
    )
    await waitFor(() => { expect(headerStamp()).toBe('合规') })
    expect(turnStamp()).toBe('合规')
    cleanup()

    // A special-character name borrows exactly its leading pair past the AI
    // prefix — no word-splitting filter drops the 「!!」.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'ghost-alarm', projections: { values: { title: '车间温度超限了' } } },
      [{ id: 'ghost-alarm', name: 'AI!!报警', description: '', isDefault: false }],
    )
    await waitFor(() => { expect(headerStamp()).toBe('!!') })
    expect(turnStamp()).toBe('!!')
    cleanup()

    // A blank or whitespace-only name after the prefix falls back to the AI
    // stamp word — the borrow never renders an empty pair.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'ghost-blank', projections: { values: { title: '随便问点什么' } } },
      [{ id: 'ghost-blank', name: 'AI ', description: '', isDefault: false }],
    )
    await waitFor(() => { expect(headerStamp()).toBe('AI') })
    expect(turnStamp()).toBe('AI')
    cleanup()

    // An empty name never starts with the prefix: the fallback stamp word.
    renderChat(
      { sessionId: 'stamp-1', updatedAt: 1, agentPreset: 'ghost-empty', projections: { values: { title: '随便问点什么' } } },
      [{ id: 'ghost-empty', name: '', description: '', isDefault: false }],
    )
    await waitFor(() => { expect(headerStamp()).toBe('AI') })
    expect(turnStamp()).toBe('AI')
  })

  it('surfaces a failed stop and drops blank enter sends', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': busyHistory(),
      'nocobase.listMeta': { collections: [] },
      'session.cancel': () => { throw new Error('取消通道 502') },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '  ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => { expect(screen.getByRole('status').textContent).toContain('AI 同事正在处理') })
    fireEvent.click(screen.getByRole('button', { name: '停止生成' }))
    await waitFor(() => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('取消通道 502') })
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
  })

  it('hydrates persisted draft edits on a remount', async () => {
    const draft = { collection: 'hub_po_orders', title: '采购单', fields: { po_number: 'PO-1', total: '100' } }
    saveDraftEdits('remount-1', draft, { po_number: 'PO-8' })
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: userMessage(1, '帮我登记采购单') },
        { event: assistantMessage(2, '预填。\n```json\n{"collection":"hub_po_orders","title":"采购单","fields":{"po_number":"PO-1","total":"100"}}\n```\n') },
        { event: { type: 'turn/start', seq: 3, time: 1, data: { turn: 1 } } },
        { event: { type: 'turn/end', seq: 4, time: 1, data: { turn: 1 } } },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="remount-1" />)
    const card = await screen.findByTestId('draft-card')
    await waitFor(() => { expect((card.querySelector('input') as HTMLInputElement).value).toBe('PO-8') })
  })

  it('stops pinning the flow once the user scrolls away from the bottom', async () => {
    // A running turn tightens the poll to 1200ms, so the pin effect re-runs
    // quickly under real timers.
    stubGateway({
      'session.list': { items: [] },
      'session.history': busyHistory(),
      'nocobase.listMeta': { collections: [] },
    })
    const { container } = render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('帮我登记采购单')).toBeTruthy() })
    const flow = container.firstElementChild?.children[1] as HTMLElement
    expect(flow.className).toContain('flow')
    Object.defineProperty(flow, 'scrollHeight', { configurable: true, writable: true, value: 1000 })
    Object.defineProperty(flow, 'clientHeight', { configurable: true, writable: true, value: 500 })
    flow.scrollTop = 100
    fireEvent.scroll(flow)
    // The pinned effect would set scrollTop to scrollHeight (1000); the
    // stick-to-bottom ref went false at the 400px scroll gap.
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 1600) }) })
    expect(flow.scrollTop).toBe(100)
  })
})

describe('mobile chats tab roster fallbacks', () => {
  it('falls back to the visual duty when the roster has no preset entry', async () => {
    const now = Date.now()
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 'ghost-1', updatedAt: now, agentPreset: 'ghost-preset' },
      ] },
    })
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('AI 同事')).toBeTruthy() })
  })
})

describe('mobile app theme round-trip', () => {
  it('turns the dark theme back off and clears the stored choice', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }))
    localStorage.setItem('dsh-mobile-theme', 'dark')
    const { container } = render(<App />)
    await waitFor(() => { expect(container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('dark') })
    navigate('#/me')
    fireEvent(window, new HashChangeEvent('hashchange'))
    fireEvent.click(await screen.findByRole('switch', { name: '深色模式' }))
    await waitFor(() => {
      expect(container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('light')
      expect(localStorage.getItem('dsh-mobile-theme')).toBeNull()
    })
  })
})

describe('mobile shell route edges', () => {
  const shellRoutes = {
    'agentPreset.list': { presets: [] },
    'session.list': { items: [] },
    'session.history': EMPTY_HISTORY,
    'nocobase.listMeta': { collections: [] },
  }

  it('lands a pre-identity login hash on the home tab', async () => {
    stubGateway(shellRoutes)
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/login')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getAllByText(/今日台账|待处理/).length).toBeGreaterThan(0) })
  })

  it('folds the retired contacts hash onto the agents tab', async () => {
    stubGateway(shellRoutes)
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/contacts')
    fireEvent(window, new HashChangeEvent('hashchange'))
    // The agents view owns the fold's landing (02 §1.3): its NavBar title
    // renders (scoped to the visible page — the keep-alive home's roster
    // rail heading carries the same words behind [hidden]), the chats
    // surface is gone, and the v6 tab bar stays (agents is a whitelist
    // page now).
    await waitFor(() => { expect(within(visibleTabPage('agents')).getByText('AI 同事')).toBeTruthy() })
    expect(screen.queryByPlaceholderText('搜索会话/同事')).toBeNull()
    expect(screen.getByRole('navigation', { name: '底部导航' })).toBeTruthy()
  })

  it('renders the work detail layer under #/work/:id', async () => {
    stubGateway({ ...shellRoutes, 'session.prompt': {} })
    localStorage.setItem('dsh-mobile-runmode', 'demo')
    const item = createWorkItem({ title: '路由任务', owner: '业务员' })
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate(`#/work/${item.id}`)
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByText(/WK-\d{4}-\d{4}/)).toBeTruthy() })
    // The full-screen layer hides the tab bar.
    expect(screen.queryByRole('navigation', { name: '底部导航' })).toBeNull()
  })

  it('folds a param-less chat hash onto the chats layer', async () => {
    stubGateway(shellRoutes)
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/chat')
    fireEvent(window, new HashChangeEvent('hashchange'))
    // The id-less chat head has no face of its own: the fallback lands on the
    // all-chats layer — back header present, tab bar hidden.
    await waitFor(() => { expect(screen.getByText('NocoBase 业务系统 · AI 员工入口')).toBeTruthy() })
    expect(screen.getByRole('button', { name: '返回' })).toBeTruthy()
    // The router spec pins goBackOr's semantics; this click covers the
    // layer's back wiring.
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(screen.queryByRole('navigation', { name: '底部导航' })).toBeNull()
  })

  it('switches between the me and work tabs through the tab bar', async () => {
    stubGateway(shellRoutes)
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    fireEvent.click(screen.getByText('我的'))
    await waitFor(() => { expect(screen.getByText('本月登记')).toBeTruthy() })
    fireEvent.click(screen.getByText('工作台'))
    await waitFor(() => { expect(screen.getByRole('heading', { name: '工作' })).toBeTruthy() })
  })

  it('reaches and activates the tab bar items by keyboard (WCAG 2.1.1)', async () => {
    stubGateway(shellRoutes)
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    // The four antd-mobile div items are operable tabs: focusable (tabIndex),
    // role=tab + tablist (the shell's mount pass), aria-selected tracking the
    // route.
    const nav = screen.getByRole('navigation', { name: '底部导航' })
    const tabs = within(nav).getAllByRole('tab')
    expect(tabs.map(tab => tab.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false'])
    expect(tabs.every(tab => tab.tabIndex === 0)).toBe(true)
    expect(within(nav).getByRole('tablist')).toBeTruthy()
    const homeTab = within(nav).getByRole('tab', { name: '消息' })
    const workTab = within(nav).getByRole('tab', { name: '工作台' })
    const meTab = within(nav).getByRole('tab', { name: '我的' })
    // Enter and Space both ride the same navigate() path as a click.
    fireEvent.keyDown(meTab, { key: 'Enter' })
    await waitFor(() => { expect(screen.getByText('本月登记')).toBeTruthy() })
    fireEvent.keyDown(workTab, { key: ' ' })
    await waitFor(() => { expect(screen.getByRole('heading', { name: '工作' })).toBeTruthy() })
    expect(meTab.getAttribute('aria-selected')).toBe('false')
    expect(workTab.getAttribute('aria-selected')).toBe('true')
    // Other keys stay inert on a tab item, and Enter on the nav itself (no
    // tab item under the cursor) stays put too.
    fireEvent.keyDown(homeTab, { key: 'ArrowRight' })
    fireEvent.keyDown(nav, { key: 'Enter' })
    expect(screen.getByRole('heading', { name: '工作' })).toBeTruthy()
  })
})

describe('mobile new-chat sheet edges', () => {
  it('closes through the close button', async () => {
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'mobile-form-assistant', name: '智能填表助手', description: '', isDefault: true }] },
      'session.list': { items: [] },
    })
    const onClose = vi.fn()
    render(<NewChatSheet visible onClose={onClose} />)
    fireEvent.click(await screen.findByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('ignores a second start while the first create is in flight', async () => {
    let release: (value: { sessionId: string }) => void = () => {}
    const gate = new Promise<{ sessionId: string }>((resolve) => { release = resolve })
    stubGateway({
      'agentPreset.list': { presets: [{ id: 'purchase-assistant', name: '采购助理', description: '', isDefault: false }] },
      'session.list': { items: [] },
      'session.create': () => gate,
      'session.prompt': {},
    })
    render(<NewChatSheet visible onClose={() => {}} />)
    const start = await screen.findByRole('button', { name: /采购助理/ })
    fireEvent.click(start)
    fireEvent.click(start)
    await waitFor(() => { expect(calls.filter(call => call.url === '/api/session.create')).toHaveLength(1) })
    release({ sessionId: 'late-1' })
    await waitFor(() => { expect(location.hash).toBe('#/chat/late-1') })
  })
})

describe('mobile KG evidence phrase walks', () => {
  const subgraph = {
    nodes: [
      { id: 'n1', type: 'company', name: '宏发食品', depth: 0 },
      { id: 'ghost', type: 'product', name: '酱油', depth: 1 },
    ],
    edges: [
      { id: 'e1', relation: 'produces', source: 'n1', target: 'ghost', asserted_by: 'lakehouse' },
      { id: 'e2', relation: 'supplies', source: 'n1', target: 'ghost', asserted_by: 'kb' },
      { id: 'e3', relation: 'audits', source: 'n1', target: 'ghost', asserted_by: 'connector' },
      { id: 'e4', relation: 'reviews', source: 'missing-id', target: 'ghost', asserted_by: 'ai-edit' },
    ],
    truncated: false,
    seeds_resolved: ['n1'],
  }

  it('walks a phrase through seed search into the subgraph card', async () => {
    stubGateway({
      'kg.search': { nodes: [{ id: 'n1', type: 'company', name: '宏发食品' }] },
      'kg.subgraph': subgraph,
    })
    render(<KgEvidenceSection queries={[{ kind: 'phrase', phrase: '宏发食品的供应商' }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    await waitFor(() => { expect(screen.getByText('短语走查')).toBeTruthy() })
    await waitFor(() => { expect(screen.getAllByText('宏发食品').length).toBeGreaterThan(0) })
    // Every provenance tone renders, and an unresolved endpoint shows its id.
    expect(screen.getByText('lakehouse')).toBeTruthy()
    expect(screen.getByText('kb')).toBeTruthy()
    expect(screen.getByText('connector')).toBeTruthy()
    expect(screen.getByText('ai-edit')).toBeTruthy()
    expect(screen.getByText('missing-id')).toBeTruthy()
  })

  it('ignores late walk answers after unmount', async () => {
    let resolveSubgraph: (value: unknown) => void = () => {}
    let rejectSubgraph: () => void = () => {}
    stubGateway({
      'kg.subgraph': () => new Promise((resolve, reject) => {
        resolveSubgraph = resolve
        rejectSubgraph = reject
      }),
    })
    const first = render(<KgEvidenceSection queries={[{ kind: 'subgraph', seeds: ['宏发食品'] }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    first.unmount()
    resolveSubgraph({ nodes: [], edges: [], truncated: false, seeds_resolved: [] })
    const second = render(<KgEvidenceSection queries={[{ kind: 'subgraph', seeds: ['宏发食品'] }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    second.unmount()
    rejectSubgraph()
    await Promise.resolve()
    expect(document.querySelector('[aria-label="KG 证据卡"]')).toBeNull()
  })

  it('ignores a late seed-search miss after unmount', async () => {
    let resolveSearch: (value: unknown) => void = () => {}
    stubGateway({
      'kg.search': () => new Promise((resolve) => { resolveSearch = resolve }),
    })
    const view = render(<KgEvidenceSection queries={[{ kind: 'phrase', phrase: '迟到的短语' }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    view.unmount()
    resolveSearch({ nodes: [] })
    await Promise.resolve()
    expect(document.querySelector('[aria-label="KG 证据卡"]')).toBeNull()
  })

  it('ignores a late subgraph walk after a phrase unmount', async () => {
    let resolveSearch: (value: unknown) => void = () => {}
    let resolveSubgraph: (value: unknown) => void = () => {}
    stubGateway({
      'kg.search': () => new Promise((resolve) => { resolveSearch = resolve }),
      'kg.subgraph': () => new Promise((resolve) => { resolveSubgraph = resolve }),
    })
    const view = render(<KgEvidenceSection queries={[{ kind: 'phrase', phrase: '再走一次' }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    resolveSearch({ nodes: [{ id: 'n1', type: 'company', name: '宏发食品' }] })
    // Let the seed search's then-chain issue the subgraph walk before unmount.
    await act(async () => { await Promise.resolve() })
    view.unmount()
    resolveSubgraph({ nodes: [], edges: [], truncated: false, seeds_resolved: [] })
    await Promise.resolve()
    expect(document.querySelector('[aria-label="KG 证据卡"]')).toBeNull()
  })

  it('ignores a late seed-search failure after unmount', async () => {
    let rejectSearch: () => void = () => {}
    stubGateway({
      'kg.search': () => new Promise((_, reject) => { rejectSearch = reject }),
    })
    const view = render(<KgEvidenceSection queries={[{ kind: 'phrase', phrase: '第三次' }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    view.unmount()
    rejectSearch()
    await Promise.resolve()
    expect(document.querySelector('[aria-label="KG 证据卡"]')).toBeNull()
  })

  it('names a phrase with no entity hits and a failed search', async () => {
    stubGateway({ 'kg.search': { nodes: [] } })
    render(<KgEvidenceSection queries={[{ kind: 'phrase', phrase: '幽灵短语' }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    await waitFor(() => { expect(screen.getByText('短语在图谱中无实体命中')).toBeTruthy() })
    stubGateway({ 'kg.search': () => { throw new Error('检索超时') } })
    cleanup()
    render(<KgEvidenceSection queries={[{ kind: 'phrase', phrase: '再试一次' }]} />)
    fireEvent.click(screen.getByLabelText('KG 证据入口'))
    await waitFor(() => { expect(screen.getByText('检索超时')).toBeTruthy() })
  })
})

describe('mobile UI atoms children slot', () => {
  it('renders avatar children over the acronym', () => {
    render(<Avatar background="#2e7cf6" acronym="采购"><span>自定义徽标</span></Avatar>)
    expect(screen.getByText('自定义徽标')).toBeTruthy()
  })
})

const v3AskFence = '```dsh\n{"v":3,"type":"ask_choice","id":"c1","mode":"single","variant":"cards","question":"这笔要登记成什么单据？","options":[{"label":"采购单","value":"hub_po","send":"是采购单，我们从鲜丰买进"},{"label":"出库单","value":"hub_out"}],"allowFreeText":true}\n```'
const v3DraftFence = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_1","revision":1,"form":{"collection":"pur_orders","label":"采购单"},"title":"鲜丰采购","fields":[{"name":"quantity","label":"数量","value":null,"tier":"required","widget":"number"},{"name":"order_date","label":"日期","value":"2026-09-21","tier":"derived","rationale":"今天","widget":"date"}]}\n```'
const v3ConfirmUserMessage = '确认写入\n```dsh\n{"v":3,"type":"form_confirm","draftId":"d_1","revision":1,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"fields":[{"name":"quantity","label":"数量","value":"200"}]}\n```'
const v3DraftFenceRev2 = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_1","revision":2,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"title":"鲜丰采购改","fields":[{"name":"quantity","label":"数量","value":"300","tier":"required","widget":"number"}]}\n```'
const v3ReceiptFence = '```dsh\n{"v":3,"type":"submit_receipt","draftId":"d_1","form":{"collection":"hub_po_purchase_orders","label":"采购单"},"rowId":"1042","summary":[{"label":"合计金额","value":"¥6,400","kind":"money"}]}\n```'

describe('mobile chat view (v3 fences)', () => {
  it('renders an open ask with no composer chips and sends the pick as the user', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: userMessage(1, '帮我登记一下，刚和鲜丰谈好一批冷链箱') },
        { event: assistantMessage(2, `两个方向，请点选：\n${v3AskFence}`) },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('这笔要登记成什么单据？')).toBeTruthy() })
    // The ask state suppresses the composer chips (02 §4.4).
    expect(screen.queryByRole('button', { name: '再补一句说明' })).toBeNull()
    fireEvent.click(screen.getByRole('radio', { name: /采购单/ }))
    await waitFor(() => {
      const prompt = calls.find(call => call.url === '/api/session.prompt')
      expect(JSON.stringify(prompt?.payload)).toContain('是采购单，我们从鲜丰买进')
    })
  })

  it('collapses an invalid dsh fence into the summary notice instead of a raw-JSON bubble', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, '我先出个草稿。\n```dsh\n{"v":3,"type":"form_draft","fields":[{"widget":"id"}]}\n```') },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    const notice = await screen.findByText('结构化消息（格式异常，已折叠）')
    // The malformed fence never renders as narrative: the bubble carries only
    // the prose, and the original JSON stays behind the collapsed details.
    expect(screen.getByText('我先出个草稿。')).toBeTruthy()
    const details = notice.closest('details')
    expect(details?.open).toBe(false)
    expect(details?.textContent).toContain('"type":"form_draft"')
    for (const bubble of document.querySelectorAll('[class*="assistantBubble"]')) {
      expect(bubble.textContent).not.toContain('```dsh')
    }
  })

  it('confirms and rejects the three-tier card through fenced actions', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, `草稿：\n${v3DraftFence}`) }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    const card = await screen.findByTestId('draft-card-v3')
    // W8-B2: the blank required quantity (value null) must be filled before
    // the confirm gate opens.
    fireEvent.change(card.querySelector('input') as HTMLInputElement, { target: { value: '200' } })
    // The draft phase carries the re-phrase chips.
    expect(screen.getByRole('button', { name: '换一种单据' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    await waitFor(() => {
      const confirm = calls.filter(call => call.url === '/api/session.prompt').pop()
      expect(JSON.stringify(confirm?.payload)).toContain('form_confirm')
      expect(JSON.stringify(confirm?.payload)).toContain('确认写入')
      expect(JSON.stringify(confirm?.payload)).not.toContain('确认推送')
    })
    fireEvent.click(screen.getByRole('button', { name: '驳回' }))
    await waitFor(() => {
      const reject = calls.filter(call => call.url === '/api/session.prompt').pop()
      expect(JSON.stringify(reject?.payload)).toContain('reject_flow')
    })
  })

  it('keeps a blank required v3 field from sending and focuses the blank control (W8-B2)', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, `草稿：\n${v3DraftFence}`) }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    const card = await screen.findByTestId('draft-card-v3')
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    // No prompt leaves the page; the nearby error renders and the first
    // blank control takes focus.
    await waitFor(() => { expect(screen.getAllByText('此项必填').length).toBeGreaterThan(0) })
    expect(card.querySelector('input')).toEqual(document.activeElement)
    expect(calls.filter(call => call.url === '/api/session.prompt')).toHaveLength(0)
    // Filling the blank and confirming sends the fenced action.
    fireEvent.change(card.querySelector('input') as HTMLInputElement, { target: { value: '200' } })
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    await waitFor(() => {
      const confirm = calls.filter(call => call.url === '/api/session.prompt').pop()
      expect(JSON.stringify(confirm?.payload)).toContain('form_confirm')
    })
  })

  it('hides the landed card behind the receipt item and swaps the chips', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, `草稿：\n${v3DraftFence}`) },
        { event: userMessage(2, v3ConfirmUserMessage) },
        ...nbCreateLanded(2.5, 'hub_po_purchase_orders', '1042'),
        { event: assistantMessage(3, `已登记。\n${v3ReceiptFence}`) },
      ] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByTestId('receipt-card-v3')).toBeTruthy() })
    expect(screen.queryByTestId('draft-card-v3')).toBeNull()
    expect(screen.getByText('你确认了这张采购单')).toBeTruthy()
    expect(screen.getByRole('button', { name: '再来一单' })).toBeTruthy()
    // The receipt's view-record entry sends the read-back follow-up.
    fireEvent.click(screen.getByRole('button', { name: '查看这条记录' }))
    await waitFor(() => {
      const prompt = calls.filter(call => call.url === '/api/session.prompt').pop()
      expect(JSON.stringify(prompt?.payload)).toContain('查这条记录')
    })
  })

  it('hides superseded revisions of the same draftId', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, `第一版。\n${v3DraftFence}`) },
        { event: assistantMessage(2, `改过了。\n${v3DraftFenceRev2}`) },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('鲜丰采购改')).toBeTruthy() })
    expect(screen.queryByText('鲜丰采购')).toBeNull()
  })
})

describe('contextChipsOf', () => {
  it('switches the chips by the conversation phase', () => {
    expect(contextChipsOf([], new Map())).toEqual([])
    const cardStates = new Map<number, DerivedCardState>([[1, { phase: 'draft' }]])
    expect(contextChipsOf([{ kind: 'task-card', seq: 1, time: 1, draft: { collection: 'c', title: 't', fields: {} } }], cardStates))
      .toEqual(['再补一句说明', '换一种单据'])
    const submitted = new Map<number, DerivedCardState>([[1, { phase: 'submitted' }]])
    expect(contextChipsOf([{ kind: 'task-card', seq: 1, time: 1, draft: { collection: 'c', title: 't', fields: {} } }], submitted))
      .toEqual(['再来一单', '查这条记录'])
    const openAsk: ChatItem[] = [
      { kind: 'ask', seq: 1, time: 1, payload: { v: 3, type: 'ask_choice', id: 'c', mode: 'single', variant: 'chips', question: 'q', options: [{ label: 'a', value: 'b' }], allowFreeText: false } },
    ]
    expect(contextChipsOf(openAsk, new Map())).toEqual([])
    const answeredAsk: ChatItem[] = [{ ...(openAsk[0] as ChatAsk), answered: {} }]
    expect(contextChipsOf(answeredAsk, new Map())).toEqual([])
    const plainText: ChatItem[] = [{ kind: 'text', seq: 1, time: 1, role: 'assistant', text: '问数回答' }]
    expect(contextChipsOf(plainText, new Map())).toEqual([])
  })
})

describe('mobile chat view (v3 ask field and chips)', () => {
  it('renders a field-ask whose suggestion fills the draft for the user to edit', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, '```dsh\n{"v":3,"type":"ask_field","id":"f1","question":"数量是多少？","field":{"name":"quantity","label":"数量","widget":"number","unit":"箱","suggestions":[{"label":"200 箱","value":"200"}]}}\n```') },
      ] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByTestId('field-ask')).toBeTruthy() })
    fireEvent.click(screen.getByText('200 箱'))
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    expect(box.value).toBe('200 箱')
    expect(calls.some(call => call.url === '/api/session.prompt')).toBe(false)
    expect(document.activeElement).toBe(box)
    expect(box.selectionStart).toBe('200 箱'.length)
  })

  it('fills a receipt-phase chip into the draft instead of sending it', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, `草稿：\n${v3DraftFence}`) },
        { event: userMessage(2, v3ConfirmUserMessage) },
        ...nbCreateLanded(2.5, 'hub_po_purchase_orders', '1042'),
        { event: assistantMessage(3, `已登记。\n${v3ReceiptFence}`) },
      ] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByRole('button', { name: '再来一单' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '再来一单' }))
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    expect(box.value).toBe('再来一单')
    expect(calls.some(call => call.url === '/api/session.prompt')).toBe(false)
    expect(document.activeElement).toBe(box)
    expect(box.selectionStart).toBe('再来一单'.length)
  })
})

describe('mobile chat view (answered ask replay)', () => {
  it('renders the pick capsule and greys the ask on replay', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, v3AskFence) },
        { event: userMessage(2, '是采购单，我们从鲜丰买进') },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByLabelText('选择回执').textContent).toContain('是采购单，我们从鲜丰买进') })
    expect(screen.getByTestId('ask-choice').className).toContain('askAnswered')
  })
})

describe('mobile chat view (v3 re-edit)', () => {
  it('re-opens a rejected v3 card into the draft phase', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, `草稿：\n${v3DraftFence}`) },
        { event: userMessage(2, '驳回\n```dsh\n{"v":3,"type":"reject_flow","draftId":"d_1"}\n```') },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    const card = await screen.findByTestId('draft-card-v3')
    await waitFor(() => { expect(card.textContent).toContain('重新编辑') })
    fireEvent.click(screen.getByRole('button', { name: '重新编辑' }))
    await waitFor(() => { expect(card.textContent).toContain('确认写入') })
  })
})

describe('mobile chat view (free-text focus)', () => {
  it('focuses the composer from the ask free-text entry', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, v3AskFence) }] },
      'nocobase.listMeta': { collections: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('自己打字说明')).toBeTruthy() })
    fireEvent.click(screen.getByText('自己打字说明'))
    await waitFor(() => { expect(screen.getByPlaceholderText('问我任何经营问题...')).toEqual(document.activeElement) })
  })
})

describe('mobile chat view (D2 acceptance fixes)', () => {
  it('paints the fresh session identity from the create echo without a list row', async () => {
    stubGateway({
      'session.create': { sessionId: 'fresh-1', agentPreset: 'mobile-form-assistant' },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'agentPreset.list': { presets: [] },
      'nocobase.listMeta': { collections: [] },
    })
    await createSession('mobile-form-assistant')
    render(<ChatView sessionId="fresh-1" />)
    // First paint carries the colleague identity and its local welcome (the
    // header names the duty, never the preset id).
    expect(screen.getAllByText('单据登记与任务执行').length).toBeGreaterThan(0)
    await waitFor(() => { expect(screen.getByTestId('welcome-card')).toBeTruthy() })
    expect(screen.getByText('我是智能填表助手')).toBeTruthy()
  })

  it('renders a failed protocol tool call as the neutral status line', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: userMessage(1, '帮我登记一下') },
        { event: { type: 'tool/call', seq: 2, time: 1, data: { callId: 'p1', name: 'ask_field_pricing', arguments: '{}' } } },
        { event: { type: 'tool/result', seq: 3, time: 1, data: { message: { content: [{ toolCallId: 'p1', isError: true }] } } } },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    const { container } = render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('补充信息…')).toBeTruthy() })
    expect(container.textContent).not.toContain('ask_field_pricing')
    expect(container.textContent).not.toContain('✕')
  })

  it('renders the report card inline with its narrative and metric', async () => {
    const reportFence = '```dsh\n{"v":3,"type":"report","id":"r_1","title":"项目风险",'
      + '"metrics":[{"label":"待处理","value":"5","kind":"count"}]}\n```'
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, `帮你看了一下风险。\n${reportFence}\n有需要跟进的随时说。`) },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    const { container } = render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('帮你看了一下风险。')).toBeTruthy() })
    // The ReportCard renders the title, the metric, and the report stamp; the
    // fence itself never leaks as a bubble.
    expect(screen.getByTestId('report-card')).toBeTruthy()
    expect(screen.getByText('项目风险')).toBeTruthy()
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('险')).toBeTruthy()
    expect(container.textContent).not.toContain('```dsh')
  })

  it('renders one avatar for a multi-segment AI turn', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: userMessage(1, '帮我登记一下，刚和鲜丰谈好一批冷链箱') },
        { event: assistantMessage(2, `两个方向，请点选：\n${v3AskFence}`) },
      ] },
      'nocobase.listMeta': { collections: [] },
    })
    const { container } = render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByText('两个方向，请点选：')).toBeTruthy() })
    // The trailing underscore separates the hashed module class from the ghost variant.
    expect(container.querySelectorAll('[class*="assistantCol_"]')).toHaveLength(1)
    expect(container.querySelectorAll('[class*="assistantColGhost_"]')).toHaveLength(1)
    expect(container.querySelectorAll('[class*="aiSeal_"]')).toHaveLength(1)
  })

  it('fills the blank system number and sends it through the confirm', async () => {
    const draftWithBlankNumber = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_sys","revision":1,"form":{"collection":"pur_orders","label":"采购单"},"title":"鲜丰采购","fields":[{"name":"quantity","label":"数量","value":"200","tier":"required","widget":"number"},{"name":"order_date","label":"日期","value":"2026-09-21","tier":"derived","rationale":"今天","widget":"date"},{"name":"code","label":"订单号","value":"","tier":"system","widget":"text"}]}\n```'
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, `草稿：\n${draftWithBlankNumber}`) }] },
      'nocobase.listMeta': { collections: [] },
      'nocobase.list': { rows: [{ code: 'PO-2026-0007' }] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    const card = await screen.findByTestId('draft-card-v3')
    // The 今天 date snaps to the client calendar on the derived tier's face.
    await waitFor(() => { expect(card.textContent).toContain(todayOf()) })
    // The system tier folds; opening it reveals the generated number.
    fireEvent.click(screen.getByText('系统生成（1）'))
    await waitFor(() => { expect(card.textContent).toContain('PO-2026-0008') })
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    await waitFor(() => {
      const confirm = calls.filter(call => call.url === '/api/session.prompt').pop()
      const text = (confirm?.payload?.['content'] as { text: string }[])?.[0]?.text ?? ''
      const fence = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
        fields: { name: string; value: string }[]
      }
      const byName = new Map(fence.fields.map(field => [field.name, field.value]))
      expect(byName.get('code')).toBe('PO-2026-0008')
      expect(byName.get('order_date')).toBe(todayOf())
    })
  })

  it('leaves a registry-unknown blank system field untouched', async () => {
    const draftWithUnknownSystem = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_unk","revision":1,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"title":"采购","fields":[{"name":"internal_ref","label":"内部参考","value":"","tier":"system","widget":"text"}]}\n```'
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, `草稿：\n${draftWithUnknownSystem}`) }] },
      'nocobase.listMeta': { collections: [] },
      'nocobase.list': { rows: [] },
    })
    render(<ChatView sessionId="session-12" />)
    await screen.findByTestId('draft-card-v3')
    // No number is invented for a field the registry does not generate.
    await waitFor(() => { expect(calls.some(call => call.url === '/api/nocobase.list')).toBe(false) })
  })
})

describe('mobile chat view (report actions)', () => {
  it('opens the hosted TaskFormModal from a report card create-task action', async () => {
    const reportFence = '```dsh\n{"v":3,"type":"report","id":"r_9","title":"项目风险",'
      + '"metrics":[{"label":"待处理","value":"5","kind":"count"}],'
      + '"actions":[{"kind":"create-task","label":"创建处理任务","title":"接口联调延期处理","suggestion":"今天确认联调时间"}]}\n```'
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, reportFence) }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    await screen.findByTestId('report-card')
    fireEvent.click(screen.getByRole('button', { name: '创建处理任务' }))
    await waitFor(() => { expect(screen.getByRole('heading', { name: '创建处理任务' })).toBeTruthy() })
    // The modal opens prefilled from the action's title and suggestion.
    expect(screen.getByLabelText<HTMLInputElement>('任务标题').value).toBe('接口联调延期处理')
    expect(screen.getByText('今天确认联调时间')).toBeTruthy()
  })

  // The B2 real-LLM capture form end to end: the create-task action carried
  // `text` instead of `title` and the whole card degraded. The folded parse
  // must render the legal card and keep 创建处理任务 reachable into the modal.
  it('renders and opens the modal from the real-LLM text-only create-task capture', async () => {
    const longText = '针对两家供应商资质证照三十天内到期的风险，联系临期供应商确认换发材料清单并跟进出证进度'
    const degradedFence = '```dsh\n{"v":3,"type":"report","id":"r_live","title":"供应商风险",'
      + '"metrics":[{"label":"临期资质","value":"2","kind":"count"}],'
      + `\"actions\":[{\"kind\":\"create-task\",\"label\":\"创建处理任务\",\"text\":\"${longText}\"}]}\n\`\`\``
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, degradedFence) }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    await screen.findByTestId('report-card')
    expect(screen.queryByText('格式异常，已折叠')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '创建处理任务' }))
    await waitFor(() => { expect(screen.getByRole('heading', { name: '创建处理任务' })).toBeTruthy() })
    expect(screen.getByLabelText<HTMLInputElement>('任务标题').value).toBe(Array.from(longText).slice(0, 32).join(''))
    expect(screen.getByText(longText)).toBeTruthy()
    // The modal's close path returns to the flow without creating anything.
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    await waitFor(() => { expect(screen.queryByRole('heading', { name: '创建处理任务' })).toBeNull() })
  })
})

describe('mobile chat view (demo typing)', () => {
  it('breathes the typing dots after a silent 2.5s prompt and clears on arrival', async () => {
    vi.useFakeTimers()
    localStorage.setItem('dsh-mobile-runmode', 'demo')
    let historyEvents: { event: FoldEvent }[] = [{ event: userMessage(1, '帮我看看风险') }]
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': () => ({ events: historyEvents }),
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="typing-1" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '再看看' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    // 2.5s without a new event shows the three-dot indicator (render state only).
    await act(async () => { await vi.advanceTimersByTimeAsync(2600) })
    expect(screen.getByRole('status', { name: '正在处理' })).toBeTruthy()
    // A new event arrives on the next poll tick: the indicator clears.
    historyEvents = [...historyEvents, { event: assistantMessage(9, '答上来了。', 2) }]
    await act(async () => { await vi.advanceTimersByTimeAsync(1300) })
    expect(screen.queryByRole('status', { name: '正在处理' })).toBeNull()
    expect(screen.getByText('答上来了。')).toBeTruthy()
    vi.useRealTimers()
  })

  it('clears the typing dots when folded arrivals keep the item count under the raw baseline', async () => {
    vi.useFakeTimers()
    localStorage.setItem('dsh-mobile-runmode', 'demo')
    // One turn folds 5 raw events into 2 items (a user bubble + a tool row):
    // the raw count and the folded count must not be mixed when the baseline
    // and the clearing check compare notes.
    const turn = (n: number): { event: FoldEvent }[] => [
      { event: { type: 'turn/start', seq: n * 10 + 1, time: 1, data: { turn: n } } },
      { event: { type: 'user/message', seq: n * 10 + 2, time: 1, data: { source: { kind: 'user' }, content: [{ type: 'text', text: `第${String(n)}问` }] } } },
      { event: { type: 'tool/call', seq: n * 10 + 3, time: 1, data: { callId: `c${String(n)}`, name: 'nb_list', arguments: '{}' } } },
      { event: { type: 'tool/result', seq: n * 10 + 4, time: 1, data: { message: { content: [{ toolCallId: `c${String(n)}` }] } } } },
      { event: { type: 'turn/end', seq: n * 10 + 5, time: 1, data: { turn: n } } },
    ]
    let historyEvents: { event: FoldEvent }[] = turn(1)
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': () => ({ events: historyEvents }),
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="typing-fold" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(screen.getByText('第1问')).toBeTruthy()
    fireEvent.change(screen.getByPlaceholderText('问我任何经营问题...'), { target: { value: '再问' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2600) })
    expect(screen.getByRole('status', { name: '正在处理' })).toBeTruthy()
    // Turn 2 lands raw +5 (folded +2 only): the raw count crosses the
    // baseline even though the folded item count stays under it.
    historyEvents = [...historyEvents, ...turn(2)]
    await act(async () => { await vi.advanceTimersByTimeAsync(1300) })
    expect(screen.queryByRole('status', { name: '正在处理' })).toBeNull()
    expect(screen.getByText('第2问')).toBeTruthy()
    vi.useRealTimers()
  })

  it('never shows the typing dots when an event lands inside the window', async () => {
    vi.useFakeTimers()
    localStorage.setItem('dsh-mobile-runmode', 'demo')
    let historyEvents: { event: FoldEvent }[] = [{ event: userMessage(1, '帮我看看风险') }]
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': () => ({ events: historyEvents }),
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="typing-3" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    fireEvent.change(screen.getByPlaceholderText('问我任何经营问题...'), { target: { value: '追问一句' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    // The reply lands inside the 2.5s window: the timer fires on a moved count.
    historyEvents = [...historyEvents, { event: assistantMessage(9, '很快答上来了。', 2) }]
    await act(async () => { await vi.advanceTimersByTimeAsync(4400) })
    expect(screen.queryByRole('status', { name: '正在处理' })).toBeNull()
    expect(screen.getByText('很快答上来了。')).toBeTruthy()
    vi.useRealTimers()
  })

  it('unmounts a live chat without ever arming the demo typing timer', async () => {
    localStorage.setItem('dsh-mobile-runmode', 'live')
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, '欢迎') }] },
      'nocobase.listMeta': { collections: [] },
    })
    const { unmount } = render(<ChatView sessionId="typing-4" />)
    await screen.findByText('欢迎')
    unmount()
  })

  it('clears the typing indicator and re-enables the composer when a send fails', async () => {
    vi.useFakeTimers()
    localStorage.setItem('dsh-mobile-runmode', 'demo')
    let promptFails = false
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': { events: [{ event: userMessage(1, '帮我看看风险') }] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': () => {
        if (promptFails) throw new Error('推送通道拒绝')
        return {}
      },
    })
    render(<ChatView sessionId="typing-2" />)
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    const box = screen.getByPlaceholderText('问我任何经营问题...') as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: '第一条' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(2600) })
    expect(screen.getByRole('status', { name: '正在处理' })).toBeTruthy()
    // The next send fails: the breathing dots and the pending timer must go.
    promptFails = true
    fireEvent.change(box, { target: { value: '第二条' } })
    fireEvent.click(screen.getByRole('button', { name: '发送' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(3000) })
    expect(screen.queryByRole('status', { name: '正在处理' })).toBeNull()
    // The composer takes the next input: the failed send left it usable.
    fireEvent.change(box, { target: { value: '第三条' } })
    expect(box.value).toBe('第三条')
    vi.useRealTimers()
  })
})

describe('mobile me tab (v5 additions)', () => {
  it('shows the workspace card, flips the run mode to live, and clears the demo data', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    const demoItem = createWorkItem({ title: '演示项', owner: '业务员', demo: true })
    const realItem = createWorkItem({ title: '真实项', owner: '业务员' })
    render(
      <ProfileView
        identity={{ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    expect(screen.getByText('工作空间')).toBeTruthy()
    expect(screen.getByText('累计完成')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '工作空间' }))
    expect(location.hash).toBe('#/work')
    // The run-mode switch persists through the explicit localStorage switch.
    fireEvent.click(screen.getByRole('switch', { name: '真实模式' }))
    await waitFor(() => { expect(localStorage.getItem('dsh-mobile-runmode')).toBe('live') })
    // The notification toggle is a local no-op default off.
    fireEvent.click(screen.getByRole('switch', { name: '通知' }))
    // The demo cleanup confirms first, then removes exactly the demo-marked items.
    fireEvent.click(screen.getByText('清除演示数据'))
    Toast.clear()
    fireEvent.click(screen.getByRole('button', { name: '清除' }))
    const remaining = workSnapshot().items.map(item => item.id)
    expect(remaining).toEqual([realItem.id])
    expect(remaining).not.toContain(demoItem.id)
    await waitFor(
      () => { expect(document.querySelector('.adm-toast-main')?.textContent ?? '').toContain('演示数据已清除') },
      { timeout: 8000 },
    )
  }, 15_000)
})

describe('mobile docs route reference (W6-R1; the todos leg lives in todos-view.client.spec.tsx)', () => {
  const shellRoutes = {
    'agentPreset.list': { presets: [] },
    'session.list': { items: [] },
    'session.history': EMPTY_HISTORY,
    'nocobase.listMeta': { collections: [] },
    'nocobase.list': { count: 0, page: 1, page_size: 100, rows: [] },
  }

  it('routes #/docs onto the docs directory and its role subset', async () => {
    stubGateway(shellRoutes)
    const identity = { username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }
    localStorage.setItem('dsh-mobile-auth', JSON.stringify(identity))
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/docs')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getAllByTestId('docs-collection').length).toBe(3) })
    expect(screen.getByText('采购订单')).toBeTruthy()
  })
})
