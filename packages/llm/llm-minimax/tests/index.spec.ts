import { describe, expect, it } from 'vitest'
import { createLaunchEnvironmentSnapshot } from '@deepseek-ai/dsh-launch-environment'
import { resolveRetryPolicy } from '@deepseek-ai/dsh-llm'
import * as LlmMiniMax from '../src/index.ts'
import { resolveAdapterOptions } from '../src/index.ts'

describe('llm-minimax Config defaults', () => {
  it('fills every default through schemastery', () => {
    const resolved = LlmMiniMax.Config({})
    expect(resolved.apiKeyEnv).toBe('MINIMAX_API_KEY')
    expect(resolved.baseURL).toBeUndefined() // the env fallback chain owns the default
    expect(resolved.maxTokens).toBe(32_768)
    expect(resolved.defaultContextWindow).toBe(200_000)
    expect(resolved.models).toEqual([{ id: 'MiniMax-M3', name: 'MiniMax-M3' }])
    expect(resolved.streamIdleTimeoutMs).toBe(300_000)
  })
})

describe('resolveAdapterOptions', () => {
  const environment = (vars: Record<string, string>) =>
    createLaunchEnvironmentSnapshot([{ source: 'process', values: vars }])

  it('prefers an explicit baseURL, then the environment, then the public endpoint', () => {
    expect(resolveAdapterOptions({ baseURL: 'http://explicit' }).baseURL).toBe('http://explicit')
    expect(resolveAdapterOptions({}, environment({ MINIMAX_BASE_URL: 'http://env' })).baseURL).toBe('http://env')
    expect(resolveAdapterOptions({}).baseURL).toBe('https://api.minimaxi.com/v1')
  })

  it('rejects non-positive numeric fields', () => {
    expect(() => resolveAdapterOptions({ maxTokens: 0 })).toThrow(/maxTokens/u)
    expect(() => resolveAdapterOptions({ defaultContextWindow: 0 })).toThrow(/defaultContextWindow/u)
    expect(() => resolveAdapterOptions({ streamIdleTimeoutMs: -1 })).toThrow(/streamIdleTimeoutMs/u)
  })

  it('rejects an empty catalog model id and duplicates', () => {
    expect(() => resolveAdapterOptions({ models: [{ id: '' }] })).toThrow(/model/u)
    expect(() => resolveAdapterOptions({ models: [{ id: 'a' }, { id: 'a' }] })).toThrow(/duplicate/u)
  })

  it('resolves the retry policy and carries the credential reference', () => {
    const resolved = resolveAdapterOptions({ retryPolicy: { mode: 'normal', maxRetries: 2 } })
    expect(resolved.retryPolicy).toEqual(resolveRetryPolicy({ mode: 'normal', maxRetries: 2 }, 'llm-minimax'))
    expect(String(resolved.apiKeyEnv)).toBe('MINIMAX_API_KEY')
  })
})
