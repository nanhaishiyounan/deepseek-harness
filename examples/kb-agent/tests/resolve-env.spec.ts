/**
 * resolveEnv keyless semantics: a variable that exists neither in the
 * environment nor in the repo root `.env` resolves `undefined` — the value
 * the demo and e2e entry points gate their credential self-skip paths on —
 * while a set process.env entry resolves directly without the `.env`
 * fallback. The synthetic variable name exists in no committed `.env`, so
 * the specs stay deterministic on every machine.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { resolveEnv } from '../scripts/resolve-env.ts'

afterEach(() => {
  delete process.env['DSH_RESOLVE_ENV_SPEC_KEY']
})

describe('resolveEnv keyless semantics', () => {
  it('resolves undefined for a variable absent everywhere — the self-skip value', () => {
    delete process.env['DSH_RESOLVE_ENV_SPEC_KEY']
    expect(resolveEnv('DSH_RESOLVE_ENV_SPEC_KEY')).toBeUndefined()
  })

  it('resolves the process.env value when set', () => {
    process.env['DSH_RESOLVE_ENV_SPEC_KEY'] = 'direct-value'
    expect(resolveEnv('DSH_RESOLVE_ENV_SPEC_KEY')).toBe('direct-value')
  })
})
