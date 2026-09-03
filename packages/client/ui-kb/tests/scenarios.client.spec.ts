// The static scenario catalog: thirty scenarios across eight categories,
// unique ids, and the rail's grouping order. The ids' equality with the
// scenario library's directory set is gated separately by
// scripts/scenario-catalog-sync.spec.ts.

import { describe, expect, it } from 'vitest'
import {
  KB_SCENARIO_CATEGORIES, KB_SCENARIOS, scenariosByCategory,
} from '../src/client/hero/scenarios.ts'

describe('scenario catalog', () => {
  it('lists thirty scenarios with unique ids and known categories', () => {
    expect(KB_SCENARIOS).toHaveLength(30)
    expect(new Set(KB_SCENARIOS.map(scenario => scenario.id)).size).toBe(30)
    for (const scenario of KB_SCENARIOS) {
      expect(KB_SCENARIO_CATEGORIES).toContain(scenario.category)
      expect(scenario.nameZh.length).toBeGreaterThan(0)
      expect(scenario.nameEn.length).toBeGreaterThan(0)
      expect(scenario.descriptionZh.length).toBeGreaterThan(0)
      expect(scenario.descriptionEn.length).toBeGreaterThan(0)
      expect(scenario.probeZh.length).toBeGreaterThan(0)
      expect(scenario.probeEn.length).toBeGreaterThan(0)
    }
  })

  it('groups into the eight rail categories in rail order', () => {
    const groups = scenariosByCategory()
    expect(groups.map(group => group[0]?.category)).toEqual([...KB_SCENARIO_CATEGORIES])
    // Every scenario lands in exactly one bucket.
    expect(groups.reduce((total, group) => total + group.length, 0)).toBe(KB_SCENARIOS.length)
    // The food-safety bucket carries its four scenarios in catalog order.
    expect(groups[2]?.map(scenario => scenario.id)).toEqual([
      'food-safety-service', 'food-safety-inspection', 'food-compliance', 'label-review',
    ])
  })
})
