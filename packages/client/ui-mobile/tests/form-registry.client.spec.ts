// @vitest-environment jsdom
/** The seventeen-form registry: entry invariants, the intent scorer's fork policy, and the published preset.yml mirror. */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { welcomeOf } from '../src/client/colleagues.ts'
import { FORM_REGISTRY, matchIntent, registryCapabilityLine } from '../src/client/formRegistry.ts'

/** The repo root (tests → ui-mobile → client → packages → root). */
const REPO_ROOT = resolve(import.meta.dirname, '../../../..')
const PRESET_PATH = resolve(REPO_ROOT, 'examples/kb-agent/agent-presets/mobile-form-assistant/preset.yml')
const MIRROR_PATH = resolve(REPO_ROOT, 'examples/kb-agent/.dsh/.agent-presets/mobile-form-assistant/preset.yml')
// js-yaml is a root devDependency (not ui-mobile's); resolve it from the root manifest.
const { load: loadYaml } = createRequire(resolve(REPO_ROOT, 'package.json'))('js-yaml') as { load: (input: string) => unknown }

/** The published welcome block, parsed from the real preset file (not a fixture copy). */
const preset = loadYaml(readFileSync(PRESET_PATH, 'utf8')) as {
  description: string
  welcome: { greeting: string; capabilities: string[] }
}

describe('FORM_REGISTRY', () => {
  it('carries seventeen entries with unique collections and glyphs', () => {
    expect(FORM_REGISTRY).toHaveLength(17)
    expect(new Set(FORM_REGISTRY.map(entry => entry.collection)).size).toBe(17)
    expect(new Set(FORM_REGISTRY.map(entry => entry.glyph)).size).toBe(17)
    for (const entry of FORM_REGISTRY) {
      expect(entry.required.length).toBeGreaterThan(0)
      expect(entry.intentTerms.length).toBeGreaterThan(0)
      expect(entry.examples.length).toBeGreaterThan(0)
    }
  })

  it('keeps the migrated pur_orders purchase form first and the supplier registration on srm_suppliers', () => {
    // B3: the purchase form migrated to the canonical pur_orders table (the
    // legacy hub_po collections stay as read-only history).
    expect(FORM_REGISTRY[0]?.collection).toBe('pur_orders')
    // B2: registrations land in the SRM admission pool, not the legacy
    // hub_po_suppliers (now the read-only 采购联系人 history).
    expect(FORM_REGISTRY.find(entry => entry.collection === 'srm_suppliers')).toBeDefined()
    expect(FORM_REGISTRY.some(entry => entry.collection === 'hub_po_suppliers')).toBe(false)
    expect(FORM_REGISTRY.some(entry => entry.collection === 'hub_po_purchase_orders')).toBe(false)
    // B3: the P2P chain entries — requisition and PO-sourced receipt.
    expect(FORM_REGISTRY.some(entry => entry.collection === 'pur_requests')).toBe(true)
    expect(FORM_REGISTRY.some(entry => entry.collection === 'wms_receipts')).toBe(true)
    // B4: the warehouse practice entries — transfer application and reservation.
    expect(FORM_REGISTRY.some(entry => entry.collection === 'wms_transfers')).toBe(true)
    expect(FORM_REGISTRY.some(entry => entry.collection === 'wms_reservations')).toBe(true)
    // B5: the manufacturing pair — BOM head and manufacturing order.
    expect(FORM_REGISTRY.some(entry => entry.collection === 'mfg_boms')).toBe(true)
    expect(FORM_REGISTRY.some(entry => entry.collection === 'mfg_orders')).toBe(true)
    // B6: the execution trio — issue, job report, completion.
    expect(FORM_REGISTRY.some(entry => entry.collection === 'mfg_material_issues')).toBe(true)
    expect(FORM_REGISTRY.some(entry => entry.collection === 'mfg_job_reports')).toBe(true)
    expect(FORM_REGISTRY.some(entry => entry.collection === 'mfg_completions')).toBe(true)
  })

  it('derives the B6 execution entries with the engine-gate rules', () => {
    const issue = FORM_REGISTRY.find(entry => entry.collection === 'mfg_material_issues')
    if (issue === undefined) throw new Error('mfg_material_issues entry missing')
    expect(issue.system[0]?.rule).toContain('MI-YYYY-NNNN')
    expect(issue.derived.find(field => field.name === 'status')?.rule).toContain('draft')
    const report = FORM_REGISTRY.find(entry => entry.collection === 'mfg_job_reports')
    if (report === undefined) throw new Error('mfg_job_reports entry missing')
    expect(report.system[0]?.rule).toContain('JR-YYYY-NNNN')
    expect(report.derived.find(field => field.name === 'op_seq')?.rule).toContain('mfg_order_operations')
    const completion = FORM_REGISTRY.find(entry => entry.collection === 'mfg_completions')
    if (completion === undefined) throw new Error('mfg_completions entry missing')
    expect(completion.system[0]?.rule).toContain('MC-YYYY-NNNN')
    expect(completion.derived.find(field => field.name === 'oqc_status')?.rule).toContain('pending')
  })

  it('seeds the supplier entry with the admission lifecycle derivations', () => {
    const supplier = FORM_REGISTRY.find(entry => entry.collection === 'srm_suppliers')
    if (supplier === undefined) throw new Error('srm_suppliers entry missing')
    expect(supplier.derived.map(field => `${field.name}=${field.rule.split('（')[0]?.trim()}`)).toEqual(
      ['lifecycle_status=默认 potential', 'source=默认 internal', 'phone=可选：用户提供了联系电话就填，没说留空'],
    )
    expect(supplier.system[0]?.name).toBe('code')
    expect(supplier.system[0]?.rule).toContain('SUP-YYYY-NNNN')
    const purchase = FORM_REGISTRY[0]
    expect(purchase?.derived.find(field => field.name === 'supplier_id')?.rule).toContain('srm_suppliers')
  })

  it('projects the welcome capability line from the biz names', () => {
    expect(registryCapabilityLine()).toContain('采购单')
    expect(registryCapabilityLine()).toContain('回款记录')
  })

  it('covers all seventeen registry forms in the capability line (derives from preset.yml capabilities; B7 #2)', () => {
    const line = registryCapabilityLine()
    expect(FORM_REGISTRY).toHaveLength(17)
    for (const entry of FORM_REGISTRY) {
      expect(line).toContain(entry.bizName)
    }
  })
})

