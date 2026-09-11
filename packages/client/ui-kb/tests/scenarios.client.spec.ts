// The static scenario catalog: thirty scenarios across eight categories,
// unique ids, the rail's grouping order, the featured front row, and the
// portal search's filter. The ids' equality with the scenario library's
// directory set is gated separately by scripts/scenario-catalog-sync.spec.ts.

import { describe, expect, it } from 'vitest'
import {
  KB_SCENARIO_CATEGORIES, KB_SCENARIOS, featuredScenarios, filterScenarios, scenariosByCategory,
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
    // A filtered subset groups through the same buckets: the '食安' matches
    // keep their catalog order inside their categories.
    const matches = filterScenarios(KB_SCENARIOS, '食安') ?? []
    expect(matches.map(scenario => scenario.id)).toEqual([
      'food-safety-service', 'food-safety-inspection', 'food-compliance', 'enterprise-data',
    ])
    expect(scenariosByCategory(matches)[2]?.map(scenario => scenario.id)).toEqual([
      'food-safety-service', 'food-safety-inspection', 'food-compliance',
    ])
  })

  it('pins the six featured front-row scenarios in catalog order', () => {
    expect(featuredScenarios().map(scenario => scenario.id)).toEqual([
      'market-insight', 'food-safety-service', 'cost-pricing', 'export-compliance',
      'supply-chain-finance', 'cold-chain',
    ])
    // Featured is presentation-only: every pick is a catalog entry.
    for (const scenario of featuredScenarios()) {
      expect(KB_SCENARIOS).toContain(scenario)
    }
  })

  it('filters the catalog for the portal search across both language faces', () => {
    // Blank and whitespace-only queries mean "no search": the browse view owns
    // the portal instead.
    expect(filterScenarios(KB_SCENARIOS, '')).toBeNull()
    expect(filterScenarios(KB_SCENARIOS, '   ')).toBeNull()
    // A Chinese keyword matches names and descriptions across categories.
    expect(filterScenarios(KB_SCENARIOS, '食安')?.map(scenario => scenario.id)).toEqual([
      'food-safety-service', 'food-safety-inspection', 'food-compliance', 'enterprise-data',
    ])
    // Case-insensitive over the English face and the probe questions.
    expect(filterScenarios(KB_SCENARIOS, 'COLD CHAIN')?.map(scenario => scenario.id)).toEqual(['cold-chain'])
    expect(filterScenarios(KB_SCENARIOS, 'UHT')?.map(scenario => scenario.id)).toEqual(['process-quality'])
    // A miss returns an empty result (the caller renders the empty state).
    expect(filterScenarios(KB_SCENARIOS, '不存在的关键词')).toEqual([])
  })
})
