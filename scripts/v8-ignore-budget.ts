/**
 * The v8 ignore budget gate: coverage-exemption markers (`/* v8 ignore *\/`)
 * are debt, so their net growth is capped per batch. The committed baseline
 * file locks the current inventory; the gate counts the working tree and
 * fails when the count exceeds the baseline by more than the per-batch
 * budget. Shrinking the inventory is always green (rebase the baseline in the
 * same change to lock the win).
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import { uniqueRepoFiles } from './repo-files.ts'

/** Marker pattern: the opening of a v8 coverage-ignore comment. */
const MARKER = /\/\*\s*v8 ignore/g

/** Repository-relative globs whose TypeScript is coverage-gated (the per-file 100% inventory). */
export const MARKER_GLOBS: readonly string[] = [
  'packages/*/*/src/**/*.{ts,tsx}',
  'apps/*/src/**/*.{ts,tsx}',
]

/** Marker scans never enter dependencies, build outputs, vendored or upstream trees. */
export function isExcludedMarkerPath(path: string): boolean {
  return path.includes('/node_modules/')
    || path.includes('/lib/')
    || path.startsWith('vendor/')
    || path.startsWith('platform/')
    || path.startsWith('research/')
}

/** One batch's allowed net growth. */
export const NET_NEW_LIMIT = 10

/** The counted marker inventory of a file tree. */
export interface MarkerInventory {
  /** Total marker occurrences across every scanned file. */
  readonly total: number
  /** Occurrences keyed by repository-relative path (files with none omitted). */
  readonly byFile: ReadonlyMap<string, number>
}

/** The gate's decision over one inventory. */
export interface BudgetVerdict {
  /** True when the inventory is within budget. */
  readonly ok: boolean
  /** Locked baseline total from the baseline file. */
  readonly baseline: number
  /** Current working-tree total. */
  readonly current: number
  /** `current - baseline`; negative means the inventory shrank. */
  readonly netNew: number
  /** The per-batch ceiling for {@link BudgetVerdict.netNew}. */
  readonly limit: number
}

/**
 * Count v8 ignore markers under one root.
 * @param root - absolute repository (or fixture) root to scan.
 * @returns the marker inventory.
 */
export function countV8IgnoreMarkers(root: string): MarkerInventory {
  const byFile = new Map<string, number>()
  const files = uniqueRepoFiles(root, MARKER_GLOBS, isExcludedMarkerPath)
  let total = 0
  for (const file of files) {
    const text = readFileSync(file.abs, 'utf8')
    const occurrences = [...text.matchAll(MARKER)].length
    if (occurrences > 0) byFile.set(relative(root, file.abs).replaceAll('\\', '/'), occurrences)
    total += occurrences
  }
  return { total, byFile }
}

/**
 * Judge one inventory against its baseline.
 * @param current - the counted working-tree total.
 * @param baseline - the locked baseline total.
 * @param limit - the allowed net growth.
 * @returns the verdict; ok is true exactly when `current <= baseline + limit`.
 */
export function evaluateBudget(current: number, baseline: number, limit: number): BudgetVerdict {
  const netNew = current - baseline
  return {
    ok: netNew <= limit,
    baseline,
    current,
    netNew,
    limit,
  }
}

/**
 * Read the locked baseline total.
 * @param path - baseline JSON file path holding `{ "total": number }`.
 * @returns the locked total.
 */
export function readBaseline(path: string): number {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { total?: unknown }
  if (typeof parsed.total !== 'number' || !Number.isSafeInteger(parsed.total) || parsed.total < 0) {
    throw new Error(`v8-ignore-budget: baseline file ${path} must hold { "total": <non-negative integer> }.`)
  }
  return parsed.total
}

/**
 * Rewrite the baseline to a freshly counted total (an explicit, reviewed action).
 * @param path - baseline JSON file path.
 * @param total - the new locked total.
 * @returns nothing; writes the file.
 */
export function writeBaseline(path: string, total: number): void {
  writeFileSync(path, `${JSON.stringify({ total }, null, 2)}\n`)
}

/** CLI entry: check the budget, or `--rebase` to relock the baseline. */
export function main(): void {
  const root = resolve(import.meta.dirname, '..')
  const baselinePath = resolve(import.meta.dirname, 'v8-ignore-budget.baseline.json')
  const rebase = process.argv.includes('--rebase')
  const inventory = countV8IgnoreMarkers(root)
  if (rebase) {
    writeBaseline(baselinePath, inventory.total)
    console.log(`v8-ignore-budget: baseline relocked at ${String(inventory.total)}.`)
    return
  }
  const verdict = evaluateBudget(inventory.total, readBaseline(baselinePath), NET_NEW_LIMIT)
  const top = [...inventory.byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([file, count]) => `  ${String(count).padStart(3)}  ${file}`)
    .join('\n')
  console.log(`v8-ignore-budget: total ${String(verdict.current)} (baseline ${String(verdict.baseline)}, net ${String(verdict.netNew)}, limit ${String(verdict.limit)}).`)
  console.log(`v8-ignore-budget: top files:\n${top}`)
  if (!verdict.ok) {
    console.error(`v8-ignore-budget: net-new ${String(verdict.netNew)} exceeds the per-batch limit of ${String(verdict.limit)}. Justify each marker in a reviewed change or cover the branch instead; relock deliberately with --rebase.`)
    process.exitCode = 1
    return
  }
  if (verdict.netNew < 0) {
    console.log('v8-ignore-budget: inventory shrank — relock with --rebase in this change to keep the win locked.')
  }
}

// Run only when invoked as a script, not when imported by a test.
if (process.argv[1] && import.meta.filename === resolve(process.argv[1])) {
  main()
}
