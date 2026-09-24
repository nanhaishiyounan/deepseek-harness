// @vitest-environment jsdom
/** parseRoute: the nine mobile v5 hash routes and the v1/v2 legacy redirects. */

import { describe, expect, it, vi } from 'vitest'
import { goBackOr, parseRoute } from '../src/client/router.ts'

describe('parseRoute', () => {
  it('routes the four tabs and the five secondary heads', () => {
    expect(parseRoute('#/').name).toBe('home')
    expect(parseRoute('#/chats').name).toBe('chats')
    expect(parseRoute('#/work').name).toBe('work')
    expect(parseRoute('#/me').name).toBe('me')
    expect(parseRoute('#/tasks').name).toBe('tasks')
    expect(parseRoute('#/files').name).toBe('files')
    expect(parseRoute('#/agents').name).toBe('agents')
    expect(parseRoute('#/login').name).toBe('login')
  })

  it('lands the default route on home for the empty hash and unknown heads', () => {
    expect(parseRoute('').name).toBe('home')
    expect(parseRoute('#').name).toBe('home')
    expect(parseRoute('#/unknown').name).toBe('home')
    expect(parseRoute('#/nowhere?seed=1').query.get('seed')).toBe('1')
  })

  it('carries the chat and work params isomorphically', () => {
    const chat = parseRoute('#/chat/session-abc')
    expect(chat.name).toBe('chat')
    expect(chat.param).toBe('session-abc')
    const work = parseRoute('#/work/w_item9')
    expect(work.name).toBe('work')
    expect(work.param).toBe('w_item9')
    const chatless = parseRoute('#/chat')
    expect(chatless.name).toBe('chats')
    expect(chatless.param).toBeUndefined()
    const workless = parseRoute('#/work')
    expect(workless.name).toBe('work')
    expect(workless.param).toBeUndefined()
  })

  it('keeps the query string on every route shape', () => {
    const query = parseRoute('#/me?tab=settings')
    expect(query.name).toBe('me')
    expect(query.query.get('tab')).toBe('settings')
    const workQuery = parseRoute('#/work/w_1?from=report')
    expect(workQuery.param).toBe('w_1')
    expect(workQuery.query.get('from')).toBe('report')
  })

  it('folds the v1/v2 route heads onto the v5 pages by meaning', () => {
    expect(parseRoute('#/messages').name).toBe('chats')
    expect(parseRoute('#/workbench').name).toBe('work')
    expect(parseRoute('#/data?seed=%E5%AE%8F%E5%8F%91%E9%A3%9F%E5%93%81').name).toBe('chats')
    expect(parseRoute('#/kg').name).toBe('chats')
    expect(parseRoute('#/contacts').name).toBe('agents')
    expect(parseRoute('#/profile').name).toBe('me')
  })

  it('keeps the v3 heads themselves valid', () => {
    expect(parseRoute('#/chats').name).toBe('chats')
    expect(parseRoute('#/chat/abc').name).toBe('chat')
    expect(parseRoute('#/me').name).toBe('me')
    expect(parseRoute('#/login').name).toBe('login')
  })
})

describe('goBackOr', () => {
  it('rides natural history when the session stack has entries', () => {
    const realBack = history.back.bind(history)
    const lengthGetter = Object.getOwnPropertyDescriptor(window.history, 'length')
    const back = vi.fn()
    history.back = back
    Object.defineProperty(window.history, 'length', { get: () => 2, configurable: true })
    try {
      goBackOr('#/work')
      expect(back).toHaveBeenCalled()
    } finally {
      history.back = realBack
      if (lengthGetter !== undefined) Object.defineProperty(window.history, 'length', lengthGetter)
    }
  })

  it('falls back to the domain tab with an empty session stack', () => {
    const lengthGetter = Object.getOwnPropertyDescriptor(window.history, 'length')
    Object.defineProperty(window.history, 'length', { get: () => 1, configurable: true })
    try {
      location.hash = ''
      goBackOr('#/work')
      expect(location.hash).toBe('#/work')
    } finally {
      if (lengthGetter !== undefined) Object.defineProperty(window.history, 'length', lengthGetter)
    }
  })
})
