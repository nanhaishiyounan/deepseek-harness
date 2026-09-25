// @vitest-environment jsdom
/** The shell portal host: body fallback before mount, handoff, and release. */

import { afterEach, describe, expect, it } from 'vitest'
import { portalContainer, setPortalHost } from '../src/client/portal.ts'

describe('portal host', () => {
  afterEach(() => {
    setPortalHost(null)
  })

  it('falls back to document.body before the shell mounts its host', () => {
    expect(portalContainer()).toBe(document.body)
  })

  it('returns the recorded host node and releases it on null', () => {
    const host = document.createElement('div')
    setPortalHost(host)
    expect(portalContainer()).toBe(host)
    setPortalHost(null)
    expect(portalContainer()).toBe(document.body)
  })
})
