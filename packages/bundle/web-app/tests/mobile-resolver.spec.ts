/**
 * The mobile-index resolver's two arms over an injected module-resolution
 * seam: the built mobile.html answer and the loud not-built failure. The
 * resolver reads the real frontend dist, which the unit lane never builds,
 * so the resolution itself is the mocked boundary.
 */

import { describe, expect, it, vi } from 'vitest'

const resolution = vi.hoisted(() => ({ fail: false }))

vi.mock('node:module', async (importOriginal) => {
  const load = await importOriginal<typeof import('node:module')>()
  const mock: typeof import('node:module') = {
    createRequire: (url: unknown): { resolve: (id: string) => string } => {
      const real = load.createRequire(url as never) as { resolve: (id: string) => string }
      return {
        resolve: (id: string): string => {
          if (id === '@deepseek-ai/dsh-web-frontend/dist/mobile.html') {
            if (resolution.fail) throw new Error('Cannot find module')
            return '/resolved/dist/mobile.html'
          }
          return real.resolve(id)
        },
      }
    },
  } as typeof import('node:module')
  void mock
  return mock
})

describe('resolveMobileIndex', () => {
  it('answers the built mobile document path', async () => {
    const { internals } = await import('../src/index.ts')
    expect(internals.resolveMobileIndex()).toBe('/resolved/dist/mobile.html')
  })

  it('fails loud with the build instruction when resolution misses', async () => {
    const { internals } = await import('../src/index.ts')
    resolution.fail = true
    try {
      expect(() => internals.resolveMobileIndex()).toThrow('frontend mobile page not built')
    } finally {
      resolution.fail = false
    }
  })
})
