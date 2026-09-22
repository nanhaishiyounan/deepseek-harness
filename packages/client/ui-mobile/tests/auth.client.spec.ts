// @vitest-environment jsdom
/** Demo-grade local auth: the identity record and the mock code seam. */

import { beforeEach, describe, expect, it } from 'vitest'
import { clearIdentity, loadIdentity, saveIdentity, verifyCode } from '../src/client/auth.ts'

describe('mobile demo auth', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips the identity and clears it', () => {
    expect(loadIdentity()).toBeUndefined()
    saveIdentity({ phone: '13800138000', name: '业务员', loggedAt: 42 })
    expect(loadIdentity()).toEqual({ phone: '13800138000', name: '业务员', loggedAt: 42 })
    clearIdentity()
    expect(loadIdentity()).toBeUndefined()
  })

  it('rejects malformed stored records instead of trusting them', () => {
    localStorage.setItem('dsh-mobile-auth', 'not json')
    expect(loadIdentity()).toBeUndefined()
    localStorage.setItem('dsh-mobile-auth', '{"phone":1}')
    expect(loadIdentity()).toBeUndefined()
  })

  it('accepts any six-digit code and refuses other shapes', () => {
    const identity = verifyCode('13800138000', '123456')
    expect(identity.phone).toBe('13800138000')
    expect(identity.name).toBe('业务员')
    expect(typeof identity.loggedAt).toBe('number')
    expect(() => verifyCode('13800138000', '12345')).toThrow(/6 位数字/)
    expect(() => verifyCode('13800138000', 'abcdef')).toThrow(/6 位数字/)
  })
})
