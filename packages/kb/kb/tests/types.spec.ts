import { describe, expect, it } from 'vitest'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { KB_DOC_KINDS, KbError } from '@deepseek-ai/dsh-kb'

describe('KB_DOC_KINDS', () => {
  it('lists the closed document-kind union', () => {
    expect(KB_DOC_KINDS).toEqual([
      'meeting',
      'interview',
      'report',
      'regulation',
      'profile',
      'table',
      'other',
    ])
  })
})

describe('KbError', () => {
  it('carries a machine-routable code and chained cause', () => {
    const cause = new Error('upstream')
    const error = new KbError('store is gone', 'KB_STORE_UNAVAILABLE', { cause })
    expect(error).toBeInstanceOf(HarnessError)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('store is gone')
    expect(error.code).toBe('KB_STORE_UNAVAILABLE')
    expect(error.cause).toBe(cause)
    expect(error.name).toBe('KbError')
  })
})
