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

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
import { createSession } from '../src/client/sessionsService.ts'
import { todayOf } from '../src/client/systemFields.ts'
import { Avatar, Badge, NoticeCard, RunningRow } from '../src/client/ui.tsx'

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
    const value = produced
    return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
  })
  vi.stubGlobal('fetch', fetchMock)
}

/** One user message event (agent-kind source renders nothing). */
function userMessage(seq: number, text: string, sourceKind = 'user'): FoldEvent {
  return { type: 'user/message', seq, time: 1, data: { source: { kind: sourceKind }, content: [{ type: 'text', text }] } }
}

/** One assistant message event wrapping the message content. */
function assistantMessage(seq: number, text: string, time = 1): FoldEvent {
  return { type: 'assistant/message', seq, time, data: { message: { content: [{ type: 'text', text }] } } }
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
})

describe('mobile UI atoms', () => {
  it('renders the stamp avatar, badge tones, running row, and notices', () => {
    const { container } = render(
      <>
        <Avatar background="#0b5d56" acronym="表单" size={40} />
        <Badge tone="primary">在线</Badge>
        <RunningRow text="AI 同事正在处理…" />
        <NoticeCard kind="empty" text="加载中" />
        <NoticeCard kind="error" text="失败了" />
      </>,
    )
    expect(screen.getByText('在线')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('AI 同事正在处理…')
    expect(screen.getByText('失败了')).toBeTruthy()
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('表单')).toBeTruthy()
  })
})

describe('mobile login gate', () => {
  it('renders the brand defaults with the submit disabled until both fields hold', () => {
    const view = render(<LoginView onLoggedIn={() => {}} />)
    expect(screen.getByText('食链通 · AI 员工')).toBeTruthy()
    expect(screen.getByText('食品企业移动端 · 单据与问答')).toBeTruthy()
    const phone = view.container.querySelector('input[inputmode="tel"]') as HTMLInputElement
    const code = view.container.querySelector('input[inputmode="numeric"]') as HTMLInputElement
    const submit = screen.getByRole('button', { name: '登录' }) as HTMLButtonElement
    expect(phone.value).toBe('13800138000')
    expect(submit.disabled).toBe(true)
    fireEvent.change(code, { target: { value: '123456' } })
    expect(submit.disabled).toBe(false)
    fireEvent.change(phone, { target: { value: '' } })
    expect(submit.disabled).toBe(true)
  })

  it('runs the 60-second countdown once and recovers the button at zero', () => {
    vi.useFakeTimers()
    const view = render(<LoginView onLoggedIn={() => {}} />)
    const codeButton = screen.getByRole('button', { name: '获取' })
    fireEvent.click(codeButton)
    expect(screen.getByRole('button', { name: '60s' }).hasAttribute('disabled')).toBe(true)
    act(() => { vi.advanceTimersByTime(61_000) })
    expect(screen.getByRole('button', { name: '获取' }).hasAttribute('disabled')).toBe(false)
    view.unmount()
  })

  it('shows the verify failure, clears it on edit, and logs the identity in', () => {
    const loggedIn = vi.fn()
    const view = render(<LoginView onLoggedIn={loggedIn} />)
    const phone = view.container.querySelector('input[inputmode="tel"]') as HTMLInputElement
    const code = view.container.querySelector('input[inputmode="numeric"]') as HTMLInputElement
    fireEvent.change(code, { target: { value: '12345' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(screen.getByRole('alert').textContent).toContain('6 位数字')
    fireEvent.change(phone, { target: { value: '13900139000' } })
    expect(screen.queryByRole('alert')).toBeNull()
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    expect(loggedIn).toHaveBeenCalledWith(expect.objectContaining({ phone: '13900139000', name: '业务员' }))
    expect(loadIdentityName()).toBe('业务员')
  })
})

function loadIdentityName(): string | undefined {
  const raw = localStorage.getItem('dsh-mobile-auth')
  return raw === null ? undefined : (JSON.parse(raw) as { name?: string }).name
}

describe('mobile app shell', () => {
  it('logs in through the gate onto the two-tab shell from a cold identity', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    render(<App />)
    const code = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
    fireEvent.change(code, { target: { value: '123456' } })
    fireEvent.click(screen.getByRole('button', { name: '登录' }))
    await waitFor(() => { expect(screen.getAllByText('消息').length).toBeGreaterThan(0) })
    expect(localStorage.getItem('dsh-mobile-auth')).toContain('业务员')
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
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ phone: '13800138000', name: '业务员', loggedAt: 1 }))
    render(<App />)
    expect(screen.getAllByText('消息').length).toBeGreaterThan(0)
    navigate('#/me')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => screen.getByRole('button', { name: /退出登录/ }))
    fireEvent.click(screen.getByRole('button', { name: /退出登录/ }))
    await waitFor(() => { expect(screen.getByText('食链通 · AI 员工')).toBeTruthy() })
    expect(localStorage.getItem('dsh-mobile-auth')).toBeNull()
    cleanup()
    render(<App />)
    await waitFor(() => { expect(screen.getByText('食链通 · AI 员工')).toBeTruthy() })
  })

  it('routes the two tabs and redirects the v1 tabs and the retired contacts route', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    const identity = { phone: '13800138000', name: '业务员', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    expect(screen.getByText('NocoBase 业务系统 · AI 员工入口')).toBeTruthy()
    fireEvent.click(screen.getByText('我的'))
    await waitFor(() => { expect(screen.getByText('本月登记')).toBeTruthy() })
    navigate('#/profile')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByText('待审核')).toBeTruthy() })
    navigate('#/contacts')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByPlaceholderText('搜索会话/同事')).toBeTruthy() })
    navigate('#/workbench')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByText('NocoBase 业务系统 · AI 员工入口')).toBeTruthy() })
  })

  it('persists the dark theme through the me-tab switch', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ phone: '13800138000', name: '业务员', loggedAt: 1 }))
    const { container } = render(<App />)
    await waitFor(() => { expect(screen.getAllByText('消息').length).toBeGreaterThan(0) })
    expect(container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('light')
    navigate('#/me')
    fireEvent(window, new HashChangeEvent('hashchange'))
    fireEvent.click(await screen.findByRole('switch', { name: '深色模式' }))
    await waitFor(() => { expect(container.querySelector('.dshm-root')?.getAttribute('data-theme')).toBe('dark') })
    expect(localStorage.getItem('dsh-mobile-theme')).toBe('dark')
  })

  it('renders the chat route under the chats tab', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [] },
      'session.history': EMPTY_HISTORY,
      'nocobase.listMeta': { collections: [] },
    })
    const identity = { phone: '13800138000', name: '业务员', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/chat/session-abc')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByRole('button', { name: '新建会话' })).toBeTruthy() })
    expect(screen.getByText('消息')).toBeTruthy()
    expect(screen.getByText('我的')).toBeTruthy()
  })
})

