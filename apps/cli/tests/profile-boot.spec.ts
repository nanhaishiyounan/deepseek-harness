/** Roster-root assembly for the composed `agent-presets` row. */

import { describe, expect, it } from 'vitest'
import { composePresetRoots } from '../src/profile-boot.ts'

describe('composePresetRoots', () => {
  it('appends only the shipped root when the config names none', () => {
    const roots = composePresetRoots({ default: 'standard' })
    expect(roots).toHaveLength(1)
    expect(roots[0]!.trust).toBe('system')
    expect(roots[0]!.path).toContain('config/agent-presets')
  })

  it('rides configured roots ahead of the shipped one', () => {
    const configured = { path: 'examples/kb-agent/agent-presets', trust: 'user' }
    const roots = composePresetRoots({ default: 'enterprise-data-assistant', roots: [configured] })
    expect(roots).toEqual([configured, { path: roots[1]!.path, trust: 'system' }])
    expect(roots[0]).toBe(configured)
    expect(roots[1]!.path).toContain('config/agent-presets')
  })

  it('treats a non-array roots cell as absent rather than throwing', () => {
    const roots = composePresetRoots({ roots: 'examples/kb-agent/agent-presets' })
    expect(roots).toHaveLength(1)
    expect(roots[0]!.trust).toBe('system')
  })
})
