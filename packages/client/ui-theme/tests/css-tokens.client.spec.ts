// @vitest-environment node
/** Static gate over client CSS: every theme-namespace var() reference resolves
 * to a defined custom property; no var() carries a color literal fallback
 * (docs/web-styling.md forbids literal colors in feature components); and every
 * theme token defined in design-platform.css is defined in both its light and
 * dark segments. Literal-fallback exemptions are exactly the hardcoded
 * FALLBACK_EXEMPTIONS file list below — there is no per-line inline exemption
 * syntax, and each listed file must still exist and use fallbacks (last test). */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const CLIENT_DIR = fileURLToPath(new URL('../../../client/', import.meta.url))
const DESIGN_PLATFORM = fileURLToPath(new URL('../src/styles/design-platform.css', import.meta.url))

/** Custom properties under the theme namespaces owned by ui-theme styles or
 * the upstream deepsuite base (`--ds-*`). Everything else (e.g. `--dsh-*`,
 * `--trajectory-*`) is a component contract variable injected at runtime by
 * React inline styles, invisible to static analysis by design. */
const THEME_REF = /^--(?:dsw|ds)-/

/** Files exempt from the literal-fallback rule, relative to packages/client/.
 * Boot shell base: rendered before ui-theme sheets are injected, so theme
 * tokens are genuinely unset for the first paint; the fallbacks keep the
 * pre-theme first paint readable instead of black-on-black. */
const FALLBACK_EXEMPTIONS = new Set(['web/src/base.css'])

const collectCss = (rawDir: string, out: string[] = []): string[] => {
  const dir = rawDir.replace(/\/+$/, '')
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'lib' || name === 'types') continue
    const path = `${dir}/${name}`
    if (statSync(path).isDirectory()) collectCss(path, out)
    else if (name.endsWith('.css')) out.push(path)
  }
  return out
}

const cssFiles = collectCss(CLIENT_DIR)

interface Ref {
  file: string
  line: number
  token: string
  fallback: string
}

const scan = (): { defined: Set<string>; refs: Ref[] } => {
  const defined = new Set<string>()
  const defs: Array<[file: string, line: number, token: string]> = []
  for (const file of cssFiles) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/(--[\w-]+)\s*:/g)) defs.push([file, i + 1, m[1]!])
    })
  }
  for (const [, , token] of defs) defined.add(token)
  const refs: Ref[] = []
  const refRe = /var\((--[\w-]+)(\s*,[^)]*)?\)/g
  for (const file of cssFiles) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      for (const m of line.matchAll(refRe)) {
        refs.push({ file, line: i + 1, token: m[1]!, fallback: (m[2] ?? '').trim() })
      }
    })
  }
  return { defined, refs }
}

/** design-platform.css theme segments: the sheet defines the static scale and
 * the alias/specific layers twice, once per theme — plain selectors for light,
 * `[data-ds-dark-theme]` selectors for dark. Parses flat top-level blocks (the
 * sheet has no nested rules); a theme token present in only one segment
 * silently vanishes in the other theme, which is what the symmetry test below
 * refuses. */
const themeSegments = (): { light: Set<string>; dark: Set<string> } => {
  const src = readFileSync(DESIGN_PLATFORM, 'utf8')
  const light = new Set<string>()
  const dark = new Set<string>()
  for (const block of src.matchAll(/^([^{]+)\{([^{}]*)\}/gm)) {
    const target = block[1]!.includes('data-ds-dark-theme') ? dark : light
    for (const def of block[2]!.matchAll(/(--[\w-]+)\s*:/g)) target.add(def[1]!)
  }
  return { light, dark }
}

describe('client CSS token gate', () => {
  it('scans CSS files across client packages', () => {
    expect(cssFiles.length).toBeGreaterThan(50)
  })

  it('resolves every theme-namespace var() reference against defined custom properties', () => {
    const { defined, refs } = scan()
    const unresolved = refs
      .filter(ref => THEME_REF.test(ref.token) && !defined.has(ref.token))
      .map(ref => `${ref.file.replace(CLIENT_DIR, '')}:${ref.line} ${ref.token}`)
    expect(unresolved, 'unresolved theme token references:\n' + unresolved.join('\n')).toEqual([])
  })

  it('defines every design-platform theme token in both light and dark segments', () => {
    const { light, dark } = themeSegments()
    // Guards against the block parser silently matching nothing.
    expect(light.size, 'light segment token count').toBeGreaterThan(0)
    expect(dark.size, 'dark segment token count').toBeGreaterThan(0)
    const asymmetric = [...new Set([...light, ...dark])]
      .filter(token => THEME_REF.test(token) && light.has(token) !== dark.has(token))
      .map(token => `${token} ${light.has(token) ? 'light only' : 'dark only'}`)
    expect(asymmetric, 'theme tokens defined in only one segment:\n' + asymmetric.join('\n')).toEqual([])
  })

  it('rejects color literals inside var() fallbacks', () => {
    const colorLiteral = /#(?:[0-9a-fA-F]{3,8})\b|rgba?\(|hsla?\(/
    const offenders = scan().refs
      .filter(ref => ref.fallback.length > 0
        && colorLiteral.test(ref.fallback)
        && !FALLBACK_EXEMPTIONS.has(ref.file.replace(CLIENT_DIR, '')))
      .map(ref => `${ref.file.replace(CLIENT_DIR, '')}:${ref.line} ${ref.token}${ref.fallback ? `,${ref.fallback}` : ''}`)
    expect(offenders, 'color literal fallbacks:\n' + offenders.join('\n')).toEqual([])
  })

  it('keeps FALLBACK_EXEMPTIONS entries pointing at real files that still use fallbacks', () => {
    for (const rel of FALLBACK_EXEMPTIONS) {
      const file = `${CLIENT_DIR}${rel}`
      expect(cssFiles, rel).toContain(file)
      expect(readFileSync(file, 'utf8'), rel).toMatch(/var\(--[\w-]+\s*,/)
    }
  })
})
