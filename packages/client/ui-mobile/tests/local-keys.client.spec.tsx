// @vitest-environment jsdom
/**
 * The logout key sweep (W11-R2): the shared prefix list is the single source
 * every session-scoped dsh-mobile key family registers in; the sweep clears
 * exactly those keys (drafts, the outbox, attachment strips) while every
 * other dsh-mobile key survives, and the App's logout path wires it after
 * the identity drops — a departed account's parked data never leaks into
 * the next login. The logout leaves one session-keys.swept trace (W11-R3):
 * a single console.info line in the outbox store's observation format.
 */

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../src/client/App.tsx'
import { MOBILE_SESSION_KEY_PREFIXES, sweepSessionKeys } from '../src/client/localKeys.ts'

beforeEach(() => { localStorage.clear() })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('sweepSessionKeys (the shared prefix source)', () => {
  it('exposes the three session key families', () => {
    expect(MOBILE_SESSION_KEY_PREFIXES).toEqual(['dsh-mobile-draft', 'dsh-mobile-outbox', 'dsh-mobile-attachments'])
  })

  it('clears all twelve session keys in one sweep and leaves five unrelated keys byte-identical', () => {
    const doomed = [
      'dsh-mobile-draft-s1-a', 'dsh-mobile-draft-s1-b', 'dsh-mobile-draft-s2-c', 'dsh-mobile-draft-s3-d',
      'dsh-mobile-outbox', 'dsh-mobile-outbox-k1', 'dsh-mobile-outbox-k2', 'dsh-mobile-outbox-k3',
      'dsh-mobile-attachments-s1', 'dsh-mobile-attachments-s2', 'dsh-mobile-attachments-s3', 'dsh-mobile-attachments-s4',
    ]
    for (const key of doomed) localStorage.setItem(key, 'x')
    const keep = new Map<string, string>([
      ['dsh-mobile-theme', '{"mode":"dark","density":3}'],
      ['dsh-mobile-read', 'seq:42,偏移+8'],
      ['dsh-mobile-pins', '[1,2,3]'],
      ['dsh-mobile-auth', '{"token":"tok ✓"}'],
      ['dsh-mobile-work', '{"cells":{"a":"行1\n行2"}}'],
    ])
    for (const [key, value] of keep) localStorage.setItem(key, value)
    const removed = sweepSessionKeys()
    expect([...removed].sort()).toEqual([...doomed].sort())
    for (const key of doomed) expect(localStorage.getItem(key)).toBeNull()
    // The unrelated keys survive byte-identical (W11-R5): the sweep deletes
    // only the doomed set and never rewrites what it keeps.
    for (const [key, value] of keep) expect(localStorage.getItem(key)).toBe(value)
  })

  it('keeps every other dsh-mobile key (theme, watermarks, marks, pins, auth, work)', () => {
    const keep = ['dsh-mobile-theme', 'dsh-mobile-read', 'dsh-mobile-pending', 'dsh-mobile-pins', 'dsh-mobile-auth', 'dsh-mobile-work']
    for (const key of keep) localStorage.setItem(key, 'x')
    localStorage.setItem('dsh-mobile-draft-gone', 'x')
    expect(sweepSessionKeys()).toEqual(['dsh-mobile-draft-gone'])
    for (const key of keep) expect(localStorage.getItem(key)).toBe('x')
  })
})

describe('the App logout path', () => {
  /** The gateway stub the shell needs to mount. */
  function stubShellGateway(): void {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const body = JSON.parse((init?.body ?? '{}') as string) as { rpcId?: string }
      const method = url.replace('/api/', '')
      const value = method === 'agentPreset.list'
        ? { presets: [] }
        : method === 'session.list' || method === 'session.search'
          ? { items: [] }
          : method === 'session.history'
            ? { events: [] }
            : method === 'nocobase.listMeta'
              ? { collections: [] }
              : {}
      return new Response(JSON.stringify({ rpcId: body.rpcId, result: { ok: true, value } }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
  }

  it('drops the seeded session keys on logout and keeps the unrelated ones', async () => {
    stubShellGateway()
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-v', loggedAt: 1 }))
    localStorage.setItem('dsh-mobile-draft-s9-1', '{}')
    localStorage.setItem('dsh-mobile-attachments-s9', '{}')
    localStorage.setItem('dsh-mobile-theme', 'dark')
    render(<App />)
    expect(screen.getAllByText(/今日台账|待处理/).length).toBeGreaterThan(0)
    location.hash = '#/me'
    fireEvent(window, new HashChangeEvent('hashchange'))
    await waitFor(() => screen.getByRole('button', { name: /退出登录/ }))
    fireEvent.click(screen.getByRole('button', { name: /退出登录/ }))
    // Logout confirms first; the dialog's destructive button performs it.
    await waitFor(() => screen.getByRole('button', { name: '退出' }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    fireEvent.click(screen.getByRole('button', { name: '退出' }))
    await waitFor(() => {
      expect(localStorage.getItem('dsh-mobile-draft-s9-1')).toBeNull()
      expect(localStorage.getItem('dsh-mobile-attachments-s9')).toBeNull()
    })
    // The sweep leaves exactly one trace (W11-R3): type, count, and the
    // removed-key list in one console.info JSON line.
    const swept = info.mock.calls.map(call => String(call[0])).filter(text => text.includes('session-keys.swept'))
    expect(swept).toHaveLength(1)
    const trace = JSON.parse(swept[0]!) as { type: string; count: number; keys: string[] }
    expect(trace.type).toBe('session-keys.swept')
    expect(trace.count).toBe(trace.keys.length)
    expect(trace.keys).toContain('dsh-mobile-draft-s9-1')
    expect(trace.keys).toContain('dsh-mobile-attachments-s9')
    expect(localStorage.getItem('dsh-mobile-auth')).toBeNull()
    expect(localStorage.getItem('dsh-mobile-theme')).toBe('dark')
    await waitFor(() => { expect(screen.getByText('食链通 · AI 员工')).toBeTruthy() })
  })
})
