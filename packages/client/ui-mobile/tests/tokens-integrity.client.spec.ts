/** tokens.css variable integrity: every `var(--dshm-*)` reference anywhere in
 * src (module css plus tsx inline style strings) must resolve to a definition
 * declared in tokens.css — the token single source. A dangling reference
 * computes to the initial value (F1's `--dshm-r-ctl-corner` badges rendered
 * square at radius 0), so this gate fails the build with the variable name and
 * the offending file instead of letting the defect reach a live probe. */

import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const srcRoot = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

/** Recursively list the css and tsx files under one directory. */
function listStyleSources(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listStyleSources(full))
      continue
    }
    if (entry.name.endsWith('.css') || entry.name.endsWith('.tsx')) out.push(full)
  }
  return out
}

describe('tokens.css variable integrity (W9-R1)', () => {
  it('every var(--dshm-*) reference in src resolves to a tokens.css definition', () => {
    const tokens = readFileSync(join(srcRoot, 'client', 'tokens.css'), 'utf8')
    const defined = new Set(
      [...tokens.matchAll(/(?:^|[\s;{])(--dshm-[a-z0-9-]+)\s*:/gm)].map(match => match[1] as string),
    )
    expect(defined.size).toBeGreaterThan(0)

    const dangling: Array<{ file: string; name: string }> = []
    for (const file of listStyleSources(srcRoot)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/var\(\s*(--dshm-[a-z0-9-]+)/g)) {
        const name = match[1] as string
        if (!defined.has(name)) dangling.push({ file: relative(srcRoot, file), name })
      }
    }
    expect(dangling, `dangling --dshm-* references: ${JSON.stringify(dangling)}`).toEqual([])
  })
})
