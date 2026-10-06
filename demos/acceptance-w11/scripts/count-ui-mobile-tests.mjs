#!/usr/bin/env node
/**
 * Reproduce the two ui-mobile test-count figures (W11-R5 D-1): the pure
 * package figure (packages/client/ui-mobile only) and the convention figure
 * (plus packages/client/ui-mobile-preview). The convention figure is what
 * the W11 acceptance ledgers record; the pure figure is what a narrow
 * tests/ command produces. Writes the machine-checkable result next to the
 * acceptance evidence. Run from the repository root.
 */
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

// The vitest CLI takes substring filters, not paths: `packages/client/ui-mobile`
// also matches `packages/client/ui-mobile-preview/...`, which is exactly how
// the convention figure came to include the preview package's tests. The pure
// scope therefore pins the tests/ directories explicitly.
const SCOPES = [
  { scope: 'pure', dirs: ['packages/client/ui-mobile/tests'] },
  { scope: 'convention', dirs: ['packages/client/ui-mobile/tests', 'packages/client/ui-mobile-preview/tests'] },
]

let failed = false
const result = { at: new Date().toISOString(), scopes: {} }
for (const { scope, dirs } of SCOPES) {
  let passed = -1
  // One retry per scope: a full-tree run on a busy host can brush a jsdom
  // case against its 5s timeout without any product change behind it.
  for (let attempt = 1; attempt <= 2 && passed === -1; attempt += 1) {
    const run = spawnSync('pnpm', ['exec', 'vitest', 'run', ...dirs], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
    // Strip ANSI color codes first: the summary line decorates both numbers.
    const plain = run.stdout.replace(/\x1b\[[0-9;]*m/g, '')
    const tests = [...plain.matchAll(/Tests\s+(\d+) passed \((\d+)\)/g)].at(-1)
    if (run.status === 0 && tests !== undefined && tests[1] === tests[2]) {
      passed = Number(tests[1])
      if (attempt === 2) console.error(`[${scope}] passed on retry`)
      continue
    }
    console.error(`[${scope}] attempt ${attempt} failed (status ${run.status})`)
    if (attempt === 2) console.error(run.stdout.slice(-4000))
  }
  if (passed === -1) {
    failed = true
    continue
  }
  result.scopes[scope] = { dirs, passed }
}
if (!failed) {
  result.delta = result.scopes.convention.passed - result.scopes.pure.passed
  const out = 'demos/acceptance-w11/w11-r5-test-count.json'
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`pure=${result.scopes.pure.passed} convention=${result.scopes.convention.passed} delta=${result.delta}`)
  console.log(`written: ${out}`)
}
