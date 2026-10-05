/** Composer skin contract (W11-B1): the 46px single-line capsule is a box
 * arithmetic — 1.5px rim ×2 + 10.5px padding ×2 + 22px line — carried by the
 * wrapper, because antd-mobile 5.43's text-area element consumes only
 * --font-size/--color/--placeholder-color. These assertions pin the cascade
 * source so a dial edit or an antd upgrade cannot silently strand the text
 * against the rim again (the pre-fix probe read 0px padding, a 24px
 * engine-default line box, and the first line parked 1px under the top rim). */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cssText = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'client', 'messages', 'chat.module.css'),
  'utf8',
)

/** Extract one rule block's declarations by exact selector line. */
function declarations(selector: string): string {
  const start = cssText.indexOf(`\n${selector} {`)
  expect(start, `selector ${selector} missing from chat.module.css`).toBeGreaterThan(-1)
  const open = cssText.indexOf('{', start)
  const close = cssText.indexOf('}', open)
  return cssText.slice(open + 1, close)
}

describe('composer skin contract (W11-B1)', () => {
  it('the capsule wrapper owns the 46px arithmetic: 1.5px rim, 10.5/18 padding, card face', () => {
    const input = declarations('.input')
    expect(input).toContain('padding: 10.5px 18px')
    expect(input).toContain('background: var(--dshm-card)')
    expect(input).toContain('border: 1.5px solid var(--dshm-line-strong)')
    expect(input).toContain('border-radius: var(--dshm-r-seal)')
  })

  it('the element rule owns only the 22px line metrics the autoSize sizer reads', () => {
    const element = declarations('.input :global(.adm-text-area-element)')
    expect(element).toContain('line-height: 22px')
    expect(element).toContain('min-height: 22px')
    expect(element).not.toMatch(/padding/)
  })

  it('focus-within wears the brand rim + soft halo (the fill flash 0% pair)', () => {
    const focus = declarations('.input:focus-within')
    expect(focus).toContain('border-color: var(--dshm-brand)')
    expect(focus).toContain('box-shadow: 0 0 0 3px var(--dshm-brand-soft)')
  })

  it('the fill flash opens on the same brand pair plus the soft wash, interpolating back to cascade values', () => {
    const first = declarations('@keyframes input-fill')
    expect(first).toContain('border-color: var(--dshm-brand)')
    expect(first).toContain('box-shadow: 0 0 0 3px var(--dshm-brand-soft)')
    expect(first).toContain('background-color: var(--dshm-brand-soft)')
    // Only the 0% frame is pinned: no 100% frame may pin the rim back to the
    // roast line, which fought the focus-within rim while focused.
    expect(cssText).not.toMatch(/@keyframes input-fill[^@]*100%/s)
  })

  it('reduced-motion still disables the fill flash animation', () => {
    expect(cssText).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.inputRow\[data-fill\] \.input[\s\S]*animation: none/)
  })

  it('X20: consecutive tool rows fold the flow gap into one status group', () => {
    const fold = declarations('.toolRow + .toolRow')
    expect(fold).toContain('margin-top: -5px')
  })

  it('the failed chip carries its error line inside the chip, not clipped outside it (W11-R1)', () => {
    const chip = declarations('.attachChip')
    expect(chip).toContain('flex-wrap: wrap')
    const error = declarations('.attachError')
    expect(error).not.toMatch(/position:\s*absolute/)
    expect(error).not.toMatch(/bottom:\s*-16px/)
    expect(error).toContain('flex-basis: 100%')
    expect(error).toContain('font-size: var(--dshm-fs-caption)')
  })

  it('no dead antd-mobile dials: 5.43 consumes none of the legacy --padding/--adm-text-area-* set', () => {
    for (const dead of ['--padding:', '--adm-text-area-min-height', '--adm-text-area-max-height', '--box-sizing:', '--line-height:']) {
      expect(cssText.includes(dead), `dead dial ${dead} re-introduced`).toBe(false)
    }
  })
})
