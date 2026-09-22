/**
 * The v8 ignore budget gate's judgement on real file trees: the counting
 * scan (markers, per-file distribution, exclusions), the verdict math
 * (eleven net-new markers go red, ten stay green, shrinking is green), and
 * the baseline file round trip.
 */

import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { countV8IgnoreMarkers, evaluateBudget, isExcludedMarkerPath, MARKER_GLOBS, NET_NEW_LIMIT, readBaseline, writeBaseline } from './v8-ignore-budget.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** One fixture tree with `count` markers in a single package source file. */
function treeWithMarkers(count: number, extras: { name?: string; extraFiles?: Record<string, string> } = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'v8-ignore-budget-'))
  roots.push(root)
  const name = extras.name ?? `pkg-${String(count)}`
  mkdirSync(join(root, 'packages', 'demo', name, 'src'), { recursive: true })
  writeFileSync(
    join(root, 'packages', 'demo', name, 'src', 'index.ts'),
    `export const value = 1\n${'/* v8 ignore next -- debt */\n'.repeat(Math.max(0, count))}`,
  )
  for (const [path, text] of Object.entries(extras.extraFiles ?? {})) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), text)
  }
  return root
}

describe('v8 ignore budget verdicts', () => {
  it('treats the committed baseline plus the limit as the red line', () => {
    // Eleven net-new markers over the baseline exceed the limit of ten.
    expect(evaluateBudget(21, 10, NET_NEW_LIMIT)).toMatchObject({ ok: false, netNew: 11, limit: 10 })
    // Exactly ten stays green; nine and shrinking are green too.
    expect(evaluateBudget(20, 10, NET_NEW_LIMIT)).toMatchObject({ ok: true, netNew: 10 })
    expect(evaluateBudget(19, 10, NET_NEW_LIMIT)).toMatchObject({ ok: true, netNew: 9 })
    expect(evaluateBudget(8, 10, NET_NEW_LIMIT)).toMatchObject({ ok: true, netNew: -2 })
  })

  it('counts markers per file across the scanned globs', () => {
    const root = treeWithMarkers(2, { extraFiles: { 'apps/demo/src/main.ts': '/* v8 ignore next: one */\nexport const a = 1\n' } })
    const inventory = countV8IgnoreMarkers(root)
    expect(inventory.total).toBe(3)
    expect(inventory.byFile.get('packages/demo/pkg-2/src/index.ts')).toBe(2)
    expect(inventory.byFile.get('apps/demo/src/main.ts')).toBe(1)
  })

  it('never scans dependencies, build outputs, or vendored and upstream trees', () => {
    const root = treeWithMarkers(1, { extraFiles: {
      'packages/demo/pkg-1/node_modules/x/index.ts': '/* v8 ignore next */\nexport const a = 1\n',
      'packages/demo/pkg-1/lib/index.ts': '/* v8 ignore next */\n',
      'vendor/cordis/src/index.ts': '/* v8 ignore next */\n',
      'platform/nocobase/src/a.ts': '/* v8 ignore next */\n',
    } })
    const inventory = countV8IgnoreMarkers(root)
    expect(inventory.total).toBe(1)
    expect([...inventory.byFile.keys()]).toEqual(['packages/demo/pkg-1/src/index.ts'])
    for (const excluded of ['packages/demo/pkg-1/node_modules/x/index.ts', 'packages/demo/pkg-1/lib/index.ts', 'vendor/cordis/src/index.ts', 'platform/nocobase/src/a.ts']) {
      expect(isExcludedMarkerPath(excluded)).toBe(true)
    }
    expect(MARKER_GLOBS.length).toBeGreaterThan(0)
  })

  it('round-trips the baseline file and rejects malformed totals', () => {
    const root = mkdtempSync(join(tmpdir(), 'v8-ignore-baseline-'))
    roots.push(root)
    const path = join(root, 'baseline.json')
    writeBaseline(path, 886)
    expect(readBaseline(path)).toBe(886)
    writeFileSync(path, '{"total": -1}')
    expect(() => readBaseline(path)).toThrow(/non-negative integer/u)
    writeFileSync(path, '{"total": "many"}')
    expect(() => readBaseline(path)).toThrow(/non-negative integer/u)
  })

  it('turns red exactly when a fixture diff grows the inventory by eleven', async () => {
    // The committed baseline stands in for the pre-change tree; the fixture
    // tree with eleven more markers is the working tree a bad batch produces.
    const before = treeWithMarkers(10)
    const after = treeWithMarkers(21)
    const baseline = countV8IgnoreMarkers(before).total
    const current = countV8IgnoreMarkers(after).total
    expect(evaluateBudget(current, baseline, NET_NEW_LIMIT).ok).toBe(false)
    const green = countV8IgnoreMarkers(treeWithMarkers(20)).total
    expect(evaluateBudget(green, baseline, NET_NEW_LIMIT).ok).toBe(true)
  })
})
