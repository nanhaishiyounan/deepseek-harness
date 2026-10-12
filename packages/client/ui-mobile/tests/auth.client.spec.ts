// @vitest-environment jsdom
/** The local identity record (免身份直进): default fallback, persistence round-trip, and malformed-record refusal. */

import { beforeEach, describe, expect, it } from 'vitest'
import { clearIdentity, loadIdentity, saveIdentity } from '../src/client/auth.ts'

const VISITOR = { username: 'visitor', nickname: '移动访客', loggedAt: 0 }

describe('mobile local identity', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('answers the visitor default and round-trips a saved identity', () => {
    expect(loadIdentity()).toEqual(VISITOR)
    saveIdentity({ username: 'buyer', nickname: '采购员·蔡俊', loggedAt: 42 })
    expect(loadIdentity()).toEqual({ username: 'buyer', nickname: '采购员·蔡俊', loggedAt: 42 })
    clearIdentity()
    expect(loadIdentity()).toEqual(VISITOR)
  })

  it('rejects malformed stored records back to the visitor default', () => {
    localStorage.setItem('dsh-mobile-auth', 'not json')
    expect(loadIdentity()).toEqual(VISITOR)
    localStorage.setItem('dsh-mobile-auth', '{"username":1}')
    expect(loadIdentity()).toEqual(VISITOR)
    localStorage.setItem('dsh-mobile-auth', '{"username":"buyer","nickname":"","loggedAt":1}')
    expect(loadIdentity()).toEqual(VISITOR)
  })

  it('reads the retired shapes (phone+code demo, token-bearing login) by their nickname columns', () => {
    // A token-bearing record from the retired login keeps its nickname.
    localStorage.setItem('dsh-mobile-auth', '{"username":"buyer","nickname":"采购员·蔡俊","token":"tok","loggedAt":1}')
    expect(loadIdentity()).toEqual({ username: 'buyer', nickname: '采购员·蔡俊', loggedAt: 1 })
    // The retired phone+code demo shape has no identity columns: visitor.
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ phone: '13800138000', name: '业务员', loggedAt: 1 }))
    expect(loadIdentity()).toEqual(VISITOR)
  })
})
