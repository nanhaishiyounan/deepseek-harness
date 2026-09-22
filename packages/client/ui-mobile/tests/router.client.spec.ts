// @vitest-environment jsdom
/** parseRoute: the mobile v3 hash routes and the v1/v2 legacy redirects. */

import { describe, expect, it } from 'vitest'
import { parseRoute } from '../src/client/router.ts'

describe('parseRoute', () => {
  it('routes the two tabs and the default landing', () => {
    expect(parseRoute('#/chats').name).toBe('chats')
    expect(parseRoute('#/me').name).toBe('me')
    expect(parseRoute('#/login').name).toBe('login')
    expect(parseRoute('').name).toBe('chats')
    expect(parseRoute('#/unknown').name).toBe('chats')
  })

  it('carries the chat param and the query string', () => {
    const chat = parseRoute('#/chat/session-abc')
    expect(chat.name).toBe('chat')
    expect(chat.param).toBe('session-abc')
    const query = parseRoute('#/me?tab=settings')
    expect(query.name).toBe('me')
    expect(query.query.get('tab')).toBe('settings')
    const paramless = parseRoute('#/chat')
    expect(paramless.name).toBe('chat')
    expect(paramless.param).toBeUndefined()
  })

  it('redirects the v1 route heads and the retired contacts route onto the v3 tabs', () => {
    expect(parseRoute('#/messages').name).toBe('chats')
    expect(parseRoute('#/workbench').name).toBe('chats')
    expect(parseRoute('#/data?seed=%E5%AE%8F%E5%8F%91%E9%A3%9F%E5%93%81').name).toBe('chats')
    expect(parseRoute('#/kg').name).toBe('chats')
    expect(parseRoute('#/contacts').name).toBe('chats')
    expect(parseRoute('#/profile').name).toBe('me')
  })
})
