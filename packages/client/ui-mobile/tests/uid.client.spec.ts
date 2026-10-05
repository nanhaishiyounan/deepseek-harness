/**
 * The secure-context id fallback (W11-R1): the LAN HTTP deployment serves the
 * mobile page without HTTPS, where `crypto.randomUUID` is undefined and the
 * bare calls (attachment row ids, wire rpcIds) would throw — the camera,
 * album, file, and login lanes all die silently. `uid()` prefers the API and
 * falls back to 16 random bytes in hex, which is all these ids need: opaque
 * uniqueness, no format contract with the server.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { uid } from '../src/client/uid.ts'

const originalRandomUUID = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID')

/** Remove the secure-context-only API the way a plain-HTTP origin sees it. */
function dropRandomUUID(): void {
  Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true })
}

afterEach(() => {
  if (originalRandomUUID === undefined) Reflect.deleteProperty(globalThis.crypto, 'randomUUID')
  else Object.defineProperty(globalThis.crypto, 'randomUUID', originalRandomUUID)
})

describe('uid — the secure-context fallback', () => {
  it('rides crypto.randomUUID when the secure context provides it', () => {
    expect(uid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('falls back to a 16-byte hex string when randomUUID is undefined (LAN HTTP)', () => {
    dropRandomUUID()
    expect(globalThis.crypto.randomUUID).toBeUndefined()
    const first = uid()
    expect(first).toMatch(/^[0-9a-f]{32}$/)
    expect(uid()).not.toBe(first)
  })
})