describe('mobile chats tab', () => {
  it('renders the six-element rows with filters, search, and the unread dot', async () => {
    const now = Date.now()
    stubGateway({
      'agentPreset.list': { presets: [
        { id: 'purchase-assistant', name: '采购助理', description: '采购登记', isDefault: false },
      ] },
      'session.list': { items: [
        { sessionId: 's1', updatedAt: now, running: true, agentPreset: 'purchase-assistant', projections: { values: { title: '采购会话' } } },
        { sessionId: 's2', updatedAt: now - 10_000, blank: true },
      ] },
    })
    render(<MessagesView />)
    await waitFor(() => { expect(screen.getByText('采购会话')).toBeTruthy() })
    expect(screen.getByText('采购登记')).toBeTruthy()
    expect(screen.getAllByText('刚刚').length).toBeGreaterThan(0)
    expect(screen.getByText('处理中')).toBeTruthy()
    expect(screen.getAllByLabelText('有新消息').length).toBeGreaterThan(0)
    // The AI-colleague filter drops the local session.
    fireEvent.click(screen.getByRole('tab', { name: 'AI 同事' }))
    await waitFor(() => { expect(screen.queryByText('新会话')).toBeNull() })
    // Search narrows by title.
    fireEvent.click(screen.getByRole('tab', { name: '全部' }))
    const search = screen.getByPlaceholderText('搜索会话/同事') as HTMLInputElement
    fireEvent.change(search, { target: { value: '采购会话' } })
    expect(screen.getByText('采购会话')).toBeTruthy()
    fireEvent.change(search, { target: { value: '不存在' } })
    await waitFor(() => { expect(screen.getByText('没有匹配的会话：右上角 + 找 AI 同事开聊')).toBeTruthy() })
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
    fireEvent.click(screen.getByRole('tab', { name: '待审核' }))
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
    expect(screen.getByText('供应商登记')).toBeTruthy()
    expect(screen.getByText('质检记录')).toBeTruthy()
    expect(screen.getByText('一句话登记六类业务单据')).toBeTruthy()
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
  it('tolerates a failed ledger read by withholding the metric', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': () => { throw new Error('目录 503') },
    })
    render(
      <ProfileView
        identity={{ phone: '13800138000', name: '业务员', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    await waitFor(() => { expect(screen.getByText('—')).toBeTruthy() })
    expect(screen.getByText('0 条')).toBeTruthy()
  })

  it('opens the data and about dialogs', async () => {
    stubGateway({ 'agentPreset.list': { presets: [] }, 'session.list': { items: [] } })
    render(
      <ProfileView
        identity={{ phone: '13800138000', name: '业务员', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    await waitFor(() => { expect(screen.getByText('本月登记')).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: /会话与缓存/ }))
    fireEvent.click(screen.getByRole('button', { name: /版本 v3\.0/ }))
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
        identity={{ phone: '13800138000', name: '业务员', loggedAt: 1 }}
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
        identity={{ phone: '13800138000', name: '业务员', loggedAt: 1 }}
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
        identity={{ phone: '13800138000', name: '业务员', loggedAt: 1 }}
        dark={false}
        onDarkChange={onDark}
        onLogout={() => {}}
      />,
    )
    expect(screen.getByText('业务员')).toBeTruthy()
    expect(screen.getByText('13800138000 · 演示租户 · 管理员')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('本月登记').textContent).toBe('本月登记') })
    expect(screen.getByText('待审核')).toBeTruthy()
    const toggle = screen.getByRole('switch', { name: '深色模式' })
    fireEvent.click(toggle)
    expect(onDark).toHaveBeenCalledWith(true)
  })

  it('counts this month\'s registered receipts from the durable logs', async () => {
    stubGateway({
      'agentPreset.list': { presets: [] },
      'session.list': { items: [
        { sessionId: 'm1', updatedAt: Date.now(), agentPreset: 'mobile-form-assistant' },
        { sessionId: 'local-1', updatedAt: Date.now() },
      ] },
      'session.history': (payload: Record<string, unknown>) => {
        if (payload.sessionId === 'local-1') throw new Error('窗口 503')
        return { events: [
          { event: assistantMessage(1, '已登记。\n```dsh\n{"v":3,"type":"submit_receipt","draftId":"d_1","form":{"collection":"hub_po_purchase_orders","label":"采购单"},"rowId":"1042","summary":[{"label":"合计金额","value":"¥6,400","kind":"money"}]}\n```') },
        ] }
      },
    })
    render(
      <ProfileView
        identity={{ phone: '13800138000', name: '业务员', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={() => {}}
      />,
    )
    await waitFor(() => { expect(screen.getByText('1 条')).toBeTruthy() })
  })

  it('logs out through the button', () => {
    const onLogout = vi.fn()
    render(
      <ProfileView
        identity={{ phone: '13800138000', name: '业务员', loggedAt: 1 }}
        dark={false}
        onDarkChange={() => {}}
        onLogout={onLogout}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    expect(onLogout).toHaveBeenCalledTimes(1)
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
    expect(screen.getByText('会话加载中…')).toBeTruthy()
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
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('推送通道拒绝') })
    // The empty session renders the welcome card; picking a starter sends it
    // as the user's own first message (01 ④a).
    fireEvent.click(screen.getByRole('button', { name: '登记一条采购单' }))
    await waitFor(() => { expect(prompts).toBe(3) })
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
    fireEvent.click(screen.getByRole('button', { name: '返回' }))
    expect(location.hash).toBe('#/chats')
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
    await screen.findByTestId('review-card')
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
    expect(screen.getByText('AI 同事 · purchase-assistant · 处理中')).toBeTruthy()
    await waitFor(() => { expect(screen.getByText('查询业务记录')).toBeTruthy() })
    expect(screen.getByText('✓')).toBeTruthy()
    expect(screen.getByText('✕')).toBeTruthy()
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
    await waitFor(() => { expect(screen.getByRole('alert').textContent).toContain('取消通道 502') })
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
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ phone: '13800138000', name: '业务员', loggedAt: 1 }))
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

  it('lands a pre-identity login hash on the chats tab', async () => {
    stubGateway(shellRoutes)
    const identity = { phone: '13800138000', name: '业务员', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/login')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByText('NocoBase 业务系统 · AI 员工入口')).toBeTruthy() })
  })

  it('folds the retired contacts hash onto the chats tab', async () => {
    stubGateway(shellRoutes)
    const identity = { phone: '13800138000', name: '业务员', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    navigate('#/contacts')
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => { expect(screen.getByPlaceholderText('搜索会话/同事')).toBeTruthy() })
  })

  it('returns from the me tab to chats through the tab bar', async () => {
    stubGateway(shellRoutes)
    const identity = { phone: '13800138000', name: '业务员', loggedAt: 1 }
    render(<MobileShell identity={identity} dark={false} onDarkChange={() => {}} onLogout={() => {}} />)
    fireEvent.click(screen.getByText('我的'))
    await waitFor(() => { expect(screen.getByText('本月登记')).toBeTruthy() })
    fireEvent.click(screen.getByText('消息'))
    await waitFor(() => { expect(screen.getByText('NocoBase 业务系统 · AI 员工入口')).toBeTruthy() })
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
    render(<Avatar background="#0b5d56" acronym="采购"><span>自定义徽标</span></Avatar>)
    expect(screen.getByText('自定义徽标')).toBeTruthy()
  })
})

const v3AskFence = '```dsh\n{"v":3,"type":"ask_choice","id":"c1","mode":"single","variant":"cards","question":"这笔要登记成什么单据？","options":[{"label":"采购单","value":"hub_po","send":"是采购单，我们从鲜丰买进"},{"label":"出库单","value":"hub_out"}],"allowFreeText":true}\n```'
const v3DraftFence = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_1","revision":1,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"title":"鲜丰采购","fields":[{"name":"quantity","label":"数量","value":null,"tier":"required","widget":"number"},{"name":"order_date","label":"日期","value":"2026-09-21","tier":"derived","rationale":"今天","widget":"date"}]}\n```'
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
    await waitFor(() => { expect(screen.getByTestId('draft-card-v3')).toBeTruthy() })
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

  it('hides the landed card behind the receipt item and swaps the chips', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, `草稿：\n${v3DraftFence}`) },
        { event: userMessage(2, v3ConfirmUserMessage) },
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
  it('renders a field-ask with suggestions and focuses the composer from the free-text entry', async () => {
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
    await waitFor(() => {
      const prompt = calls.find(call => call.url === '/api/session.prompt')
      expect(JSON.stringify(prompt?.payload)).toContain('200 箱')
    })
  })

  it('sends a receipt-phase chip as the user message', async () => {
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [
        { event: assistantMessage(1, `草稿：\n${v3DraftFence}`) },
        { event: userMessage(2, v3ConfirmUserMessage) },
        { event: assistantMessage(3, `已登记。\n${v3ReceiptFence}`) },
      ] },
      'nocobase.listMeta': { collections: [] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    await waitFor(() => { expect(screen.getByRole('button', { name: '再来一单' })).toBeTruthy() })
    fireEvent.click(screen.getByRole('button', { name: '再来一单' }))
    await waitFor(() => {
      const prompt = calls.filter(call => call.url === '/api/session.prompt').pop()
      expect(JSON.stringify(prompt?.payload)).toContain('再来一单')
    })
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
    // First paint carries the colleague identity and its local welcome.
    expect(screen.getByText('AI 同事 · mobile-form-assistant')).toBeTruthy()
    expect(screen.getByText('一句话登记六类业务单据')).toBeTruthy()
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
    const draftWithBlankNumber = '```dsh\n{"v":3,"type":"form_draft","draftId":"d_sys","revision":1,"form":{"collection":"hub_po_purchase_orders","label":"采购单"},"title":"鲜丰采购","fields":[{"name":"quantity","label":"数量","value":"200","tier":"required","widget":"number"},{"name":"order_date","label":"日期","value":"2026-09-21","tier":"derived","rationale":"今天","widget":"date"},{"name":"po_number","label":"单号","value":"","tier":"system","widget":"text"}]}\n```'
    stubGateway({
      'session.list': { items: [] },
      'session.history': { events: [{ event: assistantMessage(1, `草稿：\n${draftWithBlankNumber}`) }] },
      'nocobase.listMeta': { collections: [] },
      'nocobase.list': { rows: [{ po_number: 'PO-2026-0007' }] },
      'session.prompt': {},
    })
    render(<ChatView sessionId="session-12" />)
    const card = await screen.findByTestId('draft-card-v3')
    // The generated number shows in the system tier and the 今天 date snaps to the client calendar.
    await waitFor(() => { expect(card.textContent).toContain('PO-2026-0008') })
    expect(card.textContent).toContain(todayOf())
    fireEvent.click(screen.getByRole('button', { name: '确认写入' }))
    await waitFor(() => {
      const confirm = calls.filter(call => call.url === '/api/session.prompt').pop()
      const text = (confirm?.payload?.['content'] as { text: string }[])?.[0]?.text ?? ''
      const fence = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)) as {
        fields: { name: string; value: string }[]
      }
      const byName = new Map(fence.fields.map(field => [field.name, field.value]))
      expect(byName.get('po_number')).toBe('PO-2026-0008')
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
