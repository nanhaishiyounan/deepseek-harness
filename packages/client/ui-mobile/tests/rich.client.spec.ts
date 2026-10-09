// @vitest-environment jsdom
/** The v3 rich pipeline: markdown render + sanitize, the metric-line trigger, block splitting. */

import { describe, expect, it } from 'vitest'
import { parseMetricLine, renderMarkdown, sanitizeBizText, splitCodeBlocks, splitRichBlocks } from '../src/client/messages/rich.ts'
import { SUPPLIER_LIFECYCLE_STATES } from '../src/client/fieldControls.ts'
import { SUPPLIER_STATE_WORDS } from '../src/client/docsCatalog.ts'

describe('renderMarkdown', () => {
  it('renders paragraphs, bold, and single-newline breaks', () => {
    const html = renderMarkdown('第一行\n第二行 **采购单**')
    expect(html).toContain('第一行')
    expect(html).toContain('<br')
    expect(html).toContain('<strong>采购单</strong>')
  })

  it('renders lists and tables', () => {
    const list = renderMarkdown('- 甲\n- 乙')
    expect(list).toContain('<ul>')
    const table = renderMarkdown('| 字段 | 值 |\n| --- | --- |\n| 单号 | PO-1 |')
    expect(table).toContain('<table>')
  })

  it('wraps every table in its scroll container (W24)', () => {
    const table = renderMarkdown('| 字段 | 值 |\n| --- | --- |\n| 单号 | PO-1 |')
    expect(table).toContain('<div class="md-table-wrap"><table>')
    expect(table.trim().endsWith('</table></div>')).toBe(true)
  })

  it('strips script payloads through the sanitizer', () => {
    const dirty = renderMarkdown('<script>alert(1)</script>正文')
    expect(dirty).not.toContain('<script')
    expect(dirty).toContain('正文')
  })
})

describe('parseMetricLine', () => {
  it('promotes the canonical conclusion line', () => {
    expect(parseMetricLine('本月采购额 ¥182,400')).toEqual({ label: '本月采购额', value: '¥182,400' })
  })

  it('promotes a density-qualified line and absorbs the unit token', () => {
    expect(parseMetricLine('合计 ¥16,000 元')).toEqual({ label: '合计', value: '¥16,000 元' })
  })

  it('promotes a line that starts with the number itself', () => {
    expect(parseMetricLine('¥16,000 合计')).toEqual({ label: '合计', value: '¥16,000' })
  })

  it('rejects long lines', () => {
    expect(parseMetricLine('本月采购额超出了十六个字符的上限 ¥182,400')).toBeUndefined()
  })

  it('rejects markdown structure lines', () => {
    expect(parseMetricLine('- 3 个待办')).toBeUndefined()
    expect(parseMetricLine('1. 第一件事')).toBeUndefined()
  })

  it('rejects prose with a sparse digit', () => {
    expect(parseMetricLine('这批冷链箱一共200箱今天送到')).toBeUndefined()
    expect(parseMetricLine('入库数量很多有待确认')).toBeUndefined()
  })

  it('rejects a bare number without a label and blank lines', () => {
    expect(parseMetricLine('1042')).toBeUndefined()
    expect(parseMetricLine('')).toBeUndefined()
    expect(parseMetricLine('   ')).toBeUndefined()
  })

  it('rejects a punctuation-dense line with no numeric token', () => {
    expect(parseMetricLine(',,,,,,,')).toBeUndefined()
  })
})

describe('splitRichBlocks', () => {
  it('gathers adjacent metric lines and keeps prose blocks', () => {
    const blocks = splitRichBlocks('结论如下：\n\n本月采购额 ¥182,400\n¥6,400 本月回款\n\n说明文字。')
    expect(blocks).toEqual([
      { kind: 'text', text: '结论如下：' },
      {
        kind: 'metric',
        metrics: [
          { label: '本月采购额', value: '¥182,400' },
          { label: '本月回款', value: '¥6,400' },
        ],
      },
      { kind: 'text', text: '说明文字。' },
    ])
  })

  it('splits a metric run out of the middle of a paragraph', () => {
    const blocks = splitRichBlocks('前文\n本月采购额 ¥182,400\n后文')
    expect(blocks).toEqual([
      { kind: 'text', text: '前文' },
      { kind: 'metric', metrics: [{ label: '本月采购额', value: '¥182,400' }] },
      { kind: 'text', text: '后文' },
    ])
  })

  it('returns one text block for pure prose', () => {
    expect(splitRichBlocks('一句话。')).toEqual([{ kind: 'text', text: '一句话。' }])
  })

  it('returns empty for an empty narrative', () => {
    expect(splitRichBlocks('')).toEqual([])
  })
})

