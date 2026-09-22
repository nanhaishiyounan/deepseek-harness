// @vitest-environment jsdom
// The overview portal's pinned-scenario set: catalog filtering and the
// six-slot cap on read, the memory fallback for corrupted or absent storage,
// and the pin/unpin ordering (front insertion, re-pin moving to the front).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KB_SCENARIOS } from '../src/client/hero/scenarios.ts'
import { PINNED_SCENARIO_LIMIT, pinnedScenarios, setScenarioPinned } from '../src/client/hero/pinnedScenarios.ts'

/** The persisted store's key. */
const KEY = 'dsh-kb-pinned-scenarios'

// The pin set keeps a module-level in-memory fallback, so each test re-seeds
// storage with an empty array instead of clearing it: a cleared store would
// fall through to the previous test's memory residue.
beforeEach(() => { localStorage.setItem(KEY, '[]') })
afterEach(() => { vi.unstubAllGlobals() })

describe('pinned scenario set', () => {
  it('drops ids the catalog no longer knows and caps the rail at six', () => {
    const known = KB_SCENARIOS.slice(0, PINNED_SCENARIO_LIMIT + 1).map(scenario => scenario.id)
    localStorage.setItem(KEY, JSON.stringify(['ghost-scenario', ...known]))
    expect(pinnedScenarios()).toEqual(known.slice(0, PINNED_SCENARIO_LIMIT))
  })

  it('falls back to the in-memory copy for corrupt or mistyped storage', () => {
    setScenarioPinned(KB_SCENARIOS[0]!.id, true)
    localStorage.setItem(KEY, '{not json')
    expect(pinnedScenarios()).toEqual([KB_SCENARIOS[0]!.id])
    localStorage.setItem(KEY, JSON.stringify([KB_SCENARIOS[0]!.id, 7]))
    expect(pinnedScenarios()).toEqual([KB_SCENARIOS[0]!.id])
  })

  it('serves the session from memory when localStorage is unavailable', () => {
    setScenarioPinned(KB_SCENARIOS[0]!.id, true)
    // Bindings gone (private mode / storage disabled): reads fall back to the
    // in-memory set and writes skip persistence instead of throwing.
    vi.stubGlobal('localStorage', undefined)
    expect(pinnedScenarios()).toEqual([KB_SCENARIOS[0]!.id])
    expect(setScenarioPinned(KB_SCENARIOS[1]!.id, true))
      .toEqual([KB_SCENARIOS[1]!.id, KB_SCENARIOS[0]!.id])
    expect(typeof localStorage === 'undefined').toBe(true)
  })

  it('pins to the front, re-pins by moving, unpins, and caps the set', () => {
    const ids = KB_SCENARIOS.map(scenario => scenario.id)
    expect(setScenarioPinned(ids[0]!, true)).toEqual([ids[0]!])
    expect(setScenarioPinned(ids[1]!, true)).toEqual([ids[1]!, ids[0]!])
    // A repeated pin moves the id to the front instead of duplicating it.
    expect(setScenarioPinned(ids[0]!, true)).toEqual([ids[0]!, ids[1]!])
    // The rail keeps only the newest six of eight pinned scenarios.
    for (const id of ids.slice(2, 8)) setScenarioPinned(id, true)
    expect(pinnedScenarios()).toEqual([...ids.slice(2, 8)].reverse())
    expect(pinnedScenarios()).toHaveLength(PINNED_SCENARIO_LIMIT)
    expect(setScenarioPinned(ids[4]!, false)).toEqual([ids[7]!, ids[6]!, ids[5]!, ids[3]!, ids[2]!])
  })
})