describe('preset.yml mirror', () => {
  it('derives the published first capability line from preset.yml capabilities, verbatim (R3 #3: real-file read)', () => {
    expect(preset.welcome.capabilities[0]).toBe(registryCapabilityLine())
  })

  it('lists the seventeen registry biz names in registry order in the description', () => {
    expect(preset.description).toContain(`十七类业务单据（${FORM_REGISTRY.map(entry => entry.bizName).join('/')}）`)
  })

  it('keeps the .dsh deployment mirror byte-identical with the published preset', () => {
    expect(readFileSync(MIRROR_PATH, 'utf8')).toBe(readFileSync(PRESET_PATH, 'utf8'))
  })

  it('falls back to a local welcome whose capability lines equal the published preset block (R3 #5)', () => {
    expect(welcomeOf('mobile-form-assistant', undefined).capabilities).toEqual(preset.welcome.capabilities)
  })
})

describe('matchIntent', () => {
  it('matches a unique high-confidence purchase sentence', () => {
    const match = matchIntent('向宏发食品采购 500kg 面粉，单价 3.2')
    expect(match).toEqual({ kind: 'unique', entry: FORM_REGISTRY[0] })
  })

  it('matches the other form nouns uniquely', () => {
    expect(matchIntent('宏发的货质检有问题，结论不合格').kind).toBe('unique')
    expect(matchIntent('宏发的货抽检有问题，结论不合格').kind).toBe('unique')
    expect(matchIntent('今天到货 200 箱冷链箱要入库').kind).toBe('unique')
    expect(matchIntent('宏发这笔回款 16000 到账了').kind).toBe('unique')
    expect(matchIntent('给供应商三味食品登个档').kind).toBe('unique')
    expect(matchIntent('给客户鲜丰发货 100 箱黄豆酱油').kind).toBe('unique')
    // B6: the execution trio's canonical phrasings.
    const issue = matchIntent('MO-2026-0005 领糯米粉 759 公斤')
    expect(issue).toEqual({ kind: 'unique', entry: FORM_REGISTRY.find(entry => entry.collection === 'mfg_material_issues') })
    const report = matchIntent('3 号线杀菌工序完工 500 件，工时 2 小时')
    expect(report).toEqual({ kind: 'unique', entry: FORM_REGISTRY.find(entry => entry.collection === 'mfg_job_reports') })
    // 完工入库 as a phrase also scores the B3 inbound form; the scorer's fork
    // policy hands that overlap to ask_choice, so the canonical unique test
    // uses the 待检 phrasing (the persona's MO context resolves the overlap
    // in conversation).
    const completion = matchIntent('MO-2026-0005 整批完工 12000 件，成品进待检')
    expect(completion).toEqual({ kind: 'unique', entry: FORM_REGISTRY.find(entry => entry.collection === 'mfg_completions') })
  })

  it('penalizes the anti-term that flips the direction', () => {
    // 卖给 hits the purchase anti-term (-2) while scoring outbound 卖给(2).
    const match = matchIntent('这批货卖给鲜丰，出库安排一下')
    expect(match.kind).toBe('unique')
    if (match.kind !== 'unique') throw new Error('unreachable')
    expect(match.entry.collection).toBe('hub_wms_outbound')
  })

  it('forks an ambiguous low-confidence sentence into an ask_choice verdict', () => {
    const match = matchIntent('帮我登记一下，刚和鲜丰谈好一批冷链箱')
    expect(match.kind).toBe('ambiguous')
    if (match.kind !== 'ambiguous') throw new Error('unreachable')
    expect(match.candidates.length).toBeGreaterThan(1)
  })

  it('lists the whole registry when the user clearly registers but says too little', () => {
    const match = matchIntent('帮我登记一下')
    // 登记 alone scores the generic weight on every table — the fork lists
    // all six rather than guess (02 §3.3.4).
    expect(match.kind).toBe('ambiguous')
    if (match.kind !== 'ambiguous') throw new Error('unreachable')
    expect(match.candidates).toHaveLength(FORM_REGISTRY.length)
  })

  it('answers none for a non-registration question', () => {
    expect(matchIntent('本月采购额是多少')).toEqual({ kind: 'none' })
    expect(matchIntent('宏发食品是哪里的公司')).toEqual({ kind: 'none' })
  })

  it('normalizes the cold-chain synonyms before scoring', () => {
    expect(matchIntent('采购 20 个保温箱').kind).toBe('unique')
  })
})