describe('splitCodeBlocks', () => {
  it('lifts fenced code out whole and keeps the surrounding text', () => {
    const runs = splitCodeBlocks('先看代码：\n```javascript\nconst qty = 1\n```\n就这些。')
    expect(runs).toEqual([
      { kind: 'text', text: '先看代码：' },
      { kind: 'code', lang: 'javascript', code: 'const qty = 1' },
      { kind: 'text', text: '就这些。' },
    ])
  })

  it('labels a bare fence text and swallows an unterminated body', () => {
    expect(splitCodeBlocks('```\nplain\n```')).toEqual([{ kind: 'code', lang: 'text', code: 'plain' }])
    // A fence left open runs to the narrative's end.
    expect(splitCodeBlocks('```python\nprint(1)')).toEqual([{ kind: 'code', lang: 'python', code: 'print(1)' }])
  })

  it('returns one text run for fence-free prose and empty input', () => {
    expect(splitCodeBlocks('一句话。')).toEqual([{ kind: 'text', text: '一句话。' }])
    expect(splitCodeBlocks('')).toEqual([])
  })
})

describe('sanitizeBizText', () => {
  it('maps leaked collection and field identifiers onto business terms', () => {
    expect(sanitizeBizText('已在 pur_orders 登记一条采购单')).toBe('已在 采购订单 登记一条采购单')
    expect(sanitizeBizText('明细 hub_po_items（product_name/qty/unit_price）已核对')).toBe('明细 采购明细（品名/数量/单价）已核对')
    expect(sanitizeBizText('匹配到 supplier_id=7')).toBe('匹配到 供应商=7')
  })

  it('degrades unmapped hub_ names to 业务记录 and drops leaky paren groups whole', () => {
    expect(sanitizeBizText('写入 hub_custom_registry 完成')).toBe('写入 业务记录 完成')
    expect(sanitizeBizText('已核对（含 reference_code 与备注）')).toBe('已核对')
  })

  it('keeps people-language text untouched', () => {
    expect(sanitizeBizText('好的，登记一张采购单。')).toBe('好的，登记一张采购单。')
    expect(sanitizeBizText('合计 ¥16,000（含税）')).toBe('合计 ¥16,000（含税）')
  })

  it('resolves bare entity-id references onto the fallback noun (W24)', () => {
    expect(sanitizeBizText('味之源 9/26-28 连续 5 次失败：supplier 4 · 物料 product 1 与 product 8 各涉及')).toBe('味之源 9/26-28 连续 5 次失败：某供应商 4 号 · 物料 某物料 1 号 与 某物料 8 号 各涉及')
    expect(sanitizeBizText('东港丰泽 supplier12 · 全部为 product 8')).toBe('东港丰泽 某供应商 12 号 · 全部为 某物料 8 号')
    expect(sanitizeBizText('Customer #8 已对账')).toBe('某客户 8 号 已对账')
  })

  it('renders the AQL verdict notation as its people sentence (W24)', () => {
    expect(sanitizeBizText('AQL 抽样 d≥Re 拒收')).toBe('按抽检标准判定拒收（不合格数达到拒收线）')
    expect(sanitizeBizText('d≥Re 不通过')).toBe('不合格数达到拒收线 不通过')
    expect(sanitizeBizText('d<=Ac 建议接收')).toBe('不合格数未超接收线 建议接收')
  })

  it('folds streak comparisons and maps all-caps abbreviations (W24)', () => {
    expect(sanitizeBizText('连续拒收 streak≥3')).toBe('连续拒收 3 次及以上')
    expect(sanitizeBizText('味之源 reject_streak=5')).toBe('味之源 连续拒收批数=5')
    expect(sanitizeBizText('product 11 当前 ATP=0')).toBe('某物料 11 号 当前 可用库存=0')
    expect(sanitizeBizText('ROP 120 偏低')).toBe('再订货点 120 偏低')
  })

  it('maps bare lifecycle enum values onto their business words (W24)', () => {
    expect(sanitizeBizText('某供应商 12 号 · qualified · 合格判定全部积压')).toBe('某供应商 12 号 · 合格 · 合格判定全部积压')
    expect(sanitizeBizText('该供方 frozen 已停用')).toBe('该供方 冻结 已停用')
  })

  it('derives every lifecycle word from the field-control value domain (W24-R1)', () => {
    // `qualified` is 合格 on every surface: the catalog projection the word
    // table reuses, and the parse vocabulary's reverse word.
    expect(SUPPLIER_STATE_WORDS.qualified).toBe('合格')
    for (const state of SUPPLIER_LIFECYCLE_STATES) {
      const word = SUPPLIER_STATE_WORDS[state]
      expect(word).toBeDefined()
      expect(word).not.toBe(state)
      expect(sanitizeBizText(`该供方 ${state} 已停用`)).toBe(`该供方 ${word ?? ''} 已停用`)
    }
  })

  it('renders the AQL verdict sentence for every casing variant (W24-R1 CI factory)', () => {
    const phrase = '按抽检标准判定拒收（不合格数达到拒收线）'
    expect(sanitizeBizText('AQL 抽样 d≥Re 拒收')).toBe(phrase)
    expect(sanitizeBizText('AQL抽样，D≥RE拒收')).toBe(phrase)
    expect(sanitizeBizText('aql抽样 d>=Re拒收')).toBe(phrase)
    expect(sanitizeBizText('D>=RE')).toBe('不合格数达到拒收线')
    expect(sanitizeBizText('d<=ac 建议接收')).toBe('不合格数未超接收线 建议接收')
  })

  it('maps the receiving-state pair onto its people words (W24-R1)', () => {
    expect(sanitizeBizText('收货进度 receiving=none')).toBe('收货进度 尚未收货')
    expect(sanitizeBizText('RECEIVING_STATUS=NONE 已登记')).toBe('尚未收货 已登记')
  })

  it('resolves plural entity slips onto the same fallback nouns (W24-R1)', () => {
    expect(sanitizeBizText('东港丰泽 suppliers 4 与 products 8')).toBe('东港丰泽 某供应商 4 号 与 某物料 8 号')
    expect(sanitizeBizText('materials12 已核对')).toBe('某物料 12 号 已核对')
  })

  it('consumes a trailing unit token with the streak fold (W24-R1)', () => {
    expect(sanitizeBizText('连续拒收 streak≥3·次')).toBe('连续拒收 3 次及以上')
    expect(sanitizeBizText('味之源 streak≥5 次')).toBe('味之源 5 次及以上')
  })

  it('keeps the dictionary-word states in English prose untouched (W24-R1)', () => {
    expect(sanitizeBizText('The frozen goods arrived; qualified partner list attached')).toBe('The frozen goods arrived; qualified partner list attached')
  })

  it('keeps the five everyday-word states in English prose untouched (W24-R2)', () => {
    expect(sanitizeBizText('The preferred supplier list is attached')).toBe('The preferred supplier list is attached')
    expect(sanitizeBizText('The potential risk is high')).toBe('The potential risk is high')
    expect(sanitizeBizText('we are reviewing the order')).toBe('we are reviewing the order')
  })

  it('maps every state in a bare enum face of bullets and asterisks (W24-R3)', () => {
    const w = (state: string): string => SUPPLIER_STATE_WORDS[state] ?? state
    expect(sanitizeBizText('- qualified - restricted - preferred')).toBe(`- ${w('qualified')} - ${w('restricted')} - ${w('preferred')}`)
    expect(sanitizeBizText('- qualified\n- preferred\n- reviewing')).toBe(`- ${w('qualified')}\n- ${w('preferred')}\n- ${w('reviewing')}`)
    expect(sanitizeBizText('**qualified**')).toBe(`**${w('qualified')}**`)
    expect(sanitizeBizText('1. qualified')).toBe(`1. ${w('qualified')}`)
  })

  it('maps bullet-list states after a Chinese lead-in line (W24-R3 live shape)', () => {
    const w = (state: string): string => SUPPLIER_STATE_WORDS[state] ?? state
    const lead = '合计 30 家，去重后的原始枚举值共 6 个：'
    const source = `${lead}\n- qualified\n- preferred\n- restricted\n- frozen\n- potential\n- reviewing`
    expect(sanitizeBizText(source)).toBe(
      `${lead}\n- ${w('qualified')}\n- ${w('preferred')}\n- ${w('restricted')}\n- ${w('frozen')}\n- ${w('potential')}\n- ${w('reviewing')}`,
    )
  })

  it('maps a gated state whose nearest segment is another state word (W24-R3)', () => {
    const w = (state: string): string => SUPPLIER_STATE_WORDS[state] ?? state
    // No Han neighbor anywhere: the enum-run neighbor carries the mapping.
    expect(sanitizeBizText('- frozen - potential')).toBe(`- ${w('frozen')} - ${w('potential')}`)
  })

  it('keeps adjacent state words in English prose verbatim (W24-R4)', () => {
    expect(sanitizeBizText('the frozen qualified partner is reserved')).toBe('the frozen qualified partner is reserved')
    expect(sanitizeBizText('The preferred frozen batches')).toBe('The preferred frozen batches')
  })

  it('maps the plus-bullet enum variant like the dash (W24-R4)', () => {
    const w = (state: string): string => SUPPLIER_STATE_WORDS[state] ?? state
    expect(sanitizeBizText('+ qualified - restricted')).toBe(`+ ${w('qualified')} - ${w('restricted')}`)
    expect(sanitizeBizText('+ frozen\n+ potential')).toBe(`+ ${w('frozen')}\n+ ${w('potential')}`)
  })

  it('still maps the gated states inside a CJK narrative (W24-R2 no-regression)', () => {
    expect(sanitizeBizText('该供方 potential 已停用')).toBe('该供方 潜在 已停用')
    expect(sanitizeBizText('名单中 preferred 三家优先')).toBe('名单中 优选 三家优先')
  })

  it('keeps the English half of a mixed leaf verbatim at segment granularity (W24-R2)', () => {
    expect(sanitizeBizText('frozen goods 已冻结')).toBe('frozen goods 已冻结')
    expect(sanitizeBizText('rejected items 已退回')).toBe('rejected items 已退回')
  })
})
