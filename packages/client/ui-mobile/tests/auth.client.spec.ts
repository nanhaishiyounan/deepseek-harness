// @vitest-environment jsdom
/** The real-account auth record: persistence round-trip, malformed-record refusal, and demo-shape invalidation. */

import { beforeEach, describe, expect, it } from 'vitest'
import { clearIdentity, loadIdentity, saveIdentity } from '../src/client/auth.ts'

describe('mobile real-account auth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the identity and clears it', () => {
    expect(loadIdentity()).toBeUndefined()
    saveIdentity({ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-1', loggedAt: 42 })
    expect(loadIdentity()).toEqual({ username: 'buyer', nickname: '采购员·蔡俊', token: 'tok-1', loggedAt: 42 })
    clearIdentity()
    expect(loadIdentity()).toBeUndefined()
  })

  it('rejects malformed stored records instead of trusting them', () => {
    localStorage.setItem('dsh-mobile-auth', 'not json')
    expect(loadIdentity()).toBeUndefined()
    localStorage.setItem('dsh-mobile-auth', '{"username":1}')
    expect(loadIdentity()).toBeUndefined()
    // A pre-credential identity (no token) reads as logged out: re-login.
    localStorage.setItem('dsh-mobile-auth', '{"username":"buyer","nickname":"采购员·蔡俊","loggedAt":1}')
    expect(loadIdentity()).toBeUndefined()
    localStorage.setItem('dsh-mobile-auth', '{"username":"buyer","nickname":"","token":"tok","loggedAt":1}')
    expect(loadIdentity()).toBeUndefined()
  })

  it('reads the retired phone+code demo shape as logged out', () => {
    localStorage.setItem('dsh-mobile-auth', JSON.stringify({ phone: '13800138000', name: '业务员', loggedAt: 1 }))
    expect(loadIdentity()).toBeUndefined()
  })
})
