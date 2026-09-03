import { describe, expect, it, vi } from 'vitest'
import {
  assertBackoffOrdered,
  backoff,
  backoffDelay,
  DEFAULT_BACKOFF_BASE_MS,
  DEFAULT_BACKOFF_MAX_MS,
  HttpEmbedError,
  isRetryable,
  withEmbedRetries,
} from '../src/index.ts'

/** Retry options with a 1 ms base so retry tests stay fast. */
const fastOptions = {
  maxRetries: 2,
  backoffBaseMs: 1,
  backoffMaxMs: 2,
} as const

describe('kb-embed-shared constants', () => {
  it('exposes the documented backoff defaults', () => {
    expect(DEFAULT_BACKOFF_BASE_MS).toBe(100)
    expect(DEFAULT_BACKOFF_MAX_MS).toBe(2_147_483_647)
  })
})

describe('HttpEmbedError', () => {
  it('carries the HTTP status beside the message', () => {
    const error = new HttpEmbedError('request failed', 429)
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('request failed')
    expect(error.status).toBe(429)
    expect(error.name).toBe('HttpEmbedError')
  })
})

describe('isRetryable', () => {
  it('retries HTTP 429 and 5xx statuses', () => {
    expect(isRetryable(undefined, 429)).toBe(true)
    expect(isRetryable(undefined, 500)).toBe(true)
    expect(isRetryable(undefined, 503)).toBe(true)
  })

  it('does not retry other HTTP statuses', () => {
    expect(isRetryable(undefined, 200)).toBe(false)
    expect(isRetryable(undefined, 401)).toBe(false)
    expect(isRetryable(undefined, 404)).toBe(false)
  })

  it('retries only network-level rejections when no status is present', () => {
    expect(isRetryable(new TypeError('fetch failed'))).toBe(true)
    expect(isRetryable(new Error('decode failed'))).toBe(false)
    expect(isRetryable('string failure')).toBe(false)
  })
})

describe('assertBackoffOrdered', () => {
  it('accepts an ordered window, including a degenerate single-value one', () => {
    expect(() => { assertBackoffOrdered(100, 500) }).not.toThrow()
    expect(() => { assertBackoffOrdered(500, 500) }).not.toThrow()
  })

  it('fails loud with both values when the window is inverted', () => {
    expect(() => { assertBackoffOrdered(1000, 500) }).toThrow(
      /\[kb-embed\] backoffBaseMs \(1000\) must be less than or equal to backoffMaxMs \(500\)/u,
    )
  })
})

describe('backoffDelay', () => {
  it('applies a uniform 50–100% jitter to the exponential delay', () => {
    const random = vi.spyOn(Math, 'random')
    try {
      random.mockReturnValue(0)
      expect(backoffDelay(0, 100, 10_000)).toBe(50)
      random.mockReturnValue(0.5)
      expect(backoffDelay(0, 100, 10_000)).toBe(75)
      random.mockReturnValue(1)
      expect(backoffDelay(0, 100, 10_000)).toBe(100)
    } finally {
      random.mockRestore()
    }
  })

  it('doubles the base per attempt and caps the exponential delay at maxMs', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(1)
    try {
      expect(backoffDelay(3, 100, 10_000)).toBe(800)
      expect(backoffDelay(5, 100, 250)).toBe(250)
    } finally {
      random.mockRestore()
    }
  })
})

describe('backoff', () => {
  it('resolves after one delay slot', async () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0)
    try {
      const controller = new AbortController()
      await expect(backoff(0, controller.signal, 1, 2)).resolves.toBeUndefined()
    } finally {
      random.mockRestore()
    }
  })

  it('rejects with the Error abort reason and stops the timer', async () => {
    const controller = new AbortController()
    const pending = backoff(0, controller.signal, 10_000, 20_000)
    controller.abort(new Error('caller cancelled'))
    await expect(pending).rejects.toThrow('caller cancelled')
  })

  it('wraps a bare abort reason as an Error with the reason as cause', async () => {
    const controller = new AbortController()
    const pending = backoff(0, controller.signal, 10_000, 20_000)
    controller.abort('bare-string-reason')
    const failure = await pending.then(() => undefined, (error: unknown) => error) as Error
    expect(failure).toBeInstanceOf(Error)
    expect(failure.message).toBe('the operation was aborted')
    expect(failure.cause).toBe('bare-string-reason')
  })
})

describe('withEmbedRetries', () => {
  it('returns the first successful attempt without diagnostics', async () => {
    const debug: string[] = []
    let calls = 0
    const result = await withEmbedRetries(
      async () => { calls += 1; return 'vectors' },
      { ...fastOptions, debug: (message) => { debug.push(message) } },
      undefined,
      'kb-embed-test',
    )
    expect(result).toBe('vectors')
    expect(calls).toBe(1)
    expect(debug).toEqual([])
  })

  it('retries an HTTP 429 and logs the labeled attempt diagnostic', async () => {
    const debug: string[] = []
    let calls = 0
    const result = await withEmbedRetries(
      async () => {
        calls += 1
        if (calls === 1) throw new HttpEmbedError('rate limited', 429)
        return 42
      },
      { ...fastOptions, debug: (message) => { debug.push(message) } },
      undefined,
      'kb-embed-test',
    )
    expect(result).toBe(42)
    expect(calls).toBe(2)
    expect(debug).toEqual(['kb-embed-test: embeddings attempt 1 failed (HTTP 429); retrying after backoff'])
  })

  it('retries a network-level rejection and names the error class', async () => {
    const debug: string[] = []
    let calls = 0
    await withEmbedRetries(
      async () => {
        calls += 1
        if (calls === 1) throw new TypeError('fetch failed')
        return 1
      },
      { ...fastOptions, debug: (message) => { debug.push(message) } },
      undefined,
      'kb-embed-test',
    )
    expect(calls).toBe(2)
    expect(debug[0]).toContain('attempt 1 failed (TypeError')
  })

  it('retries without a debug sink', async () => {
    let calls = 0
    const result = await withEmbedRetries(
      async () => {
        calls += 1
        if (calls === 1) throw new HttpEmbedError('server error', 500)
        return 'ok'
      },
      fastOptions,
      undefined,
      'kb-embed-test',
    )
    expect(result).toBe('ok')
    expect(calls).toBe(2)
  })

  it('fails loud after exhausting the retry budget', async () => {
    let calls = 0
    await expect(withEmbedRetries(
      async () => {
        calls += 1
        throw new HttpEmbedError('persistent failure', 500)
      },
      { ...fastOptions, maxRetries: 1 },
      undefined,
      'kb-embed-test',
    )).rejects.toThrow(/persistent failure/u)
    expect(calls).toBe(2)
  })

  it('does not retry a deterministic HTTP failure', async () => {
    let calls = 0
    await expect(withEmbedRetries(
      async () => {
        calls += 1
        throw new HttpEmbedError('login fail', 401)
      },
      fastOptions,
      undefined,
      'kb-embed-test',
    )).rejects.toThrow(/login fail/u)
    expect(calls).toBe(1)
  })

  it('stops retrying when the caller signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('caller cancelled'))
    let calls = 0
    await expect(withEmbedRetries(
      async () => {
        calls += 1
        throw new HttpEmbedError('rate limited', 429)
      },
      fastOptions,
      controller.signal,
      'kb-embed-test',
    )).rejects.toThrow(/rate limited/u)
    expect(calls).toBe(1)
  })
})
